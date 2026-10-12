import { updateOrganizerCoupleAvailability } from '../actions'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { revalidatePath } from 'next/cache'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/services/ranking', () => ({ updateZonePositionsForTournament: jest.fn() }))
jest.mock('@/lib/services/incremental-placeholder-updater', () => ({ IncrementalPlaceholderUpdater: {} }))
jest.mock('@/lib/services/messages', () => ({ sendTournamentMessage: jest.fn() }))

const input = { coupleId: 'couple', timeSlotId: 'slot', isAvailable: true, notes: '  Después de las 18  ' }

describe('organizer availability used by LONG brackets', () => {
  const slot = { id: 'slot', slot_type: 'TIME_RANGE', is_system: false, fecha_id: 'fecha', tournament_fechas: { tournament_id: 'tournament' } }
  let query: Record<string, jest.Mock>

  beforeEach(() => {
    jest.clearAllMocks()
    query = {}
    for (const method of ['select', 'eq', 'delete']) query[method] = jest.fn(() => query)
    query.single = jest.fn().mockResolvedValue({ data: slot, error: null })
    query.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'couple' }, error: null })
    query.upsert = jest.fn().mockResolvedValue({ error: null })
    // A delete query is awaited after its filters.
    query.then = jest.fn(resolve => resolve({ error: null }))
    jest.mocked(createClient).mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'organizer' } } }) }, from: jest.fn(() => query) } as unknown as Awaited<ReturnType<typeof createClient>>)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
  })

  it('saves a trimmed note and revalidates bracket and existing scheduling views', async () => {
    const result = await updateOrganizerCoupleAvailability(input)
    expect(result.success).toBe(true)
    expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({ couple_id: 'couple', time_slot_id: 'slot', notes: 'Después de las 18', is_available: true }), { onConflict: 'couple_id,time_slot_id' })
    expect(revalidatePath).toHaveBeenCalledWith('/tournaments/tournament/bracket')
    expect(revalidatePath).toHaveBeenCalledWith('/tournaments/tournament/match-scheduling')
  })

  it('removes availability without writing an unavailable record', async () => {
    expect((await updateOrganizerCoupleAvailability({ ...input, isAvailable: false })).success).toBe(true)
    expect(query.delete).toHaveBeenCalled()
    expect(query.upsert).not.toHaveBeenCalled()
    expect(query.eq).toHaveBeenCalledWith('couple_id', 'couple')
    expect(query.eq).toHaveBeenCalledWith('time_slot_id', 'slot')
  })

  it('rejects organizers without permission', async () => {
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false })
    expect((await updateOrganizerCoupleAvailability(input)).success).toBe(false)
    expect(query.upsert).not.toHaveBeenCalled()
  })

  it('rejects a couple from another tournament', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await updateOrganizerCoupleAvailability(input)).success).toBe(false)
    expect(query.upsert).not.toHaveBeenCalled()
  })

  it.each([{ slot_type: 'FREE_DATE', is_system: false }, { slot_type: 'TIME_RANGE', is_system: true }])('rejects noneditable slots: %s', async extra => {
    query.single.mockResolvedValue({ data: { ...slot, ...extra }, error: null })
    expect((await updateOrganizerCoupleAvailability(input)).success).toBe(false)
    expect(query.upsert).not.toHaveBeenCalled()
  })
})
