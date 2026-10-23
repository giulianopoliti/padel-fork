"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import { AlertCircle } from "lucide-react"
import { getTenantBranding } from "@/config/tenant"
import { useUser } from "@/contexts/user-context"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { BillingNoticeData } from "@/lib/billing/portal-service"

const fetchNotice = async ([url]: readonly [string, string]): Promise<BillingNoticeData> => {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error("No se pudo consultar el aviso")
  return response.json()
}

export const PaymentNotice = () => {
  const { user, userDetails, authState } = useUser()
  const pathname = usePathname()
  const eligible = getTenantBranding().key === "padel-elite" && authState === "ready" && userDetails?.role === "ORGANIZADOR" && !!user
  const { data } = useSWR(eligible ? ["/api/billing/notice", user!.id] as const : null, fetchNotice, {
    refreshInterval: 60_000, revalidateOnFocus: true, shouldRetryOnError: false,
  })
  const [open, setOpen] = useState(false)
  const sessionKey = user ? `tpe-billing-notice:${user.id}:${user.last_sign_in_at ?? "session"}` : null
  const active = eligible && data?.enabled === true

  useEffect(() => {
    if (!active || pathname === "/cobros" || !sessionKey) { setOpen(false); return }
    try {
      if (sessionStorage.getItem(sessionKey)) return
      sessionStorage.setItem(sessionKey, "seen")
    } catch { /* El aviso sigue disponible cuando el navegador bloquea storage. */ }
    setOpen(true)
  }, [active, pathname, sessionKey])

  if (!active || pathname === "/cobros") return null
  return <>
    <aside aria-label="Aviso de pago del servicio" className="border-b border-amber-200 bg-amber-50 text-amber-950">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="flex items-start gap-2 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Regularizá tu cuota.</strong> Evitá la suspensión del servicio.</span></p>
        <Button asChild size="sm" variant="outline" className="border-amber-300 bg-white text-amber-950"><Link href="/cobros" onClick={() => setOpen(false)}>Ver pagos pendientes</Link></Button>
      </div>
    </aside>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-lg">
        <DialogHeader>
          <DialogTitle className="pr-5 text-xl">Regularizá tu cuota</DialogTitle>
          <DialogDescription>Para evitar la suspensión del servicio de TPE Padel, regularizá el pago de tu cuota. En Cobros podés consultar el detalle por torneo, los jugadores, las tarifas y los importes, y descargar el PDF.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Ver más tarde</Button>
          <Button asChild><Link href="/cobros" onClick={() => setOpen(false)}>Ir a Cobros</Link></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
