import { createTimeSlot, deleteTimeSlot, forceDeleteTimeSlot, updateTimeSlot } from '@/app/(main)/tournaments/[id]/schedules/actions'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn(), checkUserTournamentInscription: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const slot = {
  id: 'slot', fecha_id: 'fecha', date: '2099-11-06', start_time: '08:00:00', end_time: '15:00:00',
  court_name: 'Cancha 1', max_matches: 4, description: 'Texto', is_available: true, slot_type: 'TIME_RANGE', is_system: false,
  tournament_fechas: { tournament_id: 'tournament', start_date: null, end_date: null },
}
const query = (result: unknown) => {
  const builder: Record<string, jest.Mock> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'range', 'single', 'or', 'insert', 'update', 'delete']) builder[method] = jest.fn(() => builder)
  builder.then = jest.fn((resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve))
  return builder
}

describe('existing schedule action protections', () => {
  let queues: Record<string, ReturnType<typeof query>[]>
  const from = jest.fn()
  const mutation = query({ data: null, error: null })
  beforeEach(() => {
    jest.clearAllMocks()
    queues = {
      tournament_time_slots: [query({ data: slot, error: null }), query({ data: [slot], error: null }), mutation],
      users: [query({ data: { role: 'ADMIN' }, error: null })],
      tournaments: [query({ data: { club_id: 'club' }, error: null })],
      couple_time_availability: [query({ count: 0, error: null })],
      fecha_matches: [query({ data: [], error: null })],
    }
    from.mockImplementation((table: string) => {
      const next = queues[table]?.shift()
      if (!next) throw new Error(`Unexpected query: ${table}`)
      return next
    })
    jest.mocked(createClient).mockResolvedValue({ from, auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } } }) } } as unknown as Awaited<ReturnType<typeof createClient>>)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true, userRole: 'ADMIN', source: 'admin' })
  })
  it('uses centralized management checks and preserves capacity and court on text edits', async () => {
    const result = await updateTimeSlot(slot.id, { description: 'Nuevo texto' })
    expect(result.success).toBe(true)
    expect(checkTournamentPermissions).toHaveBeenCalledWith('admin', 'tournament')
    expect(mutation.update).toHaveBeenCalledWith({ description: 'Nuevo texto' })
    expect(mutation.update.mock.calls[0][0]).not.toHaveProperty('max_matches')
    expect(mutation.update.mock.calls[0][0]).not.toHaveProperty('court_name')
  })
  it('allows historical text-only edits while refusing new ranges in the past', async () => {
    const historical = { ...slot, date: '2020-11-06' }
    queues.tournament_time_slots = [query({ data: historical, error: null }), query({ data: [historical], error: null }), mutation]
    expect((await updateTimeSlot(slot.id, { description: 'Corregido' })).success).toBe(true)
  })
  it('blocks changing an answered option before any write', async () => {
    queues.couple_time_availability = [query({ count: 1, error: null })]
    expect((await updateTimeSlot(slot.id, { start_time: '09:00' })).success).toBe(false)
    expect(mutation.update).not.toHaveBeenCalled()
    expect(mutation.delete).not.toHaveBeenCalled()
  })
  it('blocks concrete match scheduling even without a slot reference', async () => {
    queues.fecha_matches = [query({ data: [{
      scheduled_time_slot_id: null, scheduled_date: slot.date,
      scheduled_start_time: '10:00', scheduled_end_time: '11:30', court_assignment: 'Cancha 1',
    }], error: null })]
    queues.tournament_time_slots = [query({ data: slot, error: null }), mutation]
    const result = await deleteTimeSlot(slot.id)
    expect(result.error).toContain('Reprogramalos')
    expect(mutation.delete).not.toHaveBeenCalled()
  })
  it('cannot force-delete answers through the legacy action', async () => {
    queues.tournament_time_slots = [query({ data: slot, error: null }), mutation]
    const answers = query({ count: 3, error: null })
    queues.couple_time_availability = [answers]
    const result = await forceDeleteTimeSlot(slot.id)
    expect(result.success).toBe(false)
    expect(answers.delete).not.toHaveBeenCalled()
    expect(mutation.delete).not.toHaveBeenCalled()
  })
  it('fails closed when dependency or existing-slot reads error', async () => {
    queues.fecha_matches = [query({ data: null, error: { message: 'unavailable' } })]
    expect((await updateTimeSlot(slot.id, { description: 'X' })).success).toBe(false)
    expect(mutation.update).not.toHaveBeenCalled()
  })
  it('rejects moving an option to a different fecha and modifying system slots', async () => {
    expect((await updateTimeSlot(slot.id, { fecha_id: 'other' })).success).toBe(false)
    queues.tournament_time_slots = [query({ data: { ...slot, is_system: true }, error: null })]
    queues.users = [query({ data: { role: 'ADMIN' }, error: null })]
    queues.tournaments = [query({ data: { club_id: 'club' }, error: null })]
    expect((await updateTimeSlot(slot.id, { description: 'X' })).success).toBe(false)
    expect(mutation.update).not.toHaveBeenCalled()
  })
  it('does not permit a forged create ID to exclude an existing overlapping row', async () => {
    queues.tournament_fechas = [query({ data: slot.tournament_fechas, error: null })]
    queues.tournament_time_slots = [query({ data: [slot], error: null }), mutation]
    expect((await createTimeSlot({ ...slot, fecha_id: 'fecha' })).success).toBe(false)
    expect(mutation.insert).not.toHaveBeenCalled()
  })
  it('rejects management access even if the role is ADMIN when the central check denies it', async () => {
    jest.mocked(checkTournamentPermissions).mockResolvedValueOnce({ hasPermission: false })
    expect((await updateTimeSlot(slot.id, { description: 'X' })).success).toBe(false)
    expect(mutation.update).not.toHaveBeenCalled()
  })
})
