import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import useSWR from 'swr'
import { InscriptionPaymentPanel, PaymentCompact } from '../inscription-payment-panel'

jest.mock('@/contexts/user-context', () => ({ useUser: () => ({ user: { id: 'player' } }) }))
jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }))
const inscription = { id: 'i', method: 'TRANSFER', hasProof: false, proofStatus: 'NOT_REQUIRED', isPending: false, alias: 'test.alias', amount: 100, proofRequired: true, occupiesSlot: true }
const render = (changes = {}, cash = false, capacity: { isFull?: boolean; admissionsOpen?: boolean } = { isFull: false, admissionsOpen: true }) => {
  jest.mocked(useSWR).mockReturnValue({ data: { inscription: { ...inscription, ...changes }, settings: { cash, ...capacity } }, mutate: jest.fn() } as never)
  return renderToStaticMarkup(<InscriptionPaymentPanel tournamentId="t" />)
}
describe('payment presentation', () => {
  it('keeps a reserved place while the deposit receipt is missing, ignoring retired approval flags', () => {
    const html = render({ isPending: true })
    expect(html).toContain('Tenés pendiente adjuntar el comprobante de la seña.')
    expect(html).toContain('Tu cupo está reservado')
    expect(html).not.toContain('type="file"')
    expect(html).toContain('Subir comprobante')
    expect(html).not.toContain('espera aprobación')
    expect(html).not.toContain('Elegir efectivo')
  })
  it('shows the existing proof and its review status', () => {
    const html = render({ hasProof: true, proofStatus: 'PENDING_REVIEW' }, true)
    expect(html).toContain('Ver comprobante')
    expect(html).toContain('Comprobante enviado')
    expect(html).not.toContain('Subir comprobante')
    expect(html).not.toContain('Elegir efectivo')
  })
  it('keeps historical registrations free of an invented pending payment', () => {
    expect(render({}, true)).toContain('Subir comprobante')
    expect(render({ method: null, proofRequired: false }, true)).not.toContain('pendiente adjuntar')
    expect(render({ method: null, proofRequired: false })).not.toContain('Subir comprobante')
  })
  it('shows cash without implying that it was collected', () => {
    const html = render({ method: 'CASH', proofRequired: false })
    expect(html).toContain('Abonás en efectivo')
    expect(html).toContain('Modificar pago')
    expect(html).not.toMatch(/Falta comprobante|Subir comprobante|Cobrado|Pagado/)
  })
  it('keeps the place confirmed without requesting a disabled proof or manual approval', () => {
    const html = render({ proofRequired: false, isPending: true })
    expect(html).toContain('Tu cupo está reservado')
    expect(html).not.toContain('espera aprobación')
    expect(html).not.toMatch(/Falta subir|Subir comprobante/)
  })
  it('explains that a saved inscription without a place needs a receipt and availability', () => {
    const html = render({ occupiesSlot: false })
    expect(html).toContain('Inscripción sin confirmar')
    expect(html).toContain('Tu inscripción se confirmará cuando cargues el comprobante.')
    expect(html).toContain('En este momento hay lugar, pero no está reservado y puede ocuparse antes de que lo subas.')
    expect(html).not.toMatch(/\d+ cupos/)
    expect(html).not.toContain('Tu cupo está reservado')
  })
  it('does not request another receipt when an uploaded receipt could not obtain a place', () => {
    const html = render({ occupiesSlot: false, hasProof: true, proofStatus: 'PENDING_REVIEW' })
    expect(html).toContain('Tu comprobante ya está cargado. Ahora hay lugar, pero tu inscripción sigue sin confirmar hasta que el organizador te asigne un cupo.')
    expect(html).not.toContain('cuando cargues el comprobante')
  })
  it('warns against transferring when capacity has filled while preserving receipt upload for an existing payment', () => {
    const html = render({ occupiesSlot: false }, false, { isFull: true, admissionsOpen: true })
    expect(html).toContain('El torneo está completo y tu inscripción sigue sin confirmar. No transfieras.')
    expect(html).toContain('Si ya pagaste, subí el comprobante')
    expect(html).toContain('Subir comprobante')
    expect(html).not.toContain('En este momento hay lugar')
  })
  it('does not promise confirmation after admissions close even when places remain', () => {
    const html = render({ occupiesSlot: false }, false, { isFull: false, admissionsOpen: false })
    expect(html).toContain('Las inscripciones están cerradas. No transfieras.')
    expect(html).not.toContain('Tu inscripción se confirmará cuando')
  })
  it('keeps a received proof visible while explaining that admissions are closed', () => {
    const html = render({ occupiesSlot: false, hasProof: true }, false, { isFull: false, admissionsOpen: false })
    expect(html).toContain('Tu comprobante ya está cargado, pero las inscripciones están cerradas.')
    expect(html).toContain('Ver comprobante')
    expect(html).not.toContain('Tu inscripción se confirmará cuando')
  })
  it('does not invent availability when the current capacity could not be verified', () => {
    const html = render({ occupiesSlot: false }, false, {})
    expect(html).toContain('No pudimos verificar si hay lugar')
    expect(html).not.toContain('En este momento hay lugar')
  })
  it('does not reuse cached availability after the latest query fails', () => {
    jest.mocked(useSWR).mockReturnValue({ data: { inscription: { ...inscription, occupiesSlot: false, slotAvailability: 'available' }, settings: { isFull: false, admissionsOpen: true } }, error: new Error('offline') } as never)
    expect(renderToStaticMarkup(<InscriptionPaymentPanel tournamentId="t" />)).toContain('No pudimos verificar si hay lugar')
  })
  it('also uses server-calculated availability in the public tournament cards', () => {
    const html = renderToStaticMarkup(<PaymentCompact tournamentId="t" inscription={{ ...inscription, method: 'TRANSFER', revision: 1, occupiesSlot: false, slotAvailability: 'full' }} />)
    expect(html).toContain('El torneo está completo')
    expect(html).not.toContain('En este momento hay lugar')
  })
  it('keeps an acquired place confirmed even after the tournament fills', () => {
    const html = render({}, false, { isFull: true, admissionsOpen: true })
    expect(html).toContain('Tu cupo está reservado')
    expect(html).not.toContain('No transfieras')
  })
  it('keeps an existing proof accessible after the requirement is disabled', () => {
    const html = render({ proofRequired: false, hasProof: true, proofStatus: 'APPROVED' })
    expect(html).toContain('Ver comprobante')
    expect(html).toContain('Comprobante aprobado')
  })
})
