import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { buildFreeBracket } from '../americano-libre-generator'
import { buildBracketSeeding } from '../bracket-structure'
import { generateFreeBracket } from '../americano-libre-generation'
import { createClientServiceRole } from '@/utils/supabase/server'
import { createFreeBracket, FreeBracketPersistenceError } from '../americano-libre-persistence'
import { getPersistedBracketArtifacts } from '../bracket-generation-validation'

jest.mock('@/utils/supabase/server', () => ({ createClientServiceRole: jest.fn() }))
jest.mock('../americano-libre-persistence', () => ({
  ...jest.requireActual('../americano-libre-persistence'), createFreeBracket: jest.fn(),
}))
jest.mock('../bracket-generation-validation', () => ({ getPersistedBracketArtifacts: jest.fn() }))

describe('LIBRE structure by quantity', () => {
  it.each([[16, 16, 0, 8], [20, 32, 12, 4], [24, 32, 8, 8], [32, 32, 0, 16]])(
    '%i entries: base %i, %i planned passes and %i full first-round matches', (count, base, byes, full) => {
      const structure = buildFreeBracket(count)
      expect(structure.matches).toHaveLength(base - 1)
      expect(structure.hierarchy).toHaveLength(base - 2)
      const first = structure.matches.filter((match) => match.round === structure.matches[0].round)
      expect(first.filter((match) => match.slot1_origin === 'ENTRY' && match.slot2_origin === 'ENTRY')).toHaveLength(full)
      const origins = structure.matches.flatMap((match) => [match.slot1_origin, match.slot2_origin])
      expect(origins.filter((origin) => origin === 'ENTRY')).toHaveLength(count)
      expect(origins.filter((origin) => origin === 'BYE')).toHaveLength(byes)
      expect(origins.filter((origin) => origin === 'WINNER')).toHaveLength(base - 2)
      // No couple, seed, placeholder, sporting state or winner in creation payload.
      expect(Object.keys(first[0]).sort()).toEqual(['id', 'order_in_round', 'round', 'slot1_origin', 'slot2_origin'])
    },
  )
  it('keeps a complete connected tree and spreads passes conventionally for every supported count', () => {
    for (let count = 2; count <= 64; count++) {
      const { matches, hierarchy } = buildFreeBracket(count)
      const { P, order } = buildBracketSeeding(count)
      const ids = new Set(matches.map((match) => match.id))
      expect(ids.size).toBe(P - 1)
      const first = matches.filter((match) => match.round === matches[0].round)
      first.forEach((match, index) => {
        expect([match.slot1_origin, match.slot2_origin]).toEqual(order.slice(index * 2, index * 2 + 2).map((seed) => seed === 'BYE' ? 'BYE' : 'ENTRY'))
        expect([match.slot1_origin, match.slot2_origin]).not.toEqual(['BYE', 'BYE'])
      })
      matches.filter((match) => match.round !== 'FINAL').forEach((child) => {
        const edges = hierarchy.filter((edge) => edge.child_match_id === child.id)
        expect(edges).toHaveLength(1)
        const parent = matches.find((match) => match.id === edges[0].parent_match_id)!
        expect(parent.order_in_round).toBe(Math.ceil(child.order_in_round / 2))
        expect(edges[0].parent_slot).toBe(child.order_in_round % 2 ? 1 : 2)
      })
    }
  })
  it.each([0, 1, 65, -2, 20.5, NaN, Infinity])('rejects unsupported count %s', (count) => {
    expect(() => buildFreeBracket(count)).toThrow()
  })
})

describe('LIBRE generation orchestration', () => {
  let tournament: Record<string, unknown>
  const client = { from: jest.fn() }
  beforeEach(() => {
    jest.clearAllMocks()
    tournament = { type: 'AMERICAN', format_config: getTournamentFormatPreset('AMERICAN_MULTI_ZONE_FREE'), status: 'ZONE_PHASE', bracket_status: null, bracket_generated_at: null }
    client.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: tournament }) }) }) }))
    jest.mocked(createClientServiceRole).mockResolvedValue(client as never)
    jest.mocked(getPersistedBracketArtifacts).mockResolvedValue({ exists: false } as never)
    jest.mocked(createFreeBracket).mockResolvedValue({ requested_count: 20 } as never)
  })
  it.each(['AMERICAN_MULTI_ZONE_FREE', 'AMERICAN_SINGLE_ZONE_FREE'] as const)('generates %s with incomplete zones, without reading matches/results or classifying participants', async (presetId) => {
    tournament.format_config = getTournamentFormatPreset(presetId)
    await expect(generateFreeBracket('tournament', 'trusted-actor', 20)).resolves.toEqual({ requested_count: 20 })
    expect(client.from.mock.calls).toEqual([['tournaments']])
    expect(createFreeBracket).toHaveBeenCalledWith(client, 'tournament', 'trusted-actor', expect.objectContaining({ requestedCount: 20 }))
  })
  it.each(['NOT_STARTED', 'BRACKET_PHASE', 'FINISHED'])('retains phase restriction %s', async (status) => {
    tournament.status = status
    await expect(generateFreeBracket('t', 'a', 20)).rejects.toThrow('fase de zonas')
    expect(createFreeBracket).not.toHaveBeenCalled()
  })
  it('refuses existing artifacts rather than removing them', async () => {
    jest.mocked(getPersistedBracketArtifacts).mockResolvedValue({ exists: true } as never)
    await expect(generateFreeBracket('t', 'a', 20)).rejects.toThrow('artefactos previos')
    expect(createFreeBracket).not.toHaveBeenCalled()
  })
  it.each(['AMERICAN_MULTI_ZONE_2', 'LONG_SINGLE_ZONE_BRACKET'])('does not route preset %s through LIBRE', async (presetId) => {
    tournament.format_config = getTournamentFormatPreset(presetId as 'AMERICAN_MULTI_ZONE_2' | 'LONG_SINGLE_ZONE_BRACKET')
    await expect(generateFreeBracket('t', 'a', 20)).rejects.toThrow('no es Americano libre')
  })
  it('propagates transactional failure with no compensating or separate writes', async () => {
    jest.mocked(createFreeBracket).mockRejectedValue(new Error('transaction failed'))
    await expect(generateFreeBracket('t', 'a', 20)).rejects.toThrow('transaction failed')
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(createFreeBracket).toHaveBeenCalledTimes(1)
  })
  it('reports a concurrent generation rejected under the RPC lock as a reload conflict', async () => {
    jest.mocked(createFreeBracket).mockRejectedValue(new FreeBracketPersistenceError('La generación requiere fase de zonas', '22023'))
    await expect(generateFreeBracket('t', 'a', 20)).rejects.toMatchObject({ status: 409 })
    expect(createFreeBracket).toHaveBeenCalledTimes(1)
  })
})
