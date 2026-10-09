/**
 * Utilidades para obtener partidos de jugadores en torneos AMERICANOS
 * Adaptado de player-matches.ts para el formato de torneo americano
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AmericanPlayerMatch {
  id: string
  status: string
  round: 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL'
  couple1_id: string | null
  couple2_id: string | null
  winner_id: string | null
  result_couple1: string | null
  result_couple2: string | null
  created_at: string
  zone_id?: string | null
  tournament_id: string
  couple1?: {
    id: string
    player1_id: string
    player2_id: string
    player1: {
      id: string
      first_name: string
      last_name: string
    }
    player2: {
      id: string
      first_name: string
      last_name: string
    }
  }
  couple2?: {
    id: string
    player1_id: string
    player2_id: string
    player1: {
      id: string
      first_name: string
      last_name: string
    }
    player2: {
      id: string
      first_name: string
      last_name: string
    }
  }
  set_matches?: {
    id: string
    set_number: number
    couple1_games: number
    couple2_games: number
    winner_couple_id: string
  }[]
}

export interface AmericanPlayerTournamentData {
  isRegistered: boolean
  nextMatch: AmericanPlayerMatch | null
  zoneMatches: AmericanPlayerMatch[]
  bracketMatches: AmericanPlayerMatch[]
  playerCoupleId: string | null
  totalCouplesInTournament: number
}

/**
 * Obtiene todos los datos de partidos de un jugador en un torneo americano específico
 */
export async function getAmericanPlayerTournamentData(
  playerId: string,
  tournamentId: string,
  supabase: SupabaseClient
): Promise<AmericanPlayerTournamentData> {

  try {
    // 1. Obtener total de parejas inscriptas en el torneo
    const { count: totalCouples } = await supabase
      .from('inscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .not('couple_id', 'is', null)

    // 2. Verificar si el jugador está registrado en el torneo
    // Buscar inscripciones donde el player esté como player1_id o player2_id en la pareja
    const { data: inscriptions, error: inscriptionError } = await supabase
      .from('inscriptions')
      .select(`
        id,
        couple_id,
        couples!inner (
          id,
          player1_id,
          player2_id
        )
      `)
      .eq('tournament_id', tournamentId)

    if (inscriptionError) throw inscriptionError

    if (!inscriptions || inscriptions.length === 0) {
      return {
        isRegistered: false,
        nextMatch: null,
        zoneMatches: [],
        bracketMatches: [],
        playerCoupleId: null,
        totalCouplesInTournament: totalCouples || 0
      }
    }

    // Encontrar la inscripción donde el player está en la pareja
    const playerInscription = inscriptions.find(inscription => {
      const couple = Array.isArray(inscription.couples) ? inscription.couples[0] : inscription.couples
      return couple?.player1_id === playerId || couple?.player2_id === playerId
    })

    if (!playerInscription) {
      return {
        isRegistered: false,
        nextMatch: null,
        zoneMatches: [],
        bracketMatches: [],
        playerCoupleId: null,
        totalCouplesInTournament: totalCouples || 0
      }
    }

    const playerCoupleId = playerInscription.couple_id

    // 3. Obtener todos los partidos donde participa la pareja del jugador
    // Excluir partidos DRAFT para que los jugadores solo vean partidos publicados
    const { data: matches, error } = await supabase
      .from('matches')
      .select(`
        id,
        status,
        round,
        couple1_id,
        couple2_id,
        winner_id,
        result_couple1,
        result_couple2,
        created_at,
        zone_id,
        tournament_id,
        couple1:couples!couple1_id(
          id,
          player1_id,
          player2_id,
          player1:players!player1_id(
            id,
            first_name,
            last_name
          ),
          player2:players!player2_id(
            id,
            first_name,
            last_name
          )
        ),
        couple2:couples!couple2_id(
          id,
          player1_id,
          player2_id,
          player1:players!player1_id(
            id,
            first_name,
            last_name
          ),
          player2:players!player2_id(
            id,
            first_name,
            last_name
          )
        ),
        set_matches(
          id,
          set_number,
          couple1_games,
          couple2_games,
          winner_couple_id
        )
      `)
      .eq('tournament_id', tournamentId)
      .neq('status', 'DRAFT')  // Excluir partidos borrador
      .or(`couple1_id.eq.${playerCoupleId},couple2_id.eq.${playerCoupleId}`)
      .order('created_at', { ascending: true })
      .returns<AmericanPlayerMatch[]>()

    if (error) {
      console.error('Error fetching american player matches:', error)
      throw error
    }

    const playerMatches = matches || []

    // 4. Separar partidos por tipo
    const zoneMatches = playerMatches.filter(m => m.round === 'ZONE')
    const bracketMatches = playerMatches.filter(m => m.round !== 'ZONE')

    // 5. Encontrar próximo partido (primer PENDING, SCHEDULED o IN_PROGRESS)
    const nextMatch = playerMatches.find(m =>
      m.status === 'PENDING' || m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS'
    ) || null

    return {
      isRegistered: true,
      nextMatch,
      zoneMatches,
      bracketMatches,
      playerCoupleId,
      totalCouplesInTournament: totalCouples || 0
    }

  } catch (error) {
    console.error('Error in getAmericanPlayerTournamentData:', error)
    throw error
  }
}

/**
 * Formatea el nombre de una pareja para mostrar
 */
export function formatAmericanCoupleName(couple: AmericanPlayerMatch['couple1']): string {
  if (!couple?.player1 || !couple?.player2) {
    return 'Pareja no definida'
  }

  const player1Name = `${couple.player1.first_name} ${couple.player1.last_name}`
  const player2Name = `${couple.player2.first_name} ${couple.player2.last_name}`

  return `${player1Name} / ${player2Name}`
}

/**
 * Obtiene el nombre de la pareja oponente para un match específico
 */
export function getAmericanOpponentCoupleName(match: AmericanPlayerMatch, playerCoupleId: string): string {
  const isPlayerInCouple1 = match.couple1_id === playerCoupleId
  const opponentCouple = isPlayerInCouple1 ? match.couple2 : match.couple1

  return formatAmericanCoupleName(opponentCouple)
}

/**
 * Determina si el jugador ganó un partido
 */
export function didAmericanPlayerWin(match: AmericanPlayerMatch, playerCoupleId: string): boolean | null {
  if (!match.winner_id || match.status !== 'FINISHED') {
    return null
  }

  return match.winner_id === playerCoupleId
}

/**
 * Obtiene el nombre traducido de la ronda
 */
export function getAmericanRoundDisplayName(round: string): string {
  const roundNames: Record<string, string> = {
    'ZONE': 'Zona Clasificatoria',
    '32VOS': '32vos de Final',
    '16VOS': '16vos de Final',
    '8VOS': 'Octavos de Final',
    '4TOS': 'Cuartos de Final',
    'SEMIFINAL': 'Semifinal',
    'FINAL': 'Final'
  }

  return roundNames[round] || round
}
