import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

// Fixed local Docker target. This runner cannot accept a remote database URL.
const container = 'supabase_db_padel-base-main-test'
const runSql = (sql, onOutput) => new Promise((resolve) => {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'])
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (data) => { stdout += data.toString(); onOutput?.(stdout) })
  child.stderr.on('data', (data) => { stderr += data.toString() })
  child.on('error', (error) => resolve({ code: 1, stdout, stderr: error.message }))
  child.on('close', (code) => resolve({ code, stdout, stderr }))
  child.stdin.end(sql)
})
const expectSuccess = (result) => assert.equal(result.code, 0, result.stderr)
const asUser = (userId, sql) => `set local role authenticated; set local request.jwt.claim.sub = '${userId}'; ${sql}`
const hold = (userId, sql) => {
  let signal
  const ready = new Promise((resolve) => { signal = resolve })
  const result = runSql(`begin; ${asUser(userId, sql)} select 'SOLO_LOCK_HELD'; select pg_sleep(0.5); commit;`, (output) => {
    if (output.includes('SOLO_LOCK_HELD')) signal()
  })
  // A SQL failure must also release the barrier, then fail via expectSuccess.
  result.then(() => signal())
  return { ready, result }
}

const tap = await runSql(await readFile(new URL('../supabase/tests/solo_players_phase_one.test.sql', import.meta.url), 'utf8'))
expectSuccess(tap)
assert.doesNotMatch(tap.stdout, /(?:^|\n)not ok\b/, tap.stdout)
assert.match(tap.stdout, /(?:^|\n)1\.\.[1-9]\d*/, 'pgTAP must finish with an assertion count')
console.log(`pgTAP: ${tap.stdout.match(/(?:^|\n)1\.\.(\d+)/)?.[1]} assertions passed`)

