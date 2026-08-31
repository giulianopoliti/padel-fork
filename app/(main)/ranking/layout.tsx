import { redirect } from "next/navigation"
import { getTenantBranding } from "@/config/tenant"

export default async function RankingLayout({ children }: { children: React.ReactNode }) {
  const branding = getTenantBranding()

  if (!branding.features.publicRanking) {
    redirect("/")
  }

  return children
}
