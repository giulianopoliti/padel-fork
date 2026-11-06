import { performance } from 'node:perf_hooks'
import { buildScheduleBatchPreview, type SchedulePreviewTournament } from '../lib/services/schedule-sharing/batch'
import type { ScheduleBatchDraft, ScheduleDraftSlot } from '../lib/services/schedule-sharing/types'

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tournaments: SchedulePreviewTournament[] = Array.from({ length: 30 }, (_, index) => ({
  id: id(index + 10), name: `Torneo ${index + 1}`, club_id: id(2), organization_id: null,
  type: 'LONG', status: 'NOT_STARTED', format_config: {}, round_options: [{ round_type: 'ZONE', bracket_key: 'MAIN' }],
}))
const slots: ScheduleDraftSlot[] = Array.from({ length: 7 }, (_, index) => {
  const date = `2099-11-${String(index + 6).padStart(2, '0')}`
  return [['08:00', '11:00'], ['11:00', '14:00'], ['14:00', '17:00'], ['18:00', '21:00']].map(([start_time, end_time], slotIndex) => ({
    key: `day-${index}-slot-${slotIndex}`, date, start_time, end_time, max_matches: 3,
  }))
}).flat()
const draft: ScheduleBatchDraft = {
  operation_key: id(3), source_fecha_id: null,
  metadata: { name: 'Fecha general', description: null, start_date: '2099-11-06', end_date: '2099-11-12' }, slots,
  destinations: tournaments.map(tournament => ({ tournament_id: tournament.id, fecha: { kind: 'create' },
    round_type: 'ZONE', bracket_key: 'MAIN', court_choice: 'preserve',
    estimated_match_duration_minutes: 90, max_matches_per_couple: null })),
}
const scope = { user_id: id(1), role: 'CLUB' as const, owned_club_ids: [id(2)], active_organization_ids: [] }
const elapsed: number[] = []
for (let index = 0; index < 25; index++) {
  const start = performance.now()
  const result = buildScheduleBatchPreview(draft, scope, tournaments, [], '2099-11-05')
  if (!result.can_commit || result.physical_slots_to_create !== 840) throw new Error('Unexpected preview result')
  if (index > 4) elapsed.push(performance.now() - start)
}
elapsed.sort((left, right) => left - right)
console.log(JSON.stringify({
  operation: 'pure-preview-only', tournaments: 30, days: 7, slots_per_day: 4,
  projected_physical_slots: 840, database_queries: 0, measured_runs: elapsed.length,
  median_ms: Number(elapsed[Math.floor(elapsed.length / 2)].toFixed(2)),
  p95_ms: Number(elapsed[Math.ceil(elapsed.length * 0.95) - 1].toFixed(2)),
  persistence_measured: false,
}, null, 2))
