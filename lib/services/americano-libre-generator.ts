import { randomUUID } from 'node:crypto'
import { createFreeBracketSchema, type CreateFreeBracketInput } from '@/types/americano-libre'
import { BRACKET_ROUNDS, buildBracketSeeding } from './bracket-structure'

export const buildFreeBracket = (
  requestedCount: number, createId: () => string = randomUUID,
): CreateFreeBracketInput => {
  // Validate before calculating powers/allocating arrays, including NaN/Infinity.
  createFreeBracketSchema.shape.requestedCount.parse(requestedCount)
  const { P, order } = buildBracketSeeding(requestedCount)
  const rounds = BRACKET_ROUNDS.slice(-Math.log2(P))
  const matches: CreateFreeBracketInput['matches'] = []
  const hierarchy: CreateFreeBracketInput['hierarchy'] = []
  let previous: CreateFreeBracketInput['matches'] = []
  rounds.forEach((round, roundIndex) => {
    const current: CreateFreeBracketInput['matches'] = []
    for (let index = 0; index < P / 2 ** (roundIndex + 1); index++) {
      const match: CreateFreeBracketInput['matches'][number] = {
        id: createId(), round, order_in_round: index + 1,
        slot1_origin: roundIndex ? 'WINNER' : order[index * 2] === 'BYE' ? 'BYE' : 'ENTRY',
        slot2_origin: roundIndex ? 'WINNER' : order[index * 2 + 1] === 'BYE' ? 'BYE' : 'ENTRY',
      }
      current.push(match)
      if (roundIndex) {
        hierarchy.push(
          { child_match_id: previous[index * 2].id, parent_match_id: match.id, parent_slot: 1 },
          { child_match_id: previous[index * 2 + 1].id, parent_match_id: match.id, parent_slot: 2 },
        )
      }
    }
    matches.push(...current)
    previous = current
  })
  return createFreeBracketSchema.parse({ requestedCount, matches, hierarchy })
}
