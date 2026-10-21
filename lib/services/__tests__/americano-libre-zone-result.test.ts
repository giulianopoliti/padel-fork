import { saveFreeZoneResult } from '../americano-libre-zone-result'
import { mutateFreeSports } from '../americano-libre-sports'
import { createClientServiceRole } from '@/utils/supabase/server'
import { FreeBracketPersistenceError } from '../americano-libre-persistence'
jest.mock('../americano-libre-sports', () => ({ mutateFreeSports: jest.fn() }))
jest.mock('@/utils/supabase/server', () => ({ createClientServiceRole: jest.fn() }))

const readClient = (state: unknown, error: unknown = null) => ({ from: jest.fn(() => ({ select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: async () => ({ data: state, error }) })) })) })) })
describe('zone results after free bracket generation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(createClientServiceRole).mockResolvedValue({ trusted: true } as never)
    jest.mocked(mutateFreeSports).mockResolvedValue({ revision: 8 } as never)
  })
  it('keeps normal zone writes before a free bracket exists', async () => {
    expect(await saveFreeZoneResult(readClient(null) as never, 't', 'actor', 'm', 6, 2)).toBeNull()
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })
  it('saves zone scores and standings with the common revision and no legacy write', async () => {
    const client = readClient({ revision: 7 })
    expect(await saveFreeZoneResult(client as never, 't', 'actor', 'm', 2, 6)).toMatchObject({ id: 'm', status: 'FINISHED', result_couple1: 2, result_couple2: 6 })
    expect(mutateFreeSports).toHaveBeenCalledWith({ trusted: true }, 't', 'actor', {
      expectedRevision: 7, operations: [{ kind: 'RESULT', matchId: 'm', score1: 2, score2: 6 }],
    })
    expect(client.from).toHaveBeenCalledTimes(1)
  })
  it('does not fall back to unprotected writes or retry when another operation wins', async () => {
    jest.mocked(mutateFreeSports).mockRejectedValue(new FreeBracketPersistenceError('Reload', '40001'))
    await expect(saveFreeZoneResult(readClient({ revision: 7 }) as never, 't', 'actor', 'm', 6, 2)).rejects.toMatchObject({ code: '40001' })
    expect(mutateFreeSports).toHaveBeenCalledTimes(1)
  })
  it('does not bypass a failed state read', async () => {
    await expect(saveFreeZoneResult(readClient(null, { message: 'read failed', code: '42501' }) as never, 't', 'actor', 'm', 6, 2)).rejects.toThrow('read failed')
    expect(createClientServiceRole).not.toHaveBeenCalled()
  })
})
