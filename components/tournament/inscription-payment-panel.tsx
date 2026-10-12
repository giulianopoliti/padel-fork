'use client'

import useSWR from 'swr'
import Link from 'next/link'
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
  return <div className="space-y-2 text-sm" aria-label="Pago de la inscripción">
    {!manager && view.status && <p>{view.status}</p>}
    {(view.status || manager) && <Button type="button" size="sm" variant="outline" data-payment-tournament={tournamentId} className="min-h-10 bg-white text-slate-900 hover:bg-slate-100" onClick={() => openPayment({ tournamentId, inscriptionId: inscription.id, tournamentName, manager })}>
      {manager ? inscription.hasProof ? 'Ver comprobante' : inscription.method === 'TRANSFER' ? 'Pendiente de comprobante' : inscription.method === 'CASH' ? 'Efectivo' : 'Modificar pago' : view.action}
    </Button>}
    {manager && inscription.hasProof && <p>{inscription.proofStatus === 'APPROVED' ? 'Aprobado' : 'Pendiente de revisión'}</p>}
    {!manager && inscription.isPending && <p className="text-xs">La inscripción espera aprobación del organizador.</p>}
  </div>
}

export const InscriptionPaymentPanel = ({ tournamentId, inscriptionId, managerSummary = false, managerRow = false }: {
  tournamentId: string; inscriptionId?: string; managerSummary?: boolean; managerRow?: boolean
}) => {
  const { user } = useUser()
  const url = `/api/tournaments/${tournamentId}/inscriptions/payment${managerSummary || managerRow ? '?list=1' : inscriptionId ? `?inscriptionId=${inscriptionId}` : ''}`
  const { data, error, mutate } = useSWR(user ? [url, user.id] : null, ([endpoint]) => paymentFetcher(endpoint))
  const inscription = managerRow ? data?.inscriptions?.find(row => row.id === inscriptionId) : data?.inscription
  if (!user) return null
  if (error && !data) return <div role="alert" className="text-sm">No se pudo consultar el pago. <Button variant="outline" onClick={() => void mutate().catch(() => {})}>Reintentar</Button></div>
  if (!data) return <p role="status" className="text-sm">Consultando inscripción…</p>
  if (managerSummary) return data.incompleteCount ? <p className="text-sm text-amber-800">Hay {data.incompleteCount} inscripciones pendientes de comprobante. <Link className="underline" href={`/tournaments/${tournamentId}/inscriptions`}>Ver inscripciones</Link></p> : null
  if (!inscription) return null
  return <PaymentCompact tournamentId={tournamentId} inscription={inscription} tournamentName={data.tournamentName} manager={managerRow} />
}
