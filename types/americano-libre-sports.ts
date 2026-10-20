import { z } from 'zod'

const matchId = z.string().uuid()
export const freeSportOperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('RESULT'), matchId, score1: z.number().int().min(0).max(99), score2: z.number().int().min(0).max(99) }).strict(),
  z.object({ kind: z.literal('CLEAR_RESULT'), matchId }).strict(),
  z.object({ kind: z.literal('PROCESS_BYE'), matchId }).strict(),
  z.object({ kind: z.literal('UNDO_BYE'), matchId }).strict(),
  z.object({ kind: z.literal('DISQUALIFY'), matchId, coupleId: z.string().uuid(), reason: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ kind: z.literal('COURT'), matchId, court: z.string().trim().max(100), start: z.boolean().default(false) }).strict(),
  z.object({ kind: z.literal('SCHEDULE'), matchId, fechaId: z.string().uuid().nullable(), timeSlotId: z.string().uuid().nullable(), order: z.number().int().positive().nullable() }).strict(),
])
export const freeSportsInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  operations: z.array(freeSportOperationSchema).min(1).max(63),
}).strict()
export type FreeSportOperation = z.infer<typeof freeSportOperationSchema>
export type FreeSportsInput = z.infer<typeof freeSportsInputSchema>

export const freeSportsViewSchema = z.object({
  revision: z.number().int().nonnegative(),
  matches: z.array(z.object({ id: z.string().uuid(), round: z.string(), order_in_round: z.number().nullable(),
    zone_id: z.string().uuid().nullable(), couple1_id: z.string().uuid().nullable(), couple2_id: z.string().uuid().nullable(),
    status: z.string(), winner_id: z.string().uuid().nullable(), result_couple1: z.string().nullable(), result_couple2: z.string().nullable(),
    free_slot1_origin: z.string().nullable(), free_slot2_origin: z.string().nullable(), free_bye_processed: z.boolean(), court: z.string().nullable(),
  })),
  dates: z.array(z.object({ id: z.string().uuid(), fecha_number: z.number(), round_type: z.string() })),
  slots: z.array(z.object({ id: z.string().uuid(), fecha_id: z.string().uuid(), date: z.string().nullable(), start_time: z.string() })),
})
export type FreeSportsView = z.infer<typeof freeSportsViewSchema>
