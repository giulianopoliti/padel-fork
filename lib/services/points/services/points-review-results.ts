import type { PointsReviewPlayer, PointsTournamentResult } from '../types/points-review.types'

const stageOrder: Record<PointsTournamentResult['stage'], number> = {
  champion: 0, finalist: 1, SEMIFINAL: 2, '4TOS': 3, '8VOS': 4, '16VOS': 5,
  '32VOS': 6, UNRESOLVED: 7, ZONE: 8, NO_MATCHES: 9,
}
const stageNames: Record<PointsTournamentResult['stage'], string> = {
  champion: 'Campeones', finalist: 'Subcampeones', SEMIFINAL: 'Semifinalistas',
  '4TOS': 'Eliminados en cuartos', '8VOS': 'Eliminados en octavos',
  '16VOS': 'Eliminados en 16vos', '32VOS': 'Eliminados en 32vos',
  UNRESOLVED: 'Sin posición final registrada', ZONE: 'Solo zona registrada', NO_MATCHES: 'Sin partidos registrados',
}
const cupNames = { MAIN: 'Torneo', GOLD: 'Oro', SILVER: 'Plata' }

export const compareTournamentResults = (a: PointsTournamentResult, b: PointsTournamentResult): number => {
  const cupOrder = (result: PointsTournamentResult): number => result.stage === 'NO_MATCHES' ? 4
    : result.cup === 'GOLD' || result.cup === 'MAIN' ? 0 : result.cup === 'SILVER' ? 1 : 2
  const rounds = ['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
  return cupOrder(a) - cupOrder(b) || stageOrder[a.stage] - stageOrder[b.stage]
    || (a.stage === 'UNRESOLVED' && b.stage === 'UNRESOLVED'
      ? rounds.indexOf(b.lastRound ?? '') - rounds.indexOf(a.lastRound ?? '') : 0)
}

export interface PointsResultGroup {
  id: string
  label: string
  result?: PointsTournamentResult
  players: PointsReviewPlayer[]
}

export const groupPointsByTournamentResult = (players: PointsReviewPlayer[]): PointsResultGroup[] => {
  const groups = new Map<string, PointsResultGroup>()
  for (const player of players) {
    const result = player.tournamentResult
    const id = result ? `${result.cup ?? 'NONE'}:${result.stage}:${result.coupleId}` : `player:${player.playerId}`
    if (!groups.has(id)) groups.set(id, {
      id, result, players: [], label: result
        ? `${stageNames[result.stage]}${result.cup ? ` · ${cupNames[result.cup]}` : ''}`
        : player.champion ? 'Campeón' : 'Posición histórica no registrada',
    })
    groups.get(id)!.players.push(player)
  }
  return [...groups.values()].sort((a, b) => {
    if (a.result && b.result) return compareTournamentResults(a.result, b.result)
      || a.result.coupleName.localeCompare(b.result.coupleName, 'es') || a.id.localeCompare(b.id)
    return a.players[0].playerName.localeCompare(b.players[0].playerName, 'es')
  })
}
