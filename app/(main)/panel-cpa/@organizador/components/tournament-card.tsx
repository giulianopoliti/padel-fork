"use client"

import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Button } from "@/components/ui/button"
import {
  Users,
  Zap,
  Calendar,
  Trophy,
  Clock,
  MapPin,
  Award,
  Building2,
  Wallet,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { getTournamentStatusLabel } from "@/lib/tournaments/public-tournament-details"
import { formatDateArgentina, formatTimeArgentina } from "@/lib/utils"

interface TournamentCardProps {
  tournament: {
    id: string
    name: string
    status: string
    pre_tournament_image_url: string | null
    start_date: string
    end_date: string | null
    category_name: string
    gender: string
    type: string
    price: number | string | null
    clubes?: {
      id: string
      name: string
    } | null
    inscriptions: number
    matchesFinished: number
    matchesPending: number
    totalMatches: number
    is_draft?: boolean
  }
  priority?: boolean
}

const getTournamentStatusConfig = (status: string) => {
  const configs: Record<string, { badge: string; accent: string; label: string }> = {
    NOT_STARTED: {
      badge: "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-300",
      accent: "border-l-gray-400",
      label: "No iniciado",
    },
    ZONE_REGISTRATION: {
      badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400",
      accent: "border-l-blue-500",
      label: "Registro abierto",
    },
    IN_PROGRESS: {
      badge: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400",
      accent: "border-l-blue-500",
      label: "En progreso",
    },
    ZONE_PHASE: {
      badge: "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-400",
      accent: "border-l-cyan-500",
      label: "Fase de zonas",
    },
    BRACKET_PHASE: {
      badge: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400",
      accent: "border-l-purple-500",
      label: "Fase de llaves",
    },
    FINISHED: {
      badge: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400",
      accent: "border-l-green-500",
      label: "Finalizado",
    },
    FINISHED_POINTS_CALCULATED: {
      badge: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400",
      accent: "border-l-emerald-500",
      label: "Completado",
    },
    CANCELED: {
      badge: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400",
      accent: "border-l-red-500",
      label: "Cancelado",
    },
  }

  return configs[status] || configs.NOT_STARTED
}

const formatDate = (dateString: string) =>
  formatDateArgentina(dateString, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

const formatTime = (dateString: string) =>
  formatTimeArgentina(dateString, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

const getGenderLabel = (gender: string) => {
  const labels: Record<string, string> = {
    MALE: "Caballeros",
    FEMALE: "Damas",
    MIXED: "Mixto",
    SHEMALE: "Mixto",
  }

  return labels[gender] || gender
}

const getTournamentTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    LONG: "Largo",
    AMERICAN: "Americano",
    AMERICAN_OTP: "Americano OTP",
  }

  return labels[type] || type
}

const formatPrice = (price: number | string | null) => {
  if (price === null || price === undefined) return "A confirmar"

  if (typeof price === "number") {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(price)
  }

  const trimmedPrice = price.trim()
  return trimmedPrice.length > 0 ? trimmedPrice : "A confirmar"
}

export default function TournamentCard({ tournament, priority = false }: TournamentCardProps) {
  const statusConfig = getTournamentStatusConfig(tournament.status)
  const progressPercentage = tournament.totalMatches > 0
    ? Math.round((tournament.matchesFinished / tournament.totalMatches) * 100)
    : 0
  const clubName = tournament.clubes?.name?.trim() || "Club a confirmar"
  const showSchedule = tournament.type === "AMERICAN"
  const statusLabel = getTournamentStatusLabel(tournament.status)

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <Link
          href={`/tournaments/${tournament.id}`}
          className="block rounded-lg group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label={`Ver detalles del torneo ${tournament.name}, estado: ${statusConfig.label}`}
        >
          <Card className={`overflow-hidden border-l-4 transition-all duration-200 hover:shadow-lg ${statusConfig.accent}`}>
            <CardContent className="p-0">
              <div className="flex flex-col gap-0 md:flex-row">
                <div className="relative w-full flex-shrink-0 md:w-64 md:min-h-[180px]">
                  <AspectRatio ratio={16 / 9} className="bg-muted">
                    {tournament.pre_tournament_image_url ? (
                      <Image
                        src={tournament.pre_tournament_image_url}
                        alt={`Imagen del torneo ${tournament.name}`}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, 256px"
                        priority={priority}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600">
                        <Trophy className="h-16 w-16 text-white opacity-40" aria-hidden="true" />
                      </div>
                    )}
                  </AspectRatio>

                  <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="bg-white/95 shadow-lg backdrop-blur-sm dark:bg-gray-900/95">
                      {statusConfig.label}
                    </Badge>
                    {tournament.is_draft && (
                      <Badge className="bg-amber-500 text-xs text-white shadow-lg">
                        BORRADOR
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-4 p-5 md:p-6">
                  <div className="space-y-2">
                    <h3 className="line-clamp-2 text-xl font-bold transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {tournament.name}
                    </h3>
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Award className="h-3.5 w-3.5" aria-hidden="true" />
                        {tournament.category_name}
                      </span>
                      <span>•</span>
                      <span>{getGenderLabel(tournament.gender)}</span>
                      <span>•</span>
                      <span>{getTournamentTypeLabel(tournament.type)}</span>
                    </div>
                  </div>

                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <div className="flex items-start gap-2">
                      <Building2 className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span className="line-clamp-2">{clubName}</span>
                    </div>

                    {showSchedule && tournament.start_date && (
                      <div className="flex items-start gap-2">
                        <Calendar className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        <span>{formatDate(tournament.start_date)}</span>
                      </div>
                    )}

                    {showSchedule && tournament.start_date && (
                      <div className="flex items-start gap-2">
                        <Clock className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        <span>{formatTime(tournament.start_date)} hs</span>
                      </div>
                    )}

                    <div className="flex items-start gap-2">
                      <Zap className="mt-0.5 h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                      <span>{statusLabel}</span>
                    </div>

                    <div className="flex items-start gap-2 sm:col-span-2">
                      <Wallet className="mt-0.5 h-4 w-4 text-slate-600 dark:text-slate-300" aria-hidden="true" />
                      <span>Inscripción: {formatPrice(tournament.price)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col items-center rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
                      <Users className="mb-1 h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span className="text-2xl font-bold">{tournament.inscriptions}</span>
                      <span className="text-xs text-muted-foreground">inscriptos</span>
                    </div>
                    <div className="flex flex-col items-center rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
                      <Zap className="mb-1 h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />
                      <span className="text-2xl font-bold">{tournament.matchesFinished}</span>
                      <span className="text-xs text-muted-foreground">finalizados</span>
                    </div>
                    <div className="flex flex-col items-center rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
                      <Calendar className="mb-1 h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      <span className="text-2xl font-bold">{tournament.matchesPending}</span>
                      <span className="text-xs text-muted-foreground">programados</span>
                    </div>
                  </div>

                  {tournament.totalMatches > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progreso del torneo</span>
                        <span className="font-medium">{progressPercentage}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                          style={{ width: `${progressPercentage}%` }}
                          role="progressbar"
                          aria-valuenow={progressPercentage}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </HoverCardTrigger>

      <HoverCardContent className="w-80" side="top">
        <div className="space-y-3">
          <div>
            <h4 className="mb-1 text-sm font-semibold">{tournament.name}</h4>
            <Badge variant="outline" className={statusConfig.badge}>
              {statusConfig.label}
            </Badge>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>{clubName}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Inicio: {formatDate(tournament.start_date)}</span>
            </div>
            {showSchedule && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Hora: {formatTime(tournament.start_date)} hs</span>
              </div>
            )}
            {tournament.end_date && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Fin: {formatDate(tournament.end_date)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Categoría {tournament.category_name} • {getGenderLabel(tournament.gender)}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Wallet className="h-4 w-4" />
              <span>Inscripción: {formatPrice(tournament.price)}</span>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Total partidos</p>
              <p className="text-base font-semibold">{tournament.totalMatches}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Progreso</p>
              <p className="text-base font-semibold">{progressPercentage}%</p>
            </div>
          </div>

          <Button size="sm" className="w-full" asChild>
            <Link href={`/tournaments/${tournament.id}`}>
              Ver detalles completos {"->"}
            </Link>
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
