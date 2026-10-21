import { formatFreeZoneReference } from '../americano-libre-zone-reference'

describe('compact current zone reference', () => {
  it.each([[1, 'Zona A', '1°A'], [4, ' zona B ', '4°B'], [2, 'A', '2°A'], [12, 'Zona AA', '12°AA']])('formats %s / %s as %s', (position, zone, expected) => {
    expect(formatFreeZoneReference(Number(position), String(zone))).toBe(expected)
  })
  it.each([[0, 'Zona A'], [-1, 'A'], [1.5, 'A'], [1, '']])('does not invent a reference without a real position/zone', (position, zone) => {
    expect(formatFreeZoneReference(Number(position), String(zone))).toBeNull()
  })
})