const owner = randomUUID()
const sender = randomUUID()
const tournament = randomUUID()
const club = randomUUID()
const testIds = `'${owner}','${sender}'`
const save = (player, publicPhone = false) => `select id from public.save_solo_player_post('${player}','9na','DRIVE','RIGHT','+5491123456789',${publicPhone},'solo-players-contact-v1',null,'1_DAY');`
try {
  expectSuccess(await runSql(`begin;
    insert into auth.users(id,email) values ('${owner}','solo-concurrency-${owner}@example.invalid'),('${sender}','solo-concurrency-${sender}@example.invalid');
    insert into public.users(id,email,role) values ('${owner}','solo-concurrency-${owner}@example.invalid','PLAYER'),('${sender}','solo-concurrency-${sender}@example.invalid','PLAYER');
    insert into public.players(id,user_id,first_name,last_name,category_name) values ('${owner}','${owner}','Concurrent','Owner','9na'),('${sender}','${sender}','Concurrent','Sender','9na'); commit;`))

  const firstPost = hold(owner, save(owner))
  await firstPost.ready
  const duplicatePost = runSql(`begin; ${asUser(owner, save(owner))} commit;`)
  expectSuccess(await firstPost.result)
  const duplicateResult = await duplicatePost
  assert.notEqual(duplicateResult.code, 0)
  assert.match(duplicateResult.stderr, /23505/)
  const posts = await runSql(`select id from public.solo_player_posts where owner_user_id='${owner}' and status='ACTIVE';`)
  expectSuccess(posts)
  const ownerPost = posts.stdout.trim()
  assert.match(ownerPost, /^[0-9a-f-]{36}$/)
  const senderPostResult = await runSql(`begin; ${asUser(sender, save(sender))} commit;`)
  expectSuccess(senderPostResult)
  const senderPost = senderPostResult.stdout.trim()
  console.log('Concurrency: duplicate publication serialized, one publication persisted')

  const send = (post, player) => `select id from public.send_solo_player_request('${post}','${player}','+5491199999999','solo-players-contact-v1');`
  const firstRequest = hold(sender, send(ownerPost, sender))
  await firstRequest.ready
  const reverseRequest = runSql(`begin; ${asUser(owner, send(senderPost, owner))} commit;`)
  expectSuccess(await firstRequest.result)
  const reverseResult = await reverseRequest
  assert.notEqual(reverseResult.code, 0)
  assert.match(reverseResult.stderr, /23505/)
  const requests = await runSql(`select id from public.solo_player_requests where sender_user_id='${sender}' and recipient_user_id='${owner}';`)
  expectSuccess(requests)
  const requestId = requests.stdout.trim()
  assert.match(requestId, /^[0-9a-f-]{36}$/)
  console.log('Concurrency: inverse simultaneous requests serialized, one request persisted')

  const firstAccept = hold(owner, `select status from public.resolve_solo_player_request('${requestId}','ACCEPT');`)
  await firstAccept.ready
  const withdraw = runSql(`begin; ${asUser(sender, `select status from public.resolve_solo_player_request('${requestId}','WITHDRAW');`)} commit;`)
  expectSuccess(await firstAccept.result)
  const withdrawResult = await withdraw
  expectSuccess(withdrawResult)
  assert.equal(withdrawResult.stdout.trim(), 'ACCEPTED', 'withdraw cannot overwrite the winning accepted result')
  const accepted = await runSql(`select count(*) from public.solo_player_notifications where request_id='${requestId}' and event_type='REQUEST_ACCEPTED';`)
  expectSuccess(accepted)
  assert.equal(accepted.stdout.trim(), '2')
  console.log('Concurrency: acceptance wins against withdrawal, final status and two notifications remain consistent')

  expectSuccess(await runSql(`begin; insert into public.clubes(id,user_id,name) values('${club}','${owner}','Solo closure fixture');
    insert into public.tournaments(id,club_id,type,status,category_name,name,max_participants,enable_public_inscriptions)
    values('${tournament}','${club}','LONG','ZONE_PHASE','9na','Solo closure concurrency',16,true); commit;`))
  const tournamentPostResult = await runSql(`begin; ${asUser(owner, `select id from public.save_solo_player_post('${owner}','9na','DRIVE','RIGHT','+5491123456789',false,'solo-players-contact-v1','${tournament}',null,'solo-players-tournament-v1');`)} commit;`)
  expectSuccess(tournamentPostResult)
  const tournamentPost = tournamentPostResult.stdout.trim()
  const pendingSend = hold(sender, `select id from public.send_solo_player_request('${tournamentPost}','${sender}','+5491199999999','solo-players-contact-v1','solo-players-tournament-v1');`)
  await pendingSend.ready
  const closeTournament = runSql(`set statement_timeout='5s'; update public.tournaments set status='BRACKET_PHASE' where id='${tournament}';`)
  expectSuccess(await pendingSend.result)
  expectSuccess(await closeTournament)
  const closedRequest = await runSql(`select status from public.solo_player_requests where tournament_id='${tournament}';`)
  expectSuccess(closedRequest)
  assert.equal(closedRequest.stdout.trim(), 'EXPIRED')
  console.log('Concurrency: tournament closure waits for sending, then expires the request without deadlock')
} finally {
  // Remove only this run's randomly identified fixtures, leaving all local data intact.
  expectSuccess(await runSql(`begin;
    delete from public.solo_player_notifications where request_id in (select id from public.solo_player_requests where sender_user_id in (${testIds}) or recipient_user_id in (${testIds}));
    delete from solo_player_private.request_contacts where request_id in (select id from public.solo_player_requests where sender_user_id in (${testIds}) or recipient_user_id in (${testIds}));
    delete from public.solo_player_requests where sender_user_id in (${testIds}) or recipient_user_id in (${testIds});
    delete from solo_player_private.post_contacts where post_id in (select id from public.solo_player_posts where owner_user_id in (${testIds}));
    delete from public.solo_player_posts where owner_user_id in (${testIds});
    delete from public.tournaments where id='${tournament}';
    delete from public.clubes where id='${club}';
    delete from public.players where id in (${testIds});
    delete from public.users where id in (${testIds});
    delete from auth.users where id in (${testIds}); commit;`))
}
