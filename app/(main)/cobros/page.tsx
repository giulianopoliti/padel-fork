import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { BillingAccessError, getBillingNotice, requireBillingPortalAccess } from "@/lib/billing/portal-service"
import { getTenantBillingDashboard } from "@/lib/billing/service"
import { BillingClient } from "../admin/cobros/billing-client"

export const metadata: Metadata = { title: "Cobros · TPE Padel", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

const CobrosPage = async ({ searchParams }: { searchParams: Promise<{ week?: string }> }) => {
  await requireBillingPortalAccess().catch((error: unknown) => {
    if (error instanceof BillingAccessError) {
      if (error.status === 401) redirect("/login?redirectTo=%2Fcobros")
      notFound()
    }
    throw error
  })
  const { week } = await searchParams
  const requestedWeek = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : null
  const [data, notice] = await Promise.all([getTenantBillingDashboard(requestedWeek, { readOnly: true }), getBillingNotice()])
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
    {notice.enabled && <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950"><h2 className="font-semibold">Regularizá tu cuota</h2><p className="mt-1 text-sm">Regularizá el pago para evitar la suspensión del servicio. Consultá el detalle de cobros y descargá el PDF de cada semana.</p></div>}
    <BillingClient data={data} readOnly />
  </main>
}

export default CobrosPage
