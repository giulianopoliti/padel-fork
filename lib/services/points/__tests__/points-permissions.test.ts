jest.mock('@/lib/tournaments/finalization', () => ({
  loadTournamentFinalization: jest.fn(),
  getTournamentBonuses: jest.fn(() => ({ MAIN: { enabled: true, champion: 30, finalist: 10 } })),
}))
jest.mock('@/lib/services/tournament-disqualifications', () => ({ getActiveDisqualificationMatchIds: jest.fn(async () => new Set()) }))

import { PointsCalculatorService } from '../services/points.calculator.service'
import { loadTournamentFinalization } from '@/lib/tournaments/finalization'

describe('Points calculation with restricted player column permissions', () => {
  it('calculates matches and bonuses without reading private player columns', async () => {
    jest.mocked(loadTournamentFinalization).mockResolvedValue({
      tournament: { status: 'FINISHED_POINTS_PENDING', type: 'AMERICAN', format_config: {} },
      allMatchesFinished: true, bracketKeys: ['MAIN'],
    } as never)
    const playerIds = ['winner1', 'winner2', 'loser1', 'loser2']
    const players = playerIds.map(id => ({ id, first_name: id, last_name: 'Test', score: 1000 }))
    const snapshots = players.map(player => ({ player_id: player.id, score: player.score, player_name: player.first_name, category: '7ma' }))
    const matches = [{ id: 'final', type: 'ELIMINATION', round: 'FINAL', bracket_key: 'MAIN', status: 'FINISHED', winner_id: 'winners', couple1_id: 'winners', couple2_id: 'losers' }]
    const selectedColumns: string[] = []
    const supabase = {
      from: jest.fn((table: string) => {
        let selected = ''
        let coupleId = ''
        const response = () => {
          if (selected.includes('players!') || (table === 'players' && selected.includes('*'))) {
            return { data: null, error: { code: '42501', message: 'permission denied for table players' } }
          }
          if (table === 'tournaments') return { data: { type: 'AMERICAN' }, error: null }
          if (table === 'ranking_snapshots') return { data: snapshots, error: null }
          if (table === 'matches') return { data: matches, error: null }
          if (table === 'players') return { data: players, error: null }
          if (table === 'couples') return { data: { id: coupleId, player1_id: coupleId === 'winners' ? 'winner1' : 'loser1', player2_id: coupleId === 'winners' ? 'winner2' : 'loser2' }, error: null }
          throw new Error(`Unexpected table ${table}`)
        }
        const query = {
          select: (columns: string) => { selected = columns; selectedColumns.push(columns); return query },
          eq: (column: string, value: string) => { if (column === 'id') coupleId = value; return query },
          in: () => query,
          limit: async () => ({ data: [{ id: 'existing-snapshot' }], error: null }),
          single: async () => response(),
          then: (resolve: (result: unknown) => unknown) => Promise.resolve(resolve(response())),
        }
        return query
      }),
    }
    const result = await PointsCalculatorService.calculateTournamentPoints('tournament', supabase)
    expect(result.totalMatches).toBe(1)
    expect(result.playerUpdates).toHaveLength(4)
    expect(result.playerUpdates.find(player => player.playerId === 'winner1')).toMatchObject({ bonus: 30, pointsEarned: 12, newScore: 1042 })
    expect(result.playerUpdates.find(player => player.playerId === 'loser1')).toMatchObject({ bonus: 10, pointsEarned: -8, newScore: 1002 })
    expect(selectedColumns.some(columns => columns.includes('players!') || columns.includes('*'))).toBe(false)
  })
})
