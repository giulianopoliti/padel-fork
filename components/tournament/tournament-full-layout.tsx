"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Trophy, Calendar, Users, Building, ArrowLeft, Phone, MapPin } from "lucide-react"
import TournamentPageLayout from "./tournament-page-layout"
import { cn } from "@/lib/utils"

interface TournamentData {
  id: string
  name: string
  status: string
  start_date?: string
  end_date?: string
  clubes?: {
    name?: string
    phone?: string
    phone2?: string
    address?: string
  }
}

interface PlayerInfo {
  id: string
  first_name: string | null
  last_name: string | null
  score: number | null
  dni?: string | null
  phone?: string | null
}

interface TournamentFullLayoutProps {
  tournament: TournamentData
  individualInscriptions: PlayerInfo[]
  coupleInscriptions: any[]
  maxPlayers?: number
  allPlayers?: PlayerInfo[]
  pendingInscriptions?: any[]
  backUrl?: string
  backLabel?: string
  statusBadge?: React.ReactNode
  actionButtons?: React.ReactNode
  isPublicView?: boolean
  /** Indica si el usuario es propietario del torneo */
  isOwner?: boolean
  onDataRefresh?: () => void
  // Nuevas props para secciones adicionales
  additionalSections?: React.ReactNode
  pointsReviewSection?: React.ReactNode
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
}

export default function TournamentFullLayout({
  tournament,
  individualInscriptions,
  coupleInscriptions,
  maxPlayers = 32,
  allPlayers = [],
  pendingInscriptions = [],
  backUrl = "/torneos",
  backLabel = "Volver",
  statusBadge,
  actionButtons,
  isPublicView = false,
  isOwner = false,
  onDataRefresh,
  additionalSections,
  pointsReviewSection,
}: TournamentFullLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Tournament Header Section */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 lg:py-6 lg:pl-60">
          <div className="max-w-7xl mx-auto">
            {/* Navigation and Status */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 lg:mb-6">
              <Button asChild variant="outline" className="border-gray-300 w-fit">
                <Link href={backUrl} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{backLabel}</span>
                </Link>
              </Button>
              <div className="flex items-center gap-3">
                {actionButtons}
                {statusBadge}
              </div>
            </div>

            {/* Tournament Title */}
            <div className="flex items-start gap-3 lg:gap-4">
              <div className="bg-slate-100 p-2 lg:p-3 rounded-elevated">
                <Trophy className="h-5 w-5 lg:h-6 lg:w-6 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">{tournament.name}</h1>
                
                {/* Mobile Layout - Vertical stacking */}
                <div className="block sm:hidden space-y-2 text-xs text-slate-600">
                  {tournament.clubes?.name && (
                    <div className="flex items-center gap-1">
                      <Building className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">
                        {tournament.clubes.name}
                      </span>
                    </div>
                  )}
                  
                  {(tournament.clubes?.phone || tournament.clubes?.phone2) && (
                    <div className="flex items-center gap-3">
                      {tournament.clubes?.phone && (
                        <a 
                          href={`tel:${tournament.clubes.phone}`}
                          className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                        >
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          <span>{tournament.clubes.phone}</span>
                        </a>
                      )}
                      {tournament.clubes?.phone2 && (
                        <a 
                          href={`tel:${tournament.clubes.phone2}`}
                          className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                        >
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          <span>{tournament.clubes.phone2}</span>
                        </a>
                      )}
                    </div>
                  )}
                  
                  {tournament.clubes?.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">
                        {tournament.clubes.address}
                      </span>
                    </div>
                  )}
                  
                  {tournament.start_date && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 flex-shrink-0" />
                      <span>
                        {formatDate(tournament.start_date)}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3 flex-shrink-0" />
                    <span>{individualInscriptions.length} jugadores, {coupleInscriptions.length} parejas</span>
                  </div>
                </div>

                {/* Desktop Layout - Horizontal wrapping */}
                <div className="hidden sm:flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm text-slate-600">
                  {tournament.clubes?.name && (
                    <div className="flex items-center gap-1">
                      <Building className="h-3 w-3 lg:h-4 lg:w-4" />
                      <span className="truncate max-w-[150px] sm:max-w-none">
                        {tournament.clubes.name}
                      </span>
                    </div>
                  )}
                  {(tournament.clubes?.phone || tournament.clubes?.phone2) && (
                    <div className="flex items-center gap-3">
                      {tournament.clubes?.phone && (
                        <a 
                          href={`tel:${tournament.clubes.phone}`}
                          className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                        >
                          <Phone className="h-3 w-3 lg:h-4 lg:w-4" />
                          <span>{tournament.clubes.phone}</span>
                        </a>
                      )}
                      {tournament.clubes?.phone2 && (
                        <a 
                          href={`tel:${tournament.clubes.phone2}`}
                          className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                        >
                          <Phone className="h-3 w-3 lg:h-4 lg:w-4" />
                          <span>{tournament.clubes.phone2}</span>
                        </a>
                      )}
                    </div>
                  )}
                  {tournament.clubes?.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 lg:h-4 lg:w-4" />
                      <span className="truncate max-w-[200px] sm:max-w-none">
                        {tournament.clubes.address}
                      </span>
                    </div>
                  )}
                  {tournament.start_date && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 lg:h-4 lg:w-4" />
                      <span>
                        {formatDate(tournament.start_date)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3 lg:h-4 lg:w-4" />
                    <span>{individualInscriptions.length} jugadores, {coupleInscriptions.length} parejas</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout with Sidebar and Content */}
      <div className="flex-1">
        <TournamentPageLayout
          tournamentId={tournament.id}
          tournamentStatus={tournament.status}
          individualInscriptions={individualInscriptions}
          coupleInscriptions={coupleInscriptions}
          maxPlayers={maxPlayers}
          allPlayers={allPlayers}
          pendingInscriptions={pendingInscriptions}
          isPublicView={isPublicView}
          isOwner={isOwner}
          onDataRefresh={onDataRefresh}
        />
      </div>

      {/* Secciones adicionales con offset correcto para sidebar */}
      {(additionalSections || pointsReviewSection) && (
        <div className="px-4 lg:ml-56 lg:pl-8">
          <div className="max-w-7xl mx-auto py-6">
            {pointsReviewSection}
            {additionalSections}
          </div>
        </div>
      )}
    </div>
  )
}
