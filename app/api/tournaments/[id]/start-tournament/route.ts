import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { checkTournamentPermissions } from "@/utils/tournament-permissions"
import { ensureAmericanSingleZone } from "@/lib/services/tournaments/american-single-zone"
import { TournamentFormatResolver } from "@/lib/services/tournament-format-resolver"

/**
 * 🎯 API ROUTE: INICIAR TORNEO
 *
 * Cambia el status a ZONE_PHASE y prepara la Zona General cuando el formato
 * americano administra una única zona.
 *
 * Responsabilidades:
 * ✅ Validar autenticación y permisos
 * ✅ Verificar que hay parejas inscritas
 * ✅ Verificar que NO hay jugadores individuales sin pareja
 * ✅ Sincronizar parejas aprobadas en formatos de zona única
 * ✅ Cambiar status a ZONE_PHASE
 * ✅ Retornar éxito con mensaje
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params
  const supabase = await createClient()

  // ========================================
  // PASO 1: AUTENTICACIÓN
  // ========================================

  const { data: { user }, error: userErr } = await supabase.auth.getUser()

  if (userErr || !user) {
    return NextResponse.json({
      success: false,
      error: "No autenticado"
    }, { status: 401 })
  }

  // ========================================
  // PASO 2: VERIFICAR PERMISOS
  // ========================================

  const permissions = await checkTournamentPermissions(user.id, tournamentId)

  if (!permissions.hasPermission) {
    return NextResponse.json({
      success: false,
      error: "No tienes permisos para gestionar este torneo"
    }, { status: 403 })
  }

  // ========================================
  // PASO 3: VERIFICAR ESTADO ACTUAL
  // ========================================

  const { data: tournament, error: tournErr } = await supabase
    .from("tournaments")
    .select("status, type, format_type, format_config")
    .eq("id", tournamentId)
    .single()

  if (tournErr || !tournament) {
    return NextResponse.json({
      success: false,
      error: "Torneo no encontrado"
    }, { status: 404 })
  }

  if (tournament.status !== "NOT_STARTED") {
    return NextResponse.json({
      success: false,
      error: "El torneo ya fue iniciado"
    }, { status: 400 })
  }

  // ========================================
  // PASO 4: VERIFICAR QUE HAY PAREJAS INSCRITAS
  // ========================================

  const { count: couplesCount } = await supabase
    .from("inscriptions")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .not("couple_id", "is", null)
    .eq("is_pending", false)

  if (!couplesCount || couplesCount === 0) {
    return NextResponse.json({
      success: false,
      error: "No hay parejas inscritas en el torneo"
    }, { status: 400 })
  }

  const resolvedFormat = TournamentFormatResolver.getResolvedFormat(tournament, {
    totalCouples: couplesCount,
  })
  const isAmericanSingleZone = resolvedFormat.baseType === 'AMERICAN' && resolvedFormat.zoneMode === 'SINGLE_ZONE'

  if (isAmericanSingleZone && couplesCount < 3) {
    return NextResponse.json({
      success: false,
      error: "Un americano de zona única necesita al menos 3 parejas aprobadas"
    }, { status: 400 })
  }

  if (isAmericanSingleZone) {
    const zoneResult = await ensureAmericanSingleZone(tournamentId)
    if (!zoneResult.success) {
      return NextResponse.json({
        success: false,
        error: zoneResult.error || "No se pudo preparar la Zona General"
      }, { status: 500 })
    }
  }

  // ========================================
  // PASO 5: VERIFICAR QUE NO HAY JUGADORES SIN PAREJA
  // ========================================

  const { count: individualCount } = await supabase
    .from("inscriptions")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .is("couple_id", null)
    .not("player_id", "is", null)

  if (individualCount && individualCount > 0) {
    return NextResponse.json({
      success: false,
      error: `Hay ${individualCount} jugador(es) sin pareja. Todos deben estar emparejados antes de iniciar el torneo.`
    }, { status: 400 })
  }

  // ========================================
  // PASO 6: CAMBIAR STATUS A ZONE_PHASE
  // ========================================

  const { error: updateErr } = await supabase
    .from("tournaments")
    .update({ status: "ZONE_PHASE" })
    .eq("id", tournamentId)

  if (updateErr) {
    console.error("Error updating tournament status:", updateErr)
    return NextResponse.json({
      success: false,
      error: "Error al iniciar el torneo"
    }, { status: 500 })
  }

  // ========================================
  // PASO 7: RETORNAR EXITO
  // ========================================

  return NextResponse.json({
    success: true,
    message: `Torneo iniciado exitosamente. ${couplesCount} parejas listas para ser asignadas a zonas.`,
    data: {
      couplesCount,
      status: "ZONE_PHASE"
    }
  })
}
