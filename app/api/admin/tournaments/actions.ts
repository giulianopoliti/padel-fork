"use server"

import { withTournamentSortValues } from '@/lib/tournaments/tournament-sort-values'
import { supabaseAdmin, verifyAdmin } from "@/lib/supabase-admin"
import { revalidatePath } from "next/cache"

/**
 * Actualizar datos de un torneo
 */
export async function updateTournament(
  id: string,
  data: {
    name?: string
    description?: string | null
    price?: number | null
    award?: string | null
    max_participants?: number | null
    category_name?: string | null
    gender?: string | null
    type?: string | null
    start_date?: string | null
    end_date?: string | null
    status?: string
  }
) {
  try {
    await verifyAdmin()

    // Validación básica
    if (data.name !== undefined && !data.name.trim()) {
      return { success: false, error: "El nombre del torneo es requerido" }
    }

    const { error } = await supabaseAdmin
      .from("tournaments")
      // This legacy form edits category_name only. Clear a stale structured
      // category in the same write so it cannot override the newly selected label.
      .update(withTournamentSortValues({
        ...data,
        ...(data.category_name !== undefined ? { category_config: null } : {}),
      }))
      .eq("id", id)

    if (error) throw error

    revalidatePath("/admin/tournaments")
    return { success: true, error: null }
  } catch (error: any) {
    console.error("[Admin] Error updating tournament:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Cancelar un torneo (wrapper del endpoint existente)
 */
export async function cancelTournamentAction(tournamentId: string) {
  try {
    await verifyAdmin()

    // Verificar que el torneo existe y puede ser cancelado
    const { data: tournament, error: fetchError } = await supabaseAdmin
      .from("tournaments")
      .select("id, status")
      .eq("id", tournamentId)
      .single()

    if (fetchError || !tournament) {
      return { success: false, error: "Torneo no encontrado" }
    }

    if (["FINISHED", "CANCELED"].includes(tournament.status)) {
      return { success: false, error: "El torneo no puede ser cancelado" }
    }

    // Cancelar torneo
    const { error } = await supabaseAdmin
      .from("tournaments")
      .update(withTournamentSortValues({ status: "CANCELED" }))
      .eq("id", tournamentId)

    if (error) throw error

    revalidatePath("/admin/tournaments")
    return { success: true, error: null, message: "Torneo cancelado exitosamente" }
  } catch (error: any) {
    console.error("[Admin] Error canceling tournament:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Volver torneo a NOT_STARTED desde ZONE_PHASE
 * Usa supabaseAdmin para bypassear RLS
 */
export async function backToNotStartedAction(tournamentId: string) {
  try {
    await verifyAdmin()

    console.log("[Admin] Starting backToNotStartedAction for tournament:", tournamentId)

    // Verificar que el torneo existe y está en ZONE_PHASE
    const { data: tournament, error: tErr } = await supabaseAdmin
      .from("tournaments")
      .select("id, status")
      .eq("id", tournamentId)
      .single()

    if (tErr || !tournament) {
      console.error("[Admin] Tournament not found:", tErr)
      return { success: false, error: "Torneo no encontrado" }
    }

    if (tournament.status !== "ZONE_PHASE") {
      console.error("[Admin] Invalid status:", tournament.status)
      return {
        success: false,
        error: "El torneo no está en fase de zonas. Solo se puede revertir desde este estado."
      }
    }

    // Obtener todas las zonas del torneo
    const { data: zones, error: zonesError } = await supabaseAdmin
      .from("zones")
      .select("id")
      .eq("tournament_id", tournamentId)

    if (zonesError) {
      console.error("[Admin] Error fetching zones:", zonesError)
      return { success: false, error: "Error al obtener las zonas del torneo" }
    }

    const zoneIds = zones?.map((z) => z.id) || []
    console.log("[Admin] Found zones:", zoneIds.length)

    if (zoneIds.length > 0) {
      // Eliminar zone_positions
      const { error: posErr } = await supabaseAdmin
        .from("zone_positions")
        .delete()
        .in("zone_id", zoneIds)

      if (posErr) {
        console.error("[Admin] Error deleting zone_positions:", posErr)
        return { success: false, error: "Error al eliminar zone_positions" }
      }

      // Eliminar zone_couples
      const { error: couplesErr } = await supabaseAdmin
        .from("zone_couples")
        .delete()
        .in("zone_id", zoneIds)

      if (couplesErr) {
        console.error("[Admin] Error deleting zone_couples:", couplesErr)
        return { success: false, error: "Error al eliminar zone_couples" }
      }

      // Eliminar zonas
      const { error: zonesDelErr } = await supabaseAdmin
        .from("zones")
        .delete()
        .in("id", zoneIds)

      if (zonesDelErr) {
        console.error("[Admin] Error deleting zones:", zonesDelErr)
        return { success: false, error: "Error al eliminar las zonas" }
      }
    }

    // Eliminar partidos de zona (round = 'ZONE')
    const { error: matchesError } = await supabaseAdmin
      .from("matches")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("round", "ZONE")

    if (matchesError) {
      console.error("[Admin] Error deleting zone matches:", matchesError)
      return { success: false, error: "Error al eliminar los partidos de zona" }
    }

    // Actualizar estado del torneo a NOT_STARTED
    const { error: statusError } = await supabaseAdmin
      .from("tournaments")
      .update(withTournamentSortValues({ status: "NOT_STARTED" }))
      .eq("id", tournamentId)

    if (statusError) {
      console.error("[Admin] Error updating tournament status:", statusError)
      return { success: false, error: "Error al actualizar el estado del torneo" }
    }

    console.log("[Admin] Successfully reverted tournament to NOT_STARTED")
    revalidatePath("/admin/tournaments")
    return {
      success: true,
      message: `Torneo revertido exitosamente. Se eliminaron ${zoneIds.length} zonas.`
    }
  } catch (error: any) {
    console.error("[Admin] Error reverting tournament to not started:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Volver torneo a ZONE_PHASE desde BRACKET_PHASE
 * Usa supabaseAdmin para bypassear RLS
 */
export async function backToZonesAction(tournamentId: string) {
  try {
    await verifyAdmin()

    console.log("[Admin] Starting backToZonesAction for tournament:", tournamentId)

    // Verificar que el torneo existe y está en BRACKET_PHASE
    const { data: tournament, error: tErr } = await supabaseAdmin
      .from("tournaments")
      .select("id, status")
      .eq("id", tournamentId)
      .single()

    if (tErr || !tournament) {
      console.error("[Admin] Tournament not found:", tErr)
      return { success: false, error: "Torneo no encontrado" }
    }

    if (tournament.status !== "BRACKET_PHASE") {
      console.error("[Admin] Invalid status:", tournament.status)
      return {
        success: false,
        error: "El torneo no está en fase de bracket. Solo se puede revertir desde este estado."
      }
    }

    // ORDEN: operations_log → results_history → hierarchy → matches → seeds

    // 1. Eliminar bracket_operations_log
    const { error: logErr } = await supabaseAdmin
      .from("bracket_operations_log")
      .delete()
      .eq("tournament_id", tournamentId)

    if (logErr) {
      console.error("[Admin] Error deleting operations log:", logErr)
      return { success: false, error: "Error al eliminar el log de operaciones" }
    }

    // 2. Eliminar match_results_history
    const { data: bracketMatches } = await supabaseAdmin
      .from("matches")
      .select("id")
      .eq("tournament_id", tournamentId)
      .neq("round", "ZONE")

    const bracketMatchIds = bracketMatches?.map((m) => m.id) || []

    if (bracketMatchIds.length > 0) {
      const { error: historyErr } = await supabaseAdmin
        .from("match_results_history")
        .delete()
        .in("match_id", bracketMatchIds)

      if (historyErr) {
        console.error("[Admin] Error deleting match results history:", historyErr)
        return { success: false, error: "Error al eliminar el historial de resultados" }
      }
    }

    // 3. Eliminar match_hierarchy
    const { error: hierarchyErr } = await supabaseAdmin
      .from("match_hierarchy")
      .delete()
      .eq("tournament_id", tournamentId)

    if (hierarchyErr) {
      console.error("[Admin] Error deleting match hierarchy:", hierarchyErr)
      return { success: false, error: "Error al eliminar la jerarquía de partidos" }
    }

    // 4. Eliminar partidos de bracket (todos excepto ZONE)
    const { error: matchesErr } = await supabaseAdmin
      .from("matches")
      .delete()
      .eq("tournament_id", tournamentId)
      .neq("round", "ZONE")

    if (matchesErr) {
      console.error("[Admin] Error deleting bracket matches:", matchesErr)
      return { success: false, error: "Error al eliminar los partidos de bracket" }
    }

    // 5. Eliminar tournament_couple_seeds
    const { error: seedsErr } = await supabaseAdmin
      .from("tournament_couple_seeds")
      .delete()
      .eq("tournament_id", tournamentId)

    if (seedsErr) {
      console.error("[Admin] Error deleting seeds:", seedsErr)
      return { success: false, error: "Error al eliminar los seeds" }
    }

    // 6. Actualizar estado del torneo a ZONE_PHASE
    const { error: statusError } = await supabaseAdmin
      .from("tournaments")
      .update(withTournamentSortValues({
        status: "ZONE_PHASE",
        bracket_status: "NOT_STARTED",
        bracket_generated_at: null,
        placeholder_brackets_generated_at: null
      }))
      .eq("id", tournamentId)

    if (statusError) {
      console.error("[Admin] Error updating tournament status:", statusError)
      return { success: false, error: "Error al actualizar el estado del torneo" }
    }

    console.log("[Admin] Successfully reverted tournament to ZONE_PHASE")
    revalidatePath("/admin/tournaments")
    return {
      success: true,
      message: "Torneo revertido exitosamente a fase de zonas. Los datos de zona se mantuvieron intactos."
    }
  } catch (error: any) {
    console.error("[Admin] Error reverting tournament to zones:", error)
    return { success: false, error: error.message }
  }
}
