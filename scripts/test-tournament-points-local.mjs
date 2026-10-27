import { execFileSync, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

// Run: node --import tsx scripts/test-tournament-points-local.mjs
// Only disposable schema clones in these two local Docker containers are used.
const require = createRequire(import.meta.url)
console.log('Loading the production points engine for local integration tests…')
const { buildPointsReview, applyManualCategoryDecisions } = require('../lib/services/points/services/points-review.engine.ts')
const { getTournamentFormatPreset } = require('../config/tournament-format-presets.ts')
const containers = process.argv.includes('--elite-only') ? ['supabase_db_padel-elite-local'] : ['supabase_db_padel-base-main-test', 'supabase_db_padel-elite-local']
const migration = await readFile(new URL('../supabase/migrations/20261027145242_tournament_points_manual_promotions.sql', import.meta.url), 'utf8')
const fid = name => createHash('md5').update(`points-fixture-${name}`).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
const json = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`

for (const container of containers) {
  const database = `points_test_${randomUUID().replaceAll('-', '')}`
  assert.match(database, /^points_test_[a-f0-9]{32}$/)
  const authenticated = ['bash', '-c', 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec "$@"', '--']
  const docker = (args, input = '') => execFileSync('docker', ['exec', '-i', container, ...authenticated, ...args], { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
  const psql = ['psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1']
  const run = sql => docker(psql, `set statement_timeout='15s'; set client_min_messages=warning; ${sql}`).trim()
  const rpc = sql => run(`set role service_role; ${sql}`)
  const load = label => JSON.parse(rpc(`select public.get_tournament_points_context('${fid(label)}','${fid('owner')}');`))
  const calculation = label => buildPointsReview(load(label))
  const commitSql = (label, input, actor = 'owner') => `select public.commit_tournament_points('${fid(label)}','${fid(actor)}','${input.review.fingerprint}',${json(input)});`
  const commit = (label, input, actor) => JSON.parse(rpc(commitSql(label, input, actor)))
  const fail = (sql, pattern) => {
    try { rpc(sql); assert.fail('Expected SQL rejection') } catch (error) { assert.match(String(error.stderr ?? error.message), pattern) }
  }
  const asyncRun = sql => new Promise(resolve => {
    const child = spawn('docker', ['exec', '-i', container, ...authenticated, ...psql])
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('close', code => resolve({ code, stdout, stderr }))
    child.stdin.end(`set statement_timeout='15s'; set role service_role; ${sql}`)
  })
  let created = false
  try {
    console.log(`${container}: creating disposable schema clone`)
    docker(['createdb', '-U', 'supabase_admin', database]); created = true
    // pg_graphql can dump ACLs for an extension-generated wrapper without its
    // CREATE FUNCTION. GraphQL is unrelated to these tests; omit only those ACLs.
    const schema = docker(['pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-owner', '--no-publications', '--no-subscriptions'])
      .split('\n').filter(line => !/^(GRANT|REVOKE).*ON FUNCTION graphql_public\.graphql\(/.test(line)).join('\n')
    run(schema)
    if (run("select not exists(select 1 from information_schema.columns where table_schema='public' and table_name='tournaments' and column_name='status_sort_value');") === 't') {
      if (run("select to_regclass('public.tenant_tournament_list_settings') is null;") === 't') {
        run(await readFile(new URL('../supabase/migrations/20261014171040_add_tenant_tournament_list_settings.sql', import.meta.url), 'utf8'))
      }
      for (const name of ['20261014225421_prepare_typescript_tournament_sort.sql', '20261014225423_remove_database_tournament_sort_logic.sql']) {
        run(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
      }
    }
    if (run("select to_regclass('public.american_free_brackets') is null;") === 't') {
      // The Elite development clone can lag behind FV. Prepare the existing
      // prerequisites only inside this disposable database, never on remotes.
      for (const name of [
        '20261017213508_americano_libre_phase_one.sql',
        '20261019221832_americano_libre_sports.sql',
        '20261020161721_americano_libre_reset.sql',
        '20261021144215_americano_libre_allow_zone_match_creation.sql',
        '20261021150850_americano_libre_zone_references.sql',
        '20261021160305_americano_libre_edit_byes.sql',
        '20261021163545_americano_libre_process_bye_direct.sql',
        '20261021202643_americano_libre_allow_format_switch_before_bracket.sql',
      ]) run(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
    }
    if (run("select to_regclass('public.tournament_points_settlements') is null;") === 't') run(`begin; ${migration} commit;`)
    run(`insert into auth.users(id,email) values('${fid('owner')}','points-owner@example.invalid'),('${fid('stranger')}','points-stranger@example.invalid');
      insert into public.users(id,email,role) values('${fid('owner')}','points-owner@example.invalid','CLUB'),('${fid('stranger')}','points-stranger@example.invalid','CLUB');
      insert into public.clubes(id,user_id,name) values('${fid('club')}','${fid('owner')}','Points fixture');
      insert into public.categories(name,lower_range,upper_range) values('7ma',600,899),('6ta',900,1199) on conflict(name) do nothing;
      insert into public.players(id,first_name,last_name,score,category_name,is_categorized)
        values ${Array.from({ length: 8 }, (_, i) => `('${fid(`p${i + 1}`)}','Player ${i + 1}','Fixture',890,'7ma',true)`).join(',')};
      insert into public.couples(id,player1_id,player2_id)
        values ${Array.from({ length: 4 }, (_, i) => `('${fid(`c${i + 1}`)}','${fid(`p${i * 2 + 1}`)}','${fid(`p${i * 2 + 2}`)}')`).join(',')};`)
    const fixture = (label, goldSilver = false, status = 'FINISHED_POINTS_PENDING') => {
      const config = getTournamentFormatPreset(goldSilver ? 'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_2' : 'AMERICAN_SINGLE_ZONE_GLOBAL_2')
      if (goldSilver) config.bonuses = { GOLD: { enabled: true, champion: 80, finalist: 20 }, SILVER: { enabled: true, champion: 40, finalist: 5 } }
      run(`insert into public.tournaments(id,club_id,name,type,status,category_name,gender,format_config,es_prueba)
        values('${fid(label)}','${fid('club')}','Points ${label}','AMERICAN','${status}','7ma','MALE',${json(config)},true);
        insert into public.inscriptions(tournament_id,couple_id,is_pending)
        values ${Array.from({ length: goldSilver ? 4 : 2 }, (_, i) => `('${fid(label)}','${fid(`c${i + 1}`)}',false)`).join(',')};
        insert into public.matches(id,tournament_id,type,round,status,couple1_id,couple2_id,winner_id,bracket_key)
        values ${Array.from({ length: goldSilver ? 2 : 1 }, (_, i) => `('${fid(`${label}-m${i + 1}`)}','${fid(label)}','ELIMINATION','FINAL','FINISHED','${fid(`c${i * 2 + 1}`)}','${fid(`c${i * 2 + 2}`)}','${fid(`c${i * 2 + 1}`)}','${goldSilver ? ['GOLD', 'SILVER'][i] : 'MAIN'}')`).join(',')};`)
    }
    assert.equal(run("select has_function_privilege('anon','public.commit_tournament_points(uuid,uuid,text,jsonb)','execute') or has_function_privilege('authenticated','public.commit_tournament_points(uuid,uuid,text,jsonb)','execute');"), 'f')
    assert.equal(run("select has_table_privilege('authenticated','public.tournament_points_settlements','insert');"), 'f')
    fixture('main')
    const input = calculation('main')
    assert.equal(input.review.scoreBasis, 'CURRENT')
    assert.equal(run(`select count(*) from public.ranking_snapshots where tournament_id='${fid('main')}';`), '0')
    fail(commitSql('main', input, 'stranger'), /Sin permisos/)
    const selected = applyManualCategoryDecisions(input, [{ playerId: fid('p1'), newCategory: '6ta' }])
    const applied = commit('main', selected)
    assert.equal(applied.review.state, 'APPLIED')
    assert.equal(applied.review.playerScores.find(p => p.playerId === fid('p1')).pointsAfter, 932)
    assert.equal(run(`select category_name from public.players where id='${fid('p2')}';`), '7ma')
    assert.equal(run(`select category_name from public.players where id='${fid('p1')}';`), '6ta')
    assert.equal(run(`select count(*) from public.player_recategorizations where tournament_id='${fid('main')}';`), '1')
    assert.equal(commit('main', selected).alreadyApplied, true)
    assert.equal(run(`select score from public.players where id='${fid('p1')}';`), '932')
    run(`update public.players set score=5000 where id='${fid('p1')}';`)
    assert.equal(calculation('main').review.playerScores.find(p => p.playerId === fid('p1')).pointsAfter, 932)
    console.log(`${container}: preview read-only, manual category, stored summary, idempotency and permissions passed`)

    run('update public.players set score=890,category_name=\'7ma\';')
    fixture('cups', true)
    const cups = calculation('cups')
    assert.equal(cups.review.playerScores.find(p => p.playerId === fid('p5')).bonus, 40)
    assert.equal(cups.review.playerScores.find(p => p.playerId === fid('p7')).bonus, 5)
    assert.equal(commit('cups', cups).review.playerScores.length, 8)

    for (const kind of ['score', 'category', 'bonus', 'result', 'membership']) {
      const label = `stale-${kind}`; fixture(label)
      const stale = calculation(label)
      const mutate = {
        score: `update public.players set score=score+1 where id='${fid('p1')}';`,
        category: `update public.players set category_name='6ta' where id='${fid('p1')}';`,
        bonus: `update public.tournaments set format_config=format_config||'{"bonuses":{"MAIN":{"enabled":true,"champion":99,"finalist":10}}}'::jsonb where id='${fid(label)}';`,
        result: `update public.matches set result_couple1='7' where tournament_id='${fid(label)}';`,
        membership: `update public.couples set player1_id='${fid('p5')}' where id='${fid('c1')}';`,
      }[kind]
      run(mutate)
      fail(commitSql(label, stale), /datos cambiaron/)
      assert.equal(run(`select count(*) from public.player_tournament_history where tournament_id='${fid(label)}';`), '0')
      if (kind === 'membership') run(`update public.couples set player1_id='${fid('p1')}' where id='${fid('c1')}';`)
    }
    fixture('rollback')
    const rollbackInput = applyManualCategoryDecisions(calculation('rollback'), [{ playerId: fid('p2'), newCategory: '6ta' }])
    const before = run(`select jsonb_agg(jsonb_build_object('id',id,'score',score,'category',category_name) order by id) from public.players;`)
    run(`create function public.points_test_fail() returns trigger language plpgsql as $$begin raise exception 'fixture audit failure'; end$$;
      create trigger points_test_fail before insert on public.match_points_couples for each row execute function public.points_test_fail();`)
    fail(commitSql('rollback', rollbackInput), /fixture audit failure/)
    assert.equal(run(`select jsonb_agg(jsonb_build_object('id',id,'score',score,'category',category_name) order by id) from public.players;`), before)
    for (const table of ['player_tournament_history', 'player_recategorizations', 'tournament_points_settlements']) assert.equal(run(`select count(*) from public.${table} where tournament_id='${fid('rollback')}';`), '0')
    run('drop trigger points_test_fail on public.match_points_couples; drop function public.points_test_fail();')
    console.log(`${container}: both cups, stale score/category/bonus/result/composition, and full rollback passed`)

    fixture('race')
    const race = calculation('race')
    const results = await Promise.all([asyncRun(commitSql('race', race)), asyncRun(commitSql('race', race))])
    assert.ok(results.every(result => result.code === 0), JSON.stringify(results))
    assert.equal(results.filter(result => JSON.parse(result.stdout.trim()).alreadyApplied).length, 1)
    assert.equal(run(`select count(*) from public.player_tournament_history where tournament_id='${fid('race')}';`), '4')

    fixture('shared-a'); fixture('shared-b')
    const sharedA = calculation('shared-a'), sharedB = calculation('shared-b')
    const sharedResults = await Promise.all([asyncRun(commitSql('shared-a', sharedA)), asyncRun(commitSql('shared-b', sharedB))])
    assert.equal(sharedResults.filter(result => result.code === 0).length, 1, JSON.stringify(sharedResults))
    assert.match(sharedResults.find(result => result.code !== 0).stderr, /datos cambiaron/)
    console.log(`${container}: duplicate concurrent confirmation and overlapping tournaments passed`)

    fixture('manual')
    const player = load('manual').context.players.find(p => p.id === fid('p1'))
    const changes = [{ playerId: player.id, newCategory: player.category_name === '6ta' ? '7ma' : '6ta', expectedScore: player.score, expectedCategory: player.category_name }]
    const changed = JSON.parse(rpc(`select public.recategorize_tournament_players('${fid('manual')}','${fid('owner')}',${json(changes)});`))
    assert.equal(changed.updateDetails[0].oldScore, changed.updateDetails[0].newScore)
    fail(`select public.recategorize_tournament_players('${fid('manual')}','${fid('owner')}',${json([{ ...changes[0], playerId: fid('p5') }])});`, /Jugador ajeno/)
    fail(`select public.recategorize_tournament_players('${fid('manual')}','${fid('owner')}',${json(changes)});`, /ficha cambió/)

    fixture('start', false, 'NOT_STARTED')
    run(`update public.tournaments set status='ZONE_PHASE' where id='${fid('start')}';`)
    assert.equal(run(`select count(*) from public.ranking_snapshots where tournament_id='${fid('start')}';`), '4')
    console.log(`${container}: manual changes preserve score, foreign/stale decisions rejected, actual start snapshots passed`)
  } finally {
    if (created) docker(['dropdb', '-U', 'supabase_admin', '--force', database])
  }
}
