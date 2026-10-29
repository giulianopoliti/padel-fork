// Real organizer notice and confirmation dialogs; services are isolated.
// No tournament, payment, file or message is modified.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('tsx'))('esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const output = path.join(os.tmpdir(), 'padel-registration-readiness')
mkdirSync(output, { recursive: true })
const mocks = {
  'next/link': 'import React from "react"; export default ({children,...props})=>React.createElement("a",props,children)',
  'next/navigation': 'export const usePathname=()=>"/tournaments/qa/inscriptions"; export const useRouter=()=>({refresh(){}})',
  '@/contexts/user-context': 'export const useUser=()=>({user:{id:"qa-organizer"}})',
  './inscription-payment-dialog': 'export const usePaymentDialog=()=>target=>window.__pendingFixture.opened.push(target)',
}
await build({ bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json',
  outfile: path.join(output, 'notice.js'), define: { 'process.env.NODE_ENV': '"production"' },
  stdin: { resolveDir: process.cwd(), sourcefile: 'registration-notice-qa.tsx', loader: 'tsx', contents: `
    import React from 'react';import{createRoot}from'react-dom/client';import{SWRConfig}from'swr';
    import{RegistrationReadinessNotice}from'@/components/tournament/registration-readiness-notice';
    import{InscriptionPaymentPanel}from'@/components/tournament/inscription-payment-panel';
    const root=createRoot(document.getElementById('root'));let version=0;
    window.resetNotice=(mode='missing')=>{
      const hasProof=mode==='proof',confirmed=mode==='confirmed';
      window.__pendingFixture={operations:[],opened:[],fail:false,data:{
        tournamentId:'qa',occupied:confirmed?1:5,maximum:mode==='full'?5:confirmed?16:null,
        isFull:mode==='full',eligibleCount:confirmed?1:5,eligibleCoupleIds:[],
        pendingWithoutSlot:confirmed?0:1,proofWithoutSlot:hasProof?1:0,
        signature:'current',acknowledged:false,admissionsOpen:mode!=='closed',
        excluded:confirmed?[]:[{id:'11111111-1111-4111-8111-111111111111',coupleId:'couple',name:'Pareja de ejemplo',
          label:'Pendiente de cupo',hasProof,occupiesSlot:false,proofMissing:mode!=='no-deposit'&&!hasProof,revision:2}]
      }};
      root.render(<SWRConfig key={++version} value={{provider:()=>new Map(),dedupingInterval:0}}>
        <main className="mx-auto max-w-5xl p-4"><RegistrationReadinessNotice tournamentId="qa"/></main>
      </SWRConfig>);
    };
    window.resetPlayer=(mode='available')=>{
      window.__pendingFixture.player={success:true,tournamentName:'Torneo de ejemplo',
        settings:{cash:false,transfer:true,isFull:mode==='full'||mode==='proof-full',admissionsOpen:mode!=='closed'},
        inscription:{id:'qa-player',revision:0,method:'TRANSFER',proofRequired:true,hasProof:mode==='proof-full',proofStatus:'PENDING_REVIEW',occupiesSlot:mode==='reserved',isPending:false}};
      root.render(<SWRConfig key={++version} value={{provider:()=>new Map(),dedupingInterval:0}}>
        <main className="mx-auto max-w-2xl p-4"><div className="rounded-xl border bg-white p-5"><InscriptionPaymentPanel tournamentId="qa"/></div></main>
      </SWRConfig>);
    };
    window.fetch=async(url,options={})=>{
      const fixture=window.__pendingFixture;
      if(!options.method&&String(url).includes('/inscriptions/payment'))return new Response(JSON.stringify(fixture.player));
      if(!options.method)return new Response(JSON.stringify(fixture.data));
      const operation=options.method==='DELETE'?'discard':options.body instanceof FormData?options.body.get('operation'):'unexpected-action';
      fixture.operations.push(operation);
      if(fixture.fail){fixture.data.excluded=[];return new Response(JSON.stringify({message:'La inscripción cambió o ya fue resuelta.'}),{status:409})}
      if(operation!=='discard'){fixture.data.occupied++;fixture.data.eligibleCount++}
      fixture.data.excluded=[];
      return new Response(JSON.stringify({success:true}));
    };window.resetNotice();
  ` }, plugins: [{ name: 'isolated-readiness-services', setup(bundle) {
    bundle.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'qa' } : undefined)
    bundle.onLoad({ filter: /.*/, namespace: 'qa' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }))
  } }] })
