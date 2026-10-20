import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID, createHmac } from 'node:crypto'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

// Intentionally fixed local targets. Emails must remain disabled on this dev server.
const base = 'http://localhost:3043', api = 'http://localhost:8011'
const env = JSON.parse(execFileSync('docker', ['inspect', 'supabase_auth_padel-base-main-test'], { encoding: 'utf8' }))[0].Config.Env
const secret = env.find(value => value.startsWith('GOTRUE_JWT_SECRET=')).slice(18)
const key = role => {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  return `${head}.${payload}.${createHmac('sha256', secret).update(`${head}.${payload}`).digest('base64url')}`
}
const admin = createClient(api, key('service_role'), { auth: { persistSession: false, autoRefreshToken: false } })
const sql = query => {
  const result = spawnSync('docker', ['exec', '-i', 'supabase_db_padel-base-main-test', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
const users = [], club = randomUUID(), long = randomUUID(), american = randomUUID(), managedPairing = randomUUID()
try {
  for (const role of ['PLAYER', 'PLAYER', 'CLUB']) {
    const email = `solo4-http-${randomUUID()}@example.com`, password = `Solo-${randomUUID()}!`
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    assert.ifError(result.error)
    const id = result.data.user.id
    users.push({ id, cookie: '' })
    sql(`begin; insert into public.users(id,email,role) values('${id}','${email}','${role}');
      ${role === 'PLAYER' ? `insert into public.players(id,user_id,first_name,last_name,category_name,preferred_side,preferred_hand,gender,is_categorized,score)
        values('${id}','${id}','Request','Fixture','9na','DRIVE','RIGHT','MALE',true,111);` : ''} commit;`)
    const cookies = new Map()
    const client = createServerClient(api, key('anon'), { cookies: { getAll: () => [...cookies].map(([name,value]) => ({ name,value })), setAll: entries => entries.forEach(({name,value}) => cookies.set(name,value)) } })
    assert.ifError((await client.auth.signInWithPassword({ email,password })).error)
    users.at(-1).cookie = [...cookies].map(([name,value]) => `${name}=${value}`).join('; ')
  }
  const [owner, sender, manager] = users
  sql(`begin; insert into public.clubes(id,user_id,name) values('${club}','${manager.id}','Requests HTTP fixture');
    insert into public.tournaments(id,club_id,name,type,status,category_name,enable_public_inscriptions,is_draft,max_participants,enable_transfer_proof,validate_inscriptions,transfer_alias,transfer_amount)
    values('${long}','${club}','Request LONG','LONG','ZONE_PHASE','9na',true,false,16,false,false,null,null),
      ('${american}','${club}','Request AMERICAN proof','AMERICAN','NOT_STARTED','9na',true,false,16,true,true,'local.test',100),
      ('${managedPairing}','${club}','Manager pairing LONG','LONG','ZONE_PHASE','9na',true,false,16,true,false,'local.test',100); commit;`)
  const call = async (path, method = 'GET', body = null, user = owner) => {
    const response = await fetch(`${base}/api/solo-players${path}`, { method, headers: { Cookie:user.cookie,Origin:base,'Content-Type':'application/json' }, ...(body ? {body:JSON.stringify(body)} : {}) })
    const data = await response.json()
    return { status:response.status,data }
  }
  const publication = { tournamentId:null,category:'9na',side:'DRIVE',hand:'RIGHT',duration:'1_WEEK',phone:'+5491123456789',publicPhone:false,contactAccepted:true,termsAccepted:false }
  const general = await call('', 'POST', publication)
  assert.equal(general.status,200,JSON.stringify(general.data))
  const postId = general.data.post.id
  const send = async (postId, termsAccepted = false) => call('/requests','POST',{postId,phone:'+5491199999999',contactAccepted:true,termsAccepted},sender)
  const sent = await send(postId)
  assert.equal(sent.status,201,JSON.stringify(sent.data))
  const requestId = sent.data.request.id
  assert.equal((await send(postId)).status,409)
  assert.equal((await call(`/contact?requestId=${requestId}`,'GET',null,sender)).status,403)
  let notifications = await call('/notifications')
  assert.equal(notifications.data.unreadCount,1)
  assert.match(notifications.data.notifications[0].title,/categoría 9na/)
  assert.equal((await call('/management','GET')).status,403)
  assert.equal((await call('/notifications','GET',null,manager)).data.unreadCount,0)
  assert.doesNotMatch(JSON.stringify(notifications.data), /"phone"|"email"|email_claim|email_last_error/)
  assert.equal((await call('/notifications','PATCH',{notificationId:notifications.data.notifications[0].id},sender)).status,403)
  assert.equal((await call('/notifications','PATCH',{notificationId:notifications.data.notifications[0].id})).status,200)
  assert.equal((await call('/notifications')).data.unreadCount,0)
  assert.equal((await call('/notifications?unread=true')).data.notifications.length,0)
  assert.equal((await call('/requests','PATCH',{requestId,action:'ACCEPT'})).data.request.status,'ACCEPTED')
  assert.equal((await call(`/contact?requestId=${requestId}`,'GET',null,sender)).data.phone,publication.phone)
  assert.equal((await call(`/contact?requestId=${requestId}`)).data.phone,'+5491199999999')
  assert.equal((await call(`/contact?requestId=${requestId}`,'GET',null,manager)).status,403)
  assert.equal((await call('/requests')).data.requests.length,0)
  assert.equal((await call('/requests?history=true')).data.requests[0].effective_status,'ACCEPTED')
  const rejected = await send(postId)
  assert.equal((await call('/requests','PATCH',{requestId:rejected.data.request.id,action:'REJECT'})).data.request.status,'REJECTED')
  const withdrawn = await send(postId)
  assert.equal((await call('/requests','PATCH',{requestId:withdrawn.data.request.id,action:'WITHDRAW'},sender)).data.request.status,'WITHDRAWN')
  const expired = await send(postId)
  sql(`update public.solo_player_posts set created_at=now()-interval '2 days',expires_at=now()-interval '1 second' where id='${postId}';`)
  assert.equal((await call('/requests')).data.requests.length,0)
  assert.equal((await call('/requests','PATCH',{requestId:expired.data.request.id,action:'ACCEPT'})).data.request.status,'EXPIRED')
  assert.equal(sql(`select count(*) from public.inscriptions where tournament_id in ('${long}','${american}');`),'0')
  console.log('HTTP: general send -> both inboxes -> accept -> private contact; rejection, withdrawal, expiry and unread ownership passed')
  for (const tournamentId of [long,american]) {
    const post = await call('','POST',{...publication,tournamentId,termsAccepted:true})
    assert.equal(post.status,200,JSON.stringify(post.data))
    const proposal = await send(post.data.post.id,true)
    assert.equal(proposal.status,201,JSON.stringify(proposal.data))
    const managed = await call('/requests','GET',null,manager)
    assert.ok(managed.data.requests.some(row => row.id===proposal.data.request.id))
    assert.doesNotMatch(JSON.stringify(managed.data), /\+54911|"phone"|"email"/)
    const accepted = await call('/requests','PATCH',{requestId:proposal.data.request.id,action:'ACCEPT',termsAccepted:true,...(tournamentId===american?{paymentMethod:'TRANSFER'}:{})})
    assert.equal(accepted.status,200,JSON.stringify(accepted.data))
    assert.ok(accepted.data.inscriptionId)
    assert.equal(accepted.data.paymentRequired,tournamentId===american)
    assert.equal(sql(`select count(*) from public.inscriptions where tournament_id='${tournamentId}';`),'1')
    if (tournamentId===american) {
      assert.equal(sql(`select is_pending from public.inscriptions where id='${accepted.data.inscriptionId}';`),'t')
      const payment = await fetch(`${base}/api/tournaments/${american}/inscriptions/payment?inscriptionId=${accepted.data.inscriptionId}`,{headers:{Cookie:owner.cookie}})
      assert.equal(payment.status,200,'Existing payment popup API is resumable after acceptance')
    }
  }
  const management = await call('/management?history=true','GET',null,manager)
  assert.equal(management.status,200,JSON.stringify(management.data))
  assert.ok(management.data.pairs.some(pair => pair.tournamentId===american && pair.pendingApproval && pair.pendingProof))
  assert.ok(management.data.pairs.some(pair => pair.tournamentId===long && pair.assigned))
  assert.ok(management.data.requests.every(request => request.tournament_id))
  assert.doesNotMatch(JSON.stringify(management.data), /"phone"|"email"|payment_proof_path|\+54911/)
  sql(`update public.tournaments set show_public_inscriptions=false where id='${american}';`)
  const privateRoster = await fetch(`${base}/tournaments/${american}/inscriptions`,{headers:{Cookie:owner.cookie},redirect:'manual'})
  assert.equal(privateRoster.status,200)
  assert.match(await privateRoster.text(),/Las inscripciones de este torneo no son públicas/)
  const settingsResponse = await fetch(`${base}/api/tournaments/${american}/inscription-settings`,{
    method:'PATCH',headers:{Cookie:manager.cookie,Origin:base,'Content-Type':'application/json'},
    body:JSON.stringify({enable_transfer_proof:false}),
  })
  assert.equal(settingsResponse.status,200,await settingsResponse.text())
  const ownAfterToggle = await call('')
  assert.ok(ownAfterToggle.data.pairs.some(pair => pair.tournament_id===american && !pair.pendingProof && pair.pendingApproval))
  const managementAfterToggle = await call('/management?history=true','GET',null,manager)
  assert.ok(managementAfterToggle.data.pairs.some(pair => pair.tournamentId===american && !pair.pendingProof && pair.pendingApproval && !pair.assigned))
  const paymentAfterToggle = await fetch(`${base}/api/tournaments/${american}/inscriptions/payment`,{headers:{Cookie:owner.cookie}})
  assert.equal(paymentAfterToggle.status,200)
  assert.equal((await paymentAfterToggle.json()).inscription.proofRequired,false)
  assert.equal(sql(`select payment_method||':'||is_pending::text from public.inscriptions where tournament_id='${american}';`),'TRANSFER:true')
  console.log('HTTP: private roster renders a return link; disabling proof updates player/manager/payment states while retaining independent approval')
  const adminPair = await call('/management','POST',{tournamentId:managedPairing,player1Id:owner.id,player2Id:sender.id},manager)
  assert.equal(adminPair.status,200,JSON.stringify(adminPair.data))
  assert.ok(adminPair.data.inscriptionId)
  const beforeProofDisabled = await call('/management?history=true','GET',null,manager)
  assert.ok(!beforeProofDisabled.data.pairs.some(pair => pair.tournamentId===managedPairing), 'Administrative pairs are not pairs formed by requests')
  assert.equal(sql(`select count(*) from public.zone_couples zc join public.zones z on z.id=zc.zone_id where z.tournament_id='${managedPairing}' and zc.couple_id=(select couple_id from public.inscriptions where id='${adminPair.data.inscriptionId}');`),'0')
  const disableLongProof = await fetch(`${base}/api/tournaments/${managedPairing}/inscription-settings`,{
    method:'PATCH',headers:{Cookie:manager.cookie,Origin:base,'Content-Type':'application/json'},
    body:JSON.stringify({enable_transfer_proof:false}),
  })
  assert.equal(disableLongProof.status,200,await disableLongProof.text())
  const afterPair = await call('/management?history=true','GET',null,manager)
  assert.ok(!afterPair.data.pairs.some(pair => pair.tournamentId===managedPairing))
  assert.equal(sql(`select count(*) from public.zone_couples zc join public.zones z on z.id=zc.zone_id where z.tournament_id='${managedPairing}' and zc.couple_id=(select couple_id from public.inscriptions where id='${adminPair.data.inscriptionId}');`),'1')
  const repeat = await call('/management','POST',{tournamentId:managedPairing,player1Id:owner.id,player2Id:sender.id},manager)
  assert.equal(repeat.status,409)
  assert.equal(repeat.data.code,'PAIR_ALREADY_REGISTERED')
  assert.equal(repeat.data.inscriptionId,adminPair.data.inscriptionId)
  const reverseRepeat=await call('/management','POST',{tournamentId:managedPairing,player1Id:sender.id,player2Id:owner.id},manager)
  assert.equal(reverseRepeat.status,409)
  assert.equal(reverseRepeat.data.inscriptionId,adminPair.data.inscriptionId)
  const profile = await fetch(base+'/players/'+owner.id)
  assert.equal(profile.status,200)
  const markup = await profile.text()
  assert.match(markup,/Torneos jugados/)
  assert.doesNotMatch(markup,/\+5491123456789/)
  console.log('HTTP: organizer permission, contextual notifications, unread filter, atomic organizer pairing, LONG zone assignment, idempotency and sports profile passed')
  const events = sql(`select count(*) from public.solo_player_notifications n join public.solo_player_requests r on r.id=n.request_id where r.tournament_id in ('${long}','${american}') and n.recipient_user_id='${manager.id}' and n.event_type='REQUEST_ACCEPTED';`)
  assert.equal(events,'2')
  console.log('HTTP: LONG/AMERICAN acceptance -> one inscription -> organizer events; proof popup API and approval preserved; no real emails sent')
} finally {
  const ids = users.map(user=>`'${user.id}'`).join(',')
  if(ids) sql(`begin; delete from public.inscriptions where tournament_id in ('${long}','${american}','${managedPairing}');
    delete from public.zones where tournament_id in ('${long}','${american}','${managedPairing}');
    delete from public.tournaments where id in ('${long}','${american}','${managedPairing}');
    delete from public.clubes where id='${club}'; delete from public.couples where player1_id in (${ids}) or player2_id in (${ids});
    delete from public.players where id in (${ids}); delete from public.users where id in (${ids}); delete from auth.users where id in (${ids}); commit;`)
}
