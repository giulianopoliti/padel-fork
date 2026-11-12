import {
  resolveInitialPlayerProfile,
} from "@/lib/services/tournament-category-config";
import { normalizePlayerDni } from "@/lib/utils/player-dni";
import { findExistingPlayerByIdentity, type ExistingPlayerMatch } from "@/lib/utils/player-identity";
import type { createClientServiceRole } from "@/utils/supabase/server";

const ALLOWED_CREATE_PLAYER_ROLES = new Set([
  "CLUB",
  "PLAYER",
  "COACH",
  "ADMIN",
  "ORGANIZADOR",
]);

interface CreatePlayerForCoupleInput {
  tournamentId: string;
  playerData: {
    first_name: string;
    last_name: string;
    gender: string;
    dni?: string | null;
    phone?: string | null;
    forceCreateNew?: boolean;
  };
}

export async function createPlayerForCoupleService(
  supabase: any,
  { tournamentId, playerData }: CreatePlayerForCoupleInput,
  // The caller must verify tournament management access before providing a privileged directory.
  organizerDirectory?: Awaited<ReturnType<typeof createClientServiceRole>>,
): Promise<{
  success: boolean;
  playerId?: string;
  message: string;
  player?: ExistingPlayerMatch;
  matchedBy?: 'dni' | 'name' | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Usuario no autenticado");
  }

  const { data: userRecord, error: roleError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (roleError) {
    console.error("[createPlayerForCouple] Error fetching user role:", roleError);
    throw new Error("No se pudo validar el rol del usuario");
  }

  const role = userRecord?.role ?? null;

  if (!role || !ALLOWED_CREATE_PLAYER_ROLES.has(role)) {
    throw new Error("No tienes permisos para crear jugadores para torneos");
  }

  const directory = organizerDirectory ?? supabase;
  const { data: tournament, error: tournamentError } = await directory
    .from("tournaments")
    .select("gender, category_name, category_config")
    .eq("id", tournamentId)
    .single();

  if (tournamentError) {
    console.error("[createPlayerForCouple] Error fetching tournament:", tournamentError);
    throw new Error("No se pudo obtener información del torneo");
  }

  const tournamentGenderUpper = (tournament?.gender ?? "").toUpperCase();
  const playerGenderUpper = (playerData?.gender ?? "").toUpperCase();

  if (tournamentGenderUpper === "FEMALE" && playerGenderUpper !== "FEMALE") {
    return {
      success: false,
      message: "Es un torneo femenino, pero el jugador es de género masculino",
    };
  }

  const normalizedDni = normalizePlayerDni(playerData.dni);

  if (organizerDirectory || !playerData.forceCreateNew) {
    const existingPlayerResult = await findExistingPlayerByIdentity({
      supabase: directory,
      firstName: playerData.first_name,
      lastName: playerData.last_name,
      dni: playerData.dni,
      gender: playerData.gender,
      preferLinkedAccount: Boolean(organizerDirectory),
    });

    if (existingPlayerResult.error) {
      console.error("[createPlayerForCouple] Error al buscar jugador existente:", existingPlayerResult.error);
      throw new Error("Error al verificar jugador existente");
    }

    if (existingPlayerResult.player) {
      return {
        success: true,
        playerId: existingPlayerResult.player.id,
        message: "Jugador existente encontrado",
        ...(organizerDirectory && { player: existingPlayerResult.player, matchedBy: existingPlayerResult.matchedBy }),
      };
    }
  }

  const initialPlayerProfile = await resolveInitialPlayerProfile({
    supabase: directory,
    tournament,
  });

  const newPlayerData = {
    first_name: playerData.first_name,
    last_name: playerData.last_name,
    gender: playerData.gender,
    dni: normalizedDni.dni,
    dni_is_temporary: normalizedDni.dniIsTemporary,
    phone: playerData.phone?.trim() || null,
    score: initialPlayerProfile.score,
    category_name: initialPlayerProfile.categoryName,
    is_categorized: true,
    created_at: new Date().toISOString(),
  };

  const { data: newPlayer, error: newPlayerError } = await directory
    .from("players")
    .insert(newPlayerData)
    .select("id")
    .single();

  if (newPlayerError) {
    console.error("[createPlayerForCouple] Error creating new player:", newPlayerError);
    throw new Error("No se pudo crear el nuevo jugador");
  }

  return {
    success: true,
    playerId: newPlayer.id,
    message: "Jugador creado exitosamente",
    ...(organizerDirectory && { player: { ...newPlayerData, id: newPlayer.id }, matchedBy: null }),
  };
}