const css = readFileSync(process.env.READINESS_QA_CSS || '.local/organizer-dialog-preview.css', 'utf8')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(10000)
const errors = []; page.on('pageerror', error => errors.push(error.message))
const region = () => page.getByRole('region', { name: 'Inscripciones sin confirmar' })
const reset = async mode => {
  await page.evaluate(mode => window.resetNotice(mode), mode)
  await page.getByRole('button', { name: 'Resolver inscripciones', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Resolver inscripciones', exact: true }).click()
}
const operations = () => page.evaluate(() => window.__pendingFixture.operations)
try {
  await page.setContent(`<html lang="es"><head><style>${css}</style></head><body class="bg-slate-50"><div id="root"></div></body></html>`)
  await page.addScriptTag({ path: path.join(output, 'notice.js') })
  await region().getByRole('button', { name: 'Resolver inscripciones', exact: true }).click()
  await region().getByText('No cargó el comprobante. Su inscripción todavía no está confirmada.', { exact: true }).waitFor()
  assert.equal(await region().getByRole('button', { name: /^Organizar solo con/ }).count(), 0)
  assert.equal(await region().getByText('También podés dejarlas pendientes', { exact: false }).count(), 0)
  await region().screenshot({ path: path.join(output, 'organizer-pending-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await region().screenshot({ path: path.join(output, 'organizer-pending-mobile.png') })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await region().getByRole('button', { name: /^Aceptar inscripción de/ }).click()
  const confirmation = page.getByRole('alertdialog')
  await confirmation.getByText('La aceptarás sin comprobante. Se conserva su forma de pago.', { exact: true }).waitFor()
  assert.deepEqual(await operations(), [])
  await confirmation.screenshot({ path: path.join(output, 'accept-confirmation-mobile.png') })
  await confirmation.getByRole('button', { name: 'Volver', exact: true }).click()
  assert.deepEqual(await operations(), [])
  await region().getByRole('button', { name: /^Aceptar inscripción de/ }).click()
  await confirmation.getByRole('button', { name: 'Aceptar inscripción', exact: true }).click()
  await page.getByText('Inscripción aceptada. La pareja ya tiene cupo y puede participar.', { exact: true }).waitFor()
  assert.deepEqual(await operations(), ['admit-without-proof'])
  await reset('missing')
  await region().getByRole('button', { name: /^Descartar inscripción de/ }).click()
  await confirmation.getByText('Se eliminará esta inscripción del listado del torneo. Esta acción no se puede deshacer.', { exact: true }).waitFor()
  assert.deepEqual(await operations(), [])
  await confirmation.getByRole('button', { name: 'Descartar inscripción', exact: true }).click()
  await page.getByText('Inscripción descartada. La pareja fue eliminada del listado.', { exact: true }).waitFor()
  assert.deepEqual(await operations(), ['discard'])
  await reset('full')
  assert.equal(await region().getByRole('button', { name: /^Aceptar inscripción de/ }).isDisabled(), true)
  assert.equal(await region().getByRole('button', { name: /^Descartar inscripción de/ }).isEnabled(), true)
  await reset('closed')
  assert.equal(await region().getByRole('button', { name: /^Aceptar inscripción de/ }).isDisabled(), true)
  await reset('proof')
  await region().getByText('Comprobante cargado. Su inscripción sigue sin confirmar porque no tiene cupo.', { exact: true }).waitFor()
  await region().getByRole('button', { name: 'Ver pago y comprobante', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__pendingFixture.opened[0].manager), true)
  await region().getByRole('button', { name: /^Aceptar inscripción de/ }).click()
  await confirmation.getByRole('button', { name: 'Aceptar inscripción', exact: true }).click()
  await page.getByText('Inscripción aceptada. La pareja ya tiene cupo y puede participar.', { exact: true }).waitFor()
  assert.deepEqual(await operations(), ['assign'])
  await reset('no-deposit')
  await region().getByText('Su inscripción todavía no está confirmada: falta asignarle un cupo.', { exact: true }).waitFor()
  assert.equal(await region().getByText('No cargó el comprobante.', { exact: false }).count(), 0)
  assert.equal(await region().getByRole('button', { name: /^Organizar solo con/ }).count(), 0)
  await reset('missing')
  await page.evaluate(() => { window.__pendingFixture.fail = true })
  await region().getByRole('button', { name: /^Descartar inscripción de/ }).click()
  await confirmation.getByRole('button', { name: 'Descartar inscripción', exact: true }).click()
  await page.getByText('La inscripción cambió o ya fue resuelta.', { exact: true }).waitFor()
  await page.evaluate(() => window.resetNotice('confirmed'))
  await page.getByText('1 pareja confirmada · 15 cupos disponibles', { exact: true }).waitFor()
  assert.equal(await region().count(), 0)
  await page.evaluate(() => window.resetPlayer('available'))
  const availableMessage = 'Tu inscripción se confirmará cuando cargues el comprobante. En este momento hay lugar, pero no está reservado y puede ocuparse antes de que lo subas.'
  await page.getByText(availableMessage, { exact: true }).waitFor()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.locator('main').screenshot({ path: path.join(output, 'player-available-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('main').screenshot({ path: path.join(output, 'player-available-mobile.png') })
  assert.equal(await page.getByRole('button', { name: 'Subir comprobante', exact: true }).isVisible(), true)
  await page.evaluate(() => { window.__pendingFixture.player.settings.isFull = true; window.dispatchEvent(new Event('online')) })
  await page.getByText('El torneo está completo y tu inscripción sigue sin confirmar. No transfieras.', { exact: false }).waitFor()
  assert.equal(await page.getByText(availableMessage, { exact: true }).count(), 0, 'Refreshing must replace old available-place copy')
  await page.locator('main').screenshot({ path: path.join(output, 'player-full-mobile.png') })
  assert.equal(await page.getByRole('button', { name: 'Subir comprobante', exact: true }).isVisible(), true)
  await page.evaluate(() => { window.__pendingFixture.player.settings.admissionsOpen = false; window.dispatchEvent(new Event('online')) })
  await page.getByText('Las inscripciones están cerradas. No transfieras.', { exact: false }).waitFor()
  await page.evaluate(() => window.resetPlayer('proof-full'))
  await page.getByText('Recibimos tu comprobante, pero el torneo está completo', { exact: false }).waitFor()
  assert.equal(await page.getByText(availableMessage, { exact: true }).count(), 0)
  await page.evaluate(() => window.resetPlayer('reserved'))
  await page.getByText('Tu cupo está reservado', { exact: true }).waitFor()
  assert.ok(!/\d+ cupos/.test(await page.locator('main').innerText()))
  assert.deepEqual(errors, [])
  console.log(`PASS organizer accept/discard without skip action; player messages reflect refreshed capacity, full/closed admissions, reserved place and existing proof without exposing counts; desktop/mobile. Preview: ${output}`)
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
  console.error(JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 2500) }))
  throw error
} finally { await browser.close() }
