import { createClientServiceRole } from '@/utils/supabase/server'

export const FEW_SLOTS_THRESHOLD = 2

const AUTO_MANAGED_REGISTRATION_STATUSES = ['NOT_STARTED', 'ZONE_PHASE', 'ZONE_REGISTRATION']
const BRACKET_LOCKED_STATUSES = ['BRACKET_GENERATED', 'BRACKET_ACTIVE']

export interface TournamentCapacitySummary {
  maxParticipants: number | null
  currentParticipants: number
  remainingSlots: number | null
  isFull: boolean
  hasFewSlots: boolean
}

interface TournamentCapacityRow {
  id: string
  status: string
  bracket_status?: string | null
  max_participants?: number | null
  registration_locked?: boolean | null
  registration_locked_by_capacity?: boolean | null
}

export function buildTournamentCapacitySummary(
  maxParticipants: number | null | undefined,
  currentParticipants: number,
): TournamentCapacitySummary {
  const normalizedMax =
    typeof maxParticipants === 'number' && Number.isFinite(maxParticipants) ? maxParticipants : null

  if (normalizedMax === null) {
    return {
      maxParticipants: null,
      currentParticipants,
      remainingSlots: null,
      isFull: false,
      hasFewSlots: false,
    }
  }

  const remainingSlots = Math.max(normalizedMax - currentParticipants, 0)

  return {
    maxParticipants: normalizedMax,
    currentParticipants,
    remainingSlots,
    isFull: currentParticipants >= normalizedMax,
    hasFewSlots: remainingSlots > 0 && remainingSlots <= FEW_SLOTS_THRESHOLD,
  }
}

export function canAutoManageTournamentRegistration(
  status: string | null | undefined,
  bracketStatus?: string | null,
): boolean {
  if (!status || !AUTO_MANAGED_REGISTRATION_STATUSES.includes(status)) {
    return false
  }

  return !bracketStatus || !BRACKET_LOCKED_STATUSES.includes(bracketStatus)
}

export async function getTournamentCoupleCount(supabase: any, tournamentId: string): Promise<number> {
  const { count, error } = await supabase
    .from('inscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('es_prueba', false)
    .eq('occupies_slot', true)
    .not('couple_id', 'is', null)

  if (error) {
    throw new Error(`Error counting couple inscriptions: ${error.message}`)
  }

  return count || 0
}

export async function getTournamentCoupleCounts(
  supabase: any,
  tournamentIds: string[],
): Promise<Record<string, number>> {
  if (tournamentIds.length === 0) {
    return {}
  }

  const { data, error } = await supabase
    .from('inscriptions')
    .select('tournament_id')
    .in('tournament_id', tournamentIds)
    .eq('es_prueba', false)
    .eq('occupies_slot', true)
    .not('couple_id', 'is', null)

  if (error) {
    throw new Error(`Error fetching couple inscription counts: ${error.message}`)
  }

  return (data || []).reduce((accumulator: Record<string, number>, inscription: any) => {
    const tournamentId = inscription.tournament_id
    accumulator[tournamentId] = (accumulator[tournamentId] || 0) + 1
    return accumulator
  }, {} as Record<string, number>)
}

export async function syncTournamentCapacityRegistrationLock(tournamentId: string): Promise<{
  updated: boolean
  capacity: TournamentCapacitySummary
}> {
  const supabase = await createClientServiceRole()

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('id, status, bracket_status, max_participants, registration_locked, registration_locked_by_capacity')
    .eq('id', tournamentId)
    .single()

  if (error || !tournament) {
    throw new Error(error?.message || 'Tournament not found')
  }

  return syncTournamentCapacityRegistrationLockWithClient(supabase, tournament as TournamentCapacityRow)
}

export async function syncTournamentCapacityRegistrationLockWithClient(
  supabase: any,
  tournament: TournamentCapacityRow,
): Promise<{
  updated: boolean
  capacity: TournamentCapacitySummary
}> {
  const currentParticipants = await getTournamentCoupleCount(supabase, tournament.id)
  const capacity = buildTournamentCapacitySummary(tournament.max_participants ?? null, currentParticipants)
  const canAutoManage = canAutoManageTournamentRegistration(tournament.status, tournament.bracket_status)

  let nextRegistrationLocked = Boolean(tournament.registration_locked)
  let nextLockedByCapacity = Boolean(tournament.registration_locked_by_capacity)

  if (capacity.isFull) {
    if (!nextRegistrationLocked || nextLockedByCapacity) {
      nextRegistrationLocked = true
      nextLockedByCapacity = true
    }
  } else if (nextLockedByCapacity && canAutoManage) {
    nextRegistrationLocked = false
    nextLockedByCapacity = false
  }

  const changed =
    nextRegistrationLocked !== Boolean(tournament.registration_locked) ||
    nextLockedByCapacity !== Boolean(tournament.registration_locked_by_capacity)

  if (changed) {
    const { error } = await supabase
      .from('tournaments')
      .update({
        registration_locked: nextRegistrationLocked,
        registration_locked_by_capacity: nextLockedByCapacity,
      })
      .eq('id', tournament.id)

    if (error) {
      throw new Error(`Error syncing tournament capacity lock: ${error.message}`)
    }
  }

  return {
    updated: changed,
    capacity,
  }
}
