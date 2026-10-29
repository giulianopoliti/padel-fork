// Runs only in the disposable local Docker database; never uses remote credentials.
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const container = 'supabase_db_padel-base-main-test'
const database = 'padel_inscription_capacity_test'
const args = ['exec', '-i', container, 'bash', '-c', 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec "$@"', '--',
  'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1']
const sql = query => execFileSync('docker', args, { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const parallelSql = query => new Promise(resolve => {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''; let error = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { error += data })
  child.on('close', code => resolve({ code, output: output.trim(), error }))
  child.stdin.end(query)
})
assert.equal(sql('select current_database();'), database)
const tid = randomUUID()
const players = Array.from({ length: 6 }, randomUUID)
const couples = Array.from({ length: 3 }, randomUUID)
const inscriptions = Array.from({ length: 3 }, randomUUID)
const paths = inscriptions.map(id => `tournament/${tid}/inscription/${id}/concurrency.pdf`)
let actor
try {
  sql(`begin;
    insert into public.tournaments select (jsonb_populate_record(null::public.tournaments,to_jsonb(t)||jsonb_build_object(
      'id','${tid}','name','Inscription capacity concurrency local','seo_slug','${tid}','status','NOT_STARTED',
      'max_participants',1,'bracket_status','NOT_STARTED','registration_locked',false,'registration_locked_by_capacity',false,
      'enable_transfer_proof',true,'reserve_slot_without_proof',false,'allow_cash_payment',true,
      'transfer_alias','local.concurrent','transfer_amount',100,'validate_inscriptions',false,'messages_enabled',false))).*
      from public.tournaments t where t.club_id is not null and t.type::text='AMERICAN' limit 1;
    ${players.map(id => `insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id','${id}','user_id',null,'dni','${id}'))).* from public.players p limit 1;`).join('\n')}
    insert into public.couples(id,player1_id,player2_id) values ${couples.map((id,i) => `('${id}','${players[i*2]}','${players[i*2+1]}')`).join(',')};
    insert into public.inscriptions(id,tournament_id,couple_id,player_id,is_pending,es_prueba) values ${inscriptions.map((id,i) => `('${id}','${tid}','${couples[i]}','${players[i*2]}',false,false)`).join(',')};
    insert into public.inscription_proof_cleanup(path,available_at) values ${paths.map(path => `('${path}',now()+interval '15 minutes')`).join(',')};
    commit;`)
  actor = sql(`select c.user_id from public.tournaments t join public.clubes c on c.id=t.club_id where t.id='${tid}';`)
  assert.match(actor, /^[a-f0-9-]{36}$/)
  const uploads = await Promise.all(inscriptions.slice(0,2).map((id,i) => parallelSql(
    `select occupies_slot from public.change_inscription_payment('${id}','${tid}',0,'attach','${paths[i]}');`,
  )))
  assert.equal(uploads.filter(result => result.code === 0).length, 2, JSON.stringify(uploads))
  const after = JSON.parse(sql(`select jsonb_build_object('occupied',count(*) filter(where occupies_slot),
    'withProof',count(*) filter(where payment_proof_path is not null),'conflicts',
    (select count(*) from inscription_private.registration_events where tournament_id='${tid}' and kind='PROOF_WITHOUT_SLOT'))
    from public.inscriptions where tournament_id='${tid}';`))
  assert.deepEqual(after, { occupied: 1, withProof: 2, conflicts: 1 })
  const winner = sql(`select id from public.inscriptions where tournament_id='${tid}' and occupies_slot;`)
  const waiting = sql(`select id from public.inscriptions where tournament_id='${tid}' and not occupies_slot and payment_proof_path is not null;`)
  sql(`delete from public.inscriptions where id='${winner}';`)
  const revision = Number(sql(`select payment_revision from public.inscriptions where id='${waiting}';`))
  const claims = await Promise.all([
    parallelSql(`select id from public.manage_inscription_admission('${waiting}','${tid}',${revision},'${actor}','assign');`),
    parallelSql(`select id from public.manage_inscription_admission('${inscriptions[2]}','${tid}',0,'${actor}','admit-without-proof');`),
  ])
  assert.equal(claims.filter(result => result.code === 0).length, 1, JSON.stringify(claims))
  assert.equal(sql(`select count(*) from public.inscriptions where tournament_id='${tid}' and occupies_slot;`), '1')
  assert.equal(sql(`select count(*) from public.inscriptions where tournament_id='${tid}' and not occupies_slot and proof_waived_at is not null;`), '0')
  assert.equal(claims.filter(result => result.error.includes('El torneo ya no tiene cupo')).length, 1)
  sql(`delete from public.inscriptions where tournament_id='${tid}';
    update public.tournaments set enable_transfer_proof=false,reserve_slot_without_proof=false,validate_inscriptions=true where id='${tid}';
    `)
  assert.equal(sql(`select count(*) from public.inscriptions where tournament_id='${tid}' and occupies_slot;`),'0')
  const manualClaims=await Promise.all(inscriptions.slice(0,2).map((id,i)=>parallelSql(
    `insert into public.inscriptions(id,tournament_id,couple_id,player_id,is_pending) values('${id}','${tid}','${couples[i]}','${players[i*2]}',true) returning id;`,
  )))
  assert.equal(manualClaims.filter(result=>result.code===0).length,1,JSON.stringify(manualClaims))
  assert.equal(sql(`select count(*) from public.inscriptions where tournament_id='${tid}' and occupies_slot and not is_pending;`),'1')
  assert.equal(sql(`select count(*) from public.inscriptions where tournament_id='${tid}' and is_pending;`),'0')
  console.log(JSON.stringify({ localDatabase: database, uploads: 'both receipts saved, one place assigned',
    competingAdmissions: 'exactly one succeeds', noDepositSignups:'exactly one succeeds', orphanedExemptions: 0 }))
} finally {
  sql(`delete from public.inscriptions where tournament_id='${tid}';
    delete from public.tournaments where id='${tid}';
    delete from public.inscription_proof_cleanup where path like 'tournament/${tid}/%';
    delete from public.couples where id in (${couples.map(id => `'${id}'`).join(',')});
    delete from public.players where id in (${players.map(id => `'${id}'`).join(',')});`)
}
