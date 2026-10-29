// Exercises the real dialog with isolated network/auth/router substitutes.
// No server, Supabase account, messages or tournament data are touched.
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {build}=createRequire(require.resolve('tsx'))('esbuild')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright')
const output=path.join(os.tmpdir(),'padel-organizer-payment-dialog')
mkdirSync(output,{recursive:true})
const mocks={
  'next/navigation':'export const useRouter=()=>({refresh(){}})',
  '@/contexts/user-context':'export const useUser=()=>({user:{id:"qa-organizer"}})',
  './inscription-payment-panel':'export const paymentFetcher=async()=>structuredClone(window.__dialogFixture.data)',
  '@/lib/tournaments/prepare-inscription-proof':'export const prepareInscriptionProof=async file=>file',
  '@/lib/tournaments/open-inscription-proof':'export const openInscriptionProof=async()=>{}',
  '@/lib/tournaments/registration-diagnostics':`
    export const createRegistrationAttemptId=()=>"qa-dialog";
    export const reportRegistrationClientError=()=>{};
    export const registrationErrorMessage=message=>message;
    export const fetchRegistrationJson=async(_url,options)=>{
      const fixture=window.__dialogFixture, operation=options.body.get('operation');
      fixture.operations.push(operation);
      let row={...fixture.data.inscription,revision:fixture.data.inscription.revision+1};
      const canClaim=!fixture.data.settings.isFull && fixture.data.settings.admissionsOpen;
      if(operation==='cash')row={...row,method:'CASH',hasProof:false,proofStatus:'NOT_REQUIRED',proofRequired:false,occupiesSlot:row.occupiesSlot||canClaim};
      if(operation==='transfer')row={...row,method:'TRANSFER',hasProof:false,proofRequired:true};
      if(operation==='attach'||operation==='replace')row={...row,hasProof:true,proofStatus:'PENDING_REVIEW',occupiesSlot:row.occupiesSlot||canClaim};
      if(operation==='admit-without-proof'||operation==='assign')row={...row,occupiesSlot:canClaim,proofWaived:operation==='admit-without-proof',proofRequired:operation!=='admit-without-proof'};
      if(operation==='approve-proof')row.proofStatus='APPROVED';
      if(operation==='remove')row={...row,hasProof:false,proofStatus:'NOT_REQUIRED'};
      row.confirmed=row.occupiesSlot;row.registrationLabel=row.occupiesSlot?'Confirmada':'Pendiente de cupo';
      fixture.data={...fixture.data,inscription:row};
      return {response:{status:200,ok:true},data:{success:true,inscription:row}};
    };
  `,
}
await build({bundle:true,platform:'browser',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json',
  outfile:path.join(output,'dialog.js'),define:{'process.env.NODE_ENV':'"production"'},
  stdin:{resolveDir:process.cwd(),sourcefile:'organizer-dialog-qa.tsx',loader:'tsx',contents:`
    import React from 'react';import{createRoot}from'react-dom/client';import{SWRConfig}from'swr';
    import{OrganizerInscriptionPaymentDialog}from'@/components/tournament/organizer-inscription-payment-dialog';
    const root=createRoot(document.getElementById('root'));let revision=0;
    window.resetDialog=(mode='waiting')=>{
      const hasProof=mode==='proof', hasPlace=mode==='reserved'||hasProof||mode==='cash';
      window.__dialogFixture={operations:[],data:{manager:true,tournamentName:'Americano de ejemplo',
        settings:{cash:false,transfer:true,alias:'club.ejemplo',amount:15000,isFull:mode==='full',admissionsOpen:true},
        inscription:{id:'qa-inscription',method:mode==='cash'?'CASH':'TRANSFER',hasProof,
          proofStatus:hasProof?'PENDING_REVIEW':'NOT_REQUIRED',proofRequired:mode!=='cash',
          occupiesSlot:hasPlace,isPending:false,revision:0,alias:'club.ejemplo',amount:15000,
          registrationLabel:hasPlace?'Confirmada':'Pendiente de cupo',confirmed:hasPlace}}};
      root.render(<SWRConfig key={++revision} value={{provider:()=>new Map(),dedupingInterval:0}}>
        <OrganizerInscriptionPaymentDialog target={{tournamentId:'qa-tournament',inscriptionId:'qa-inscription',tournamentName:'Americano de ejemplo',manager:true}}
          open={true} onOpenChange={()=>{}} onCloseAutoFocus={()=>{}} />
      </SWRConfig>);
    };window.resetDialog();
  `},plugins:[{name:'isolated-dialog-services',setup(bundle){
    bundle.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'qa-mock'}:undefined)
    bundle.onLoad({filter:/.*/,namespace:'qa-mock'},args=>({contents:mocks[args.path],loader:'js'}))
  }}]})
