"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { Users, Plus, Search, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getTenantBranding } from "@/config/tenant"
import { useUser } from "@/contexts/user-context"
import { SoloPostForm } from "./solo-post-form"
import { useSoloDirectory } from "./use-solo-directory"
import { SoloRequestForm } from "./solo-request-form"
import { getSoloPostLabel, getSoloPairLabel } from "@/lib/solo-players/presentation"
import type { SoloOwnPost } from "@/types/solo-player-ui"
import type { SoloPlayerDirectoryEntry } from "@/types/solo-players"

const selectClass = "h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const PublicContact = ({ post }: { post: SoloPlayerDirectoryEntry }) => {
  const [phone, setPhone] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const handleReveal = async (): Promise<void> => {
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/solo-players/contact?postId=${encodeURIComponent(post.id)}`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setPhone(result.phone)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cargar el contacto.") }
    finally { setBusy(false) }
  }
  return <div className="space-y-2">
    {phone ? <a href={`tel:${phone}`} className="text-sm font-medium underline">{phone}</a> : <Button variant="outline" disabled={busy} onClick={handleReveal}>{busy ? "Consultando…" : "Ver teléfono público"}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

export const SoloDirectory = ({ tournamentId }: { tournamentId?: string }) => {
  const { user, authState } = useUser()
  const { data, error, loading, reload } = useSoloDirectory()
  const id = useId()
  const [scope, setScope] = useState(tournamentId || "all")
  const [category, setCategory] = useState("")
  const [side, setSide] = useState("")
  const [hand, setHand] = useState("")
  const [editor, setEditor] = useState<SoloOwnPost | "new" | null>(null)
  const [busyPostId, setBusyPostId] = useState<string | null>(null)
  const [withdrawId, setWithdrawId] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState("")
  const [notice, setNotice] = useState("")
  const [requestPost, setRequestPost] = useState<SoloPlayerDirectoryEntry | null>(null)
  const [requestBusy, setRequestBusy] = useState(false)

  const handleStatus = async (postId: string, status: "ACTIVE" | "PAUSED" | "WITHDRAWN"): Promise<void> => {
    setBusyPostId(postId)
    setMutationError("")
    try {
      const response = await fetch("/api/solo-players", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, status }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setWithdrawId(null)
      setNotice(status === "WITHDRAWN" ? "Búsqueda retirada. Podés crear otra cuando quieras." : status === "PAUSED" ? "Búsqueda pausada." : "Búsqueda reactivada.")
      reload()
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : "No pudimos actualizar la búsqueda.") }
    finally { setBusyPostId(null) }
  }

  if (!user) return authState === "guest" ? <div className="space-y-4"><h1 className="text-3xl font-semibold">Jugadores sueltos</h1><p>Iniciá sesión para encontrar pareja.</p><Button asChild><Link href="/login?role=PLAYER&redirectTo=%2Fjugadores-sueltos">Iniciar sesión</Link></Button></div> : <p role="status">Cargando tu sesión…</p>
  if (loading && !data) return <p role="status" className="py-16 text-center text-muted-foreground">Cargando jugadores sueltos…</p>
  if (error) return <div className="space-y-4 rounded-lg border p-6"><p role="alert">{error}</p><div className="flex flex-wrap gap-3"><Button onClick={reload}>Volver a intentar</Button><Button asChild variant="outline"><Link href="/login?role=PLAYER&redirectTo=%2Fjugadores-sueltos">Iniciar sesión</Link></Button></div></div>
  if (!data) return null
  const tournamentName = (value: string | null): string => value ? data.tournaments.find(t => t.id === value)?.name || "Torneo" : "Sin torneo definido"
  const selectedTournament = scope === "all" || scope === "general" ? undefined : scope
  const canPublish = !!data.profile && (!selectedTournament || data.tournaments.some(t => t.id === selectedTournament && t.acceptsInterest))
    && !data.pairs.some(pair => pair.tournament_id === selectedTournament)
  const filtered = data.directory.filter(post => (!category || post.category_name === category) && (!side || post.preferred_side === side)
    && (!hand || post.preferred_hand === hand) && (scope === "all" || (scope === "general" ? !post.tournament_id : post.tournament_id === scope)))
  const ownPosts = data.ownPosts.filter(post => scope === "all" || (scope === "general" ? !post.tournament_id : post.tournament_id === scope))
  // All inscriptions still prevent duplicate searches; this list only shows active pairs formed here.
  const visiblePairs = data.pairs.filter(pair => pair.formedViaSoloPlayers && !pair.isEliminated
    && (scope === "all" || pair.tournament_id === scope))

  return <div className={`${getTenantBranding().tournaments.theme.className} space-y-10`} aria-busy={loading}>
    <div className="flex flex-col justify-between gap-5 rounded-2xl bg-primary p-6 text-primary-foreground sm:flex-row sm:items-end sm:p-8">
      <div className="max-w-2xl space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Encontrá con quién jugar</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Jugadores sueltos</h1>
        <p className="text-base leading-7 text-primary-foreground/80">Una pareja empieza por encontrar a alguien. Explorá jugadores de tu categoría o publicá tu disponibilidad.</p>
      </div>
      <div className="flex shrink-0 flex-col gap-2"><Button className="bg-accent text-accent-foreground hover:bg-accent/85" size="lg" disabled={!canPublish} onClick={() => { setNotice(""); setEditor("new") }}><Plus className="mr-2 h-4 w-4" />Publicar mi búsqueda</Button></div>
    </div>
    {!data.profile && <p className="rounded-lg border p-4 text-sm">Para publicar necesitás un perfil de jugador. <Link href="/edit-profile" className="underline">Completá tu perfil</Link>.</p>}
    <p className="flex items-start gap-3 rounded-lg border border-accent/60 bg-accent/15 p-4 text-sm leading-6 text-primary"><ShieldCheck className="mt-1 h-4 w-4 shrink-0" />Publicar o enviar una solicitud no te inscribe ni reserva cupo. Vos elegís si tu teléfono es público.</p>
    <Button asChild variant="outline"><Link href="/jugadores-sueltos?vista=solicitudes">Ver mis solicitudes y contactos</Link></Button>
    <p role="status" className="text-sm text-emerald-700">{notice}</p>
    {mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}

    <section aria-labelledby={`${id}-directory`} className="space-y-5">
      <div><h2 id={`${id}-directory`} className="text-xl font-semibold">Jugadores que buscan pareja</h2><p className="mt-1 text-sm text-muted-foreground">Interesados en jugar; este listado es independiente de las parejas inscriptas.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label htmlFor={`${id}-filter-scope`} className="space-y-2 text-sm font-medium"><span>Ámbito o torneo</span><select id={`${id}-filter-scope`} className={selectClass} value={scope} onChange={event => setScope(event.target.value)}><option value="all">Todos los avisos</option><option value="general">Sin torneo definido</option>{data.tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label htmlFor={`${id}-filter-category`} className="space-y-2 text-sm font-medium"><span>Categoría</span><select id={`${id}-filter-category`} className={selectClass} value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas las categorías</option>{data.categories.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label htmlFor={`${id}-filter-side`} className="space-y-2 text-sm font-medium"><span>Lado</span><select id={`${id}-filter-side`} className={selectClass} value={side} onChange={event => setSide(event.target.value)}><option value="">Cualquier lado</option><option value="DRIVE">Drive</option><option value="REVES">Revés</option></select></label>
        <label htmlFor={`${id}-filter-hand`} className="space-y-2 text-sm font-medium"><span>Mano</span><select id={`${id}-filter-hand`} className={selectClass} value={hand} onChange={event => setHand(event.target.value)}><option value="">Cualquier mano</option><option value="RIGHT">Diestro</option><option value="LEFT">Zurdo</option></select></label>
      </div>
      <p role="status" className="text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? "publicación" : "publicaciones"}</p>
      {filtered.length === 0 ? <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-5 py-12 text-center"><Search className="h-7 w-7 text-muted-foreground" /><h3 className="font-medium">Todavía no hay búsquedas con estos filtros</h3><p className="max-w-md text-sm text-muted-foreground">Probá otra categoría o publicá tu disponibilidad para que puedan encontrarte.</p><Button variant="outline" onClick={() => { setScope("all"); setCategory(""); setSide(""); setHand("") }}>Limpiar filtros</Button></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(post => <article key={post.id} className="flex flex-col gap-4 rounded-xl border border-primary/15 border-t-4 border-t-primary bg-background p-5 shadow-sm">
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/30"><Users className="h-5 w-5 text-primary" /></div><div className="min-w-0"><h3 className="break-words font-semibold text-primary"><Link href={`/players/${post.player_id}`} className="underline-offset-4 hover:underline">{[post.first_name, post.last_name].filter(Boolean).join(" ") || "Jugador"}{post.owner_user_id === data.userId ? " (vos)" : ""}</Link></h3><p className="break-words text-sm text-muted-foreground">{tournamentName(post.tournament_id)}</p></div></div>
        <div className="flex flex-wrap gap-2"><Badge variant="secondary">Categoría {post.category_name}</Badge><Badge variant="outline">{post.preferred_side === "DRIVE" ? "Drive" : "Revés"}</Badge><Badge variant="outline">{post.preferred_hand === "LEFT" ? "Zurdo" : "Diestro"}</Badge></div>
        <div className="mt-auto space-y-3 border-t pt-4"><p className="text-sm font-medium">{!post.is_actionable ? "Cupos llenos · búsqueda sin reserva" : data.pendingPostIds.includes(post.id) ? "Solicitud pendiente" : "Buscando pareja"}</p>{post.public_phone && post.is_actionable ? <PublicContact key={`${post.id}-${post.created_at}`} post={post} /> : <p className="text-xs leading-5 text-muted-foreground">{post.public_phone ? "Contacto no disponible mientras el torneo esté lleno." : "Teléfono oculto. Sólo se comparte al aceptar una solicitud."}</p>}
          {post.owner_user_id !== data.userId && data.profile && <Button className="w-full" disabled={!post.is_actionable || data.pendingPostIds.includes(post.id) || data.pairs.some(pair => pair.tournament_id === post.tournament_id)} onClick={() => setRequestPost(post)}>{post.tournament_id ? "Proponer formar pareja" : "Solicitar contacto"}</Button>}
        </div>
      </article>)}</div>}
    </section>

    <section aria-labelledby={`${id}-mine`} className="space-y-4">
      <h2 id={`${id}-mine`} className="text-xl font-semibold">Mis publicaciones y parejas</h2>
      {ownPosts.length === 0 && visiblePairs.length === 0 && <p className="text-sm text-muted-foreground">Todavía no publicaste una búsqueda en este ámbito. Podés mantener una general y otra para cada torneo.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {ownPosts.map(post => {
          const label = getSoloPostLabel(post)
          const closed = !!post.tournament_id && !data.tournaments.some(t => t.id === post.tournament_id && t.acceptsInterest)
          const editable = ["Buscando pareja", "Pausada"].includes(label) && !closed
          return <article key={post.id} className="space-y-3 rounded-lg border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{tournamentName(post.tournament_id)}</h3><Badge variant="secondary">{closed && editable === false && ["ACTIVE", "PAUSED"].includes(post.status) ? "Torneo cerrado" : label}</Badge></div>
            <p className="text-sm text-muted-foreground">Categoría {post.category_name} · {post.preferred_side === "DRIVE" ? "Drive" : "Revés"} · {post.preferred_hand === "LEFT" ? "Zurdo" : "Diestro"}</p>
            {post.expires_at && <p className="text-xs text-muted-foreground">Vence: {new Date(post.expires_at).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p>}
            {data.pendingPostIds.includes(post.id) && <Badge variant="outline">Solicitud pendiente</Badge>}
            {editable && <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busyPostId !== null} onClick={() => setEditor(post)}>Editar</Button>
              <Button variant="outline" size="sm" disabled={busyPostId !== null} onClick={() => void handleStatus(post.id, post.status === "PAUSED" ? "ACTIVE" : "PAUSED")}>{post.status === "PAUSED" ? "Reactivar" : "Pausar"}</Button>
              <Button variant="ghost" size="sm" disabled={busyPostId !== null} onClick={() => setWithdrawId(post.id)}>Retirar</Button>
            </div>}
            {withdrawId === post.id && <div className="space-y-2 border-t pt-3"><p className="text-sm">Al retirar, las solicitudes pendientes dejan de poder aceptarse. Para volver a buscar tendrás que publicar nuevamente.</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="destructive" disabled={busyPostId !== null} onClick={() => void handleStatus(post.id, "WITHDRAWN")}>Confirmar retiro</Button><Button size="sm" variant="outline" disabled={busyPostId !== null} onClick={() => setWithdrawId(null)}>Conservar</Button></div></div>}
          </article>
        })}
        {visiblePairs.map(pair => <article key={pair.inscription_id} className="space-y-2 rounded-lg border p-4"><h3 className="font-medium">{tournamentName(pair.tournament_id)}</h3><p className="text-sm">{getSoloPairLabel(pair)}</p><Link href={`/tournaments/${pair.tournament_id}`} className="inline-block text-sm underline">Ver inscripción y completar requisitos</Link></article>)}
      </div>
    </section>

    <Dialog open={editor !== null} onOpenChange={open => { if (!open) setEditor(null) }}>
      <DialogContent className={`${getTenantBranding().tournaments.theme.className} max-h-[90dvh] overflow-y-auto border-t-4 border-t-accent sm:max-w-xl`}><DialogHeader><DialogTitle>{editor === "new" ? "Publicar mi búsqueda" : "Editar búsqueda"}</DialogTitle><DialogDescription>Quiero jugar y todavía no tengo pareja. Publicar no confirma inscripción ni reserva cupo.</DialogDescription></DialogHeader>{editor && <SoloPostForm data={data} post={editor === "new" ? undefined : editor} tournamentId={editor === "new" ? selectedTournament : undefined} onSaved={() => { setEditor(null); setNotice("Búsqueda guardada. No se creó ninguna inscripción."); reload() }} onCancel={() => setEditor(null)} />}</DialogContent>
    </Dialog>
    <Dialog open={requestPost !== null} onOpenChange={open => { if (!open && !requestBusy) setRequestPost(null) }}>
      <DialogContent className={`${getTenantBranding().tournaments.theme.className} max-h-[90dvh] overflow-y-auto border-t-4 border-t-accent sm:max-w-lg`}><DialogHeader><DialogTitle>Enviar solicitud</DialogTitle><DialogDescription>{requestPost ? `Para ${[requestPost.first_name, requestPost.last_name].filter(Boolean).join(" ") || "el jugador"}` : "Solicitud de pareja"}</DialogDescription></DialogHeader>
        {requestPost && <SoloRequestForm post={requestPost} profile={data.profile} onBusy={setRequestBusy} onSent={() => { setRequestPost(null); setNotice("Solicitud enviada. Podés seguirla en la bandeja."); reload() }} />}
      </DialogContent>
    </Dialog>
  </div>
}
