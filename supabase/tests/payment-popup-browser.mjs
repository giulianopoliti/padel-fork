// LOCAL ONLY. Run against `npm run dev:elite -- --port 3100`.
// Uses synthetic accounts/receipts, disables messages, cleans only its own fixtures.
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
const env = dotenv.parse(readFileSync('.env.padel-elite.local'))
const baseUrl = process.env.PAYMENT_TEST_BASE_URL || 'http://localhost:3100'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname), 'Refusing remote database')
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname), 'Refusing remote app')
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const tid = randomUUID()
const cid = randomUUID()
const players = [randomUUID(), randomUUID()]
const users = []
const contexts = []
const objects = new Set()
const artifacts = path.join(os.tmpdir(), 'padel-payment-popup')
mkdirSync(artifacts, { recursive: true })
let browser
const checked = async query => { const result = await query; if (result.error) throw new Error(result.error.message); return result.data }
const read = () => checked(admin.from('inscriptions').select('*').eq('tournament_id', tid).single())
const api = `/api/tournaments/${tid}/inscriptions/payment`
const getPayment = async context => {
  const response = await context.request.get(`${baseUrl}${api}`)
  assert.equal(response.status(), 200)
  return (await response.json()).inscription
}
const openPayment = async page => {
  await page.getByRole('button', { name: /Subir comprobante|Ver comprobante|Modificar pago/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Tu inscripción está guardada y conserva el cupo.').waitFor()
  return dialog
}
try {
  const [baseTournament] = await checked(admin.from('tournaments').select('*').limit(1))
  const [basePlayer] = await checked(admin.from('players').select('*').limit(1))
  assert.ok(baseTournament && basePlayer, 'Local seed required')
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  for (let index = 0; index < 2; index += 1) {
    const password = `LocalOnly-${randomUUID()}!`
    const email = `popup-${randomUUID()}@test.invalid`
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    users.push(data.user.id)
    await checked(admin.from('users').upsert({ id: data.user.id, email, role: 'PLAYER' }))
    await checked(admin.from('players').insert({ ...basePlayer, id: players[index], user_id: data.user.id,
      dni: players[index], first_name: 'LocalPopup', last_name: `Test${index}`, phone: null }))
    const cookies = []
    const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: { getAll: () => [], setAll: values => cookies.push(...values) },
    })
    const signIn = await auth.auth.signInWithPassword({ email, password })
    if (signIn.error) throw signIn.error
    const context = await browser.newContext({ viewport: { width: index === 0 ? 1280 : 390, height: 844 } })
    await context.addCookies(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: 'localhost', path: '/' })))
    contexts.push(context)
  }
  await checked(admin.from('tournaments').insert({ ...baseTournament, id: tid, seo_slug: tid,
    name: 'LOCAL Popup pago', type: 'AMERICAN', gender: basePlayer.gender, status: 'NOT_STARTED', is_draft: false,
    start_date: new Date(Date.now() + 86400000).toISOString(), end_date: new Date(Date.now() + 86400000).toISOString(),
    max_participants: 1, enable_transfer_proof: true, allow_cash_payment: true, transfer_alias: 'local.test.alias',
    transfer_amount: 100, messages_enabled: false, enable_public_inscriptions: true, registration_locked: false }))
  await checked(admin.from('couples').insert({ id: cid, player1_id: players[0], player2_id: players[1] }))
  await checked(admin.from('inscriptions').insert({ tournament_id: tid, couple_id: cid, is_pending: false, es_prueba: false }))
  const page = await contexts[0].newPage()
  page.setDefaultTimeout(45000)
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(`${baseUrl}/tournaments/${tid}`)
  let dialog = await openPayment(page)
  assert.equal(await page.getByRole('dialog').count(), 1)
  await dialog.screenshot({ path: path.join(artifacts, 'desktop.png') })
  const before = await read()
  let posts = 0
  page.on('request', request => { if (request.url().includes(api) && request.method() === 'POST') posts += 1 })
  const pdf = { name: 'local-receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nLocal synthetic receipt\n%%EOF') }
  await dialog.locator('input[type=file]').setInputFiles(pdf)
  assert.equal(posts, 0, 'Selecting a file must not upload')
  assert.equal((await read()).payment_proof_path, before.payment_proof_path)
  await dialog.getByRole('button', { name: 'Subir comprobante', exact: true }).click()
  await dialog.getByText('Cambios guardados.').waitFor()
  assert.equal(posts, 1)
  objects.add((await read()).payment_proof_path)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  // Second member, mobile layout, same inscription and current server state.
  assert.equal((await getPayment(contexts[1])).id, before.id)
  const mobile = await contexts[1].newPage()
  mobile.setDefaultTimeout(45000)
  await mobile.goto(`${baseUrl}/tournaments/${tid}`)
  let mobileDialog = await openPayment(mobile)
  await mobileDialog.screenshot({ path: path.join(artifacts, 'mobile.png') })
  const box = await mobileDialog.boundingBox()
  assert.ok(box.x >= 0 && box.x + box.width <= 391, 'Mobile dialog overflows')
  // Closing an unsaved payment choice leaves server state unchanged.
  await mobileDialog.getByRole('radio', { name: 'Efectivo' }).check()
  await mobile.keyboard.press('Escape')
  await mobile.waitForFunction(id => document.activeElement?.getAttribute('data-payment-tournament') === id, tid)
  assert.equal((await read()).payment_method, 'TRANSFER')
  mobileDialog = await openPayment(mobile)
  await mobileDialog.locator('input[type=file]').setInputFiles({ name: 'replacement.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') })
  await mobileDialog.getByAltText('Vista previa del comprobante seleccionado').waitFor()
  await mobileDialog.getByRole('button', { name: 'Reemplazar comprobante', exact: true }).click()
  await mobileDialog.getByText('Cambios guardados.').waitFor()
  const replaced = await read()
  objects.add(replaced.payment_proof_path)
  assert.notEqual(replaced.payment_proof_path, [...objects][0])
  assert.equal(replaced.payment_proof_status, 'PENDING_REVIEW')
  await mobileDialog.getByRole('button', { name: 'Eliminar comprobante', exact: true }).click()
  await mobileDialog.getByText('Tu inscripción conserva el cupo y quedará pendiente de comprobante.').waitFor()
  await mobileDialog.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await mobileDialog.getByText('Cambios guardados.').waitFor()
  assert.equal((await read()).id, before.id)
  assert.equal((await read()).payment_proof_path, null)
  await mobileDialog.getByRole('radio', { name: 'Efectivo' }).check()
  const cashSaved = mobile.waitForResponse(response => response.url().includes(api) && response.request().method() === 'POST')
  await mobileDialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  assert.equal((await cashSaved).status(), 200)
  await mobileDialog.getByText('Abonás en efectivo al organizador.').waitFor()
  assert.equal((await read()).payment_method, 'CASH')
  await mobileDialog.getByRole('radio', { name: 'Transferencia' }).check()
  const transferSaved = mobile.waitForResponse(response => response.url().includes(api) && response.request().method() === 'POST')
  await mobileDialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  assert.equal((await transferSaved).status(), 200)
  await mobileDialog.getByText('Seleccionar comprobante', { exact: true }).waitFor()
  assert.equal((await read()).payment_method, 'TRANSFER')
  await mobile.keyboard.press('Escape')
  await mobile.reload()
  await mobile.getByRole('button', { name: 'Subir comprobante' }).waitFor()
  // /torneos must offer payment even though the tournament's single place is full.
  await page.goto(`${baseUrl}/torneos?search=LOCAL%20Popup%20pago`)
  await page.getByText('Ya estás inscripto', { exact: true }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'Inscribirme', exact: true }).count(), 0)
  dialog = await openPayment(page)
  assert.equal(await page.getByRole('dialog').count(), 1)
  await page.keyboard.press('Escape')
  await page.goto(`${baseUrl}/panel`)
  await page.getByRole('button', { name: 'Subir comprobante' }).first().waitFor()
  await openPayment(page)
  await page.keyboard.press('Escape')
  // Initial registration replaces its dialog with the same payment popup.
  await checked(admin.from('inscriptions').delete().eq('tournament_id', tid))
  await checked(admin.from('tournaments').update({ registration_locked: false }).eq('id', tid))
  await checked(admin.from('players').update({ phone: '+5491199990001' }).eq('id', players[0]))
  await page.goto(`${baseUrl}/tournaments/${tid}`)
  await page.getByRole('button', { name: 'Inscribirme', exact: true }).first().click()
  const registration = page.getByRole('dialog')
  await registration.getByRole('tab', { name: 'Ya está cargado' }).click()
  await registration.getByPlaceholder('Nombre o apellido del compañero').fill('LocalPopup Test1')
  await registration.getByRole('button', { name: 'Buscar compañero', exact: true }).click()
  await registration.getByText('LocalPopup Test1', { exact: true }).click()
  await registration.getByRole('checkbox').check()
  await registration.getByRole('button', { name: 'Guardar inscripción', exact: true }).click()
  await page.getByRole('dialog').getByRole('heading', { name: 'Pago de la inscripción' }).waitFor()
  assert.equal(await page.getByRole('dialog').count(), 1)
  await page.getByRole('dialog').getByText('Tu inscripción está guardada y conserva el cupo.').waitFor()
  await page.keyboard.press('Escape')
  // Manager's row opens the one shared popup; no inline upload fields.
  await checked(admin.from('users').update({ role: 'ADMIN' }).eq('id', users[1]))
  await mobile.goto(`${baseUrl}/tournaments/${tid}/inscriptions`)
  await mobile.getByRole('button', { name: 'Pendiente de comprobante', exact: true }).first().waitFor()
  assert.equal(await mobile.locator('input[type=file]').count(), 0)
  await mobile.getByRole('button', { name: 'Pendiente de comprobante', exact: true }).first().click()
  mobileDialog = mobile.getByRole('dialog')
  await mobileDialog.getByText('La inscripción de esta pareja está guardada y conserva el cupo.').waitFor()
  assert.equal(await mobile.getByRole('dialog').count(), 1)
  await mobileDialog.locator('input[type=file]').setInputFiles(pdf)
  await mobileDialog.getByRole('button', { name: 'Subir comprobante', exact: true }).click()
  await mobileDialog.getByText('Cambios guardados.').waitFor()
  objects.add((await read()).payment_proof_path)
  await mobile.keyboard.press('Escape')
  assert.deepEqual(pageErrors, [])
  console.log('PASS: desktop/mobile, both members, explicit PDF upload, replacement, removal, both payment changes, close without saving, reload, full /torneos, /panel, initial registration and manager row.')
  console.log(`Screenshots: ${artifacts}`)
} finally {
  await browser?.close()
  // Only this fixture; actual Storage deletion happens after confirmed row deletion.
  const current = await admin.from('inscriptions').select('payment_proof_path').eq('tournament_id', tid)
  for (const row of current.data || []) if (row.payment_proof_path) objects.add(row.payment_proof_path)
  await checked(admin.from('inscriptions').delete().eq('tournament_id', tid))
  if (objects.size) {
    await checked(admin.storage.from('inscription-proofs').remove([...objects]))
    await checked(admin.from('inscription_proof_cleanup').delete().in('path', [...objects]))
  }
  await checked(admin.from('couples').delete().eq('id', cid))
  await checked(admin.from('tournaments').delete().eq('id', tid))
  await checked(admin.from('players').delete().in('id', players))
  for (const id of users) { await checked(admin.from('users').delete().eq('id', id)); await admin.auth.admin.deleteUser(id) }
}
