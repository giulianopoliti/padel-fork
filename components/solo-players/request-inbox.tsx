"use client"
import { useState } from "react"
import Link from "next/link"
import { useSWRConfig } from "swr"
import { useUser } from "@/contexts/user-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { usePaymentDialog } from "@/components/tournament/inscription-payment-dialog"
import { getTenantBranding } from "@/config/tenant"
import { SoloTermsAcceptance } from "./terms-acceptance"
import { SOLO_REQUEST_LABELS } from "@/lib/solo-players/presentation"
import { useSoloResource, isSoloCacheKey } from "./use-solo-inbox"
import { soloSportsLabel, soloRequestContext } from "@/lib/solo-players/presentation"
import type { SoloRequestEntry, SoloRequestsData } from "@/types/solo-player-ui"
import type { SoloPlayerRequestAction } from "@/types/solo-players"

export const SoloRequestCard = ({ entry, userId, onResolved, onNavigate }: { entry: SoloRequestEntry; userId: string; onResolved: (message: string, accepted: boolean) => void; onNavigate?: () => void }) => {
  const { mutate } = useSWRConfig()
  const openPayment = usePaymentDialog()
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER">("TRANSFER")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [phone, setPhone] = useState("")
  const recipient = entry.recipient_user_id === userId
  const sender = entry.sender_user_id === userId
  const pending = entry.effective_status === "PENDING"
  const participant = recipient || sender
  const handleResolve = async (action: SoloPlayerRequestAction): Promise<void> => {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/solo-players/requests", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: entry.id, action, termsAccepted, ...(entry.enableTransferProof ? { paymentMethod } : {}) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      const accepted = result.request.status === "ACCEPTED"
      const message = accepted ? entry.tournament_id ? result.message || "Pareja formada. Revisá los requisitos de inscripción." : "Contacto aceptado. Ya pueden consultar el teléfono compartido." : `Solicitud ${SOLO_REQUEST_LABELS[result.request.status as keyof typeof SOLO_REQUEST_LABELS]?.toLowerCase() || "actualizada"}.`
      void mutate(isSoloCacheKey)
      onResolved(message, accepted)
      if (accepted && result.paymentRequired && result.inscriptionId && entry.tournament_id) {
        onNavigate?.()
        openPayment({ tournamentId: entry.tournament_id, tournamentName: entry.tournamentName || "Torneo", inscriptionId: result.inscriptionId })
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos resolver la solicitud."); void mutate(isSoloCacheKey) }
    finally { setBusy(false) }
  }
  const handleContact = async (): Promise<void> => {
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/solo-players/contact?requestId=${entry.id}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setPhone(body.phone)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos consultar el contacto.") }
    finally { setBusy(false) }
  }
  return <article className="space-y-4 rounded-xl border border-primary/15 border-t-4 border-t-primary bg-background p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="break-words font-semibold text-primary"><Link href={`/players/${entry.sender_player_id}`} onClick={onNavigate} className="underline-offset-4 hover:underline">{entry.senderName}</Link> → <Link href={`/players/${entry.recipient_player_id}`} onClick={onNavigate} className="underline-offset-4 hover:underline">{entry.recipientName}</Link></h3><p className="mt-1 text-sm text-muted-foreground">{soloRequestContext(entry)} · {recipient ? "Recibida" : sender ? "Enviada" : "Gestión del torneo"}</p></div><Badge variant="secondary">{SOLO_REQUEST_LABELS[entry.effective_status]}</Badge></div>
    <div className="grid gap-2 rounded-lg bg-primary/5 p-3 text-sm sm:grid-cols-2"><p><span className="font-medium">{entry.senderName}:</span> {soloSportsLabel(entry.senderSide, entry.senderHand)}</p><p><span className="font-medium">{entry.recipientName}:</span> {soloSportsLabel(entry.recipientSide, entry.recipientHand)}</p></div>
    <p className="text-xs text-muted-foreground">Enviada: {new Date(entry.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour12: false })}{entry.expires_at && pending ? ` · Solicitud vence: ${new Date(entry.expires_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour12: false })}` : ""}</p>
    {pending && !entry.is_actionable && <p className="text-sm text-muted-foreground">No se puede aceptar ahora: la publicación puede estar pausada o el torneo sin cupo. El estado se vuelve a validar al responder.</p>}
    {participant && <Button asChild variant="outline" size="sm"><Link href={`/players/${recipient ? entry.sender_player_id : entry.recipient_player_id}`} onClick={onNavigate}>Ver perfil de {recipient ? entry.senderName : entry.recipientName}</Link></Button>}
    {entry.tournament_id && <Link href={`/tournaments/${entry.tournament_id}`} onClick={onNavigate} className="block text-sm font-medium underline">Ver torneo</Link>}
    {recipient && pending && <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{entry.tournament_id ? "Al aceptar, forman pareja para este torneo." : "Al aceptar, podrán consultar el teléfono del otro."}</p>
      {entry.tournament_id && <SoloTermsAcceptance checked={termsAccepted} onCheckedChange={setTermsAccepted} disabled={busy} />}
      {entry.enableTransferProof && entry.allowCash && <div className="space-y-2"><label htmlFor={`payment-${entry.id}`} className="text-sm font-medium">Forma de pago</label><select id={`payment-${entry.id}`} value={paymentMethod} disabled={busy} onChange={event => setPaymentMethod(event.target.value as "CASH" | "TRANSFER")} className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="TRANSFER">Transferencia con comprobante</option><option value="CASH">Efectivo al organizador</option></select></div>}
    </div>}
    {pending && <div className="flex flex-wrap gap-2">
      {recipient && <><Button disabled={busy || !entry.is_actionable || (!!entry.tournament_id && !termsAccepted)} onClick={() => void handleResolve("ACCEPT")}>{busy ? "Aceptando…" : entry.tournament_id ? "Aceptar pareja" : "Aceptar contacto"}</Button><Button variant="outline" disabled={busy} onClick={() => void handleResolve("REJECT")}>Rechazar</Button></>}
      {sender && <Button variant="outline" disabled={busy} onClick={() => void handleResolve("WITHDRAW")}>Retirar solicitud</Button>}
      {!participant && <Button variant="outline" disabled={busy} onClick={() => void handleResolve("INVALIDATE")}>Dejar sin efecto</Button>}
    </div>}
    {entry.effective_status === "ACCEPTED" && participant && <div className="space-y-3 rounded-xl border border-accent bg-accent/25 p-4">
      <p className="text-sm">{entry.tournament_id ? entry.inscription_id ? "Pareja formada. La aprobación y el pago se consultan en la inscripción." : "La inscripción ya no está disponible. Cancelar no reactiva búsquedas automáticamente." : "Contacto compartido. Pueden coordinar directamente; no hay chat interno."}</p>
      <div className="flex flex-wrap items-center gap-3">{phone ? <div className="flex flex-wrap items-center gap-3"><a href={`tel:${phone}`} className="text-lg font-bold text-primary underline">{phone}</a><Button asChild size="sm"><a href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Coordinar por WhatsApp</a></Button></div> : <Button variant="outline" disabled={busy} onClick={handleContact}>Ver contacto compartido</Button>}
        {entry.tournament_id && entry.inscription_id && <><Button variant="outline" asChild><Link href={`/tournaments/${entry.tournament_id}`} onClick={onNavigate}>Ver inscripción</Link></Button>{entry.enableTransferProof && <Button data-payment-tournament={entry.tournament_id} onClick={() => { onNavigate?.(); openPayment({ tournamentId: entry.tournament_id!, tournamentName: entry.tournamentName || "Torneo", inscriptionId: entry.inscription_id! }) }}>Revisar pago y comprobante</Button>}</>}
      </div>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </article>
}

export const SoloRequestInbox = ({ requestId }: { requestId?: string }) => {
  const { user } = useUser()
  const [focusedId, setFocusedId] = useState(requestId || "")
  const [history, setHistory] = useState(false)
  const [offset, setOffset] = useState(0)
  const [notice, setNotice] = useState("")
  const url = `/api/solo-players/requests?history=${history}&offset=${offset}${focusedId ? `&requestId=${encodeURIComponent(focusedId)}` : ""}`
  const result = useSoloResource<SoloRequestsData>(url)
  if (!user) return <div className="space-y-4"><h1 className="text-3xl font-semibold">Solicitudes de pareja</h1><p>Iniciá sesión para ver tu bandeja.</p><Button asChild><Link href={`/login?redirectTo=${encodeURIComponent(`/jugadores-sueltos?vista=solicitudes${requestId ? `&solicitud=${requestId}` : ""}`)}`}>Iniciar sesión</Link></Button></div>
  return <div className="space-y-10">
    <header className="space-y-3"><Link href="/jugadores-sueltos" className="text-sm underline">Volver a jugadores sueltos</Link><h1 className="text-3xl font-semibold tracking-tight text-primary">Solicitudes de pareja</h1><p className="max-w-2xl text-muted-foreground">Respondé propuestas, consultá contactos aceptados y retomá los requisitos de tu pareja. Los avisos quedan guardados aunque el email se demore.</p></header>
    <section className="space-y-5" aria-label="Solicitudes">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{focusedId ? "Detalle de solicitud" : "Mis solicitudes de pareja"}</h2><Button variant="ghost" onClick={() => void result.mutate()}>Actualizar solicitudes</Button></div>
      <div className="flex flex-wrap gap-2"><Button variant={!history && !focusedId ? "default" : "outline"} onClick={() => { setFocusedId(""); setHistory(false); setOffset(0) }}>Activas</Button><Button variant={history && !focusedId ? "default" : "outline"} onClick={() => { setFocusedId(""); setHistory(true); setOffset(0) }}>Historial y contactos</Button></div>
      <p role="status" className="text-sm text-emerald-700">{notice}</p>
      {result.isLoading && <p role="status">Cargando solicitudes…</p>}
      {result.error && <p role="alert" className="text-sm text-destructive">{result.error.message}</p>}
      {result.data?.requests.length === 0 && <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{focusedId ? "La solicitud no está disponible para tu cuenta." : history ? "No hay solicitudes resueltas en esta página." : "No hay solicitudes activas. Las vencidas se consultan en el historial."}</p>}
      <div className="space-y-4">{result.data?.requests.map(entry => <SoloRequestCard key={entry.id} entry={entry} userId={user.id} onResolved={(message, accepted) => { setNotice(message); if (accepted && !focusedId) { setHistory(true); setOffset(0) } }} />)}</div>
      {!focusedId && <div className="flex justify-between"><Button variant="outline" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}>Página anterior</Button><Button variant="outline" disabled={!result.data?.hasMore} onClick={() => setOffset(value => value + 50)}>Más solicitudes</Button></div>}
    </section>
  </div>
}
