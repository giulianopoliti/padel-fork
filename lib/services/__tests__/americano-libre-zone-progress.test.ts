import { getFreeZoneProgress } from '../americano-libre-zone-progress'

describe('zone completion per tournament format and zone size', () => {
  it.each([
    [2, 0, 4, 2, 2, true], [1, 0, 4, 2, 2, false],
    [2, 0, 4, 3, 3, false], [1, 2, 4, 3, 3, true],
    [1, 1, 3, 3, 2, true], [1, 1, 5, 2, 2, true],
    [1, 1, 4, null, 3, false], [1, 2, 4, null, 3, true],
    [0, 0, 1, 2, 0, false],
  ])('evaluates %s wins / %s losses, size %s, target %s', (wins, losses, size, target, required, complete) => {
    expect(getFreeZoneProgress(Number(wins), Number(losses), Number(size), target === null ? null : Number(target)))
      .toEqual({ played: Number(wins) + Number(losses), required, complete })
  })
})
