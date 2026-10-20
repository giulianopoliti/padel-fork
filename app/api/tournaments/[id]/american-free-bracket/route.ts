import { readFreeEditorData } from '@/lib/services/americano-libre-editor-read'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { isAmericanLibreTournament } from '@/lib/services/americano-libre-format'
import { generateFreeBracket } from '@/lib/services/americano-libre-generation'
import { saveFreeBracket, FreeBracketPersistenceError } from '@/lib/services/americano-libre-persistence'
import { getPersistedBracketArtifacts } from '@/lib/services/bracket-generation-validation'
import { getActiveDisqualifiedCoupleIds } from '@/lib/services/tournament-disqualifications'
import { createFreeBracketSchema, freeBracketSnapshotSchema, saveFreeBracketSchema } from '@/types/americano-libre'

export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ id: string }> }
const requestSchema = z.object({ requestedCount: createFreeBracketSchema.shape.requestedCount }).strict()
const failure = (error: unknown) => NextResponse.json({
  success: false,
  message: error instanceof z.ZodError ? 'Cantidad o estructura inválida' : error instanceof Error ? error.message : 'Error al obtener la llave',
}, { status: error instanceof FreeBracketPersistenceError ? error.status : error instanceof z.ZodError ? 400 : 500 })

export const POST = async (request: NextRequest, { params }: Context) => {
  try {
    const { id } = await params
    z.string().uuid().parse(id)
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ success: false, message: 'Iniciá sesión' }, { status: 401 })
    const access = await checkTournamentPermissions(user.id, id)
    if (!access.hasPermission) return NextResponse.json({ success: false, message: 'Sin permisos sobre el torneo' }, { status: 403 })
    const body = requestSchema.parse(await request.json().catch(() => null))
    const snapshot = await generateFreeBracket(id, user.id, body.requestedCount)
    return NextResponse.json({ success: true, snapshot })
  } catch (error) { return failure(error) }
}

export const PATCH = async (request: NextRequest, { params }: Context) => {
  try {
    const { id } = await params
    z.string().uuid().parse(id)
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ success: false, message: 'Iniciá sesión' }, { status: 401 })
    if (!(await checkTournamentPermissions(user.id, id)).hasPermission) return NextResponse.json({ success: false, message: 'Sin permisos sobre el torneo' }, { status: 403 })
    const input = saveFreeBracketSchema.parse(await request.json().catch(() => null))
    const service = await createClientServiceRole()
    const snapshot = await saveFreeBracket(service, id, user.id, input)
    return NextResponse.json({ success: true, snapshot })
  } catch (error) { return failure(error) }
}

export const GET = async (_request: NextRequest, { params }: Context) => {
  try {
    const { id } = await params
    z.string().uuid().parse(id)
    const client = await createClient()
    // User-scoped reads preserve tournament visibility and public RLS.
    const { data: tournament, error } = await client.from('tournaments')
      .select('type, format_type, format_config, status, bracket_status, bracket_generated_at').eq('id', id).single()
    if (error || !tournament) return NextResponse.json({ success: false, message: 'No se encontró el torneo' }, { status: 404 })
    if (!isAmericanLibreTournament(tournament)) return NextResponse.json({ success: false, message: 'El torneo no es Americano libre' }, { status: 400 })
    const { data: { user } } = await client.auth.getUser()
    const canManage = user ? (await checkTournamentPermissions(user.id, id)).hasPermission : false
    const { data: state, error: stateError } = await client.from('american_free_brackets').select('*').eq('tournament_id', id).maybeSingle()
    if (stateError) throw new Error(stateError.message)
    if (state) {
      const [matches, hierarchy, editor] = await Promise.all([
        client.from('matches').select('id, round, order_in_round, result_couple1, result_couple2, court, free_slot1_origin, free_slot2_origin, couple1_id, couple2_id, tournament_couple_seed1_id, tournament_couple_seed2_id, bracket_is_active, status, winner_id, free_bye_processed').eq('tournament_id', id).eq('type', 'ELIMINATION').eq('bracket_key', 'MAIN'),
        client.from('match_hierarchy').select('parent_match_id, child_match_id, parent_slot').eq('tournament_id', id).eq('bracket_key', 'MAIN'),
        readFreeEditorData(client, id, canManage),
      ])
      if (matches.error || hierarchy.error) throw new Error(matches.error?.message || hierarchy.error?.message)
      const snapshot = freeBracketSnapshotSchema.parse({ ...state, hierarchy: hierarchy.data,
        matches: (matches.data || []).map((match) => ({
          id: match.id, round: match.round, order_in_round: match.order_in_round,
          slot1_origin: match.free_slot1_origin, slot2_origin: match.free_slot2_origin,
          couple1_id: match.couple1_id, couple2_id: match.couple2_id,
          seed1_id: match.tournament_couple_seed1_id, seed2_id: match.tournament_couple_seed2_id,
          bracket_is_active: match.bracket_is_active, status: match.status, winner_id: match.winner_id,
          bye_processed: match.free_bye_processed,
          score1: match.result_couple1, score2: match.result_couple2, court: match.court,
        })),
      })
      const { data: latest, error: revisionError } = await client.from('american_free_brackets').select('revision').eq('tournament_id', id).single()
      if (revisionError) throw new Error(revisionError.message)
      if (!latest || latest.revision !== snapshot.revision) throw new FreeBracketPersistenceError('La llave cambió durante la carga. Recargá para editar.', '40001')
      return NextResponse.json({ success: true, snapshot, editor, canManage, status: tournament.status })
    }
    if (!canManage) return NextResponse.json({ success: true, snapshot: null, canManage, status: tournament.status })
    const service = await createClientServiceRole()
    const [inscriptions, disqualified, zones, artifacts] = await Promise.all([
      service.from('inscriptions').select('couple_id').eq('tournament_id', id).or('is_pending.eq.false,is_pending.is.null').not('couple_id', 'is', null),
      getActiveDisqualifiedCoupleIds(id, service),
      service.from('zones').select('id', { count: 'exact', head: true }).eq('tournament_id', id),
      getPersistedBracketArtifacts(id),
    ])
    if (inscriptions.error || zones.error) throw new Error(inscriptions.error?.message || zones.error?.message)
    const suggestedCount = new Set((inscriptions.data || []).map((row) => row.couple_id as string).filter((coupleId) => !disqualified.has(coupleId))).size
    const blockedReason = tournament.status !== 'ZONE_PHASE' ? 'La generación requiere fase de zonas'
      : artifacts.exists || tournament.bracket_generated_at || ['BRACKET_GENERATED', 'BRACKET_ACTIVE'].includes(tournament.bracket_status) ? 'Ya existe una llave o artefactos previos'
      : !zones.count ? 'Primero creá las zonas del torneo' : null
    return NextResponse.json({ success: true, snapshot: null, suggestedCount, canManage, status: tournament.status, blockedReason })
  } catch (error) { return failure(error) }
}
