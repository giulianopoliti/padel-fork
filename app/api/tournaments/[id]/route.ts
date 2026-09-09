import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { serialize } from '@/utils/serialization';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const endpoint = url.searchParams.get('endpoint');
    
    // Back-compat: handle zones via query param (deprecated by /zones route)
    if (endpoint === 'zones') {
      const { fetchTournamentZones } = await import('./actions');
      const result = await fetchTournamentZones(id);
      if (!result.success) return NextResponse.json(result, { status: 500 });
      return NextResponse.json(serialize(result));
    }
    
    // Default: Handle matches endpoint with CORRECTED zone relation syntax
    const { data: matches, error } = await supabase
      .from("matches")
      .select(`
        *,
        zones!matches_zone_id_fkey(id, name),
        couple1:couples!matches_couple1_id_fkey(
          id,player1_id,player2_id,
          player1_details:players!couples_player1_id_fkey(id,first_name,last_name),
          player2_details:players!couples_player2_id_fkey(id,first_name,last_name)
        ),
        couple2:couples!matches_couple2_id_fkey(
          id,player1_id,player2_id,
          player1_details:players!couples_player1_id_fkey(id,first_name,last_name),
          player2_details:players!couples_player2_id_fkey(id,first_name,last_name)
        )
      `)
      .eq("tournament_id", id)
      .order("created_at");

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Procesar y filtrar los partidos - properly serialize all data with zone validation
    const processedMatches = matches
      .filter(m => {
        // Validar integridad de datos críticos
        if (!m.zone_id) {
          console.warn(`[CRITICAL] Match ${m.id} missing zone_id - excluding from results`);
          return false;
        }
        if (!m.couple1 || !m.couple2) {
          return false; // Filtrar BYEs
        }
        return true;
      })
      .map(m => {
        const couple1PlayerDetails = Array.isArray(m.couple1?.player1_details) ? m.couple1.player1_details[0] : m.couple1?.player1_details;
        const couple1Player2Details = Array.isArray(m.couple1?.player2_details) ? m.couple1.player2_details[0] : m.couple1?.player2_details;
        const couple2PlayerDetails = Array.isArray(m.couple2?.player1_details) ? m.couple2.player1_details[0] : m.couple2?.player1_details;
        const couple2Player2Details = Array.isArray(m.couple2?.player2_details) ? m.couple2.player2_details[0] : m.couple2?.player2_details;
        
        return {
          id: m.id,
          tournament_id: m.tournament_id,
          zone_id: m.zone_id,
          couple1_id: m.couple1_id,
          couple2_id: m.couple2_id,
          court: m.court,
          status: m.status,
          result_couple1: m.result_couple1,
          result_couple2: m.result_couple2,
          winner_id: m.winner_id,
          created_at: m.created_at,
          zone_name: m.zones?.name || 'Zona Desconocida',
          couple1_player1_name: `${couple1PlayerDetails?.first_name || ""} ${couple1PlayerDetails?.last_name || ""}`.trim(),
          couple1_player2_name: `${couple1Player2Details?.first_name || ""} ${couple1Player2Details?.last_name || ""}`.trim(),
          couple2_player1_name: `${couple2PlayerDetails?.first_name || ""} ${couple2PlayerDetails?.last_name || ""}`.trim(),
          couple2_player2_name: `${couple2Player2Details?.first_name || ""} ${couple2Player2Details?.last_name || ""}`.trim()
        };
      })
      .filter(m => 
        m.couple1_player1_name && m.couple1_player2_name &&
        m.couple2_player1_name && m.couple2_player2_name &&
        !m.couple1_player1_name.includes('BYE') && !m.couple1_player2_name.includes('BYE') &&
        !m.couple2_player1_name.includes('BYE') && !m.couple2_player2_name.includes('BYE')
      );

    return NextResponse.json(serialize({ success: true, matches: processedMatches }));
  } catch (e: any) {
    return NextResponse.json(
      serialize({ success: false, error: e.message || "Error inesperado" }),
      { status: 500 }
    );
  }
}

// ------------------------------------------------------------
//  POST: Create a new match for a zone (called from client via fetch)
// ------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const body = await request.json();
    const {
      zoneId,
      couple1Id,
      couple2Id,
      court,
      expectedRecommendationRevision,
      allowUnsafe,
    } = body as {
      zoneId: string;
      couple1Id: string;
      couple2Id: string;
      court?: number | null;
      expectedRecommendationRevision?: string;
      allowUnsafe?: boolean;
    };

    if (!zoneId || !couple1Id || !couple2Id) {
      return NextResponse.json(
        { success: false, error: "Missing parameters" },
        { status: 400 }
      );
    }

    // Dynamically import to avoid edge bundling issues
    const { createMatchOfZone } = await import("./actions");

    // Los dos campos opcionales conectan el POST existente con la protección del
    // recomendador sin obligar a que todas las pantallas muestren todavía el panel.
    const result = await createMatchOfZone(
      tournamentId,
      zoneId,
      couple1Id,
      couple2Id,
      court ?? 0,
      { expectedRecommendationRevision, allowUnsafe },
    );

    const status = result.success
      ? 200
      : 'code' in result && result.code === 'RECOMMENDATION_STALE'
        ? 409
        : 'requiresConfirmation' in result && result.requiresConfirmation
          ? 422
          : 400

    return NextResponse.json(result, { status });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message || "Error inesperado" },
      { status: 500 }
    );
  }
}

// ------------------------------------------------------------
//  PATCH: Update match result (called from client via fetch)
// ------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const body = await request.json();
    const { matchId, couple1Score, couple2Score, couple1Id, couple2Id } = body as {
      matchId: string;
      couple1Score: number;
      couple2Score: number;
      couple1Id: string;
      couple2Id: string;
    };

    if (!matchId || couple1Score == null || couple2Score == null || !couple1Id || !couple2Id) {
      return NextResponse.json(
        { success: false, error: "Missing parameters" },
        { status: 400 }
      );
    }

    // Dynamically import to avoid edge bundling issues
    const { saveMatchResult } = await import("./actions");

    const result = await saveMatchResult(
      tournamentId,
      matchId,
      couple1Score,
      couple2Score,
      couple1Id,
      couple2Id
    );

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message || "Error inesperado" },
      { status: 500 }
    );
  }
}

// ------------------------------------------------------------
//  DELETE: Delete a match (called from client via fetch)
// ------------------------------------------------------------

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params
    const { matchId } = await request.json() as { matchId?: string }
    if (!matchId) {
      return NextResponse.json({ success: false, error: 'Missing matchId' }, { status: 400 })
    }

    const { deleteMatch } = await import('./actions')
    const result = await deleteMatch(tournamentId, matchId)
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message || 'Error inesperado' },
      { status: 500 }
    )
  }
}
