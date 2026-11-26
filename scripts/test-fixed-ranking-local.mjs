import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { buildLocalRankingOwnershipSql, isLocalDockerEndpoint } from './repair-local-ranking-ownership.mjs'

// Run with node --import tsx scripts/test-fixed-ranking-local.mjs.
// Add --fv to test only the FV container.
// Only disposable databases in the named local containers are touched.
const args = process.argv.slice(2)
if (args.some(arg => arg !== '--fv')) throw new Error('Only --fv is supported; remote destinations are not accepted.')
if (process.env.DOCKER_HOST && !isLocalDockerEndpoint(process.env.DOCKER_HOST)) throw new Error('Docker must use a local socket.')
const contexts = JSON.parse(execFileSync('docker', ['context', 'inspect'], { encoding: 'utf8' }))
if (contexts.length !== 1 || !isLocalDockerEndpoint(contexts[0]?.Endpoints?.docker?.Host)) throw new Error('Docker must use a local socket.')
const require = createRequire(import.meta.url)
const { buildPointsReview } = require('../lib/services/points/services/points-review.engine.ts')
const { getTournamentFormatPreset } = require('../config/tournament-format-presets.ts')
const policies = [
  ['supabase_db_padel-base-main-test', 'FV_LEAGUE', 'LONG', 'LONG_SINGLE_ZONE_BRACKET'],
  ['supabase_db_padel-elite-local', 'ELITE_AMERICAN', 'AMERICAN', 'AMERICAN_SINGLE_ZONE_GLOBAL_2'],
]
const id = label => createHash('md5').update(`fixed-ranking-${label}`).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
const json = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`

for (const [container, policy, type, preset] of policies.filter(([, policy]) => !args.includes('--fv') || policy === 'FV_LEAGUE')) {
  const database = `ranking_test_${randomUUID().replaceAll('-', '')}`
  assert.match(database, /^ranking_test_[a-f0-9]{32}$/)
  const docker = (args, input = '', expectedRejection = false) => execFileSync('docker', ['exec', '-i', container,
    'bash', '-c', 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec "$@"', '--', ...args],
  { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    // Capture deliberate rejections for assertions; keep other diagnostics visible.
    stdio: ['pipe', 'pipe', expectedRejection ? 'pipe' : 'inherit'] })
  const run = (sql, expectedRejection = false) => docker(['psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1'],
    `set statement_timeout='15s'; set client_min_messages=warning; ${sql}`, expectedRejection).trim()
  const rpc = (sql, expectedRejection = false) => run(`set role service_role; ${sql}`, expectedRejection)
  const fail = (sql, pattern) => assert.throws(() => rpc(sql, true), error => pattern.test(String(error.stderr ?? error.message)))
  let created = false
  try {
    docker(['createdb', '-U', 'supabase_admin', database])
    created = true
    const schema = docker(['pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-owner', '--no-publications', '--no-subscriptions'])
      .split('\n').filter(line => !/^(GRANT|REVOKE).*ON FUNCTION graphql_public\.graphql\(/.test(line)).join('\n')
    run(schema)
    assert.equal(run("select to_regprocedure('long_substitution_private.points_context(uuid)') is not null;"), 't', 'Actualizá las migraciones anteriores en el Supabase local.')
    // pg_dump --no-owner restores application objects as supabase_admin.
    // Reproduce the CLI's postgres role instead of masking ownership failures
    // by applying migrations with the local bootstrap superuser.
    run(`grant create on database ${database} to postgres; grant usage, create on schema public to postgres;`)
    run(buildLocalRankingOwnershipSql({ apply: true }))
    for (const [condition, file] of [
      ["to_regclass('public.ranking_settings') is null", '20261117154016_category_ranking_and_league_promotions.sql'],
      ["exists(select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='lower_range')", '20261118021103_remove_category_score_ranges.sql'],
      ["to_regprocedure('public.reopen_tournament_points(uuid,uuid,text)') is null", '20261126124558_reopen_tournament_points.sql'],
    ]) {
      if (run(`select ${condition};`) === 't') {
        run(`begin; set local role postgres; ${await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')} commit;`)
      }
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
    assert.throws(() => run(`select tournament_points_private.activate_ranking('${policy}');`, true), /ya fue reiniciado/)
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
    // Full tournament rollback, including an individually reversed promotion.
    const previewSql = `select public.preview_tournament_reopen('${id('tournament')}','${id('owner')}');`
    const reopenSql = fingerprint => `select public.reopen_tournament_points('${id('tournament')}','${id('owner')}','${fingerprint}');`
    fail(`select public.preview_tournament_reopen('${id('tournament')}','${id('stranger')}');`, /Sin permisos/)
    if (policy === 'FV_LEAGUE') {
      assert.equal(JSON.parse(rpc(previewSql)).canReopen, false, 'Unrelated category changes must block rollback')
      // Restore the deliberate corruption from the earlier individual-reversal
      // test, only in this disposable test database.
      run(`update public.players set category_revision=1 where id='${id('p2')}';`)
    }
    run(`insert into public.tournaments(id,club_id,name,type,status,category_name,gender,es_prueba)
      values('${id('prior')}','${id('club')}','Earlier credit','${type}','FINISHED_POINTS_CALCULATED','8va','MALE',false);
      insert into public.player_tournament_history(player_id,tournament_id,points_before,points_after,points_earned,ranking_category,ranking_category_revision,created_at,es_prueba)
      select '${id('p1')}','${id('prior')}',216,240,24,'8va',0,created_at-interval '1 microsecond',false
        from public.tournament_points_settlements where tournament_id='${id('tournament')}';`)
    const preview = JSON.parse(rpc(previewSql))
    assert.equal(preview.canReopen, true, JSON.stringify(preview.blockers))
    assert.equal(preview.statusAfter, 'BRACKET_PHASE')
    assert.equal(preview.hadPoints, true)
    assert.equal(preview.titlesToRemove, 2)
    assert.equal(run('select count(*) from tournament_reopen_private.receipts;'), '0', 'Preview must not write')
    assert.equal(run(`select status from public.tournaments where id='${id('tournament')}';`), 'FINISHED_POINTS_CALCULATED')
    if (policy === 'FV_LEAGUE') {
      assert.equal(preview.playerChanges.find(p => p.playerId === id('p1')).extraBonusToRemove, 300)
      assert.equal(preview.promotionsToRemove, 2)
    }
    fail(`select public.reopen_tournament_points('${id('tournament')}','${id('stranger')}','${preview.fingerprint}');`, /Sin permisos/)
    run(`update public.players set score=score+1 where id='${id('p3')}';`)
    fail(reopenSql(preview.fingerprint), /cambiaron/)
    assert.equal(run('select count(*) from public.tournament_points_settlements;'), '1')
    run(`update public.players set score=score-1 where id='${id('p3')}';
      insert into public.tournaments(id,club_id,name,type,status,category_name,gender,es_prueba)
      values('${id('later')}','${id('club')}','Later credit','${type}','FINISHED_POINTS_CALCULATED','8va','MALE',false);
      insert into public.player_tournament_history(player_id,tournament_id,points_before,points_after,points_earned)
      values('${id('p3')}','${id('later')}',0,0,0);`)
    const blocked = JSON.parse(rpc(previewSql))
    assert.equal(blocked.canReopen, false)
    assert.ok(blocked.blockers.some(message => /otro torneo/.test(message)))
    fail(reopenSql(blocked.fingerprint), /No se puede reabrir/)
    run(`delete from public.player_tournament_history where tournament_id='${id('later')}';`)

    // An error after player updates must roll back those updates, all ledger
    // deletions and the receipt in the same transaction.
    const balances = run('select jsonb_agg(jsonb_build_array(id,score,category_name,category_revision) order by id) from public.players;')
    run(`create function public.test_reopen_failure() returns trigger language plpgsql as $$ begin raise exception 'test rollback' using errcode='22023'; end $$;
      create trigger test_reopen_failure before delete on public.player_tournament_history for each row execute function public.test_reopen_failure();`)
    fail(reopenSql(JSON.parse(rpc(previewSql)).fingerprint), /test rollback/)
    assert.equal(run('select jsonb_agg(jsonb_build_array(id,score,category_name,category_revision) order by id) from public.players;'), balances)
    assert.equal(run('select count(*) from public.tournament_points_settlements;'), '1')
    assert.equal(run('select count(*) from tournament_reopen_private.receipts;'), '0')
    run('drop trigger test_reopen_failure on public.player_tournament_history; drop function public.test_reopen_failure();')

    const ready = JSON.parse(rpc(previewSql))
    assert.equal(JSON.parse(rpc(reopenSql(ready.fingerprint))).alreadyReopened, false)
    assert.equal(JSON.parse(rpc(reopenSql(ready.fingerprint))).alreadyReopened, true)
    assert.equal(run("select count(*) from public.players where score=240 and category_name='8va' and category_revision=0;"), '4')
    assert.equal(run(`select status from public.tournaments where id='${id('tournament')}';`), 'BRACKET_PHASE')
    assert.equal(run(`select winner_id from public.matches where id='${id('final')}';`), id('c1'), 'Results must survive')
    assert.equal(run(`select points from public.get_ranking_weekly_points(array['${id('p1')}'::uuid],now()-interval '1 day');`), '24', 'Earlier weekly history must become active again')
    assert.equal(run(`select count(*) from public.player_tournament_history where tournament_id='${id('tournament')}';`), '0')
    assert.equal(run(`select count(*) from public.player_tournament_history where tournament_id='${id('prior')}';`), '1')
    for (const table of ['player_recategorizations', 'tournament_points_settlements', 'match_points_couples']) {
      assert.equal(run(`select count(*) from public.${table};`), '0', `${table} must be reversed`)
    }

    // Capture the exact prior date/winner/bonuses on subsequent closures.
    run(`update public.tournaments set end_date='2027-01-05T12:00:00Z',winner_id=null,
      format_config=format_config-'bonuses' where id='${id('tournament')}';
      update public.tournaments set status='FINISHED_POINTS_PENDING',end_date=now(),winner_id='${id('c1')}',
      format_config=format_config||'{"bonuses":{"MAIN":{"enabled":true,"champion":10,"finalist":5}}}'::jsonb where id='${id('tournament')}';`)
    // An old receipt must not undo a NEW closure, even after a delayed retry.
    assert.equal(JSON.parse(rpc(reopenSql(ready.fingerprint))).alreadyReopened, true)
    assert.equal(run(`select status from public.tournaments where id='${id('tournament')}';`), 'FINISHED_POINTS_PENDING')
    const pending = JSON.parse(rpc(previewSql))
    assert.equal(pending.estimatedPreviousState, false)
    assert.equal(pending.hadPoints, false)
    assert.equal(pending.playerChanges.length, 0)
    rpc(reopenSql(pending.fingerprint))
    assert.equal(run(`select winner_id is null and end_date='2027-01-05T12:00:00Z'::timestamptz and not(format_config ? 'bonuses') from public.tournaments where id='${id('tournament')}';`), 't')

    // Reclose and credit again: exactly one history/points entry per participant.
    run(`update public.tournaments set status='FINISHED_POINTS_PENDING',winner_id='${id('c1')}' where id='${id('tournament')}';`)
    const secondSource = JSON.parse(rpc(`select public.get_tournament_points_context_with_lineups('${id('tournament')}','${id('owner')}');`))
    const secondCalculation = buildPointsReview(secondSource)
    rpc(`select public.commit_tournament_points_with_lineups('${id('tournament')}','${id('owner')}','${secondCalculation.review.fingerprint}',${json(secondCalculation)});`)
    assert.equal(run(`select count(*) from public.player_tournament_history where tournament_id='${id('tournament')}';`), '4')
    assert.equal(run('select count(*) from public.match_points_couples;'), '1')
    if (policy === 'ELITE_AMERICAN') {
      run(`insert into public.american_free_brackets(tournament_id,requested_count,base_size,original_slots,effective_capacity)
        values('${id('tournament')}',2,2,'{}'::jsonb,2);`)
      const free = JSON.parse(rpc(previewSql))
      assert.equal(free.canReopen, true, JSON.stringify(free.blockers))
      rpc(reopenSql(free.fingerprint))
      assert.equal(run(`select revision from public.american_free_brackets where tournament_id='${id('tournament')}';`), '1')
      assert.equal(run(`select status from public.tournaments where id='${id('tournament')}';`), 'BRACKET_PHASE')
      assert.equal(run(`select winner_id from public.matches where id='${id('final')}';`), id('c1'))
    }

    // No-bracket closures recover the zone phase. A legacy calculated tournament
    // without a settlement must fail closed instead of subtracting guessed data.
    run(`update public.tournaments set status='ZONE_PHASE',format_config='{"bracketMode":"NONE"}'::jsonb where id='${id('later')}';
      update public.tournaments set status='FINISHED_POINTS_PENDING' where id='${id('later')}';`)
    const zone = JSON.parse(rpc(`select public.preview_tournament_reopen('${id('later')}','${id('owner')}');`))
    assert.equal(zone.statusAfter, 'ZONE_PHASE')
    rpc(`select public.reopen_tournament_points('${id('later')}','${id('owner')}','${zone.fingerprint}');`)
    assert.equal(run(`select status from public.tournaments where id='${id('later')}';`), 'ZONE_PHASE')
    run(`update public.tournaments set status='FINISHED_POINTS_CALCULATED' where id='${id('later')}';`)
    assert.equal(JSON.parse(rpc(`select public.preview_tournament_reopen('${id('later')}','${id('owner')}');`)).canReopen, false)
    for (const role of ['anon', 'authenticated']) {
      assert.equal(run(`select has_function_privilege('${role}','public.reopen_tournament_points(uuid,uuid,text)','execute');`), 'f')
      assert.equal(run(`select has_schema_privilege('${role}','tournament_reopen_private','usage');`), 'f')
    }
    console.log(`${policy}: ranking, promotions, reopening preview, permissions, dependencies, atomic rollback, idempotency, phase recovery and re-credit passed`)
  } finally {
    if (created) docker(['dropdb', '-U', 'supabase_admin', '--force', database])
  }
}
