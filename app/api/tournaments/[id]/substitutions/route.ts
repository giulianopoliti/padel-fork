import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { resolveTournamentCategoryConfig, validateCategoryCombination, validateMixedPairGender } from '@/lib/services/tournament-category-config'
import { createPlayerForCoupleService } from '@/lib/services/players/create-player-for-couple'

const id = z.string().uuid()
const mutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), ruleId: id.nullable(), coupleId: id, slot: z.union([z.literal(1), z.literal(2)]),
    playerId: id, scope: z.enum(['ONLY_MATCH', 'FROM_MATCH']), matchId: id.nullable() }),
  z.object({ action: z.literal('remove'), ruleId: id, coupleId: id }),
  z.object({ action: z.literal('create-player'), coupleId: id, playerData: z.object({
    first_name: z.string().trim().min(1).max(120), last_name: z.string().trim().min(1).max(120),
    dni: z.string().trim().max(20).nullish(), phone: z.string().trim().max(50).nullish(),
    gender: z.enum(['MALE', 'FEMALE']),
  }).strict() }),
])

const closedStatuses = new Set(['CANCELED', 'FINISHED', 'FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED'])

const authorize = async (tournamentId: string) => {
  if (!id.safeParse(tournamentId).success) return NextResponse.json({ error: 'Torneo inválido.' }, { status: 400 })
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Iniciá sesión para gestionar suplencias.' }, { status: 401 })
  const permissions = await checkTournamentPermissions(user.id, tournamentId)
  if (!permissions.hasPermission) return NextResponse.json({ error: 'Sin permisos para gestionar este torneo.' }, { status: 403 })
  return { actorId: user.id, client, service: await createClientServiceRole() }
}

