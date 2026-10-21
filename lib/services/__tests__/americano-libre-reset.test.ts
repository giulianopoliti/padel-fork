import { resetFreeTournament } from '../americano-libre-reset'
const clientFor = (state: unknown, rpcResult: unknown = { data: { success: true, status: 'ZONE_PHASE' }, error: null }) => ({
  from: jest.fn(() => ({ select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: async () => ({ data: state, error: null }) })) })) })),
  rpc: jest.fn(async () => rpcResult),
})
describe('free tournament reset boundary', () => {
  it('passes current revision, verified actor and target to one atomic RPC', async () => {
    const client = clientFor({ revision: 8 })
    await resetFreeTournament(client as never, 't', 'verified-actor', 'ZONE_PHASE')
    expect(client.rpc).toHaveBeenCalledWith('reset_american_free_tournament', { p_tournament_id: 't', p_actor_id: 'verified-actor', p_target: 'ZONE_PHASE', p_expected_revision: 8 })
  })
  it('can reset zones without a generated bracket', async () => {
    const client = clientFor(null, { data: { success: true, status: 'NOT_STARTED' }, error: null })
    await resetFreeTournament(client as never, 't', 'actor', 'NOT_STARTED')
    expect(client.rpc).toHaveBeenCalledWith('reset_american_free_tournament', expect.objectContaining({ p_expected_revision: null, p_target: 'NOT_STARTED' }))
  })
  it('surfaces conflicts without retrying or returning success', async () => {
    const client = clientFor({ revision: 8 }, { data: null, error: { message: 'Reload', code: '40001' } })
    await expect(resetFreeTournament(client as never, 't', 'actor', 'ZONE_PHASE')).rejects.toMatchObject({ status: 409 })
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })
})
