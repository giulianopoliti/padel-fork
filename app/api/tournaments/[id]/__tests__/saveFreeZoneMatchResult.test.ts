import { saveMatchResult } from '../actions'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { saveFreeZoneResult } from '@/lib/services/americano-libre-zone-result'
import { FreeBracketPersistenceError } from '@/lib/services/americano-libre-persistence'
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn(), createClientServiceRole: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('@/lib/services/americano-libre-zone-result', () => ({ saveFreeZoneResult: jest.fn() }))

describe('existing zone result form with a free bracket', () => {
  const row = { id: 'm', zone_id: 'z', status: 'FINISHED', couple1_id: 'a', couple2_id: 'b' }
  const read = jest.fn(async () => ({ data: row, error: null }))
  const from = jest.fn(() => ({ select: () => ({ eq: () => ({ eq: () => ({ single: read }) }) }) }))
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(createClient).mockResolvedValue({ from, auth: { getUser: async () => ({ data: { user: { id: 'verified-actor' } } }) } } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true } as never)
    jest.mocked(saveFreeZoneResult).mockResolvedValue({ id: 'm', result_couple1: 6, result_couple2: 2 })
  })
  it('saves from the existing form without the legacy update or placeholder resolver', async () => {
    const result = await saveMatchResult('t', 'm', 6, 2, 'a', 'b')
    expect(result).toMatchObject({ success: true, isEditingFinishedMatch: true, positionUpdate: { positionsUpdated: true, bracketAdvanced: false } })
    expect(saveFreeZoneResult).toHaveBeenCalledWith(expect.anything(), 't', 'verified-actor', 'm', 6, 2)
    expect(from).toHaveBeenCalledTimes(1)
  })
  it('preserves matrix row/column order when couples are reversed', async () => {
    expect((await saveMatchResult('t', 'm', 2, 6, 'b', 'a')).success).toBe(true)
    expect(saveFreeZoneResult).toHaveBeenCalledWith(expect.anything(), 't', 'verified-actor', 'm', 6, 2)
  })
  it('does not claim success or attempt a legacy write after a revision conflict', async () => {
    jest.mocked(saveFreeZoneResult).mockRejectedValue(new FreeBracketPersistenceError('Reload', '40001'))
    expect(await saveMatchResult('t', 'm', 6, 2, 'a', 'b')).toMatchObject({ success: false, error: 'Reload' })
    expect(from).toHaveBeenCalledTimes(1)
  })
  it('rejects unrelated couple IDs before privileged persistence', async () => {
    expect((await saveMatchResult('t', 'm', 6, 2, 'a', 'unrelated')).success).toBe(false)
    expect(saveFreeZoneResult).not.toHaveBeenCalled()
  })
  it('checks authorization before reading the match or free state', async () => {
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: false } as never)
    expect((await saveMatchResult('t', 'm', 6, 2, 'a', 'b')).success).toBe(false)
    expect(from).not.toHaveBeenCalled()
    expect(saveFreeZoneResult).not.toHaveBeenCalled()
  })
})
