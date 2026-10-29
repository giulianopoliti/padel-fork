'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
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
  const router = useRouter()
  const { mutate: mutateCache } = useSWRConfig()
  const { data, error, mutate } = useRegistrationReadiness(tournamentId)
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [decision, setDecision] = useState<{ kind: 'accept' | 'discard'; pair: RegistrationReadiness['excluded'][number] } | null>(null)
  const inFlight = useRef(false)
  const openPayment = usePaymentDialog()
  const handleDecision = async () => {
    if (!decision || inFlight.current) return
    inFlight.current = true
    setSaving(true); setMessage(null)
    try {
      const body = new FormData()
      body.set('inscriptionId', decision.pair.id)
      body.set('revision', String(decision.pair.revision))
      body.set('operation', decision.pair.proofMissing ? 'admit-without-proof' : 'assign')
      const response = await fetch(`/api/tournaments/${tournamentId}/inscriptions/${decision.kind === 'accept' ? 'payment' : 'readiness'}`, decision.kind === 'accept'
        ? { method: 'POST', body }
        : { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inscriptionId: decision.pair.id, revision: decision.pair.revision }) })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'No se pudo guardar la decisión.')
      setMessage(decision.kind === 'accept' ? 'Inscripción aceptada. La pareja ya tiene cupo y puede participar.' : 'Inscripción descartada. La pareja fue eliminada del listado.')
      router.refresh()
      void mutateCache(key => Array.isArray(key) && (key[0] === 'own-payments' || key[0] === 'registration-readiness' || String(key[0]).includes('/inscriptions/payment'))).catch(() => {})
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'No se pudo confirmar el resultado. Actualizá el listado antes de reintentar.')
    } finally {
      setDecision(null)
      try { await mutate() } catch { setMessage(previous => `${previous || ''} No se pudo actualizar el listado. Reintentá la consulta antes de continuar.`) }
      inFlight.current = false
      setSaving(false)
    }
  }
  if (error) return <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">No se pudo consultar si hay parejas pendientes. <Button variant="outline" onClick={() => void mutate().catch(() => {})}>Reintentar</Button></div>
  if (!data) return <p role="status" className="text-sm text-slate-600">Consultando cupos y pendientes…</p>
  const confirmedLabel = `${data.eligibleCount} ${data.eligibleCount === 1 ? 'pareja confirmada' : 'parejas confirmadas'}`
  const remaining = data.maximum === null ? null : Math.max(0, data.maximum - data.occupied)
  const capacityLabel = remaining === null ? 'Sin límite de cupos' : remaining === 0 ? 'Cupos completos' : `${remaining} ${remaining === 1 ? 'cupo disponible' : 'cupos disponibles'}`
  if (!data.excluded.length) return <div className="space-y-2"><p className="text-sm text-slate-600">{confirmedLabel} · {capacityLabel}</p>{message && <p role="status" className="text-sm text-slate-700">{message}</p>}</div>
  const acceptingDisabled = data.isFull || !data.admissionsOpen
  const missingProofCount = data.excluded.filter(pair => pair.proofMissing).length
  return <section aria-label="Inscripciones sin confirmar" className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
    <div className="flex items-start gap-3"><AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><div>
      <h2 className="font-semibold">{data.excluded.length} {data.excluded.length === 1 ? 'inscripción sin confirmar' : 'inscripciones sin confirmar'}</h2>
      <p className="mt-1 text-sm">{data.excluded.length === 1 ? 'Esta pareja todavía no tiene cupo y no se incluirá en zonas ni partidos.' : 'Estas parejas todavía no tienen cupo y no se incluirán en zonas ni partidos.'}</p>
      {!expanded && missingProofCount > 0 && <p className="mt-2 text-sm">{missingProofCount === 1 ? 'Una pareja no cargó el comprobante de la seña.' : `${missingProofCount} parejas no cargaron el comprobante de la seña.`}</p>}
      <p className="mt-2 text-sm">{confirmedLabel} · {capacityLabel}</p>
      {data.proofWithoutSlot > 0 && <p className="mt-2 text-sm font-semibold">{data.proofWithoutSlot === 1 ? 'Una pareja ya cargó el comprobante, pero sigue sin cupo.' : `${data.proofWithoutSlot} parejas ya cargaron el comprobante, pero siguen sin cupo.`} Revisá el pago antes de resolver.</p>}
      {acceptingDisabled && <p className="mt-2 text-sm font-medium">{data.isFull ? 'El torneo está completo. Necesitás liberar un lugar para aceptar otra pareja.' : 'Las admisiones están cerradas. No se pueden aceptar nuevas parejas.'}</p>}
    </div></div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? 'Ocultar inscripciones' : 'Resolver inscripciones'}</Button>
      {!pathname?.endsWith('/inscriptions') && <Button asChild variant="outline"><Link href={`/tournaments/${tournamentId}/inscriptions`}>Ir a Inscripciones</Link></Button>}
    </div>
    {expanded && <div className="space-y-3 border-t border-amber-200 pt-3">
      <ul className="max-h-96 space-y-3 overflow-y-auto">
        {data.excluded.map(pair => <li key={pair.id} className="flex flex-col justify-between gap-4 rounded-lg border border-amber-100 bg-white p-4 lg:flex-row lg:items-center">
          <div className="min-w-0"><p className="text-sm font-semibold">{pair.name}</p><p className="mt-1 text-sm text-slate-600">{pair.proofMissing
            ? 'No cargó el comprobante. Su inscripción todavía no está confirmada.'
            : pair.hasProof ? 'Comprobante cargado. Su inscripción sigue sin confirmar porque no tiene cupo.'
              : 'Su inscripción todavía no está confirmada: falta asignarle un cupo.'}</p>
            <Button type="button" variant="link" className="mt-1 h-auto min-h-10 px-0 text-sm text-slate-700" disabled={saving} onClick={() => openPayment({ tournamentId, inscriptionId: pair.id, manager: true })}>Ver pago y comprobante</Button>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" className="min-h-11 flex-1 border-red-200 text-red-700 hover:bg-red-50 lg:flex-none" disabled={saving} onClick={() => setDecision({ kind: 'discard', pair })} aria-label={`Descartar inscripción de ${pair.name}`}>Descartar</Button>
            <Button type="button" className="min-h-11 flex-1 lg:flex-none" disabled={saving || acceptingDisabled} onClick={() => setDecision({ kind: 'accept', pair })} aria-label={`Aceptar inscripción de ${pair.name}`}>Aceptar</Button>
          </div>
        </li>)}
      </ul>
    </div>}
    {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
    <AlertDialog open={Boolean(decision)} onOpenChange={open => { if (!open && !saving) setDecision(null) }}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{decision?.kind === 'accept' ? '¿Aceptar esta inscripción?' : '¿Descartar esta inscripción?'}</AlertDialogTitle>
          <AlertDialogDescription asChild><div className="space-y-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">{decision?.pair.name}</p>
            {decision?.kind === 'accept' ? <><p>La inscripción quedará confirmada y la pareja tendrá cupo para participar.</p>
              <p>{decision.pair.proofMissing ? 'La aceptarás sin comprobante. Se conserva su forma de pago.' : 'Aceptar el cupo no modifica la revisión del comprobante.'}</p></>
              : <><p>Se eliminará esta inscripción del listado del torneo. Esta acción no se puede deshacer.</p>{decision?.pair.hasProof && <p>El comprobante adjunto también se quitará. Descartar la inscripción no realiza una devolución del pago.</p>}</>}
          </div></AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Volver</AlertDialogCancel>
          <AlertDialogAction disabled={saving || (decision?.kind === 'accept' && acceptingDisabled)} className={decision?.kind === 'discard' ? 'bg-red-600 text-white hover:bg-red-700' : ''}
            onClick={event => { event.preventDefault(); void handleDecision() }}>{saving ? 'Guardando…' : decision?.kind === 'accept' ? 'Aceptar inscripción' : 'Descartar inscripción'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
}
