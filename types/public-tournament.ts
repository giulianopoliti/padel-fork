import type { Gender } from "@/types"

export interface PublicTournamentSummary {
  id: string
  seoSlug?: string | null
  name: string
  status: string
  type?: "LONG" | "AMERICAN" | string | null
  category?: string | null
  categoryName: string | null
  gender: Gender | string | null
  startDate: string | null
  endDate?: string | null
  price?: number | string | null
  award?: string | null
  enablePublicInscriptions?: boolean
  showPublicInscriptions?: boolean
  registrationLocked?: boolean | null
  bracketStatus?: string | null
  currentParticipants?: number
  maxParticipants?: number | null
  remainingSlots?: number | null
  isFull?: boolean
  hasFewSlots?: boolean
  showFewSlotsAlert?: boolean
  hideVenue?: boolean
  club: {
    id?: string | null
    name: string | null
    address: string | null
    formattedAddress?: string | null
    googlePlaceId?: string | null
    latitude?: number | string | null
    longitude?: number | string | null
    mapsUrl?: string | null
  } | null
  enableTransferProof?: boolean
  transferAlias?: string | null
  transferAmount?: number | null
}
