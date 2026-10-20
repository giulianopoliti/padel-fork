import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID, createHmac } from 'node:crypto'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

// Fixed local services only. Start the app with phase 3 preview before running.
const base = 'http://localhost:3043'
const database = 'supabase_db_padel-base-main-test'
const api = 'http://localhost:8011'
const env = JSON.parse(execFileSync('docker', ['inspect', 'supabase_auth_padel-base-main-test'], { encoding: 'utf8' }))[0].Config.Env
const secret = env.find(value => value.startsWith('GOTRUE_JWT_SECRET=')).slice('GOTRUE_JWT_SECRET='.length)
const key = role => {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  return `${head}.${payload}.${createHmac('sha256', secret).update(`${head}.${payload}`).digest('base64url')}`
}
const admin = createClient(api, key('service_role'), { auth: { persistSession: false, autoRefreshToken: false } })
const sql = query => {
  const result = spawnSync('docker', ['exec', '-i', database, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
const users = []
const club = randomUUID()
const long = randomUUID()
const american = randomUUID()
try {
  for (let index = 0; index < 2; index++) {
    const email = `solo-ui-${randomUUID()}@example.com`
    const password = `Solo-${randomUUID()}!`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    assert.ifError(created.error)
    const id = created.data.user.id
    users.push({ id, email, cookie: '' })
    sql(`begin; insert into public.users(id,email,role) values('${id}','${email}','PLAYER');
      insert into public.players(id,user_id,first_name,last_name,category_name,preferred_side,preferred_hand)
      values('${id}','${id}','Directory','Fixture','9na','DRIVE','RIGHT'); commit;`)
    const cookies = new Map()
    const client = createServerClient(api, key('anon'), { cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: entries => entries.forEach(({ name, value }) => cookies.set(name, value)),
    } })
    const signed = await client.auth.signInWithPassword({ email, password })
    assert.ifError(signed.error)
    users[index].cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }
  const [owner, other] = users
  sql(`begin; insert into public.clubes(id,user_id,name) values('${club}','${owner.id}','Solo directory fixture');
    insert into public.tournaments(id,club_id,name,type,status,category_name,enable_public_inscriptions,is_draft,max_participants)
    values('${long}','${club}','Directory LONG','LONG','ZONE_PHASE','9na',true,false,16),
    ('${american}','${club}','Directory AMERICAN','AMERICAN','NOT_STARTED','9na',true,false,16); commit;`)
  const call = async (method, body, user = owner) => {
    const response = await fetch(`${base}/api/solo-players`, { method, headers: { Cookie: user.cookie, Origin: base, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) })
    return { response, body: await response.json() }
  }
  const input = { tournamentId: null, category: '9na', side: 'DRIVE', hand: 'RIGHT', duration: '1_WEEK', phone: '+5491123456789', publicPhone: false, contactAccepted: true, termsAccepted: false }
  const saved = await call('POST', input)
  assert.equal(saved.response.status, 200, JSON.stringify(saved.body))
  const postId = saved.body.post.id
  assert.equal((await call('POST', input)).response.status, 409)
  let directory = await call('GET', null, other)
  assert.equal(directory.response.status, 200, JSON.stringify(directory.body))
  assert.ok(directory.body.directory.some(post => post.id === postId))
  assert.doesNotMatch(JSON.stringify(directory.body.directory), /\+5491123456789|"phone"|"dni"|"email"|payment_proof/)
  const contact = await fetch(`${base}/api/solo-players/contact?postId=${postId}`, { headers: { Cookie: other.cookie } })
  assert.equal(contact.status, 403)
  assert.equal((await call('PATCH', { postId, status: 'WITHDRAWN' }, other)).response.status, 403)
  for (const status of ['PAUSED', 'ACTIVE']) {
    assert.equal((await call('PATCH', { postId, status })).response.status, 200)
    directory = await call('GET', null, other)
    assert.equal(directory.body.directory.some(post => post.id === postId), status === 'ACTIVE')
  }
  assert.equal((await call('POST', { ...input, postId, side: 'REVES', publicPhone: true })).response.status, 200)
  const publicContact = await fetch(`${base}/api/solo-players/contact?postId=${postId}`, { headers: { Cookie: other.cookie } })
  assert.equal(publicContact.status, 200)
  assert.equal((await publicContact.json()).phone, input.phone)
  for (const tournamentId of [long, american]) {
    const tournamentPost = await call('POST', { ...input, tournamentId, termsAccepted: true })
    assert.equal(tournamentPost.response.status, 200, JSON.stringify(tournamentPost.body))
  }
  assert.equal(sql(`select count(*) from public.inscriptions where tournament_id in ('${long}','${american}');`), '0')
  assert.equal((await call('PATCH', { postId, status: 'WITHDRAWN' })).response.status, 200)
  directory = await call('GET', null, other)
  assert.ok(!directory.body.directory.some(post => post.id === postId))
  console.log('Local HTTP + PostgreSQL: publication, duplicates, edit, pause/resume, withdrawal, ownership, contact privacy, LONG/AMERICAN without inscriptions: passed')
} finally {
  const ids = users.map(user => `'${user.id}'`).join(',')
  if (ids) sql(`begin;
    delete from public.tournaments where id in ('${long}','${american}');
    delete from public.clubes where id='${club}';
    delete from public.players where id in (${ids});
    delete from public.users where id in (${ids});
    delete from auth.users where id in (${ids}); commit;`)
}
