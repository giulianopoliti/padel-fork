import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BracketContainer from '../BracketContainer'
import { useTournament } from '@/hooks/use-tournament'
import { useTournamentFinalization } from '@/components/tournament/bracket-v2/hooks/useTournamentFinalization'

jest.mock('@/hooks/use-tournament', () => ({ useTournament: jest.fn() }))
jest.mock('@/components/tournament/bracket-v2/hooks/useTournamentFinalization', () => ({ useTournamentFinalization: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('swr', () => ({ useSWRConfig: () => ({ mutate: jest.fn() }) }))
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }))
jest.mock('@/components/tournament/points-review-dialog', () => ({ PointsReviewDialog: () => null }))
jest.mock('../LongBracketView', () => ({ __esModule: true, default: () => <div>Llave editable</div> }))
jest.mock('../LongScheduleView', () => ({ __esModule: true, default: () => <div>Horarios</div> }))
jest.mock('@/components/tournament/long/LongBracketGenerator', () => ({ LongBracketGenerator: () => <div>Generar llave</div> }))
jest.mock('@/components/tournament/bracket-v2/components/PublicBracketTreeView', () => ({ __esModule: true, default: () => <div>Llave de consulta</div> }))
jest.mock('../../../settings/components/BackFromBracketButton', () => ({ __esModule: true, default: () => <button>Volver a zonas</button> }))

const tournamentId = '29feadb9-a0b3-4589-a4cb-9e66c288f00b'
const setState = (status: string, cachedStatus = status): void => {
  jest.mocked(useTournament).mockReturnValue({
    tournament: { id: tournamentId, type: 'LONG', status: cachedStatus, format_config: { bracketMode: 'GOLD_SILVER' } },
    isLoading: false, error: null,
  } as ReturnType<typeof useTournament>)
  jest.mocked(useTournamentFinalization).mockReturnValue({
    status, expectedRevision: null, canShowPointsCalculation: status === 'FINISHED_POINTS_PENDING',
    canFinalize: status === 'BRACKET_PHASE', allMatchesFinished: true, reason: null,
    bracketKeys: ['GOLD', 'SILVER'], bonuses: {}, winner_id: 'champions',
    fixedRanking: true, loading: false, refetch: jest.fn().mockResolvedValue(undefined),
  })
}
const render = (isOwner = true): string => renderToStaticMarkup(
  <BracketContainer tournamentId={tournamentId} isOwner={isOwner} isPublicView={!isOwner} />,
)

describe('LONG bracket points controls', () => {
  beforeEach(() => jest.clearAllMocks())

  it('keeps the saved points summary and reopen action above the calculated bracket', () => {
    setState('FINISHED_POINTS_CALCULATED')
    const html = render()
    expect(html).toContain('Puntos acreditados')
    expect(html).toContain('Ver resumen de puntos')
    expect(html).toContain('Reabrir torneo')
    expect(html.indexOf('Reabrir torneo')).toBeLessThan(html.indexOf('Llave de consulta'))
    expect(html).not.toContain('Llave editable')
  })

  it('shows one review and reopen action when points are pending', () => {
    setState('FINISHED_POINTS_PENDING')
    const html = render()
    expect(html.match(/Revisar puntos y ascensos/g)).toHaveLength(1)
    expect(html.match(/Reabrir torneo/g)).toHaveLength(1)
    expect(html).toContain('Llave editable')
  })

  it('restores editing after reopening even while the tournament cache still says calculated', () => {
    setState('BRACKET_PHASE', 'FINISHED_POINTS_CALCULATED')
    const html = render()
    expect(html).toContain('Llave editable')
    expect(html).toContain('Finalizar torneo')
    expect(html).toContain('Volver a zonas')
    expect(html).not.toContain('Llave de consulta')
    expect(html).not.toContain('Puntos acreditados')
  })

  it('preserves the cached read-only state while finalization is still unknown', () => {
    setState('UNKNOWN', 'FINISHED_POINTS_CALCULATED')
    expect(render()).toContain('Llave de consulta')
    expect(render()).not.toContain('Llave editable')
  })

  it.each(['BRACKET_PHASE', 'FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED'])(
    'keeps administrative points controls out of the public view in %s', status => {
      setState(status)
      const html = render(false)
      expect(html).toContain('Llave de consulta')
      expect(html).not.toContain('Ver resumen de puntos')
      expect(html).not.toContain('Revisar puntos y ascensos')
      expect(html).not.toContain('Reabrir torneo')
      expect(html).not.toContain('Finalizar torneo')
    },
  )
})
