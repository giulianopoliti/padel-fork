import { getTenantBranding } from "@/config/tenant"
import { createClientServiceRole } from "@/utils/supabase/server"
import { getTpeTermsUrl, TPE_TERMS_VERSION } from "@/lib/tpe/terms"

export const TPE_BLOCKED_REGISTRATION_MESSAGE =
  "Te prohibieron la inscripción a los torneos de Padel Elite, comunicate con los organizadores para resolverlo."

export const isTpeAmerican = (tournamentType: string | null | undefined) =>
  getTenantBranding().key === "padel-elite" && tournamentType === "AMERICAN"

export const getBlockedTpePlayers = async (playerIds: string[]): Promise<Array<{ id: string; player_id: string }>> => {
  if (playerIds.length === 0) return [] as Array<{ id: string; player_id: string }>

  const supabase = await createClientServiceRole()
  const { data, error } = await (supabase as any)
    .from("tpe_registration_blocks")
    .select("id, player_id")
    .in("player_id", playerIds)
    .is("unblocked_at", null)

  if (error) throw new Error(`No se pudieron verificar las restricciones: ${error.message}`)
  return (data || []) as Array<{ id: string; player_id: string }>
}

export const assertTpePlayersCanRegister = async ({
  tournamentType,
  playerIds,
  allowBlockedPlayerOverride = false,
}: {
  tournamentType: string | null | undefined
  playerIds: string[]
  allowBlockedPlayerOverride?: boolean
}) => {
  if (!isTpeAmerican(tournamentType) || allowBlockedPlayerOverride) return { success: true as const, blocks: [] }

  const blocks = await getBlockedTpePlayers(playerIds)
  if (blocks.length > 0) return { success: false as const, error: TPE_BLOCKED_REGISTRATION_MESSAGE, blocks }
  return { success: true as const, blocks }
}

export const recordTpeTermsAcceptance = async ({
  tournamentType,
  tournamentId,
  inscriptionId,
  playerId,
  userId,
}: {
  tournamentType: string | null | undefined
  tournamentId: string
  inscriptionId: string
  playerId: string
  userId: string
}) => {
  if (!isTpeAmerican(tournamentType)) return

  const supabase = await createClientServiceRole()
  const { error } = await (supabase as any).from("tpe_terms_acceptances").insert({
    tournament_id: tournamentId,
    inscription_id: inscriptionId,
    accepted_by_player_id: playerId,
    accepted_by_user_id: userId,
    terms_version: TPE_TERMS_VERSION,
    terms_url: getTpeTermsUrl(),
  })

  if (error) throw new Error(`No se pudo guardar la aceptación de términos: ${error.message}`)
}

export const recordTpeBlockOverrides = async ({
  tournamentType,
  tournamentId,
  playerIds,
  authorizedByUserId,
}: {
  tournamentType: string | null | undefined
  tournamentId: string
  playerIds: string[]
  authorizedByUserId: string
}) => {
  if (!isTpeAmerican(tournamentType)) return
  const blocks = await getBlockedTpePlayers(playerIds)
  if (blocks.length === 0) return

  const supabase = await createClientServiceRole()
  const { error } = await (supabase as any).from("tpe_registration_block_overrides").insert(
    blocks.map((block) => ({
      block_id: block.id,
      tournament_id: tournamentId,
      player_id: block.player_id,
      authorized_by_user_id: authorizedByUserId,
    })),
  )
  if (error) throw new Error(`No se pudo registrar la excepción: ${error.message}`)
}

export const recordTpeLateWithdrawal = async ({
  tournamentId,
  inscriptionId,
  playerIds,
  cancelledByUserId,
  cancellationSource,
  forceRecord = false,
}: {
  tournamentId: string
  inscriptionId: string
  playerIds: string[]
  cancelledByUserId: string
  cancellationSource: "PLAYER" | "ORGANIZER"
  forceRecord?: boolean
}) => {
  const supabase = await createClientServiceRole()
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("type, start_date")
    .eq("id", tournamentId)
    .single()

  if (tournamentError || !isTpeAmerican(tournament?.type) || !tournament.start_date) return false

  const startAt = new Date(tournament.start_date)
  const millisecondsUntilStart = startAt.getTime() - Date.now()
  const isLate = millisecondsUntilStart >= 0 && millisecondsUntilStart < 3 * 60 * 60 * 1000
  if (!isLate || (cancellationSource === "ORGANIZER" && !forceRecord)) return false

  const { error } = await (supabase as any).from("tpe_late_withdrawals").upsert(
    playerIds.map((playerId) => ({
      tournament_id: tournamentId,
      inscription_id: inscriptionId,
      player_id: playerId,
      cancelled_by_user_id: cancelledByUserId,
      cancellation_source: cancellationSource,
      tournament_start_at: tournament.start_date,
    })),
    { onConflict: "inscription_id,player_id", ignoreDuplicates: true },
  )

  if (error) throw new Error(`No se pudo guardar la baja tardía: ${error.message}`)
  return true
}