const css=readFileSync(process.env.DIALOG_QA_CSS||'.local/organizer-dialog-preview.css','utf8')
const browser=await chromium.launch({headless:true,channel:'chrome'})
const page=await browser.newPage({viewport:{width:1280,height:900}})
page.setDefaultTimeout(10000)
const failures=[];page.on('pageerror',error=>failures.push(error.message))
const dialog=()=>page.getByRole('dialog')
const reset=async mode=>{await page.evaluate(mode=>window.resetDialog(mode),mode);await dialog().getByText(mode==='waiting'||mode==='full'?'Sin cupo reservado':'Cupo reservado',{exact:true}).waitFor()}
const operations=()=>page.evaluate(()=>window.__dialogFixture.operations)
try{
  await page.setContent(`<html lang="es"><head><style>${css}</style></head><body><div id="root"></div></body></html>`)
  await page.addScriptTag({path:path.join(output,'dialog.js')})
  await dialog().getByText('Sin cupo reservado',{exact:true}).waitFor()
  assert.equal(await dialog().getByRole('button',{name:/^Paga en efectivo/}).isEnabled(),true)
  assert.equal(await dialog().locator('input[type=file]').count(),0,'File controls should open only after choosing upload')
  await dialog().screenshot({path:path.join(output,'organizer-dialog-desktop.png')})
  await page.setViewportSize({width:390,height:844})
  await dialog().screenshot({path:path.join(output,'organizer-dialog-mobile.png')})
  const box=await dialog().boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391)
  await dialog().getByRole('button',{name:/^Paga en efectivo/}).click()
  await dialog().getByText('Cupo reservado',{exact:true}).waitFor()
  assert.deepEqual(await operations(),['cash'])
  assert.equal(await page.evaluate(()=>window.__dialogFixture.data.settings.cash),false)
  await reset('waiting')
  await dialog().getByRole('button',{name:/^Cargar comprobante/}).click()
  await dialog().locator('input[type=file]').setInputFiles({name:'transferencia.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 fixture')})
  await dialog().getByRole('button',{name:'Cargar comprobante',exact:true}).click()
  await dialog().getByRole('button',{name:'Aprobar comprobante',exact:true}).waitFor()
  assert.deepEqual(await operations(),['attach'])
  await dialog().getByRole('button',{name:'Aprobar comprobante',exact:true}).click()
  await dialog().getByText('Comprobante aprobado',{exact:true}).waitFor()
  assert.deepEqual(await operations(),['attach','approve-proof'])
  await reset('waiting')
  await dialog().getByRole('button',{name:/^Asignar cupo sin comprobante/}).click()
  await dialog().getByText('Cupo reservado',{exact:true}).waitFor()
  assert.deepEqual(await operations(),['admit-without-proof'])
  assert.equal(await page.evaluate(()=>window.__dialogFixture.data.inscription.method),'TRANSFER')
  await reset('proof')
  await dialog().getByRole('button',{name:/^Paga en efectivo/}).click()
  assert.deepEqual(await operations(),[],'An existing proof needs explicit confirmation before switching to cash')
  await dialog().getByRole('button',{name:'Confirmar',exact:true}).click()
  await dialog().getByText('La pareja paga en efectivo.',{exact:true}).waitFor()
  assert.deepEqual(await operations(),['cash'])
  await reset('cash')
  await dialog().getByRole('button',{name:/^Cargar comprobante/}).click()
  await dialog().getByRole('button',{name:'Usar transferencia',exact:true}).click()
  await dialog().locator('input[type=file]').waitFor()
  assert.deepEqual(await operations(),['transfer'])
  await reset('full')
  assert.equal(await dialog().getByRole('button',{name:/^Asignar cupo sin comprobante/}).isEnabled(),false)
  await dialog().getByRole('button',{name:/^Paga en efectivo/}).click()
  await dialog().getByText('La pareja paga en efectivo.',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.__dialogFixture.data.inscription.occupiesSlot),false)
  assert.deepEqual(failures,[])
  console.log(`PASS real organizer dialog: three actions, organizer cash override, receipt upload/review, place exception, confirmation before replacing a proof, transfer switch, full capacity and mobile layout. Preview: ${output}`)
}catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error}
finally{await browser.close()}
