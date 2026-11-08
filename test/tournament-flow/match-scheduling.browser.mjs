// Exercises the real scheduling matrix, selection hook and creation form with local fixtures.
// No remote database, authentication session or WhatsApp messages are used.
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('tsx'))('esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const output = path.join(os.tmpdir(), 'padel-match-scheduling-qa')
mkdirSync(output, { recursive: true })
const mocks = {
  '../actions': `
    export const createMatch = async (...args) => {
      window.__creates.push(args);
      return {success:true,data:{matchId:'created',couple1Id:args[1],couple2Id:args[2],status:'PENDING',
        timeSlotId:null,scheduledDate:null,scheduledStartTime:null,scheduledEndTime:null,courtAssignment:null}};
    };
    export const updateOrganizerCoupleAvailability = async input => ({success:true,data:{notes:input.notes}});
    export const updateMatchResult = async () => ({success:true});
    export const modifyMatchResult = async () => ({success:true});
    export const modifyMatchSchedule = async () => ({success:true});
  `,
  './ScheduledMatchesDataTable': 'export default function ScheduledMatchesDataTable(){return null}',
}

await build({
  bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json',
  outfile: path.join(output, 'scheduling.js'), define: { 'process.env.NODE_ENV': '"production"' },
  stdin: {
    resolveDir: process.cwd(), sourcefile: 'scheduling-qa.tsx', loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import SchedulingMatrix from '@/app/(main)/tournaments/[id]/match-scheduling/components/SchedulingMatrixV0';
      const root=createRoot(document.getElementById('root')); let revision=0;
      const names=['Ana','Belén','Carla','Diana','Elena','Flor'];
      window.resetScheduling=(withSlots=false)=>{
        window.__creates=[]; window.__refreshes=0; window.__copied=[];
        const couples=names.map((name,index)=>({id:String(index),player1:{name,last_name:'Pérez',phone:'+5491123456789'},
          player2:{name:name+' compañera',last_name:'López',phone:index===4?null:'+5491198765432'},
          zone_position:null,matches_in_fecha:0,has_played_in_this_date:false,match_status:null,
          free_date_blocked:index===5,free_date_notes:null,zone_match_counts:{played:index===0?3:0,draft:1,pending:2},
          opponent_statuses:index===0?{'1':'played','2':'draft'}:{}}));
        const timeSlots=withSlots?[{id:'slot',date:'2026-11-07',start_time:'18:00',end_time:'21:00',court_name:'Cancha 1',max_matches:2}]:[];
        const availability=withSlots?['0','1','2','3'].map(couple_id=>({couple_id,time_slot_id:'slot',is_available:true,notes:null})):[];
        window.__data={couples,timeSlots,availability,existingMatches:[],estimatedMatchDurationMinutes:90};
        window.renderScheduling=()=>root.render(<SchedulingMatrix key={++revision} fechaId="fecha" schedulingData={structuredClone(window.__data)}
          onMatchCreated={()=>{window.__refreshes++}} clubes={[]} />);
        window.renderScheduling();
      };
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied.push(text)}}});
      window.resetScheduling();
    `,
  },
  plugins: [{ name: 'isolated-services', setup(bundle) {
    bundle.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'qa-mock' } : undefined)
    bundle.onLoad({ filter: /.*/, namespace: 'qa-mock' }, args => ({ contents: mocks[args.path], loader: 'jsx' }))
  } }],
})

const css = readFileSync(process.env.SCHEDULING_QA_CSS || '.local/match-scheduling-preview.css', 'utf8')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
page.setDefaultTimeout(10000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const select = name => page.getByRole('button', { name: new RegExp('^Seleccionar pareja: ' + name + ' Pérez') })
const row = name => select(name).locator('xpath=ancestor::tr')
const handleSelect = name => row(name).locator('td').first().click({ position: { x: 6, y: 6 } })
const reset = async withSlots => {
  await page.evaluate(value => window.resetScheduling(value), withSlots)
  await select('Ana').waitFor()
  assert.equal(await select('Ana').getAttribute('aria-pressed'), 'false')
}

try {
  await page.setContent(`<html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`)
  await page.addScriptTag({ path: path.join(output, 'scheduling.js') })
  await select('Ana').waitFor()
  assert.equal(await page.getByRole('columnheader').count(), 1, 'No time slots: only the couples column exists')
  assert.equal(await page.locator('tbody tr').count(), 6)
  await row('Ana').getByLabel('3 jugados en toda la fase de zonas', { exact: true }).waitFor()
  await row('Ana').getByLabel('1 borrador en toda la fase de zonas', { exact: true }).waitFor()
  await row('Ana').getByLabel('2 pendientes en toda la fase de zonas', { exact: true }).waitFor()
  assert.doesNotMatch(await row('Ana').innerText(), /jugados|borrador|pendientes/, 'Counters show only balls and numbers')
  assert.equal(await page.getByText('Herramientas de organización', { exact: true }).count(), 0)
  const playerBounds = await row('Ana').getByRole('button', { name: /^Ver contacto/ }).evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top))
  assert.equal(playerBounds[0], playerBounds[1], 'Both players keep the original inline presentation')

  await page.getByRole('button', { name: 'Ver contacto de Ana Pérez', exact: true }).click()
  assert.equal(await select('Ana').getAttribute('aria-pressed'), 'false', 'Contact click must not select the couple')
  const chat = page.getByRole('link', { name: 'Abrir WhatsApp' })
  const url = new URL(await chat.getAttribute('href'))
  assert.equal(url.pathname, '/5491123456789')
  assert.equal(url.searchParams.get('text'), 'Buenas, te recuerdo que aun no cargaste tus horarios para el finde')
  await page.getByRole('button', { name: 'Copiar número', exact: true }).focus()
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'Copiado', exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.__copied), ['+5491123456789'])
  assert.equal(await select('Ana').getAttribute('aria-pressed'), 'false')
  await page.keyboard.press('Escape')
  await chat.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Ver contacto de Ana compañera López', exact: true }).click()
  assert.equal(new URL(await chat.getAttribute('href')).pathname, '/5491198765432')
  await page.keyboard.press('Escape')
  await chat.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Ver contacto de Elena compañera López', exact: true }).click()
  await page.getByText('Este jugador no tiene un teléfono cargado.').waitFor()
  await chat.waitFor({ state: 'detached' })
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Resaltar rivales', exact: true }).click()
  await select('Ana').focus()
  await page.keyboard.press('Space')
  assert.match(await row('Belén').getAttribute('class'), /bg-red-50/)
  assert.match(await row('Carla').getAttribute('class'), /bg-amber-50/)
  assert.match(await row('Diana').getAttribute('class'), /bg-emerald-50/)
  await page.screenshot({ path: path.join(output, 'no-slots-desktop.png'), fullPage: true })
  await handleSelect('Diana')
  assert.equal(await page.locator('#fecha').inputValue(), '', 'Do not default an unscheduled match to today')
  await page.getByRole('button', { name: 'Crear Partido', exact: true }).click()
  await page.waitForFunction(() => window.__creates.length === 1)
  assert.deepEqual(await page.evaluate(() => window.__creates[0].slice(0, 3)), ['fecha', '0', '3'])
  assert.equal(await page.evaluate(() => window.__creates[0][3]), undefined)
  assert.equal(await page.evaluate(() => window.__creates[0][4]), undefined)
  assert.equal(await page.evaluate(() => window.__refreshes), 1)

  await reset(true)
  assert.equal(await page.getByRole('columnheader').count(), 2)
  await page.getByRole('button', { name: 'Resaltar rivales', exact: true }).click()
  await handleSelect('Ana')
  assert.match(await row('Diana').getAttribute('class'), /bg-emerald-50/)
  assert.match(await row('Elena').getAttribute('class'), /bg-slate-50/)
  assert.equal(await row('Diana').locator('td.ring-emerald-500').count(), 1)
  await page.screenshot({ path: path.join(output, 'shared-slot-desktop.png'), fullPage: true })

  // A fresh server response must refresh totals and the opponent colors together.
  await page.evaluate(() => {
    window.__data.couples[0].zone_match_counts = {played:4,draft:0,pending:2};
    window.__data.couples[0].opponent_statuses['3']='played';
    window.renderScheduling();
  })
  await row('Ana').getByLabel('4 jugados en toda la fase de zonas', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Resaltar rivales', exact: true }).click()
  await handleSelect('Ana')
  assert.match(await row('Diana').getAttribute('class'), /bg-red-50/)

  await reset(false)
  await page.evaluate(() => {
    Object.assign(window.__data.couples[0], {has_played_in_this_date:true,match_status:'FINISHED'});
    Object.assign(window.__data.couples[1], {has_played_in_this_date:true,match_status:'DRAFT'});
    Object.assign(window.__data.couples[2], {has_played_in_this_date:true,match_status:'PENDING'});
    window.__data.couples[0].opponent_statuses['2']='pending';
    window.__data.existingMatches = [{
      id: 'first-match', couple1_id: '0', couple2_id: 'prior-rival', status: 'FINISHED',
      scheduled_date: '2026-11-07', scheduled_start_time: '10:00', scheduled_end_time: '11:30',
    }];
    window.renderScheduling();
  })
  await row('Ana').locator('td.bg-emerald-50').waitFor()
  assert.match(await row('Belén').getAttribute('class'), /bg-amber-50/)
  assert.match(await row('Carla').getAttribute('class'), /bg-blue-50/)
  await handleSelect('Ana')
  const notices = page.getByRole('status')
  await notices.getByText('Ana Pérez / Ana compañera López ya jugó en esta fecha.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Resaltar rivales', exact: true }).click()
  assert.match(await row('Ana').getAttribute('class'), /bg-emerald-50/, 'Selection preserves the finished-match color')
  assert.equal(await row('Ana').locator('td.ring-slate-600').count(), 1, 'Selection uses a border instead of the pending color')
  assert.match(await row('Belén').getAttribute('class'), /bg-red-50/, 'Previous opponent takes precedence over their draft assignment')
  assert.match(await row('Carla').getAttribute('class'), /bg-blue-50/, 'Published encounter is blue')
  assert.match(await row('Diana').getAttribute('class'), /bg-emerald-50/, 'A different opponent remains eligible')

  await handleSelect('Carla')
  await notices.getByText('Carla Pérez / Carla compañera López ya tiene un partido asignado en esta fecha.', { exact: true }).waitFor()
  const create = page.getByRole('button', { name: 'Crear Partido', exact: true })
  await create.click()
  await page.getByText(/ya se enfrentaron o tienen un cruce reservado/).waitFor()
  assert.equal(await page.evaluate(() => window.__creates.length), 0, 'A reserved pairing is still rejected')
  await handleSelect('Carla')

  await handleSelect('Belén')
  await notices.getByText('Belén Pérez / Belén compañera López tiene un partido en borrador en esta fecha.', { exact: true }).waitFor()
  await handleSelect('Belén')
  await handleSelect('Flor')
  await notices.getByText('Una o ambas parejas marcaron FECHA LIBRE.', { exact: true }).waitFor()
  await handleSelect('Flor')
  await handleSelect('Diana')
  assert.equal(await create.isEnabled(), true, 'The notice still allows creating another match')
  await page.locator('#fecha').fill('2026-11-07')
  await page.locator('#horaInicio').fill('15:00')
  await page.locator('#horaFin').fill('16:30')
  await page.screenshot({ path: path.join(output, 'assigned-couple-desktop.png'), fullPage: true })
  await create.click()
  await page.waitForFunction(() => window.__creates.length === 1)
  assert.deepEqual(await page.evaluate(() => window.__creates[0].slice(0, 3)), ['fecha', '0', '3'])
  assert.deepEqual(await page.evaluate(() => {
    const { date, startTime, endTime } = window.__creates[0][4]
    return { date, startTime, endTime }
  }), { date: '2026-11-07', startTime: '15:00', endTime: '16:30' })

  await reset(false)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(output, 'no-slots-mobile.png'), fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile document must not overflow')
  await reset(true)
  await page.screenshot({ path: path.join(output, 'shared-slot-mobile.png'), fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Wide matrix scrolls internally on mobile')
  await page.getByRole('button', { name: 'Ver contacto de Ana Pérez', exact: true }).click()
  await chat.waitFor()
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
  await page.screenshot({ path: path.join(output, 'contact-mobile.png'), fullPage: true })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, output, checks: ['no-slot matrix', 'keyboard selection', 'zone counters', 'opponent colors', 'shared windows', 'unscheduled creation', 'named notices', 'second match creation', 'duplicate pairing', 'both player contacts', 'clipboard', 'refresh', 'mobile layout'] }))
} finally {
  await browser.close()
}
