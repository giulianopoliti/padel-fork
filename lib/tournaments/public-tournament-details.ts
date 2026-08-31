import type { Gender, TournamentStatus } from '@/types'
import { getTournamentCategoryDisplay } from '@/lib/services/tournament-category-config'
import { buildGoogleMapsSearchUrl } from '@/lib/maps/google-maps'

type NullableString = string | null | undefined

type TournamentPublicInfoSource = {
  id?: string
  name?: NullableString
  type?: NullableString
  status?: TournamentStatus | string | null
  show_tournament_status?: boolean | null
  category_name?: NullableString
  category_config?: unknown
  gender?: Gender | string | null
  price?: string | number | null
  award?: NullableString
  description?: NullableString
  hide_venue?: boolean | null
  start_date?: NullableString
  clubes?: {
    name?: NullableString
    address?: NullableString
    formatted_address?: NullableString
    google_place_id?: NullableString
    latitude?: string | number | null
    longitude?: string | number | null
    maps_url?: NullableString
    logo_url?: NullableString
    cover_image_url?: NullableString
    phone?: NullableString
    phone2?: NullableString
  } | null
  organization?: {
    name?: NullableString
    phone?: NullableString
  } | null
}

const TOURNAMENT_DISPLAY_TIME_ZONE = 'America/Argentina/Buenos_Aires'

export interface TournamentPublicInfo {
  id: string
  name: string
  type: string | null
  typeLabel: string
  status: string | null
  statusLabel: string
  showStatus: boolean
  category: string | null
  gender: string | null
  genderLabel: string
  price: string | number | null
  startDate: string | null
  startDateLabel: string | null
  startTimeLabel: string | null
  clubName: string | null
  clubAddress: string | null
  clubMapsUrl: string | null
  clubImageUrl: string | null
  hideVenue: boolean
  organizerName: string | null
  organizerPhone: string | null
  award: string | null
  description: string | null
}

const cleanText = (value: NullableString) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const getTournamentTypeLabel = (type: string | null) => {
  if (type === 'AMERICAN') return 'Torneo Americano'
  if (type === 'LONG') return 'Torneo Long'
  return 'Torneo'
}

export const getTournamentStatusLabel = (status: string | null) => {
  const statusMap: Record<string, string> = {
    NOT_STARTED: 'Próximamente',
    IN_PROGRESS: 'En curso',
    ZONE_PHASE: 'Fase de zonas',
    BRACKET_PHASE: 'Fase de llaves',
    PAIRING: 'Emparejamiento',
    ZONE_REGISTRATION: 'Inscripción abierta',
    FINISHED: 'Finalizado',
    FINISHED_POINTS_PENDING: 'Finalizado',
    FINISHED_POINTS_CALCULATED: 'Finalizado',
    CANCELED: 'Cancelado',
  }

  if (!status) return 'Sin estado'
  return statusMap[status] || status
}

const getGenderLabel = (gender: string | null) => {
  if (gender === 'MALE') return 'Caballeros'
  if (gender === 'FEMALE') return 'Damas'
  if (gender === 'MIXED') return 'Mixto'
  return 'Sin género'
}

const getValidDate = (value: string | null) => {
  if (!value) return null
  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

export const mapTournamentToPublicInfo = (
  tournament: TournamentPublicInfoSource
): TournamentPublicInfo => {
  const hideVenue = Boolean(tournament.hide_venue)
  const clubName = hideVenue ? null : cleanText(tournament.clubes?.name)
  const clubAddress = hideVenue
    ? null
    : cleanText(tournament.clubes?.formatted_address) || cleanText(tournament.clubes?.address)
  const clubMapsUrl = hideVenue
    ? null
    : cleanText(tournament.clubes?.maps_url) ||
      buildGoogleMapsSearchUrl({
        name: clubName,
        address: tournament.clubes?.address,
        formattedAddress: tournament.clubes?.formatted_address,
        googlePlaceId: tournament.clubes?.google_place_id,
        latitude: tournament.clubes?.latitude,
        longitude: tournament.clubes?.longitude,
      })
  const clubImageUrl = hideVenue
    ? null
    : cleanText(tournament.clubes?.cover_image_url) || cleanText(tournament.clubes?.logo_url)
  const organizerName = cleanText(tournament.organization?.name) || clubName
  const organizerPhone =
    cleanText(tournament.organization?.phone) ||
    (hideVenue
      ? null
      : cleanText(tournament.clubes?.phone) || cleanText(tournament.clubes?.phone2))

  const parsedStartDate = getValidDate(tournament.start_date || null)
  const type = cleanText(tournament.type)
  const shouldShowSchedule = type === 'AMERICAN'
  const status = cleanText(tournament.status || null)
  const gender = cleanText(tournament.gender || null)

  return {
    id: tournament.id || '',
    name: cleanText(tournament.name) || 'Torneo sin nombre',
    type,
    typeLabel: getTournamentTypeLabel(type),
    status,
    statusLabel: getTournamentStatusLabel(status),
    showStatus: tournament.show_tournament_status === true,
    category: getTournamentCategoryDisplay(tournament),
    gender,
    genderLabel: getGenderLabel(gender),
    price: tournament.price ?? null,
    startDate: parsedStartDate ? parsedStartDate.toISOString() : null,
    startDateLabel: parsedStartDate
      ? parsedStartDate.toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: TOURNAMENT_DISPLAY_TIME_ZONE,
        })
      : null,
    startTimeLabel:
      shouldShowSchedule && parsedStartDate
        ? parsedStartDate.toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: TOURNAMENT_DISPLAY_TIME_ZONE,
          })
        : null,
    clubName,
    clubAddress,
    clubMapsUrl,
    clubImageUrl,
    hideVenue,
    organizerName,
    organizerPhone,
    award: cleanText(tournament.award),
    description: cleanText(tournament.description),
  }
}
