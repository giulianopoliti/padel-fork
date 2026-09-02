import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import OrganizerMatchesClient from "@/app/(main)/panel/matches/components/organizer-matches-client"
import {
  getOrganizationClubs,
  getOrganizationScheduledMatchesPage,
  parseOrganizerMatchesFilters,
} from "@/lib/organizer-matches"

export const dynamic = "force-dynamic"

interface OrganizerMatchesPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function OrganizerMatchesPage({ searchParams }: OrganizerMatchesPageProps) {
  const supabase = await createClient()
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawPage = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page
  const page = Number.isFinite(Number(rawPage)) && Number(rawPage) > 0 ? Number(rawPage) : 1

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect("/login")
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if (userError || !userData) {
    await supabase.auth.signOut()
    redirect("/login")
  }

  if (userData.role !== "ORGANIZADOR") {
    redirect("/panel")
  }

  const { data: orgMember, error: orgError } = await supabase
    .from("organization_members")
    .select("organizacion_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single()

  if (orgError || !orgMember) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-md rounded-surface border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">No tenés organización asignada</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Necesitás una organización activa para consultar la agenda consolidada de partidos.
          </p>
        </div>
      </div>
    )
  }

  const filters = parseOrganizerMatchesFilters(resolvedSearchParams)
  const [matchesPage, clubs] = await Promise.all([
    getOrganizationScheduledMatchesPage(orgMember.organizacion_id, filters, { page, pageSize: 25 }),
    getOrganizationClubs(orgMember.organizacion_id),
  ])

  return (
    <OrganizerMatchesClient
      matches={matchesPage.matches}
      clubs={clubs}
      initialFilters={filters}
      currentPage={matchesPage.page}
      totalPages={matchesPage.totalPages}
      totalCount={matchesPage.totalCount}
    />
  )
}
