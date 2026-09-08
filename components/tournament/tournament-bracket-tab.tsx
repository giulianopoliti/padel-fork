"use client"

import TournamentBracketWrapper from "./tournament-bracket-wrapper"
import { Card, CardContent } from "@/components/ui/card"
import React from "react"

interface TournamentBracketTabProps {
  tournamentId: string;
  isOwner: boolean;
  isPublicView?: boolean;
  tournamentStatus?: string;
  bracketMode?: 'NONE' | 'SINGLE' | 'GOLD_SILVER';
  onDataRefresh?: () => void;
}

// ✅ FIXED: Memoize the entire tab component to prevent unnecessary re-renders
const TournamentBracketTab: React.FC<TournamentBracketTabProps> = React.memo(({
  tournamentId,
  isOwner,
  isPublicView = false,
  tournamentStatus,
  bracketMode,
  onDataRefresh
}) => {
  const MemoizedBracket = React.memo(TournamentBracketWrapper);

  return (
    <Card>
      <CardContent className="p-4">
        <MemoizedBracket
          tournamentId={tournamentId}
          isOwner={isOwner}
          isPublicView={isPublicView}
          tournamentStatus={tournamentStatus}
          bracketMode={bracketMode}
          onDataRefresh={onDataRefresh}
        />
      </CardContent>
    </Card>
  );
}, (prevProps, nextProps) => {
  // ✅ Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.tournamentId === nextProps.tournamentId &&
    prevProps.isOwner === nextProps.isOwner &&
    prevProps.isPublicView === nextProps.isPublicView &&
    prevProps.tournamentStatus === nextProps.tournamentStatus &&
    prevProps.bracketMode === nextProps.bracketMode &&
    prevProps.onDataRefresh === nextProps.onDataRefresh
  )
});

export default TournamentBracketTab;
