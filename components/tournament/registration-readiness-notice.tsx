'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUser } from '@/contexts/user-context'
import { usePaymentDialog } from './inscription-payment-dialog'
import type { RegistrationReadiness } from '@/lib/services/registration/registration-readiness'

export const useRegistrationReadiness = (tournamentId: string) => {
  const { user } = useUser()
  return useSWR(user ? ['registration-readiness', tournamentId, user.id] : null, async (): Promise<RegistrationReadiness> => {
    const response = await fetch(`/api/tournaments/${tournamentId}/inscriptions/readiness`, { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || 'No se pudo consultar el estado de inscripciones.')
    return data
  }, { refreshInterval: 30000 })
}

export const RegistrationReadinessNotice = ({ tournamentId }: { tournamentId: string }) => {
  const pathname = usePathname()
  const { data, error, mutate } = useRegistrationReadiness(tournamentId)
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const openPayment = usePaymentDialog()
  const handleAcknowledge = async () => {
    if (!data?.signature || saving) return
    setSaving(true); setMessage(null)
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/inscriptions/readiness`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature: data.signature }),
      })
      const result = await response.json()
      if (!response.ok) { await mutate(); throw new Error(result.message) }
      await mutate(result, { revalidate: false })
      setMessage('Pendientes revisadas. Podés organizar el torneo sin estas parejas. Si cambia el listado, deberás revisarlo nuevamente.')
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : 'No se pudo confirmar la revisión.') }
    finally { setSaving(false) }
  }
  if (error) return <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">No se pudo consultar si hay parejas pendientes. <Button variant="outline" onClick={() => void mutate().catch(() => {})}>Reintentar</Button></div>
  if (!data) return <p role="status" className="text-sm text-slate-600">Consultando cupos y pendientes…</p>
  if (!data.excluded.length) return <p className="text-sm text-slate-600">{data.occupied}{data.maximum === null ? ' lugares ocupados · Sin límite' : `/${data.maximum} lugares ocupados`} · {data.eligibleCount} parejas habilitadas</p>
  return <section aria-label="Inscripciones pendientes para organizar el torneo" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
    <div className="flex items-start gap-3"><AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><div>
      <p className="font-semibold">{data.isFull ? 'Torneo completo · ' : ''}{data.occupied}{data.maximum === null ? ' lugares ocupados · Sin límite' : `/${data.maximum} lugares ocupados`}</p>
      <p className="mt-1 text-sm">{data.excluded.length === 1 ? 'Hay una pareja sin cupo reservado.' : `Hay ${data.excluded.length} parejas sin cupo reservado.`} Revisá estos casos antes de organizar.</p>
      {data.proofWithoutSlot > 0 && <p className="mt-1 text-sm font-semibold">{data.proofWithoutSlot} con comprobante recibido y sin cupo: requieren atención.</p>}
    </div></div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? 'Ocultar pendientes' : 'Revisar pendientes'}</Button>
      {!pathname?.endsWith('/inscriptions') && <Button asChild variant="outline"><Link href={`/tournaments/${tournamentId}/inscriptions`}>Ir a Inscripciones</Link></Button>}
    </div>
    {expanded && <div className="space-y-3 border-t border-amber-200 pt-3">
      <ul className="max-h-72 space-y-2 overflow-y-auto">
        {data.excluded.map(pair => <li key={pair.id} className="flex flex-col justify-between gap-2 rounded-lg bg-white p-3 sm:flex-row sm:items-center">
          <div><p className="text-sm font-semibold">{pair.name}</p><p className="text-xs">{pair.label}{pair.hasProof && !pair.occupiesSlot ? ' · Comprobante recibido' : ''}</p></div>
          <Button type="button" size="sm" variant="outline" onClick={() => openPayment({ tournamentId, inscriptionId: pair.id, manager: true })}>Revisar inscripción</Button>
        </li>)}
      </ul>
      {data.acknowledged ? <p className="flex items-center gap-2 text-sm"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />Exclusiones revisadas para el estado actual del torneo.</p>
        : <Button type="button" disabled={saving} onClick={() => void handleAcknowledge()}>{saving ? 'Confirmando…' : `Continuar sin estas ${data.excluded.length} parejas`}</Button>}
    </div>}
    {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
  </section>
}
