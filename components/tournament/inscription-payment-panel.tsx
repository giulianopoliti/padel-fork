'use client'

import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { useUser } from '@/contexts/user-context'
import { fetchRegistrationJson } from '@/lib/tournaments/registration-diagnostics'
import { getSlotAvailability, paymentPresentation, type PaymentData, type PaymentInscription, type SlotAvailability } from '@/lib/tournaments/payment-types'
import { usePaymentDialog } from './inscription-payment-dialog'

export const paymentFetcher = async (url: string): Promise<PaymentData> => {
  const { response, data } = await fetchRegistrationJson(url, { cache: 'no-store' }, 15000)
  if (!response.ok || !data.success) throw new Error(data.message || 'No se pudo consultar la inscripción.')
  return data as PaymentData
}

const pendingPlaceMessage = (inscription: PaymentInscription, availability: SlotAvailability | undefined): string => {
  if (inscription.hasProof) {
    if (availability === 'full') return 'Recibimos tu comprobante, pero el torneo está completo y tu inscripción sigue sin confirmar. El organizador revisará tu caso.'
    if (availability === 'closed') return 'Tu comprobante ya está cargado, pero las inscripciones están cerradas. El organizador debe resolver tu caso.'
    if (availability === 'available') return 'Tu comprobante ya está cargado. Ahora hay lugar, pero tu inscripción sigue sin confirmar hasta que el organizador te asigne un cupo.'
    return 'Tu comprobante ya está cargado, pero tu inscripción sigue sin confirmar. El organizador debe resolver tu caso.'
  }
  if (!inscription.proofRequired) {
    if (availability === 'full') return 'El torneo está completo y tu inscripción sigue sin confirmar. El organizador debe resolver tu caso.'
    if (availability === 'closed') return 'Las inscripciones están cerradas y tu inscripción sigue sin confirmar. El organizador debe resolver tu caso.'
    return 'Tu inscripción sigue sin confirmar. El organizador debe asignarte un cupo.'
  }
  if (availability === 'full') return 'El torneo está completo y tu inscripción sigue sin confirmar. No transfieras. Si ya pagaste, subí el comprobante para que el organizador revise tu caso.'
  if (availability === 'closed') return 'Las inscripciones están cerradas. No transfieras. Si ya pagaste, podés subir el comprobante para que el organizador revise tu caso.'
  if (availability === 'available') return 'Tu inscripción se confirmará cuando cargues el comprobante. En este momento hay lugar, pero no está reservado y puede ocuparse antes de que lo subas.'
  return 'Tu inscripción sigue sin confirmar. No pudimos verificar si hay lugar; actualizá la página antes de transferir.'
}

export const PaymentCompact = ({ tournamentId, inscription, tournamentName, manager = false, availability = inscription.slotAvailability }: {
  tournamentId: string; inscription: PaymentInscription; tournamentName?: string; manager?: boolean; availability?: SlotAvailability
}) => {
  const openPayment = usePaymentDialog()
  const view = paymentPresentation(inscription)
  const hasPaymentDetails = inscription.hasProof || Boolean(inscription.method) || inscription.proofRequired === true
  const needsManagement = manager && inscription.occupiesSlot === false
  return <div className="space-y-2 text-sm" aria-label="Pago de la inscripción">
    {!manager && <p className="font-semibold">{inscription.individual ? 'Inscripción guardada' : inscription.occupiesSlot === false ? 'Inscripción sin confirmar' : 'Tu cupo está reservado'}</p>}
    {!manager && !inscription.individual && inscription.occupiesSlot === false && <p>{pendingPlaceMessage(inscription, availability)}</p>}
    {!manager && inscription.occupiesSlot !== false && inscription.proofRequired && !inscription.hasProof && <p>Tenés pendiente adjuntar el comprobante de la seña.</p>}
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
  const { data, error, mutate } = useSWR(user ? [url, user.id] : null, ([endpoint]) => paymentFetcher(endpoint), { refreshInterval: 30000 })
  const inscription = managerRow ? data?.inscriptions?.find(row => row.id === inscriptionId) : data?.inscription
  if (!user) return null
  if (error && !data) return <div role="alert" className="text-sm">No se pudo consultar el pago. <Button variant="outline" onClick={() => void mutate().catch(() => {})}>Reintentar</Button></div>
  if (!data) return <p role="status" className="text-sm">Consultando inscripción…</p>
  if (!inscription) return null
  return <PaymentCompact tournamentId={tournamentId} inscription={inscription} tournamentName={data.tournamentName} manager={managerRow} availability={error ? 'unknown' : getSlotAvailability(data.settings)} />
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
