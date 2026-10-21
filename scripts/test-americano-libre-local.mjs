import { execFileSync, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

// Fixed local Docker container; never takes a remote URL or credentials.
const container = 'supabase_db_padel-base-main-test'
const database = `americano_libre_test_${randomUUID().replaceAll('-', '')}`
assert.match(database, /^americano_libre_test_[a-f0-9]{32}$/)
const exec = (args, input = '', onOutput) => new Promise((resolve) => {
  const child = spawn('docker', ['exec', '-i', container, 'bash', '-o', 'pipefail', '-c', args])
  let stdout = '', stderr = ''
  child.stdout.on('data', (data) => { stdout += data; onOutput?.(stdout) })
  child.stderr.on('data', (data) => { stderr += data })
  child.on('error', (error) => resolve({ code: 1, stdout, stderr: error.message }))
  child.on('close', (code) => resolve({ code, stdout, stderr }))
  child.stdin.end(input)
})
const run = (sql, onOutput) => exec(
  `export PGPASSWORD="$POSTGRES_PASSWORD"; psql -X -qAt -U supabase_admin -d ${database} -v ON_ERROR_STOP=1`,
  `set statement_timeout='12s'; set client_min_messages=warning; ${sql}`, onOutput,
)
const good = (result) => assert.equal(result.code, 0, result.stderr)
const hold = (sql) => {
  let signal
  const ready = new Promise((resolve) => { signal = resolve })
  const result = run(`begin; set local role service_role; ${sql} select 'LOCK_HELD'; select pg_sleep(0.4); commit;`,
    (output) => { if (output.includes('LOCK_HELD')) signal() })
  result.then(() => signal())
  return { ready, result }
}

let created = false
try {
  good(await exec(`export PGPASSWORD="$POSTGRES_PASSWORD"; createdb -U supabase_admin ${database}`))
  created = true
  good(await exec(`export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -U supabase_admin -d postgres --schema-only --no-owner --no-publications --no-subscriptions | psql -X -q -U supabase_admin -d ${database} -v ON_ERROR_STOP=1`))
  const migration = await readFile(new URL('../supabase/migrations/20261017213508_americano_libre_phase_one.sql', import.meta.url), 'utf8')
  const existingFree = await run("select to_regclass('public.american_free_brackets') is not null;")
  good(existingFree)
  if (existingFree.stdout.trim() !== 't') good(await run(`begin; ${migration} commit;`))
  const tests = await readFile(new URL('../supabase/tests/americano_libre_phase_one.test.sql', import.meta.url), 'utf8')
  const tap = await run(tests)
  good(tap)
  assert.doesNotMatch(tap.stdout, /(?:^|\n)not ok\b/, tap.stdout)
  console.log(`pgTAP: ${tap.stdout.match(/(?:^|\n)1\.\.(\d+)/)?.[1]} assertions passed`)

  // Persist the same fixtures in this disposable DB for independent sessions.
  const prelude = tests.split('\nselect ok(not has_function_privilege')[0]
    .replace('select no_plan();', '').replaceAll('pg_temp.', 'american_free_test.')
    .replace('begin;', 'begin; create schema american_free_test; grant usage on schema american_free_test to service_role;')
  good(await run(`${prelude} commit;`))
  // Use the production TypeScript generator, not the SQL phase-one helper.
  const structures = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '-e',
    "const {buildFreeBracket}=require('./lib/services/americano-libre-generator.ts'); console.log(JSON.stringify([16,20,24,32,20,24].map(n=>buildFreeBracket(n))))",
  ], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }))
  good(await run(`insert into public.players(id,first_name,last_name,category_name,score)
    select american_free_test.fid('player'||i),'Player'||i,'Fixture','9na',111 from generate_series(17,50) i;
    insert into public.couples(id,player1_id,player2_id)
    select american_free_test.fid('c'||i),american_free_test.fid('player'||(i*2-1)),american_free_test.fid('player'||(i*2)) from generate_series(9,24) i;`))
  for (const structure of structures.slice(0, 4)) {
    const n = structure.requestedCount
    const key = `phase2-${n}`
    const tid = `american_free_test.fid('${key}')`
    good(await run(`insert into public.tournaments(id,club_id,name,type,status,category_name,gender,format_config)
      values(${tid},american_free_test.fid('club'),'Phase two ${n}','AMERICAN','ZONE_PHASE','9na','MALE',
      '{"version":2,"presetId":"AMERICAN_MULTI_ZONE_FREE"}');
      insert into public.zones(id,tournament_id,name) values(american_free_test.fid('${key}-zone'),${tid},'Zona incompleta');
      insert into public.inscriptions(tournament_id,couple_id,is_pending)
        select ${tid},american_free_test.fid('c'||i),false from generate_series(1,24) i;
      insert into public.inscriptions(tournament_id,player_id,is_pending)
        values(${tid},american_free_test.fid('player49'),false);`))
    const create = `select public.create_american_free_bracket(${tid},american_free_test.fid('owner'),${n},
      '${JSON.stringify(structure.matches)}'::jsonb,'${JSON.stringify(structure.hierarchy)}'::jsonb);`
    const createdBracket = await run(`set role service_role; ${create}`)
    good(createdBracket)
    const snapshot = JSON.parse(createdBracket.stdout.trim())
    assert.equal(snapshot.requested_count, n)
    assert.equal(snapshot.effective_capacity, n)
    assert.equal(snapshot.assigned_count, 0)
    assert.equal(snapshot.base_size, n === 16 ? 16 : 32)
    assert.equal(snapshot.matches.length, snapshot.base_size - 1)
    assert.deepEqual(new Set(snapshot.matches.map(m => m.id)), new Set(structure.matches.map(m => m.id)))
    assert.ok(snapshot.matches.every(m => !m.couple1_id && !m.couple2_id && !m.seed1_id && !m.seed2_id && !m.winner_id && !m.bye_processed && m.status === 'WAITING_OPONENT'))
    assert.equal(snapshot.matches.flatMap(m => [m.slot1_origin, m.slot2_origin]).filter(o => o === 'ENTRY').length, n)
    const firstRound = structure.matches[0].round
    const first = snapshot.matches.filter(m => m.round === firstRound)
    assert.equal(first.filter(m => m.slot1_origin === 'ENTRY' && m.slot2_origin === 'ENTRY').length, n - snapshot.base_size / 2)
    assert.equal(first.filter(m => m.slot1_origin === 'BYE' || m.slot2_origin === 'BYE').length, snapshot.base_size - n)
    // A fresh session sees precisely the committed snapshot. Adding another
    // inscription and updating zone reference results must not rebuild it.
    good(await run(`insert into public.couples(id,player1_id,player2_id) values(american_free_test.fid('${key}-new'),american_free_test.fid('player49'),american_free_test.fid('player50'));
      insert into public.inscriptions(tournament_id,couple_id,is_pending) values(${tid},american_free_test.fid('${key}-new'),false);
      insert into public.zone_positions(tournament_id,zone_id,couple_id,position) values(${tid},american_free_test.fid('${key}-zone'),american_free_test.fid('c1'),1);
      update public.zone_positions set wins=1,games_for=6,games_against=2,games_difference=4,is_definitive=true where tournament_id=${tid};`))
    const reloaded = await run(`select american_free_private.snapshot(${tid});`)
    good(reloaded)
    assert.deepEqual(JSON.parse(reloaded.stdout.trim()), snapshot)
    assert.equal((await run(`select status::text from public.tournaments where id=${tid};`)).stdout.trim(), 'BRACKET_PHASE')
    console.log(`Phase 2: ${n} entries, base ${snapshot.base_size}, empty zones, 24 couples + lone player; snapshot survives new registration/reload`)
  }
  const raceId = "american_free_test.fid('phase2-race')"
  good(await run(`insert into public.tournaments(id,club_id,name,type,status,category_name,gender,format_config)
    values(${raceId},american_free_test.fid('club'),'Phase two concurrent','AMERICAN','ZONE_PHASE','9na','MALE',
    '{"version":2,"presetId":"AMERICAN_MULTI_ZONE_FREE"}');
    insert into public.zones(id,tournament_id,name) values(american_free_test.fid('phase2-race-zone'),${raceId},'Zona incompleta');`))
  const raceCreate = (structure) => `select public.create_american_free_bracket(${raceId},american_free_test.fid('owner'),${structure.requestedCount},
    '${JSON.stringify(structure.matches)}'::jsonb,'${JSON.stringify(structure.hierarchy)}'::jsonb);`
  const malformed = await run(`begin; set local role service_role;
    select public.create_american_free_bracket(${raceId},american_free_test.fid('owner'),20,
    '${JSON.stringify(structures[4].matches)}'::jsonb,'[]'::jsonb); commit;`)
  assert.notEqual(malformed.code, 0)
  assert.match(malformed.stderr, /Estructura de llave incompleta/)
  assert.equal((await run(`select count(*) from public.matches where tournament_id=${raceId};`)).stdout.trim(), '0')
  assert.equal((await run(`select count(*) from public.american_free_brackets where tournament_id=${raceId};`)).stdout.trim(), '0')
  assert.equal((await run(`select status::text from public.tournaments where id=${raceId};`)).stdout.trim(), 'ZONE_PHASE')
  console.log('Phase 2 rollback: malformed production payload leaves no matches/state or phase transition')
  const productionRace = hold(raceCreate(structures[4]))
  await productionRace.ready
  const productionDuplicate = run(`begin; set local role service_role; ${raceCreate(structures[5])} commit;`)
  good(await productionRace.result)
  const productionLoser = await productionDuplicate
  assert.notEqual(productionLoser.code, 0)
  assert.match(productionLoser.stderr, /La generación requiere fase de zonas/)
  const raceSnapshot = await run(`select american_free_private.snapshot(${raceId});`)
  good(raceSnapshot)
  assert.equal(JSON.parse(raceSnapshot.stdout.trim()).requested_count, 20)
  assert.equal(JSON.parse(raceSnapshot.stdout.trim()).matches.length, 31)
  console.log('Phase 2 concurrency: production generators 20 vs 24 commit only the original 20-entry tree')
  const gen = "select american_free_test.gen('race',8,8);"
  const generating = hold(gen)
  await generating.ready
  const duplicate = run(`begin; set local role service_role; ${gen} commit;`)
  good(await generating.result)
  const secondGeneration = await duplicate
  assert.notEqual(secondGeneration.code, 0)
  assert.match(secondGeneration.stderr, /La generación requiere fase de zonas/)
  assert.equal((await run("select count(*) from public.matches where tournament_id=american_free_test.fid('race');")).stdout.trim(), '7')
  console.log('Concurrency: two generators commit exactly one complete bracket')

  const save = (couple, match) => `select american_free_test.save('race',0,american_free_test.put(american_free_test.layout('race'),american_free_test.mid('race',4,${match}),1,american_free_test.fid('${couple}')));`
  const first = hold(save('c1', 1))
  await first.ready
  const stale = run(`begin; set local role service_role; ${save('c2', 2)} commit;`)
  good(await first.result)
  const losingSave = await stale
  assert.notEqual(losingSave.code, 0)
  assert.match(losingSave.stderr, /La llave cambió/)
  assert.equal((await run("select revision||':'||assigned_count from public.american_free_brackets where tournament_id=american_free_test.fid('race');")).stdout.trim(), '1:1')
  console.log('Concurrency: stale save leaves revision, participants and seeds intact')

  const removal = hold("delete from public.zone_positions where zone_id=american_free_test.fid('race-zone') and couple_id=american_free_test.fid('c2');")
  await removal.ready
  const assigning = run(`begin; set local role service_role; ${save('c2', 2).replace("'race',0,", "'race',1,")} commit;`)
  good(await removal.result)
  const noLongerEligible = await assigning
  assert.notEqual(noLongerEligible.code, 0)
  assert.match(noLongerEligible.stderr, /Participante, seed u origen no habilitado/)
  console.log('Concurrency: zone removal is revalidated inside the save transaction')

  const editing = hold(save('c3', 3).replace("'race',0,", "'race',1,"))
  await editing.ready
  const legacyResult = run("begin; set local role service_role; update public.matches set status='FINISHED',winner_id=american_free_test.fid('c1') where id=american_free_test.mid('race',4,1); commit;")
  good(await editing.result)
  const refusedResult = await legacyResult
  assert.notEqual(refusedResult.code, 0)
  assert.match(refusedResult.stderr, /Americano libre requiere persistencia transaccional/)
  assert.equal((await run("select count(*) from public.matches where tournament_id=american_free_test.fid('race') and status='FINISHED';")).stdout.trim(), '0')
  console.log('Concurrency: legacy result writer cannot leave a partial result during editing')
  // Phase three exercises the browser's actual draft engine and full-layout
  // persistence against the same disposable schema, without legacy writers.
  const editorTournament = "american_free_test.fid('phase2-32')"
  good(await run(`insert into public.zone_positions(tournament_id,zone_id,couple_id,position)
    select ${editorTournament},american_free_test.fid('phase2-32-zone'),american_free_test.fid('c'||i),i from generate_series(2,3) i;`))
  const loadEditorSnapshot = async () => {
    const result = await run(`select american_free_private.snapshot(${editorTournament});`)
    good(result)
    return JSON.parse(result.stdout.trim())
  }
  const ids = await run("select json_build_array(american_free_test.fid('phase2-32-zone'),american_free_test.fid('c1'),american_free_test.fid('c2'),american_free_test.fid('c3'));")
  good(ids)
  const [zoneId, ...coupleIds] = JSON.parse(ids.stdout.trim())
  const editor = { guards: {}, couples: coupleIds.map((coupleId, index) => ({ zoneId, zoneName: 'Zona A', coupleId, name: `Pareja ${index+1}`, position: index+1, wins: 0, losses: 0, gamesDifference: 0, eligible: true })) }
  const draftStep = (baseline, current, operation) => JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '-e',
    "const {moveFreeEntry,removeFreeEntry,freeLayout}=require('./lib/services/americano-libre-editor.ts');const x=JSON.parse(require('node:fs').readFileSync(0,'utf8'));const draft=x.operation.remove?removeFreeEntry(x.baseline,x.current,x.editor,x.operation.source):moveFreeEntry(x.baseline,x.current,x.editor,x.operation.source,x.operation.target);process.stdout.write(JSON.stringify({draft,layout:freeLayout(draft)}));",
  ], { cwd: new URL('..', import.meta.url), input: JSON.stringify({ baseline, current, editor, operation }), encoding: 'utf8' }))
  const at = (snapshot, round, order, slot=1) => ({ matchId: snapshot.matches.find(m => m.round===round && m.order_in_round===order).id, slot })
  const fromZone = (index) => ({ kind: 'ZONE', zoneId, coupleId: coupleIds[index] })
  const fromSlot = (slot) => ({ kind: 'SLOT', ...slot })
  const saveDraft = async (baseline, layout) => {
    const result = await run(`set role service_role; select public.save_american_free_bracket(${editorTournament},american_free_test.fid('owner'),${baseline.revision},'${JSON.stringify(layout)}'::jsonb);`)
    good(result)
    return JSON.parse(result.stdout.trim())
  }
  let baseline = await loadEditorSnapshot()
  const original = structuredClone(baseline)
  const entry = at(baseline,'16VOS',1), rival = at(baseline,'16VOS',3), quarter = at(baseline,'4TOS',1)
  let edit = draftStep(baseline,baseline,{ source: fromZone(0), target: entry })
  edit = draftStep(baseline,edit.draft,{ source: fromZone(1), target: rival })
  edit = draftStep(baseline,edit.draft,{ source: fromSlot(entry), target: quarter })
  assert.equal(edit.draft.effective_capacity,29)
  // Preparing and cancelling a draft causes no RPC or writes.
  assert.deepEqual(await loadEditorSnapshot(),baseline)
  baseline = await saveDraft(baseline,edit.layout)
  assert.equal(baseline.effective_capacity,29)
  assert.equal(baseline.assigned_count,2)
  assert.equal(baseline.revision,1)
  const chosen = at(baseline,'8VOS',1,2)
  edit = draftStep(baseline,baseline,{ source: fromSlot(quarter), target: chosen })
  baseline = await saveDraft(baseline,edit.layout)
  assert.equal(baseline.effective_capacity,31)
  assert.equal(baseline.matches.find(m=>m.id===chosen.matchId).couple2_id,coupleIds[0])
  edit = draftStep(baseline,baseline,{ remove: true, source: chosen })
  baseline = await saveDraft(baseline,edit.layout)
  assert.equal(baseline.effective_capacity,32)
  const other = at(baseline,'16VOS',4)
  edit = draftStep(baseline,baseline,{ source: fromZone(2), target: other })
  edit = draftStep(baseline,edit.draft,{ source: fromSlot(rival), target: other })
  baseline = await saveDraft(baseline,edit.layout)
  assert.equal(baseline.matches.find(m=>m.id===rival.matchId).couple1_id,coupleIds[2])
  assert.deepEqual(baseline.hierarchy,original.hierarchy)
  assert.deepEqual(baseline.original_slots,original.original_slots)
  assert.deepEqual(new Set(baseline.matches.map(m=>m.id)),new Set(original.matches.map(m=>m.id)))
  assert.ok(baseline.matches.every(m=>!m.winner_id&&!m.bye_processed))
  assert.deepEqual(await loadEditorSnapshot(),baseline)
  const seedCount = await run(`select count(*) from public.tournament_couple_seeds where tournament_id=${editorTournament};`)
  good(seedCount)
  const invalidLayout = structuredClone(edit.layout)
  invalidLayout.find(m=>m.id===entry.matchId).couple1_id = (await run("select american_free_test.fid('c4');")).stdout.trim()
  const rejectedBatch = await run(`set role service_role; select public.save_american_free_bracket(${editorTournament},american_free_test.fid('owner'),${baseline.revision},'${JSON.stringify(invalidLayout)}'::jsonb);`)
  assert.notEqual(rejectedBatch.code,0)
  assert.match(rejectedBatch.stderr,/Participante, seed u origen no habilitado/)
  assert.deepEqual(await loadEditorSnapshot(),baseline)
  assert.equal((await run(`select count(*) from public.tournament_couple_seeds where tournament_id=${editorTournament};`)).stdout.trim(),seedCount.stdout.trim())
  console.log('Phase 3: real draft assignments, direct entry 29, chosen retreat 31, remove 32, swap, cancel, reload and atomic rejection passed')
  const sportsMigration = await readFile(new URL('../supabase/migrations/20261019221832_americano_libre_sports.sql', import.meta.url), 'utf8')
  const existingSports = await run("select to_regprocedure('public.mutate_american_free_sports(uuid,uuid,bigint,jsonb,jsonb)') is not null;")
  good(existingSports)
  if (existingSports.stdout.trim() !== 't') good(await run(`begin; ${sportsMigration} commit;`))
  const sportsTests = await readFile(new URL('../supabase/tests/americano_libre_sports.test.sql', import.meta.url), 'utf8')
  const sportsTap = await run(sportsTests)
  good(sportsTap)
  assert.doesNotMatch(sportsTap.stdout, /(?:^|\n)not ok\b/, sportsTap.stdout)
  console.log(`Phase 4 pgTAP: ${sportsTap.stdout.match(/(?:^|\n)1\.\.(\d+)/)?.[1]} assertions passed`)
  // Independent connections, real locks: every winner commits one revision;
  // every stale competitor is rejected before it can write anything.
  const sportsPrelude = sportsTests.split('\nselect ok(not has_function_privilege')[0].replace('select no_plan();', '')
  good(await run(`${sportsPrelude} commit;`))
  const existingDirectBye = await run("select to_regprocedure('public.process_american_free_bye(uuid,uuid,bigint,uuid)') is not null;")
  good(existingDirectBye)
  if (existingDirectBye.stdout.trim() !== 't') {
    const editableByes = await readFile(new URL('../supabase/migrations/20261021160305_americano_libre_edit_byes.sql', import.meta.url), 'utf8')
    const directByeMigration = await readFile(new URL('../supabase/migrations/20261021163545_americano_libre_process_bye_direct.sql', import.meta.url), 'utf8')
    good(await run(`begin; ${editableByes} ${directByeMigration} commit;`))
  }
  const directByeTests = await readFile(new URL('../supabase/tests/americano_libre_direct_bye.test.sql', import.meta.url), 'utf8')
  const directByeTap = await run(directByeTests)
  good(directByeTap)
  assert.doesNotMatch(directByeTap.stdout, /(?:^|\n)not ok\b/, directByeTap.stdout)
  console.log(`Direct BYE pgTAP: ${directByeTap.stdout.match(/(?:^|\n)1\.\.(\d+)/)?.[1]} assertions passed`)
  const tid = (key) => `american_free_test.fid('${key}')`
  const mid = (key, round, order) => `american_free_test.mid('${key}',${round},${order})`
  const sport = (key, revision, kind, round, order, a = null, b = null) => `select public.mutate_american_free_sports(${tid(key)},${tid('owner')},${revision},
    jsonb_build_array(jsonb_build_object('kind','${kind}','matchId',${mid(key,round,order)},'score1',${a},'score2',${b})));`
  const layoutSave = (key, revision) => `select american_free_test.save('${key}',${revision},american_free_test.layout('${key}'));`
  const race = async (winnerSql, loserSql) => {
    const winner = hold(winnerSql)
    await winner.ready
    const loser = run(`begin; set local role service_role; ${loserSql} commit;`)
    good(await winner.result)
    const rejected = await loser
    assert.notEqual(rejected.code, 0)
    assert.match(rejected.stderr, /La llave cambió/)
  }
  await race(sport('sports-four',1,'RESULT',5,1,6,2),layoutSave('sports-four',1))
  await race(layoutSave('sports-four',2),sport('sports-four',2,'RESULT',5,2,6,2))
  await race(sport('sports-four',3,'RESULT',5,2,6,2),sport('sports-four',3,'RESULT',5,1,2,6))
  await race(sport('sports-bye',1,'PROCESS_BYE',5,1),layoutSave('sports-bye',1))
  await race(sport('sports-bye',2,'UNDO_BYE',5,1),sport('sports-bye',2,'RESULT',5,2,6,2))
  console.log('Phase 4 concurrency: result/editor in both orders, result/result, BYE/editor and undo/result reject stale competitor atomically')
  for (const table of ['inscriptions', 'zone_positions']) {
    const holder = hold(`select 1 from public.${table} where tournament_id=${tid('sports-four')} order by id limit 1 for update;`)
    await holder.ready
    const busy = await run(`begin; set local role service_role; ${sport('sports-four',4,'RESULT',5,1,6,1)} commit;`)
    assert.notEqual(busy.code, 0)
    assert.match(busy.stderr, /La pertenencia o inscripción está cambiando/)
    good(await holder.result)
    assert.equal((await run(`select revision from public.american_free_brackets where tournament_id=${tid('sports-four')};`)).stdout.trim(), '4')
  }
  console.log('Phase 4 lock ordering: busy inscription/membership rows reject with reload conflict instead of waiting in a deadlock cycle')
  const resetMigration = await readFile(new URL('../supabase/migrations/20261020161721_americano_libre_reset.sql', import.meta.url), 'utf8')
  const existingReset = await run("select to_regprocedure('public.reset_american_free_tournament(uuid,uuid,text,bigint)') is not null;")
  good(existingReset)
  if (existingReset.stdout.trim() !== 't') good(await run(`begin; ${resetMigration} commit;`))
  const resetTests = await readFile(new URL('../supabase/tests/americano_libre_reset.test.sql', import.meta.url), 'utf8')
  const resetTap = await run(resetTests)
  good(resetTap)
  assert.doesNotMatch(resetTap.stdout, /(?:^|\n)not ok\b/, resetTap.stdout)
  console.log(`Reset pgTAP: ${resetTap.stdout.match(/(?:^|\n)1\.\.(\d+)/)?.[1]} assertions passed`)
  // Keep the exact same reset and editor on separate connections.
  await race(layoutSave('sports-direct',0), `select public.reset_american_free_tournament(${tid('sports-direct')},${tid('owner')},'ZONE_PHASE',0);`)
  await race(`select public.reset_american_free_tournament(${tid('sports-direct')},${tid('owner')},'ZONE_PHASE',1);`, layoutSave('sports-direct',1))
  console.log('Reset concurrency: editor/reset in both orders leaves exactly one committed phase and rejects the stale competitor')


} finally {
  if (created) good(await exec(`export PGPASSWORD="$POSTGRES_PASSWORD"; dropdb -U supabase_admin ${database}`))
}
