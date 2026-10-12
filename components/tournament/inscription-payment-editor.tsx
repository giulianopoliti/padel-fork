'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import { DialogClose } from '@/components/ui/dialog'
import { Copy, ExternalLink, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUser } from '@/contexts/user-context'
import { paymentFetcher } from './inscription-payment-panel'
import { prepareInscriptionProof } from '@/lib/tournaments/prepare-inscription-proof'
import { validateInscriptionProofSelection } from '@/lib/tournaments/inscription-proof'
import { openInscriptionProof } from '@/lib/tournaments/open-inscription-proof'
import { createRegistrationAttemptId, fetchRegistrationJson, registrationErrorMessage, reportRegistrationClientError } from '@/lib/tournaments/registration-diagnostics'

export type PaymentTarget = { tournamentId: string; inscriptionId: string; tournamentName?: string; manager?: boolean }
export type PaymentDialogCopy = {
  introduction: string
  cash: string
  transfer: string
  missingAmount: string
  changeMethod: string
  approved: string
  pending: string
  removeConfirmation: string
  cashConfirmation: string
}
const secondaryActionClasses = 'min-h-10 border-slate-300 bg-slate-100 font-semibold text-slate-900 hover:bg-slate-200 hover:text-slate-900'

export const InscriptionPaymentEditor = ({ target, copy, allowProofApproval = false }: { target: PaymentTarget; copy: PaymentDialogCopy; allowProofApproval?: boolean }) => {
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
  const [approving, setApproving] = useState(false)
  const [preparing, setPreparing] = useState(false)
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
  const handleSave = async (operation: 'attach' | 'replace' | 'remove' | 'cash' | 'transfer' | 'approve-proof') => {
    if (inFlight.current || !data || !inscription || uncertain) return
    inFlight.current = true
    setBusy(true); setMessage(null); setConfirm(null)
    setApproving(operation === 'approve-proof')
    const attemptId = createRegistrationAttemptId()
    let submitted = false
    let preparedProof: File | undefined
    try {
      const body = new FormData()
      body.set('operation', operation); body.set('inscriptionId', inscription.id)
      body.set('revision', String(draftRevision ?? inscription.revision))
      if (file && (operation === 'attach' || operation === 'replace')) {
        setPreparing(true)
        preparedProof = await prepareInscriptionProof(file)
        body.set('proof', preparedProof)
        setPreparing(false)
      }
      submitted = true
      const { response, data: result } = await fetchRegistrationJson(url, {
        method: 'POST', headers: { 'x-registration-attempt': attemptId }, body,
      })
      if (!response.ok || !result.success) throw new Error(result.message || 'No se pudo guardar el pago.')
      await mutate({ ...data, inscription: result.inscription }, { revalidate: false })
      setMethod(result.inscription.method); setFile(null); setDraftRevision(null); setUncertain(false)
      setMessage(operation === 'approve-proof' ? 'Comprobante aprobado.' : preparedProof && file && preparedProof.size < file.size
        ? `Cambios guardados. Imagen reducida de ${(file.size / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB a ${Math.ceil(preparedProof.size / 1000).toLocaleString('es-AR')} KB.`
        : 'Cambios guardados.')
      // Revalidate all compact summaries, batches and organizer rows, with no private public cache.
      void mutateCache(key => Array.isArray(key) && (String(key[0]).includes('/inscriptions/payment') || key[0] === 'own-payments')).catch(() => {})
      router.refresh()
    } catch (failure) {
      reportRegistrationClientError({ attemptId, tournamentId: target.tournamentId, stage: submitted ? 'submit-proof' : 'prepare-proof', code: submitted ? 'request_failed' : 'preparation_failed' })
      // A response error is not evidence that the write was rolled back.
      if (submitted) { setUncertain(true); try { await mutate() } catch {} }
      setMessage(registrationErrorMessage(failure instanceof Error ? failure.message : 'No se pudo confirmar el resultado.', attemptId))
    } finally { inFlight.current = false; setPreparing(false); setBusy(false); setApproving(false) }
  }
  const closeAction = <DialogClose asChild><Button type="button" variant="outline" className={secondaryActionClasses} disabled={busy}>Cerrar</Button></DialogClose>
  if (error && !data) return <div className="space-y-4"><p role="alert">No se pudo consultar la inscripción.</p><div className="flex flex-wrap gap-2"><Button variant="outline" className={secondaryActionClasses} onClick={() => void handleRefresh()}>Reintentar</Button>{closeAction}</div></div>
  if (!data) return <div className="space-y-4"><p role="status">Consultando inscripción…</p>{closeAction}</div>
  if (!inscription) return <div className="space-y-4"><p role="status">Esta inscripción ya no existe. Cerrá el popup y revisá el torneo.</p>{closeAction}</div>
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
    <p className="text-sm text-slate-600">{copy.introduction}</p>
    {(data.settings.cash || data.settings.transfer || inscription.method) && <fieldset disabled={!canEdit || busy || uncertain || conflict} className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">Forma de pago</legend>
      <div className="flex flex-wrap gap-4">
        {(data.settings.transfer || inscription.method === 'TRANSFER') && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="payment-method" value="TRANSFER" checked={method === 'TRANSFER'} onChange={() => { setDraftRevision(previous => previous ?? inscription.revision); setMethod('TRANSFER'); setFile(null); setConfirm(null) }} />Transferencia{!data.settings.transfer && ' (elección guardada)'}</label>}
        {(data.settings.cash || inscription.method === 'CASH') && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="payment-method" value="CASH" checked={method === 'CASH'} onChange={() => { setDraftRevision(previous => previous ?? inscription.revision); setMethod('CASH'); setFile(null); setConfirm(null) }} />Efectivo{!data.settings.cash && ' (elección guardada)'}</label>}
      </div>
    </fieldset>}
    {transfer && <div className="space-y-3">
      <p className="text-sm text-slate-600">{copy.transfer}</p>
      <p className="text-sm">Importe: <strong>{amount == null ? copy.missingAmount : `$${Number(amount).toLocaleString('es-AR')}`}</strong></p>
      {alias && <div className="flex items-center justify-between gap-3"><p className="min-w-0 break-all text-sm">Alias: <strong>{alias}</strong></p><Button variant="outline" size="sm" className={secondaryActionClasses} onClick={() => void navigator.clipboard.writeText(alias).then(() => setMessage('Alias copiado.')).catch(() => setMessage('No se pudo copiar. Seleccioná el alias para copiarlo.'))}><Copy aria-hidden="true" />Copiar</Button></div>}
      {inscription.hasProof && <div className="space-y-2">
        <Button variant="outline" className={secondaryActionClasses} disabled={busy} onClick={() => void openInscriptionProof(target.tournamentId, inscription.id).catch(e => setMessage(e.message))}><ExternalLink aria-hidden="true" />Ver comprobante</Button>
        <p className="text-sm text-slate-600">{inscription.proofStatus === 'APPROVED' ? 'Comprobante aprobado' : 'Pendiente de revisión'}</p>
        {allowProofApproval && data.manager && inscription.proofStatus === 'PENDING_REVIEW' && <Button type="button" className="min-h-11 bg-green-700 font-semibold text-white hover:bg-green-800" disabled={busy || Boolean(file) || changed || Boolean(confirm) || uncertain || conflict} onClick={() => void handleSave('approve-proof')}>
          {approving ? 'Aprobando…' : 'Aprobar comprobante'}
        </Button>}
        {canEdit && !changed && <Button variant="outline" className="min-h-10 border-red-200 bg-red-50 font-semibold text-red-700 hover:bg-red-100 hover:text-red-800" disabled={busy || uncertain || conflict} onClick={() => { setDraftRevision(previous => previous ?? inscription.revision); setConfirm('remove') }}><Trash2 aria-hidden="true" />Eliminar comprobante</Button>}
      </div>}
      {canEdit && !changed && <label className="block space-y-2 text-sm font-medium"><span>{file ? 'Cambiar archivo' : inscription.hasProof ? 'Reemplazar archivo' : 'Seleccionar comprobante'}</span>
        <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="h-auto cursor-pointer bg-white p-1 file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-slate-300 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-900 hover:file:bg-slate-200" disabled={busy || uncertain || conflict} onChange={event => {
          const next = event.target.files?.[0]; event.target.value = ''
          if (!next) return
          const invalid = validateInscriptionProofSelection(next)
          if (invalid) { setMessage(invalid); return }
          setDraftRevision(previous => previous ?? inscription.revision); setFile(next); setMessage(null); setConfirm(null)
        }} /><span className="block text-xs font-normal text-slate-500">JPG, PNG o WEBP hasta 20 MB: las imágenes pesadas se comprimen al subir. PDF hasta 4 MB. El archivo enviado no supera 4 MB. Seleccionar no sube el archivo.</span>
      </label>}
      {changed && <p className="text-sm text-slate-600">{copy.changeMethod}</p>}
      {file && <div className="space-y-2">
        {preview && <img src={preview} alt="Vista previa del comprobante seleccionado" className="max-h-48 w-full rounded-lg object-contain" />}
        <p className="break-all text-sm">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>
        <Button variant="outline" size="sm" className={secondaryActionClasses} disabled={busy} onClick={() => setFile(null)}>Quitar selección</Button>
      </div>}
    </div>}
    {method === 'CASH' && <p className="text-sm text-slate-600">{copy.cash}</p>}
    {!canEdit && <p className="text-sm text-slate-600">{copy.approved}</p>}
    {inscription.isPending && <p className="text-sm text-slate-600">{copy.pending}</p>}
    {confirm && <div role="alert" className="space-y-3 border-t border-slate-200 pt-4">
      <p className="text-sm">{confirm === 'remove' ? copy.removeConfirmation : copy.cashConfirmation}</p>
      <div className="flex gap-2"><Button variant="destructive" disabled={busy || conflict} onClick={() => void handleSave(confirm)}>Confirmar</Button><Button variant="outline" className={secondaryActionClasses} onClick={() => setConfirm(null)}>Volver</Button></div>
    </div>}
    {message && <p role={uncertain ? 'alert' : 'status'} aria-live="polite" className="text-sm">{message}</p>}
    {conflict && <p role="alert" className="text-sm">El pago cambió mientras editabas. Consultá el estado antes de guardar; tu selección local se conserva.</p>}
    <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
      <DialogClose asChild><Button type="button" variant={file || changed || uncertain || conflict || confirm ? 'outline' : 'default'} className={file || changed || uncertain || conflict || confirm ? `${secondaryActionClasses} min-h-11` : 'min-h-11 font-semibold'} disabled={busy}>Cerrar</Button></DialogClose>
      {uncertain || conflict ? <Button variant="outline" className={secondaryActionClasses} onClick={() => void handleRefresh()}>Consultar antes de reintentar</Button> : canEdit && (file || changed || busy) && !approving && !confirm && <Button className="min-h-11 font-semibold" disabled={busy} onClick={handleSubmit}>
        {busy ? preparing ? 'Preparando imagen…' : file ? 'Subiendo…' : 'Guardando…' : changed ? 'Guardar cambios' : inscription.hasProof ? 'Reemplazar comprobante' : 'Subir comprobante'}
      </Button>}
    </div>
  </div>
}
