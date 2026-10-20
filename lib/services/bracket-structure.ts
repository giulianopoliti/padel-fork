// Shared conventional serpentine placement. Numbers describe positions only;
// callers decide whether they represent qualified seeds or empty manual entries.
export const BRACKET_ROUNDS = ['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL'] as const
export const MAX_BRACKET_ENTRIES = 2 ** BRACKET_ROUNDS.length

export const buildBracketSeeding = (count: number): {
  P: number; order: (number | 'BYE')[]; position_by_seed: number[]
} => {
  if (count <= 0) return { P: 0, order: [], position_by_seed: [] }
  let P = 1
  while (P < count) P *= 2
  let order = P === 1 ? [1] : [1, 2]
  while (order.length < P) {
    const nextSize = order.length * 2
    const next: number[] = []
    for (let i = 0; i < order.length; i += 2) {
      const [x, y] = [order[i], order[i + 1]]
      next.push(x, nextSize + 1 - x, nextSize + 1 - y, y)
    }
    order = next
  }
  const positions: number[] = new Array(count)
  const withByes = order.map((seed, index) => {
    if (seed > count) return 'BYE' as const
    positions[seed - 1] = index + 1
    return seed
  })
  return { P, order: withByes, position_by_seed: positions }
}
