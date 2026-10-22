"use client"

import { Button } from "@/components/ui/button"

export default function BillingError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-6">
      <h2 className="text-lg font-semibold text-slate-900">No se pudieron cargar los cobros</h2>
      <p className="text-sm text-slate-700">Reintentá la consulta. Si el problema continúa, revisá la conexión y la conciliación de torneos, cuotas y pagos antes de registrar nuevos cobros.</p>
      <Button variant="outline" onClick={reset}>Reintentar</Button>
    </div>
  )
}
