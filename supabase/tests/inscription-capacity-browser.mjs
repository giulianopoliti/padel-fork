// LOCAL ONLY. Generate .local/inscription-capacity.env with the local QA launcher.
// Uses synthetic accounts, disables notifications, and deletes only its fixtures.
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const env = dotenv.parse(readFileSync(process.env.CAPACITY_QA_ENV || '.local/inscription-capacity.env'))
const baseUrl = 'http://localhost:3107'
assert.ok(['localhost','127.0.0.1'].includes(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname), 'Refusing remote database')
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const tid = randomUUID(), clubId = randomUUID()
const players = Array.from({ length: 6 }, () => randomUUID())
const couples = Array.from({ length: 3 }, () => randomUUID())
const users = [], contexts = [], objects = new Set(), errors = []
const artifacts = path.join(os.tmpdir(), 'padel-inscription-capacity')
mkdirSync(artifacts, { recursive: true })
const checked = async query => { const result = await query; if (result.error) throw new Error(result.error.message); return result.data }
const inscriptions = () => checked(service.from('inscriptions').select('*').eq('tournament_id', tid).order('created_at'))
const endpoint = `/api/tournaments/${tid}/inscriptions/payment`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  for (const role of ['CLUB','PLAYER']) {
    const email = `capacity-${randomUUID()}@example.invalid`, password = `LocalOnly-${randomUUID()}!`
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    users.push(created.data.user.id)
    await checked(service.from('users').upsert({ id: created.data.user.id, email, role }))
    const cookies = []
    const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: { getAll: () => [], setAll: values => cookies.push(...values) },
    })
    const login = await auth.auth.signInWithPassword({ email, password }); if (login.error) throw login.error
    const context = await browser.newContext({ viewport: { width: role === 'CLUB' ? 1280 : 390, height: 900 } })
    await context.addCookies(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: 'localhost', path: '/' })))
    contexts.push(context)
  }
  await checked(service.from('clubes').insert({ id: clubId, user_id: users[0], name: 'Local capacity QA', is_active: true }))
  const [baseTournament] = await checked(service.from('tournaments').select('*').eq('type','AMERICAN').limit(1))
  const [basePlayer] = await checked(service.from('players').select('*').limit(1))
  await checked(service.from('players').insert(players.map((id,index) => ({ ...basePlayer, id, user_id: index === 0 ? users[1] : null,
    dni: id, first_name: 'CapacityQA', last_name: `Jugador${index+1}`, phone: '+5491199990001', gender: 'MALE' }))))
  await checked(service.from('couples').insert(couples.map((id,index) => ({ id, player1_id: players[index*2], player2_id: players[index*2+1] }))))
  await checked(service.from('tournaments').insert({ ...baseTournament, id: tid, club_id: clubId, organization_id: null, organizador_id: null,
    name: 'LOCAL inscripción y cupos', seo_slug: tid, status: 'NOT_STARTED', type: 'AMERICAN', gender: 'MALE', is_draft: false,
    bracket_status: 'NOT_STARTED', registration_locked: false, registration_locked_by_capacity: false,
    max_participants: 1, enable_transfer_proof: true, reserve_slot_without_proof: false, validate_inscriptions: false,
    transfer_alias: 'local.capacity', transfer_amount: 100, allow_cash_payment: true, messages_enabled: false,
    start_date: new Date(Date.now()+86400000).toISOString(), end_date: new Date(Date.now()+172800000).toISOString() }))
  await checked(service.from('inscriptions').insert(couples.map((id,index) => ({ tournament_id: tid, couple_id: id, player_id: players[index*2], is_pending: false }))))
  let rows = await inscriptions()
  assert.equal(rows.filter(row => row.occupies_slot).length, 0)
  const organizer = await contexts[0].newPage(), player = await contexts[1].newPage()
  organizer.setDefaultNavigationTimeout(180000); player.setDefaultNavigationTimeout(180000)
  organizer.setDefaultTimeout(60000); player.setDefaultTimeout(60000)
  for (const page of [organizer,player]) page.on('pageerror',error => errors.push(error.message))
  await organizer.goto(`${baseUrl}/tournaments/${tid}/settings/inscripciones`)
  let policyWrites=0
  organizer.on('request',request=>{if(request.url().includes('/inscription-settings') && request.method()==='PATCH')policyWrites++})
  const savePolicy=async(expected)=>{
    const saved=organizer.waitForResponse(response=>response.url().includes('/inscription-settings') && response.request().method()==='PATCH')
    await organizer.getByRole('button',{name:'Guardar configuración',exact:true}).click()
    const response=await saved
    assert.equal(response.status(),200,await response.text())
    assert.deepEqual(Object.fromEntries(Object.keys(expected).map(key=>[key,response.request().postDataJSON()[key]])),expected)
  }
  await organizer.getByRole('radio',{name:'No solicitar seña',exact:true}).check()
  assert.equal(policyWrites,0,'Choices remain drafts until saved together')
  assert.equal((await checked(service.from('tournaments').select('enable_transfer_proof').eq('id',tid).single())).enable_transfer_proof,true)
  await savePolicy({enable_transfer_proof:false,reserve_slot_without_proof:true})
  assert.equal((await inscriptions()).filter(row=>row.occupies_slot).length,0,'Policy changes must not allocate previous requests')
  assert.equal(await organizer.getByRole('radio',{name:/Al aprobar la inscripción|Al adjuntar el comprobante/}).count(),0,'No deferred option without a later requirement')
  await organizer.getByRole('radio',{name:'Solicitar seña por transferencia',exact:true}).check()
  await organizer.getByRole('radio',{name:'No reserva hasta que carga el comprobante',exact:true}).check()
  await savePolicy({enable_transfer_proof:true,reserve_slot_without_proof:false})
  const policyGroup=organizer.getByRole('group',{name:'Seña y reserva de cupo',exact:true})
  await policyGroup.screenshot({path:path.join(artifacts,'settings-policy-desktop.png')})
  await organizer.setViewportSize({width:390,height:900})
  await policyGroup.screenshot({path:path.join(artifacts,'settings-policy-mobile.png')})
  const policyBox=await policyGroup.boundingBox()
  assert.ok(policyBox.x>=0 && policyBox.x+policyBox.width<=391,'Mobile policy fields overflow')
  await organizer.setViewportSize({width:1280,height:900})
  await player.goto(`${baseUrl}/tournaments/${tid}`)
  await player.getByRole('button', { name: 'Subir comprobante', exact: true }).first().click()
  let dialog = player.getByRole('dialog')
  await dialog.getByText('La inscripción está guardada, pero todavía no tiene cupo asignado.').waitFor()
  await dialog.screenshot({ path: path.join(artifacts, 'player-without-slot.png') })
  const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 391)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64')
  await dialog.locator('input[type=file]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png })
  const uploaded = player.waitForResponse(response=>response.url().includes(endpoint) && response.request().method()==='POST')
  await dialog.getByRole('button', { name: 'Subir comprobante', exact: true }).click()
  const uploadResponse = await uploaded
  assert.equal(uploadResponse.status(),200,await uploadResponse.text())
  // A confirmed registration can switch the player dashboard and unmount this
  // dialog. Verify the response and the persistent row rather than a stale modal.
  let first = (await inscriptions()).find(row => row.couple_id === couples[0])
  assert.equal(first.id, rows.find(row => row.couple_id === couples[0]).id); assert.equal(first.occupies_slot, true)
  objects.add(first.payment_proof_path)
  const second = rows.find(row => row.couple_id === couples[1])
  const upload = await contexts[0].request.post(`${baseUrl}${endpoint}`, { multipart: {
    operation: 'attach', inscriptionId: second.id, revision: String(second.payment_revision),
    proof: { name: 'paid-after-full.png', mimeType: 'image/png', buffer: png },
  } })
  assert.equal(upload.status(),200,await upload.text())
  rows = await inscriptions(); const full = rows.find(row => row.id === second.id)
  assert.equal(full.occupies_slot,false); assert.ok(full.payment_proof_path); objects.add(full.payment_proof_path)
  await organizer.goto(`${baseUrl}/tournaments/${tid}/inscriptions`)
  const notice = organizer.getByRole('region', { name: 'Inscripciones sin confirmar' }).first()
  await notice.getByText('Una pareja ya cargó el comprobante, pero sigue sin cupo. Revisá el pago antes de resolver.').waitFor()
  await notice.getByRole('button', { name: 'Resolver inscripciones', exact: true }).click()
  await organizer.screenshot({ path: path.join(artifacts, 'organizer-full.png'), fullPage: true })
  await notice.getByRole('listitem').filter({hasText:'Jugador5'}).getByRole('button', { name: 'Ver pago y comprobante', exact: true }).click()
  dialog = organizer.getByRole('dialog')
  assert.equal(await dialog.getByRole('button', { name: /^Asignar cupo sin comprobante/ }).isDisabled(),true)
  await organizer.keyboard.press('Escape')
  await checked(service.from('inscriptions').delete().eq('id',first.id))
  assert.equal((await inscriptions()).filter(row => row.occupies_slot).length,0, 'No automatic promotion')
  const assign = await contexts[0].request.post(`${baseUrl}${endpoint}`, { multipart: { operation: 'assign', inscriptionId: full.id, revision: String(full.payment_revision) } })
  assert.equal(assign.status(),200,await assign.text())
  assert.equal((await inscriptions()).find(row => row.id === full.id).occupies_slot,true)
  const readinessUrl = `${baseUrl}/api/tournaments/${tid}/inscriptions/readiness`
  const readiness = await (await contexts[0].request.get(readinessUrl)).json()
  assert.equal(readiness.excluded.length,1); assert.equal(readiness.eligibleCount,1)
  assert.ok(!JSON.stringify(readiness).includes('payment_proof_path'))
  const ack = await contexts[0].request.post(readinessUrl,{data:{signature:readiness.signature}})
  assert.equal(ack.status(),200); assert.equal((await ack.json()).acknowledged,true)
  const third = (await inscriptions()).find(row => row.couple_id === couples[2])
  await checked(service.from('tournaments').update({max_participants:2}).eq('id',tid))
  assert.equal((await contexts[0].request.post(readinessUrl,{data:{signature:readiness.signature}})).status(),409)
  assert.equal((await contexts[1].request.get(readinessUrl)).status(),403)
  // A tournament without a deposit registers directly, even from old clients.
  await checked(service.from('inscriptions').delete().eq('tournament_id',tid))
  await checked(service.from('tournaments').update({enable_transfer_proof:false,allow_cash_payment:false,reserve_slot_without_proof:false,validate_inscriptions:true,registration_locked:false}).eq('id',tid))
  await checked(service.from('inscriptions').insert({tournament_id:tid,couple_id:couples[0],player_id:players[0],is_pending:true}))
  let direct=(await inscriptions())[0]
  assert.equal(direct.occupies_slot,true); assert.equal(direct.is_pending,false)
  await player.goto(`${baseUrl}/tournaments/${tid}`)
  await player.getByText('Tu cupo está reservado',{exact:true}).first().waitFor()
  assert.equal(await player.getByRole('button',{name:/Subir comprobante|Ver detalles del pago/}).count(),0)
  await player.screenshot({path:path.join(artifacts,'player-no-payment.png'),fullPage:true})
  // With a requested deposit and immediate reservation, missing proof is payment
  // information only. It must not exclude the couple or add another admission.
  await checked(service.from('tournaments').update({enable_transfer_proof:true,reserve_slot_without_proof:true}).eq('id',tid))
  await checked(service.from('inscriptions').delete().eq('id',direct.id))
  await checked(service.from('inscriptions').insert({tournament_id:tid,couple_id:couples[0],player_id:players[0]}))
  direct=(await inscriptions())[0]
  assert.equal(direct.occupies_slot,true); assert.equal(direct.payment_proof_path,null)
  const readyWithPendingDeposit=await (await contexts[0].request.get(readinessUrl)).json()
  assert.equal(readyWithPendingDeposit.eligibleCount,1); assert.equal(readyWithPendingDeposit.excluded.length,0)
  await organizer.goto(`${baseUrl}/tournaments/${tid}/inscriptions`)
  await organizer.getByText('Confirmada · Cupo reservado',{exact:true}).first().waitFor()
  assert.equal(await organizer.getByRole('region',{name:'Inscripciones sin confirmar'}).count(),0)
  await organizer.getByRole('button',{name:'Sin comprobante',exact:true}).first().click()
  await organizer.getByRole('dialog').getByText('Cupo reservado',{exact:true}).waitFor()
  assert.equal(await organizer.getByRole('dialog').getByRole('button',{name:/Aprobar inscripción|Aprobar solicitud|Admitir sin comprobante|Asignar cupo sin comprobante/}).count(),0)
  await player.reload()
  await player.getByText('Tu cupo está reservado',{exact:true}).first().waitFor()
  await player.getByText('Tenés pendiente adjuntar el comprobante de la seña.',{exact:true}).first().waitFor()
  assert.equal(await player.getByText('Pendiente de comprobante',{exact:true}).count(),0)
  await player.screenshot({path:path.join(artifacts,'player-reserved-deposit.png'),fullPage:true})
  await organizer.goto(`${baseUrl}/tournaments/create`)
  await organizer.getByLabel('Nombre del torneo',{exact:true}).fill('LOCAL opción de cupo al crear')
  await organizer.getByRole('combobox').filter({hasText:'Selecciona una categoria'}).click()
  await organizer.getByRole('option',{name:/7ma/}).first().click()
  await organizer.getByRole('button',{name:'Siguiente',exact:true}).click()
  await organizer.getByLabel('Fecha de inicio',{exact:true}).fill(new Date(Date.now()+86400000).toISOString().slice(0,10))
  await organizer.locator('input[type=time]').fill('12:00')
  await organizer.getByRole('button',{name:'Siguiente',exact:true}).click()
  assert.equal(await organizer.getByRole('switch',{name:'Requerir aprobación del organizador',exact:true}).count(),0)
  assert.equal(await organizer.getByRole('radio',{name:'No reserva hasta que carga el comprobante',exact:true}).count(),0)
  await organizer.getByRole('radio',{name:'Solicitar seña por transferencia',exact:true}).check()
  assert.equal(await organizer.getByRole('radio',{name:'Reserva apenas se inscribe',exact:true}).isChecked(),true)
  await organizer.getByRole('radio',{name:'No reserva hasta que carga el comprobante',exact:true}).check()
  await organizer.getByLabel('Alias de transferencia',{exact:true}).fill('local.create')
  await organizer.getByLabel('Importe de la seña por pareja',{exact:true}).fill('100')
  await organizer.getByRole('radio',{name:'No solicitar seña',exact:true}).check()
  assert.equal(await organizer.getByLabel('Alias de transferencia',{exact:true}).count(),0)
  await organizer.getByRole('button',{name:'Volver',exact:true}).click()
  await organizer.getByRole('button',{name:'Siguiente',exact:true}).click()
  assert.equal(await organizer.getByRole('radio',{name:'No solicitar seña',exact:true}).isChecked(),true)
  assert.equal(await organizer.getByRole('radio',{name:'No reserva hasta que carga el comprobante',exact:true}).count(),0)
  await organizer.screenshot({path:path.join(artifacts,'creation-policy.png'),fullPage:true})
  const created=organizer.waitForResponse(response=>response.url().endsWith('/tournaments/create') && response.request().method()==='POST')
  await organizer.getByRole('button',{name:'Crear torneo',exact:true}).click()
  assert.equal((await created).status(),200)
  const createdRow=await checked(service.from('tournaments').select('id,enable_transfer_proof,reserve_slot_without_proof,validate_inscriptions').eq('club_id',clubId).eq('name','LOCAL opción de cupo al crear').single())
  assert.equal(createdRow.enable_transfer_proof,false); assert.equal(createdRow.reserve_slot_without_proof,true)
  assert.equal(createdRow.validate_inscriptions,false)
  assert.deepEqual(errors,[])
  console.log(`PASS local browser: creation and settings, preserved places, mobile receipt upload, full conflict saved, organizer attention, admission disabled, manual reassignment, stale review, authorization and no empty popup. Screenshots: ${artifacts}`)
} catch(error) {
  for (let index=0;index<contexts.length;index++) for (const page of contexts[index].pages()) await page.screenshot({path:path.join(artifacts,`failure-${index}.png`),fullPage:true}).catch(()=>{})
  throw new Error(String(error.message).split('\n').filter(line=>!line.includes('cookie:')).join('\n'))
} finally {
  await browser?.close()
  const current = await service.from('inscriptions').select('payment_proof_path').eq('tournament_id',tid)
  for (const row of current.data||[]) if(row.payment_proof_path) objects.add(row.payment_proof_path)
  await checked(service.from('inscriptions').delete().eq('tournament_id',tid))
  if(objects.size){await checked(service.storage.from('inscription-proofs').remove([...objects]));await checked(service.from('inscription_proof_cleanup').delete().in('path',[...objects]))}
  const ownedTournaments=await checked(service.from('tournaments').select('id').eq('club_id',clubId))
  const tournamentIds=ownedTournaments.map(row=>row.id)
  if(tournamentIds.length){
    const zones=await checked(service.from('zones').select('id').in('tournament_id',tournamentIds))
    if(zones.length){
      const zoneIds=zones.map(row=>row.id)
      await checked(service.from('zone_couples').delete().in('zone_id',zoneIds))
      await checked(service.from('zone_positions').delete().in('zone_id',zoneIds))
      await checked(service.from('zones').delete().in('id',zoneIds))
    }
    await checked(service.from('tournaments').delete().in('id',tournamentIds))
  }
  await checked(service.from('couples').delete().in('id',couples))
  await checked(service.from('players').delete().in('id',players))
  await checked(service.from('clubes').delete().eq('id',clubId))
  for(const id of users){await checked(service.from('users').delete().eq('id',id));await service.auth.admin.deleteUser(id)}
}
