"use client"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getTenantBranding } from "@/config/tenant"
import { SOLO_EVENT_LABELS, soloSportsLabel, getSoloPostLabel } from "@/lib/solo-players/presentation"
import { SoloRequestCard } from "./request-inbox"
import { useSoloResource } from "./use-solo-inbox"
import type { SoloNotificationEntry, SoloRequestsData, SoloNotificationsData } from "@/types/solo-player-ui"

export const SoloNotificationDetail = ({ notification, onClose }: { notification: SoloNotificationEntry | null; onClose: () => void }) => {
  const searchEvent = notification?.event_type === "PLAYER_SEARCHING"
  const result = useSoloResource<SoloRequestsData>(notification?.request_id ? `/api/solo-players/requests?requestId=${notification.request_id}` : null)
  const searchResult = useSoloResource<SoloNotificationsData>(searchEvent && notification ? `/api/solo-players/notifications?notificationId=${notification.id}` : null)
  const search = searchResult.data?.notifications[0]?.search
  return <Dialog open={!!notification} onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className={`${getTenantBranding().tournaments.theme.className} max-h-[90dvh] overflow-y-auto border-t-4 border-t-accent sm:max-w-2xl`}>
      <DialogHeader><DialogTitle className="pr-5 text-primary">{notification ? SOLO_EVENT_LABELS[notification.event_type] : "Detalle de notificación"}</DialogTitle><DialogDescription>{searchEvent ? "Un jugador publicó una búsqueda para tu torneo o circuito." : "Consultá el perfil y los datos de la propuesta."}</DialogDescription></DialogHeader>
      {searchEvent && <div className="space-y-4">
        {searchResult.isLoading && <p role="status">Cargando búsqueda…</p>}
        {searchResult.error && <p role="alert" className="text-sm text-destructive">{searchResult.error.message}</p>}
        {search && <>
          <p className="font-semibold text-primary">{search.playerName} · {search.tournamentName || `Circuito ${search.organizationName || "general"}`}</p>
          <p className="text-sm">Categoría {search.category} · {soloSportsLabel(search.side, search.hand)}</p>
          <p className="text-sm">Estado actual: {getSoloPostLabel({ status: search.status, expires_at: search.expiresAt })}. La búsqueda no reserva cupo.</p>
          <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/players/${search.playerId}`} onClick={onClose}>Ver perfil</Link></Button>{search.tournamentId && <Button asChild variant="outline"><Link href={`/tournaments/${search.tournamentId}`} onClick={onClose}>Ver torneo</Link></Button>}</div>
          <Button asChild><Link href={search.tournamentId ? `/jugadores-sueltos?torneo=${search.tournamentId}` : "/jugadores-sueltos"} onClick={onClose}>Ver jugadores sueltos</Link></Button>
        </>}
        {searchResult.data && !search && <p>Esta búsqueda ya no está disponible para tu cuenta.</p>}
      </div>}
      {result.isLoading && <p role="status">Cargando solicitud…</p>}
      {result.error && <p role="alert" className="text-sm text-destructive">{result.error.message}</p>}
      {result.data?.requests.map(entry => <SoloRequestCard key={entry.id} entry={entry} userId={result.data!.userId} onNavigate={onClose} onResolved={() => { void result.mutate() }} />)}
      {result.data?.requests.length === 0 && <p>Esta solicitud ya no está disponible para tu cuenta.</p>}
      {!searchEvent && <Button asChild variant="outline"><Link href={`/jugadores-sueltos?vista=solicitudes&solicitud=${notification?.request_id || ""}`} onClick={onClose}>Ver todo en Jugadores sueltos</Link></Button>}
    </DialogContent>
  </Dialog>
}

export const markSoloNotificationRead = async (notification: SoloNotificationEntry): Promise<void> => {
  if (notification.read_at) return
  const response = await fetch("/api/solo-players/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: notification.id }) })
  if (!response.ok) {
    const body = await response.json()
    throw new Error(body.error || "No pudimos marcar el aviso como leído.")
  }
}
