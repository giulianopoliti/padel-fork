// LOCAL TPE only. Two real PostgreSQL sessions compete for one place.
// Synthetic fixtures are removed in finally; no application messages run.
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const container = 'supabase_db_padel-elite-local'
const args = ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
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
const tid = randomUUID()
const players = Array.from({ length: 4 }, randomUUID)
const couples = [randomUUID(), randomUUID()]
try {
  run(`begin;
    set local request.jwt.claim.role = 'service_role';
    insert into public.tournaments select (jsonb_populate_record(null::public.tournaments, to_jsonb(t) || jsonb_build_object(
      'id','${tid}','name','LOCAL concurrency fixture','seo_slug','${tid}','status','NOT_STARTED','max_participants',1,
      'enable_transfer_proof',true,'transfer_alias','test.alias','transfer_amount',100,'messages_enabled',false))).* from public.tournaments t limit 1;
    ${players.map(id => `insert into public.players select (jsonb_populate_record(null::public.players, to_jsonb(p) || jsonb_build_object('id','${id}','user_id',null,'dni','${id}','first_name','LocalTest','last_name','Concurrency'))).* from public.players p limit 1;`).join('\n')}
    insert into public.couples(id,player1_id,player2_id) values('${couples[0]}','${players[0]}','${players[1]}'),('${couples[1]}','${players[2]}','${players[3]}');
    commit;`)
  const results = await Promise.all(couples.map(couple => concurrent(`begin;
    insert into public.inscriptions(tournament_id,couple_id,is_pending,es_prueba) values('${tid}','${couple}',false,false);
    select pg_sleep(0.5); commit;`)))
  assert.equal(results.filter(result => result.code === 0).length, 1, JSON.stringify(results))
  assert.match(results.find(result => result.code !== 0).stderr, /ya no tiene cupo/)
  assert.equal(run(`select count(*) from public.inscriptions where tournament_id='${tid}';`), '1')
  console.log('PASS: concurrent requests create exactly one inscription for the last place.')
} finally {
  run(`begin;
    delete from public.inscriptions where tournament_id='${tid}';
    delete from public.couples where id in ('${couples.join("','")}');
    delete from public.tournaments where id='${tid}';
    delete from public.players where id in ('${players.join("','")}');
    commit;`)
}
