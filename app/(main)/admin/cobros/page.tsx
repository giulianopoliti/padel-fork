import { BillingClient } from "./billing-client"
import { getTenantBillingDashboard } from "@/lib/billing/service"
import { getTenantBranding } from "@/config/tenant"
import { getBillingNotice } from "@/lib/billing/portal-service"
import { NoticeManager } from "./notice-manager"

const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const params = await searchParams
  const requestedWeek = params.week && WEEK_PATTERN.test(params.week) ? params.week : null
  const data = await getTenantBillingDashboard(requestedWeek)

  const portal = getTenantBranding().key === "padel-elite" ? await getBillingNotice() : null
  return <div className="space-y-6">
    {portal && <NoticeManager data={portal} />}
    <BillingClient data={data} />
  </div>
}
