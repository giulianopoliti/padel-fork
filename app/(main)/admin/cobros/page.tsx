import { BillingClient } from "./billing-client"
import { getTenantBillingDashboard } from "@/lib/billing/service"

const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const params = await searchParams
  const requestedWeek = params.week && WEEK_PATTERN.test(params.week) ? params.week : null
  const data = await getTenantBillingDashboard(requestedWeek)

  return <BillingClient data={data} />
}
