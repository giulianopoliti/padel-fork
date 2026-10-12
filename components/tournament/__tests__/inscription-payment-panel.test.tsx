import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import useSWR from 'swr'
import { InscriptionPaymentPanel } from '../inscription-payment-panel'

jest.mock('@/contexts/user-context', () => ({ useUser: () => ({ user: { id: 'player' } }) }))
jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }))
const inscription = { id: 'i', method: 'TRANSFER', hasProof: false, proofStatus: 'NOT_REQUIRED', isPending: false, alias: 'test.alias', amount: 100 }
const render = (changes = {}, cash = false) => {
  jest.mocked(useSWR).mockReturnValue({ data: { inscription: { ...inscription, ...changes }, settings: { cash } }, mutate: jest.fn() } as never)
  return renderToStaticMarkup(<InscriptionPaymentPanel tournamentId="t" />)
}
describe('payment presentation', () => {
  it('keeps a missing proof separate from organizer approval', () => {
    const html = render({ isPending: true })
    expect(html).toContain('Falta subir el comprobante')
    expect(html).not.toContain('type="file"')
    expect(html).toContain('Subir comprobante')
    expect(html).toContain('espera aprobación')
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
    expect(render({ method: null }, true)).not.toContain('Falta')
    expect(render({ method: null })).not.toContain('Subir comprobante')
  })
  it('shows cash without implying that it was collected', () => {
    const html = render({ method: 'CASH' })
    expect(html).toContain('Abonás en efectivo')
    expect(html).toContain('Modificar pago')
    expect(html).not.toMatch(/Falta comprobante|Subir comprobante|Cobrado|Pagado/)
  })
})
