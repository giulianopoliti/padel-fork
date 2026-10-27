'use client'

import { TournamentPointsControl } from '@/components/tournament/tournament-points-control'

/** Compatibility for callers outside the bracket. All flows share one review. */
export const PointsCalculationBanner = ({ tournamentId, onPointsCalculated }: {
  tournamentId: string; winnerId: string | null; onPointsCalculated: () => void
}) => <TournamentPointsControl tournamentId={tournamentId} onUpdated={onPointsCalculated} />
