import type { Metadata } from "next"
import { HomeContent } from "@/components/home/HomeContent"

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
}

export default async function HomePage() {
  return <HomeContent />
}
