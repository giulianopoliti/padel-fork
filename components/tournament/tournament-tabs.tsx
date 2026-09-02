"use client"

import type React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import {
  Trophy,
  Calendar,
  MapPin,
  ArrowRight,
  Clock,
  CheckCircle,
  Ban,
  PauseCircle,
  Timer,
  Users,
  Award,
  TrendingUp,
} from "lucide-react"
import Link from "next/link"

// Tipos para las props
interface TournamentsTabsProps {
  notStartedTournaments: any[]
  pairingTournaments: any[]
  inProgressTournaments: any[]
  finishedTournaments: any[]
  canceledTournaments: any[]
  clubAddress?: string
}

export default function TournamentsTabs({
  notStartedTournaments,
  pairingTournaments,
  inProgressTournaments,
  finishedTournaments,
  canceledTournaments,
  clubAddress,
}: TournamentsTabsProps) {
  // Formatear fecha
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("es-AR", { 
      day: "numeric", 
      month: "long", 
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires"
    })
  }

  // Formatear hora
  const formatTime = (timeString: string) => {
    if (!timeString) return "No especificado"

    try {
      if (timeString.includes("T")) {
        const date = new Date(timeString)
        return date.toLocaleTimeString("es-AR", { 
          hour: "2-digit", 
          minute: "2-digit",
          timeZone: "America/Argentina/Buenos_Aires"
        })
      }
      return timeString.substring(0, 5)
    } catch (error) {
      return timeString || "No especificado"
    }
  }

  // Obtener icono según el estado
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "NOT_STARTED":
        return <Clock className="h-4 w-4" />
      case "PAIRING":
        return <PauseCircle className="h-4 w-4" />
      case "IN_PROGRESS":
        return <TrendingUp className="h-4 w-4" />
      case "FINISHED":
        return <CheckCircle className="h-4 w-4" />
      case "CANCELED":
        return <Ban className="h-4 w-4" />
      default:
        return <Trophy className="h-4 w-4" />
    }
  }

  // Obtener color según el estado
  const getStatusColor = (status: string) => {
    switch (status) {
      case "NOT_STARTED":
        return {
          bg: "bg-amber-50",
          text: "text-amber-700",
          border: "border-amber-200",
          accent: "bg-amber-500",
        }
      case "PAIRING":
        return {
          bg: "bg-blue-50",
          text: "text-blue-700",
          border: "border-blue-200",
          accent: "bg-blue-500",
        }
      case "IN_PROGRESS":
        return {
          bg: "bg-emerald-50",
          text: "text-emerald-700",
          border: "border-emerald-200",
          accent: "bg-emerald-500",
        }
      case "FINISHED":
        return {
          bg: "bg-slate-50",
          text: "text-slate-700",
          border: "border-slate-200",
          accent: "bg-slate-500",
        }
      case "CANCELED":
        return {
          bg: "bg-red-50",
          text: "text-red-700",
          border: "border-red-200",
          accent: "bg-red-500",
        }
      default:
        return {
          bg: "bg-gray-50",
          text: "text-gray-700",
          border: "border-gray-200",
          accent: "bg-gray-500",
        }
    }
  }

  // Obtener texto según el estado
  const getStatusText = (status: string) => {
    switch (status) {
      case "NOT_STARTED":
        return "Próximamente"
      case "PAIRING":
        return "Emparejamiento"
      case "IN_PROGRESS":
        return "En curso"
      case "FINISHED":
        return "Finalizado"
      case "CANCELED":
        return "Cancelado"
      default:
        return status
    }
  }

  // Renderizar tarjeta de torneo
  const renderTournamentCard = (tournament: any) => {
    const maxRegistrations = tournament.max_couples || tournament.max_inscriptions || 0
    const currentRegistrations = tournament.couplesCount || 0
    const registrationPercentage =
      maxRegistrations > 0 ? Math.min(Math.round((currentRegistrations / maxRegistrations) * 100), 100) : 0

    const statusColor = getStatusColor(tournament.status)

    return (
      <div className="bg-white rounded-elevated border border-gray-200 hover:border-slate-300 transition-all duration-300 shadow-sm hover:shadow-md group">
        {/* Status indicator bar */}
        <div className={`h-1 w-full ${statusColor.accent} rounded-t-elevated`}></div>

        {/* Card content */}
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 mb-1 group-hover:text-slate-700 transition-colors">
                {tournament.name}
              </h3>
              <div className="flex items-center text-slate-500 text-sm">
                <Calendar className="h-4 w-4 mr-2" />
                <span>
                  {formatDate(tournament.start_date)} - {formatDate(tournament.end_date)}
                </span>
              </div>
            </div>
            <div
              className={`${statusColor.bg} ${statusColor.text} px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 border ${statusColor.border}`}
            >
              {getStatusIcon(tournament.status)}
              <span>{getStatusText(tournament.status)}</span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-50 rounded-surface p-4 border border-slate-100">
              <div className="flex items-center justify-between">
                <Users className="h-5 w-5 text-slate-600" />
                <span className="text-xs text-slate-500">Inscripciones</span>
              </div>
              <div className="mt-2">
                <span className="text-xl font-bold text-slate-900">{currentRegistrations}</span>
                <span className="text-sm text-slate-500 ml-1">/ {maxRegistrations > 0 ? maxRegistrations : "∞"}</span>
              </div>
            </div>

            <div className="bg-slate-50 rounded-surface p-4 border border-slate-100">
              <div className="flex items-center justify-between">
                <Trophy className="h-5 w-5 text-slate-600" />
                <span className="text-xs text-slate-500">Categoría</span>
              </div>
              <div className="mt-2">
                <span className="text-sm font-semibold text-slate-900">{tournament.category?.name || "General"}</span>
                <div className="text-xs text-slate-500">{tournament.tournament_type || "Estándar"}</div>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center text-sm">
              <MapPin className="h-4 w-4 mr-3 text-slate-400 flex-shrink-0" />
              <span className="text-slate-600 truncate">{clubAddress || tournament.address || "No especificada"}</span>
            </div>

            <div className="flex items-center text-sm">
              <Timer className="h-4 w-4 mr-3 text-slate-400 flex-shrink-0" />
              <span className="text-slate-600">
                {formatTime(tournament.start_time || "")} - {formatTime(tournament.end_time || "")}
              </span>
            </div>

            {tournament.prize && (
              <div className="flex items-center text-sm">
                <Award className="h-4 w-4 mr-3 text-slate-400 flex-shrink-0" />
                <span className="text-slate-600">{tournament.prize}</span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {maxRegistrations > 0 && (
            <div className="mb-6">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-slate-500">Ocupación</span>
                <span className="font-semibold text-slate-700">{registrationPercentage}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-slate-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${registrationPercentage}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Action button */}
          <Button asChild className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-surface">
                                <Link href={`/my-tournaments/${tournament.id}`} className="flex items-center justify-center gap-2">
              Ver detalles
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  // Renderizar sección de torneos
  const renderTournamentsSection = (title: string, tournaments: any[], icon: React.ReactNode, colorClass: string) => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-elevated ${colorClass}`}>{icon}</div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">
            {tournaments.length} torneo{tournaments.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {tournaments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((tournament) => (
            <div key={tournament.id}>{renderTournamentCard(tournament)}</div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-elevated border border-gray-200">
          <div className="flex flex-col items-center gap-4">
            <div className={`p-4 rounded-full ${colorClass}`}>{icon}</div>
            <div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">No hay torneos</h3>
              <p className="text-slate-500">No hay torneos en esta categoría.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-8">
      <Tabs defaultValue="all" className="space-y-8">
        <div className="flex justify-center">
          <TabsList className="bg-white border border-gray-200 p-1.5 rounded-elevated shadow-sm">
            <TabsTrigger
              value="all"
              className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-surface px-4 py-2"
            >
              <Trophy className="mr-2 h-4 w-4" />
              Todos
            </TabsTrigger>
            <TabsTrigger
              value="upcoming"
              className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-surface px-4 py-2"
            >
              <Clock className="mr-2 h-4 w-4" />
              Próximos
            </TabsTrigger>
            <TabsTrigger
              value="active"
              className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-surface px-4 py-2"
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Activos
            </TabsTrigger>
            <TabsTrigger
              value="finished"
              className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-surface px-4 py-2"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Finalizados
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="space-y-12">
          {renderTournamentsSection(
            "Torneos Próximos",
            notStartedTournaments,
            <Clock className="h-6 w-6 text-white" />,
            "bg-amber-500",
          )}
          {renderTournamentsSection(
            "Torneos en Emparejamiento",
            pairingTournaments,
            <PauseCircle className="h-6 w-6 text-white" />,
            "bg-blue-500",
          )}
          {renderTournamentsSection(
            "Torneos en Curso",
            inProgressTournaments,
            <TrendingUp className="h-6 w-6 text-white" />,
            "bg-emerald-500",
          )}
          {renderTournamentsSection(
            "Torneos Finalizados",
            finishedTournaments,
            <CheckCircle className="h-6 w-6 text-white" />,
            "bg-slate-500",
          )}
          {renderTournamentsSection(
            "Torneos Cancelados",
            canceledTournaments,
            <Ban className="h-6 w-6 text-white" />,
            "bg-red-500",
          )}
        </TabsContent>

        <TabsContent value="upcoming">
          {renderTournamentsSection(
            "Torneos Próximos",
            notStartedTournaments,
            <Clock className="h-6 w-6 text-white" />,
            "bg-amber-500",
          )}
        </TabsContent>

        <TabsContent value="active">
          {renderTournamentsSection(
            "Torneos en Emparejamiento",
            pairingTournaments,
            <PauseCircle className="h-6 w-6 text-white" />,
            "bg-blue-500",
          )}
          {renderTournamentsSection(
            "Torneos en Curso",
            inProgressTournaments,
            <TrendingUp className="h-6 w-6 text-white" />,
            "bg-emerald-500",
          )}
        </TabsContent>

        <TabsContent value="finished">
          {renderTournamentsSection(
            "Torneos Finalizados",
            finishedTournaments,
            <CheckCircle className="h-6 w-6 text-white" />,
            "bg-slate-500",
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
