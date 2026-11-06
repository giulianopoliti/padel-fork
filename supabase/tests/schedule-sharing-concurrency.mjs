// Dedicated LOCAL schema clone only. No remote URLs, credentials or real-user data.
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import assert from 'node:assert/strict'

const database = process.argv[2]
if (!/^schedule_sharing_qa_[a-z0-9_]+$/.test(database ?? '')) throw new Error('Pass an isolated schedule_sharing_qa_* database name.')
const args = ['exec', '-i', 'supabase_db_padel-base-main-test', 'sh', '-c',
  'env PGPASSWORD="$POSTGRES_PASSWORD" psql -X -w -qAt -U supabase_admin -d "$1" -v ON_ERROR_STOP=1', 'sh', database]
const literal = value => `'${String(value).replaceAll("'", "''")}'`
const run = sql => {
  const result = spawnSync('docker', args, { input: sql, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}
const asActor = (actor, sql) => `begin; set local role authenticated; set local "request.jwt.claim.sub"=${literal(actor)}; ${sql}; commit;`
const concurrent = (actor, sql) => new Promise((resolve, reject) => {
  const child = spawn('docker', args)
  let stderr = '', stdout = ''
  child.on('error', reject)
  child.stderr.on('data', chunk => { stderr += chunk })
  child.stdout.on('data', chunk => { stdout += chunk })
  child.on('close', code => resolve({ code, stderr, stdout: stdout.trim() }))
  child.stdin.end(`set lock_timeout='10s'; set statement_timeout='20s'; ${asActor(actor, `${sql}; select pg_sleep(0.3)`)}`)
})
const actor = randomUUID()
const tournamentIds = []
const payload = ids => ({
  operation_key: randomUUID(), source_fecha_id: null,
  metadata: { name: 'LOCAL schedule QA', description: null, start_date: '2099-11-06', end_date: '2099-11-12' },
  slots: [{ key: 'morning', date: '2099-11-06', start_time: '08:00', end_time: '15:00', max_matches: 4 }],
  destinations: ids.map(tournament_id => ({ tournament_id, fecha: { kind: 'create' }, round_type: 'ZONE', bracket_key: 'MAIN',
    estimated_match_duration_minutes: 90, max_matches_per_couple: null, court_choice: 'preserve' })),
})
const review = p => JSON.parse(run(asActor(actor, `select public.preview_schedule_batch(${literal(JSON.stringify(p))}::jsonb)`)))
const commit = (p, revision) => `select public.commit_schedule_batch(${literal(JSON.stringify(p))}::jsonb,${literal(revision)})`
const createTournaments = n => {
  const ids = Array.from({ length: n }, randomUUID)
  tournamentIds.push(...ids)
  run(`insert into public.tournaments(id,name,type,status,club_id) values ${ids.map(id => `(${literal(id)},'LOCAL schedule QA','LONG','NOT_STARTED',null)`).join(',')};`)
  return ids
}
run(`insert into auth.users(id,aud,role) values(${literal(actor)},'authenticated','authenticated');
 insert into public.users(id,role) values(${literal(actor)},'ADMIN');`)
try {
  const ids = createTournaments(2)
  const p = payload(ids), initial = review(p)
  const same = await Promise.all([concurrent(actor, commit(p, initial.revision)), concurrent(actor, commit(p, initial.revision))])
  assert.ok(same.every(result => result.code === 0), JSON.stringify(same))
  const results = same.map(result => JSON.parse(result.stdout.split('\n').find(line => line.startsWith('{'))))
  assert.equal(results[0].group_id, results[1].group_id)
  assert.equal(run(`select count(*) from public.tournament_fechas where tournament_id in (${ids.map(literal).join(',')});`), '2')
  console.log('PASS: simultaneous identical operations return one group and one fecha per tournament.')

  const otherIds = createTournaments(2)
  const first = payload(otherIds), second = payload(otherIds)
  const firstReview = review(first), secondReview = review(second)
  const different = await Promise.all([
    concurrent(actor, commit(first, firstReview.revision)), concurrent(actor, commit(second, secondReview.revision)),
  ])
  assert.equal(different.filter(result => result.code === 0).length, 1, JSON.stringify(different))
  assert.match(different.find(result => result.code !== 0).stderr, /desactualizada/)
  assert.ok(different.every(result => !/deadlock|timeout/i.test(result.stderr)), JSON.stringify(different))
  assert.equal(run(`select count(*) from public.tournament_fechas where tournament_id in (${otherIds.map(literal).join(',')});`), '2')
  console.log('PASS: distinct concurrent saves of the same reviewed state produce one winner and one stale-preview conflict.')

  const volume = payload(createTournaments(30))
  volume.slots = Array.from({ length: 7 }, (_, day) => [
    ['08:00', '11:00'], ['11:00', '14:00'], ['14:00', '17:00'], ['18:00', '21:00'],
  ].map(([start_time, end_time], index) => ({ key: `day-${day}-slot-${index}`, date: `2099-11-${String(day + 6).padStart(2, '0')}`, start_time, end_time, max_matches: 3 }))).flat()
  let start = performance.now()
  const volumeReview = review(volume), previewMs = performance.now() - start
  assert.equal(volumeReview.preview.physical_slots_to_create, 840)
  start = performance.now()
  const saved = JSON.parse(run(asActor(actor, commit(volume, volumeReview.revision))))
  const commitMs = performance.now() - start
  assert.equal(saved.destinations.length, 30)
  assert.equal(run(`select count(*) from public.schedule_share_item_targets x join public.schedule_share_members m on m.id=x.member_id where m.group_id=${literal(saved.group_id)};`), '840')
  assert.equal(run(`select count(*) from public.tournament_time_slots s join public.tournament_fechas f on f.id=s.fecha_id
    join public.schedule_share_members m on m.fecha_id=f.id where m.group_id=${literal(saved.group_id)} and s.slot_type='FREE_DATE';`), '30')
  console.log(JSON.stringify({ scenario: '30 tournaments × 7 days × 4 slots', physical_slots: 840,
    preview_ms: Math.round(previewMs), commit_ms: Math.round(commitMs), includes_docker_and_connection_overhead: true }))
} finally {
  // Delete only IDs generated by this run, in the isolated database enforced above.
  run(`begin;
    delete from public.schedule_share_groups where created_by=${literal(actor)};
    delete from public.tournaments where id in (${tournamentIds.map(literal).join(',') || 'null'});
    delete from public.users where id=${literal(actor)};
    delete from auth.users where id=${literal(actor)};
    commit;`)
}
