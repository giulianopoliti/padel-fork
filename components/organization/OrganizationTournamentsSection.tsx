"use client"

import { useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Filter, Building2 } from "lucide-react"
import TournamentCard from "@/components/tournament-card"

interface Tournament {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  status: string
  type: string
  price: number | null
  award: string | null
  maxParticipants: number | null
  currentParticipants: number
  pre_tournament_image_url: string | null
  category: string
  gender: string
  category_name: string
  club: {
    id: string
    name: string
    address: string
  } | null
  inscriptionsCount: number
  matchesFinished: number
}

interface Club {
  id: string
  name: string
  address: string
  courts: number
  opens_at: string
  closes_at: string
  logo_url?: string
  cover_image?: string
}

interface OrganizationTournamentsSectionProps {
  tournaments: Tournament[]
  clubs: Club[]
  organizationLogo?: string | null
  organizationName: string
  coverImageFallback?: string | null
}

export default function OrganizationTournamentsSection({
  tournaments,
  clubs,
  organizationLogo,
  organizationName,
  coverImageFallback,
}: OrganizationTournamentsSectionProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [clubFilter, setClubFilter] = useState<string>("all")

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value)
  }

  const handleClubFilter = (value: string) => {
    setClubFilter(value)
  }

  const filteredTournaments = tournaments.filter((tournament) => {
    // Filter by status
    let statusMatch = false
    if (statusFilter === "all") {
      statusMatch = true
    } else if (statusFilter === "upcoming") {
      statusMatch = tournament.status === "NOT_STARTED"
    } else if (statusFilter === "active") {
      statusMatch =
        tournament.status === "IN_PROGRESS" ||
        tournament.status === "ZONE_PHASE" ||
        tournament.status === "BRACKET_PHASE"
    } else if (statusFilter === "finished") {
      statusMatch =
        tournament.status === "FINISHED" ||
        tournament.status === "FINISHED_POINTS_PENDING" ||
        tournament.status === "FINISHED_POINTS_CALCULATED"
    }

    // Filter by club
    const clubMatch = clubFilter === "all" || tournament.club?.id === clubFilter

    return statusMatch && clubMatch
  })

  return (
    <section id="tournaments" className="mb-32">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-black text-slate-900 mb-4">Torneos</h2>
        <div className="w-24 h-1 bg-gradient-to-r from-blue-600 to-cyan-600 mx-auto rounded-full"></div>
      </div>

      {/* Filters Section */}
      <div className="bg-white rounded-surface shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Status Filter */}
          <div className="flex-1">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10" size={18} />
              <Select value={statusFilter} onValueChange={handleStatusFilter}>
                <SelectTrigger className="pl-10 border-gray-200 focus:border-blue-300 focus:ring-blue-200 text-gray-600">
                  <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los Estados</SelectItem>
                  <SelectItem value="upcoming">Próximos</SelectItem>
                  <SelectItem value="active">En Curso</SelectItem>
                  <SelectItem value="finished">Finalizados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Club Filter */}
          <div className="flex-1">
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10" size={18} />
              <Select value={clubFilter} onValueChange={handleClubFilter}>
                <SelectTrigger className="pl-10 border-gray-200 focus:border-blue-300 focus:ring-blue-200 text-gray-600">
                  <SelectValue placeholder="Filtrar por club" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los Clubes</SelectItem>
                  {clubs.map((club) => (
                    <SelectItem key={club.id} value={club.id}>
                      {club.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Tournaments Grid */}
      {filteredTournaments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTournaments.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              showViewButton={true}
              showStatus={true}
              organizationLogo={organizationLogo}
              organizationName={organizationName}
              coverImageFallback={coverImageFallback}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Filter className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-medium text-gray-700 mb-2">No hay torneos</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            No se encontraron torneos con los filtros seleccionados.
          </p>
        </div>
      )}
    </section>
  )
}
