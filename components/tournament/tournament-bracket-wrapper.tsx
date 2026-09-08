"use client"

import { BracketVisualizationV2 } from './bracket-v2/BracketVisualizationV2'
import ReadOnlyBracketTab from './read-only-bracket-tab'

interface TournamentBracketWrapperProps {
  tournamentId: string
  isOwner: boolean
  isPublicView?: boolean
  tournamentStatus?: string
  bracketMode?: 'NONE' | 'SINGLE' | 'GOLD_SILVER'
  onDataRefresh?: () => void
}

/**
 * 🎯 BRACKET WRAPPER SIMPLIFICADO
 *
 * Solo 2 vistas:
 * - Owner: BracketVisualizationV2 (drag & drop completo)
 * - Público/Jugador: ReadOnlyBracketTab (vista moderna read-only)
 */
export default function TournamentBracketWrapper({
  tournamentId,
  isOwner,
  isPublicView,
  tournamentStatus,
  bracketMode,
  onDataRefresh
}: TournamentBracketWrapperProps) {

  // Vista Owner: Sistema V2 con drag & drop completo
  if (isOwner) {
    return (
      <BracketVisualizationV2
        tournamentId={tournamentId}
        algorithm="serpentine"
        isOwner={true}
        tournamentStatus={tournamentStatus}
        bracketMode={bracketMode}
        config={{
          features: {
            enableDragDrop: true,
            enableLiveScoring: true,
            showStatistics: false,
            showSeeds: true,
            showZoneInfo: true,
            autoProcessBYEs: true
          }
        }}
        onDataRefresh={onDataRefresh}
      />
    )
  }

  // Vista Pública/Jugador: ReadOnly moderno con BATACAZO
  return (
    <ReadOnlyBracketTab
      tournamentId={tournamentId}
      tournamentStatus={tournamentStatus}
    />
  )
}
