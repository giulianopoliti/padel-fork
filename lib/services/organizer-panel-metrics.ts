import { getInscriptionState, type InscriptionStateInput } from '@/lib/tournaments/inscription-state'

export interface PanelTournament {
  id: string
  seo_slug: string | null
  name: string
  status: string
  start_date: string | null
  category_name: string | null
  gender: string
  type: string
  price: number | string | null
  is_draft: boolean | null
  clubes: { id: string; name: string } | null
  enable_transfer_proof?: boolean
  max_participants?: number | null
}

export interface PanelInscription extends InscriptionStateInput {
  tournament_id: string
  player_id: string | null
  couple_id: string | null
  is_pending: boolean | null
  couples: { player1_id: string | null; player2_id: string | null } | null
}

export interface PanelMatch {
  tournament_id: string
  status: string
  couple1_id: string | null
  couple2_id: string | null
}

export interface PanelMetrics {
  players: number
  couples: number
  pendingInscriptions: number
  occupiedSlots: number
  pendingWithoutSlot: number
  proofWithoutSlot: number
  matchesFinished: number
  matchesPending: number
  totalMatches: number
}

export type PanelTournamentWithMetrics = PanelTournament & PanelMetrics

export const aggregatePanelMetrics = (
  tournaments: PanelTournament[],
  inscriptions: PanelInscription[],
  matches: PanelMatch[],
): PanelTournamentWithMetrics[] => {
  const metrics = new Map(tournaments.map(({ id }) => [id, {
    playerIds: new Set<string>(),
    coupleIds: new Set<string>(),
    pendingInscriptions: 0,
    occupiedSlots: 0,
    pendingWithoutSlot: 0,
    proofWithoutSlot: 0,
    matchesFinished: 0,
    matchesPending: 0,
    totalMatches: 0,
  }]))

  for (const inscription of inscriptions) {
    const summary = metrics.get(inscription.tournament_id)
    if (!summary) continue
    const tournament = tournaments.find(item => item.id === inscription.tournament_id)
    const state = getInscriptionState(inscription, tournament?.enable_transfer_proof)
    if (inscription.couple_id) {
      if (state.occupiesSlot) summary.occupiedSlots++
      else { summary.pendingWithoutSlot++; if (inscription.payment_proof_path) summary.proofWithoutSlot++ }
    }
    if (inscription.is_pending || inscription.couple_id && !state.confirmed) {
      summary.pendingInscriptions += 1
      continue
    }
    if (inscription.couple_id) summary.coupleIds.add(inscription.couple_id)
    const playerIds = [inscription.player_id, inscription.couples?.player1_id, inscription.couples?.player2_id]
    for (const id of playerIds) {
      if (id) summary.playerIds.add(id)
    }
  }

  for (const match of matches) {
    const summary = metrics.get(match.tournament_id)
    if (!summary) continue
    // Initial BYEs are persisted as FINISHED with only one real couple.
    const isBye = match.status === 'BYE'
      || (match.status === 'FINISHED' && (!match.couple1_id || !match.couple2_id))
    if (isBye) continue
    summary.totalMatches += 1
    if (match.status === 'FINISHED') summary.matchesFinished += 1
    if (match.status === 'PENDING' || match.status === 'IN_PROGRESS') summary.matchesPending += 1
  }

  return tournaments.map((tournament) => {
    const summary = metrics.get(tournament.id)!
    return {
      ...tournament,
      players: summary.playerIds.size,
      couples: summary.coupleIds.size,
      pendingInscriptions: summary.pendingInscriptions,
      occupiedSlots: summary.occupiedSlots,
      pendingWithoutSlot: summary.pendingWithoutSlot,
      proofWithoutSlot: summary.proofWithoutSlot,
      matchesFinished: summary.matchesFinished,
      matchesPending: summary.matchesPending,
      totalMatches: summary.totalMatches,
    }
  })
}
