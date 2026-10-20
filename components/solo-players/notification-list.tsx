"use client"
import { useState } from "react"
import Link from "next/link"
import { Bell, ArrowUpRight } from "lucide-react"
import { useSWRConfig } from "swr"
import { useUser } from "@/contexts/user-context"
import { Button } from "@/components/ui/button"
import { getTenantBranding } from "@/config/tenant"
import { useSoloResource, isSoloNotificationCacheKey } from "./use-solo-inbox"
import { SoloNotificationDetail, markSoloNotificationRead } from "./notification-detail"
import type { SoloNotificationsData, SoloNotificationEntry } from "@/types/solo-player-ui"

export const SoloNotificationList = () => {
  const { user, userDetails } = useUser()
  const [offset, setOffset] = useState(0), [unread, setUnread] = useState(false)
  const [selected, setSelected] = useState<SoloNotificationEntry | null>(null), [error, setError] = useState("")
  const { mutate } = useSWRConfig()
  const result = useSoloResource<SoloNotificationsData>(`/api/solo-players/notifications?offset=${offset}&unread=${unread}`)
  const manager = ["ADMIN", "CLUB", "ORGANIZADOR"].includes(userDetails?.role || "")
  const handleOpen = async (notification: SoloNotificationEntry): Promise<void> => {
    setSelected(notification); setError("")
    try { await markSoloNotificationRead(notification); await mutate(isSoloNotificationCacheKey) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos marcar el aviso.") }
  }
  if (!user) return <div className="space-y-4"><h1 className="text-3xl font-semibold">Notificaciones</h1><Button asChild><Link href="/login?redirectTo=%2Fnotificaciones">Iniciar sesión</Link></Button></div>
  return <div className={`${getTenantBranding().tournaments.theme.className} space-y-6`}>
    <header className="rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Bell aria-hidden="true" className="h-5 w-5" /></div><p className="text-xs font-semibold uppercase tracking-widest text-accent">{manager ? "Centro del organizador" : "Tu actividad"}</p><h1 className="mt-2 text-3xl font-semibold">Notificaciones</h1><p className="mt-3 max-w-2xl text-sm leading-6">{manager ? "Seguí las propuestas de pareja y las uniones de tus torneos. Abrí un aviso para revisar el detalle o continuá en Jugadores sueltos para gestionar las inscripciones." : "Propuestas de pareja, contactos compartidos y novedades de tus búsquedas. Abrí un aviso para ver el detalle."}</p><Link href="/jugadores-sueltos?vista=solicitudes" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent underline-offset-4 hover:underline">{manager ? "Gestionar Jugadores sueltos" : "Ver mis solicitudes"}<ArrowUpRight className="h-4 w-4" /></Link></header>
    <section className="space-y-4" aria-label="Notificaciones">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><Button variant={!unread ? "default" : "outline"} onClick={() => { setUnread(false); setOffset(0) }}>Todas</Button><Button variant={unread ? "default" : "outline"} onClick={() => { setUnread(true); setOffset(0) }}>Sin leer ({result.data?.unreadCount || 0})</Button></div></div>
      {(error || result.error) && <p role="alert" className="text-sm text-destructive">{error || result.error?.message}</p>}
      {result.isLoading && <p role="status">Cargando avisos…</p>}
      {result.data?.notifications.length === 0 && <p className="rounded-xl border border-dashed bg-primary/5 p-8 text-center text-sm text-muted-foreground">{unread ? "Estás al día. No quedan notificaciones sin leer." : "Todavía no hay notificaciones en esta página."}</p>}
      <ul className="space-y-3">{result.data?.notifications.map(notification => <li key={notification.id} className={`rounded-xl border border-primary/15 ${notification.read_at ? "bg-background" : "border-l-4 border-l-primary bg-primary/5"}`}>
        <button type="button" onClick={() => void handleOpen(notification)} className="w-full space-y-2 p-5 text-left hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="block font-semibold text-primary">{notification.title || "Solicitud de pareja"}{notification.read_at ? "" : " · Sin leer"}</span><span className="block text-sm text-muted-foreground">{notification.description}</span><span className="block text-xs text-muted-foreground">{new Date(notification.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour12: false })}</span></button>
        {notification.playerId && <Link href={`/players/${notification.playerId}`} className="mx-5 mb-4 inline-block text-xs font-medium text-primary underline">Ver perfil de {notification.playerName || "jugador"}</Link>}
        {notification.tournamentId && <Link href={`/tournaments/${notification.tournamentId}`} className="mx-5 mb-4 inline-block text-xs font-medium text-primary underline">Ver torneo</Link>}
      </li>)}</ul>
      <div className="flex justify-between"><Button variant="outline" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>Página anterior</Button><Button variant="outline" disabled={!result.data?.hasMore} onClick={() => setOffset(value => value + 20)}>Más avisos</Button></div>
    </section>
    {selected && <SoloNotificationDetail notification={selected} onClose={() => setSelected(null)} />}
  </div>
}
