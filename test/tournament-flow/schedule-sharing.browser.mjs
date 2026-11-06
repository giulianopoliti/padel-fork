// Browser regression for the wizard, slot editor and bracket scheduling dialog with stubbed Server Actions.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('tsx'))('esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const output = path.join(os.tmpdir(), 'padel-schedule-sharing-qa')
mkdirSync(output, { recursive: true })
const bundle = path.join(output, 'wizard.js')
const css = readFileSync(process.env.SCHEDULE_SHARING_QA_CSS, 'utf8')

const mocks = {
  'next/navigation': `
    export const useRouter = () => ({push: path => window.destination = path});
    export const usePathname = () => window.location.pathname;
    export const useSearchParams = () => new URLSearchParams(window.location.search);
  `,
  'next/link': 'import { createElement } from "react"; export default props => createElement("a", props);',
  '@supabase/auth-helpers-nextjs': 'export const createClientComponentClient = () => { throw new Error("Unexpected Supabase client"); };',
  '../../../schedule-management/actions': `
    export const getAvailableScheduleRoundOptions = async () => ({success: true, data: [{roundType: 'ZONE', bracketKey: 'MAIN'}]});
    export const createTournamentFecha = () => {};
    export const updateTournamentFecha = () => {};
    export const deleteTournamentFecha = () => {};
    export const getScheduleData = async () => ({success: true, data: {timeSlots: []}});
    export const createTimeSlot = () => {};
  `,
  '../../actions': 'export const updateTimeSlot = () => {}; export const deleteTimeSlot = () => {};',
  '@/lib/services/schedule-sharing/reader': `
    export const listScheduleWorkspace = async () => window.workspaceData;
    export const scheduleWorkspaceFilterSchema = {safeParse: () => ({success: true, data: {}})};
  `,
  '../actions': `
    export const getBracketMatchFechaOptions = async () => ({ success: true, data: {
      fechas: window.bracketFechas, currentFechaId: null, currentClubId: null,
    } });
    export const modifyMatchSchedule = async payload => {
      window.bracketSchedule = payload;
      return { success: true };
    };
    export const loadScheduleDestinationOptionsAction = async ids => ({ success: true, data: ids.map(tournament_id => ({
      tournament_id, rounds: [{ round_type: 'ZONE', bracket_key: 'MAIN' }, tournament_id === 'a'
        ? { round_type: '8VOS', bracket_key: 'MAIN' } : { round_type: '4TOS', bracket_key: 'GOLD' }],
      fechas: window.shareSource && tournament_id === 'b' ? [{...window.shareSource.fecha, id: 'existing-b', tournament_id, name: 'Fecha existente'}] : [],
    })) });
    export const previewScheduleBatchAction = async payload => {
      window.previews.push(payload);
      return { success: true, data: { revision: 'qa-revision', preview: {
        can_commit: true, physical_slots_to_create: payload.slots.length * payload.destinations.length, physical_slots_to_reuse: 0,
        destinations: payload.destinations.map(({tournament_id}) => ({ tournament_id, fecha_id: null, fecha_number: 1,
          transition_to_zone_phase: true, preserves_local_metadata: false, new_slots: payload.slots, reused_slots: [], conflicts: [] })),
      } } };
    };
    export const commitScheduleBatchAction = async (payload, revision) => {
      window.commits.push({payload, revision});
      if (window.commits.length === 1) throw new Error('lost response');
      return { success: true, data: { group_id: 'qa-group' } };
    };
  `,
}

