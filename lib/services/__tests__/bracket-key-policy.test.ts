import { getTournamentFormatPreset } from '@/config/tournament-format-presets'
import { getBracketLabelByKey, getOperationalBracketKeysForFormat } from '@/lib/services/bracket-key-policy'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import { shouldWrapLegacyEndpointsWithCanonicalFlow } from '@/lib/services/tournament-format-policy'

describe('bracket key policy', () => {
  it('uses MAIN for single-bracket formats', () => {
    const resolved = TournamentFormatResolver.getResolvedFormat({
      format_config: getTournamentFormatPreset('LONG_SINGLE_ZONE_BRACKET'),
    })

    expect(getOperationalBracketKeysForFormat(resolved)).toEqual(['MAIN'])
  })

  it('uses GOLD + SILVER for long gold/silver format', () => {
    const resolved = TournamentFormatResolver.getResolvedFormat({
      format_config: getTournamentFormatPreset('LONG_SINGLE_ZONE_GOLD_SILVER'),
    })

    expect(getOperationalBracketKeysForFormat(resolved)).toEqual(['GOLD', 'SILVER'])
  })

  it('uses the same MAIN and GOLD/SILVER keys for American single-zone formats', () => {
    const single = TournamentFormatResolver.getResolvedFormat({
      format_config: getTournamentFormatPreset('AMERICAN_SINGLE_ZONE_GLOBAL_2'),
    })
    const cups = TournamentFormatResolver.getResolvedFormat({
      format_config: getTournamentFormatPreset('AMERICAN_SINGLE_ZONE_GLOBAL_GOLD_SILVER_3'),
    })

    expect(getOperationalBracketKeysForFormat(single)).toEqual(['MAIN'])
    expect(getOperationalBracketKeysForFormat(cups)).toEqual(['GOLD', 'SILVER'])
  })

  it('wraps legacy endpoints for long gold/silver', () => {
    const tournament = {
      type: 'LONG',
      format_config: getTournamentFormatPreset('LONG_SINGLE_ZONE_GOLD_SILVER'),
    }

    expect(shouldWrapLegacyEndpointsWithCanonicalFlow(tournament)).toBe(true)
  })

  it('maps bracket labels for gold and silver', () => {
    expect(getBracketLabelByKey('GOLD')).toBe('Copa de Oro')
    expect(getBracketLabelByKey('SILVER')).toBe('Copa de Plata')
  })
})
