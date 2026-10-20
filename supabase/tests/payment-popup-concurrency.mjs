// LOCAL TPE only: real sessions edit the same pending proof with the same revision.
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
  child.stdin.end(sql)
})
const tid = randomUUID(), iid = randomUUID(), cid = randomUUID()
const players = [randomUUID(), randomUUID()]
const prefix = `tournament/${tid}/inscription/${iid}/`
const paths = ['original.pdf', 'first.pdf', 'second.pdf'].map(name => prefix + name)
try {
  run(`begin;
    insert into public.tournaments select (jsonb_populate_record(null::public.tournaments,to_jsonb(t)||jsonb_build_object(
      'id','${tid}','seo_slug','${tid}','name','LOCAL popup concurrency','status','NOT_STARTED','max_participants',2,
      'enable_transfer_proof',true,'allow_cash_payment',true,'transfer_alias','test.alias','transfer_amount',100,'messages_enabled',false))).* from public.tournaments t limit 1;
    ${players.map(id => `insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id','${id}','user_id',null,'dni','${id}'))).* from public.players p limit 1;`).join('\n')}
    insert into public.couples(id,player1_id,player2_id) values('${cid}','${players[0]}','${players[1]}');
    insert into public.inscriptions(id,tournament_id,couple_id,is_pending,es_prueba) values('${iid}','${tid}','${cid}',false,false);
    update public.inscriptions set payment_proof_path='${paths[0]}',payment_proof_status='PENDING_REVIEW' where id='${iid}';
    insert into public.inscription_proof_cleanup(path,available_at) values('${paths[1]}',now()+interval '15 minutes'),('${paths[2]}',now()+interval '15 minutes');
    commit;`)
  const results = await Promise.all(paths.slice(1).map(proof => concurrent(`begin;
    select id from public.change_inscription_payment('${iid}','${tid}',1,'replace','${proof}',false);
    select pg_sleep(0.3); commit;`)))
  assert.equal(results.filter(result => result.code === 0).length, 1, JSON.stringify(results))
  assert.match(results.find(result => result.code !== 0).stderr, /El pago cambió/)
  const livePath = run(`select payment_proof_path from public.inscriptions where id='${iid}';`)
  assert.ok(paths.slice(1).includes(livePath))
  assert.equal(run(`select count(*) from public.inscription_proof_cleanup where path='${livePath}';`), '0')
  assert.equal(run(`select count(*) from public.inscription_proof_cleanup where path='${paths[0]}';`), '1')
  assert.equal(run(`select payment_revision from public.inscriptions where id='${iid}';`), '2')
  console.log('PASS: exactly one concurrent replacement wins; the live file has no cleanup ticket, original and unused upload remain recoverable.')

  run(`begin;
    select id from public.change_inscription_payment('${iid}','${tid}',2,'remove',null,false);
    insert into public.inscription_proof_cleanup(path,available_at)
      values('${paths[1]}',now()+interval '15 minutes'),('${paths[2]}',now()+interval '15 minutes')
      on conflict(path) do update set available_at=excluded.available_at,claimed_at=null;
    commit;`)
  const attachResults = await Promise.all(paths.slice(1).map(proof => concurrent(`begin;
    select id from public.change_inscription_payment('${iid}','${tid}',3,'attach','${proof}',false);
    select pg_sleep(0.3); commit;`)))
  assert.equal(attachResults.filter(result => result.code === 0).length, 1, JSON.stringify(attachResults))
  assert.match(attachResults.find(result => result.code !== 0).stderr, /El pago cambió/)
  const firstSavedPath = run(`select payment_proof_path from public.inscriptions where id='${iid}';`)
  const secondPath = paths.slice(1).find(path => path !== firstSavedPath)
  assert.ok(secondPath)
  assert.equal(run(`select payment_revision from public.inscriptions where id='${iid}';`), '4')
  assert.equal(run(`select count(*) from public.inscription_proof_cleanup where path='${firstSavedPath}';`), '0')
  assert.equal(run(`select count(*) from public.inscription_proof_cleanup where path='${secondPath}';`), '1')
  const implicitReplace = await concurrent(`select id from public.change_inscription_payment('${iid}','${tid}',4,'attach','${secondPath}',false);`)
  assert.notEqual(implicitReplace.code, 0)
  assert.equal(run(`select payment_proof_path from public.inscriptions where id='${iid}';`), firstSavedPath)
  run(`select id from public.change_inscription_payment('${iid}','${tid}',4,'replace','${secondPath}',false);`)
  assert.equal(run(`select payment_proof_path from public.inscriptions where id='${iid}';`), secondPath)
  console.log('PASS: the first concurrent attachment persists; attaching again cannot replace it, while an explicit replacement with the current revision can.')
} finally {
  run(`begin;
    delete from public.inscriptions where id='${iid}';
    delete from public.couples where id='${cid}';
    delete from public.tournaments where id='${tid}';
    delete from public.players where id in ('${players.join("','")}');
    delete from public.inscription_proof_cleanup where path like '${prefix}%';
    commit;`)
}
