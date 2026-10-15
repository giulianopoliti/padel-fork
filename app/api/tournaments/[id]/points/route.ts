import { withTournamentSortValues } from '@/lib/tournaments/tournament-sort-values'
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
// ✅ Using new Points Service (organized in lib/services/points)
import {
  calculateTournamentPoints,
  processTournamentPoints
} from '@/lib/services/points';
import { checkTournamentPermissions } from '@/utils/tournament-permissions';
import { loadTournamentFinalization } from '@/lib/tournaments/finalization';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { id: tournamentId } = await params;

    // Verificar autenticación
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    // Verificar permisos usando la función centralizada
    const permissions = await checkTournamentPermissions(user.id, tournamentId);
    if (!permissions.hasPermission) {
      return NextResponse.json(
        { error: permissions.reason || 'No tienes permisos para ver esta información' },
        { status: 403 }
      );
    }

    // Obtener datos del torneo
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, status')
      .eq('id', tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return NextResponse.json(
        { error: 'Torneo no encontrado' },
        { status: 404 }
      );
    }

    // Verificar estado del torneo
    if (tournament.status === 'FINISHED_POINTS_CALCULATED') {
      return NextResponse.json(
        { error: 'Los puntos ya fueron calculados para este torneo' },
        { status: 400 }
      );
    }

    if (tournament.status !== 'FINISHED_POINTS_PENDING') {
      return NextResponse.json(
        { error: 'El torneo no está en estado de revisión de puntos' },
        { status: 400 }
      );
    }

    const finalization = await loadTournamentFinalization(supabase, tournamentId);
    if (!finalization.allMatchesFinished) {
      return NextResponse.json({ error: finalization.reason }, { status: 409 });
    }

    // Calcular preview de puntos usando nuevo servicio
    const calculation = await calculateTournamentPoints(tournamentId, supabase);

    // Formatear respuesta para el frontend
    const preview = {
      playerScores: calculation.playerUpdates.map((update) => ({
        playerId: update.playerId,
        playerName: update.playerName,
        pointsBefore: update.currentScore,
        pointsEarned: update.totalPoints,
        pointsAfter: update.newScore,
        bonus: update.bonus > 0 ? update.bonus : undefined
      })),
      totalMatches: calculation.totalMatches,
      tournamentType: calculation.tournamentType,
      bonuses: finalization.bonuses,
      config: {
        bonusChampion: calculation.config.bonusChampion,
        bonusFinalist: calculation.config.bonusFinalist
      }
    };

    return NextResponse.json(preview);
  } catch (error: any) {
    console.error('[GET points/preview]', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { id: tournamentId } = await params;

    // Verificar autenticación
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    // Verificar permisos usando la función centralizada
    const permissions = await checkTournamentPermissions(user.id, tournamentId);
    if (!permissions.hasPermission) {
      return NextResponse.json(
        { error: permissions.reason || 'No tienes permisos para realizar esta acción' },
        { status: 403 }
      );
    }

    // Obtener datos del torneo
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, status')
      .eq('id', tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return NextResponse.json(
        { error: 'Torneo no encontrado' },
        { status: 404 }
      );
    }

    // Verificar estado del torneo
    if (tournament.status === 'FINISHED_POINTS_CALCULATED') {
      return NextResponse.json(
        { error: 'Los puntos ya fueron calculados para este torneo' },
        { status: 400 }
      );
    }

    if (tournament.status !== 'FINISHED_POINTS_PENDING') {
      return NextResponse.json(
        { error: 'El torneo no está en estado de revisión de puntos' },
        { status: 400 }
      );
    }

    const finalization = await loadTournamentFinalization(supabase, tournamentId);
    if (!finalization.allMatchesFinished) {
      return NextResponse.json({ error: finalization.reason }, { status: 409 });
    }

    // Procesar y aplicar puntos
    const result = await processTournamentPoints(tournamentId, supabase);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    // Actualizar estado del torneo
    const { error: updateError } = await supabase
      .from('tournaments')
      .update(withTournamentSortValues({ status: 'FINISHED_POINTS_CALCULATED' }))
      .eq('id', tournamentId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Error actualizando estado del torneo' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (error: any) {
    console.error('[POST points/confirm]', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
} 