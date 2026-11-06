import { z } from 'zod'
import { resolveFechaBracketKeyForTournament, type FechaBracketKey, type FechaRoundType } from '@/lib/services/fecha-bracket-policy'
import type { ScheduleBatchDraft, ScheduleMetadata, ScheduleSlotContent, StoredScheduleSlot } from './types'
import type { SchedulePermissionScope, ScheduleTournamentResource } from './permissions'
import { canManageScheduleTournament, isScheduleTournamentEligible } from './permissions'
import {
  getScheduleSlotFingerprint, getScheduleSlotIdentity, isPlayableScheduleSlot,
  normalizeScheduleSlot, validateScheduleSlots,
} from './validation'

/** Conservative initial guardrails; persistence still requires local volume/concurrency QA. */
export const MAX_SCHEDULE_BATCH_TARGETS = 30
export const MAX_SCHEDULE_BATCH_PHYSICAL_SLOTS = 840

const nullableText = z.string().nullable()
const slotSchema = z.object({
  key: z.string().min(1).max(100), date: z.string(), start_time: z.string(), end_time: z.string(),
  court_name: nullableText.optional(), description: nullableText.optional(),
  max_matches: z.number().int().positive().optional(), is_available: z.boolean().optional(),
  slot_type: z.literal('TIME_RANGE').optional(), is_system: z.literal(false).optional(),
}).strict()

export const scheduleBatchSchema = z.object({
  operation_key: z.string().uuid(), source_fecha_id: z.string().uuid().nullable(),
  group_id: z.string().uuid().optional(),
  complete_member_id: z.string().uuid().optional(),
  metadata: z.object({ name: z.string().trim().min(1).max(200), description: nullableText,
    start_date: nullableText, end_date: nullableText }).strict(),
  slots: z.array(slotSchema).max(MAX_SCHEDULE_BATCH_PHYSICAL_SLOTS),
  destinations: z.array(z.object({
    tournament_id: z.string().uuid(),
    fecha: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('create') }).strict(),
      z.object({ kind: z.literal('adopt'), fecha_id: z.string().uuid() }).strict(),
    ]),
    round_type: z.enum(['ZONE', '32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']),
    bracket_key: z.enum(['MAIN', 'GOLD', 'SILVER']),
    estimated_match_duration_minutes: z.union([z.literal(60), z.literal(75), z.literal(90)]),
    max_matches_per_couple: z.number().int().positive().nullable(),
    court_choice: z.union([z.literal('preserve'), z.literal('clear'), z.object({ rename: z.record(z.string(), z.string()) }).strict()]),
    slot_adoptions: z.record(z.string(), z.string().uuid()).optional(),
  }).strict()).min(1).max(MAX_SCHEDULE_BATCH_TARGETS),
}).strict().superRefine((draft, context) => {
  if (new Set(draft.destinations.map(destination => destination.tournament_id)).size !== draft.destinations.length) {
    context.addIssue({ code: 'custom', path: ['destinations'], message: 'Un torneo no puede aparecer dos veces en la misma operación.' })
  }
  if (draft.destinations.length * draft.slots.length > MAX_SCHEDULE_BATCH_PHYSICAL_SLOTS) {
    context.addIssue({ code: 'custom', path: ['slots'], message: `La operación supera ${MAX_SCHEDULE_BATCH_PHYSICAL_SLOTS} horarios físicos. Reducí el alcance.` })
  }
  const keys = new Set(draft.slots.map(slot => slot.key))
  for (const [index, destination] of draft.destinations.entries()) {
    if (Object.keys(destination.slot_adoptions ?? {}).some(key => !keys.has(key))) {
      context.addIssue({ code: 'custom', path: ['destinations', index, 'slot_adoptions'], message: 'La selección de horarios manuales contiene una franja que ya no existe en el borrador.' })
    }
  }
})

export interface SchedulePreviewTournament extends ScheduleTournamentResource {
  name: string
  format_config: unknown
  round_options: readonly { round_type: FechaRoundType; bracket_key: FechaBracketKey }[]
}

export interface SchedulePreviewFecha extends ScheduleMetadata {
  id: string
  tournament_id: string
  fecha_number: number
  round_type: FechaRoundType
  bracket_key: FechaBracketKey
  estimated_match_duration_minutes: 60 | 75 | 90
  max_matches_per_couple: number | null
  active_group_id: string | null
  slots: readonly StoredScheduleSlot[]
}

