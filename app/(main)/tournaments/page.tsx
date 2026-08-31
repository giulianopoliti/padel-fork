import { permanentRedirect } from "next/navigation"

export const dynamic = "force-dynamic"

interface LegacyTournamentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LegacyTournamentsPage({ searchParams }: LegacyTournamentsPageProps) {
  const params = await searchParams
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item))
      return
    }

    if (value) query.set(key, value)
  })

  permanentRedirect(query.size ? `/torneos?${query.toString()}` : "/torneos")
}
