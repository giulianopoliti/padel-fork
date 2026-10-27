import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import type { PointsContextResponse } from '../types/points-review.types'

export const makeContext = (goldSilver = false): PointsContextResponse => ({
  fingerprint: 'a'.repeat(32), settlement: null,
  context: {
    tournament: { id: 'tournament', status: 'FINISHED_POINTS_PENDING', type: 'AMERICAN', format_type: null,
      format_config: getTournamentFormatPreset(goldSilver ? 'AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_2' : 'AMERICAN_SINGLE_ZONE_GLOBAL_2') },
    players: Array.from({ length: goldSilver ? 8 : 4 }, (_, index) => ({ id: `p${index + 1}`, first_name: `Player ${index + 1}`, last_name: 'Test', score: 890, category_name: '7ma' })),
    couples: Array.from({ length: goldSilver ? 4 : 2 }, (_, index) => ({ id: `c${index + 1}`, player1_id: `p${index * 2 + 1}`, player2_id: `p${index * 2 + 2}` })),
    matches: Array.from({ length: goldSilver ? 2 : 1 }, (_, index) => ({ id: `m${index + 1}`, type: 'ELIMINATION', round: 'FINAL', bracket_key: goldSilver ? ['GOLD', 'SILVER'][index] : 'MAIN',
      status: 'FINISHED', winner_id: `c${index * 2 + 1}`, couple1_id: `c${index * 2 + 1}`, couple2_id: `c${index * 2 + 2}`, bracket_is_active: true })),
    inscriptions: Array.from({ length: goldSilver ? 4 : 2 }, (_, index) => ({ player_id: null, couple_id: `c${index + 1}`, is_pending: false })),
    categories: [{ name: '7ma', lower_range: 600, upper_range: 899 }, { name: '6ta', lower_range: 900, upper_range: 1199 }],
    snapshots: [], disqualifications: [], history: [],
  },
})
