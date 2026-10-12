'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUser } from '@/contexts/user-context'
import { paymentFetcher } from './inscription-payment-panel'
import { prepareInscriptionProof } from '@/lib/tournaments/prepare-inscription-proof'
import { validateInscriptionProof } from '@/lib/tournaments/inscription-proof'
import { openInscriptionProof } from '@/lib/tournaments/open-inscription-proof'
import { createRegistrationAttemptId, fetchRegistrationJson, registrationErrorMessage, reportRegistrationClientError } from '@/lib/tournaments/registration-diagnostics'

type PaymentTarget = { tournamentId: string; inscriptionId: string; tournamentName?: string; manager?: boolean }
const PaymentDialogContext = createContext<(target: PaymentTarget) => void>(() => {})
export const usePaymentDialog = () => useContext(PaymentDialogContext)

// One modal for the entire page, including organizer tables with many rows.
export const InscriptionPaymentProvider = ({ children }: { children: ReactNode }) => {
  const [target, setTarget] = useState<PaymentTarget | null>(null)
  const [open, setOpen] = useState(false)
  const origin = useRef<HTMLElement | null>(null)
  const { user } = useUser()
  useEffect(() => { setOpen(false); setTarget(null) }, [user?.id])
  const handleOpen = (next: PaymentTarget) => {
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setTarget(next)
    setOpen(true)
  }
  return <PaymentDialogContext.Provider value={handleOpen}>
    {children}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 sm:max-w-lg sm:p-7"
        onCloseAutoFocus={event => {
          event.preventDefault()
          const fallback = Array.from(document.querySelectorAll<HTMLElement>('[data-payment-tournament]')).find(button => button.dataset.paymentTournament === target?.tournamentId)
          if (origin.current?.isConnected && origin.current.tagName !== 'BODY') origin.current.focus()
          else fallback?.focus()
        }}>
        <DialogHeader>
          <DialogTitle className="text-xl">Pago de la inscripción</DialogTitle>
          <DialogDescription>{target?.tournamentName || 'Revisá la forma de pago y el comprobante.'}</DialogDescription>
        </DialogHeader>
        {target && <PaymentDialogBody key={`${user?.id}:${target.tournamentId}:${target.inscriptionId}`} target={target} />}
      </DialogContent>
    </Dialog>
  </PaymentDialogContext.Provider>
}

