'use client'

import React from 'react'
import { ExistingMatch } from '../../actions'
import { Badge } from '@/components/ui/badge'
import { SubstitutionMenu } from '@/components/tournament/long/substitution-menu'

interface CouplesDisplayProps {
  match: ExistingMatch
  onSubstitutionSaved?: () => void
}

const CouplesDisplay: React.FC<CouplesDisplayProps> = ({ match, onSubstitutionSaved }) => {
  const renderCouple = (couple: ExistingMatch['couple1'], coupleId: string | null, fallback: string) => {
    if (!couple?.player1 || !couple.player2) return fallback
    return <>
      {couple.player1.first_name} {couple.player1.last_name}
      {couple.substitute_slot === 1 && <Badge variant="secondary" className="ml-1">Suplente</Badge>}
      {' / '}{couple.player2.first_name} {couple.player2.last_name}
      {couple.substitute_slot === 2 && <Badge variant="secondary" className="ml-1">Suplente</Badge>}
      {match.status === 'PENDING' && match.tournament_id && coupleId && onSubstitutionSaved && <SubstitutionMenu
        tournamentId={match.tournament_id} matchId={match.id} coupleId={coupleId} onSaved={onSubstitutionSaved}
        coupleName={`${couple.player1.first_name} ${couple.player1.last_name} / ${couple.player2.first_name} ${couple.player2.last_name}`} />}
    </>
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-900">
        {renderCouple(match.couple1, match.couple1_id, 'Pareja 1')}
      </div>
      <div className="flex items-center justify-center">
        <div className="border-t border-gray-300 flex-grow"></div>
        <span className="px-2 text-xs text-gray-500 font-medium">vs</span>
        <div className="border-t border-gray-300 flex-grow"></div>
      </div>
      <div className="text-sm font-medium text-gray-900">
        {renderCouple(match.couple2, match.couple2_id, 'Pareja 2')}
      </div>
    </div>
  )
}

export default CouplesDisplay
