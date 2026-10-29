import { createClient } from '@/utils/supabase/server'
import { getInscriptionState } from '@/lib/tournaments/inscription-state'
import {
  resolvePlayerTournamentStatus,
  type PlayerTournamentStatus,
  type PlayerTournamentStatusInscription,
  type PlayerTournamentStatusMatch
} from './player-tournament-status.shared'

function logStatusInconsistency(status: PlayerTournamentStatus) {
  if (status.state !== 'INCONSISTENT_DATA') return

  console.warn('[PLAYER_TOURNAMENT_STATUS_INCONSISTENCY]', {
    metric: 'player_tournament_status_inconsistency',
    inconsistency_type: status.inconsistencyType || 'unknown',
    tournament_id: status.tournamentId,
    player_id: status.playerId,
    couple_id: status.coupleId
  })
}

async function fetchTournamentInscriptions(
  supabase: any,
  tournamentId: string
): Promise<PlayerTournamentStatusInscription[]> {
  const { data, error } = await supabase
    .from('inscriptions')
    .select(`
      id,
      tournament_id,
      couple_id,
      player_id,
      is_eliminated,
      is_pending,
      occupies_slot,
      payment_method,
      payment_proof_path,
      proof_waived_at,
      tournaments(enable_transfer_proof),
      created_at,
      couples (
        id,
        player1_id,
        player2_id
      )
    `)
    .eq('tournament_id', tournamentId)

  if (error) {
    console.error('[fetchTournamentInscriptions] Failed to fetch inscriptions:', {
      tournamentId,
      error: error.message
    })
    return []
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    tournament_id: row.tournament_id,
    couple_id: row.couple_id,
    player_id: row.player_id,
    is_eliminated: row.is_eliminated,
    is_pending: row.is_pending,
    occupies_slot: row.occupies_slot,
    registration_incomplete: !getInscriptionState(row, (Array.isArray(row.tournaments) ? row.tournaments[0] : row.tournaments)?.enable_transfer_proof).confirmed,
    created_at: row.created_at,
    couples: Array.isArray(row.couples) ? row.couples[0] || null : row.couples || null
  }))
}

async function fetchPendingOrInProgressMatches(
  supabase: any,
  tournamentId: string,
  playerCoupleIds: string[]
): Promise<PlayerTournamentStatusMatch[]> {
  if (playerCoupleIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('matches')
    .select('id, tournament_id, couple1_id, couple2_id, status')
    .eq('tournament_id', tournamentId)
    .in('status', ['PENDING', 'IN_PROGRESS'])
    .or(`couple1_id.in.(${playerCoupleIds.join(',')}),couple2_id.in.(${playerCoupleIds.join(',')})`)

  if (error) {
    console.error('[fetchPendingOrInProgressMatches] Failed to fetch matches:', {
      tournamentId,
      error: error.message
    })
    return []
  }

  return data || []
}

async function fetchPlayerCoupleIds(
  supabase: any,
  playerId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('couples')
    .select('id')
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)

  if (error) {
    console.error('[fetchPlayerCoupleIds] Failed to fetch player couples:', {
      playerId,
      error: error.message
    })
    return []
  }

  return (data || []).map((row: any) => row.id).filter(Boolean)
}

export async function getPlayerTournamentStatus(
  playerId: string,
  tournamentId: string
): Promise<PlayerTournamentStatus> {
  const supabase = await createClient()
  const playerCoupleIds = await fetchPlayerCoupleIds(supabase, playerId)
  const [inscriptions, pendingMatches] = await Promise.all([
    fetchTournamentInscriptions(supabase, tournamentId),
    fetchPendingOrInProgressMatches(supabase, tournamentId, playerCoupleIds)
  ])

  const status = resolvePlayerTournamentStatus(
    playerId,
    tournamentId,
    inscriptions,
    pendingMatches
  )

  logStatusInconsistency(status)
  return status
}

export async function getPlayerTournamentStatuses(
  playerId: string,
  tournamentIds: string[]
): Promise<Record<string, PlayerTournamentStatus>> {
  const uniqueTournamentIds = Array.from(new Set(tournamentIds.filter(Boolean)))
  if (uniqueTournamentIds.length === 0) return {}

  const statusEntries = await Promise.all(
    uniqueTournamentIds.map(async (tournamentId) => {
      const status = await getPlayerTournamentStatus(playerId, tournamentId)
      return [tournamentId, status] as const
    })
  )

  return Object.fromEntries(statusEntries)
}
