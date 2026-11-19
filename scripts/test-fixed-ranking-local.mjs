import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

// Run with node --import tsx scripts/test-fixed-ranking-local.mjs.
// Only disposable databases in the named local containers are touched.
const require = createRequire(import.meta.url)
const { buildPointsReview } = require('../lib/services/points/services/points-review.engine.ts')
const { getTournamentFormatPreset } = require('../config/tournament-format-presets.ts')
const policies = [
  ['supabase_db_padel-base-main-test', 'FV_LEAGUE', 'LONG', 'LONG_SINGLE_ZONE_BRACKET'],
  ['supabase_db_padel-elite-local', 'ELITE_AMERICAN', 'AMERICAN', 'AMERICAN_SINGLE_ZONE_GLOBAL_2'],
]
const id = label => createHash('md5').update(`fixed-ranking-${label}`).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
const json = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`

for (const [container, policy, type, preset] of policies) {
  const database = `ranking_test_${randomUUID().replaceAll('-', '')}`
  assert.match(database, /^ranking_test_[a-f0-9]{32}$/)
  const docker = (args, input = '') => execFileSync('docker', ['exec', '-i', container,
    'bash', '-c', 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec "$@"', '--', ...args],
  { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const run = sql => docker(['psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1'],
    `set statement_timeout='15s'; set client_min_messages=warning; ${sql}`).trim()
  const rpc = sql => run(`set role service_role; ${sql}`)
  const fail = (sql, pattern) => assert.throws(() => rpc(sql), error => pattern.test(String(error.stderr ?? error.message)))
  let created = false
  try {
    docker(['createdb', '-U', 'supabase_admin', database])
    created = true
    const schema = docker(['pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-owner', '--no-publications', '--no-subscriptions'])
      .split('\n').filter(line => !/^(GRANT|REVOKE).*ON FUNCTION graphql_public\.graphql\(/.test(line)).join('\n')
    run(schema)
    assert.equal(run("select to_regprocedure('long_substitution_private.points_context(uuid)') is not null;"), 't', 'Actualizá las migraciones anteriores en el Supabase local.')
    for (const [condition, file] of [
      ["to_regclass('public.ranking_settings') is null", '20261117154016_category_ranking_and_league_promotions.sql'],
      ["exists(select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='lower_range')", '20261118021103_remove_category_score_ranges.sql'],
    ]) {
      if (run(`select ${condition};`) === 't') run(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    }
    run(`insert into auth.users(id,email) values('${id('owner')}','ranking-owner@example.invalid'),('${id('stranger')}','ranking-stranger@example.invalid');
      insert into public.users(id,email,role) values('${id('owner')}','ranking-owner@example.invalid','CLUB'),('${id('stranger')}','ranking-stranger@example.invalid','CLUB');
      insert into public.clubes(id,user_id,name) values('${id('club')}','${id('owner')}','Ranking test');
      insert into public.categories(name,level,initial_score) values('8va',8,0),('7ma',7,0) on conflict(name) do update set level=excluded.level;
      insert into public.players(id,first_name,last_name,score,category_name,is_categorized,es_prueba) values
        ${[1,2,3,4].map(n => `('${id(`p${n}`)}','Player ${n}','Ranking',240,'8va',true,false)`).join(',')};
      insert into public.couples(id,player1_id,player2_id) values
        ('${id('c1')}','${id('p1')}','${id('p2')}'),('${id('c2')}','${id('p3')}','${id('p4')}');
      select tournament_points_private.activate_ranking('${policy}');`)
    assert.equal(run('select max(score) from public.players;'), '0')
    assert.equal(run('select count(*) from tournament_points_private.ranking_before_reset;'), '4')
    assert.throws(() => run(`select tournament_points_private.activate_ranking('${policy}');`), /ya fue reiniciado/)
    run(`update public.players set score=240;
      insert into public.tournaments(id,club_id,name,type,status,category_name,gender,format_config,es_prueba)
      values('${id('tournament')}','${id('club')}','Ranking final','${type}','FINISHED_POINTS_PENDING','8va','MALE',${json(getTournamentFormatPreset(preset))},false);
      insert into public.inscriptions(tournament_id,couple_id,is_pending) values
        ('${id('tournament')}','${id('c1')}',false),('${id('tournament')}','${id('c2')}',false);
      insert into public.matches(id,tournament_id,type,round,status,couple1_id,couple2_id,winner_id,bracket_key)
      values('${id('final')}','${id('tournament')}','ELIMINATION','FINAL','FINISHED','${id('c1')}','${id('c2')}','${id('c1')}','MAIN');`)
    const source = JSON.parse(rpc(`select public.get_tournament_points_context_with_lineups('${id('tournament')}','${id('owner')}');`))
    const calculation = buildPointsReview(source)
    const commit = `select public.commit_tournament_points_with_lineups('${id('tournament')}','${id('owner')}','${calculation.review.fingerprint}',${json(calculation)});`
    fail(`select public.commit_tournament_points_with_lineups('${id('tournament')}','${id('stranger')}','${calculation.review.fingerprint}',${json(calculation)});`, /Sin permisos/)
    assert.equal(JSON.parse(rpc(commit)).alreadyApplied, false)
    assert.equal(JSON.parse(rpc(commit)).alreadyApplied, true)
    assert.equal(run(`select count(*) from public.player_tournament_history where ranking_champion;`), '2')
    if (policy === 'FV_LEAGUE') {
      assert.equal(run(`select category_name||':'||score::text from public.players where id='${id('p1')}';`), '7ma:0')
      const promotion = run(`select id from public.player_recategorizations where player_id='${id('p1')}' and ranking_movement='LEAGUE_PROMOTION';`)
      const revert = `select public.revert_league_promotion('${promotion}','${id('owner')}','Corrección deportiva');`
      fail(`select public.revert_league_promotion('${promotion}','${id('stranger')}','Ajeno');`, /Sin permisos/)
      assert.equal(JSON.parse(rpc(revert)).score, 552)
      assert.equal(JSON.parse(rpc(revert)).score, 552)
      assert.equal(run(`select category_name||':'||score::text from public.players where id='${id('p1')}';`), '8va:552')
      assert.equal(run(`select count(*) from public.player_recategorizations where ranking_reverts_id='${promotion}';`), '1')
      const second = run(`select id from public.player_recategorizations where player_id='${id('p2')}' and ranking_movement='LEAGUE_PROMOTION';`)
      run(`update public.players set category_name='8va' where id='${id('p2')}'; update public.players set category_name='7ma' where id='${id('p2')}';`)
      fail(`select public.revert_league_promotion('${second}','${id('owner')}','Posterior');`, /posterior/)
    } else {
      assert.equal(run(`select category_name||':'||score::text from public.players where id='${id('p1')}';`), '8va:396')
      assert.equal(run(`select count(*) from public.player_recategorizations where ranking_movement='LEAGUE_PROMOTION';`), '0')
    }
    assert.equal(run("select has_function_privilege('anon','public.revert_league_promotion(uuid,uuid,text)','execute');"), 'f')
    assert.equal(run("select has_table_privilege('authenticated','public.ranking_settings','update');"), 'f')
    console.log(`${policy}: activation, fixed points, titles, permissions, idempotency and category history passed`)
  } finally {
    if (created) docker(['dropdb', '-U', 'supabase_admin', '--force', database])
  }
}
