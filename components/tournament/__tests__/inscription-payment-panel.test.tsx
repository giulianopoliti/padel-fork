import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import useSWR from 'swr'
import { InscriptionPaymentPanel } from '../inscription-payment-panel'

jest.mock('@/contexts/user-context', () => ({ useUser: () => ({ user: { id: 'player' } }) }))
jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }))
const inscription = { id: 'i', method: 'TRANSFER', hasProof: false, proofStatus: 'NOT_REQUIRED', isPending: false, alias: 'test.alias', amount: 100, proofRequired: true, occupiesSlot: true }
const render = (changes = {}, cash = false) => {
  jest.mocked(useSWR).mockReturnValue({ data: { inscription: { ...inscription, ...changes }, settings: { cash } }, mutate: jest.fn() } as never)
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
    expect(html).toContain('Inscripción sin cupo reservado')
    expect(html).toContain('Cargá el comprobante de la seña para obtener cupo, según disponibilidad.')
    expect(html).not.toContain('Tu cupo está reservado')
  })
  it('keeps an existing proof accessible after the requirement is disabled', () => {
    const html = render({ proofRequired: false, hasProof: true, proofStatus: 'APPROVED' })
    expect(html).toContain('Ver comprobante')
    expect(html).toContain('Comprobante aprobado')
  })
})
