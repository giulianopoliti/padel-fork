"use client"
import { useState } from "react"
import Link from "next/link"
import { Bell, CheckCheck } from "lucide-react"
import { useSWRConfig } from "swr"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getTenantBranding } from "@/config/tenant"
import { useSoloResource, isSoloNotificationCacheKey } from "./use-solo-inbox"
import { SoloNotificationDetail, markSoloNotificationRead } from "./notification-detail"
import type { SoloNotificationsData, SoloNotificationEntry } from "@/types/solo-player-ui"

export const SoloNotificationBell = () => {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<SoloNotificationEntry | null>(null), [readError, setReadError] = useState("")
  const { mutate } = useSWRConfig()
  const { data, error, isLoading } = useSoloResource<SoloNotificationsData>("/api/solo-players/notifications?unread=true")
  const count = data?.unreadCount || 0
  const handleOpen = async (notification: SoloNotificationEntry): Promise<void> => {
    setOpen(false); setSelected(notification); setReadError("")
    try { await markSoloNotificationRead(notification); await mutate(isSoloNotificationCacheKey) }
    catch (cause) { setReadError(cause instanceof Error ? cause.message : "No pudimos actualizar el aviso.") }
  }
  return <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" title="Notificaciones" aria-label={`Notificaciones${count ? `, ${count} sin leer` : ""}`} className={`${getTenantBranding().tournaments.theme.className} relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white`}>
        <Bell className="h-5 w-5" aria-hidden="true" />{count > 0 && <span className="absolute right-0 top-0 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
      </button></PopoverTrigger>
      <PopoverContent align="end" className={`${getTenantBranding().tournaments.theme.className} w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border-primary/15 p-0`}>
        <div className="bg-primary px-5 py-4 text-primary-foreground"><h2 className="font-semibold">Notificaciones</h2><p className="mt-1 text-xs text-accent">{count} sin leer</p></div>
        <div className="max-h-80 overflow-y-auto">
          {isLoading && <p role="status" className="p-5 text-sm">Cargando avisos…</p>}
          {(error || readError) && <p role="alert" className="p-4 text-sm text-destructive">{error?.message || readError}</p>}
          {data && !data.notifications?.length && <div className="space-y-2 p-6 text-center"><CheckCheck className="mx-auto h-6 w-6 text-primary" aria-hidden="true" /><p className="text-sm">Estás al día. No tenés avisos sin leer.</p></div>}
          {data?.notifications?.map(notification => <button key={notification.id} type="button" onClick={() => void handleOpen(notification)} className="block w-full border-b border-primary/10 px-5 py-4 text-left transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><span className="block text-sm font-semibold text-primary">{notification.title || "Solicitud de pareja"}</span><span className="mt-1 block text-xs text-muted-foreground">{notification.description}</span></button>)}
        </div>
        <Link href="/notificaciones" onClick={() => setOpen(false)} className="block bg-primary/5 p-4 text-center text-sm font-semibold text-primary hover:underline">Ver todas las notificaciones</Link>
      </PopoverContent>
    </Popover>
    {selected && <SoloNotificationDetail notification={selected} onClose={() => setSelected(null)} />}
    {readError && !open && <span role="alert" className="sr-only">{readError}</span>}
  </>
}
