"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { BellRing } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { setBillingNoticeEnabled } from "@/app/api/admin/billing/notice"
import type { BillingNoticeData } from "@/lib/billing/portal-service"

export const NoticeManager = ({ data }: { data: BillingNoticeData }) => {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const handleToggle = (enabled: boolean): void => {
    setError(null)
    setFeedback(null)
    startTransition(async () => {
      const result = await setBillingNoticeEnabled(enabled)
      if (!result.success) { setError(result.error); return }
      setFeedback(enabled ? "Aviso activado para el organizador de TPE." : "Aviso desactivado.")
      router.refresh()
    })
  }
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5" />Aviso de pago · TPE</CardTitle>
      <CardDescription>El organizador ve el mismo detalle de cobros de abajo, en <Link className="underline underline-offset-4" href="/cobros">/cobros</Link>, con descarga de PDF y sin controles de edición.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {!data.available ? <p role="status" className="text-sm text-amber-800">El interruptor estará disponible después de publicar la migración de base de datos. El detalle de cobros ya está disponible en /cobros.</p> :
        <div className="flex items-center justify-between gap-4 rounded-lg border bg-slate-50 p-4">
          <div className="space-y-1">
            <Label htmlFor="billing-notice-enabled" className="text-base font-semibold">Mostrar aviso de pago</Label>
            <p id="billing-notice-description" className="max-w-2xl text-sm text-slate-600">{data.enabled ? "Activado." : "Desactivado."} “Regularizá tu cuota para evitar la suspensión del servicio”. Sólo vos lo activás o desactivás; no cambia al registrar pagos.</p>
          </div>
          <Switch id="billing-notice-enabled" aria-describedby="billing-notice-description" checked={data.enabled} disabled={isPending} onCheckedChange={handleToggle} />
        </div>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {feedback && <p role="status" className="text-sm text-emerald-700">{feedback}</p>}
    </CardContent>
  </Card>
}
