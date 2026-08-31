import type React from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trophy, Calendar, MapPin, ChevronRight, Building2 } from "lucide-react"
import { getStorageUrl } from "@/utils/storage-url"
import { shouldShowFewSlotsAlert } from "@/lib/tournaments/few-slots-visibility"
import { getPublicTournamentHref } from "@/lib/tournaments/public-tournament-url"

// Types
interface Tournament {
  id: string
  seoSlug?: string | null
  name: string
  startDate: string | null
  endDate?: string | null
  status: string
  category: string
  type?: string
  maxParticipants?: number
  currentParticipants?: number
  remainingSlots?: number | null
  isFull?: boolean
  hasFewSlots?: boolean
  showFewSlotsAlert?: boolean
  inscriptionsCount?: number
  matchesFinished?: number
  address?: string
  time?: string
  prize?: string
  description?: string
  price?: string | null
  award?: string | null
  pre_tournament_image_url?: string | null
  category_name?: string
  gender?: string
  club?: {
    id: string
    name: string
    address?: string
    image?: string
  }
}

interface Category {
  name: string
  lower_range: number
  upper_range: number
}

interface TournamentCardProps {
  tournament: Tournament
  categories?: Category[]
  showViewButton?: boolean
  showStatus?: boolean
  organizationLogo?: string | null
  organizationName?: string
  coverImageFallback?: string | null
}