await build({
  bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json', outfile: bundle,
  define: { 'process.env.NODE_ENV': '"production"' },
  stdin: {
    resolveDir: process.cwd(), sourcefile: 'schedule-sharing-qa.tsx', loader: 'tsx', contents: `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import { ScheduleWizard } from '@/app/(main)/schedules/new/wizard';
      import ModifyScheduleDialog from '@/app/(main)/tournaments/[id]/match-scheduling/components/ModifyScheduleDialog';
      import OrganizerScheduleView from '@/app/(main)/tournaments/[id]/schedules/components/organizer/OrganizerScheduleView';
      import ScheduleWorkspace from '@/app/(main)/schedules/page';
      window.previews = []; window.commits = [];
      const clubs = [{id: 'a', name: 'Club A'}, {id: 'b', name: 'Club B'}];
      const tournaments = clubs.map(({id}, i) => ({id, club_id: id, name: 'Torneo ' + (i + 1),
        category_name: 'Cuarta', status: 'NOT_STARTED', eligible: true}));
      const fecha = {id: 'origin', tournament_id: 'a', fecha_number: 1, name: 'Fecha de origen de prueba',
        start_date: '2099-11-06', end_date: '2099-11-08', status: 'NOT_STARTED', description: null,
        round_type: 'ZONE', bracket_key: 'MAIN', estimated_match_duration_minutes: 90, max_matches_per_couple: null};
      const root = createRoot(document.getElementById('root'));
      if (window.testFechaManager) {
        root.render(<OrganizerScheduleView fechas={[fecha]} initialSelectedFechaId="origin" tournamentId="a"
          tournamentName="Torneo 1" clubName="Club A" userRole="ORGANIZADOR" canShare />);
      } else if (window.testWorkspace) {
        const entry = {name: 'Fecha 1', start_date: fecha.start_date, end_date: fecha.end_date, slot_count: 2, club_ids: ['a']};
        window.workspaceData = {scope: {clubs, tournaments}, filters: {page: 1, period: 'all'}, total: 2, pageSize: 20,
          entries: [{...entry, id: 'shared', kind: 'GROUP', distribution_state: 'COMPLETE', tournament_count: 2, tournament_ids: ['a', 'b']},
            {...entry, id: 'origin', kind: 'INDIVIDUAL', distribution_state: 'INDIVIDUAL', tournament_count: 1, tournament_ids: ['a']}]};
        ScheduleWorkspace({searchParams: Promise.resolve({})}).then(view => root.render(view));
      } else if (window.bracketFechas) {
        root.render(<ModifyScheduleDialog match={{ id: 'match' }} open chooseBracketFecha clubes={[]}
          onOpenChange={() => {}} onScheduleModified={() => {}} />);
      } else {
        if (window.testShare) window.shareSource = {fecha, groupId: null, pastCount: 0,
          slots: [{key: 'morning', date: '2099-11-06', start_time: '09:00', end_time: '12:00', max_matches: 1}]};
        root.render(<ScheduleWizard tournaments={tournaments} clubs={clubs}
          source={window.shareSource ?? null} initialTournament={window.testShare ? 'a' : undefined} initialClub="a" back="/schedules?club=a" />);
      }
    `,
  },
  plugins: [{ name: 'stub-server-actions', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'qa' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'qa' }, args => ({ contents: mocks[args.path], resolveDir: process.cwd() }))
  } }],
})

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  const mountFixture = async (mode, width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    page.setDefaultTimeout(8000)
    await page.addInitScript(key => { window[key] = true }, mode)
    await page.route('http://localhost/schedule-entry-qa', route => route.fulfill({
      contentType: 'text/html', body: `<html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><main id="root"></main></html>`,
    }))
    await page.goto('http://localhost/schedule-entry-qa')
    await page.addScriptTag({ path: bundle })
    return page
  }

  for (const width of [390, 900, 1280]) {
    const entryPage = await mountFixture('testFechaManager', width)
    const sharedLink = entryPage.getByRole('link', { name: 'Crear fecha compartida', exact: true })
    await sharedLink.waitFor()
    assert.equal(await sharedLink.getAttribute('href'), '/schedules/new?tournament=a')
    assert.equal(await sharedLink.evaluate(link => link.getBoundingClientRect().right <= link.parentElement.getBoundingClientRect().right), true)
    const deleteButton = entryPage.getByRole('button', { name: 'Eliminar Fecha de origen de prueba', exact: true })
    assert.equal(await deleteButton.evaluate(button => {
      const scrollContainer = button.closest('.overflow-y-auto')
      return scrollContainer && button.getBoundingClientRect().right < scrollContainer.getBoundingClientRect().right
    }), true)
    assert.equal(await entryPage.getByRole('link', { name: 'Compartir esta fecha' }).getAttribute('href'), '/schedules/new?source=origin')
    assert.equal(await entryPage.evaluate(() => document.documentElement.scrollWidth), width)
    await entryPage.getByText('06/11/2099 al 08/11/2099', { exact: true }).first().waitFor()
    await entryPage.screenshot({ path: path.join(output, `tournament-fechas-${width}.png`), fullPage: true })
    if (width === 1280) {
      await entryPage.getByRole('button', { name: 'Nueva fecha', exact: true }).click()
      await entryPage.getByRole('dialog', { name: 'Nueva Fecha del Torneo' }).waitFor()
    }
    await entryPage.close()
  }
  console.log('Classic dialog and shared entry available without overflow at 390, 900 and 1280px')

  const workspacePage = await mountFixture('testWorkspace', 390)
  const sharedRow = workspacePage.getByRole('listitem').filter({ hasText: '2 torneos vinculados' })
  await sharedRow.getByRole('link', { name: 'Ver fecha compartida' }).waitFor()
  const individualRow = workspacePage.getByRole('listitem').filter({ hasText: 'Individual' })
  await individualRow.getByRole('link', { name: 'Gestionar fecha' }).waitFor()
  assert.equal(await individualRow.getByRole('link', { name: /Abrir|Editar/ }).count(), 0)
  assert.equal(await workspacePage.evaluate(() => document.documentElement.scrollWidth), 390)
  await workspacePage.screenshot({ path: path.join(output, 'workspace-390.png'), fullPage: true })
  await workspacePage.close()

  const sharePage = await mountFixture('testShare', 390)
  await sharePage.getByText('Se comparten las franjas del período.', { exact: false }).waitFor()
  await sharePage.getByRole('button', { name: 'Club B', exact: true }).click()
  await sharePage.getByRole('button', { name: 'Seleccionar los 2 resultados visibles' }).click()
  await sharePage.getByRole('button', { name: 'Continuar' }).click()
  const destination = sharePage.getByLabel('Dónde aplicar las franjas en Torneo 2', { exact: true })
  await destination.waitFor()
  assert.equal(await destination.inputValue(), '')
  await destination.selectOption('existing-b')
  await sharePage.getByText('Se reutilizan las franjas que coinciden', { exact: false }).waitFor()
  await sharePage.getByRole('button', { name: 'Continuar' }).click()
  await sharePage.getByRole('button', { name: 'Revisar', exact: true }).click()
  await sharePage.waitForFunction(() => window.previews.length === 1)
  assert.deepEqual(await sharePage.evaluate(() => window.previews[0].destinations.map(item => item.fecha)), [
    { kind: 'adopt', fecha_id: 'origin' }, { kind: 'adopt', fecha_id: 'existing-b' },
  ])
  await sharePage.close()
  console.log('Workspace labels and sharing into an existing date passed')

  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    page.setDefaultTimeout(8000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://localhost/schedule-qa', route => route.fulfill({
      contentType: 'text/html', body: `<html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><main class="p-4" id="root"></main></html>`,
    }))
    await page.goto('http://localhost/schedule-qa')
    await page.addScriptTag({ path: bundle })
    assert.deepEqual(errors, [])
    const button = name => page.getByRole('button', { name, exact: true })
    const label = name => page.getByLabel(name, { exact: true })
    await button('Club B').click()
    await label('Buscar torneo').fill('Torneo 1')
    await button('Seleccionar 1 resultado visible').click()
    await page.getByText('1 torneo seleccionado', { exact: true }).waitFor()
    await label('Buscar torneo').fill('Torneo 2')
    await button('Seleccionar 1 resultado visible').click()
    await page.getByText('2 torneos seleccionados', { exact: true }).waitFor()
    await button('Continuar').click()
    await label('Nombre de la fecha').fill('Fecha de prueba')
    await label('Inicio del período').fill('2099-11-06')
    await label('Fin del período').fill('2099-11-08')
    await label('Ronda y copa para Torneo 1').selectOption('8VOS:MAIN')
    await label('Ronda y copa para Torneo 2').selectOption('4TOS:GOLD')
    await button('Continuar').click()
    await button('Agregar franja').click()
    await label('Inicio').fill('09:07')
    await label('Fin').fill('23:59')
    await button('Agregar franja').click()
    assert.equal((await label('Inicio').nth(0).inputValue()).slice(0, 5), '09:07')
    assert.equal(await label('Inicio').nth(1).inputValue(), '')
    assert.equal(await label('Inicio').nth(1).evaluate(input => document.activeElement === input), true)
    await button('Eliminar franja 2').click()
    await label('Fin').fill('13:27')
    await label('Capacidad').fill('4')
    const timeline = page.locator('svg').filter({ has: page.locator('rect.cursor-ew-resize') })
    const handle = timeline.locator('rect.cursor-ew-resize').last()
    await handle.scrollIntoViewIfNeeded()
    const [rail, edge] = await Promise.all([timeline.boundingBox(), handle.boundingBox()])
    assert.ok(rail && edge)
    const x = edge.x + edge.width / 2
    const y = edge.y + edge.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + rail.width / 96, y)
    await page.mouse.up()
    assert.equal((await label('Fin').inputValue()).slice(0, 5), '13:42')
    await label('Fin').fill('13:27')
    await label('Dividir a las').fill('11:17')
    await button('Dividir').click()
    await page.getByText('2 franjas en 1 día', { exact: true }).waitFor()
    await page.getByText('Copiar horarios a otro día', { exact: true }).click()
    await label('Día de destino').fill('2099-11-09')
    await button('Copiar 2 franjas').click()
    await page.getByRole('alert').filter({ hasText: 'dentro del período' }).waitFor()
    await label('Día de destino').fill('2099-11-07')
    await button('Copiar 2 franjas').click()
    await page.getByText('4 franjas en 2 días', { exact: true }).waitFor()
    assert.equal(await label('Día').inputValue(), '2099-11-07')
    await page.getByRole('status').filter({ hasText: 'copiadas al 07/11/2099' }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width)
    await page.screenshot({ path: path.join(output, `editor-${width}.png`), fullPage: true })
    await button('Revisar').click()
    const save = button('Guardar en 2 torneos · 8 franjas nuevas')
    await save.waitFor()
    assert.equal(await page.getByRole('list', { name: 'Franjas del torneo' }).count(), 2)
    assert.equal(await page.getByText('Se crea', { exact: true }).count(), 8)
    await save.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('alert').filter({ hasText: 'Volvé a confirmar' }).waitFor()
    assert.equal(await button('Atrás').isDisabled(), true)
    await save.click()
    await page.waitForFunction(() => window.destination === '/schedules/qa-group?back=%2Fschedules%3Fclub%3Da')
    const { previews, commits } = await page.evaluate(() => ({ previews: window.previews, commits: window.commits }))
    assert.deepEqual(commits, [0, 1].map(() => ({ payload: previews[0], revision: 'qa-revision' })))
    assert.deepEqual(previews[0].destinations.map(item => [item.round_type, item.bracket_key]), [['8VOS', 'MAIN'], ['4TOS', 'GOLD']])
    assert.equal(new Set(previews[0].slots.map(slot => slot.key)).size, 4)
    assert.deepEqual(previews[0].slots.map(slot => [slot.start_time.slice(0, 5), slot.end_time.slice(0, 5), slot.max_matches]),
      [['09:07', '11:17', 4], ['11:17', '13:27', 4], ['09:07', '11:17', 4], ['11:17', '13:27', 4]])
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`Wizard and slot editor passed at ${width}px`)
  }
  const jornadas = [
    { id: 'first', name: 'Primera jornada', fecha_number: 1, start_date: '2099-11-06', end_date: '2099-11-06' },
    { id: 'second', name: 'Segunda jornada', fecha_number: 2, start_date: '2099-11-08', end_date: '2099-11-08' },
  ]
  for (const fechas of [jornadas.slice(0, 1), jornadas]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
    await page.addInitScript(rows => { window.bracketFechas = rows }, fechas)
    await page.route('http://localhost/bracket-qa', route => route.fulfill({
      contentType: 'text/html', body: `<html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><main id="root"></main></html>`,
    }))
    await page.goto('http://localhost/bracket-qa')
    await page.addScriptTag({ path: bundle })
    const fechaPicker = page.getByLabel('Fecha de la ronda', { exact: true })
    const date = page.getByLabel('Día del partido (opcional)')
    const save = page.getByRole('button', { name: 'Guardar Cambios' })
    await page.getByRole('dialog').waitFor()
    await page.getByText('Cargando fechas de la ronda…', { exact: true }).waitFor({ state: 'hidden' })
    assert.equal(await fechaPicker.count(), fechas.length > 1 ? 1 : 0)
    await page.getByLabel('Hora Inicio (Opcional)').fill('09:00')
    if (fechas.length > 1) {
      assert.equal(await save.isDisabled(), true)
      await fechaPicker.selectOption('second')
      assert.equal(await date.inputValue(), '2099-11-08')
    } else {
      await date.fill('2099-11-06')
    }
    await save.click()
    await page.waitForFunction(() => window.bracketSchedule)
    assert.equal(await page.evaluate(() => window.bracketSchedule.fechaId), fechas.at(-1).id)
    await page.close()
    console.log(`Bracket scheduling dialog passed with ${fechas.length} compatible fecha(s)`)
  }
} finally {
  await browser.close()
}