export interface SchedulePreviewConflict {
  code: 'INELIGIBLE' | 'INCOMPATIBLE_ROUND' | 'INCOMPATIBLE_FECHA' | 'ALREADY_SHARED'
    | 'AMBIGUOUS_SLOT' | 'LOCAL_SLOT_DIFFERENCE' | 'INVALID_SLOT_ADOPTION' | 'SLOT_CONFLICT'
  message: string
  slot_key?: string
  candidate_ids?: string[]
}

export interface ScheduleDestinationPreview {
  tournament_id: string
  tournament_name: string
  fecha_id: string | null
  fecha_number: number
  transition_to_zone_phase: boolean
  new_slots: Array<ScheduleSlotContent & { key: string }>
  reused_slots: Array<{ key: string; slot_id: string }>
  preserves_local_metadata: boolean
  conflicts: SchedulePreviewConflict[]
}

export interface ScheduleBatchPreview {
  operation_key: string
  can_commit: boolean
  destinations: ScheduleDestinationPreview[]
  physical_slots_to_create: number
  physical_slots_to_reuse: number
}

/** Pure planning only. Every permission/version/conflict must be rechecked in the eventual transaction. */
export const buildScheduleBatchPreview = (
  draft: ScheduleBatchDraft,
  scope: SchedulePermissionScope,
  tournaments: readonly SchedulePreviewTournament[],
  fechas: readonly SchedulePreviewFecha[],
  today?: string,
): ScheduleBatchPreview => {
  // Validate shape even for internal callers: TypeScript is not an authorization boundary.
  const parsed = scheduleBatchSchema.parse(draft)
  const tournamentMap = new Map(tournaments.filter(tournament => canManageScheduleTournament(scope, tournament)).map(tournament => [tournament.id, tournament]))
  if (parsed.destinations.some(destination => !tournamentMap.has(destination.tournament_id))) {
    throw new Error('No tenés permisos sobre todos los destinos elegidos.')
  }
  const visibleFechas = fechas.filter(fecha => tournamentMap.has(fecha.tournament_id))
  if (parsed.source_fecha_id && !visibleFechas.some(fecha => fecha.id === parsed.source_fecha_id)) {
    throw new Error('La fecha de origen no existe o no es administrable.')
  }
  const validation = validateScheduleSlots(parsed.slots, { today, period: parsed.metadata })
  if (!validation.ok) throw new Error(validation.issues.map(issue => issue.message).join(' '))
  const destinations: ScheduleDestinationPreview[] = parsed.destinations.map(destination => {
    const tournament = tournamentMap.get(destination.tournament_id)!
    const candidates = visibleFechas.filter(fecha => fecha.tournament_id === tournament.id)
    const adoptFechaId = destination.fecha.kind === 'adopt' ? destination.fecha.fecha_id : null
    const fecha = adoptFechaId ? candidates.find(candidate => candidate.id === adoptFechaId) : undefined
    const conflicts: SchedulePreviewConflict[] = []
    if (!isScheduleTournamentEligible(tournament)) conflicts.push({ code: 'INELIGIBLE', message: 'Solo se pueden aplicar configuraciones a torneos LONG no finalizados ni cancelados.' })
    const bracket = resolveFechaBracketKeyForTournament(tournament, { roundType: destination.round_type, requestedBracketKey: destination.bracket_key })
    if (!bracket.ok || !tournament.round_options.some(option => option.round_type === destination.round_type && option.bracket_key === destination.bracket_key)) {
      conflicts.push({ code: 'INCOMPATIBLE_ROUND', message: bracket.error || 'La ronda elegida no existe en el bracket de este torneo.' })
    }
    if (destination.fecha.kind === 'adopt' && (!fecha || fecha.round_type !== destination.round_type ||
        fecha.bracket_key !== destination.bracket_key || fecha.start_date !== parsed.metadata.start_date || fecha.end_date !== parsed.metadata.end_date ||
        fecha.estimated_match_duration_minutes !== destination.estimated_match_duration_minutes || fecha.max_matches_per_couple !== destination.max_matches_per_couple)) {
      conflicts.push({ code: 'INCOMPATIBLE_FECHA', message: 'La fecha seleccionada debe pertenecer al torneo y coincidir en ronda, copa y período.' })
    }
    if (fecha?.active_group_id) conflicts.push({ code: 'ALREADY_SHARED', message: 'La fecha seleccionada ya pertenece a una configuración compartida.' })
    const existing = (fecha?.slots ?? []).filter(isPlayableScheduleSlot)
    const additions: Array<ScheduleSlotContent & { key: string }> = []
    const reused: Array<{ key: string; slot_id: string }> = []
    const usedIds = new Set<string>()
    for (const slot of validation.data) {
      const court = destination.court_choice === 'clear' ? null : destination.court_choice === 'preserve' ? slot.court_name
        : destination.court_choice.rename[slot.key]
      if (court === undefined) {
        conflicts.push({ code: 'SLOT_CONFLICT', slot_key: slot.key, message: 'La revisión de canchas debe indicar una cancha o dejarla vacía para cada franja.' })
        continue
      }
      const normalized = normalizeScheduleSlot({ ...slot, court_name: court })
      if (!normalized.ok) {
        conflicts.push({ code: 'SLOT_CONFLICT', slot_key: slot.key, message: normalized.issues.map(issue => issue.message).join(' ') })
        continue
      }
      const content = normalized.data
      const equivalents = existing.filter(candidate => getScheduleSlotIdentity(candidate) === getScheduleSlotIdentity(content))
      const selectedId = destination.slot_adoptions?.[slot.key]
      if (selectedId && !equivalents.some(candidate => candidate.id === selectedId)) {
        conflicts.push({ code: 'INVALID_SLOT_ADOPTION', slot_key: slot.key, message: 'El horario elegido ya no es una coincidencia válida.' })
        continue
      }
      if (equivalents.length > 1 && !selectedId) {
        conflicts.push({ code: 'AMBIGUOUS_SLOT', slot_key: slot.key, candidate_ids: equivalents.map(candidate => candidate.id), message: 'Hay varios horarios equivalentes. Elegí explícitamente cuál vincular.' })
        continue
      }
      const equivalent = equivalents.find(candidate => !selectedId || candidate.id === selectedId)
      if (equivalent) {
        const current = normalizeScheduleSlot(equivalent, true)
        if (!current.ok || getScheduleSlotFingerprint(current.data) !== getScheduleSlotFingerprint(content) || usedIds.has(equivalent.id)) {
          conflicts.push({ code: 'LOCAL_SLOT_DIFFERENCE', slot_key: slot.key, message: 'La coincidencia tiene capacidad, descripción o estado diferentes. Conservá los datos locales y revisá la selección.' })
        } else {
          usedIds.add(equivalent.id)
          reused.push({ key: slot.key, slot_id: equivalent.id })
        }
      } else additions.push({ ...content, key: slot.key })
    }
    const againstExisting = validateScheduleSlots(additions, { today, period: parsed.metadata, existingSlots: existing })
    // Also check court remapping against reused options and other remapped additions.
    if (!againstExisting.ok) conflicts.push(...againstExisting.issues.map(issue => ({
      code: 'SLOT_CONFLICT' as const, slot_key: issue.slot_key, message: issue.message,
    })))
    return {
      tournament_id: tournament.id, tournament_name: tournament.name,
      fecha_id: fecha?.id ?? null,
      fecha_number: fecha?.fecha_number ?? Math.max(0, ...candidates.map(candidate => candidate.fecha_number)) + 1,
      transition_to_zone_phase: !fecha && destination.round_type === 'ZONE' && tournament.status === 'NOT_STARTED',
      new_slots: additions, reused_slots: reused,
      preserves_local_metadata: !!fecha && (fecha.name !== parsed.metadata.name || fecha.description !== parsed.metadata.description),
      conflicts,
    }
  })
  return {
    operation_key: parsed.operation_key, can_commit: destinations.every(destination => destination.conflicts.length === 0), destinations,
    physical_slots_to_create: destinations.reduce((total, destination) => total + destination.new_slots.length, 0),
    physical_slots_to_reuse: destinations.reduce((total, destination) => total + destination.reused_slots.length, 0),
  }
}
