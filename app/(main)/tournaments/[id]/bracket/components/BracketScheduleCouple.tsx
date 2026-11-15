import { Badge } from '@/components/ui/badge'
import { SubstitutionMenu } from '@/components/tournament/long/substitution-menu'
import type { BracketMatchV2, CoupleData } from '@/components/tournament/bracket-v2/types/bracket-types'
import type { FechaSubstitute } from '@/lib/services/long-fecha-substitutions'

export type BracketScheduleSubstitutions = {
  forFecha: ReadonlyMap<string, FechaSubstitute>
  onSaved: (fechaId?: string) => void
  hasMultipleFechas: boolean
}

interface BracketScheduleCoupleProps {
  couple?: CoupleData
  match: BracketMatchV2
  tournamentId: string
  substitutions?: BracketScheduleSubstitutions
}

export const BracketScheduleCouple = ({ couple, match, tournamentId, substitutions }: BracketScheduleCoupleProps) => {
  if (!couple) return <>Pareja a confirmar</>
  const dateSubstitute = substitutions?.forFecha.get(couple.id)
  const matchSubstitute = couple.substitute_slot === 1 ? couple.player1_details : couple.substitute_slot === 2 ? couple.player2_details : undefined
  const matchSubstituteName = [matchSubstitute?.first_name, matchSubstitute?.last_name].filter(Boolean).join(' ')
  const canManage = substitutions && [match.couple1_id, match.couple2_id].includes(couple.id)
    && ['DRAFT', 'PENDING', 'WAITING_OPPONENT'].includes(match.status)

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-x-1.5">
        <span>{couple.name}</span>
        {couple.substitute_slot && <Badge variant="secondary">Suplente</Badge>}
        {canManage && <SubstitutionMenu
          tournamentId={tournamentId} coupleId={couple.id} coupleName={couple.name || 'la pareja'} matchId={match.id}
          bracketSchedule hasSubstitute={Boolean(couple.substitute_slot)} hasDateSubstitute={Boolean(dateSubstitute)}
          onSaved={substitutions.onSaved}
        />}
      </span>
      {dateSubstitute && (dateSubstitute.slot !== couple.substitute_slot || dateSubstitute.player_name !== matchSubstituteName)
        && <span className="block text-xs font-normal text-muted-foreground">Vota como suplente · {dateSubstitute.player_name}</span>}
    </>
  )
}
