'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/utils/supabase/server'
import {
  hasExternalTournamentHistory,
  uniqueStrings,
  type PlayerIdentityCandidate,
  type PlayerTournamentReference,
} from '@/lib/player-identity-transfer'
import { searchPlayersByOrganization } from '@/lib/services/player-search-service'

type OrganizerContext = {
  userId: string
  organizationId: string
}

type PlayerRow = {
  id: string
  first_name: string
  last_name: string
  dni: string | null
  phone: string | null
  user_id: string | null
  users?: { email: string | null } | Array<{ email: string | null }> | null
}

const transferSchema = z.object({
  operationId: z.string().uuid(),
  sourcePlayerId: z.string().uuid(),
  targetPlayerId: z.string().uuid(),
  expectedUserId: z.string().uuid(),
  confirmation: z.literal('TRANSFERIR'),
  reason: z.string().trim().min(5).max(500),
})

const getOrganizerContext = async (): Promise<OrganizerContext> => {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) throw new Error('No autenticado')

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'ORGANIZADOR') throw new Error('No autorizado')

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('organization_members')
    .select('organizacion_id, member_role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('member_role', ['owner', 'admin'])
    .limit(1)
    .maybeSingle()

  if (membershipError || !membership) {
    throw new Error('Solo owners y administradores de la organizacion pueden resolver duplicados')
  }

  return { userId: user.id, organizationId: membership.organizacion_id }
}

