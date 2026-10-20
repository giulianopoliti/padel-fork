import { z } from 'zod'

export const freeSlotOriginSchema = z.enum(['ENTRY', 'WINNER', 'BYE'])
export type FreeSlotOrigin = z.infer<typeof freeSlotOriginSchema>
export const freeMatchLayoutSchema = z.object({
  id: z.string().uuid(),
  slot1_origin: freeSlotOriginSchema,
  slot2_origin: freeSlotOriginSchema,
  couple1_id: z.string().uuid().nullable(),
  couple2_id: z.string().uuid().nullable(),
}).strict()
export type FreeMatchLayout = z.infer<typeof freeMatchLayoutSchema>

export const freeBracketStateSchema = z.object({
  tournament_id: z.string().uuid(), bracket_key: z.literal('MAIN'), contract_version: z.literal(1),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  requested_count: z.number().int().min(2).max(64),
  base_size: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16), z.literal(32), z.literal(64)]),
  original_slots: z.record(z.string().uuid(), z.tuple([freeSlotOriginSchema, freeSlotOriginSchema])),
  effective_capacity: z.number().int().min(2).max(64), assigned_count: z.number().int().nonnegative(),
  created_at: z.string(),
}).refine((state) => state.assigned_count <= state.effective_capacity, 'Capacidad incoherente')
export type FreeBracketState = z.infer<typeof freeBracketStateSchema>

export const freeBracketSnapshotSchema = freeBracketStateSchema.and(z.object({
  matches: z.array(freeMatchLayoutSchema.extend({
    round: z.string(), order_in_round: z.number().int().positive(), bracket_is_active: z.boolean(),
    seed1_id: z.string().uuid().nullable(), seed2_id: z.string().uuid().nullable(),
    status: z.string(), winner_id: z.string().uuid().nullable(), bye_processed: z.boolean(),
    score1: z.string().nullable().optional(), score2: z.string().nullable().optional(), court: z.string().nullable().optional(),
  })).min(1).max(63),
  hierarchy: z.array(z.object({
    parent_match_id: z.string().uuid(), child_match_id: z.string().uuid(), parent_slot: z.union([z.literal(1), z.literal(2)]),
  })).max(62),
}))
export type FreeBracketSnapshot = z.infer<typeof freeBracketSnapshotSchema>

export const createFreeBracketSchema = z.object({
  requestedCount: z.number().int().min(2).max(64),
  matches: z.array(z.object({
    id: z.string().uuid(), round: z.enum(['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']),
    order_in_round: z.number().int().positive(),
    slot1_origin: freeSlotOriginSchema, slot2_origin: freeSlotOriginSchema,
  }).strict()).min(1).max(63),
  hierarchy: z.array(z.object({
    parent_match_id: z.string().uuid(), child_match_id: z.string().uuid(), parent_slot: z.union([z.literal(1), z.literal(2)]),
  }).strict()).max(62),
}).strict()
export type CreateFreeBracketInput = z.infer<typeof createFreeBracketSchema>

export const saveFreeBracketSchema = z.object({
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  layout: z.array(freeMatchLayoutSchema).min(1).max(63),
}).strict()
export type SaveFreeBracketInput = z.infer<typeof saveFreeBracketSchema>
