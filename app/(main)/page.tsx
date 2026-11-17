import type { Metadata } from "next"
import { HomeContent } from "@/components/home/HomeContent"
import { getTenantBranding } from "@/config/tenant"

const { home } = getTenantBranding()

export const metadata: Metadata = {
  title: home.title,
  description: home.subtitle,
  alternates: {
    canonical: "/",
  },
}

export default async function HomePage() {
  return <HomeContent />
}