const getPlayerTournaments = async (playerId: string): Promise<PlayerTournamentReference[]> => {
  const { data: couples, error: couplesError } = await supabaseAdmin
    .from('couples')
    .select('id')
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)

  if (couplesError) throw couplesError

  const coupleIds = (couples || []).map((couple) => couple.id)
  const [directResult, coupleResult] = await Promise.all([
    supabaseAdmin.from('inscriptions').select('tournament_id').eq('player_id', playerId),
    coupleIds.length > 0
      ? supabaseAdmin.from('inscriptions').select('tournament_id').in('couple_id', coupleIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (directResult.error) throw directResult.error
  if (coupleResult.error) throw coupleResult.error

  const tournamentIds = uniqueStrings([
    ...(directResult.data || []).map((row) => row.tournament_id),
    ...(coupleResult.data || []).map((row) => row.tournament_id),
  ])

  if (tournamentIds.length === 0) return []

  const { data: tournaments, error } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, organization_id')
    .in('id', tournamentIds)

  if (error) throw error

  return (tournaments || []).map((tournament) => ({
    id: tournament.id,
    name: tournament.name,
    organizationId: tournament.organization_id,
  }))
}

const normalizePlayer = (
  player: PlayerRow,
  tournaments: PlayerTournamentReference[],
): PlayerIdentityCandidate => {
  const user = Array.isArray(player.users) ? player.users[0] : player.users

  return {
    id: player.id,
    firstName: player.first_name,
    lastName: player.last_name,
    dni: player.dni,
    phone: player.phone,
    userId: player.user_id,
    email: user?.email || null,
    tournaments: tournaments.map(({ id, name }) => ({ id, name })),
  }
}

export const findIdentitySourceByEmail = async (emailInput: string) => {
  try {
    const context = await getOrganizerContext()
    const email = z.string().trim().email().parse(emailInput).toLowerCase()
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, role')
      .ilike('email', email)
      .maybeSingle()

    if (userError) throw userError
    if (!user || user.role !== 'PLAYER') {
      return { success: false, error: 'No se encontro una cuenta de jugador con ese email' }
    }

    const { data: player, error: playerError } = await supabaseAdmin
      .from('players')
      .select('id, first_name, last_name, dni, phone, user_id, users!players_user_id_fkey(email)')
      .eq('user_id', user.id)
      .maybeSingle()

    if (playerError) throw playerError
    if (!player) return { success: false, error: 'La cuenta no tiene un jugador vinculado' }

    const tournaments = await getPlayerTournaments(player.id)
    return {
      success: true,
      player: normalizePlayer(player as PlayerRow, tournaments),
      blockedByExternalHistory: hasExternalTournamentHistory(tournaments, context.organizationId),
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Error buscando la cuenta' }
  }
}

export const searchOrganizationIdentityTargets = async (searchInput: string) => {
  try {
    const context = await getOrganizerContext()
    const search = z.string().trim().min(2).max(80).parse(searchInput)
    const result = await searchPlayersByOrganization({
      organizationId: context.organizationId,
      searchTerm: search,
      page: 1,
      pageSize: 50,
    })

    const candidates = await Promise.all(result.players.map(async (player) => {
      const tournaments = await getPlayerTournaments(player.id)
      const ownTournaments = tournaments.filter((tournament) => tournament.organizationId === context.organizationId)
      return ownTournaments.length > 0
        ? normalizePlayer(player as PlayerRow, ownTournaments)
        : null
    }))

    return { success: true, players: candidates.filter((player): player is PlayerIdentityCandidate => player !== null).slice(0, 15) }
  } catch (error) {
    return { success: false, players: [], error: error instanceof Error ? error.message : 'Error buscando jugadores' }
  }
}

export const transferPlayerIdentity = async (rawInput: unknown) => {
  let auditId: string | null = null
  let recovery: { sourcePlayerId: string; userId: string } | null = null

  try {
    const context = await getOrganizerContext()
    const input = transferSchema.parse(rawInput)
    if (input.sourcePlayerId === input.targetPlayerId) {
      return { success: false, error: 'El origen y el destino deben ser jugadores distintos' }
    }

    const { data: previousAudit } = await supabaseAdmin
      .from('player_identity_transfers')
      .select('status')
      .eq('operation_id', input.operationId)
      .maybeSingle()

    if (previousAudit?.status === 'completed') return { success: true }
    if (previousAudit) return { success: false, error: 'Esta operacion ya fue procesada' }

    const { data: players, error: playersError } = await supabaseAdmin
      .from('players')
      .select('id, first_name, last_name, dni, phone, user_id')
      .in('id', [input.sourcePlayerId, input.targetPlayerId])

    if (playersError) throw playersError
    const source = players?.find((player) => player.id === input.sourcePlayerId)
    const target = players?.find((player) => player.id === input.targetPlayerId)

    if (!source || !target) return { success: false, error: 'No se encontraron ambos jugadores' }
    if (source.user_id !== input.expectedUserId) return { success: false, error: 'La cuenta origen cambio; volve a buscarla' }
    if (target.user_id) return { success: false, error: 'El jugador destino ya tiene una cuenta vinculada' }

    const { data: account } = await supabaseAdmin.from('users').select('role').eq('id', input.expectedUserId).single()
    if (account?.role !== 'PLAYER') return { success: false, error: 'La cuenta seleccionada no es una cuenta de jugador' }

    const [sourceTournaments, targetTournaments] = await Promise.all([
      getPlayerTournaments(source.id),
      getPlayerTournaments(target.id),
    ])

    if (hasExternalTournamentHistory(sourceTournaments, context.organizationId)) {
      return { success: false, error: 'El jugador origen tiene historial fuera de tu organizacion. Debe resolverlo un administrador.' }
    }
    if (!targetTournaments.some((tournament) => tournament.organizationId === context.organizationId)) {
      return { success: false, error: 'El jugador destino no esta inscripto en torneos de tu organizacion' }
    }

    const { data: audit, error: auditError } = await supabaseAdmin
      .from('player_identity_transfers')
      .insert({
        operation_id: input.operationId,
        source_player_id: source.id,
        target_player_id: target.id,
        transferred_user_id: input.expectedUserId,
        organization_id: context.organizationId,
        performed_by: context.userId,
        reason: input.reason,
        source_snapshot: { ...source, tournaments: sourceTournaments },
        target_snapshot: { ...target, tournaments: targetTournaments },
      })
      .select('id')
      .single()

    if (auditError) throw auditError
    auditId = audit.id

    const { data: unlinkedSource, error: unlinkError } = await supabaseAdmin
      .from('players')
      .update({ user_id: null })
      .eq('id', source.id)
      .eq('user_id', input.expectedUserId)
      .select('id')
      .maybeSingle()

    if (unlinkError || !unlinkedSource) throw unlinkError || new Error('La cuenta origen cambio durante la operacion')
    recovery = { sourcePlayerId: source.id, userId: input.expectedUserId }

    const { data: linkedTarget, error: linkError } = await supabaseAdmin
      .from('players')
      .update({ user_id: input.expectedUserId })
      .eq('id', target.id)
      .is('user_id', null)
      .select('id')
      .maybeSingle()

    if (linkError || !linkedTarget) {
      const { data: restored, error: restoreError } = await supabaseAdmin
        .from('players')
        .update({ user_id: input.expectedUserId })
        .eq('id', source.id)
        .is('user_id', null)
        .select('id')
        .maybeSingle()

      const recoveryRequired = Boolean(restoreError || !restored)
      await supabaseAdmin.from('player_identity_transfers').update({
        status: recoveryRequired ? 'recovery_required' : 'rolled_back',
        error_message: linkError?.message || 'No se pudo vincular el destino',
        completed_at: new Date().toISOString(),
      }).eq('id', audit.id)

      return {
        success: false,
        error: recoveryRequired
          ? 'Error critico: la cuenta requiere recuperacion administrativa'
          : 'No se pudo completar la transferencia y el cambio fue revertido',
      }
    }

    recovery = null

    await supabaseAdmin.from('player_identity_transfers').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', audit.id)

    revalidatePath('/panel')
    revalidatePath('/my-players')
    revalidatePath('/admin/players')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado al transferir la cuenta'
    if (auditId) {
      let status: 'rolled_back' | 'recovery_required' = 'rolled_back'
      if (recovery) {
        const { data: restored, error: restoreError } = await supabaseAdmin
          .from('players')
          .update({ user_id: recovery.userId })
          .eq('id', recovery.sourcePlayerId)
          .is('user_id', null)
          .select('id')
          .maybeSingle()

        if (restoreError || !restored) status = 'recovery_required'
      }

      await supabaseAdmin.from('player_identity_transfers').update({
        status,
        error_message: message,
        completed_at: new Date().toISOString(),
      }).eq('id', auditId)

      if (status === 'recovery_required') {
        return { success: false, error: 'Error critico: la cuenta requiere recuperacion administrativa' }
      }
    }
    return { success: false, error: message }
  }
}
