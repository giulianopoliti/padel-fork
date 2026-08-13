import { MatchRecommendationInput } from '../types'

// Anonymized shape of Fecha 3 from a completed 32-couple production tournament.
// No names, emails, notes or production identifiers are retained.
const completedMatches = [2, 2, 2, 2, 1, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 2, 1]

const availabilityByCouple: Record<string, string[]> = {
  C01: ['S04'], C03: ['S05'], C04: ['S02', 'S03'], C05: ['S01', 'S02', 'S03'],
  C06: ['S02', 'S04'], C07: ['S02', 'S04'], C09: ['S01'], C10: ['S01', 'S05'],
  C11: ['S03', 'S05'], C13: ['S01', 'S05'], C14: ['S05'], C15: ['S01', 'S02', 'S03'],
  C16: ['S01', 'S02', 'S05'], C18: ['S02', 'S04'], C20: ['S02', 'S03', 'S04'],
  C21: ['S03'], C22: ['S01', 'S03'], C23: ['S03', 'S05'], C24: ['S04', 'S05'],
  C25: ['S02'], C26: ['S02'], C27: ['S02'], C29: ['S03', 'S05'], C30: ['S02'],
  C32: ['S01', 'S02'],
}

export const production32CouplesFixture = (): MatchRecommendationInput => ({
  couples: completedMatches.map((completedZoneMatches, index) => ({
    id: `C${String(index + 1).padStart(2, '0')}`,
    name: `Couple ${String(index + 1).padStart(2, '0')}`,
    completedZoneMatches,
  })),
  timeSlots: [
    { id: 'S01', date: '2026-03-13', startTime: '21:00', endTime: '22:30', courtName: null, maxConcurrentMatches: 1 },
    { id: 'S02', date: '2026-03-14', startTime: '10:00', endTime: '16:00', courtName: null, maxConcurrentMatches: 1 },
    { id: 'S03', date: '2026-03-14', startTime: '16:00', endTime: '22:00', courtName: null, maxConcurrentMatches: 1 },
    { id: 'S04', date: '2026-03-15', startTime: '10:00', endTime: '16:00', courtName: null, maxConcurrentMatches: 1 },
    { id: 'S05', date: '2026-03-15', startTime: '16:00', endTime: '22:00', courtName: null, maxConcurrentMatches: 1 },
  ],
  availability: Object.entries(availabilityByCouple).flatMap(([coupleId, slotIds]) =>
    slotIds.map(timeSlotId => ({ coupleId, timeSlotId, isAvailable: true })),
  ),
  fixedMatches: [],
  forbiddenPairKeys: [
    'C01:C07', 'C01:C18', 'C02:C21', 'C02:C29', 'C03:C04', 'C03:C22', 'C04:C14',
    'C05:C26', 'C06:C16', 'C06:C22', 'C08:C20', 'C09:C12', 'C09:C28', 'C10:C19',
    'C10:C24', 'C11:C12', 'C11:C23', 'C13:C23', 'C13:C28', 'C14:C15', 'C15:C31',
    'C16:C26', 'C17:C21', 'C17:C32', 'C18:C27', 'C25:C30', 'C27:C31',
  ],
  durationMinutes: 90,
  maxSearchNodes: 500_000,
})

export const dense32CouplesFixture = (): MatchRecommendationInput => {
  const input = production32CouplesFixture()
  input.availability = input.couples.flatMap(couple =>
    input.timeSlots.map(slot => ({ coupleId: couple.id, timeSlotId: slot.id, isAvailable: true })),
  )
  return input
}