export const getTpeLateWithdrawalCounts = async (playerIds: string[]) => {
  const counts = new Map<string, number>()
  if (playerIds.length === 0 || getTenantBranding().key !== "padel-elite") return counts

  const supabase = await createClientServiceRole()
  const { data, error } = await (supabase as any)
    .from("tpe_late_withdrawals")
    .select("player_id")
    .in("player_id", playerIds)

  if (error) throw new Error(`No se pudo obtener el historial de bajas: ${error.message}`)
  for (const row of data || []) counts.set(row.player_id, (counts.get(row.player_id) || 0) + 1)
  return counts
}

export type TpeRestrictionPlayer = {
  id: string
  first_name: string
  last_name: string
  lateWithdrawalCount: number
  activeBlockId: string | null
  blockedAt: string | null
  withdrawals: Array<{ id: string; cancelled_at: string; tournament_id: string }>
}

export const getTpeRestrictionPlayers = async (): Promise<TpeRestrictionPlayer[]> => {
  if (getTenantBranding().key !== "padel-elite") return []

  const supabase = await createClientServiceRole()
  const [{ data: withdrawals, error: withdrawalsError }, { data: activeBlocks, error: blocksError }] = await Promise.all([
    (supabase as any).from("tpe_late_withdrawals").select("id, player_id, cancelled_at, tournament_id").order("cancelled_at", { ascending: false }).limit(1000),
    (supabase as any).from("tpe_registration_blocks").select("id, player_id, blocked_at").is("unblocked_at", null),
  ])

  if (withdrawalsError || blocksError) throw new Error("No se pudieron cargar las restricciones de inscripción")

  const playerIds = Array.from(new Set([...(withdrawals || []).map((row: any) => row.player_id), ...(activeBlocks || []).map((row: any) => row.player_id)]))
  if (playerIds.length === 0) return []

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, first_name, last_name")
    .in("id", playerIds)

  if (playersError) throw new Error("No se pudieron cargar los jugadores restringidos")

  const blocksByPlayer = new Map<string, { id: string; blocked_at: string }>((activeBlocks || []).map((row: any) => [row.player_id, row]))
  const withdrawalsByPlayer = new Map<string, any[]>()
  for (const withdrawal of withdrawals || []) {
    const history = withdrawalsByPlayer.get(withdrawal.player_id) || []
    history.push(withdrawal)
    withdrawalsByPlayer.set(withdrawal.player_id, history)
  }

  return (players || [])
    .map((player) => {
      const history = withdrawalsByPlayer.get(player.id) || []
      const block = blocksByPlayer.get(player.id)
      return {
        ...player,
        lateWithdrawalCount: history.length,
        activeBlockId: block?.id || null,
        blockedAt: block?.blocked_at || null,
        withdrawals: history,
      }
    })
    .sort((left, right) => Number(Boolean(right.activeBlockId)) - Number(Boolean(left.activeBlockId)) || right.lateWithdrawalCount - left.lateWithdrawalCount)
}

export const setTpePlayerBlock = async ({ playerId, actorUserId, blocked }: { playerId: string; actorUserId: string; blocked: boolean }) => {
  const supabase = await createClientServiceRole()
  if (blocked) {
    const { error } = await (supabase as any).from("tpe_registration_blocks").insert({ player_id: playerId, blocked_by_user_id: actorUserId })
    if (error && error.code !== "23505") throw new Error(`No se pudo bloquear al jugador: ${error.message}`)
    return
  }

  const { error } = await (supabase as any)
    .from("tpe_registration_blocks")
    .update({ unblocked_at: new Date().toISOString(), unblocked_by_user_id: actorUserId })
    .eq("player_id", playerId)
    .is("unblocked_at", null)
  if (error) throw new Error(`No se pudo desbloquear al jugador: ${error.message}`)
}
