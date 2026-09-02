import { getTournamentsOptimized, getCategories, getClubsForFilter } from "@/app/api/tournaments"
import TournamentsLayout from "./tournaments-layout"
import PaginationWrapper from "./pagination-wrapper"
import { PublicTournamentCards } from "@/components/tournaments/public-tournament-cards"
import { getDefaultPublicTournamentType, getTenantBranding } from "@/config/tenant"
import { isTournamentGenderFilter } from "@/lib/tournaments/gender-filtering"
import {
  getDefaultPublicTournamentListStatus,
  type PublicTournamentListStatus,
} from "@/lib/tournaments/public-tournament-list-routes"

export interface PublicTournamentsPageProps {
  searchParams: Promise<{
    page?: string
    category?: string
    club?: string
    gender?: string
    search?: string
    type?: string
  }>
  status?: PublicTournamentListStatus
}

const statusContent: Record<PublicTournamentListStatus, { title: string; description: (siteName: string) => string }> = {
  active: {
    title: "Torneos activos",
    description: (siteName) => `Torneos en curso y proximas fechas de ${siteName}, con inscripciones abiertas o cerradas en un mismo lugar.`,
  },
  upcoming: {
    title: "Proximos torneos",
    description: (siteName) => `Las proximas fechas de ${siteName}, ordenadas para que veas rapido categoria, horario, club e inscripcion.`,
  },
  "in-progress": {
    title: "Torneos en curso",
    description: (siteName) => `Seguimiento simple de los torneos que ya estan en juego dentro de ${siteName}.`,
  },
  past: {
    title: "Torneos finalizados",
    description: (siteName) => `Historial de ${siteName} con la misma lectura simple y clara del resto del sitio.`,
  },
}

export default async function PublicTournamentsPage({
  searchParams,
  status: requestedStatus,
}: PublicTournamentsPageProps) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const categoryFilter = params.category
  const clubFilter = params.club
  const genderFilter = isTournamentGenderFilter(params.gender) ? params.gender : undefined
  const searchTerm = params.search
  const branding = getTenantBranding()
  const defaultType = getDefaultPublicTournamentType()
  const type = params.type === "AMERICAN" || params.type === "LONG" ? params.type : defaultType
  const isElite = branding.key === "padel-elite"
  const status = requestedStatus ?? getDefaultPublicTournamentListStatus(branding.key)
  const content = statusContent[status]

  const [tournamentsData, categories, clubs] = await Promise.all([
    getTournamentsOptimized({
      status,
      page,
      limit: 10,
      filters: {
        categoryName: categoryFilter,
        clubId: clubFilter,
        gender: genderFilter,
        search: searchTerm,
        type,
      },
    }),
    getCategories(),
    getClubsForFilter(),
  ])

  const { tournaments, totalCount } = tournamentsData

  return (
    <TournamentsLayout
      title={content.title}
      description={content.description(branding.siteName)}
      currentType={type}
      categories={categories}
      clubs={clubs}
    >
      <div className="space-y-8">
        <PublicTournamentCards
          tournaments={tournaments}
          emptyTitle={
            isElite
              ? type === "LONG"
                ? "No hay ligas publicadas"
                : "No hay americanos publicados"
              : type === "LONG"
                ? "No hay ligas activas"
                : "No hay americanos activos"
          }
          emptyDescription={
            categoryFilter || clubFilter || searchTerm || genderFilter
              ? isElite
                ? "No encontramos torneos con esos filtros. Proba cambiando la categoria, el club o la busqueda."
                : "No encontramos torneos activos con esos filtros. Proba cambiando la categoria, el club o la busqueda."
              : isElite
                ? `No hay torneos cargados para este formato en ${branding.siteName} en este momento.`
                : `No hay torneos activos para este formato en ${branding.siteName} en este momento.`
          }
        />

        <PaginationWrapper total={totalCount} pageSize={10} currentPage={page} />
      </div>
    </TournamentsLayout>
  )
}