const createSubstitute = async (
  auth: Exclude<Awaited<ReturnType<typeof authorize>>, NextResponse>,
  tournamentId: string,
  { coupleId, playerData }: Extract<z.infer<typeof mutationSchema>, { action: 'create-player' }>,
) => {
  const [tournament, inscription] = await Promise.all([
    auth.service.from('tournaments').select('type, status').eq('id', tournamentId).maybeSingle(),
    auth.service.from('inscriptions').select('couple:couples!inner(player1_id, player2_id)')
      .eq('tournament_id', tournamentId).eq('couple_id', coupleId).eq('occupies_slot', true).limit(1).maybeSingle(),
  ])
  if (tournament.error) return databaseError(tournament.error)
  if (inscription.error) return databaseError(inscription.error)
  if (tournament.data?.type !== 'LONG' || closedStatuses.has(tournament.data.status)) {
    return NextResponse.json({ error: 'El torneo no admite cambios de suplencia.' }, { status: 400 })
  }
  const couple = Array.isArray(inscription.data?.couple) ? inscription.data.couple[0] : inscription.data?.couple
  if (!couple?.player1_id || !couple.player2_id) {
    return NextResponse.json({ error: 'Elegí una pareja inscripta en este torneo.' }, { status: 400 })
  }

  try {
    const { success, player, matchedBy, message } = await createPlayerForCoupleService(auth.client, { tournamentId, playerData }, auth.service)
    if (!success) return NextResponse.json({ error: message }, { status: 400 })
    if (!player) throw new Error('El alta no devolvió un jugador.')
    if (player.id === couple.player1_id || player.id === couple.player2_id) {
      return NextResponse.json({ error: 'Los datos coinciden con un titular de esta pareja. Elegí otro jugador.' }, { status: 409 })
    }
    const { id, first_name, last_name, dni, score, category_name } = player
    return NextResponse.json({ player: { id, first_name, last_name, dni, score, category_name }, matchedBy }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('[substitute player creation]', error)
    return NextResponse.json({ error: 'No se pudo crear o recuperar al jugador.' }, { status: 500 })
  }
}

const databaseError = (error: { code?: string; message: string }) => {
  if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 })
  if (error.code === '42501') return NextResponse.json({ error: 'Sin permisos para gestionar este torneo.' }, { status: 403 })
  if (error.code === '23505') return NextResponse.json({ error: 'Ya hay una suplencia con ese alcance. Editala desde la lista.' }, { status: 409 })
  console.error('[long substitutions]', error)
  return NextResponse.json({ error: 'No se pudo gestionar la suplencia.' }, { status: 500 })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params
  const auth = await authorize(tournamentId)
  if (auth instanceof NextResponse) return auth
  const matchId = request.nextUrl.searchParams.get('matchId')
  const coupleId = request.nextUrl.searchParams.get('coupleId')
  const args = { p_tournament_id: tournamentId, p_actor_id: auth.actorId }
  if (matchId === null && coupleId === null) {
    const { data, error } = await auth.service.rpc('list_long_substitution_rules', args)
    return error ? databaseError(error) : NextResponse.json({ data })
  }
  if (!id.nullable().safeParse(matchId).success || !id.nullable().safeParse(coupleId).success) {
    return NextResponse.json({ error: 'Partido o pareja inválidos.' }, { status: 400 })
  }
  const [editor, tournament] = await Promise.all([
    auth.service.rpc('get_long_substitution_editor', { ...args, p_match_id: matchId, p_couple_id: coupleId }),
    auth.service.from('tournaments').select('gender').eq('id', tournamentId).single(),
  ])
  if (editor.error) return databaseError(editor.error)
  if (tournament.error) return databaseError(tournament.error)
  return NextResponse.json({ data: { ...editor.data, tournamentGender: tournament.data?.gender } })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params
  const auth = await authorize(tournamentId)
  if (auth instanceof NextResponse) return auth
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Completá los datos de la suplencia.' }, { status: 400 })
  const body = parsed.data
  if (body.action === 'create-player') return createSubstitute(auth, tournamentId, body)
  const save = body.action === 'save' ? body : null
  if (save) {
    const [tournament, couple] = await Promise.all([
      auth.service.from('tournaments').select('gender, category_name, category_config').eq('id', tournamentId).single(),
      auth.service.from('couples').select('player1_id, player2_id').eq('id', save.coupleId).single(),
    ])
    if (tournament.error || couple.error || !tournament.data || !couple.data) {
      return NextResponse.json({ error: 'No se encontró el torneo o la pareja.' }, { status: 400 })
    }
    const partnerId = save.slot === 1 ? couple.data.player2_id : couple.data.player1_id
    const { data: players, error } = await auth.service.from('players').select('id, gender, category_name').in('id', [partnerId, save.playerId])
    if (error) return databaseError(error)
    const partner = players?.find(player => player.id === partnerId)
    const substitute = players?.find(player => player.id === save.playerId)
    if (!partner || !substitute) return NextResponse.json({ error: 'Elegí un jugador válido del padrón.' }, { status: 400 })
    const composition = validateMixedPairGender(tournament.data.gender, partner.gender, substitute.gender)
    const category = validateCategoryCombination(resolveTournamentCategoryConfig(tournament.data), partner.category_name, substitute.category_name)
    if (!composition.success || !category.success) {
      return NextResponse.json({ error: composition.error || category.error }, { status: 400 })
    }
  }
  const { error } = await auth.service.rpc('manage_long_substitution', {
    p_tournament_id: tournamentId, p_actor_id: auth.actorId, p_rule_id: body.ruleId, p_couple_id: body.coupleId,
    p_slot: save?.slot ?? null, p_substitute_id: save?.playerId ?? null, p_scope: save?.scope ?? null,
    p_match_id: save?.matchId ?? null, p_remove: body.action === 'remove',
  })
  if (error) return databaseError(error)
  revalidatePath(`/tournaments/${tournamentId}`, 'layout')
  revalidatePath('/panel')
  revalidatePath('/panel/matches')
  return NextResponse.json({ success: true })
}
