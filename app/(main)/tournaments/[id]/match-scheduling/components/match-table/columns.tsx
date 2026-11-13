'use client'

import { ColumnDef } from '@tanstack/react-table'
import { ExistingMatch, SetResult } from '../../actions'
import StatusBadge from './StatusBadge'
import CouplesDisplay from './CouplesDisplay'
import ScheduleDisplay from './ScheduleDisplay'
import ClubDisplay from './ClubDisplay'
import MatchActionsDropdown from './MatchActionsDropdown'
import { useIsMobile } from '@/hooks/use-mobile'

interface Club {
  id: string
  name: string
}

export interface MatchTableProps {
  onMatchDelete: (matchId: string) => Promise<void>
  onMatchResultSaved?: () => void
  onUpdateMatchResult?: (matchId: string, sets: SetResult[], winnerId: string, resultCouple1: string, resultCouple2: string) => Promise<{success: boolean, error?: string}>
  onModifyMatchResult?: (matchId: string, sets: SetResult[], winnerId: string, resultCouple1: string, resultCouple2: string) => Promise<{success: boolean, error?: string}>
  onModifySchedule?: (scheduleData: {matchId: string, date: string | null, startTime: string | null, endTime: string | null, court: string | null, notes?: string, clubId?: string}) => Promise<{success: boolean, error?: string}>
  onScheduleModified?: () => void
  loading?: boolean
  clubes?: Club[]
}

export const createColumns = (
  onMatchDelete: (matchId: string) => Promise<void>,
  onMatchResultSaved?: () => void,
  onUpdateMatchResult?: (matchId: string, sets: SetResult[], winnerId: string, resultCouple1: string, resultCouple2: string) => Promise<{success: boolean, error?: string}>,
  onModifyMatchResult?: (matchId: string, sets: SetResult[], winnerId: string, resultCouple1: string, resultCouple2: string) => Promise<{success: boolean, error?: string}>,
  onModifySchedule?: (scheduleData: {matchId: string, date: string | null, startTime: string | null, endTime: string | null, court: string | null, notes?: string, clubId?: string}) => Promise<{success: boolean, error?: string}>,
  onScheduleModified?: () => void,
  loading?: boolean,
  isMobile?: boolean,
  clubes?: Club[]
): ColumnDef<ExistingMatch>[] => {
  // Mobile: Reduce column sizes and hide non-essential info
  if (isMobile) {
    return [
      {
        accessorKey: 'status',
        header: 'Estado',
        size: 70,
        cell: ({ row }) => <StatusBadge status={row.original.status} />
      },
      {
        accessorKey: 'couples',
        header: 'Parejas',
        size: 180,
        cell: ({ row }) => <CouplesDisplay match={row.original} onSubstitutionSaved={onMatchResultSaved} />
      },
      {
        accessorKey: 'schedule',
        header: 'Horario',
        size: 120,
        cell: ({ row }) => <ScheduleDisplay match={row.original} />
      },
      {
        id: 'actions',
        header: '',
        size: 40,
        cell: ({ row }) => (
          <MatchActionsDropdown
            match={row.original}
            onMatchDelete={onMatchDelete}
            onMatchResultSaved={onMatchResultSaved}
            onUpdateMatchResult={onUpdateMatchResult}
            onModifyMatchResult={onModifyMatchResult}
            onModifySchedule={onModifySchedule}
            onScheduleModified={onScheduleModified}
            loading={loading}
            clubes={clubes}
          />
        )
      }
    ]
  }

  // Desktop: Original sizes
  return [
    {
      accessorKey: 'status',
      header: 'Estado',
      size: 120,
      cell: ({ row }) => <StatusBadge status={row.original.status} />
    },
    {
      accessorKey: 'couples',
      header: 'Parejas',
      size: 300,
      cell: ({ row }) => <CouplesDisplay match={row.original} onSubstitutionSaved={onMatchResultSaved} />
    },
    {
      accessorKey: 'schedule',
      header: 'Horario',
      size: 200,
      cell: ({ row }) => <ScheduleDisplay match={row.original} />
    },
    {
      accessorKey: 'club',
      header: 'Club',
      size: 150,
      cell: ({ row }) => <ClubDisplay match={row.original} />
    },
    {
      id: 'actions',
      header: '',
      size: 60,
      cell: ({ row }) => (
        <MatchActionsDropdown
          match={row.original}
          onMatchDelete={onMatchDelete}
          onMatchResultSaved={onMatchResultSaved}
          onUpdateMatchResult={onUpdateMatchResult}
          onModifyMatchResult={onModifyMatchResult}
          onModifySchedule={onModifySchedule}
          onScheduleModified={onScheduleModified}
          loading={loading}
          clubes={clubes}
        />
      )
    }
  ]
}
