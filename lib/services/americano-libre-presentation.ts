import type { FreeBracketSnapshot } from '@/types/americano-libre'
import type { FreeEditorData } from '@/types/americano-libre-editor'
import { BracketState, type BracketData, type BracketMatchV2, type CoupleData, type ParticipantSlot } from '@/components/tournament/bracket-v2/types/bracket-types'
import type { TreeRelation } from '@/components/tournament/bracket-v2/hooks/useBracketTreeLayout'
import { DEFAULT_BRACKET_CONFIG } from '@/components/tournament/bracket-v2/constants/bracket-constants'

const ROUND_LABELS: Record<string, string> = { '32VOS': 'Treintaidosavos', '16VOS': 'Dieciseisavos', '8VOS': 'Octavos', '4TOS': 'Cuartos', SEMIFINAL: 'Semifinal', FINAL: 'Final' }

// Adapt presentation only. The snapshot remains the authority for entry origins,
// active branches and winner connections; the Multizone writer is never used.
export const presentFreeBracket = (snapshot: FreeBracketSnapshot, editor: FreeEditorData, editing: boolean): {
  data: BracketData; relations: TreeRelation[]
} => {
  const couples = new Map(editor.couples.map((couple) => {
    const [name1 = 'Jugador sin información', name2 = 'Jugador sin información'] = couple.name.split(' / ')
    const value: CoupleData = {
      id: couple.coupleId, name: couple.name,
      player1_id: couple.player1?.id ?? '', player2_id: couple.player2?.id ?? '',
      player1_details: couple.player1 ?? { id: '', first_name: name1, last_name: '' },
      player2_details: couple.player2 ?? { id: '', first_name: name2, last_name: '' },
    }
    return [couple.coupleId, value] as const
  }))
  const byId = new Map(snapshot.matches.map((match) => [match.id, match]))
  const matches = snapshot.matches.filter((match) => editing || match.bracket_is_active)
  const visibleIds = new Set(matches.map((match) => match.id))
  const participant = (match: FreeBracketSnapshot['matches'][number], slot: 1 | 2): ParticipantSlot => {
    const id = slot === 1 ? match.couple1_id : match.couple2_id
    const origin = slot === 1 ? match.slot1_origin : match.slot2_origin
    if (id) return { type: 'couple', couple: couples.get(id) ?? { id, player1_id: '', player2_id: '', name: 'Pareja sin información' } }
    if (origin === 'BYE') return { type: 'bye' }
    if (origin === 'ENTRY') return { type: 'empty' }
    const incoming = snapshot.hierarchy.find((edge) => edge.parent_match_id === match.id && edge.parent_slot === slot)
    const child = incoming && byId.get(incoming.child_match_id)
    return { type: 'placeholder', placeholder: {
      display: child ? `Ganador de ${ROUND_LABELS[child.round]} ${child.order_in_round}` : 'Ganador pendiente',
      sourceMatchId: child?.id, rule: { type: 'match-winner', parentMatchId: child?.id }, isDefinitive: false,
    } }
  }
  const presented: BracketMatchV2[] = matches.map((match) => ({
    id: match.id, round: match.round as BracketMatchV2['round'], order_in_round: match.order_in_round,
    status: ['IN_PROGRESS', 'FINISHED', 'DRAFT', 'CANCELED'].includes(match.status)
      ? match.status as BracketMatchV2['status']
      : match.couple1_id && match.couple2_id ? 'PENDING' : 'WAITING_OPPONENT',
    participants: { slot1: participant(match, 1), slot2: participant(match, 2) },
    couple1_id: match.couple1_id, couple2_id: match.couple2_id, winner_id: match.winner_id,
    result_couple1: match.bye_processed && match.winner_id === match.couple1_id ? 'W' : match.score1,
    result_couple2: match.bye_processed && match.winner_id === match.couple2_id ? 'W' : match.score2,
    scheduling: match.court ? { court: match.court } : undefined,
    result: match.winner_id && match.score1 != null && match.score2 != null && /^\d+$/.test(match.score1) && /^\d+$/.test(match.score2) ? {
      winner: match.winner_id === match.couple1_id ? 'slot1' : 'slot2',
      sets: [{ slot1Score: Number(match.score1), slot2Score: Number(match.score2) }],
    } : undefined,
  }))
  const relations = snapshot.hierarchy.flatMap((edge): TreeRelation[] => {
    const parent = byId.get(edge.parent_match_id)!
    const origin = edge.parent_slot === 1 ? parent.slot1_origin : parent.slot2_origin
    const inactive = !parent.bracket_is_active || origin !== 'WINNER' || !byId.get(edge.child_match_id)?.bracket_is_active
    if (!visibleIds.has(edge.parent_match_id) || !visibleIds.has(edge.child_match_id) || (!editing && inactive)) return []
    return [{ parentMatchId: edge.parent_match_id, childMatchId: edge.child_match_id, parentSlot: edge.parent_slot, inactive }]
  })
  return { data: {
    matches: presented, seeds: [], zones: [], config: DEFAULT_BRACKET_CONFIG,
    state: presented.every((match) => match.status === 'FINISHED') ? BracketState.COMPLETED : BracketState.PARTIALLY_RESOLVED,
    algorithmInfo: { algorithm: 'custom', description: 'Asignación manual' },
  }, relations }
}
