// LOCAL FV ONLY. Uses two PostgreSQL sessions and removes only its synthetic fixtures.
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const args = ['exec', '-i', 'supabase_db_padel-base-main-test', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
const run = sql => {
  const result = spawnSync('docker', args, { input: sql, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}
const concurrent = sql => new Promise((resolve, reject) => {
  const child = spawn('docker', args)
  let stderr = ''
  child.on('error', reject)
  child.stderr.on('data', chunk => { stderr += chunk })
  child.stdout.resume()
  child.on('close', code => resolve({ code, stderr }))
  child.stdin.end(`set lock_timeout='5s'; set statement_timeout='10s'; begin; ${sql}; select pg_sleep(0.2); commit;`)
})
const user = run('select id from public.users order by id limit 1;')
assert.ok(user, 'An existing local test user is required')
const monthly = (org, tid) => `public.create_billing_collection_monthly('${org}',NULL,'LOCAL concurrency',100020,10,
  '[{"tournament_id":"${tid}","amount_ars":100000,"tournament_name":"QA","club_name":"QA","billable_units":20,"tournament_status":"ZONE_PHASE"}]',
  '[{"installment_number":1,"amount_ars":50010},{"installment_number":2,"amount_ars":50010}]','${user}','2085-01-01')`
const fixture = () => {
  const org = randomUUID(), tids = [randomUUID(), randomUUID()]
  run(`begin;
    insert into public.organizaciones(id,name,slug) values('${org}','Billing concurrency','billing-concurrency-${org}');
    insert into public.tenant_billing_settings(organization_id,billing_model) values('${org}','FV_LEAGUE');
    insert into public.tournaments(id,name,type,status,organization_id,club_id,es_prueba) values
      ${tids.map(t => `('${t}','LOCAL billing concurrency','LONG','ZONE_PHASE','${org}',NULL,false)`).join(',')};
    commit;`)
  return { org, tids }
}
const cleanup = org => run(`begin;
  delete from public.billing_installment_payments where installment_id in (
    select i.id from public.billing_collection_installments i join public.billing_collections c on c.id=i.collection_id where c.organization_id='${org}');
  delete from public.billing_collections where organization_id='${org}';
  delete from public.tournaments where organization_id='${org}';
  delete from public.tenant_billing_settings where organization_id='${org}';
  delete from public.organizaciones where id='${org}'; commit;`)
const pay = id => `select public.register_billing_installment_payment('${id}',50010,'LOCAL QA','','${user}')`

for (const scenario of ['siblings', 'duplicate', 'cancel', 'month']) {
  const { org, tids } = fixture()
  try {
    if (scenario === 'month') {
      const results = await Promise.all(tids.map(t => concurrent(`select ${monthly(org,t)}`)))
      assert.equal(results.filter(r => r.code === 0).length, 1, JSON.stringify(results))
      assert.match(results.find(r => r.code !== 0).stderr, /billing_installments_account_month_key/)
      assert.equal(run(`select count(*) from public.billing_collections where organization_id='${org}';`), '1')
      console.log('PASS: exactly one concurrent monthly maintenance reservation succeeds, without orphan collections.')
      continue
    }
    const cid = run(`select ${monthly(org,tids[0])};`)
    const installments = run(`select id from public.billing_collection_installments where collection_id='${cid}' order by installment_number;`).split('\n')
    const results = await Promise.all(scenario === 'cancel'
      ? [concurrent(pay(installments[0])), concurrent(`select public.cancel_billing_collection('${cid}','${org}')`)]
      : [concurrent(pay(installments[0])), concurrent(pay(installments[scenario === 'siblings' ? 1 : 0]))])
    if (scenario === 'siblings') {
      assert.ok(results.every(r => r.code === 0), JSON.stringify(results))
      assert.equal(run(`select status || '|' || amount_paid_ars || '|' || balance_ars from public.billing_collections where id='${cid}';`), 'PAID|100020|0')
      console.log('PASS: simultaneous sibling payments produce the exact complete collection balance.')
    } else if (scenario === 'duplicate') {
      assert.equal(results.filter(r => r.code === 0).length, 1, JSON.stringify(results))
      assert.match(results.find(r => r.code !== 0).stderr, /ya fue abonada/)
      assert.equal(run(`select status || '|' || amount_paid_ars || '|' || balance_ars from public.billing_collections where id='${cid}';`), 'PARTIALLY_PAID|50010|50010')
      console.log('PASS: duplicate concurrent payments register exactly once.')
    } else {
      assert.equal(results.filter(r => r.code === 0).length, 1, JSON.stringify(results))
      const state = run(`select status || '|' || amount_paid_ars from public.billing_collections where id='${cid}';`)
      assert.ok(state === '' || state === 'PARTIALLY_PAID|50010', state)
      assert.ok(results.every(r => !/deadlock|lock timeout/i.test(r.stderr)), JSON.stringify(results))
      console.log('PASS: payment/cancellation race completes without deadlock or lost payment.')
    }
  } finally { cleanup(org) }
}
