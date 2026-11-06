// Browser regression for shared schedules, the classic form and bracket scheduling with stubbed Server Actions.
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
    export const loadScheduleDestinationOptionsAction = async ids => {
      const result = { success: true, data: ids.map(tournament_id => ({
        tournament_id, rounds: [{ round_type: 'ZONE', bracket_key: 'MAIN' }, tournament_id === 'a'
          ? { round_type: '8VOS', bracket_key: 'MAIN' } : { round_type: '4TOS', bracket_key: 'GOLD' }],
        fechas: tournament_id === 'b' ? [{ ...window.fixtureFecha, id: 'existing-b', tournament_id, fecha_number: 7,
          name: 'Fecha existente', round_type: '4TOS', bracket_key: 'GOLD' }] : [],
      })) };
      if (window.testOptionRace) return new Promise(resolve => window.optionRequests.push({
        ids, succeed: () => resolve(result), fail: () => resolve({ success: false, error: 'Respuesta anterior' }),
      }));
      return result;
    };
    export const previewScheduleBatchAction = async payload => {
      window.previews.push(payload);
      if (window.failPreview) {
        window.failPreview = false;
        throw new Error('lost preview response');
      }
      const destinations = payload.destinations.map(destination => {
        const {tournament_id, fecha, slot_adoptions} = destination;
        const adopted = fecha.kind === 'adopt';
        const ambiguous = window.testShare && fecha.fecha_id === 'existing-b' && !slot_adoptions?.morning;
        const new_slots = !adopted || payload.complete_member_id ? payload.slots : [];
        return {
          tournament_id, tournament_name: window.fixtureTournaments.find(item => item.id === tournament_id).name,
          fecha_id: adopted ? fecha.fecha_id : null, fecha_number: fecha.fecha_id === 'existing-b' ? 7 : 1,
          transition_to_zone_phase: !adopted && destination.round_type === 'ZONE',
          preserves_local_metadata: adopted, new_slots,
          reused_slots: !ambiguous && adopted && !payload.complete_member_id ? payload.slots.map(slot => ({ key: slot.key, slot_id: 'equivalent' })) : [],
          conflicts: ambiguous ? [{ code: 'AMBIGUOUS_SLOT', slot_key: 'morning',
            candidate_ids: ['existing-slot-one', 'existing-slot-two'], message: 'Hay varios horarios equivalentes.' }] : [],
        };
      });
      return { success: true, data: { revision: 'qa-revision-' + window.previews.length, preview: {
        can_commit: destinations.every(row => !row.conflicts.length),
        physical_slots_to_create: destinations.reduce((total, row) => total + row.new_slots.length, 0),
        physical_slots_to_reuse: destinations.reduce((total, row) => total + row.reused_slots.length, 0),
        destinations,
      } } };
    };
    export const commitScheduleBatchAction = async (payload, revision) => {
      window.commits.push({payload, revision});
      if (window.staleCommit) {
        window.staleCommit = false;
        return { success: false, error: 'La vista previa quedó desactualizada. Volvé a revisar los destinos antes de guardar.' };
      }
      if (window.loseCommit) {
        window.loseCommit = false;
        throw new Error('lost response');
      }
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
      window.previews = []; window.commits = []; window.optionRequests = [];
      const clubs = [{id: 'a', name: 'Club A'}, {id: 'b', name: 'Club B'}];
      const tournaments = clubs.map(({id}, i) => ({id, club_id: id, name: 'Torneo ' + (i + 1),
        category_name: 'Cuarta', status: 'NOT_STARTED', eligible: true}));
      const fecha = {id: 'origin', tournament_id: 'a', fecha_number: 1, name: 'Fecha de origen de prueba',
        start_date: '2099-11-06', end_date: '2099-11-08', status: 'NOT_STARTED', description: null,
        round_type: 'ZONE', bracket_key: 'MAIN', estimated_match_duration_minutes: 90, max_matches_per_couple: null};
      if (window.testCreate) tournaments[1].name += ' ' + 'CampeonatoInterclubes'.repeat(6);
      window.fixtureFecha = fecha;
      window.fixtureTournaments = tournaments;
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
        const slots = [{key: 'morning', date: '2099-11-06', start_time: '09:00', end_time: '12:00', max_matches: 1,
          ...(window.testShare ? {court_name: 'Central'} : {})}];
        const source = window.testShare || window.testComplete ? {fecha, groupId: window.testComplete ? 'group' : null, pastCount: 0, slots} : null;
        const template = window.testExpand || window.testComplete ? {
          id: 'group', completeMemberId: window.testComplete ? 'member' : undefined, pastCount: 0, detached: ['b'], slots,
          metadata: {name: 'Fecha del grupo', description: null, start_date: fecha.start_date, end_date: fecha.end_date},
        } : undefined;
        const rows = window.testComplete ? tournaments.slice(0, 1) : window.testExpand ? tournaments.slice(1) : tournaments;
        root.render(<ScheduleWizard tournaments={rows} clubs={clubs} source={source} template={template}
          initialTournament={source || window.testTournamentContext ? 'a' : undefined} initialClub="a"
          back={template ? '/schedules/group' : '/schedules?club=a'} />);
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
    const layout = mode === 'testFechaManager' || mode === 'testWorkspace' ? ''
      : 'class="mx-auto min-h-screen w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8"'
    await page.route('http://localhost/schedule-entry-qa', route => route.fulfill({
      contentType: 'text/html', body: `<html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><main id="root" ${layout}></main></html>`,
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
  const shareButton = name => sharePage.getByRole('button', { name, exact: true })
  await sharePage.getByText('Se comparten las franjas del período.', { exact: false }).waitFor()
  await sharePage.getByText('Origen', { exact: true }).waitFor()
  assert.equal(await sharePage.getByRole('button', { name: 'Quitar Torneo 1' }).count(), 0)
  assert.equal(await sharePage.getByLabel('Inicio', { exact: true }).inputValue(), '09:00')
  assert.equal(await sharePage.getByLabel('Inicio del período', { exact: true }).count(), 0)
  await shareButton('Club B').click()
  await shareButton('Seleccionar los 2 resultados visibles').click()
  const destination = sharePage.getByLabel('Dónde aplicar las franjas en Torneo 2', { exact: true })
  await destination.waitFor()
  assert.equal(await destination.inputValue(), '')
  await shareButton('Revisar').click()
  const court = sharePage.getByLabel('Nombres de las canchas en Torneo 2')
  await sharePage.waitForFunction(() => document.activeElement?.id === 'schedule-court-b')
  assert.equal(await sharePage.getByLabel('Nombres de las canchas en Torneo 1').count(), 0)
  await court.selectOption('rename')
  await sharePage.getByLabel('06/11/2099 · 09:00–12:00', { exact: true }).fill('Cancha del otro club')
  await shareButton('Revisar').click()
  const shareReview = sharePage.getByRole('region', { name: 'Revisión', exact: true })
  await shareReview.getByText('Se crea', { exact: true }).waitFor()
  assert.deepEqual(await sharePage.evaluate(() => window.previews[0].destinations[1].court_choice), { rename: { morning: 'Cancha del otro club' } })
  await destination.selectOption('existing-b')
  assert.equal(await shareButton('Guardar').isDisabled(), true)
  await court.selectOption('clear')
  await shareButton('Volver a revisar').click()
  await shareReview.getByText('Conflicto', { exact: true }).waitFor()
  await shareReview.getByText('Fecha existente · Fecha 7 · Fecha existente', { exact: true }).waitFor()
  await shareReview.getByText('Cuartos · Copa Oro', { exact: true }).waitFor()
  assert.equal(await shareButton('Guardar').isDisabled(), true)
  const matchChoice = sharePage.getByLabel('Horario existente a reutilizar')
  await matchChoice.selectOption('existing-slot-two')
  await shareButton('Volver a revisar').click()
  await sharePage.waitForFunction(() => window.previews.length === 3)
  await shareReview.getByText('Se reutiliza', { exact: true }).last().waitFor()
  assert.deepEqual(await sharePage.evaluate(() => window.previews[2].destinations.map(item => item.fecha)), [
    { kind: 'adopt', fecha_id: 'origin' }, { kind: 'adopt', fecha_id: 'existing-b' },
  ])
  assert.deepEqual(await sharePage.evaluate(() => window.previews[2].destinations[1].slot_adoptions), { morning: 'existing-slot-two' })
  await shareButton('Guardar').click()
  await sharePage.waitForFunction(() => window.destination?.startsWith('/schedules/qa-group'))
  await sharePage.close()
  console.log('Sharing origin, destination creation/adoption, court choices and explicit conflict resolution passed')

  for (const [mode, title] of [['testExpand', 'Agregar torneos'], ['testComplete', 'Completar horarios faltantes']]) {
    const page = await mountFixture(mode, 900)
    await page.getByRole('heading', { name: title, exact: true }).waitFor()
    await page.getByText('Fecha del grupo', { exact: mode === 'testExpand' }).first().waitFor()
    assert.equal(await page.getByRole('button', { name: 'Agregar franja' }).count(), 0)
    assert.equal(await page.getByLabel('Nombre de la fecha').count(), 0)
    if (mode === 'testExpand') {
      await page.getByRole('button', { name: 'Seleccionar 1 resultado visible' }).click()
      await page.getByLabel('Dónde aplicar las franjas en Torneo 2', { exact: true }).selectOption('existing-b')
    } else {
      await page.getByText('Fecha vinculada', { exact: true }).waitFor()
      assert.equal(await page.getByLabel('Buscar torneo').count(), 0)
      assert.equal(await page.getByRole('button', { name: /^Quitar Torneo/ }).count(), 0)
    }
    await page.getByRole('button', { name: 'Revisar', exact: true }).click()
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.waitForFunction(() => window.destination === '/schedules/group')
    const payload = await page.evaluate(() => window.commits[0].payload)
    assert.equal(payload.group_id, 'group')
    assert.equal(payload.source_fecha_id, null)
    assert.equal(payload.complete_member_id, mode === 'testComplete' ? 'member' : undefined)
    assert.deepEqual(payload.destinations.map(item => item.fecha), [
      { kind: 'adopt', fecha_id: mode === 'testComplete' ? 'origin' : 'existing-b' },
    ])
    await page.close()
  }
  console.log('Group expansion and missing-slot completion passed')

  const racePage = await mountFixture('testOptionRace', 390)
  await racePage.getByRole('button', { name: 'Club B', exact: true }).click()
  await racePage.getByRole('button', { name: 'Seleccionar los 2 resultados visibles' }).click()
  await racePage.waitForFunction(() => window.optionRequests.length === 1)
  await racePage.getByRole('button', { name: 'Quitar Torneo 1', exact: true }).click()
  await racePage.waitForFunction(() => window.optionRequests.length === 2)
  assert.deepEqual(await racePage.evaluate(() => window.optionRequests.map(request => request.ids)), [['a', 'b'], ['b']])
  await racePage.evaluate(() => window.optionRequests[1].succeed())
  const currentRound = racePage.getByLabel('Ronda y copa para Torneo 2', { exact: true })
  await currentRound.selectOption('4TOS:GOLD')
  await racePage.evaluate(() => window.optionRequests[0].fail())
  assert.equal(await currentRound.inputValue(), '4TOS:GOLD')
  assert.equal(await racePage.getByText('Respuesta anterior').count(), 0)
  await racePage.close()
  console.log('Batched option responses respect the current selection')

  const emptyPage = await mountFixture('testTournamentContext', 390)
  await emptyPage.getByText('Torneo actual', { exact: true }).waitFor()
  await emptyPage.getByRole('button', { name: 'Revisar', exact: true }).click()
  await emptyPage.waitForFunction(() => document.activeElement?.id === 'schedule-name')
  await emptyPage.getByLabel('Nombre de la fecha').fill('Fecha sin horarios')
  emptyPage.once('dialog', async dialog => {
    assert.match(dialog.message(), /Descartar los cambios/)
    await dialog.dismiss()
  })
  await emptyPage.getByRole('button', { name: 'Cancelar', exact: true }).click()
  assert.equal(await emptyPage.evaluate(() => window.destination), undefined)
  await emptyPage.evaluate(() => { window.failPreview = true })
  await emptyPage.getByRole('button', { name: 'Revisar', exact: true }).click()
  await emptyPage.getByRole('alert').filter({ hasText: 'Se interrumpió la conexión' }).waitFor()
  assert.equal(await emptyPage.getByLabel('Nombre de la fecha').inputValue(), 'Fecha sin horarios')
  await emptyPage.getByRole('button', { name: 'Revisar', exact: true }).click()
  await emptyPage.getByText('Fecha sin franjas.', { exact: true }).waitFor()
  await emptyPage.getByRole('button', { name: 'Guardar', exact: true }).click()
  await emptyPage.waitForFunction(() => window.destination?.startsWith('/schedules/qa-group'))
  assert.deepEqual(await emptyPage.evaluate(() => window.commits[0].payload.slots), [])
  await emptyPage.close()
  console.log('Tournament preselection, validation focus, preview recovery and a date without slots passed')

  const periodPage = await mountFixture('testTournamentContext', 390)
  const periodField = name => periodPage.getByLabel(name, { exact: true })
  const addSlot = periodPage.getByRole('button', { name: 'Agregar franja', exact: true })
  const dateSection = periodPage.getByRole('region', { name: 'Fecha', exact: true })
  const slotSection = periodPage.getByRole('region', { name: 'Horarios', exact: true })
  const periodStart = periodField('Inicio del período')
  const periodEnd = periodField('Fin del período')
  await periodField('Nombre de la fecha').fill('Fecha de prueba')
  await periodStart.fill('2099-11-06')
  await periodEnd.fill('2099-10-30')
  const dateError = dateSection.getByRole('alert').filter({ hasText: 'El fin del período debe ser igual o posterior al inicio.' })
  await dateError.waitFor()
  assert.equal(await periodEnd.getAttribute('min'), '2099-11-06')
  assert.equal(await periodStart.getAttribute('max'), '2099-10-30')
  assert.equal(await periodEnd.getAttribute('aria-invalid'), 'true')
  assert.equal(await periodEnd.inputValue(), '2099-10-30')
  assert.equal(await addSlot.isDisabled(), true)
  assert.equal(await slotSection.getByRole('alert').count(), 0)
  await periodPage.getByRole('button', { name: 'Revisar', exact: true }).click()
  await periodPage.waitForFunction(() => document.activeElement?.id === 'schedule-period-end')
  assert.equal(await periodPage.evaluate(() => window.previews.length), 0)
  await periodEnd.fill('2099-11-06')
  await dateError.waitFor({ state: 'hidden' })
  assert.equal(await periodEnd.getAttribute('aria-invalid'), null)
  assert.equal(await addSlot.isEnabled(), true)
  await periodEnd.fill('2099-11-10')
  await periodField('Día').fill('2099-11-08')
  await periodField('Inicio del período').fill('2099-11-09')
  await addSlot.click()
  assert.equal(await periodField('Día').inputValue(), '2099-11-09')
  assert.equal(await periodField('Inicio').inputValue(), '08:00')
  await periodField('Inicio del período').fill('2000-01-01')
  await periodField('Fin del período').fill('2000-01-02')
  assert.equal(await addSlot.isDisabled(), true)
  await periodPage.getByText(/El período de la fecha ya terminó/).waitFor()
  await periodField('Fin del período').fill('2099-11-10')
  assert.equal(await addSlot.isEnabled(), true)
  assert.equal(await periodField('Inicio').inputValue(), '08:00')
  await periodPage.close()
  console.log('Inverted periods are flagged in Fecha before review, and slot creation recovers after correction')

  for (const width of [390, 900, 1280]) {
    const page = await mountFixture('testCreate', width)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const button = name => page.getByRole('button', { name, exact: true })
    const label = name => page.getByLabel(name, { exact: true })
    const footer = page.locator('footer[aria-label="Acciones de la fecha"]')
    const save = button('Guardar')
    const selected = page.getByRole('region', { name: 'Torneos seleccionados' })
    const review = page.getByRole('region', { name: 'Revisión', exact: true })
    const tournament2 = await page.evaluate(() => window.fixtureTournaments[1].name)
    await button('Club B').click()
    await label('Buscar torneo').fill('Torneo 1')
    await button('Seleccionar 1 resultado visible').click()
    await selected.getByText('1 torneo seleccionado', { exact: true }).waitFor()
    assert.equal(await selected.getByRole('button', { name: `Quitar ${tournament2}` }).count(), 0)
    await label('Buscar torneo').fill('Torneo 2')
    await button('Seleccionar 1 resultado visible').click()
    await selected.getByText('2 torneos seleccionados', { exact: true }).waitFor()
    assert.equal(await selected.getByRole('button', { name: 'Quitar Torneo 1' }).count(), 1)
    assert.equal(await page.getByRole('list', { name: 'Resultados de búsqueda' }).getByText('Torneo 1', { exact: true }).count(), 0)
    await label('Nombre de la fecha').fill('Fecha de prueba')
    await label('Inicio del período').fill('2099-11-06')
    await label('Fin del período').fill('2099-11-08')
    const destination = label(`Dónde aplicar las franjas en ${tournament2}`)
    await destination.selectOption('existing-b')
    await label('Fin del período').fill('2099-11-09')
    await selected.getByRole('alert').filter({ hasText: 'ya no es compatible' }).waitFor()
    assert.equal(await destination.inputValue(), 'existing-b')
    await button('Revisar').click()
    await page.waitForFunction(() => document.activeElement?.id === 'schedule-destination-b')
    assert.equal(await page.evaluate(() => window.previews.length), 0)
    await destination.selectOption('')
    await label('Fin del período').fill('2099-11-08')
    await label('Ronda y copa para Torneo 1').selectOption('8VOS:MAIN')
    await label(`Ronda y copa para ${tournament2}`).selectOption('4TOS:GOLD')
    await button('Agregar franja').focus()
    await page.keyboard.press('Enter')
    assert.equal(await label('Inicio').evaluate(input => document.activeElement === input), true)
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
    await button('06/11/2099 · 2').click()
    await label('Fin del período').fill('2099-11-06')
    await button('Revisar').click()
    await page.waitForFunction(() => document.activeElement?.id === 'schedule-slots-error')
    assert.equal(await label('Día').inputValue(), '2099-11-07')
    await label('Fin del período').fill('2099-11-08')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width)
    await label('Capacidad').last().focus()
    await page.keyboard.press('Tab')
    const footerBox = await footer.boundingBox()
    assert.ok(footerBox && footerBox.y + footerBox.height <= 901)
    const active = await page.evaluate(() => document.activeElement.getBoundingClientRect().toJSON())
    assert.ok(active.bottom <= footerBox.y, 'the action footer should not cover the active field')
    await page.screenshot({ path: path.join(output, `editor-${width}.png`), fullPage: true })
    await button('Revisar').click()
    await review.getByText('Octavos · Principal', { exact: true }).waitFor()
    await review.getByText('Cuartos · Copa Oro', { exact: true }).waitFor()
    assert.equal(await review.getByRole('list', { name: 'Franjas del torneo' }).count(), 2)
    assert.equal(await review.getByText('Se crea', { exact: true }).count(), 8)
    await page.screenshot({ path: path.join(output, `review-${width}.png`), fullPage: true })
    await label('Capacidad').last().fill('5')
    await review.getByRole('status').filter({ hasText: 'desactualizada' }).waitFor()
    assert.equal(await save.isDisabled(), true)
    assert.equal(await label('Nombre de la fecha').inputValue(), 'Fecha de prueba')
    await button('Volver a revisar').click()
    await review.getByText('Sin cancha · Capacidad 5', { exact: true }).last().waitFor()
    await page.evaluate(() => { window.staleCommit = true })
    await save.click()
    await review.getByRole('alert').filter({ hasText: 'Volvé a revisar los destinos' }).waitFor()
    assert.equal(await save.isDisabled(), true)
    await button('Volver a revisar').click()
    await page.evaluate(() => { window.loseCommit = true })
    await save.focus()
    await page.keyboard.press('Enter')
    await review.getByRole('alert').filter({ hasText: 'Volvé a confirmar' }).waitFor()
    assert.equal(await button('Cancelar').isDisabled(), true)
    assert.equal(await button('Volver a revisar').isDisabled(), true)
    assert.equal(await label('Nombre de la fecha').isDisabled(), true)
    await button('Reintentar guardado').dblclick()
    await page.waitForFunction(() => window.destination === '/schedules/qa-group?back=%2Fschedules%3Fclub%3Da')
    const { previews, commits } = await page.evaluate(() => ({ previews: window.previews, commits: window.commits }))
    assert.deepEqual(commits, [1, 2, 2].map(index => ({ payload: previews[index], revision: `qa-revision-${index + 1}` })))
    assert.deepEqual(previews[2].destinations.map(item => [item.round_type, item.bracket_key]), [['8VOS', 'MAIN'], ['4TOS', 'GOLD']])
    assert.equal(new Set(previews[2].slots.map(slot => slot.key)).size, 4)
    assert.deepEqual(previews[2].slots.map(slot => [slot.start_time.slice(0, 5), slot.end_time.slice(0, 5), slot.max_matches]),
      [['09:07', '11:17', 4], ['11:17', '13:27', 4], ['09:07', '11:17', 4], ['11:17', '13:27', 5]])
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`Single-page editing, stale preview, responsive keyboard flow and idempotent retry passed at ${width}px`)
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
