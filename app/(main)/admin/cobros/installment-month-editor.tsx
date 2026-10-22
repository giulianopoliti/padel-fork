"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { assignBillingInstallmentMonth } from "@/app/api/admin/billing/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { isBillingMonth } from "@/lib/billing/financials"

export const InstallmentMonthEditor = ({ installmentId }: { installmentId: string }) => {
  const [month, setMonth] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { toast } = useToast()
  const handleSaveMonth = () => startTransition(async () => {
    const result = await assignBillingInstallmentMonth({ installmentId, billingMonth: `${month}-01` })
    if (!result.success) {
      toast({ title: "No se asignó el mes", description: result.error, variant: "destructive" })
      return
    }
    toast({ title: "Mes facturado asignado" })
    router.refresh()
  })
  return (
    <div className="mt-2 space-y-2">
      <Label htmlFor={`month-${installmentId}`} className="text-xs">Mes facturado de esta cuota</Label>
      <div className="flex flex-wrap gap-2">
        <Input id={`month-${installmentId}`} type="month" min="2000-01" max="9998-12"
          className="w-44" value={month} onChange={(event) => setMonth(event.target.value)} disabled={isPending} />
        <Button size="sm" variant="outline" disabled={isPending || !isBillingMonth(`${month}-01`)} onClick={handleSaveMonth}>
          Asignar mes
        </Button>
      </div>
      <p className="text-xs text-slate-500">Elegí el período facturado. La asignación queda registrada.</p>
    </div>
  )
}