export default function TournamentCard({
  tournament,
  categories = [],
  showViewButton = true,
  showStatus = true,
  organizationLogo = null,
  organizationName = "",
  coverImageFallback = null,
}: TournamentCardProps) {
  
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string }> = {
      'NOT_STARTED': { bg: 'bg-blue-500', text: 'Próximamente' },
      'IN_PROGRESS': { bg: 'bg-green-500', text: 'En Curso' },
      'ZONE_PHASE': { bg: 'bg-orange-500', text: 'Fase de Zonas' },
      'BRACKET_PHASE': { bg: 'bg-indigo-500', text: 'Fase de Llaves' },
      'FINISHED': { bg: 'bg-gray-500', text: 'Finalizado' },
      'FINISHED_POINTS_PENDING': { bg: 'bg-yellow-500', text: 'Puntos Pendientes' },
      'FINISHED_POINTS_CALCULATED': { bg: 'bg-emerald-500', text: 'Puntos Aplicados' },
      'PAIRING': { bg: 'bg-purple-500', text: 'Emparejamiento' },
      'CANCELED': { bg: 'bg-red-500', text: 'Cancelado' },
    }
    
    const config = statusConfig[status] || { bg: 'bg-gray-500', text: status }
    return { className: `${config.bg} text-white border-0 shadow-lg`, text: config.text }
  }

  const formatDate = (dateString: string | null, showTime: boolean = false) => {
    if (!dateString) return "Fecha no especificada"
    
    const date = new Date(dateString)
    
    if (showTime && tournament.type === 'AMERICAN') {
      return date.toLocaleString('es-AR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires'
      })
    }
    
    return date.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires'
    })
  }

  const getDateDisplay = () => {
    if (tournament.type === 'AMERICAN') {
      return formatDate(tournament.startDate, true)
    }
    return `${formatDate(tournament.startDate)} - ${formatDate(tournament.endDate || tournament.startDate)}`
  }

  const statusBadge = getStatusBadge(tournament.status)

  // Obtener URL de la imagen con manejo correcto
  const getImageUrl = () => {
    // Si hay imagen del torneo, usarla con getStorageUrl para manejar proxy en dev
    if (tournament.pre_tournament_image_url) {
      return getStorageUrl(tournament.pre_tournament_image_url) || tournament.pre_tournament_image_url
    }
    
    // Si hay fallback de la organización, usarlo
    if (coverImageFallback) {
      return getStorageUrl(coverImageFallback) || coverImageFallback
    }
    
    // Imagen por defecto - devolver null para mostrar placeholder
    return null
  }

  const imageUrl = getImageUrl()

  return (
    <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 hover:scale-[1.02] group">
      {/* Tournament Image */}
      <div className="relative h-40 sm:h-48">
        {imageUrl ? (
          <>
            <Image
              src={imageUrl}
              alt={tournament.name}
              fill
              className="object-cover group-hover:scale-110 transition-transform duration-500"
            />
            {/* Dark overlay - Más oscuro para mejor contraste con el badge */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-blue-900/70 to-cyan-900/60"></div>
          </>
        ) : (
          <>
            {/* Placeholder cuando no hay imagen */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-700"></div>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
              <Trophy className="h-12 w-12 sm:h-16 sm:w-16 mb-3 opacity-40" />
              <p className="text-sm sm:text-base font-bold text-center line-clamp-3 opacity-90">
                {tournament.name}
              </p>
            </div>
          </>
        )}

        {/* Organization Logo - Centered (if provided) */}
        {organizationLogo && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="w-20 h-20 rounded-xl bg-white shadow-2xl border-3 border-white overflow-hidden ring-4 ring-blue-400/50">
              <Image
                src={organizationLogo}
                alt={organizationName || "Organization"}
                width={80}
                height={80}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        )}

        {/* Status Badge - Top Right */}
        {showStatus && (
          <div className="absolute top-4 right-4">
            <Badge className={statusBadge.className}>
              {statusBadge.text}
            </Badge>
          </div>
        )}
      </div>

      {/* Tournament Info */}
      <div className="p-6">
        {/* Título del torneo - Mostrar completo */}
        <div className="mb-3">
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors leading-tight mb-2 min-h-[2.5rem]">
            {tournament.name}
          </h3>
          <div className="flex flex-wrap gap-2">
            {tournament.type && (
              <Badge variant="outline" className="text-xs font-semibold">
                {tournament.type === 'AMERICAN' ? 'Americano' : 'Liga'}
              </Badge>
            )}
            {tournament.isFull ? (
              <Badge className="border border-red-300 bg-red-700 text-xs font-black text-white shadow-[0_0_18px_rgba(220,38,38,0.32)]">
                Completo
              </Badge>
            ) : null}
            {shouldShowFewSlotsAlert(tournament.showFewSlotsAlert, tournament.hasFewSlots) ? (
              <Badge className="animate-pulse border border-red-300 bg-red-600 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[0_0_18px_rgba(220,38,38,0.4)]">
                Pocos cupos
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 text-xs sm:text-sm text-slate-600 mb-4">
          {tournament.startDate && (
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2 flex-1">{getDateDisplay()}</span>
            </div>
          )}
          {tournament.club && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2 flex-1">{tournament.club.name}</span>
            </div>
          )}
          {(tournament.category || tournament.category_name) && (
            <div className="flex items-start gap-2">
              <Trophy className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2 flex-1">
                {tournament.category || tournament.category_name} - {tournament.gender === 'MALE' ? 'Masculino' : tournament.gender === 'FEMALE' ? 'Femenino' : 'Mixto'}
              </span>
            </div>
          )}
          {tournament.price && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded">
                💰 Inscripción: {tournament.price}
              </span>
            </div>
          )}
          {tournament.award && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded">
                🏆 Premio: {tournament.award}
              </span>
            </div>
          )}
        </div>

        {/* Tournament Stats (if available) */}
        {((tournament.inscriptionsCount && tournament.inscriptionsCount > 0) || 
          (tournament.matchesFinished && tournament.matchesFinished > 0)) && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {tournament.inscriptionsCount !== undefined && (
              <div className="bg-blue-50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-blue-900">{tournament.inscriptionsCount}</div>
                <div className="text-xs text-blue-600">Parejas</div>
              </div>
            )}
            {tournament.matchesFinished !== undefined && (
              <div className="bg-cyan-50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-cyan-900">{tournament.matchesFinished}</div>
                <div className="text-xs text-cyan-600">Partidos</div>
              </div>
            )}
          </div>
        )}

        {showViewButton && (
          <Button
            size="sm"
            className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-md hover:shadow-lg transition-all duration-300"
            asChild
          >
            <Link href={getPublicTournamentHref(tournament)}>
              Ver Torneo
              <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </Card>
  )
}