const PaymentDialogBody = ({ target }: { target: PaymentTarget }) => {
  const { user } = useUser()
  const url = `/api/tournaments/${target.tournamentId}/inscriptions/payment?inscriptionId=${target.inscriptionId}`
  const { data, error, mutate } = useSWR(user ? [url, user.id] : null, ([endpoint]) => paymentFetcher(endpoint))
  const { mutate: mutateCache } = useSWRConfig()
  const router = useRouter()
  const inscription = data?.inscription
  const [method, setMethod] = useState<'CASH' | 'TRANSFER' | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [confirm, setConfirm] = useState<'remove' | 'cash' | null>(null)
  const [draftRevision, setDraftRevision] = useState<number | null>(null)
  const inFlight = useRef(false)
  const initialized = useRef(false)
  useEffect(() => {
    if (inscription && !initialized.current) { setMethod(inscription.method); initialized.current = true }
  }, [inscription])
  useEffect(() => {
    if (inscription && draftRevision === null && !busy) setMethod(inscription.method)
  }, [inscription, draftRevision, busy])
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return }
    const next = URL.createObjectURL(file)
    setPreview(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  const handleRefresh = async () => {
    try {
      const next = await mutate()
      if (next?.inscription) { setMethod(next.inscription.method); setDraftRevision(file ? next.inscription.revision : null) }
      setUncertain(false)
      setMessage(null)
    } catch { setMessage('No se pudo consultar. Tu selección sigue disponible en este navegador.') }
  }
  const handleSave = async (operation: 'attach' | 'replace' | 'remove' | 'cash' | 'transfer') => {
    if (inFlight.current || !data || !inscription || uncertain) return
    inFlight.current = true
    setBusy(true); setMessage(null); setConfirm(null)
    const attemptId = createRegistrationAttemptId()
    let submitted = false
    try {
      const body = new FormData()
      body.set('operation', operation); body.set('inscriptionId', inscription.id)
      body.set('revision', String(draftRevision ?? inscription.revision))
      if (file && (operation === 'attach' || operation === 'replace')) body.set('proof', await prepareInscriptionProof(file))
      submitted = true
      const { response, data: result } = await fetchRegistrationJson(url, {
        method: 'POST', headers: { 'x-registration-attempt': attemptId }, body,
      })
      if (!response.ok || !result.success) throw new Error(result.message || 'No se pudo guardar el pago.')
      await mutate({ ...data, inscription: result.inscription }, { revalidate: false })
      setMethod(result.inscription.method); setFile(null); setDraftRevision(null); setUncertain(false)
      setMessage('Cambios guardados.')
      // Revalidate all compact summaries, batches and organizer rows, with no private public cache.
      void mutateCache(key => Array.isArray(key) && (String(key[0]).includes('/inscriptions/payment') || key[0] === 'own-payments')).catch(() => {})
      router.refresh()
    } catch (failure) {
      reportRegistrationClientError({ attemptId, tournamentId: target.tournamentId, stage: submitted ? 'submit-proof' : 'prepare-proof', code: submitted ? 'request_failed' : 'preparation_failed' })
      // A response error is not evidence that the write was rolled back.
      if (submitted) { setUncertain(true); try { await mutate() } catch {} }
      setMessage(registrationErrorMessage(failure instanceof Error ? failure.message : 'No se pudo confirmar el resultado.', attemptId))
    } finally { inFlight.current = false; setBusy(false) }
  }
  if (error && !data) return <div role="alert">No se pudo consultar la inscripción. <Button variant="outline" onClick={() => void handleRefresh()}>Reintentar</Button></div>
  if (!data) return <p role="status">Consultando inscripción…</p>
  if (!inscription) return <p role="status">Esta inscripción ya no existe. Cerrá el popup y revisá el torneo.</p>
  const canEdit = Boolean(data.manager || inscription.proofStatus !== 'APPROVED')
  const transfer = method === 'TRANSFER' || (method === null && inscription.hasProof)
  const changed = method !== inscription.method
  const conflict = draftRevision !== null && draftRevision !== inscription.revision
  const alias = changed ? data.settings.alias : inscription.alias || data.settings.alias
  const amount = changed ? data.settings.amount : inscription.amount ?? data.settings.amount
  const handleSubmit = () => {
    if (changed && method) {
      if (method === 'CASH' && inscription.hasProof) setConfirm('cash')
      else void handleSave(method === 'CASH' ? 'cash' : 'transfer')
    } else if (file) void handleSave(inscription.hasProof ? 'replace' : 'attach')
  }
  return <div className="space-y-5">
    {!target.tournamentName && data.tournamentName && <p className="font-semibold">{data.tournamentName}</p>}
    <p className="text-sm text-slate-600">{data.manager ? 'La inscripción de esta pareja está guardada y conserva el cupo.' : 'Tu inscripción está guardada y conserva el cupo.'}</p>
    {(data.settings.cash || data.settings.transfer || inscription.method) && <fieldset disabled={!canEdit || busy || uncertain || conflict} className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">Forma de pago</legend>
      <div className="flex flex-wrap gap-4">
        {(data.settings.transfer || inscription.method === 'TRANSFER') && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="payment-method" value="TRANSFER" checked={method === 'TRANSFER'} onChange={() => { setDraftRevision(previous => previous ?? inscription.revision); setMethod('TRANSFER'); setFile(null); setConfirm(null) }} />Transferencia{!data.settings.transfer && ' (elección guardada)'}</label>}
        {(data.settings.cash || inscription.method === 'CASH') && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="payment-method" value="CASH" checked={method === 'CASH'} onChange={() => { setDraftRevision(previous => previous ?? inscription.revision); setMethod('CASH'); setFile(null); setConfirm(null) }} />Efectivo{!data.settings.cash && ' (elección guardada)'}</label>}
      </div>
    </fieldset>}
    {transfer && <div className="space-y-3">
      <p className="text-sm">Importe: <strong>{amount == null ? 'Consultar al organizador' : `$${Number(amount).toLocaleString('es-AR')}`}</strong></p>
      {alias && <div className="flex items-center justify-between gap-3"><p className="min-w-0 break-all text-sm">Alias: <strong>{alias}</strong></p><Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(alias).then(() => setMessage('Alias copiado.')).catch(() => setMessage('No se pudo copiar. Seleccioná el alias para copiarlo.'))}>Copiar</Button></div>}
      {inscription.hasProof && <div className="space-y-2">
        <Button variant="outline" disabled={busy} onClick={() => void openInscriptionProof(target.tournamentId, inscription.id).catch(e => setMessage(e.message))}>Ver comprobante</Button>
        <p className="text-sm text-slate-600">{inscription.proofStatus === 'APPROVED' ? 'Comprobante aprobado' : 'Pendiente de revisión'}</p>
        {canEdit && !changed && <Button variant="ghost" className="text-red-700" disabled={busy || uncertain || conflict} onClick={() => { setDraftRevision(previous => previous ?? inscription.revision); setConfirm('remove') }}>Eliminar comprobante</Button>}
      </div>}
      {canEdit && !changed && <label className="block space-y-2 text-sm font-medium"><span>{file ? 'Cambiar archivo' : inscription.hasProof ? 'Reemplazar archivo' : 'Seleccionar comprobante'}</span>
        <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy || uncertain || conflict} onChange={event => {
          const next = event.target.files?.[0]; event.target.value = ''
          if (!next) return
          const invalid = validateInscriptionProof(next)
          if (invalid) { setMessage(invalid); return }
          setDraftRevision(previous => previous ?? inscription.revision); setFile(next); setMessage(null); setConfirm(null)
        }} /><span className="block text-xs font-normal text-slate-500">JPG, PNG, WEBP o PDF, hasta 4 MB. Seleccionar no sube el archivo.</span>
      </label>}
      {changed && <p className="text-sm text-slate-600">Guardá la forma de pago. Después podés adjuntar el comprobante; la inscripción conserva el cupo.</p>}
      {file && <div className="space-y-2">
        {preview && <img src={preview} alt="Vista previa del comprobante seleccionado" className="max-h-48 w-full rounded-lg object-contain" />}
        <p className="break-all text-sm">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setFile(null)}>Quitar selección</Button>
      </div>}
    </div>}
    {method === 'CASH' && <p className="text-sm text-slate-600">Abonás en efectivo al organizador.</p>}
    {!canEdit && <p className="text-sm text-slate-600">Para modificar un comprobante aprobado, contactá al organizador.</p>}
    {inscription.isPending && <p className="text-sm text-slate-600">La inscripción espera aprobación del organizador.</p>}
    {confirm && <div role="alert" className="space-y-3 border-t border-slate-200 pt-4">
      <p className="text-sm">{confirm === 'remove' ? 'Tu inscripción conserva el cupo y quedará pendiente de comprobante.' : 'Al guardar efectivo se eliminará el comprobante. Tu inscripción conserva el cupo.'}</p>
      <div className="flex gap-2"><Button variant="destructive" disabled={busy || conflict} onClick={() => void handleSave(confirm)}>Confirmar</Button><Button variant="outline" onClick={() => setConfirm(null)}>Volver</Button></div>
    </div>}
    {message && <p role={uncertain ? 'alert' : 'status'} aria-live="polite" className="text-sm">{message}</p>}
    {conflict && <p role="alert" className="text-sm">El pago cambió mientras editabas. Consultá el estado antes de guardar; tu selección local se conserva.</p>}
    {uncertain || conflict ? <Button variant="outline" onClick={() => void handleRefresh()}>Consultar antes de reintentar</Button> : canEdit && (transfer || changed) && !confirm && <Button className="min-h-11 w-full" disabled={busy || (!file && !changed)} onClick={handleSubmit}>
      {busy ? file ? 'Subiendo…' : 'Guardando…' : changed ? 'Guardar cambios' : inscription.hasProof ? 'Reemplazar comprobante' : 'Subir comprobante'}
    </Button>}
  </div>
}
