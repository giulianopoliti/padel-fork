import Link from "next/link"
import { TPE_BILLING_PAYMENT_ALIAS } from "@/lib/billing/payment-details"
import type { BillingPendingWeek } from "@/lib/billing/types"

const formatAmount = (amount: number): string => new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", maximumFractionDigits: 0,
}).format(amount)

const formatDate = (date: string): string => new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
}).format(new Date(`${date}T12:00:00Z`))

export const PaymentSummary = ({ weeks, basePath }: { weeks: BillingPendingWeek[]; basePath: string }) => {
  const amountArs = weeks.reduce((sum, week) => sum + week.amountArs, 0)
  return <section aria-label="Resumen de pagos pendientes" className="grid gap-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:grid-cols-2 sm:p-6">
    <div className="space-y-2">
      <h2 className="text-xl font-semibold" aria-live="polite">{weeks.length === 0 ? "No hay semanas pendientes" : `${weeks.length} ${weeks.length === 1 ? "semana pendiente" : "semanas pendientes"} de pago`}</h2>
      <p className="text-sm">Saldo pendiente: <strong className="tabular-nums">{formatAmount(amountArs)}</strong></p>
      <p className="text-xs text-amber-800">Incluye la semana actual y las anteriores, independientemente de la semana que estés consultando.</p>
      {weeks.length > 0 && <details className="pt-1">
        <summary className="cursor-pointer text-sm font-medium underline underline-offset-4">Ver semanas pendientes</summary>
        <ul className="mt-3 space-y-2 text-sm">
          {weeks.map((week) => <li key={week.weekStart}>
            <Link href={`${basePath}?week=${week.weekStart}`} className="flex flex-wrap justify-between gap-x-3 gap-y-1 rounded px-1 py-1 underline underline-offset-4 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">
              <span>{formatDate(week.weekStart)} al {formatDate(week.weekEnd)}</span><span className="font-semibold tabular-nums">{formatAmount(week.amountArs)}</span>
            </Link>
          </li>)}
        </ul>
      </details>}
    </div>
    <div className="space-y-2 border-t border-amber-200 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
      <h2 className="text-sm font-medium">Alias para transferencias</h2>
      <p className="select-all break-all text-2xl font-semibold tracking-tight">{TPE_BILLING_PAYMENT_ALIAS}</p>
      <p className="text-sm text-amber-800">Los pagos se reflejan cuando administración los verifica.</p>
    </div>
  </section>
}
