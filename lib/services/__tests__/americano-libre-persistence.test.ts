import { saveFreeBracket, FreeBracketPersistenceError } from '../americano-libre-persistence'
import { saveFreeBracketSchema } from '@/types/americano-libre'

const id = '00000000-0000-4000-8000-000000000001'
const input = { expectedRevision: 0, layout: [{ id, slot1_origin: 'ENTRY' as const, slot2_origin: 'ENTRY' as const, couple1_id: null, couple2_id: null }] }

describe('Americano libre persistence boundary', () => {
  it('returns the canonical layout and retained connections with the revision', async () => {
    const snapshot = {
      tournament_id: id, bracket_key: 'MAIN', contract_version: 1, revision: 1,
      requested_count: 2, base_size: 2, original_slots: { [id]: ['ENTRY', 'ENTRY'] },
      effective_capacity: 2, assigned_count: 0, created_at: '2026-10-17T00:00:00Z', hierarchy: [],
      matches: [{ ...input.layout[0], round: 'FINAL', order_in_round: 1, bracket_is_active: true,
        seed1_id: null, seed2_id: null, winner_id: null, bye_processed: false, status: 'WAITING_OPONENT' }],
    }
    const rpc = jest.fn().mockResolvedValue({ data: snapshot, error: null })
    await expect(saveFreeBracket({ rpc }, id, id, input)).resolves.toEqual(snapshot)
  })
  it('reports stale saves as a conflict without retrying', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: '40001', message: 'Recargá la llave' } })
    await expect(saveFreeBracket({ rpc }, id, id, input)).rejects.toMatchObject<Partial<FreeBracketPersistenceError>>({ status: 409, code: '40001' })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('does not accept client-authoritative activity or capacity fields', () => {
    expect(saveFreeBracketSchema.safeParse({ ...input, capacity: 32 }).success).toBe(false)
    expect(saveFreeBracketSchema.safeParse({ ...input, layout: [{ ...input.layout[0], bracket_is_active: false }] }).success).toBe(false)
  })

  it('rejects invalid payloads before contacting the database', async () => {
    const rpc = jest.fn()
    await expect(saveFreeBracket({ rpc }, id, id, { ...input, expectedRevision: -1 })).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })
})
