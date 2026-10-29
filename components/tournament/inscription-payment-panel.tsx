'use client'

import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { useUser } from '@/contexts/user-context'
import { fetchRegistrationJson } from '@/lib/tournaments/registration-diagnostics'
import { paymentPresentation, type PaymentData, type PaymentInscription } from '@/lib/tournaments/payment-types'
import { usePaymentDialog } from './inscription-payment-dialog'

export const paymentFetcher = async (url: string): Promise<PaymentData> => {
  const { response, data } = await fetchRegistrationJson(url, { cache: 'no-store' }, 15000)
  if (!response.ok || !data.success) throw new Error(data.message || 'No se pudo consultar la inscripción.')
  return data as PaymentData
}

export const PaymentCompact = ({ tournamentId, inscription, tournamentName, manager = false }: {
  tournamentId: string; inscription: PaymentInscription; tournamentName?: string; manager?: boolean
}) => {
  const openPayment = usePaymentDialog()
  const view = paymentPresentation(inscription)
  const hasPaymentDetails = inscription.hasProof || Boolean(inscription.method) || inscription.proofRequired === true
  const needsManagement = manager && inscription.occupiesSlot === false
  return <div className="space-y-2 text-sm" aria-label="Pago de la inscripción">
    {!manager && <p className="font-semibold">{inscription.individual ? 'Inscripción guardada' : inscription.occupiesSlot === false ? 'Inscripción sin cupo reservado' : 'Tu cupo está reservado'}</p>}
    {!manager && inscription.proofRequired && !inscription.hasProof && <p>{inscription.occupiesSlot === false
      ? 'Cargá el comprobante de la seña para obtener cupo, según disponibilidad.' : 'Tenés pendiente adjuntar el comprobante de la seña.'}</p>}
    {!manager && (inscription.hasProof || inscription.method === 'CASH') && view.status && <p>{view.status}</p>}
    {manager && !hasPaymentDetails && <p>{inscription.proofWaived ? 'Admitida sin comprobante' : 'No requiere comprobante'}</p>}
    {(hasPaymentDetails || needsManagement) && <Button type="button" size="sm" variant="outline" data-payment-tournament={tournamentId} className="min-h-10 bg-white text-slate-900 hover:bg-slate-100" onClick={() => openPayment({ tournamentId, inscriptionId: inscription.id, tournamentName, manager })}>
      {manager ? inscription.hasProof ? 'Ver comprobante' : inscription.method === 'TRANSFER' && inscription.proofRequired !== false ? 'Sin comprobante' : inscription.method === 'CASH' ? 'Efectivo' : 'Revisar inscripción' : view.action || 'Ver inscripción'}
    </Button>}
    {manager && inscription.hasProof && <p>{inscription.proofStatus === 'APPROVED' ? 'Aprobado' : 'Pendiente de revisión'}</p>}
  </div>
}

export const InscriptionPaymentPanel = ({ tournamentId, inscriptionId, managerRow = false }: {
  tournamentId: string; inscriptionId?: string; managerRow?: boolean
}) => {
  const { user } = useUser()
  const url = `/api/tournaments/${tournamentId}/inscriptions/payment${managerRow ? '?list=1' : inscriptionId ? `?inscriptionId=${inscriptionId}` : ''}`
  const { data, error, mutate } = useSWR(user ? [url, user.id] : null, ([endpoint]) => paymentFetcher(endpoint))
  const inscription = managerRow ? data?.inscriptions?.find(row => row.id === inscriptionId) : data?.inscription
  if (!user) return null
  if (error && !data) return <div role="alert" className="text-sm">No se pudo consultar el pago. <Button variant="outline" onClick={() => void mutate().catch(() => {})}>Reintentar</Button></div>
  if (!data) return <p role="status" className="text-sm">Consultando inscripción…</p>
  if (!inscription) return null
  return <PaymentCompact tournamentId={tournamentId} inscription={inscription} tournamentName={data.tournamentName} manager={managerRow} />
}

export const InscriptionStatus = ({ tournamentId, inscriptionId }: { tournamentId: string; inscriptionId: string }) => {
  const { user } = useUser()
  const url = `/api/tournaments/${tournamentId}/inscriptions/payment?list=1`
  const { data, error } = useSWR(user ? [url, user.id] : null, ([endpoint]) => paymentFetcher(endpoint))
  const row = data?.inscriptions?.find(item => item.id === inscriptionId)
  if (error) return <p className="text-sm text-amber-800">Estado sin actualizar</p>
  if (!row) return <p role="status" className="text-sm text-slate-500">Consultando estado…</p>
  return <p className={row.confirmed ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-amber-800'}>{row.individual ? 'Inscripción guardada' : row.occupiesSlot === false ? 'Sin cupo reservado' : 'Confirmada · Cupo reservado'}</p>
}
