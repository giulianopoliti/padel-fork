// LOCAL ONLY; synthetic accounts, no messages. Cleans its fixtures and restores settings.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
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
if (process.env.BILLING_TEST_KONG_CONTAINER) {
  const config = execFileSync('docker', ['exec', process.env.BILLING_TEST_KONG_CONTAINER, 'cat', '/home/kong/kong.yml'], { encoding: 'utf8' })
  const keys = [...new Set(config.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g))]
  const role = key => JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role
  env.SUPABASE_SERVICE_ROLE_KEY = keys.find(key => role(key) === 'service_role')
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = keys.find(key => role(key) === 'anon')
  assert.ok(env.SUPABASE_SERVICE_ROLE_KEY && env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
const dbUrl = process.env.BILLING_TEST_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const baseUrl = process.env.BILLING_TEST_BASE_URL || 'http://localhost:3118'
for (const url of [dbUrl, baseUrl]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Refusing remote target')
const admin = createClient(dbUrl, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const checked = async query => { const result = await query; if (result.error) throw new Error(JSON.stringify(result.error)); return result.data }
const accounts = [], contexts = []
const artifacts = path.join(os.tmpdir(), 'tpe-billing-qa')
mkdirSync(artifacts, { recursive: true })
const tournamentId = randomUUID(), title = `LOCAL QA Cobro ${tournamentId}`
const pendingTournamentId = randomUUID()
let browser, organizationId, oldNotice, oldSettings
try {
  organizationId = (await checked(admin.from('organizaciones').select('id').eq('slug', 'padel-elite').single())).id
  oldNotice = await checked(admin.from('tenant_billing_notices').select('*').eq('organization_id', organizationId).maybeSingle())
  oldSettings = await checked(admin.from('tenant_billing_settings').select('*').eq('organization_id', organizationId).single())
  await checked(admin.from('tenant_billing_notices').upsert({ organization_id: organizationId, enabled: false }))
  await checked(admin.from('tenant_billing_settings').update({ tpe_amount_per_player: 500 }).eq('organization_id', organizationId))
  const [base] = await checked(admin.from('tournaments').select('*').limit(1))
  await checked(admin.from('tournaments').insert({ ...base, id: tournamentId, seo_slug: tournamentId, name: title,
    type: 'AMERICAN', status: 'NOT_STARTED', organization_id: organizationId, es_prueba: false,
    start_date: '2026-10-23T18:00:00Z', end_date: '2026-10-23T23:00:00Z', messages_enabled: false }))
  // A closed historical snapshot must remain identical for admin and organizer.
  await checked(admin.from('tournament_billing_charges').insert({ tournament_id: tournamentId, organization_id: organizationId,
    billing_model: 'TPE_PLAYER', status: 'PAID', billable_units: 12, pricing_rule: 'TPE_PER_PLAYER', unit_amount_ars: 500,
    amount_ars: 6000, period_start: '2026-10-19', period_end: '2026-10-25', resolved_at: '2026-10-23T18:00:00Z' }))
  await checked(admin.from('tournaments').insert({ ...base, id: pendingTournamentId, seo_slug: pendingTournamentId, name: `LOCAL QA Pendiente ${pendingTournamentId}`,
    type: 'AMERICAN', status: 'NOT_STARTED', organization_id: organizationId, es_prueba: false,
    start_date: '2026-10-13T18:00:00Z', end_date: '2026-10-13T23:00:00Z', messages_enabled: false }))
  const billablePlayers = await checked(admin.from('players').select('id').eq('es_prueba', false).limit(2))
  assert.equal(billablePlayers.length, 2, 'Two local billable players required')
  await checked(admin.from('inscriptions').insert(billablePlayers.map(player => ({ tournament_id: pendingTournamentId, player_id: player.id, es_prueba: false }))))
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  for (const role of ['ADMIN', 'ORGANIZADOR', 'PLAYER']) {
    const email = `billing-${randomUUID()}@test.invalid`, password = `Local-${randomUUID()}!`
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    accounts.push(data.user.id)
    await checked(admin.from('users').upsert({ id: data.user.id, email, role }))
    if (role === 'ORGANIZADOR') await checked(admin.from('organization_members').insert({ user_id: data.user.id, organizacion_id: organizationId, member_role: 'owner', is_active: true }))
    const cookies = []
    const auth = createServerClient(dbUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [], setAll: values => cookies.push(...values) } })
    const login = await auth.auth.signInWithPassword({ email, password })
    if (login.error) throw login.error
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await context.addCookies(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: 'localhost', path: '/' })))
    contexts.push(context)
  }
  const [adminContext, organizerContext, playerContext] = contexts
  const api = '/api/billing/notice'
  const guest = await browser.newContext()
  assert.equal((await guest.request.get(`${baseUrl}${api}`)).status(), 401)
  assert.equal((await playerContext.request.get(`${baseUrl}${api}`)).status(), 403)
  const adminPage = await adminContext.newPage()
  adminPage.setDefaultTimeout(60000)
  await adminPage.goto(`${baseUrl}/admin/cobros?week=2026-10-19`)
  const toggle = adminPage.getByRole('switch', { name: 'Mostrar aviso de pago' })
  await toggle.waitFor()
  // Wait for hydration so a click on the SSR switch has a React handler.
  await adminPage.waitForFunction(() => { const el = document.getElementById('billing-notice-enabled'); return el && Object.keys(el).some(key => key.startsWith('__reactProps$')) })
  assert.equal(await toggle.isChecked(), false)
  await toggle.click()
  await adminPage.getByText('Aviso activado para el organizador de TPE.').waitFor()
  const adminRow = adminPage.getByRole('row').filter({ hasText: title })
  const adminCells = await adminRow.getByRole('cell').allTextContents()
  assert.ok(adminCells.some(cell => cell.includes('500')) && adminCells.some(cell => cell.includes('6.000')))
  const page = await organizerContext.newPage()
  page.setDefaultTimeout(60000)
  await page.goto(`${baseUrl}/panel`)
  await page.getByRole('dialog').getByRole('heading', { name: 'Regularizá tu cuota' }).waitFor()
  await page.screenshot({ path: path.join(artifacts, 'notice-desktop.png') })
  await page.getByRole('dialog').getByRole('link', { name: 'Ir a Cobros' }).click()
  await page.getByRole('heading', { name: 'Cobros', exact: true }).waitFor()
  await page.goto(`${baseUrl}/cobros?week=2026-10-19`)
  await page.getByText('Julivaldez94', { exact: true }).waitFor()
  const pendingHeading = page.getByRole('heading', { name: /\d+ semanas? pendientes? de pago/ })
  await pendingHeading.waitFor()
  const pendingSummary = await pendingHeading.textContent()
  await page.getByText('Ver semanas pendientes', { exact: true }).click()
  await page.getByRole('link', { name: /12\/10\/2026 al 18\/10\/2026/ }).waitFor()
  await page.getByText('Ver semanas pendientes', { exact: true }).click()
  const organizerRow = page.getByRole('row').filter({ hasText: title })
  await organizerRow.waitFor()
  assert.deepEqual(await organizerRow.getByRole('cell').allTextContents(), adminCells.slice(1, -1), 'Same billing detail without selection or actions')
  assert.equal(await page.getByRole('checkbox').count(), 0)
  assert.equal(await page.getByRole('button', { name: /Guardar tarifas|Marcar|Descartar|Crear cobro|Registrar pago/ }).count(), 0)
  assert.equal(await page.getByRole('spinbutton').count(), 0)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click()
  const download = await downloadPromise
  await download.saveAs(path.join(artifacts, 'cobros-semana.pdf'))
  assert.equal(readFileSync(path.join(artifacts, 'cobros-semana.pdf')).subarray(0, 5).toString(), '%PDF-')
  assert.ok(readFileSync(path.join(artifacts, 'cobros-semana.pdf')).toString().includes('Julivaldez94'), 'PDF includes transfer alias')
  await page.getByRole('button', { name: 'Semana anterior', exact: true }).click()
  await page.waitForURL('**/cobros?week=2026-10-12')
  assert.equal(new URL(page.url()).pathname, '/cobros')
  await page.getByRole('heading', { name: pendingSummary, exact: true }).waitFor()
  await page.goto(`${baseUrl}/cobros?week=2026-10-19`)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(artifacts, 'cobros-mobile.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  await toggle.click()
  await adminPage.getByText('Aviso desactivado.').waitFor()
  assert.equal((await (await organizerContext.request.get(`${baseUrl}${api}`)).json()).enabled, false)
  await page.goto(`${baseUrl}/panel`)
  await page.getByRole('navigation', { name: 'Navegación principal', includeHidden: true }).waitFor({ state: 'attached' })
  assert.equal(await page.getByRole('complementary', { name: 'Aviso de pago del servicio' }).count(), 0)
  console.log(JSON.stringify({ result: 'PASS', checks: ['manual switch on/off', 'organizer dialog', 'same billing detail', '500 ARS/player', 'historical totals', 'read-only controls', 'alias on page and PDF', 'global pending weeks and links', 'PDF download', 'week navigation', 'mobile layout', 'player denied'], artifacts }))
  await guest.close()
} finally {
  await admin.from('inscriptions').delete().eq('tournament_id', pendingTournamentId)
  await admin.from('tournaments').delete().eq('id', pendingTournamentId)
  await admin.from('tournament_billing_charges').delete().eq('tournament_id', tournamentId)
  await admin.from('tournaments').delete().eq('id', tournamentId)
  if (organizationId && oldSettings) await admin.from('tenant_billing_settings').update({ tpe_amount_per_player: oldSettings.tpe_amount_per_player }).eq('organization_id', organizationId)
  if (organizationId) await admin.from('tenant_billing_notices').upsert({ organization_id: organizationId, enabled: oldNotice?.enabled ?? false })
  for (const userId of accounts) {
    await admin.from('organization_members').delete().eq('user_id', userId)
    await admin.from('users').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
  }
  for (const context of contexts) await context.close()
  await browser?.close()
}
