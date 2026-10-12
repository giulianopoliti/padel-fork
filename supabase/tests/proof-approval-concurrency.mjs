// Two real LOCAL PostgreSQL sessions; synthetic fixtures removed in finally.
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const args = ['exec', '-i', 'supabase_db_padel-elite-local', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
const run = sql => {
  const result = spawnSync('docker', args, { input: sql, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}
const concurrent = sql => new Promise(resolve => {
  const child = spawn('docker', args)
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  child.stdout.resume()
  child.on('close', code => resolve({ code, stderr }))
  child.stdin.end(`begin; ${sql} select pg_sleep(0.2); commit;`)
})
const tid = randomUUID(), iid = randomUUID(), cid = randomUUID()
const players = [randomUUID(), randomUUID()], users = [randomUUID(), randomUUID()]
const path1 = `tournament/${tid}/inscription/${iid}/original.pdf`
const path2 = `tournament/${tid}/inscription/${iid}/replacement.pdf`
const approve = (revision, user) => `select id from public.approve_inscription_proof('${iid}','${tid}',${revision},'${path1}','${user}');`
const read = () => JSON.parse(run(`select row_to_json(i) from public.inscriptions i where id='${iid}';`))
try {
  run(`begin;
    insert into auth.users(id) values('${users[0]}'),('${users[1]}');
    insert into public.tournaments select (jsonb_populate_record(null::public.tournaments,to_jsonb(t)||jsonb_build_object('id','${tid}','name','LOCAL proof approval concurrency','seo_slug','${tid}','status','NOT_STARTED','max_participants',1,'enable_transfer_proof',true,'transfer_alias','local.alias','transfer_amount',100,'messages_enabled',false))).* from public.tournaments t limit 1;
    ${players.map(id => `insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id','${id}','user_id',null,'dni','${id}'))).* from public.players p limit 1;`).join('\n')}
    insert into public.couples(id,player1_id,player2_id) values('${cid}','${players[0]}','${players[1]}');
    insert into public.inscriptions(id,tournament_id,couple_id,is_pending,es_prueba) values('${iid}','${tid}','${cid}',true,false);
    update public.inscriptions set payment_proof_path='${path1}',payment_proof_status='PENDING_REVIEW' where id='${iid}'; commit;`)
  const original = read()
  const duplicate = await Promise.all(users.map(user => concurrent(approve(original.payment_revision, user))))
  assert.ok(duplicate.every(result => result.code === 0), JSON.stringify(duplicate))
  const approved = read()
  assert.equal(approved.payment_revision, original.payment_revision + 1)
  assert.equal(approved.is_pending, true)
  assert.ok(users.includes(approved.payment_reviewed_by))
  for (const operation of ['replace', 'remove']) {
    run(`update public.inscriptions set payment_proof_path='${path1}',payment_proof_status='PENDING_REVIEW',payment_reviewed_at=null,payment_reviewed_by=null where id='${iid}';
      insert into public.inscription_proof_cleanup(path,available_at) values('${path2}',now()+interval '1 hour') on conflict(path) do update set available_at=excluded.available_at,claimed_at=null;`)
    const revision = read().payment_revision
    const change = `select id from public.change_inscription_payment('${iid}','${tid}',${revision},'${operation}',${operation === 'replace' ? `'${path2}'` : 'null'},true);`
    const results = await Promise.all([concurrent(approve(revision, users[0])), concurrent(change)])
    assert.equal(results.filter(result => result.code === 0).length, 1, JSON.stringify(results))
    assert.match(results.find(result => result.code !== 0).stderr, /cambi/)
    const saved = read()
    assert.equal(saved.is_pending, true)
    if (saved.payment_proof_path !== path1) assert.notEqual(saved.payment_proof_status, 'APPROVED')
  }
  console.log('PASS: two real reviewers write one approval; approval races against replacement/removal preserve inscription and never approve a different file.')
} finally {
  run(`begin;
    delete from public.inscriptions where id='${iid}';
    delete from public.couples where id='${cid}';
    delete from public.tournaments where id='${tid}';
    delete from public.players where id in ('${players.join("','")}');
    delete from auth.users where id in ('${users.join("','")}');
    delete from public.inscription_proof_cleanup where path in ('${path1}','${path2}'); commit;`)
}
