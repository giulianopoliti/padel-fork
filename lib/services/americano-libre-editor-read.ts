import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FreeEditorData } from '@/types/americano-libre-editor'
import { createClientServiceRole } from '@/utils/supabase/server'

const person = z.preprocess((value) => Array.isArray(value) ? value[0] ?? null : value,
  z.object({ first_name: z.string().nullable(), last_name: z.string().nullable() }).nullable())
const count = z.number().nullish().transform((value) => value ?? 0)
const rowsSchema = z.array(z.object({
  couple_id: z.string().uuid().nullable(), position: z.number(), wins: count, losses: count, games_difference: count,
  zone: z.object({ id: z.string().uuid(), name: z.string(), tournament_id: z.string().uuid() }).nullable(),
  couple: z.object({ id: z.string().uuid(), player1_id: z.string().uuid().nullable(), player2_id: z.string().uuid().nullable(), player1: person, player2: person }).nullable(),
}))
// PostgREST embeds one-to-many relations as arrays and one-to-one agendas as an
// object (or null when the match has no schedule).
const relatedRowsSchema = z.preprocess(
  (value) => value === null ? [] : Array.isArray(value) ? value : [value],
  z.array(z.object({ id: z.string().uuid() })),
)
const hasRows = (value: unknown): boolean => relatedRowsSchema.parse(value).length > 0
const hasSportsHistory = (value: unknown): boolean => {
  const history = z.array(z.object({ operation_metadata: z.object({ free_operation: z.string().optional() }).nullish() })).parse(value ?? [])
  return history.some((row) => !['PROCESS_BYE', 'UNDO_BYE'].includes(row.operation_metadata?.free_operation ?? ''))
}

export const readFreeEditorData = async (client: SupabaseClient, tournamentId: string, canManage: boolean): Promise<FreeEditorData> => {
  const { data, error } = await client.from('zone_positions').select(`
    couple_id,position,wins,losses,games_difference,
    zone:zones!zone_positions_zone_id_fkey(id,name,tournament_id),
    couple:couples!zone_positions_couple_id_fkey(id,player1_id,player2_id,
      player1:players!couples_player1_id_fkey(first_name,last_name),
      player2:players!couples_player2_id_fkey(first_name,last_name))
  `).eq('tournament_id', tournamentId)
  if (error) throw new Error(error.message)
  const rows = rowsSchema.parse(data || [])
  const result: FreeEditorData = { couples: [], guards: {} }
  let approved = new Set<string>(), disqualified = new Set<string>()
  if (canManage) {
    const service = await createClientServiceRole()
    const [inscriptions, bans, matches] = await Promise.all([
      service.from('inscriptions').select('couple_id').eq('tournament_id', tournamentId).or('is_pending.eq.false,is_pending.is.null').not('couple_id', 'is', null),
      service.from('tournament_couple_disqualifications').select('couple_id').eq('tournament_id', tournamentId).eq('status', 'ACTIVE'),
      service.from('matches').select('id,result_couple1,result_couple2,court,sets:set_matches(id),history:match_results_history(id,operation_metadata),agenda:fecha_matches(id)')
        .eq('tournament_id', tournamentId).eq('type', 'ELIMINATION').eq('bracket_key', 'MAIN'),
    ])
    if (inscriptions.error || bans.error || matches.error) throw new Error(inscriptions.error?.message || bans.error?.message || matches.error?.message)
    approved = new Set((inscriptions.data || []).map((row) => row.couple_id as string))
    disqualified = new Set((bans.data || []).map((row) => row.couple_id as string))
    for (const match of matches.data || []) result.guards[match.id] = {
      sports: match.result_couple1 !== null || match.result_couple2 !== null || hasRows(match.sets) || hasSportsHistory(match.history),
      agenda: Boolean(match.court) || hasRows(match.agenda),
    }
  }
  for (const row of rows) {
    if (!row.couple_id || !row.zone || row.zone.tournament_id !== tournamentId || !row.couple) continue
    const pair = row.couple
    const validPair = pair.player1_id && pair.player2_id && pair.player1_id !== pair.player2_id
    const reason = !validPair ? 'La pareja no está completa.' : disqualified.has(row.couple_id) ? 'Pareja descalificada.'
      : !approved.has(row.couple_id) ? 'La inscripción no está aprobada.' : undefined
    const playerName = (player: z.infer<typeof person>): string => [player?.first_name, player?.last_name].filter(Boolean).join(' ') || 'Jugador sin nombre'
    result.couples.push({ zoneId: row.zone.id, zoneName: row.zone.name, coupleId: row.couple_id,
      name: `${playerName(pair.player1)} / ${playerName(pair.player2)}`, position: row.position,
      ...(pair.player1_id ? { player1: { id: pair.player1_id, first_name: pair.player1?.first_name ?? '', last_name: pair.player1?.last_name ?? '' } } : {}),
      ...(pair.player2_id ? { player2: { id: pair.player2_id, first_name: pair.player2?.first_name ?? '', last_name: pair.player2?.last_name ?? '' } } : {}),
      wins: row.wins, losses: row.losses, gamesDifference: row.games_difference,
      eligible: canManage && !reason, ...(canManage && reason ? { reason } : {}),
    })
  }
  return result
}
