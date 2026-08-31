'use server';

import { createClient, createClientServiceRole } from '@/utils/supabase/server';
import { getTenantBranding } from '@/config/tenant';
import { revalidatePath } from 'next/cache';
import { linkTournamentClubs } from '@/lib/services/tournaments/club-links';
import { getUser } from '@/app/api/users';
import { checkTournamentPermissions } from '@/utils/tournament-permissions';
// import { getPlayerById } from '../players/actions'; // Not used directly in the refactored parts, can be kept if used elsewhere
// import { getUserByDni } from '../users'; // Not used directly in the refactored parts, can be kept if used elsewhere
import { Zone as GeneratedZone, Couple as GeneratedCouple, Tournament, PlayerDTO, Gender } from '@/types'; 
import { generateZones } from '@/utils/bracket-generator'; 
import { generateKnockoutRounds, KnockoutPairing } from "@/utils/bracket-generator";
import { ZoneWithRankedCouples, CoupleWithStats } from "@/utils/bracket-generator"; 
import { CoupleWithStats as CoupleWithStatsType } from '@/types'; 
import { MatchPoints, PlayerScore, TournamentPointsCalculation, MatchPointsCouple } from '@/types';
import { createApiResponse } from '@/utils/serialization';
import { markEliminatedCouples } from '@/utils/bracket-seeding-algorithm';
import {
  areCategoriesConsecutive,
  categorizePlayerForTournament,
  fetchOrderedCategories,
  parseTournamentCategoryConfig,
  resolveInitialPlayerProfile,
  resolvePersistedTournamentCategoryName,
  type TournamentCategoryConfig,
} from '@/lib/services/tournament-category-config';
import { normalizePlayerDni } from '@/lib/utils/player-dni';
import { findExistingPlayerByIdentity } from '@/lib/utils/player-identity';
import { ensureLongTournamentGeneralZone } from '@/lib/services/tournaments/long-general-zone';
import {
  ensureCanonicalZoneMembership,
  removeTournamentCoupleMembership,
} from '@/lib/services/tournament-zone-membership';
import { MAX_TOURNAMENT_PRICE } from '@/lib/constants/tournaments';
import { syncTournamentCapacityRegistrationLock } from '@/lib/services/tournament-capacity.service';
import {
  getTournamentInscriptionPendingState,
  shouldRequireInscriptionValidation,
} from '@/lib/services/registration/inscription-validation';
import { buildTournamentSlugBase, makeUniqueTournamentSlug } from '@/lib/tournaments/seo-slug';


// Sistema unificado de puntos para TODO el torneo
const POINTS_FOR_WINNING_MATCH = 16;
const POINTS_FOR_LOSING_MATCH = -12; // RESTA 12 puntos
const BONUS_POINTS_WINNER = 40;
const BONUS_POINTS_FINALIST = 20;


// --- INTERFACES ---
interface UpdateMatchResultParams {
  matchId: string;
  result_couple1: string;
  result_couple2: string;
  winner_id: string;
}

interface GenericMatchInsertData {
  tournament_id: string;
  couple1_id: string | null; // <-- Changed to allow null
  couple2_id: string | null;
  round: string;
  status: string;
  zone_id?: string | null;
  order?: number | null;
  winner_id?: string | null; 
}

interface ClientZone extends Omit<GeneratedZone, 'id' | 'created_at' | 'couples'> {
  couples: { id: string }[]; 
}

// Interface for the data coming from the creation form
interface CreateTournamentData {
  name: string;
  description: string | null;
  category_name: string;
  category_config?: TournamentCategoryConfig | null;
  type: 'LONG' | 'AMERICAN';
  gender: 'MALE' | 'FEMALE' | 'MIXED';
  start_date: string | null; // ISO string
  end_date: string | null; // ISO string
  max_participants: number | null;
  price: number | null;
  award: string | null;
  format_config?: any;
}

// Interface for couple with extended stats used in sorting (extends the imported CoupleWithStats)
interface CoupleWithExtendedStats extends Omit<CoupleWithStats, 'stats'> {
  stats?: {
    points?: number;
    scored?: number;
    conceded?: number;
    played?: number;
    won?: number;
    lost?: number;
  };
  player1_name?: string;
  player2_name?: string;
  [key: string]: any; // Allow additional properties
}

// Interface for match data used in head-to-head calculation
interface MatchForHeadToHead {
  couple1_id: string;
  couple2_id: string;
  winner_id: string | null;
  status: string;
}


// Define un tipo para los datos del snapshot de cada jugador
type PlayerSnapshotData = {
  score: number;
  category: string;
  playerName: string;
};

// Define el tipo para el Map que contendrá los snapshots de los jugadores
type PlayerSnapshotMap = Map<string, PlayerSnapshotData>;

// --- HELPER FUNCTIONS (defined once, correctly placed) ---

/**
 * Determines the head-to-head result between two couples based on their direct match
 * @param couple1Id - ID of the first couple
 * @param couple2Id - ID of the second couple  
 * @param matches - Array of matches to search for direct confrontation
 * @returns -1 if couple1 won, 1 if couple2 won, 0 if no direct match or tie
 */
function getHeadToHeadResult(
  couple1Id: string, 
  couple2Id: string, 
  matches: MatchForHeadToHead[]
): number {
  const directMatch = matches.find(m => 
    m.status === 'FINISHED' && (
      (m.couple1_id === couple1Id && m.couple2_id === couple2Id) ||
      (m.couple1_id === couple2Id && m.couple2_id === couple1Id)
    )
  );
  
  if (directMatch && directMatch.winner_id) {
    if (directMatch.winner_id === couple1Id) return -1; // couple1 won (should be sorted first)
    if (directMatch.winner_id === couple2Id) return 1;  // couple2 won (should be sorted first)
  }
  
  return 0; // No direct match found or no winner determined
}

/**
 * Unified sorting function for couples in a zone based on tournament criteria.
 * 
 * Sorting criteria (in order of priority):
 * 1. Points: Higher points = better position
 * 2. Set difference: Higher (scored - conceded) = better position  
 * 3. Sets scored: Higher sets scored = better position
 * 4. Head-to-head: Winner of direct match between tied couples
 * 5. Couple ID: Lexicographical order for stable, consistent sorting
 * 
 * @param couples - Array of couples with their statistics
 * @param matches - Array of zone matches for head-to-head calculation (optional)
 * @returns Sorted array of couples (best to worst)
 * 
 * @example
 * ```typescript
 * const sortedCouples = sortCouplesInZone(
 *   [coupleA, coupleB, coupleC],
 *   zoneMatches
 * );
 * // Returns couples ordered by tournament ranking criteria
 * ```
 */
function sortCouplesInZone(
  couples: CoupleWithExtendedStats[], 
  matches: MatchForHeadToHead[] = []
): CoupleWithExtendedStats[] {
  return [...couples].sort((a, b) => {
    // 1st: Points (higher = better)
    const pointsA = a.stats?.points || 0;
    const pointsB = b.stats?.points || 0;
    if (pointsB !== pointsA) return pointsB - pointsA;
    
    // 2nd: Set difference (higher = better) 
    const diffA = (a.stats?.scored || 0) - (a.stats?.conceded || 0);
    const diffB = (b.stats?.scored || 0) - (b.stats?.conceded || 0);
    if (diffB !== diffA) return diffB - diffA;
    
    // 3rd: Sets scored (higher = better)
    const scoredA = a.stats?.scored || 0;
    const scoredB = b.stats?.scored || 0;
    if (scoredB !== scoredA) return scoredB - scoredA;
    
    // 4th: Head-to-head result (if they played against each other)
    if (matches.length > 0) {
      const headToHead = getHeadToHeadResult(a.id, b.id, matches);
      if (headToHead !== 0) return headToHead;
    }
    
    // 5th: Couple ID for stable sort (lexicographically smaller = better for consistency)
    return a.id.localeCompare(b.id);
  });
}


async function _createMatch(
  supabase: any,
  matchData: GenericMatchInsertData
): Promise<{ success: boolean; match?: any; error?: string }> {
  const { data, error } = await supabase
    .from('matches')
    .insert(matchData)
    .select()
    .single();
  if (error) {
    console.error('[_createMatch] Error inserting match:', error, 'MatchData:', matchData);
    return { success: false, error: `Failed to insert match: ${error.message}` };
  }
  return { success: true, match: data };
}

async function _updatePlayerScore(playerId: string, pointsToAdd: number, supabase: any) {
  if (!playerId) return;
  // Allow pointsToAdd to be 0 for the case where a losing player loses points but net change is 0.
  // Or if pointsToAdd is exactly 0 for some other reason.

  try {
    const { data: player, error: fetchError } = await supabase
      .from('players')
      .select('score')
      .eq('id', playerId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') { 
        console.warn(`[_updatePlayerScore] Player ${playerId} not found. Cannot update score.`);
      } else {
        console.error(`[_updatePlayerScore] Error fetching player ${playerId}:`, fetchError.message);
      }
      return; 
    }
    
    if (!player) {
        console.warn(`[_updatePlayerScore] Player ${playerId} data is null/undefined after fetch. Cannot update score.`);
        return;
    }

    const currentScore = player.score || 0;
    const newScore = currentScore + pointsToAdd;

    const { error: updateError } = await supabase
      .from('players')
      .update({ score: newScore })
      .eq('id', playerId);

    if (updateError) {
      console.error(`[_updatePlayerScore] Error updating score for player ${playerId} from ${currentScore} to ${newScore}:`, updateError.message);
    } else {
      console.log(`[_updatePlayerScore] Player ${playerId} score updated from ${currentScore} to ${newScore} (added ${pointsToAdd}).`);
    }
  } catch (e: any) {
    console.error(`[_updatePlayerScore] Unexpected error during score update for player ${playerId}:`, e.message);
  }
}

// Función para verificar si un jugador debe ser recategorizado basado en su puntaje
async function recategorizePlayerIfNeeded(playerId: string, supabase: any) {
  console.log(`[recategorizePlayerIfNeeded] Verificando recategorización para jugador ${playerId}`);
  
  try {
    // Obtener información actual del jugador
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, score, category_name, is_categorized')
      .eq('id', playerId)
      .single();

    if (playerError || !player) {
      console.error(`[recategorizePlayerIfNeeded] Error obteniendo jugador ${playerId}:`, playerError?.message);
      return { success: false, message: "Error al obtener información del jugador" };
    }

    // Si el jugador no está categorizado, no hacer nada
    if (!player.is_categorized || !player.category_name) {
      console.log(`[recategorizePlayerIfNeeded] Jugador ${playerId} no está categorizado, saltando recategorización`);
      return { success: true, message: "Jugador no categorizado", skipped: true };
    }

    // Obtener todas las categorías en una sola consulta
    const { data: allCategories, error: categoriesError } = await supabase
      .from('categories')
      .select('name, lower_range, upper_range')
      .order('lower_range', { ascending: true });

    if (categoriesError || !allCategories) {
      console.error(`[recategorizePlayerIfNeeded] Error obteniendo categorías:`, categoriesError?.message);
      return { success: false, message: "Error al obtener información de las categorías" };
    }

    // Encontrar la categoría actual del jugador
    const currentCategory = allCategories.find((cat: any) => cat.name === player.category_name);
    if (!currentCategory) {
      console.error(`[recategorizePlayerIfNeeded] Categoría ${player.category_name} no encontrada`);
      return { success: false, message: "Categoría actual no encontrada" };
    }

    // Verificar si el jugador está dentro del rango de su categoría actual
    const isWithinRange = player.score >= currentCategory.lower_range && 
                         (currentCategory.upper_range === null || player.score <= currentCategory.upper_range);

    if (isWithinRange) {
      console.log(`[recategorizePlayerIfNeeded] Jugador ${playerId} (${player.score} pts) está dentro del rango de ${currentCategory.name} (${currentCategory.lower_range}-${currentCategory.upper_range || 'sin límite'}), no necesita recategorización`);
      return { success: true, message: "Jugador dentro del rango de su categoría", noChange: true };
    }

    // Determinar si necesita subir o bajar de categoría
    const needsUpgrade = currentCategory.upper_range !== null && player.score > currentCategory.upper_range;
    const needsDowngrade = player.score < currentCategory.lower_range;

    let nextCategory = null;
    let recategorizationType = '';

    if (needsUpgrade) {
      console.log(`[recategorizePlayerIfNeeded] Jugador ${playerId} (${player.score} pts) superó el rango superior de ${currentCategory.name} (${currentCategory.upper_range}), buscando categoría superior...`);
      recategorizationType = 'upgrade';
      
      // Buscar hacia arriba en las categorías (mayor lower_range)
      const currentCategoryIndex = allCategories.findIndex((cat: any) => cat.name === currentCategory.name);
      for (let i = currentCategoryIndex + 1; i < allCategories.length; i++) {
        const candidateCategory = allCategories[i];
        if (player.score >= candidateCategory.lower_range && 
            (candidateCategory.upper_range === null || player.score <= candidateCategory.upper_range)) {
          nextCategory = candidateCategory;
          break;
        }
      }
    } else if (needsDowngrade) {
      console.log(`[recategorizePlayerIfNeeded] Jugador ${playerId} (${player.score} pts) está por debajo del rango inferior de ${currentCategory.name} (${currentCategory.lower_range}), buscando categoría inferior...`);
      recategorizationType = 'downgrade';
      
      // Buscar hacia abajo en las categorías (menor lower_range)
      const currentCategoryIndex = allCategories.findIndex((cat: any) => cat.name === currentCategory.name);
      for (let i = currentCategoryIndex - 1; i >= 0; i--) {
        const candidateCategory = allCategories[i];
        if (player.score >= candidateCategory.lower_range && 
            (candidateCategory.upper_range === null || player.score <= candidateCategory.upper_range)) {
          nextCategory = candidateCategory;
          break;
        }
      }
    }

    if (!nextCategory) {
      const typeMessage = recategorizationType === 'upgrade' ? 'superior' : 'apropiada';
      console.log(`[recategorizePlayerIfNeeded] No hay categoría ${typeMessage} disponible para jugador ${playerId} con ${player.score} puntos`);
      return { success: true, message: `No hay categoría ${typeMessage} disponible`, noChange: true };
    }

    // Actualizar jugador a la nueva categoría
    const { error: updateError } = await supabase
      .from('players')
      .update({
        category_name: nextCategory.name
      })
      .eq('id', playerId);

    if (updateError) {
      console.error(`[recategorizePlayerIfNeeded] Error actualizando jugador ${playerId}:`, updateError);
      return { success: false, message: "Error al actualizar la categoría del jugador" };
    }

    const actionWord = recategorizationType === 'upgrade' ? 'ascendido' : 'descendido';
    console.log(`[recategorizePlayerIfNeeded] Jugador ${playerId} ${actionWord} de ${currentCategory.name} a ${nextCategory.name} (${player.score} puntos)`);
    return { 
      success: true, 
      message: "Jugador recategorizado exitosamente",
      oldCategory: currentCategory.name,
      newCategory: nextCategory.name,
      playerScore: player.score,
      wasRecategorized: true,
      recategorizationType
    };

  } catch (error) {
    console.error(`[recategorizePlayerIfNeeded] Error inesperado:`, error);
    return { success: false, message: "Error inesperado al recategorizar jugador" };
  }
}

// Función para recategorizar jugadores después de aplicar puntos
async function recategorizePlayersAfterPoints(tournamentId: string, supabase: any) {
  console.log(`[recategorizePlayersAfterPoints] Recategorizando jugadores después de aplicar puntos para torneo ${tournamentId}`);
  
  try {
    // Obtener todos los jugadores únicos que participaron en el torneo
    // Incluye tanto inscripciones individuales como jugadores de parejas
    const { data: allInscriptions, error: inscriptionsError } = await supabase
      .from('inscriptions')
      .select(`
        player_id,
        couple_id,
        couples!inscriptions_couple_id_fkey(
          player1_id,
          player2_id
        )
      `)
      .eq('tournament_id', tournamentId)
      .eq('is_pending', false);
      
    if (inscriptionsError) {
      console.error(`[recategorizePlayersAfterPoints] Error obteniendo inscripciones:`, inscriptionsError?.message);
      return;
    }
    
    if (!allInscriptions || allInscriptions.length === 0) {
      console.log(`[recategorizePlayersAfterPoints] No hay inscripciones en el torneo ${tournamentId}`);
      return;
    }
    
    // Recopilar todos los IDs de jugadores únicos
    const playerIdsSet = new Set<string>();
    
    allInscriptions.forEach((inscription: any) => {
      // Agregar jugador individual si existe
      if (inscription.player_id) {
        playerIdsSet.add(inscription.player_id);
      }
      
      // Agregar jugadores de la pareja si existe
      if (inscription.couples) {
        const couple = Array.isArray(inscription.couples) ? inscription.couples[0] : inscription.couples;
        if (couple?.player1_id) {
          playerIdsSet.add(couple.player1_id);
        }
        if (couple?.player2_id) {
          playerIdsSet.add(couple.player2_id);
        }
      }
    });
    
    const playerIds = Array.from(playerIdsSet);
    
    console.log(`[recategorizePlayersAfterPoints] Verificando recategorización para ${playerIds.length} jugadores`);
    
    // Estadísticas de recategorización
    const recategorizationStats = {
      totalPlayers: playerIds.length,
      recategorized: [] as Array<{playerId: string, oldCategory: string, newCategory: string, score: number, type: string}>,
      skipped: 0,
      noChanges: 0,
      errors: 0
    };
    
    // Verificar recategorización para cada jugador
    for (const playerId of playerIds) {
      try {
        const recategorizationResult = await recategorizePlayerIfNeeded(playerId, supabase);
        if (recategorizationResult.success) {
          if (recategorizationResult.wasRecategorized) {
            const actionIcon = recategorizationResult.recategorizationType === 'upgrade' ? '⬆️' : '⬇️';
            recategorizationStats.recategorized.push({
              playerId,
              oldCategory: recategorizationResult.oldCategory!,
              newCategory: recategorizationResult.newCategory!,
              score: recategorizationResult.playerScore!,
              type: recategorizationResult.recategorizationType || 'unknown'
            });
            console.log(`[recategorizePlayersAfterPoints] ✅ ${actionIcon} Jugador ${playerId} recategorizado de ${recategorizationResult.oldCategory} a ${recategorizationResult.newCategory} (${recategorizationResult.playerScore} pts)`);
          } else if (recategorizationResult.skipped) {
            recategorizationStats.skipped++;
            console.log(`[recategorizePlayersAfterPoints] ⏭️ Jugador ${playerId} saltado (no categorizado)`);
          } else if (recategorizationResult.noChange) {
            recategorizationStats.noChanges++;
            console.log(`[recategorizePlayersAfterPoints] ✓ Jugador ${playerId} sin cambios necesarios`);
          }
        } else {
          recategorizationStats.errors++;
          console.error(`[recategorizePlayersAfterPoints] ❌ Error recategorizando jugador ${playerId}:`, recategorizationResult.message);
        }
      } catch (error) {
        recategorizationStats.errors++;
        console.error(`[recategorizePlayersAfterPoints] ❌ Error inesperado recategorizando jugador ${playerId}:`, error);
      }
    }
    
    // Log del resumen final
    console.log(`[recategorizePlayersAfterPoints] 📊 Resumen de recategorización para torneo ${tournamentId}:`);
    console.log(`  - Total jugadores evaluados: ${recategorizationStats.totalPlayers}`);
    console.log(`  - Recategorizados: ${recategorizationStats.recategorized.length}`);
    console.log(`  - Sin cambios: ${recategorizationStats.noChanges}`);
    console.log(`  - Saltados (no categorizados): ${recategorizationStats.skipped}`);
    console.log(`  - Errores: ${recategorizationStats.errors}`);
    
    if (recategorizationStats.recategorized.length > 0) {
      console.log(`[recategorizePlayersAfterPoints] 🏆 Recategorizaciones realizadas:`);
      recategorizationStats.recategorized.forEach(rec => {
        const icon = rec.type === 'upgrade' ? '⬆️' : '⬇️';
        const action = rec.type === 'upgrade' ? 'Ascenso' : 'Descenso';
        console.log(`    - ${icon} ${action}: Jugador ${rec.playerId}: ${rec.oldCategory} → ${rec.newCategory} (${rec.score} pts)`);
      });
    }
    
    return recategorizationStats;
    
  } catch (error) {
    console.error(`[recategorizePlayersAfterPoints] Error inesperado:`, error);
    throw error;
  }
}

/**
 * Helper function to check and categorize a player if they haven't been categorized yet
 * This function assigns the minimum score for the category and marks the player as categorized
 */
export async function checkAndCategorizePlayer(
  playerId: string,
  categoryName: { category_name?: string | null; category_config?: unknown } | string,
  supabase: any,
) {
  const normalizedTournament =
    typeof categoryName === 'string'
      ? { category_name: categoryName, category_config: null }
      : categoryName;

  return categorizePlayerForTournament({
    playerId,
    supabase,
    tournament: normalizedTournament,
  });
}

// --- MAIN EXPORTED ACTIONS (existing functions adapted or kept as is if not directly affected by refactor) ---

export async function createTournamentAction(formData: CreateTournamentData & { club_id?: string; extra_club_ids?: string[] }) {
  const supabase = await createClient();

  try {
    // 1. Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[createTournamentAction] User not authenticated:', userError?.message);
      return { success: false, error: 'User not authenticated' };
    }

    // 2. Get user role and determine club_id
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    let club_id: string;
    let organization_id: string | null = null;

    if (userData?.role === 'CLUB') {
      // For CLUB users, get their owned club
      const { data: club, error: clubError } = await supabase
        .from('clubes')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (clubError || !club) {
        console.error('[createTournamentAction] Club not found for user:', clubError?.message);
        return { success: false, error: 'Club not found for the authenticated user.' };
      }
      club_id = club.id;
    } else if (userData?.role === 'ORGANIZADOR') {
      const {data: organizador, error: organizadorError} = await supabase
      .from('organization_members')
      .select('organizacion_id')
      .eq('user_id', user.id)
      .single();

      if (organizadorError || !organizador) {
        console.error('[createTournamentAction] Organizador not found for user:', organizadorError?.message);
        return { success: false, error: 'Organizador not found for the authenticated user.' };
      }

      if (!formData.club_id) {
        return { success: false, error: 'Club selection is required for organizers.' };
      }
      
      console.log('[createTournamentAction] Organizador verified, allowing tournament creation for club:', formData.club_id);
      club_id = formData.club_id;
      organization_id = organizador.organizacion_id;
    } else {
      return { success: false, error: 'Only club owners and organizers can create tournaments.' };
    }

    const categories = await fetchOrderedCategories(supabase)

    let normalizedCategoryName = formData.category_name
    if (formData.category_config) {
      if (
        formData.category_config.mode === 'RANGE' &&
        !areCategoriesConsecutive(categories, formData.category_config.categoryA, formData.category_config.categoryB)
      ) {
        return { success: false, error: 'Las categorías combinadas deben ser consecutivas.' }
      }

      normalizedCategoryName = resolvePersistedTournamentCategoryName(formData.category_config, categories)
    }

    if (formData.price !== null) {
      if (!Number.isInteger(formData.price)) {
        return { success: false, error: 'El precio debe ser un numero entero' };
      }

      if (formData.price < 0) {
        return { success: false, error: 'El precio no puede ser negativo' };
      }

      if (formData.price > MAX_TOURNAMENT_PRICE) {
        return { success: false, error: 'El precio es demasiado alto' };
      }
    }

    // 3. Prepare data for insertion (remove club_id and extra_club_ids from formData to avoid conflicts)
    const { club_id: _, extra_club_ids: __, ...cleanFormData } = formData;
    let seoSlug: string | null = null
    if (organization_id) {
      const { data: clubForSlug, error: clubForSlugError } = await supabase
        .from('clubes')
        .select('name')
        .eq('id', club_id)
        .maybeSingle()

      if (clubForSlugError) {
        console.warn('[createTournamentAction] Could not load club for SEO slug:', clubForSlugError.message)
      }

      const baseSlug = buildTournamentSlugBase({
        name: formData.name,
        type: formData.type,
        gender: formData.gender,
        categoryName: normalizedCategoryName,
        categoryConfig: formData.category_config ?? null,
        clubName: clubForSlug?.name ?? null,
        startDate: formData.start_date,
      })

      if (baseSlug) {
        const [{ data: existingSlugs, error: existingSlugsError }, { data: aliasSlugs, error: aliasSlugsError }] = await Promise.all([
          supabase
            .from('tournaments')
            .select('seo_slug')
            .eq('organization_id', organization_id)
            .not('seo_slug', 'is', null),
          supabase
            .from('tournament_seo_slug_aliases')
            .select('seo_slug')
            .eq('organization_id', organization_id),
        ])

        if (existingSlugsError || aliasSlugsError) {
          console.warn('[createTournamentAction] Could not check SEO slug collisions:', (existingSlugsError || aliasSlugsError)?.message)
        } else {
          const takenSlugs = new Set([
            ...(existingSlugs || []).map((tournament) => tournament.seo_slug),
            ...(aliasSlugs || []).map((alias) => alias.seo_slug),
          ].filter(Boolean))
          seoSlug = makeUniqueTournamentSlug(baseSlug, (slug) => takenSlugs.has(slug))
        }
      }
    }

    const tournamentToInsert = {
      ...cleanFormData,
      category_name: normalizedCategoryName,
      seo_slug: seoSlug,
      club_id: club_id,
      status: 'NOT_STARTED', // Default status
      uses_new_system: true, // Nuevos torneos usan el sistema nuevo por defecto
      organization_id: organization_id,
      // TPE registrations stay available, but its roster starts private.
      show_public_inscriptions: getTenantBranding().key !== 'padel-elite',
      // Ensure date fields are correctly formatted if they come as strings
      start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null,
      end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
      // max_participants is already number | null from formData type and client-side conversion
      // max_participants: formData.max_participants === '' ? null : Number(formData.max_participants)
    };

    // 4. Insert tournament
    const { data: newTournament, error: insertError } = await supabase
      .from('tournaments')
      .insert(tournamentToInsert)
      .select()
      .single();

    if (insertError) {
      console.error('[createTournamentAction] Error inserting tournament:', insertError);
      return { success: false, error: `Failed to create tournament: ${insertError.message}` };
    }

    if (!newTournament) {
        return { success: false, error: 'Tournament created but no data returned.'} 
    }

    if (newTournament.type === 'LONG') {
      const zoneEnsureResult = await ensureLongTournamentGeneralZone(newTournament.id)

      if (!zoneEnsureResult.success) {
        console.error('[createTournamentAction] Failed to ensure LONG general zone:', {
          tournamentId: newTournament.id,
          zoneEnsureResult,
        })

        try {
          const serviceSupabase = await createClientServiceRole()

          await serviceSupabase
            .from('zones')
            .delete()
            .eq('tournament_id', newTournament.id)

          const { error: rollbackTournamentError } = await serviceSupabase
            .from('tournaments')
            .delete()
            .eq('id', newTournament.id)

          if (rollbackTournamentError) {
            console.error('[createTournamentAction] Error rolling back tournament after zone failure:', rollbackTournamentError)
          } else {
            console.warn('[createTournamentAction] Tournament rolled back after LONG zone setup failure:', newTournament.id)
          }
        } catch (rollbackError) {
          console.error('[createTournamentAction] Unexpected rollback error after zone failure:', rollbackError)
        }

        return {
          success: false,
          error: zoneEnsureResult.error || 'No se pudo completar la creación del torneo LONG.',
        }
      }

      console.log('[createTournamentAction] LONG general zone ensured:', {
        tournamentId: newTournament.id,
        zoneId: zoneEnsureResult.zoneId,
        created: zoneEnsureResult.created,
      })
    }

    // 5. Revalidate paths
    revalidatePath('/my-tournaments');
    revalidatePath(`/my-tournaments/${newTournament.id}`); // For potential direct navigation or future use
    revalidatePath('/torneos');
    revalidatePath('/tournaments'); // Legacy redirect
    revalidatePath(`/tournaments/${newTournament.id}`); // Public detail page
    if (seoSlug) revalidatePath(`/torneos/${seoSlug}`)

    console.log('[createTournamentAction] Tournament created successfully:', newTournament);

    // NEW: Link tournament to clubes via reusable util
    try {
      const allClubIds = Array.from(new Set([
        club_id,
        ...((formData.extra_club_ids || []).filter((id) => !!id && id !== club_id)),
      ]))
      if (allClubIds.length > 0) {
        const linkResult = await linkTournamentClubs({ supabase, userId: user.id, tournamentId: newTournament.id, clubIds: allClubIds })
        if (!linkResult.success) {
          console.warn('[createTournamentAction] clubes_tournament link warning:', linkResult.message)
        }
      }
    } catch (linkErr: any) {
      console.warn('[createTournamentAction] Failed to link clubes_tournament (non-fatal):', linkErr?.message || linkErr)
    }
    
    // 🚀 NEW: Create automatic zone for LONG tournaments
    if (false && newTournament.type === 'LONG') {
      try {
        console.log('[createTournamentAction] Creating automatic zone for LONG tournament');
        
        const { data: zone, error: zoneError } = await supabase
          .from('zones')
          .insert({
            tournament_id: newTournament.id,
            name: 'Zona General',
            max_couples: newTournament.max_participants || 32,
            capacity: newTournament.max_participants || 32
          })
          .select('id')
          .single() as { data: { id: string }; error: any };
        
        if (zoneError || !zone) {
          console.error('[createTournamentAction] Error creating zone:', zoneError);
          // Don't fail tournament creation, just log the error
          console.warn('[createTournamentAction] Tournament created but zone creation failed');
        } else {
          console.log(`✅ [createTournamentAction] Zone created automatically for LONG tournament: ${zone.id}`);
        }
      } catch (zoneErr) {
        console.error('[createTournamentAction] Unexpected error creating zone:', zoneErr);
        // Don't fail tournament creation
      }
    }
    
    // Convert dates to ISO strings to ensure plain object for server action boundaries
    const plainTournament = {
        ...newTournament,
        start_date: newTournament.start_date ? new Date(newTournament.start_date).toISOString() : null,
        end_date: newTournament.end_date ? new Date(newTournament.end_date).toISOString() : null,
        created_at: newTournament.created_at ? new Date(newTournament.created_at).toISOString() : null,
      };

    return { success: true, tournament: plainTournament };

  } catch (e: any) {
    console.error('[createTournamentAction] Unexpected error:', e);
    return { success: false, error: `An unexpected error occurred: ${e.message}` };
  }
}

type DuplicateTournamentDraft = {
  id: string;
  name: string;
  description: string | null;
  category_name: string;
  category_config: TournamentCategoryConfig | null;
  type: 'LONG' | 'AMERICAN';
  gender: 'MALE' | 'FEMALE' | 'MIXED';
  start_date: string | null;
  end_date: string | null;
  max_participants: number | null;
  club_id: string | null;
  extra_club_ids: string[];
  price: number | null;
  award: string | null;
  format_config: unknown;
};

type DuplicateTournamentClub = {
  id: string;
  name: string;
};

type DuplicateTournamentData = CreateTournamentData & {
  source_tournament_id: string;
  club_id?: string;
  extra_club_ids?: string[];
};

export async function getTournamentDuplicateDraft(tournamentId: string): Promise<{
  success: boolean;
  tournament?: DuplicateTournamentDraft;
  categories?: Array<{ name: string; lower_range: number; upper_range: number | null }>;
  clubs?: DuplicateTournamentClub[];
  defaultClubId?: string | null;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    console.log('[getTournamentDuplicateDraft] Loading duplicate draft:', tournamentId);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.warn('[getTournamentDuplicateDraft] User not authenticated:', userError?.message);
      return { success: false, error: 'No autenticado' };
    }

    const permissions = await checkTournamentPermissions(user.id, tournamentId);
    if (!permissions.hasPermission) {
      console.warn('[getTournamentDuplicateDraft] Permission denied:', permissions.reason);
      return { success: false, error: permissions.reason || 'No tienes permisos para duplicar este torneo' };
    }

    const { data: userData, error: userRoleError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userRoleError || !userData) {
      console.error('[getTournamentDuplicateDraft] Error fetching user role:', userRoleError);
      return { success: false, error: 'No se pudo determinar tu rol de usuario' };
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select(`
        id,
        name,
        description,
        category_name,
        category_config,
        type,
        gender,
        start_date,
        end_date,
        max_participants,
        club_id,
        price,
        award,
        format_config
      `)
      .eq('id', tournamentId)
      .single();

    if (tournamentError || !tournament) {
      console.error('[getTournamentDuplicateDraft] Error fetching tournament:', tournamentError);
      return { success: false, error: 'No se pudo cargar el torneo original' };
    }

    if (tournament.type !== 'LONG' && tournament.type !== 'AMERICAN') {
      return { success: false, error: 'Solo se pueden duplicar torneos LONG o AMERICAN' };
    }

    const { data: linkedClubs, error: linkedClubsError } = await supabase
      .from('clubes_tournament')
      .select('club_id')
      .eq('tournament_id', tournamentId);

    if (linkedClubsError) {
      console.warn('[getTournamentDuplicateDraft] Could not fetch linked clubs:', linkedClubsError.message);
    }

    const linkedClubIds = (linkedClubs || [])
      .map((club: any) => club.club_id)
      .filter(Boolean);
    const mainClubId = tournament.club_id ?? null;
    const extraClubIds = Array.from(new Set(linkedClubIds.filter((clubId) => clubId !== mainClubId)));
    const categoryConfig = parseTournamentCategoryConfig(tournament.category_config);
    const categories = await fetchOrderedCategories(supabase);
    let clubs: DuplicateTournamentClub[] = [];
    let defaultClubId: string | null = null;

    if (userData.role === 'CLUB') {
      const { data: club, error: clubError } = await supabase
        .from('clubes')
        .select('id, name')
        .eq('user_id', user.id)
        .single();

      if (clubError || !club) {
        console.error('[getTournamentDuplicateDraft] Error fetching user club:', clubError);
        return { success: false, error: 'No se pudo cargar la sede del usuario' };
      }

      clubs = [{ id: club.id, name: club.name }];
      defaultClubId = club.id;
    } else if (userData.role === 'ORGANIZADOR') {
      const { data: orgMembers, error: orgMemberError } = await supabase
        .from('organization_members')
        .select('organizacion_id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (orgMemberError) {
        console.error('[getTournamentDuplicateDraft] Error fetching organization memberships:', orgMemberError);
        return { success: false, error: 'No se pudieron cargar tus organizaciones' };
      }

      const organizationIds = (orgMembers || []).map((member: any) => member.organizacion_id).filter(Boolean);

      if (organizationIds.length > 0) {
        const { data: organizationClubs, error: organizationClubsError } = await supabase
          .from('organization_clubs')
          .select(`
            club_id,
            clubes!inner(
              id,
              name
            )
          `)
          .in('organizacion_id', organizationIds);

        if (organizationClubsError) {
          console.error('[getTournamentDuplicateDraft] Error fetching organization clubs:', organizationClubsError);
          return { success: false, error: 'No se pudieron cargar tus sedes' };
        }

        clubs = (organizationClubs || []).map((organizationClub: any) => ({
          id: organizationClub.clubes.id,
          name: organizationClub.clubes.name,
        }));
      }
    }

    const uniqueClubs = Array.from(new Map(clubs.map((club) => [club.id, club])).values());
    console.log('[getTournamentDuplicateDraft] Draft ready:', {
      tournamentId,
      categories: categories.length,
      clubs: uniqueClubs.length,
    });

    return {
      success: true,
      tournament: {
        id: tournament.id,
        name: tournament.name || '',
        description: tournament.description ?? null,
        category_name: tournament.category_name || '',
        category_config: categoryConfig,
        type: tournament.type,
        gender: tournament.gender || 'MALE',
        start_date: tournament.start_date ? new Date(tournament.start_date).toISOString() : null,
        end_date: tournament.end_date ? new Date(tournament.end_date).toISOString() : null,
        max_participants: tournament.max_participants ?? null,
        club_id: mainClubId,
        extra_club_ids: extraClubIds,
        price: tournament.price ?? null,
        award: tournament.award ?? null,
        format_config: tournament.format_config ?? {},
      },
      categories,
      clubs: uniqueClubs,
      defaultClubId,
    };
  } catch (error: any) {
    console.error('[getTournamentDuplicateDraft] Unexpected error:', error);
    return { success: false, error: error.message || 'Error inesperado al cargar el torneo' };
  }
}

export async function duplicateTournamentAction(formData: DuplicateTournamentData) {
  const supabase = await createClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'No autenticado' };
    }

    const permissions = await checkTournamentPermissions(user.id, formData.source_tournament_id);
    if (!permissions.hasPermission) {
      return { success: false, error: permissions.reason || 'No tienes permisos para duplicar este torneo' };
    }

    const { source_tournament_id: _, ...createData } = formData;
    const result = await createTournamentAction(createData);

    if (result.success && result.tournament?.id) {
      revalidatePath('/my-tournaments');
    }

    return result;
  } catch (error: any) {
    console.error('[duplicateTournamentAction] Unexpected error:', error);
    return { success: false, error: error.message || 'Error inesperado al duplicar el torneo' };
  }
}

export async function getTournamentById(tournamentId: string) {
  if (!tournamentId) {
    console.warn("[getTournamentById] No tournamentId provided");
    return null;
  }
  const supabase = await createClient();
  const { data: rawTournament, error } = await supabase
    .from('tournaments')
    .select(`
      *, 
      clubes(id, name, address, cover_image_url, phone, phone2, email, courts), 
      categories(name)
    `)
    .eq('id', tournamentId)
    .single();
    
  if (error) {
    console.error(`[getTournamentById] Error fetching tournament details for ID ${tournamentId}:`, error.message);
    return null;
  }
  if (!rawTournament) return null;

  // Ensure completely serializable object with proper date handling
  const plainTournament = {
    ...rawTournament,
    start_date: rawTournament.start_date ? new Date(rawTournament.start_date).toISOString() : null,
    end_date: rawTournament.end_date ? new Date(rawTournament.end_date).toISOString() : null,
    created_at: rawTournament.created_at ? new Date(rawTournament.created_at).toISOString() : null,
    // Ensure nested objects are also serializable
    clubes: rawTournament.clubes ? JSON.parse(JSON.stringify(rawTournament.clubes)) : null,
    categories: rawTournament.categories ? JSON.parse(JSON.stringify(rawTournament.categories)) : null,
  };
  
  // Use utility function for consistent serialization
  return createApiResponse(plainTournament);
}

export async function getMatchesByTournamentId(
  tournamentId: string,
  options: { bracketKey?: string | null } = {}
) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('matches')
    .select(`
      *,
      couple1:couple1_id (
        id,
        player1_id,
        player2_id,
        player1:player1_id (
          id,
          first_name,
          last_name
        ),
        player2:player2_id (
          id,
          first_name,
          last_name
        )
      ),
      couple2:couple2_id (
        id,
        player1_id,
        player2_id,
        player1:player1_id (
          id,
          first_name,
          last_name
        ),
        player2:player2_id (
          id,
          first_name,
          last_name
        )
      ),
      seed1:tournament_couple_seed1_id (
        id,
        couple_id,
        seed,
        bracket_position,
        placeholder_label,
        placeholder_zone_id,
        placeholder_position,
        is_placeholder,
        created_as_placeholder,
        placeholder_zone:placeholder_zone_id (
          id,
          name
        )
      ),
      seed2:tournament_couple_seed2_id (
        id,
        couple_id,
        seed,
        bracket_position,
        placeholder_label,
        placeholder_zone_id,
        placeholder_position,
        is_placeholder,
        created_as_placeholder,
        placeholder_zone:placeholder_zone_id (
          id,
          name
        )
      ),
      fecha_matches!left (
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        court_assignment,
        notes
      )
    `)
    .eq('tournament_id', tournamentId)
    .order('round', { ascending: false })
    .order('order_in_round', { ascending: true });

  if (error) throw error;

  // Procesar matches para incluir nombres de jugadores y datos de scheduling
  if (data) {
    const bracketKey = options.bracketKey
    const sourceMatches =
      bracketKey && bracketKey !== 'ALL'
        ? data.filter((match: any) => match.type !== 'ELIMINATION' || match.bracket_key === bracketKey)
        : data

    //console.log('🔍 [getMatchesByTournamentId] Total matches fetched:', data.length);
    /*console.log('🔍 [getMatchesByTournamentId] Sample match with fecha_matches:', {
      matchId: data[0]?.id,
      round: data[0]?.round,
      fecha_matches: data[0]?.fecha_matches,
      fecha_matches_type: typeof data[0]?.fecha_matches,
      fecha_matches_isArray: Array.isArray(data[0]?.fecha_matches)
    }
  );*/

    return sourceMatches.map((match, index) => {
      // Helper para obtener nombres
      const getPlayerName = (player: any) => {
        if (!player?.first_name || !player?.last_name) return '';
        return `${player.first_name} ${player.last_name}`.trim();
      };

      // Procesar scheduling data de fecha_matches
      const fechaMatch = Array.isArray(match.fecha_matches) ? match.fecha_matches[0] : match.fecha_matches;

      // DEBUG: Log para primer match con scheduling data
      /*if (index === 0 || fechaMatch) {
        console.log(`🔍 [getMatchesByTournamentId] Match ${match.id} scheduling:`, {
          matchId: match.id,
          round: match.round,
          hasFechaMatches: !!match.fecha_matches,
          fechaMatch: fechaMatch,
          fechaMatchKeys: fechaMatch ? Object.keys(fechaMatch) : null
        });
      }*/

      const schedulingData = fechaMatch ? {
        scheduled_date: fechaMatch.scheduled_date,
        scheduled_start_time: fechaMatch.scheduled_start_time,
        scheduled_end_time: fechaMatch.scheduled_end_time,
        // Crear scheduled_time combinando date y start_time
        scheduled_time: fechaMatch.scheduled_date && fechaMatch.scheduled_start_time
          ? `${fechaMatch.scheduled_date}T${fechaMatch.scheduled_start_time}`
          : null,
        court: fechaMatch.court_assignment,
        notes: fechaMatch.notes
      } : null;

      /*if (schedulingData) {
        console.log(`✅ [getMatchesByTournamentId] Match ${match.id} has scheduling data:`, schedulingData);
      }*/

      const seed1IsPlaceholder = Boolean(match.seed1?.is_placeholder);
      const seed2IsPlaceholder = Boolean(match.seed2?.is_placeholder);

      // Agregar nombres de jugadores procesados
      const processedMatch = {
        ...match,
        // Nombres procesados para couple1
        couple1_player1_name: match.couple1?.player1 ? getPlayerName(match.couple1.player1) : null,
        couple1_player2_name: match.couple1?.player2 ? getPlayerName(match.couple1.player2) : null,
        // Nombres procesados para couple2
        couple2_player1_name: match.couple2?.player1 ? getPlayerName(match.couple2.player1) : null,
        couple2_player2_name: match.couple2?.player2 ? getPlayerName(match.couple2.player2) : null,
        // Campos de placeholder
        couple1_placeholder_label: seed1IsPlaceholder ? match.seed1?.placeholder_label || null : null,
        couple1_is_placeholder: seed1IsPlaceholder,
        couple1_placeholder_zone_id: seed1IsPlaceholder ? match.seed1?.placeholder_zone_id || null : null,
        couple1_placeholder_position: seed1IsPlaceholder ? match.seed1?.placeholder_position || null : null,
        couple1_placeholder_zone_name: seed1IsPlaceholder && Array.isArray(match.seed1?.placeholder_zone)
          ? match.seed1?.placeholder_zone[0]?.name || null
          : seed1IsPlaceholder ? match.seed1?.placeholder_zone?.name || null : null,
        couple2_placeholder_label: seed2IsPlaceholder ? match.seed2?.placeholder_label || null : null,
        couple2_is_placeholder: seed2IsPlaceholder,
        couple2_placeholder_zone_id: seed2IsPlaceholder ? match.seed2?.placeholder_zone_id || null : null,
        couple2_placeholder_position: seed2IsPlaceholder ? match.seed2?.placeholder_position || null : null,
        couple2_placeholder_zone_name: seed2IsPlaceholder && Array.isArray(match.seed2?.placeholder_zone)
          ? match.seed2?.placeholder_zone[0]?.name || null
          : seed2IsPlaceholder ? match.seed2?.placeholder_zone?.name || null : null,
        // Agregar datos de scheduling
        scheduling: schedulingData
      };

      return processedMatch;
    });
  }

  return data;
}

/**
 * 🎾 REGISTRO DE JUGADOR NUEVO (USANDO STRATEGY PATTERN)
 * 
 * Función principal refactorizada para usar el sistema Strategy Pattern.
 * Mantiene backward compatibility con la signatura original.
 */
export async function registerNewPlayerForTournament(
  tournamentId: string,
  firstName: string,
  lastName: string,
  phone: string,
  dni: string | null,
  playerGender: Gender,
  forceCreateNew = false,
): Promise<{ success: boolean; message?: string; playerId?: string; inscription?: any }> {
  console.log(`[registerNewPlayerForTournament] 🔄 Refactorizado con Strategy Pattern - jugador: ${firstName} ${lastName}`);
  
  // Usar la nueva implementación V2 con Strategy Pattern
  return await registerNewPlayerForTournamentV2(tournamentId, firstName, lastName, phone, dni, playerGender, forceCreateNew);
}

// Función auxiliar para registrar jugador existente
async function registerExistingPlayer(tournamentId: string, playerId: string, supabase: any): Promise<{ success: boolean; playerId?: string; inscription?: any }> {
  const { data, error } = await supabase
    .from('inscriptions')
    .insert({ tournament_id: tournamentId, player_id: playerId })
    .select()
    .single();

  if (error) {
    throw new Error(`No se pudo inscribir al jugador: ${error.message}`);
  }

  return {
    success: true,
    playerId,
    inscription: data
  };
}

/**
 * 🎾 REGISTRO DE PAREJA (USANDO STRATEGY PATTERN)
 * 
 * Función principal refactorizada para usar el sistema Strategy Pattern.
 * Mantiene backward compatibility con la signatura original.
 * 
 * @param tournamentId - ID del torneo
 * @param player1Id - ID del primer jugador  
 * @param player2Id - ID del segundo jugador
 * @returns Resultado del registro con datos de inscripción
 */
export async function registerCoupleForTournament(
  tournamentId: string, 
  player1Id: string, 
  player2Id: string,
  isOrganizerRegistration: boolean = false,
  termsAccepted: boolean = false,
  allowBlockedPlayerOverride: boolean = false,
): Promise<{ success: boolean; error?: string; inscription?: any }> {
  console.log(`[registerCoupleForTournament] 🔄 Refactorizado con Strategy Pattern - torneo ${tournamentId}`, { player1Id, player2Id, isOrganizerRegistration });
  
  // Usar la nueva implementación V2 con Strategy Pattern
  return await registerCoupleForTournamentV2(tournamentId, player1Id, player2Id, isOrganizerRegistration, termsAccepted, allowBlockedPlayerOverride);
}

/**
 * 🎾 REGISTRO DE JUGADOR AUTENTICADO (USANDO STRATEGY PATTERN)
 * 
 * Función principal refactorizada para usar el sistema Strategy Pattern.
 * Mantiene backward compatibility con la signatura original.
 */
export async function registerAuthenticatedPlayerForTournament(tournamentId: string, phone?: string, termsAccepted: boolean = false): Promise<{ success: boolean; message: string; inscriptionId?: string }> {
  console.log(`[registerAuthenticatedPlayerForTournament] 🔄 Refactorizado con Strategy Pattern - torneo: ${tournamentId}`);
  
  // Usar la nueva implementación V2 con Strategy Pattern
  return await registerAuthenticatedPlayerForTournamentV2(tournamentId, phone, termsAccepted);
}

export async function getTournamentDetailsWithInscriptions(tournamentId: string) {
  const supabase = await createClient();
  const tournament = await getTournamentById(tournamentId);
  if (!tournament) return { tournament: null, inscriptions: [] };
  try {
    // Incluir inscription_payments para tener datos de pago en SSR
    const { data: rawInscriptions, error: inscriptionsError } = await supabase
      .from('inscriptions')
      .select(`
        *,
        inscription_payments (
          player_id,
          has_paid,
          paid_at
        ),
        payment_proof_status,
        payment_proof_uploaded_at,
        payment_alias_snapshot,
        payment_amount_snapshot
      `)
      .eq('tournament_id', tournamentId)

    if (inscriptionsError || !rawInscriptions) return { tournament, inscriptions: [] };

    const coupleIds = rawInscriptions.filter(insc => insc.couple_id).map(insc => insc.couple_id).filter(Boolean) as string[];
    let couplesData: any[] = [];
    if (coupleIds.length > 0) {
      const { data, error } = await supabase.from('couples').select('*').in('id', coupleIds);
      if (!error && data) {
        couplesData = data.map(c => ({ 
          ...c, 
          created_at: c.created_at ? new Date(c.created_at).toISOString() : null
          // Add other date conversions for couple fields if any
        }));
      }
    }

    const playerIdsFromInscriptions = rawInscriptions.filter(insc => insc.player_id).map(insc => insc.player_id);
    const playerIdsFromCouples = couplesData.flatMap(c => [c.player1_id, c.player2_id]);
    const uniquePlayerIds = [...new Set([...playerIdsFromInscriptions, ...playerIdsFromCouples].filter(Boolean))] as string[];
    
    let playersData: any[] = [];
    if (uniquePlayerIds.length > 0) {
      const {data, error} = await supabase.from('players').select('*').in('id', uniquePlayerIds);
      if(!error && data) {
        playersData = data.map(p => ({ 
          ...p, 
          created_at: p.created_at ? new Date(p.created_at).toISOString() : null 
          // Add other date conversions for player fields if any
        }));
      }
    }
    
    const playersMap = playersData.reduce((acc, p) => { acc[p.id] = p; return acc; }, {} as {[key: string]: any});
    const couplesWithPlayers = couplesData.map(c => ({ 
      ...c, 
      player1: playersMap[c.player1_id] ? [playersMap[c.player1_id]] : [], 
      player2: playersMap[c.player2_id] ? [playersMap[c.player2_id]] : [] 
    }));
    const couplesMap = couplesWithPlayers.reduce((acc, c) => { acc[c.id] = c; return acc; }, {} as {[key: string]: any});
    
    const processedInscriptions = rawInscriptions.map(i => ({
      ...i,
      created_at: i.created_at ? new Date(i.created_at).toISOString() : null,
      player: i.player_id && playersMap[i.player_id] ? [playersMap[i.player_id]] : [],
      couple: i.couple_id && couplesMap[i.couple_id] ? [couplesMap[i.couple_id]] : [],
      // Preservar datos de pago para que estén disponibles en SSR
      inscription_payments: i.inscription_payments || [],
      payment_proof_status: i.payment_proof_status,
      payment_proof_uploaded_at: i.payment_proof_uploaded_at,
      payment_alias_snapshot: i.payment_alias_snapshot,
      payment_amount_snapshot: i.payment_amount_snapshot
    }));
    // Explicitly serialize and parse to ensure plain objects for inscriptions
    const finalInscriptions = JSON.parse(JSON.stringify(processedInscriptions));
    // Ensure the entire returned object is properly serialized
    const safeTournament = JSON.parse(JSON.stringify(tournament));
    const result = { tournament: safeTournament, inscriptions: finalInscriptions };
    return createApiResponse(result);
  } catch (error) {
    console.error("[getTournamentDetailsWithInscriptions] Error:", error);
    // Ensure even error returns are consistent if needed, though usually simpler
    const errorResult = { tournament, inscriptions: [] }; 
    return createApiResponse(errorResult);
  }
}

export async function registerPlayerForTournament(tournamentId: string, playerId: string, tournamentGender: Gender) {
  const supabase = await createClient();
  
  // First, get tournament info to determine category
  const { data: tournamentData, error: tournamentError } = await supabase
    .from('tournaments')
    .select('category_name, category_config, gender, validate_inscriptions')
    .eq('id', tournamentId)
    .single();
    
    const { data: playerData, error: playerError } = await supabase
    .from('players')
    .select('gender, category_name')
    .eq('id', playerId)
    .single();
    
  if (tournamentError) {
    console.error("[registerPlayerForTournament] Error fetching tournament:", tournamentError);
    return { success: false, message: "Error al obtener información del torneo" };
  }
  const tournamentGenderUpper = (tournamentData?.gender ?? "").toUpperCase();
  const playerGenderUpper = (playerData?.gender ?? "").toUpperCase();

  if (tournamentGenderUpper === "FEMALE" && playerGenderUpper !== "FEMALE") {
    return { success: false, message: "El torneo es para mujeres, pero el jugador no es mujer" };
  }
  // Determine category name
  const hasTournamentCategoryConfig = Boolean(tournamentData.category_name || tournamentData.category_config);

  // Check and categorize player if needed
  if (hasTournamentCategoryConfig) {
    const categorizationResult = await checkAndCategorizePlayer(playerId, tournamentData, supabase);
    
    if (!categorizationResult.success) {
      console.error("[registerPlayerForTournament] Error categorizing player:", categorizationResult.message);
      return { success: false, message: categorizationResult.message };
    }
    
    if (categorizationResult.wasCategorized) {
      console.log(`[registerPlayerForTournament] Player ${playerId} was categorized with score ${categorizationResult.newScore} for category ${categorizationResult.categoryName}`);
    }
  }
  
  const { data: existing, error: checkError } = await supabase
    .from('inscriptions')
    .select('id, is_pending') // Select is_pending
    .eq('tournament_id', tournamentId)
    .eq('player_id', playerId)
    .maybeSingle();

  if (checkError) {
      console.error("Error verificando inscripción:", checkError);
      // Return a user-friendly message or rethrow depending on desired behavior
      return { success: false, message: "Error al verificar inscripción existente." }; 
  }
  if (existing) {
      if (existing.is_pending) {
        return { success: false, message: "Jugador ya tiene una solicitud pendiente para este torneo." };
      }
      return { success: false, message: "Jugador ya inscrito." };
  }
  
  const { data, error } = await supabase
    .from('inscriptions')
    .insert({ 
      tournament_id: tournamentId, 
      player_id: playerId, 
      is_pending: shouldRequireInscriptionValidation({
        validateInscriptions: tournamentData.validate_inscriptions,
        actorRole: 'PLAYER',
      })
    })
    .select()
    .single();
  if (error) {
    console.error("[registerPlayerForTournament] Error:", error);
    // Throwing an error here might be too disruptive if called from UI directly expecting a structured response.
    // Consider returning a structured error like other functions.
    // For now, aligning with original potential to throw:
    // throw new Error("No se pudo registrar.");
    return { success: false, message: `No se pudo registrar: ${error.message}`}
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/my-tournaments/${tournamentId}`);

  try {
    const { sendTournamentMessage } = await import('@/lib/services/messages');
    await sendTournamentMessage({
      type: 'INSCRIPTION_SUBMITTED_ADMIN',
      supabase,
      inscriptionId: data.id,
    });
    await sendTournamentMessage({
      type: 'INSCRIPTION_APPROVED_PLAYER',
      supabase,
      inscriptionId: data.id,
    });
  } catch (emailError) {
    console.error('[registerPlayerForTournament] Error enviando mensajes:', emailError);
  }

  return { success: true, inscription: data };
}

export async function fetchTournamentZones(tournamentId: string) {
  const supabase = await createClient();
  try {
    const { data: zones, error: zonesError } = await supabase.from("zones").select("*").eq("tournament_id", tournamentId).order("name");
    if (zonesError || !zones) return { success: false, error: zonesError?.message || "Error obteniendo zonas" };

    const zonesWithCouples = await Promise.all(
      zones.map(async (zone) => {
        const { data: links, error: linkError } = await supabase.from("zone_couples").select("couple_id").eq("zone_id", zone.id);
        if (linkError || !links) return { ...zone, couples: [] };
        const coupleIds = links.map(l => l.couple_id);
        if (coupleIds.length === 0) return { ...zone, couples: [] };

        const { data: couples, error: cError } = await supabase.from("couples").select(`*,player1:players!couples_player1_id_fkey(id,first_name,last_name,score),player2:players!couples_player2_id_fkey(id,first_name,last_name,score)`).in("id", coupleIds);
        if (cError || !couples) return { ...zone, couples: [] };

        // Fetch all matches for this zone to use in head-to-head calculation
        const { data: zoneMatches, error: zoneMatchesError } = await supabase
          .from("matches")
          .select("couple1_id, couple2_id, winner_id, status")
          .eq("zone_id", zone.id)
          .eq("status", "FINISHED");

        const couplesWithStats = await Promise.all(
          couples.map(async (couple) => {
            const { data: matches, error: mError } = await supabase.from("matches").select("*").eq("zone_id", zone.id).or(`couple1_id.eq.${couple.id},couple2_id.eq.${couple.id}`).eq("status", "FINISHED");
            let p=0,w=0,l=0,s=0,c=0,pts=0;
            if (!mError && matches) {
              matches.forEach(m => {
                p++;
                const result1 = parseInt(m.result_couple1) || 0;
                const result2 = parseInt(m.result_couple2) || 0;
                if (m.couple1_id === couple.id) { 
                  s += result1; 
                  c += result2; 
                  if (m.winner_id === couple.id) w++; else l++; 
                }
                else { 
                  s += result2; 
                  c += result1; 
                  if (m.winner_id === couple.id) w++; else l++; 
                }
              });
              pts = w * POINTS_FOR_WINNING_MATCH + l * Math.abs(POINTS_FOR_LOSING_MATCH); // Usar valor absoluto para el cálculo de zonas
            }
            return { 
              ...couple, 
              player1_name: `${couple.player1?.first_name||""} ${couple.player1?.last_name||""}`.trim(), 
              player2_name: `${couple.player2?.first_name||""} ${couple.player2?.last_name||""}`.trim(), 
              stats: { played:p, won:w, lost:l, scored:s, conceded:c, points:pts } 
            } as CoupleWithExtendedStats;
          })
        );
        
        // Use unified sorting function with head-to-head support
        const sortedCouples = sortCouplesInZone(
          couplesWithStats, 
          zoneMatchesError ? [] : (zoneMatches || [])
        );
        return { ...zone, couples: sortedCouples };
      })
    );
    return { success: true, zones: zonesWithCouples };
  } catch (e:any) { return { success: false, error: e.message || "Error inesperado obteniendo zonas" }; }
}

export async function fetchTournamentMatches(tournamentId: string) {
  const supabase = await createClient();
  try {
    const { data: matches, error } = await supabase
      .from("matches")
      .select(`
        id,
        status,
        court,
        round,
        result_couple1,
        result_couple2,
        winner_id,
        "order",
        couple1_id,
        couple2_id,
        zone_info:zone_id(name),
        couple1:couples!matches_couple1_id_fkey(
          id,
          player1_id,
          player2_id,
          player1_details:players!couples_player1_id_fkey(id,first_name,last_name),
          player2_details:players!couples_player2_id_fkey(id,first_name,last_name)
        ),
        couple2:couples!matches_couple2_id_fkey(
          id,
          player1_id,
          player2_id,
          player1_details:players!couples_player1_id_fkey(id,first_name,last_name),
          player2_details:players!couples_player2_id_fkey(id,first_name,last_name)
        )
      `)
      .eq("tournament_id", tournamentId)
      .order("round")
      .order("order");
    
    if (error || !matches) return { success: false, error: error?.message || "Error obteniendo partidos" };
    
    const pMatches = matches.map((m: any) => {
      const zoneInfo = Array.isArray(m.zone_info) ? m.zone_info[0] : m.zone_info;
      const couple1 = Array.isArray(m.couple1) ? m.couple1[0] : m.couple1;
      const couple2 = Array.isArray(m.couple2) ? m.couple2[0] : m.couple2;

      const getName = (details: any[] | undefined) => {
        const d = Array.isArray(details) ? details[0] : details;
        return `${d?.first_name || ""} ${d?.last_name || ""}`.trim();
      };

      return {
        ...m,
        zone_name: zoneInfo?.name,
        couple1_player1_name: getName(couple1?.player1_details),
        couple1_player2_name: getName(couple1?.player2_details),
        couple2_player1_name: getName(couple2?.player1_details),
        couple2_player2_name: getName(couple2?.player2_details),
        order: m.order,
        type: m.round === 'ZONE' ? 'ZONE' : 'ELIMINATION'
      };
    });
    
    return { success: true, matches: pMatches };
  } catch (e:any) {
    return { success: false, error: e.message || "Error inesperado obteniendo partidos" };
  }
}

// --- ACTION: updateMatchResult (Refactored) ---
export async function updateMatchResult({ matchId, result_couple1, result_couple2, winner_id }: UpdateMatchResultParams) {
  const supabase = await createClient();
  try {
    console.log(`[updateMatchResult] 🎯 Actualizando resultado del match ${matchId}`);
    
    // Primero obtenemos los datos del match para determinar el ganador automáticamente si no se proporciona
    const { data: matchData, error: fetchError } = await supabase
      .from("matches")
      // Necesitamos también el ganador previo y estado para detectar cambios
      .select("couple1_id, couple2_id, tournament_id, round, type, winner_id, status")
      .eq("id", matchId)
      .single();

    if (fetchError || !matchData) {
      return { success: false, error: `Error obteniendo datos del partido: ${fetchError?.message}` };
    }

    // Guardamos el ganador previo para detectar cambios tras la actualización
    const prevWinnerId = matchData.winner_id as string | null;

    // Determinar el ganador automáticamente basándose en los resultados si no se proporciona
    let finalWinnerId = winner_id;
    if (!winner_id && result_couple1 && result_couple2) {
      const score1 = parseInt(result_couple1);
      const score2 = parseInt(result_couple2);
      
      if (!isNaN(score1) && !isNaN(score2)) {
        if (score1 > score2) {
          finalWinnerId = matchData.couple1_id;
        } else if (score2 > score1) {
          finalWinnerId = matchData.couple2_id;
        }
        // Si es empate, no asignamos ganador automáticamente
      }
    }

    // Actualizar el match con el resultado
    const { error: updateError } = await supabase.from("matches").update({ 
      result_couple1, 
      result_couple2, 
      winner_id: finalWinnerId, 
      status: "FINISHED" 
    }).eq("id", matchId);
    
    if (updateError) return { success: false, error: `Error actualizando resultado: ${updateError.message}` };

    console.log(`[updateMatchResult] ✅ Match actualizado. Ganador: ${finalWinnerId}`);

    // Obtener datos actualizados del match
    const { data: updatedMatch, error: fetchMatchError } = await supabase
      .from("matches")
      .select("id, tournament_id, order, couple1_id, couple2_id, winner_id, round, status, type")
      .eq("id", matchId)
      .single();

    if (fetchMatchError || !updatedMatch) {
      console.error("[updateMatchResult] Error obteniendo match actualizado:", fetchMatchError);
      return { success: false, error: "Error obteniendo datos actualizados del match" };
    }

    const tournamentId = updatedMatch.tournament_id;

    // Calcular y aplicar cambios de puntuación
    if (updatedMatch.winner_id) {
      const { couple1_id, couple2_id, winner_id: actualWinnerCoupleId } = updatedMatch;
      let winningCoupleId_param: string | null = null;
      let losingCoupleId_param: string | null = null;

      if (actualWinnerCoupleId) {
        if (couple1_id === actualWinnerCoupleId) { 
          winningCoupleId_param = couple1_id; 
          losingCoupleId_param = couple2_id; 
        } else if (couple2_id === actualWinnerCoupleId) { 
          winningCoupleId_param = couple2_id; 
          losingCoupleId_param = couple1_id; 
        }
        
        if (winningCoupleId_param) {
          // El partido ya está finalizado, no hacemos nada más.
          console.log(`Match ${matchId} already finished.`);
        } else {
          // El partido no estaba finalizado, así que ahora calculamos y aplicamos puntos.
          if (winningCoupleId_param) {
            
            const tournamentId = updatedMatch.tournament_id;
            const { data: snapshotData, error: snapshotError } = await supabase
              .from('ranking_snapshots')
              .select('player_id, score, category, player_name')
              .eq('tournament_id', tournamentId)
              .eq('snapshot_type', 'tournament_start');

            if (snapshotError) {
              console.error('Error fetching tournament snapshot for match update:', snapshotError);
              return { success: false, error: 'Failed to fetch tournament snapshot' };
            }
            
            const playerSnapshotMap: PlayerSnapshotMap = new Map();
            if (snapshotData) {
              snapshotData.forEach((player: any) => {
                playerSnapshotMap.set(player.player_id, {
                  score: player.score,
                  category: player.category,
                  playerName: player.player_name,
                });
              });
            }

            // Nuevo flujo unificado: usar calculateMatchPoints para obtener puntos dinámicos
            const matchPoints = await calculateMatchPoints(updatedMatch, supabase, playerSnapshotMap);

            for (const mp of matchPoints) {
              if (mp.playerId) {
                await supabase
                  .from('players')
                  .update({ score: mp.points })
                  .eq('id', mp.playerId);
              }
            }
          }
        }
      }
    }

    // 🚀 NUEVA LÓGICA: Avance automático para matches eliminatorios
    if (updatedMatch.type === "ELIMINATION" && updatedMatch.winner_id) {
      console.log(`[updateMatchResult] 🎯 Match eliminatorio completado. Iniciando avance automático...`);
      
      try {
        const autoAdvanceResult = await autoAdvanceWinnerToNextRound(
          supabase,
          tournamentId,
          updatedMatch,
          matchId
        );
        
        if (autoAdvanceResult.success) {
          console.log(`[updateMatchResult] ✅ Avance automático completado: ${autoAdvanceResult.message}`);
        } else {
          console.warn(`[updateMatchResult] ⚠️ Avance automático falló: ${autoAdvanceResult.error}`);
          // No fallar la actualización del resultado por esto
        }
      } catch (autoAdvanceError: any) {
        console.error("[updateMatchResult] Error en avance automático:", autoAdvanceError);
        // No fallar la actualización del resultado por esto
      }
    }

    // Verificar si es la final y actualizar estado del torneo
    if (updatedMatch.round === 'FINAL' && updatedMatch.status === 'FINISHED') {
      console.log('[updateMatchResult] 🏆 Final completada. Actualizando estado del torneo...');
      
      // Solo actualizamos el estado a FINISHED_POINTS_PENDING y el ganador
      // Los puntos se calcularán cuando el club los revise y confirme
      const { error: tournamentUpdateError } = await supabase
        .from('tournaments')
        .update({ 
          status: 'FINISHED_POINTS_PENDING',
          winner_id: finalWinnerId,
          end_date: new Date().toISOString()
        })
        .eq('id', tournamentId);

      if (tournamentUpdateError) {
        console.error('[updateMatchResult] Error actualizando torneo:', tournamentUpdateError);
      } else {
        console.log('[updateMatchResult] ✅ Torneo finalizado. Esperando revisión de puntos por el club.');
      }
    }

    // Revalidar rutas
    if (tournamentId) {
      revalidatePath(`/tournaments/${tournamentId}`);
      revalidatePath(`/my-tournaments/${tournamentId}`);
    }

    // -----------------------------------------------------------------
    // 🔄  NUEVA LÓGICA: detectar cambio de ganador y propagar correcciones
    // -----------------------------------------------------------------
    const winnerChanged = prevWinnerId && prevWinnerId !== updatedMatch.winner_id;

    if (winnerChanged) {
      try {
        console.log(`[updateMatchResult] 🔄 Cambio de ganador detectado: ${prevWinnerId} -> ${updatedMatch.winner_id}`);
        await propagateWinnerChange(
          supabase,
          tournamentId,
          {
            id: updatedMatch.id,
            round: updatedMatch.round,
            order: updatedMatch.order,
            winner_id: updatedMatch.winner_id,
          },
          prevWinnerId!,
          updatedMatch.winner_id as string | null
        );
      } catch (propErr) {
        console.error('[updateMatchResult] Error propagando cambio de ganador:', propErr);
      }
    }

    return { 
      success: true, 
      message: "Resultado actualizado exitosamente",
      autoAdvanced: updatedMatch.type === "ELIMINATION" && updatedMatch.winner_id
    };

  } catch (error: any) { 
    console.error("[updateMatchResult] Error inesperado:", error);
    return { success: false, error: error.message || "Error inesperado actualizando resultado" }; 
  }
}

/**
 * 🆕 NUEVA FUNCIÓN: Avanza ganador usando match_hierarchy
 * Reemplaza autoAdvanceWinnerToNextRound con lógica basada en jerarquía
 */
export async function advanceWinnerUsingHierarchy(
  supabaseParam: any,
  tournamentId: string,
  completedMatchId: string,
  winnerId: string,
  advanceType: 'initial_bye' | 'normal_win' | 'modification' | 'auto_bye' = 'normal_win'
): Promise<{ success: boolean; message?: string; error?: string; propagated?: boolean }> {
  
  console.log(`[advanceWinnerUsingHierarchy] 🚀 ${advanceType}: ${winnerId} from ${completedMatchId}`)
  
  // 🆕 USAR SERVICE ROLE CLIENT para permisos completos de UPDATE
  const supabase = await createClientServiceRole()
  console.log(`[advanceWinnerUsingHierarchy] Using service role client for full permissions`)
  
  try {
    // 1. Buscar relación padre en match_hierarchy
    const { data: hierarchy, error: hierarchyError } = await supabase
      .from('match_hierarchy')
      .select('parent_match_id, parent_slot, parent_round')
      .eq('child_match_id', completedMatchId)
      .eq('tournament_id', tournamentId)
      .single()
    
    if (hierarchyError || !hierarchy) {
      // No hay padre → es FINAL o no tiene jerarquía
      if (hierarchyError?.code === 'PGRST116') {
        console.log(`[advanceWinnerUsingHierarchy] No parent found - match is FINAL or no hierarchy`)
        return { success: true, message: 'Match final - no advancement needed', propagated: false }
      }
      return { success: false, error: `Error finding hierarchy: ${hierarchyError?.message}` }
    }
    
    // 2. Obtener match padre actual
    const { data: parentMatch, error: parentError } = await supabase
      .from('matches')
      .select('id, couple1_id, couple2_id, winner_id, status, round')
      .eq('id', hierarchy.parent_match_id)
      .single()
      
    if (parentError || !parentMatch) {
      return { success: false, error: `Parent match not found: ${parentError?.message}` }
    }
    
    // 3. Determinar slot y actualizar match padre
    const slotField = hierarchy.parent_slot === 1 ? 'couple1_id' : 'couple2_id'
    const updateData: any = { [slotField]: winnerId }
    
    console.log(`[advanceWinnerUsingHierarchy] 🔧 UPDATE DETAILS:`, {
      parent_match_id: hierarchy.parent_match_id,
      parent_slot: hierarchy.parent_slot,
      slotField: slotField,
      winnerId: winnerId,
      updateData: updateData
    })
    
    const { error: updateError } = await supabase
      .from('matches')
      .update(updateData)
      .eq('id', hierarchy.parent_match_id)
    
    if (updateError) {
      console.error(`[advanceWinnerUsingHierarchy] ❌ UPDATE ERROR:`, updateError)
      return { success: false, error: `Failed to update parent match: ${updateError.message}` }
    }
    
    console.log(`[advanceWinnerUsingHierarchy] ✅ UPDATE SUCCESS: ${slotField} = ${winnerId} in match ${hierarchy.parent_match_id}`)

    console.log(`[advanceWinnerUsingHierarchy] ✅ Winner placed in ${hierarchy.parent_round} ${slotField}`)

    // 4. Verificar estado resultante del match padre
    const refreshedParent = { ...parentMatch, [slotField]: winnerId }

    // ✅ CRITICAL FIX: Verificar si el match ahora tiene ambas parejas ANTES de checkear BYE
    const otherSlotField = hierarchy.parent_slot === 1 ? 'couple2_id' : 'couple1_id'
    const otherSlotValue = parentMatch[otherSlotField]

    console.log(`[advanceWinnerUsingHierarchy] 🔍 Checking parent match state:`, {
      [slotField]: winnerId,
      [otherSlotField]: otherSlotValue,
      parentStatus: parentMatch.status
    })

    // Si ahora tiene ambas parejas → cambiar a PENDING
    if (otherSlotValue) {
      console.log(`[advanceWinnerUsingHierarchy] ✅ Match completo - ambas parejas presentes`)

      await supabase
        .from('matches')
        .update({ status: 'PENDING' })
        .eq('id', hierarchy.parent_match_id)

      console.log(`[advanceWinnerUsingHierarchy] ✅ Status actualizado: WAITING_OPONENT → PENDING`)

      return {
        success: true,
        message: `Winner advanced to ${hierarchy.parent_round} - match ready (status: PENDING)`,
        propagated: true
      }
    }

    // Si solo tiene una pareja, verificar si es un BYE estructural original
    const shouldAutoBye = await checkForOriginalBye(refreshedParent, supabase, tournamentId)

    if (shouldAutoBye.autoComplete) {
      console.log(`[advanceWinnerUsingHierarchy] 🎯 Auto-completing BYE: ${shouldAutoBye.winner}`)

      // Auto-completar BYE
      await supabase
        .from('matches')
        .update({
          winner_id: shouldAutoBye.winner,
          status: 'FINISHED'
        })
        .eq('id', hierarchy.parent_match_id)

      // 🔄 RECURSIÓN: Continuar avance automático
      const recursiveResult = await advanceWinnerUsingHierarchy(
        supabase,
        tournamentId,
        hierarchy.parent_match_id,
        shouldAutoBye.winner!,
        'auto_bye'
      )

      return {
        success: true,
        message: `Winner advanced with BYE cascade: ${recursiveResult.message}`,
        propagated: true
      }
    }

    // 6. Esperando oponente (no es BYE, solo falta una pareja)
    console.log(`[advanceWinnerUsingHierarchy] ⏳ Waiting for opponent - status: WAITING_OPONENT`)

    return {
      success: true,
      message: `Winner advanced to ${hierarchy.parent_round} - waiting opponent`,
      propagated: true
    }
    
  } catch (error: any) {
    console.error("[advanceWinnerUsingHierarchy] Error inesperado:", error)
    return { success: false, error: `Error inesperado: ${error.message}` }
  }
}

/**
 * Verifica si un match debe auto-completarse como BYE original
 */
async function checkForOriginalBye(
  match: any, 
  supabase: any, 
  tournamentId: string
): Promise<{ autoComplete: boolean; winner?: string }> {
  
  // Solo auto-completar si tiene exactamente uno de los dos participantes
  const hasOne = (match.couple1_id && !match.couple2_id) || (!match.couple1_id && match.couple2_id)
  if (!hasOne) {
    console.log(`[checkForOriginalBye] Match ${match.id}: NOT a BYE - has both couples or neither`)
    return { autoComplete: false }
  }
  
  // El ganador es quien está presente
  const winner = match.couple1_id || match.couple2_id
  
  // 🔍 VERIFICACIÓN CRÍTICA: ¿Es BYE original del bracket?
  const isOriginalBye = await verifyOriginalBracketBye(match, supabase, tournamentId)
  
  console.log(`[checkForOriginalBye] Match ${match.id}: hasOne=${hasOne}, winner=${winner}, isOriginalBye=${isOriginalBye}, autoComplete=${isOriginalBye}`)
  
  return { 
    autoComplete: isOriginalBye, 
    winner: isOriginalBye ? winner : undefined 
  }
}

/**
 * Verifica si es un BYE original del bracket
 */
async function verifyOriginalBracketBye(
  match: any,
  supabase: any, 
  tournamentId: string
): Promise<boolean> {
  
  try {
    // Obtener todos los matches hijos de este match
    const { data: childMatches, error } = await supabase
      .from('match_hierarchy')
      .select(`
        child_match_id,
        child_match:child_match_id(status, couple1_id, couple2_id, winner_id)
      `)
      .eq('parent_match_id', match.id)
      .eq('tournament_id', tournamentId)
    
    if (error || !childMatches || childMatches.length === 0) {
      return false // No hay hijos, no es BYE válido
    }
    
    // Verificar que todos los matches hijos estén resueltos
    const allChildrenResolved = childMatches.every((child: any) => 
      child.child_match?.status === 'FINISHED' && child.child_match?.winner_id
    )
    
    if (!allChildrenResolved) {
      return false // Aún hay matches hijos sin resolver
    }
    
    // Si todos los hijos están resueltos y este match tiene solo un participante,
    // entonces es un BYE original del bracket
    return true
    
  } catch (error) {
    console.error('[verifyOriginalBracketBye] Error:', error)
    return false
  }
}

/**
 * Maneja modificaciones de ganador con límite de 1 nivel
 */
export async function handleWinnerModification(
  supabase: any,
  tournamentId: string,
  changedMatchId: string,
  oldWinner: string,
  newWinner: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  
  console.log(`[handleWinnerModification] 🔄 Changing ${oldWinner} → ${newWinner}`)
  
  try {
    // 1. Encontrar match padre (SOLO 1 NIVEL)
    const { data: hierarchy, error: hierarchyError } = await supabase
      .from('match_hierarchy')
      .select('parent_match_id, parent_slot')
      .eq('child_match_id', changedMatchId)
      .eq('tournament_id', tournamentId)
      .single()
    
    if (hierarchyError || !hierarchy) {
      console.log(`[handleWinnerModification] No parent found - no propagation needed`)
      return { success: true, message: 'No parent match - no propagation needed' }
    }
    
    // 2. Obtener match padre actual
    const { data: parentMatch, error: parentError } = await supabase
      .from('matches')
      .select('id, couple1_id, couple2_id, winner_id, status, round')
      .eq('id', hierarchy.parent_match_id)
      .single()
    
    if (parentError || !parentMatch) {
      return { success: false, error: `Parent match not found: ${parentError?.message}` }
    }
    
    // 3. Verificar si el ganador anterior está en el match padre
    const oldWinnerInSlot1 = parentMatch.couple1_id === oldWinner
    const oldWinnerInSlot2 = parentMatch.couple2_id === oldWinner
    
    if (!oldWinnerInSlot1 && !oldWinnerInSlot2) {
      console.log(`[handleWinnerModification] Old winner not in parent - direct advance only`)
    } else {
      // 4. Remover ganador anterior y resetear match padre
      const updates: any = {
        winner_id: null,
        status: 'PENDING'
      }
      
      if (oldWinnerInSlot1) updates.couple1_id = null
      if (oldWinnerInSlot2) updates.couple2_id = null
      
      await supabase
        .from('matches')
        .update(updates)
        .eq('id', hierarchy.parent_match_id)
      
      console.log(`[handleWinnerModification] ✅ Removed old winner from parent match`)
    }
    
    // 5. Avanzar nuevo ganador (SOLO 1 NIVEL - sin recursión profunda)
    const advanceResult = await advanceWinnerUsingHierarchy(
      supabase,
      tournamentId,
      changedMatchId,
      newWinner,
      'modification'
    )
    
    if (advanceResult.success) {
      console.log(`[handleWinnerModification] ✅ Modification complete: ${advanceResult.message}`)
      return { success: true, message: `Modification complete: ${advanceResult.message}` }
    } else {
      return { success: false, error: `Failed to advance new winner: ${advanceResult.error}` }
    }
    
  } catch (error: any) {
    console.error("[handleWinnerModification] Error inesperado:", error)
    return { success: false, error: `Error inesperado: ${error.message}` }
  }
}

/**
 * Avanza automáticamente el ganador de un match a la siguiente ronda
 * FUNCIÓN LEGACY - Mantenida para compatibilidad
 */
async function autoAdvanceWinnerToNextRound(
  supabase: any,
  tournamentId: string,
  completedMatch: any,
  completedMatchId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    console.log(`[autoAdvanceWinnerToNextRound] 🚀 Avanzando ganador del match ${completedMatchId}`);
    
    const roundOrder = ["32VOS", "16VOS", "8VOS", "4TOS", "SEMIFINAL", "FINAL"];
    const currentRoundIndex = roundOrder.indexOf(completedMatch.round);
    
    if (currentRoundIndex === -1) {
      return { success: false, error: `Ronda no reconocida: ${completedMatch.round}` };
    }
    
    // Si es la final, no hay siguiente ronda
    if (completedMatch.round === "FINAL") {
      return { success: true, message: "Final completada - no hay siguiente ronda" };
    }
    
    const nextRound = roundOrder[currentRoundIndex + 1];
    console.log(`[autoAdvanceWinnerToNextRound] 🎯 Ronda actual: ${completedMatch.round}, Siguiente: ${nextRound}`);
    
    // Buscar el match de la siguiente ronda que debe recibir este ganador
    const nextRoundMatch = await findNextRoundMatchForWinner(
      supabase,
      tournamentId,
      completedMatch,
      nextRound
    );
    
    if (!nextRoundMatch) {
      return { success: false, error: `No se encontró match de destino en ${nextRound}` };
    }
    
    // Determinar si el ganador va a couple1_id o couple2_id
    const updateData = await determineWinnerPlacement(
      supabase,
      tournamentId,
      nextRoundMatch,
      completedMatch,
      nextRound
    );
    
    if (!updateData) {
      return { success: false, error: "No se pudo determinar la colocación del ganador" };
    }
    
    // Actualizar el match de la siguiente ronda
    const { error: updateError } = await supabase
      .from("matches")
      .update(updateData)
      .eq("id", nextRoundMatch.id);
    
    if (updateError) {
      return { success: false, error: `Error actualizando match de ${nextRound}: ${updateError.message}` };
    }
    
    console.log(`[autoAdvanceWinnerToNextRound] ✅ Ganador ${completedMatch.winner_id} avanzado a ${nextRound}`);
    
    // Verificar si el match de la siguiente ronda ya está completo (ambos participantes definidos)
    // IMPORTANTE: No pasar parámetro isFromInitialGeneration, dejar que la función lo determine desde la DB
    const checkCompleteResult = await checkAndAutoCompleteByeMatch(
      supabase,
      nextRoundMatch.id,
      updateData
    );
    
    return { 
      success: true, 
      message: `Ganador avanzado a ${nextRound}${checkCompleteResult ? ' (BYE automático)' : ''}` 
    };
    
  } catch (error: any) {
    console.error("[autoAdvanceWinnerToNextRound] Error inesperado:", error);
    return { success: false, error: `Error inesperado: ${error.message}` };
  }
}

/**
 * Encuentra el match de la siguiente ronda que debe recibir el ganador
 */
async function findNextRoundMatchForWinner(
  supabase: any,
  tournamentId: string,
  completedMatch: any,
  nextRound: string
): Promise<any | null> {
  try {
    // Obtener todos los matches de la siguiente ronda
    const { data: nextRoundMatches, error } = await supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("round", nextRound)
      .order("order_in_round");
    
    if (error || !nextRoundMatches) {
      console.error("[findNextRoundMatchForWinner] Error obteniendo matches:", error);
      return null;
    }
    
    // Calcular qué match de la siguiente ronda corresponde basado en el order
    // Cada 2 matches de la ronda actual alimentan 1 match de la siguiente ronda
    const targetMatchOrder = Math.floor((completedMatch.order_in_round - 1) / 2) + 1;
    
    const targetMatch = nextRoundMatches.find((m: any) => m.order_in_round === targetMatchOrder);
    
    console.log(`[findNextRoundMatchForWinner] Match completado order_in_round ${completedMatch.order_in_round} -> Match destino order_in_round ${targetMatchOrder}`);
    
    return targetMatch || null;
    
  } catch (error: any) {
    console.error("[findNextRoundMatchForWinner] Error inesperado:", error);
    return null;
  }
}

/**
 * Determina si el ganador va a couple1_id o couple2_id en el match de destino
 */
async function determineWinnerPlacement(
  supabase: any,
  tournamentId: string,
  nextRoundMatch: any,
  completedMatch: any,
  nextRound: string
): Promise<any | null> {
  try {
    // Si el match completado tiene order impar, el ganador va a couple1_id
    // Si el match completado tiene order par, el ganador va a couple2_id
    const winnerId = completedMatch.winner_id;
    
    console.log(`[determineWinnerPlacement] Colocando ganador ${winnerId} en match ${nextRoundMatch.id}`);
    console.log(`[determineWinnerPlacement] Estado actual match destino: couple1=${nextRoundMatch.couple1_id}, couple2=${nextRoundMatch.couple2_id}`);
    
    if ((completedMatch.order % 2) === 1) {
      // Order impar -> couple1_id
      const updateData: any = { couple1_id: winnerId };
      
      // Si couple2_id ya está definido, el match puede estar listo
      if (nextRoundMatch.couple2_id) {
        updateData.status = "PENDING";
        console.log(`[determineWinnerPlacement] ✅ Match completo - Estado: PENDING`);
      } else {
        updateData.status = "WAITING_OPONENT";
        console.log(`[determineWinnerPlacement] ⏳ Esperando couple2 - Estado: WAITING_OPONENT`);
      }
      
      return updateData;
    } else {
      // Order par -> couple2_id
      const updateData: any = { couple2_id: winnerId };
      
      // Si couple1_id ya está definido, el match puede estar listo
      if (nextRoundMatch.couple1_id) {
        updateData.status = "PENDING";
        console.log(`[determineWinnerPlacement] ✅ Match completo - Estado: PENDING`);
      } else {
        updateData.status = "WAITING_OPONENT";
        console.log(`[determineWinnerPlacement] ⏳ Esperando couple1 - Estado: WAITING_OPONENT`);
      }
      
      return updateData;
    }
    
  } catch (error: any) {
    console.error("[determineWinnerPlacement] Error inesperado:", error);
    return null;
  }
}

/**
 * Verifica si un match se completa automáticamente por BYE
 * NUEVA VERSIÓN: Distingue correctamente entre BYE y WAITING_OPONENT
 */
async function checkAndAutoCompleteByeMatch(
  supabase: any,
  matchId: string,
  updateData: any,
  isFromInitialGeneration?: boolean
): Promise<boolean> {
  try {
    console.log(`[checkAndAutoCompleteByeMatch] 🔍 Revisando match ${matchId}`);
    
    // Obtener el match actualizado incluyendo is_from_initial_generation
    const { data: updatedMatch, error } = await supabase
      .from("matches")
      .select("couple1_id, couple2_id, status, round, order, is_from_initial_generation")
      .eq("id", matchId)
      .single();
    
    if (error || !updatedMatch) {
      console.error(`[checkAndAutoCompleteByeMatch] Error obteniendo match ${matchId}:`, error);
      return false;
    }

    const { couple1_id, couple2_id, is_from_initial_generation } = updatedMatch;
    
    // Usar el valor de la DB si está disponible, sino usar el parámetro como fallback
    const isFromInitial = is_from_initial_generation ?? isFromInitialGeneration ?? false;
    
    console.log(`[checkAndAutoCompleteByeMatch] 📊 Estado: couple1=${couple1_id}, couple2=${couple2_id}, isInitial=${isFromInitial}`);
    
    // Caso 1: Si ambas parejas están definidas, no es BYE
    if (couple1_id && couple2_id) {
      console.log(`[checkAndAutoCompleteByeMatch] ✅ Match ${matchId} tiene ambas parejas, cambiar a PENDING`);
      await supabase
        .from("matches")
        .update({ status: "PENDING" })
        .eq("id", matchId);
      return false;
    }

    // Caso 2: Si no hay parejas definidas, dejar en WAITING_OPONENT
    if (!couple1_id && !couple2_id) {
      console.log(`[checkAndAutoCompleteByeMatch] ⏳ Match ${matchId} sin parejas, mantener WAITING_OPONENT`);
      await supabase
        .from("matches")
        .update({ status: "WAITING_OPONENT" })
        .eq("id", matchId);
      return false;
    }

    // Caso 3: Solo una pareja definida
    const hasOneCouple = (couple1_id && !couple2_id) || (!couple1_id && couple2_id);
    
    if (hasOneCouple) {
      // Si es de la generación inicial, es un BYE verdadero
      if (isFromInitial) {
        const winner_id = couple1_id || couple2_id;
        await supabase
          .from("matches")
          .update({ 
            status: "BYE", 
            winner_id: winner_id 
          })
          .eq("id", matchId);
        
        console.log(`[checkAndAutoCompleteByeMatch] ✅ BYE verdadero: ${winner_id} avanza automáticamente (generación inicial)`);
        return true;
      } else {
        // Si NO es de la generación inicial, está esperando oponente
        await supabase
          .from("matches")
          .update({ 
            status: "WAITING_OPONENT",
            winner_id: null 
          })
          .eq("id", matchId);
        
        console.log(`[checkAndAutoCompleteByeMatch] ⏳ Esperando oponente en match ${matchId} (NO generación inicial)`);
        return false;
      }
    }
    
    return false;
    
  } catch (error: any) {
    console.error("[checkAndAutoCompleteByeMatch] Error inesperado:", error);
    return false;
  }
}

// --- ACTION: advanceToNextStageAction (NUEVA VERSIÓN - Actualiza matches existentes) ---
export async function advanceToNextStageAction(tournamentId: string) {
  const supabase = await createClient();
  
  try {
    console.log(`[advanceToNextStageAction] 🚀 Iniciando avance automático para torneo ${tournamentId}`);
    
    // Paso 1: Obtener todos los matches eliminatorios del torneo
    const { data: allMatches, error: matchesError } = await supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .neq("round", "ZONE")
      .order("round")
      .order("order");
    
    if (matchesError || !allMatches) {
      console.error("[advanceToNextStageAction] Error obteniendo matches:", matchesError);
      return { success: false, error: matchesError?.message || "Error obteniendo partidos." };
    }
    
    console.log(`[advanceToNextStageAction] 📊 Encontrados ${allMatches.length} matches eliminatorios`);
    
    // Paso 2: Identificar ronda actual y próxima ronda
    const roundOrder = ["32VOS", "16VOS", "8VOS", "4TOS", "SEMIFINAL", "FINAL"];
    const currentRoundInfo = getCurrentRoundInfo(allMatches, roundOrder);
    
    if (!currentRoundInfo) {
      return { success: false, error: "No se pudo determinar la ronda actual." };
    }
    
    console.log(`[advanceToNextStageAction] 🎯 Ronda actual: ${currentRoundInfo.currentRound}`);
    
    // Paso 3: Verificar que todos los matches de la ronda actual estén terminados
    const currentRoundMatches = allMatches.filter(m => m.round === currentRoundInfo.currentRound);
    const unfinishedMatches = currentRoundMatches.filter(m => m.status !== "FINISHED");
    
    if (unfinishedMatches.length > 0) {
      console.log(`[advanceToNextStageAction] ⏳ Hay ${unfinishedMatches.length} matches sin terminar en ${currentRoundInfo.currentRound}`);
      return { 
        success: false, 
        error: `Hay ${unfinishedMatches.length} partidos sin terminar en ${currentRoundInfo.currentRound}. Complete todos los partidos antes de avanzar.` 
      };
    }
    
    // Paso 4: Si es la final, marcar torneo como terminado
    if (currentRoundInfo.currentRound === "FINAL") {
      const finalMatch = currentRoundMatches[0];
      if (finalMatch?.winner_id) {
        await supabase
          .from('tournaments')
          .update({ 
            status: 'FINISHED', 
            winner_id: finalMatch.winner_id,
            end_date: new Date().toISOString()
          })
          .eq('id', tournamentId);
        
        console.log(`[advanceToNextStageAction] 🏆 Torneo finalizado. Ganador: ${finalMatch.winner_id}`);
        revalidatePath(`/tournaments/${tournamentId}`);
        return { success: true, message: "Torneo finalizado exitosamente.", isFinal: true };
      }
    }
    
    // Paso 5: Avanzar ganadores a la siguiente ronda
    if (currentRoundInfo.nextRound) {
      const advanceResult = await advanceWinnersToNextRound(
        supabase,
        tournamentId,
        currentRoundMatches,
        currentRoundInfo.nextRound,
        allMatches
      );
      
      if (!advanceResult.success) {
        return advanceResult;
      }
      
      console.log(`[advanceToNextStageAction] ✅ Ganadores avanzados a ${currentRoundInfo.nextRound}`);
    }
    
    // Paso 6: Revalidar rutas
    revalidatePath(`/tournaments/${tournamentId}`);
    
    return { 
      success: true, 
      message: `Avance automático completado. Ganadores avanzados a ${currentRoundInfo.nextRound || 'final'}.`,
      currentRound: currentRoundInfo.currentRound,
      nextRound: currentRoundInfo.nextRound
    };
    
  } catch (error: any) {
    console.error("[advanceToNextStageAction] Error inesperado:", error);
    return { success: false, error: `Error inesperado: ${error.message}` };
  }
}

/**
 * Determina la ronda actual basada en los matches disponibles
 */
function getCurrentRoundInfo(matches: any[], roundOrder: string[]): {
  currentRound: string;
  nextRound: string | null;
} | null {
  // Buscar la ronda más avanzada que tenga matches terminados
  for (let i = roundOrder.length - 1; i >= 0; i--) {
    const round = roundOrder[i];
    const roundMatches = matches.filter(m => m.round === round);
    
    if (roundMatches.length > 0) {
      const finishedMatches = roundMatches.filter(m => m.status === "FINISHED");
      
      // Si todos los matches de esta ronda están terminados, esta es la ronda actual
      if (finishedMatches.length === roundMatches.length) {
        return {
          currentRound: round,
          nextRound: i < roundOrder.length - 1 ? roundOrder[i + 1] : null
        };
      }
      
      // Si hay matches sin terminar, esta es la ronda actual
      return {
        currentRound: round,
        nextRound: i < roundOrder.length - 1 ? roundOrder[i + 1] : null
      };
    }
  }
  
  return null;
}

/**
 * Avanza los ganadores de la ronda actual a la siguiente ronda
 */
async function advanceWinnersToNextRound(
  supabase: any,
  tournamentId: string,
  currentRoundMatches: any[],
  nextRound: string,
  allMatches: any[]
): Promise<{ success: boolean; error?: string; updatedMatches?: number }> {
  try {
    console.log(`[advanceWinnersToNextRound] 🎯 Avanzando ganadores de ${currentRoundMatches[0]?.round} a ${nextRound}`);
    
    // Obtener matches de la siguiente ronda que necesitan ser poblados
    const nextRoundMatches = allMatches.filter(m => m.round === nextRound);
    
    if (nextRoundMatches.length === 0) {
      return { success: false, error: `No se encontraron matches para la ronda ${nextRound}` };
    }
    
    // Ordenar matches por order para asegurar emparejamiento correcto
    const sortedCurrentMatches = [...currentRoundMatches].sort((a, b) => (a.order || 0) - (b.order || 0));
    const sortedNextMatches = [...nextRoundMatches].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    console.log(`[advanceWinnersToNextRound] 📊 ${sortedCurrentMatches.length} matches actuales -> ${sortedNextMatches.length} matches siguientes`);
    
    // Agrupar ganadores de a pares para poblar matches de la siguiente ronda
    const updates: Array<{ matchId: string; couple1_id: string | null; couple2_id: string | null; status: string; winner_id?: string }> = [];
    
    for (let i = 0; i < sortedNextMatches.length; i++) {
      const nextMatch = sortedNextMatches[i];
      
      // Determinar qué matches de la ronda actual alimentan este match
      const parentMatch1Index = i * 2;
      const parentMatch2Index = i * 2 + 1;
      
      const parent1 = sortedCurrentMatches[parentMatch1Index];
      const parent2 = sortedCurrentMatches[parentMatch2Index];
      
      let couple1_id: string | null = null;
      let couple2_id: string | null = null;
      let status = "PENDING";
      let winner_id: string | undefined = undefined;
      
      // Obtener ganador del primer match padre
      if (parent1?.winner_id) {
        couple1_id = parent1.winner_id;
      }
      
      // Obtener ganador del segundo match padre (si existe)
      if (parent2?.winner_id) {
        couple2_id = parent2.winner_id;
      } else if (parentMatch2Index >= sortedCurrentMatches.length) {
        // Si no hay segundo match padre, el primer ganador avanza automáticamente (BYE)
        status = "FINISHED";
        winner_id = couple1_id || undefined;
      }
      
      updates.push({
        matchId: nextMatch.id,
        couple1_id,
        couple2_id,
        status,
        winner_id
      });
      
      console.log(`[advanceWinnersToNextRound] 🔄 Match ${nextMatch.order}: ${couple1_id || 'null'} vs ${couple2_id || 'null'} (${status})`);
    }
    
    // Ejecutar actualizaciones
    let updatedCount = 0;
    for (const update of updates) {
      const updateData: any = {
        couple1_id: update.couple1_id,
        couple2_id: update.couple2_id,
        status: update.status
      };
      
      if (update.winner_id) {
        updateData.winner_id = update.winner_id;
      }
      
      const { error: updateError } = await supabase
        .from("matches")
        .update(updateData)
        .eq("id", update.matchId);
      
      if (updateError) {
        console.error(`[advanceWinnersToNextRound] Error actualizando match ${update.matchId}:`, updateError);
        return { success: false, error: `Error actualizando match: ${updateError.message}` };
      }
      
      updatedCount++;
    }
    
    console.log(`[advanceWinnersToNextRound] ✅ ${updatedCount} matches actualizados exitosamente`);
    
    return { success: true, updatedMatches: updatedCount };
    
  } catch (error: any) {
    console.error("[advanceWinnersToNextRound] Error inesperado:", error);
    return { success: false, error: `Error inesperado: ${error.message}` };
  }
}

export async function requestSoloInscription(
  tournamentId: string,
  playerId: string,
  phoneNumber: string
): Promise<{ success: boolean; message: string; error?: any }> {
  const supabase = await createClient();
  try {
    const isPending = await getTournamentInscriptionPendingState({
      supabase,
      tournamentId,
      actorRole: 'PLAYER',
    });

    const { data: inscription, error } = await supabase.from("inscriptions").insert([
      {
        player_id: playerId,
        tournament_id: tournamentId,
        phone: phoneNumber,
        is_pending: isPending,
      },
    ]).select("id").single();

    if (error) {
      console.error("[requestSoloInscription] Error inserting solo inscription:", error);
      return { success: false, message: "Error al enviar la solicitud.", error };
    }

    try {
      const { sendTournamentMessage } = await import('@/lib/services/messages');
      await sendTournamentMessage({
        type: 'INSCRIPTION_SUBMITTED_ADMIN',
        supabase,
        inscriptionId: inscription.id,
      });
      await sendTournamentMessage({
        type: 'INSCRIPTION_APPROVED_PLAYER',
        supabase,
        inscriptionId: inscription.id,
      });
    } catch (emailError) {
      console.error('[requestSoloInscription] Error enviando mensajes:', emailError);
    }

    // Revalidation might not be immediately necessary for guest view until approved,
    // but can be added if an admin view needs to update.
    // revalidatePath(`/tournaments/${tournamentId}`);
    // revalidatePath(`/admin/tournaments/${tournamentId}/requests`); // Example path

    return { success: true, message: "Solicitud de inscripción individual enviada." };
  } catch (e: any) {
    console.error("[requestSoloInscription] Unexpected error:", e);
    return { success: false, message: "Error inesperado al enviar la solicitud.", error: e.message };
  }
}

export async function requestCoupleInscription(
  tournamentId: string,
  player1Id: string,
  player2Id: string,
  phoneNumber: string
): Promise<{ success: boolean; message: string; error?: any }> {
  const supabase = await createClient();
  try {
    const isPending = await getTournamentInscriptionPendingState({
      supabase,
      tournamentId,
      actorRole: 'PLAYER',
    });

    // 1. Find or Create the couple
    // Check if couple exists (player1Id, player2Id)
    const existingCouple1Result = await supabase
      .from("couples")
      .select("id")
      .eq("player1_id", player1Id)
      .eq("player2_id", player2Id)
      .maybeSingle();

    const existingCouple1 = existingCouple1Result.data;
    const existingCouple1Error = existingCouple1Result.error;

    if (existingCouple1Error && existingCouple1Error.code !== 'PGRST116') { // PGRST116 means no rows, which is fine
      console.error("[requestCoupleInscription] Error checking for couple (P1, P2):", existingCouple1Error);
      throw existingCouple1Error;
    }
    
    let coupleId = existingCouple1?.id;

    if (!coupleId) {
      // Check if couple exists (player2Id, player1Id)
      const existingCouple2Result = await supabase
        .from("couples")
        .select("id")
        .eq("player1_id", player2Id)
        .eq("player2_id", player1Id)
        .maybeSingle();
      
      const existingCouple2 = existingCouple2Result.data;
      const existingCouple2Error = existingCouple2Result.error;

      if (existingCouple2Error && existingCouple2Error.code !== 'PGRST116') {
         console.error("[requestCoupleInscription] Error checking for couple (P2, P1):", existingCouple2Error);
         throw existingCouple2Error;
      }
      coupleId = existingCouple2?.id;
    }
    
    if (!coupleId) {
      // Create the couple if it doesn't exist
      const { data: newCouple, error: coupleError } = await supabase
        .from("couples")
        .insert([{ player1_id: player1Id, player2_id: player2Id }])
        .select("id")
        .single();

      if (coupleError || !newCouple) {
        console.error("[requestCoupleInscription] Error creating couple:", coupleError);
        throw coupleError || new Error("Failed to create couple");
      }
      coupleId = newCouple.id;
    }

    // 2. Create the inscription for the couple
    const { data: inscription, error: inscriptionError } = await supabase.from("inscriptions").insert([
      {
        couple_id: coupleId,
        tournament_id: tournamentId,
        // player_id can be null for couple inscriptions, or you can choose one of the players
        // For consistency with how it might have been before, let's ensure player_id is not set if couple_id is.
        // However, the DB schema for inscriptions has player_id as NOT NULL. This is an issue.
        // For now, let's assume the previous client-side logic was right and one player_id is needed,
        // or the DB schema needs adjustment for couple-only inscriptions.
        // Let's try to insert player_id as null and see if DB allows, or if we must provide one.
        // Re-checking schema: player_id is NOT NULL.
        // So, one of the players must be associated, or the schema changes.
        // For now, let's use player1_id as the primary contact for the inscription, even if it's a couple.
        // This might need review based on how RLS and other logic use `inscriptions.player_id`.
        // A safer approach for couple inscriptions might be *not* to fill player_id here
        // if the DB allowed it, or to have a separate way to track the "requester" if needed.
        // Given the schema `player_id non-nullable`, we must provide it.
        // This implies that an "inscription" is always by *a* player, even if for a couple.
        // This needs clarification if the intent is different.
        // For now, let's set player1_id as the primary player for the couple's inscription request.
        // This is a tricky part if the DB schema is rigid.
        // The existing `registerCoupleForTournament` uses `player_id: player1Id` for inscriptions. Let's follow that.
        player_id: player1Id, 
        phone: phoneNumber,
        is_pending: isPending,
      },
    ]).select("id").single();

    if (inscriptionError) {
      console.error("[requestCoupleInscription] Error inserting couple inscription:", inscriptionError);
      return { success: false, message: "Error al enviar la solicitud de pareja.", error: inscriptionError };
    }

    try {
      const { sendTournamentMessage } = await import('@/lib/services/messages');
      await sendTournamentMessage({
        type: 'INSCRIPTION_SUBMITTED_ADMIN',
        supabase,
        inscriptionId: inscription.id,
      });
      await sendTournamentMessage({
        type: 'INSCRIPTION_APPROVED_PLAYER',
        supabase,
        inscriptionId: inscription.id,
      });
    } catch (emailError) {
      console.error('[requestCoupleInscription] Error enviando mensajes:', emailError);
    }
    
    // revalidatePath(`/tournaments/${tournamentId}`);
    // revalidatePath(`/admin/tournaments/${tournamentId}/requests`); // Example

    return { success: true, message: "Solicitud de inscripción de pareja enviada." };
  } catch (e: any) {
    console.error("[requestCoupleInscription] Unexpected error:", e);
    return { success: false, message: "Error inesperado al enviar la solicitud de pareja.", error: e.message };
  }
}

export async function getPendingInscriptionsByTournamentId(tournamentId: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
  const supabase = await createClient();
  console.log(`[getPendingInscriptions V3 - Simplified] Fetching for tournament ID: ${tournamentId}`);

  const toISOStringOrNull = (dateInput: string | Date | null | undefined): string | null => {
    if (!dateInput) return null;
    try {
      return new Date(dateInput).toISOString();
    } catch (e) {
      console.warn(`[getPendingInscriptions V3 - Simplified] Invalid date for conversion: ${dateInput}`, e);
      return null;
    }
  };

  try {
    const { data: rawDbInscriptions, error: fetchError } = await supabase
      .from('inscriptions')
      .select(
        `id,
        created_at,
        phone, // Keeping phone as it's on the inscription itself
        tournament_id,
        player_id, // Keep FKs to see if they cause issues
        couple_id  // Keep FKs
        // Removing all joins to players and couples
        // player:players!inscriptions_player_id_fkey(id, first_name, last_name, score, phone, created_at, dni),
        // couple:couples!inscriptions_couple_id_fkey(
        //   id,
        //   created_at,
        //   player1_id, 
        //   player2_id,
        //   player1:players!couples_player1_id_fkey(id, first_name, last_name, score, created_at, dni),
        //   player2:players!couples_player2_id_fkey(id, first_name, last_name, score, created_at, dni)
        // )` 
      )
      .eq('tournament_id', tournamentId)
      .eq('is_pending', true)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error("[getPendingInscriptions V3 - Simplified] Supabase fetch error:", fetchError);
      return { success: false, error: fetchError.message };
    }

    if (!rawDbInscriptions) {
      console.log("[getPendingInscriptions V3 - Simplified] No raw inscriptions data returned from Supabase.");
      return { success: true, data: [] };
    }
    
    if (rawDbInscriptions.length > 0) {
        console.log("[getPendingInscriptions V3 - Simplified] Raw DB inscriptions (first item):", 
                    JSON.stringify(rawDbInscriptions[0], null, 2));
    } else {
        console.log("[getPendingInscriptions V3 - Simplified] Raw DB inscriptions array is empty.");
    }

    // Simplified processing: just convert dates and ensure structure is plain
    const processedData = rawDbInscriptions.map((rawInscription: any) => {
      return {
        id: rawInscription.id,
        created_at: toISOStringOrNull(rawInscription.created_at),
        phone: rawInscription.phone || null,
        tournament_id: rawInscription.tournament_id,
        player_id: rawInscription.player_id || null,
        couple_id: rawInscription.couple_id || null,
        // No nested player or couple objects anymore for this test
        player: null, 
        couple: null,
      };
    });

    if (processedData.length > 0 && processedData[0]) {
         console.log(`[getPendingInscriptions V3 - Simplified] First final processed item:`, 
                     JSON.stringify(processedData[0], null, 2));
    }

    console.log("[getPendingInscriptions V3 - Simplified] Successfully processed all inscriptions.");
    const finalData = JSON.parse(JSON.stringify(processedData));
    return { success: true, data: finalData };

  } catch (e: any) {
    console.error("[getPendingInscriptions V3 - Simplified] Unexpected error in processing:", e);
    return { success: false, error: e.message || "Unexpected error processing pending inscriptions." };
  }
}

export async function acceptInscriptionRequest(inscriptionId: string, tournamentId: string): Promise<{ success: boolean; message: string; error?: string }> {
  const supabase = await createClient();
  try {
    const { data: inscription, error: fetchError } = await supabase
        .from('inscriptions')
        .select('player_id, couple_id')
        .eq('id', inscriptionId)
        .single();

    if (fetchError || !inscription) {
        console.error("[acceptInscriptionRequest] Error fetching inscription or inscription not found:", fetchError);
        return { success: false, message: "Error al encontrar la inscripción." , error: fetchError?.message };
    }

    // Check if the player or couple is already fully registered (not pending)
    if (inscription.player_id && !inscription.couple_id) { // Solo player
        const { data: existing, error: checkError } = await supabase
            .from('inscriptions')
            .select('id')
            .eq('tournament_id', tournamentId)
            .eq('player_id', inscription.player_id)
            .eq('is_pending', false)
            .neq('id', inscriptionId) // Exclude the current pending one
            .maybeSingle();
        if (checkError) {
            console.error("[acceptInscriptionRequest] Error checking existing player inscription:", checkError);
            return { success: false, message: "Error al verificar jugador.", error: checkError.message };
        }
        if (existing) {
            return { success: false, message: "Este jugador ya está inscrito y aceptado en el torneo." };
        }
    } else if (inscription.couple_id) { // Couple
        const { data: existing, error: checkError } = await supabase
            .from('inscriptions')
            .select('id')
            .eq('tournament_id', tournamentId)
            .eq('couple_id', inscription.couple_id)
            .eq('is_pending', false)
            .neq('id', inscriptionId) // Exclude the current pending one
            .maybeSingle();
        if (checkError) {
            console.error("[acceptInscriptionRequest] Error checking existing couple inscription:", checkError);
            return { success: false, message: "Error al verificar pareja.", error: checkError.message };
        }
        if (existing) {
            return { success: false, message: "Esta pareja ya está inscrita y aceptada en el torneo." };
        }
    }

    const { error } = await supabase
      .from('inscriptions')
      .update({ is_pending: false })
      .eq('id', inscriptionId);

    if (error) {
      console.error("[acceptInscriptionRequest] Error updating inscription:", error);
      return { success: false, message: "Error al aceptar la solicitud.", error: error.message };
    }

    try {
      const { sendTournamentMessage } = await import('@/lib/services/messages');
      await sendTournamentMessage({
        type: 'INSCRIPTION_APPROVED_PLAYER',
        supabase,
        inscriptionId,
      });
    } catch (emailError) {
      console.error('[acceptInscriptionRequest] Error enviando email de aprobacion:', emailError);
    }

    revalidatePath(`/my-tournaments/${tournamentId}`);
    // Potentially revalidate the public page as well if it shows participant counts or lists
    revalidatePath(`/tournaments/${tournamentId}`);

    return { success: true, message: "Solicitud de inscripción aceptada." };
  } catch (e: any) {
    console.error("[acceptInscriptionRequest] Unexpected error:", e);
    return { success: false, message: "Error inesperado al aceptar la solicitud.", error: e.message };
  }
} 

// --- ACTION: populateTournamentSeedCouples (New) ---
export async function populateTournamentSeedCouples(tournamentId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  seededCouples?: any[];
}> {
  const supabase = await createClient();
  console.log(`[populateTournamentSeedCouples] Starting for tournament: ${tournamentId}`);

  try {
    // 1. Fetch zones and their ranked couples
    const zonesResult = await fetchTournamentZones(tournamentId);
    if (!zonesResult.success || !zonesResult.zones) {
      console.error("[populateTournamentSeedCouples] Error fetching zones:", zonesResult.error);
      return { success: false, error: zonesResult.error || "No se pudieron obtener las zonas del torneo." };
    }

    if (zonesResult.zones.length === 0) {
      console.log("[populateTournamentSeedCouples] No zones found for this tournament.");
      return { success: true, message: "No hay zonas en el torneo para generar cabezas de serie.", seededCouples: [] };
    }

    let allRankedCouples: {
      couple_id: string;
      tournament_id: string;
      zone_id: string;
      zone_name?: string;
      rank_in_zone: number;
      stats: any; // Assuming stats object is available
      player1_name?: string;
      player2_name?: string;
    }[] = [];

    // 2. Determine ranking within each zone and collect all qualifying couples
    // Use unified sorting function for consistent ranking across all zones
    for (const zone of zonesResult.zones) {
      if (!zone.couples || zone.couples.length === 0) {
        console.log(`[populateTournamentSeedCouples] Zone ${zone.name} has no couples.`);
        continue;
      }

      // Fetch zone matches for head-to-head calculation
      const { data: zoneMatches, error: zoneMatchesError } = await supabase
        .from("matches")
        .select("couple1_id, couple2_id, winner_id, status")
        .eq("zone_id", zone.id)
        .eq("status", "FINISHED");

      // Convert zone couples to CoupleWithExtendedStats format  
      const couplesWithExtendedStats: CoupleWithExtendedStats[] = zone.couples.map((couple: any): CoupleWithExtendedStats => ({
        ...couple,
        stats: couple.stats || { played: 0, won: 0, lost: 0, scored: 0, conceded: 0, points: 0 }
      }));

      // Use unified sorting function with head-to-head support
      const sortedCouplesInZone = sortCouplesInZone(
        couplesWithExtendedStats,
        zoneMatchesError ? [] : (zoneMatches || [])
      );

      sortedCouplesInZone.forEach((couple, index) => {
        allRankedCouples.push({
          couple_id: couple.id,
          tournament_id: tournamentId,
          zone_id: zone.id,
          zone_name: zone.name,
          rank_in_zone: index + 1, // 1-based rank within the zone
          stats: couple.stats,
          player1_name: couple.player1_name,
          player2_name: couple.player2_name,
        });
      });
    }

    if (allRankedCouples.length === 0) {
      console.log("[populateTournamentSeedCouples] No couples found across all zones after ranking.");
      return { success: true, message: "No hay parejas clasificadas de las zonas.", seededCouples: [] };
    }
    
    // 3. Global seeding based on zone rank and then points/stats (inter-zone tie-breaking)
    // Example: All #1s from zones are seeded first, then all #2s, etc.
    // Within the same rank (e.g. all #1s), further sort by points or other stats.
    const globallySeededCouples = allRankedCouples.sort((a, b) => {
      if (a.rank_in_zone !== b.rank_in_zone) {
        return a.rank_in_zone - b.rank_in_zone; // Lower rank_in_zone is better (1st, 2nd)
      }
      // Tie-breaking for couples with the same rank_in_zone (e.g. two zone winners)
      const pointsA = a.stats?.points || 0;
      const pointsB = b.stats?.points || 0;
      if (pointsB !== pointsA) return pointsB - pointsA;

      const gamesWonA = a.stats?.scored || 0;
      const gamesWonB = b.stats?.scored || 0;
      if (gamesWonB !== gamesWonA) return gamesWonB - gamesWonA;
      
      const gamesConcededA = a.stats?.conceded || 0;
      const gamesConcededB = b.stats?.conceded || 0;
      return gamesConcededA - gamesConcededB;
    });

    const seedInserts = globallySeededCouples.map((couple, index) => ({
      tournament_id: tournamentId,
      couple_id: couple.couple_id,
      seed: index + 1, // Overall seed (1-based)
      zone_id: couple.zone_id,
      // You might want to store some stats here too, e.g., JSON.stringify(couple.stats)
    }));

    // 4. Clear old seeds for this tournament and insert new ones
    const { error: deleteError } = await supabase
      .from("tournament_couple_seeds")
      .delete()
      .eq("tournament_id", tournamentId);

    if (deleteError) {
      console.error("[populateTournamentSeedCouples] Error deleting old seeds:", deleteError);
      return { success: false, error: `Error limpiando cabezas de serie antiguas: ${deleteError.message}` };
    }

    const { data: insertedSeeds, error: insertError } = await supabase
      .from("tournament_couple_seeds")
      .insert(seedInserts)
      .select();

    if (insertError) {
      console.error("[populateTournamentSeedCouples] Error inserting new seeds:", insertError);
      // Consider what to do if insert fails after delete. Maybe wrap in transaction if Supabase JS client supports it easily.
      return { success: false, error: `Error guardando cabezas de serie: ${insertError.message}` };
    }
    
    console.log(`[populateTournamentSeedCouples] Successfully seeded ${insertedSeeds?.length} couples for tournament ${tournamentId}.`);
    return { success: true, message: "Cabezas de serie generadas y guardadas.", seededCouples: insertedSeeds || [] };

  } catch (e: any) {
    console.error("[populateTournamentSeedCouples] Unexpected error:", e);
    return { success: false, error: `Error inesperado al generar cabezas de serie: ${e.message}` };
  }
} 

export async function removePlayerFromTournament(tournamentId: string, playerId?: string, recordLateWithdrawal: boolean = false): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient();
  
  // Si no se proporciona playerId, obtener el del usuario autenticado
  let targetPlayerId = playerId;
  let currentUserId: string | null = null;
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, message: "Debes iniciar sesión para eliminar tu inscripción." };
  }

  currentUserId = user.id;

  if (!targetPlayerId) {
    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (playerError || !playerData?.id) {
      return { success: false, message: "No se pudo encontrar tu perfil de jugador." };
    }
    
    targetPlayerId = playerData.id;
  }

  try {
    const { data: currentPlayerProfile } = await supabase
      .from('players')
      .select('id')
      .eq('user_id', currentUserId)
      .maybeSingle();

    const isDeletingOwnRegistration = currentPlayerProfile?.id === targetPlayerId;

    if (!isDeletingOwnRegistration) {
      const permissions = await checkTournamentPermissions(currentUserId, tournamentId);
      if (!permissions.hasPermission) {
        return { success: false, message: permissions.reason || "No tienes permisos para eliminar esta inscripción." };
      }
    }

    // Buscar solo inscripciones individuales del jugador en este torneo
    const { data: inscriptions, error: fetchError } = await supabase
      .from('inscriptions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', targetPlayerId)
      .is('couple_id', null);

    if (fetchError) {
      console.error("[removePlayerFromTournament] Error fetching inscriptions:", fetchError);
      return { success: false, message: "Error al buscar las inscripciones." };
    }

    if (!inscriptions || inscriptions.length === 0) {
      return { success: false, message: "No se encontró ninguna inscripción para eliminar." };
    }

    const inscriptionIds = inscriptions.map(inscription => inscription.id);
    const cancellationEvents = inscriptions.map((inscription) => ({
      inscriptionId: inscription.id,
      playerId: targetPlayerId,
    }));

    // Eliminar todas las inscripciones individuales encontradas
    const { error: deleteError } = await supabase
      .from('inscriptions')
      .delete()
      .in('id', inscriptionIds);

    if (deleteError) {
      console.error("[removePlayerFromTournament] Error deleting inscriptions:", deleteError);
      return { success: false, message: "Error al eliminar la inscripción." };
    }

    const { recordTpeLateWithdrawal } = await import('@/lib/services/tpe-registration-restrictions')
    const cancellationSource = isDeletingOwnRegistration ? 'PLAYER' : 'ORGANIZER'
    await Promise.all(
      inscriptions.map((inscription) => recordTpeLateWithdrawal({
        tournamentId,
        inscriptionId: inscription.id,
        playerIds: [targetPlayerId!],
        cancelledByUserId: currentUserId!,
        cancellationSource,
        forceRecord: cancellationSource === 'ORGANIZER' && recordLateWithdrawal,
      })
    )
    )

    try {
      const { sendTournamentMessage } = await import('@/lib/services/messages');
      await Promise.allSettled(
        cancellationEvents.map((event) =>
          sendTournamentMessage({
            type: 'INSCRIPTION_CANCELLED_ADMIN',
            supabase,
            tournamentId,
            inscriptionId: event.inscriptionId,
            playerId: event.playerId,
          })
        )
      );
    } catch (emailError) {
      console.error('[removePlayerFromTournament] Error enviando email de cancelacion:', emailError);
    }

    // Revalidar las rutas para actualizar la UI
    revalidatePath(`/tournaments/${tournamentId}`);
    revalidatePath('/torneos');
    revalidatePath('/tournaments');
    revalidatePath(`/my-tournaments/${tournamentId}`);

    return { success: true, message: "Inscripción eliminada exitosamente." };
  } catch (error) {
    console.error("[removePlayerFromTournament] Unexpected error:", error);
    return { success: false, message: "Error inesperado al eliminar la inscripción." };
  }
}

export async function checkPlayerInscriptionStatus(tournamentId: string, playerId: string): Promise<{ success: boolean; isRegistered: boolean; registrationType?: 'individual' | 'couple'; error?: string }> {
  const supabase = await createClient();
  
  try {
    // Check if player is registered individually
    const { data: individualInscription, error: individualError } = await supabase
      .from('inscriptions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .is('couple_id', null)
      .maybeSingle();

    if (individualError) {
      console.error("[checkPlayerInscriptionStatus] Error checking individual inscription:", individualError);
      return { success: false, isRegistered: false, error: "Error al verificar inscripción individual." };
    }

    if (individualInscription) {
      return { success: true, isRegistered: true, registrationType: 'individual' };
    }

    // Check if player is registered in a couple
    const { data: coupleInscriptions, error: coupleError } = await supabase
      .from('inscriptions')
      .select(`
        id,
        couples (
          id,
          player1_id,
          player2_id
        )
      `)
      .eq('tournament_id', tournamentId)
      .not('couple_id', 'is', null);

    if (coupleError) {
      console.error("[checkPlayerInscriptionStatus] Error checking couple inscriptions:", coupleError);
      return { success: false, isRegistered: false, error: "Error al verificar inscripciones de parejas." };
    }

    const playerInCouple = coupleInscriptions?.find(inscription => {
      const couple = inscription.couples;
      if (couple && couple.length > 0) {
        const coupleData = couple[0];
        return coupleData.player1_id === playerId || coupleData.player2_id === playerId;
      }
      return false;
    });

    if (playerInCouple) {
      return { success: true, isRegistered: true, registrationType: 'couple' };
    }

    return { success: true, isRegistered: false };
  } catch (error) {
    console.error("[checkPlayerInscriptionStatus] Unexpected error:", error);
    return { success: false, isRegistered: false, error: "Error inesperado al verificar inscripción." };
  }
}

export async function pairIndividualPlayers(tournamentId: string, player1Id: string, player2Id: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const supabase = await createClient();
  
  try {
    // Verificar que ambos jugadores estén inscritos individualmente en el torneo
    const { data: player1Inscription, error: p1Error } = await supabase
      .from('inscriptions')
      .select('id, player_id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', player1Id)
      .is('couple_id', null)
      .maybeSingle();

    if (p1Error) {
      console.error("[pairIndividualPlayers] Error checking player 1 inscription:", p1Error);
      return { success: false, error: "Error al verificar la inscripción del primer jugador." };
    }

    if (!player1Inscription) {
      return { success: false, error: "El primer jugador no está inscrito individualmente en este torneo." };
    }

    const { data: player2Inscription, error: p2Error } = await supabase
      .from('inscriptions')
      .select('id, player_id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', player2Id)
      .is('couple_id', null)
      .maybeSingle();

    if (p2Error) {
      console.error("[pairIndividualPlayers] Error checking player 2 inscription:", p2Error);
      return { success: false, error: "Error al verificar la inscripción del segundo jugador." };
    }

    if (!player2Inscription) {
      return { success: false, error: "El segundo jugador no está inscrito individualmente en este torneo." };
    }

    // Verificar que no sean el mismo jugador
    if (player1Id === player2Id) {
      return { success: false, error: "No se puede emparejar un jugador consigo mismo." };
    }

    // Crear o encontrar la pareja
    const { data: existingCouple, error: findCoupleError } = await supabase
      .from('couples')
      .select('id')
      .or(`and(player1_id.eq.${player1Id},player2_id.eq.${player2Id}),and(player1_id.eq.${player2Id},player2_id.eq.${player1Id})`)
      .maybeSingle();

    if (findCoupleError) {
      console.error("[pairIndividualPlayers] Error checking existing couple:", findCoupleError);
      return { success: false, error: "Error al verificar pareja existente." };
    }

    let coupleId: string;
    
    if (existingCouple) {
      coupleId = existingCouple.id;
    } else {
      // Crear nueva pareja
      const { data: newCouple, error: coupleError } = await supabase
        .from('couples')
        .insert({ player1_id: player1Id, player2_id: player2Id })
        .select('id')
        .single();
      
      if (coupleError || !newCouple?.id) {
        console.error("[pairIndividualPlayers] Error creating couple:", coupleError);
        return { success: false, error: "No se pudo crear la pareja." };
      }
      coupleId = newCouple.id;
    }

    // Verificar que la pareja no esté ya inscrita en el torneo
    const { data: existingCoupleInscription, error: checkCoupleError } = await supabase
      .from('inscriptions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('couple_id', coupleId)
      .maybeSingle();

    if (checkCoupleError) {
      console.error("[pairIndividualPlayers] Error checking existing couple inscription:", checkCoupleError);
      return { success: false, error: "Error al verificar inscripción de pareja existente." };
    }
    
    if (existingCoupleInscription) {
      return { success: false, error: "Esta pareja ya está inscrita en el torneo." };
    }

    // Crear inscripción de la pareja
    const { data: newInscription, error: inscriptionError } = await supabase
      .from('inscriptions')
      .insert({ 
        tournament_id: tournamentId, 
        couple_id: coupleId, 
        player_id: player1Id, // Usar player1 como contacto principal
      })
      .select('id')
      .single(); 
      
    if (inscriptionError) {
      console.error("[pairIndividualPlayers] Error creating couple inscription:", inscriptionError);
      return { success: false, error: "No se pudo inscribir la pareja." };
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('type')
      .eq('id', tournamentId)
      .single();

    if (tournamentError) {
      console.error("[pairIndividualPlayers] Error checking tournament type:", tournamentError);
      await removeTournamentCoupleMembership({
        supabase,
        tournamentId,
        coupleId,
        deleteInscription: false,
      });
      await supabase.from('inscriptions').delete().eq('id', newInscription.id);
      return { success: false, error: "Error al verificar el tipo de torneo." };
    }

    if (tournament?.type === 'LONG') {
      const ensuredZoneResult = await ensureLongTournamentGeneralZone(tournamentId);
      if (!ensuredZoneResult.success) {
        await supabase.from('inscriptions').delete().eq('id', newInscription.id);
        return { success: false, error: ensuredZoneResult.error || "No se pudo preparar la zona del torneo." };
      }

      const { data: zone, error: zoneError } = await supabase
        .from('zones')
        .select('id')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (zoneError || !zone) {
        console.error('[pairIndividualPlayers] Error finding LONG zone:', zoneError);
        await supabase.from('inscriptions').delete().eq('id', newInscription.id);
        return { success: false, error: "No se encontro zona para el torneo LONG." };
      }

      const membershipResult = await ensureCanonicalZoneMembership({
        supabase,
        tournamentId,
        zoneId: zone.id,
        coupleId,
      });

      if (!membershipResult.success) {
        console.error('[pairIndividualPlayers] Error assigning canonical zone membership:', membershipResult.error);
        await supabase.from('inscriptions').delete().eq('id', newInscription.id);
        return { success: false, error: "No se pudo asignar la pareja a la zona del torneo." };
      }

      if (membershipResult.mirrorWarning) {
        console.warn('[pairIndividualPlayers] zone_couples mirror warning:', membershipResult.mirrorWarning);
      }
    }

    // Eliminar las inscripciones individuales de ambos jugadores
    const { error: deleteError } = await supabase
      .from('inscriptions')
      .delete()
      .in('id', [player1Inscription.id, player2Inscription.id]);

    if (deleteError) {
      console.error("[pairIndividualPlayers] Error deleting individual inscriptions:", deleteError);
      // Intentar rollback de la inscripción de pareja
      await removeTournamentCoupleMembership({
        supabase,
        tournamentId,
        coupleId,
        deleteInscription: false,
      });
      await supabase.from('inscriptions').delete().eq('id', newInscription.id);
      return { success: false, error: "Error al eliminar las inscripciones individuales." };
    }
    
    // 🔥 FIX: Add zone assignment for LONG tournaments (missing logic that was causing zone_couples not to be populated)
    try {
      // Get tournament type to check if it's LONG
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select('type')
        .eq('id', tournamentId)
        .single();
      
      if (!tournamentError && tournament?.type === 'LONG' && process.env.NODE_ENV === 'legacy-zone-couples-disabled') {
        console.log('[pairIndividualPlayers] Assigning couple to zone for LONG tournament');
        
        // Find the zone for this tournament
        const { data: zone, error: zoneError } = await supabase
          .from('zones')
          .select('id')
          .eq('tournament_id', tournamentId)
          .single();
        
        if (!zoneError && zone) {
          // Assign couple to zone
          const { error: assignmentError } = await supabase
            .from('zone_couples')
            .insert({
              zone_id: zone.id,
              couple_id: coupleId
            });
          
          if (assignmentError) {
            console.error('[pairIndividualPlayers] Error assigning couple to zone:', assignmentError);
            // Don't fail the pairing, just log the error
          } else {
            console.log(`✅ [pairIndividualPlayers] Couple ${coupleId} assigned to zone ${zone.id}`);
          }
        } else {
          console.warn('[pairIndividualPlayers] No zone found for LONG tournament:', tournamentId);
        }
      }
    } catch (zoneErr) {
      console.error('[pairIndividualPlayers] Unexpected error assigning to zone:', zoneErr);
      // Don't fail the pairing
    }
    
    revalidatePath(`/tournaments/${tournamentId}`);
    revalidatePath(`/my-tournaments/${tournamentId}`);
    
    return { success: true, message: "Jugadores emparejados exitosamente." };
  } catch (error: any) {
    console.error("[pairIndividualPlayers] Unexpected error:", error);
    return { success: false, error: "Error inesperado al emparejar jugadores." };
  }
}

/**
 * 🎾 ELIMINACIÓN DE PAREJA (USANDO STRATEGY PATTERN)
 * 
 * Función principal refactorizada para usar el sistema Strategy Pattern.
 * Mantiene backward compatibility con la signatura original.
 */
export async function removeCoupleFromTournament(tournamentId: string, coupleId: string, recordLateWithdrawal: boolean = false): Promise<{ success: boolean; message: string }> {
  console.log(`[removeCoupleFromTournament] 🔄 Refactorizado con Strategy Pattern`, { tournamentId, coupleId });
  
  // Usar la nueva implementación V2 con Strategy Pattern
  return await removeCoupleFromTournamentV2(tournamentId, coupleId, recordLateWithdrawal);
}

/**
 * Upload winner image for a tournament
 */
export async function uploadTournamentWinnerImage(tournamentId: string, file: File) {
  const supabase = await createClient();

  try {
    // Verify user has permission to upload (tournament owner or organization member)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('User not authenticated:', userError?.message);
      return { success: false, error: 'Usuario no autenticado' };
    }

    // Check tournament permissions using centralized function
    const permissions = await checkTournamentPermissions(user.id, tournamentId);
    if (!permissions.hasPermission) {
      return {
        success: false,
        error: permissions.reason || 'No tienes permisos para subir imágenes a este torneo'
      };
    }

    // Generate file path: tournaments/{tournamentId}/winner.{extension}
    const fileExtension = file.name.split('.').pop();
    const fileName = `${tournamentId}/winner.${fileExtension}`;
    
    // Upload file to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('tournaments')
      .upload(fileName, file, {
        upsert: true // Replace if exists
      });

    if (uploadError) {
      console.error('Error uploading winner image:', uploadError);
      return { success: false, error: uploadError.message };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('tournaments')
      .getPublicUrl(fileName);

    // Update tournament record with winner image URL
    const { error: updateError } = await supabase
      .from('tournaments')
      .update({ winner_image_url: publicUrl })
      .eq('id', tournamentId);

    if (updateError) {
      console.error('Error updating tournament winner image URL:', updateError);
      return { success: false, error: updateError.message };
    }

    // Revalidate relevant paths
    revalidatePath(`/my-tournaments/${tournamentId}`);
    revalidatePath(`/tournaments/${tournamentId}`);

    return { success: true, url: publicUrl };
  } catch (error) {
    console.error('Unexpected error uploading winner image:', error);
    return { success: false, error: 'Error inesperado al subir la imagen' };
  }
}

/**
 * Get weekly winners - tournaments finished in the last 7 days with winner details
 */
export async function getWeeklyWinners() {
  const supabase = await createClient();
  
  try {
    // Calculate date 7 days ago
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    // Get tournaments finished in the last 7 days with winner information
    const { data: tournaments, error } = await supabase
      .from('tournaments')
      .select('id, name, winner_image_url, end_date, winner_id')
      .eq('status', 'FINISHED')
      .not('winner_id', 'is', null)
      .not('winner_image_url', 'is', null)
      .gte('end_date', weekAgo.toISOString())
      .order('end_date', { ascending: false })
      .limit(6);

    if (error || !tournaments) {
      console.error('Error fetching weekly winners:', error);
      return [];
    }

    // Get winner details for each tournament
    const winnersWithDetails = [];
    for (const tournament of tournaments) {
      const { data: couple, error: coupleError } = await supabase
        .from('couples')
        .select(`
          id,
          player1:players!couples_player1_id_fkey(first_name, last_name),
          player2:players!couples_player2_id_fkey(first_name, last_name)
        `)
        .eq('id', tournament.winner_id)
        .single();

      if (!coupleError && couple) {
        const player1 = Array.isArray(couple.player1) ? couple.player1[0] : couple.player1;
        const player2 = Array.isArray(couple.player2) ? couple.player2[0] : couple.player2;

        winnersWithDetails.push({
          id: tournament.id,
          tournamentName: tournament.name,
          winnerImageUrl: tournament.winner_image_url,
          endDate: tournament.end_date,
          winner: {
            id: couple.id,
            player1Name: `${player1?.first_name || ''} ${player1?.last_name || ''}`.trim(),
            player2Name: `${player2?.first_name || ''} ${player2?.last_name || ''}`.trim(),
          }
        });
      }
    }

    return winnersWithDetails;

  } catch (error) {
    console.error('Unexpected error fetching weekly winners:', error);
    return [];
  }
}

/**
 * Upload pre-tournament image for a tournament
 */
export async function uploadTournamentPreImage(tournamentId: string, file: File) {
  const supabase = await createClient();

  try {
    // Verify user has permission to upload (tournament owner or organization member)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('User not authenticated:', userError?.message);
      return { success: false, error: 'Usuario no autenticado' };
    }

    // Check tournament permissions using centralized function
    const permissions = await checkTournamentPermissions(user.id, tournamentId);
    if (!permissions.hasPermission) {
      return {
        success: false,
        error: permissions.reason || 'No tienes permisos para subir imágenes a este torneo'
      };
    }

    // Generate file path: tournaments/{tournamentId}/pre-tournament.{extension}
    const fileExtension = file.name.split('.').pop();
    const fileName = `${tournamentId}/pre-tournament.${fileExtension}`;

    // Upload file to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('tournaments')
      .upload(fileName, file, {
        upsert: true // Replace if exists
      });

    if (uploadError) {
      console.error('Error uploading pre-tournament image:', uploadError);
      return { success: false, error: uploadError.message };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('tournaments')
      .getPublicUrl(fileName);

    // Update tournament record with pre-tournament image URL
    const { error: updateError } = await supabase
      .from('tournaments')
      .update({ pre_tournament_image_url: publicUrl })
      .eq('id', tournamentId);

    if (updateError) {
      console.error('Error updating tournament pre-tournament image URL:', updateError);
      return { success: false, error: updateError.message };
    }

    // Revalidate relevant paths
    revalidatePath(`/my-tournaments/${tournamentId}`);
    revalidatePath(`/tournaments/${tournamentId}`);

    // Use getStorageUrl for local development compatibility
    const { getStorageUrl } = await import('@/utils/storage-url');
    const displayUrl = getStorageUrl(publicUrl);

    return { success: true, url: displayUrl || publicUrl };
  } catch (error) {
    console.error('Unexpected error uploading pre-tournament image:', error);
    return { success: false, error: 'Error inesperado al subir la imagen' };
  }
}

/**
 * Set club cover image as pre-tournament image fallback
 */
export async function setClubCoverAsPreTournamentImage(tournamentId: string) {
  const supabase = await createClient();

  try {
    // Verify user has permission
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('User not authenticated:', userError?.message);
      return { success: false, error: 'Usuario no autenticado' };
    }

    // Check tournament permissions using centralized function
    const permissions = await checkTournamentPermissions(user.id, tournamentId);
    if (!permissions.hasPermission) {
      return {
        success: false,
        error: permissions.reason || 'No tienes permisos para modificar este torneo'
      };
    }

    // Get tournament and club data
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select(`
        id,
        clubes(
          id,
          cover_image_url
        )
      `)
      .eq('id', tournamentId)
      .single();

    if (tournamentError || !tournament) {
      console.error('Tournament not found:', tournamentError?.message);
      return { success: false, error: 'Torneo no encontrado' };
    }

    // Type assertion to access the nested club data
    const tournamentWithClub = tournament as any;

    const clubCoverUrl = tournamentWithClub.clubes.cover_image_url;
    if (!clubCoverUrl) {
      return { success: false, error: 'El club no tiene imagen de portada configurada' };
    }

    // Update tournament record with club cover image as pre-tournament image
    const { error: updateError } = await supabase
      .from('tournaments')
      .update({ pre_tournament_image_url: clubCoverUrl })
      .eq('id', tournamentId);

    if (updateError) {
      console.error('Error setting club cover as pre-tournament image:', updateError);
      return { success: false, error: updateError.message };
    }

    // Revalidate relevant paths
    revalidatePath(`/my-tournaments/${tournamentId}`);
    revalidatePath(`/tournaments/${tournamentId}`);

    // Use getStorageUrl for local development compatibility
    const { getStorageUrl } = await import('@/utils/storage-url');
    const displayUrl = getStorageUrl(clubCoverUrl);

    return { success: true, url: displayUrl || clubCoverUrl };
  } catch (error) {
    console.error('Unexpected error setting club cover as pre-tournament image:', error);
    return { success: false, error: 'Error inesperado al configurar la imagen' };
  }
}



export type GetClubTournamentsResult = {
  success: boolean;
  message?: string;
  tournaments?: Tournament[];
};

export async function getClubTournaments(): Promise<GetClubTournamentsResult> {
  // Get the authenticated user
  const user = await getUser();
  
  if (!user) {
    return {
      success: false,
      message: "No estás autenticado. Por favor, inicia sesión nuevamente."
    };
  }
  
  // Create Supabase client
  const supabase = await createClient();
  
  // Find the club ID associated with the user (no is_active filter for internal club operations)
  const { data: clubData, error: clubError } = await supabase
    .from('clubes')
    .select('id, name, address')
    .eq('user_id', user.id)
    .single();
  
  if (clubError || !clubData) {
    console.error("Error fetching club data:", clubError);
    return {
      success: false,
      message: "No se encontró información de club para tu usuario."
    };
  }
  
  try {
    // Fetch tournaments for this club
    const { data: tournamentsData, error: tournamentsError } = await supabase
      .from('tournaments')
      .select('*')
      .eq('club_id', clubData.id)
      .order('start_date', { ascending: false });
    
    if (tournamentsError) {
      console.error("Error fetching tournaments:", tournamentsError);
      return {
        success: false,
        message: `Error al cargar torneos: ${tournamentsError.message}`
      };
    }
    
    // Map database fields to Tournament type
    const tournaments = tournamentsData.map(tournament => ({
      id: tournament.id,
      name: tournament.name,
      startDate: tournament.start_date,
      endDate: tournament.end_date,
      type: tournament.type as "AMERICAN" | "LONG",
      status: tournament.status as "NOT_STARTED" | "IN_PROGRESS" | "FINISHED" | "PAIRING",
      category: tournament.category,
      gender: tournament.gender || "MIXED",
      createdAt: tournament.created_at,
      club: {
        id: clubData.id,
        name: clubData.name,
        address: clubData.address
      }
    } as Tournament));
    
    return {
      success: true,
      tournaments
    };
    
  } catch (error: any) {
    console.error("Unexpected error fetching tournaments:", error);
    return {
      success: false,
      message: `Error inesperado: ${error.message}`
    };
  }
}

// New Edge Function wrapper for club tournaments with metrics
export type GetClubTournamentsWithMetricsResult = {
  success: boolean;
  message?: string;
  tournaments?: {
    id: string;
    name: string;
    status: string;
    pre_tournament_image_url: string | null;
    start_date: string;
    end_date: string | null;
    category_name: string;
    gender: string;
    type: string;
    price: number | string | null;
    clubes?: {
      id: string;
      name: string;
    } | null;
    inscriptions: number;
    matchesFinished: number;
    matchesPending: number;
    totalMatches: number;
    is_draft?: boolean;
  }[];
};

export async function getClubTournamentsWithMetrics(
  statusFilter?: string[],
  limit?: number
): Promise<GetClubTournamentsWithMetricsResult> {
  // Get the authenticated user
  const user = await getUser();

  if (!user) {
    return {
      success: false,
      message: "No estás autenticado. Por favor, inicia sesión nuevamente."
    };
  }

  // Create Supabase client
  const supabase = await createClient();

  // Get user role
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userError || !userData) {
    console.error("Error fetching user role:", userError);
    return {
      success: false,
      message: "No se pudo determinar tu rol de usuario."
    };
  }

  const userRole = userData.role;

  try {
    let result;

    // ORGANIZADOR: Use get-organization-tournaments edge function
    if (userRole === 'ORGANIZADOR') {
      // Get organization_id from organization_members
      const { data: orgMember, error: orgError } = await supabase
        .from('organization_members')
        .select('organizacion_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (orgError || !orgMember) {
        console.error("Error fetching organization data:", orgError);
        return {
          success: false,
          message: "No se encontró información de organización para tu usuario."
        };
      }

      const { data: edgeResult, error: edgeFunctionError } = await supabase.functions.invoke(
        'get-organization-tournaments',
        {
          body: {
            organizationId: orgMember.organizacion_id,
            statusFilter,
            limit
          }
        }
      );

      if (edgeFunctionError) {
        console.error("Error calling get-organization-tournaments edge function:", edgeFunctionError);
        return {
          success: false,
          message: `Error al cargar torneos: ${edgeFunctionError.message}`
        };
      }

      result = edgeResult;
    }
    // CLUB: Use get-club-tournaments edge function
    else if (userRole === 'CLUB') {
      // Find the club ID associated with the user
      const { data: clubData, error: clubError } = await supabase
        .from('clubes')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (clubError || !clubData) {
        console.error("Error fetching club data:", clubError);
        return {
          success: false,
          message: "No se encontró información de club para tu usuario."
        };
      }

      const { data: edgeResult, error: edgeFunctionError } = await supabase.functions.invoke(
        'get-club-tournaments',
        {
          body: {
            clubId: clubData.id,
            statusFilter,
            limit
          }
        }
      );

      if (edgeFunctionError) {
        console.error("Error calling get-club-tournaments edge function:", edgeFunctionError);
        return {
          success: false,
          message: `Error al cargar torneos: ${edgeFunctionError.message}`
        };
      }

      result = edgeResult;
    }
    else {
      return {
        success: false,
        message: "Tu rol no tiene acceso a esta funcionalidad."
      };
    }

    if (!result?.success) {
      return {
        success: false,
        message: result?.error || "Error al cargar torneos"
      };
    }

    return {
      success: true,
      tournaments: result.tournaments || []
    };

  } catch (error: any) {
    console.error("Unexpected error fetching tournaments with metrics:", error);
    return {
      success: false,
      message: `Error inesperado: ${error.message}`
    };
  }
}

// --- RANKING AND HISTORY TRACKING FUNCTIONS ---

/**
 * Obtiene el lunes de la semana de una fecha dada
 */
function getWeekStartDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajustar para que lunes sea el primer día
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0]; // Solo la fecha YYYY-MM-DD
}

/**
 * Calcula el ranking actual de todos los jugadores
 */
async function calculateCurrentRanking(supabase: any): Promise<{player_id: string, score: number, rank_position: number}[]> {
  const { data: players, error } = await supabase
    .from('players')
    .select('id, score')
    .eq('status', 'active')
    .order('score', { ascending: false });
    
  if (error || !players) {
    console.error('[calculateCurrentRanking] Error fetching players:', error);
    return [];
  }
  
  return players.map((player: any, index: number) => ({
    player_id: player.id,
    score: player.score || 0,
    rank_position: index + 1
  }));
}

/**
 * Crea un snapshot semanal del ranking
 */
async function createWeeklyRankingSnapshot(weekStartDate: string, supabase: any): Promise<boolean> {
  try {
    const ranking = await calculateCurrentRanking(supabase);
    
    if (ranking.length === 0) {
      console.log('[createWeeklyRankingSnapshot] No players found for ranking');
      return true;
    }
    
    // Preparar datos para insertar
    const snapshotData = ranking.map(rank => ({
      player_id: rank.player_id,
      rank_position: rank.rank_position,
      score: rank.score,
      week_start_date: weekStartDate,
      snapshot_type: 'weekly'
    }));
    
    // Insertar snapshot (usando upsert por si ya existe)
    const { error } = await supabase
      .from('ranking_snapshots')
      .upsert(snapshotData, { 
        onConflict: 'player_id,week_start_date,snapshot_type',
        ignoreDuplicates: false 
      });
      
    if (error) {
      console.error('[createWeeklyRankingSnapshot] Error inserting snapshot:', error);
      return false;
    }
    
    console.log(`[createWeeklyRankingSnapshot] Created weekly snapshot for ${weekStartDate} with ${ranking.length} players`);
    return true;
  } catch (e: any) {
    console.error('[createWeeklyRankingSnapshot] Unexpected error:', e);
    return false;
  }
}

/**
 * Genera el historial de tournament para todos los jugadores de un torneo
 */
async function generatePlayerTournamentHistory(tournamentId: string, supabase: any): Promise<boolean> {
  try {
    console.log(`[generatePlayerTournamentHistory] Processing tournament ${tournamentId}`);
    
    // Obtener información del torneo
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('end_date, start_date')
      .eq('id', tournamentId)
      .single();
      
    if (tournamentError || !tournament) {
      console.error('[generatePlayerTournamentHistory] Tournament not found:', tournamentError);
      return false;
    }
    
    // Obtener TODOS los jugadores que participaron en el torneo
    // Esto incluye jugadores individuales Y ambos miembros de las parejas
    const allPlayerIds = new Set<string>();
    
    // 1. Obtener jugadores individuales
    const { data: individualInscriptions, error: individualError } = await supabase
      .from('inscriptions')
      .select('player_id')
      .eq('tournament_id', tournamentId)
      .is('couple_id', null)
      .not('player_id', 'is', null);
      
    if (individualError) {
      console.error('[generatePlayerTournamentHistory] Error fetching individual participants:', individualError);
      return false;
    }
    
    // Agregar jugadores individuales
    individualInscriptions?.forEach((inscription: any) => {
      if (inscription.player_id) {
        allPlayerIds.add(inscription.player_id);
      }
    });
    
    // 2. Obtener jugadores de parejas
    const { data: coupleInscriptions, error: coupleError } = await supabase
      .from('inscriptions')
      .select(`
        couple_id,
        couples!inner(
          player1_id,
          player2_id
        )
      `)
      .eq('tournament_id', tournamentId)
      .not('couple_id', 'is', null);
      
    if (coupleError) {
      console.error('[generatePlayerTournamentHistory] Error fetching couple participants:', coupleError);
      return false;
    }
    
    // Agregar ambos jugadores de cada pareja
    coupleInscriptions?.forEach((inscription: any) => {
      const couple = inscription.couples;
      if (couple && couple.player1_id) {
        allPlayerIds.add(couple.player1_id);
      }
      if (couple && couple.player2_id) {
        allPlayerIds.add(couple.player2_id);
      }
    });
    
    console.log(`[generatePlayerTournamentHistory] Found ${allPlayerIds.size} total players (individuals + couples)`);
    
    if (allPlayerIds.size === 0) {
      console.log('[generatePlayerTournamentHistory] No participants found');
      return true;
    }
    
    // Obtener información actual de todos los jugadores ANTES de aplicar puntos del torneo
    const { data: allPlayers, error: playersError } = await supabase
      .from('players')
      .select('id, score, first_name, last_name')
      .in('id', Array.from(allPlayerIds));
      
    if (playersError) {
      console.error('[generatePlayerTournamentHistory] Error fetching player data:', playersError);
      return false;
    }
    
    if (!allPlayers || allPlayers.length === 0) {
      console.log('[generatePlayerTournamentHistory] No player data found');
      return true;
    }
    
    // Calcular ranking actual ANTES de aplicar puntos del torneo
    const currentRanking = await calculateCurrentRanking(supabase);
    const currentRankMap = new Map();
    currentRanking.forEach(rank => {
      currentRankMap.set(rank.player_id, {
        rank_before: rank.rank_position,
        points_before: rank.score
      });
    });
    
    // Preparar datos del historial usando puntos ANTES del torneo
    const historyData = [];
    
    for (const player of allPlayers) {
      const playerId = player.id;
      const currentScore = player.score || 0;
      
      // Usar puntos actuales como points_before (antes del torneo)
      const pointsBefore = currentScore;
      const rankBefore = currentRankMap.get(playerId)?.rank_before || null;
      
      // points_after y rank_after se calcularán después de aplicar los puntos del torneo
      // por ahora los dejamos como null para que se actualicen en el siguiente paso
      
      historyData.push({
        player_id: playerId,
        tournament_id: tournamentId,
        points_before: pointsBefore,
        points_after: null, // Se actualizará después
        points_earned: null, // Se calculará después
        rank_before: rankBefore,
        rank_after: null, // Se actualizará después
        rank_change: null // Se calculará después
      });
    }
    
    // Insertar historial inicial (usando upsert por si ya existe)
    const { error: historyError } = await supabase
      .from('player_tournament_history')
      .upsert(historyData, { 
        onConflict: 'player_id,tournament_id',
        ignoreDuplicates: false 
      });
      
    if (historyError) {
      console.error('[generatePlayerTournamentHistory] Error inserting history:', historyError);
      return false;
    }
    
    console.log(`[generatePlayerTournamentHistory] Created initial history for ${historyData.length} players`);
    return true;
  } catch (e: any) {
    console.error('[generatePlayerTournamentHistory] Unexpected error:', e);
    return false;
  }
}

/**
 * Función para procesar retroactivamente todos los torneos finalizados
 */
export async function processHistoricalTournaments(): Promise<{ success: boolean; message: string; processed?: number }> {
  const supabase = await createClient();
  
  try {
    console.log('[processHistoricalTournaments] Starting historical processing...');
    
    // Obtener todos los torneos finalizados ordenados por fecha
    const { data: tournaments, error } = await supabase
      .from('tournaments')
      .select('id, name, end_date, start_date')
      .eq('status', 'FINISHED')
      .order('end_date', { ascending: true });
      
    if (error) {
      console.error('[processHistoricalTournaments] Error fetching tournaments:', error);
      return { success: false, message: `Error al obtener torneos: ${error.message}` };
    }
    
    if (!tournaments || tournaments.length === 0) {
      return { success: true, message: 'No hay torneos finalizados para procesar', processed: 0 };
    }
    
    let processed = 0;
    const weekSnapshots = new Set<string>();
    
    for (const tournament of tournaments) {
      console.log(`[processHistoricalTournaments] Processing tournament: ${tournament.name}`);
      
      // Crear snapshot semanal si no existe
      const tournamentDate = new Date(tournament.end_date || tournament.start_date || new Date());
      const weekStart = getWeekStartDate(tournamentDate);
      
      if (!weekSnapshots.has(weekStart)) {
        await createWeeklyRankingSnapshot(weekStart, supabase);
        weekSnapshots.add(weekStart);
      }
      
      // Generar historial del torneo
      const success = await generatePlayerTournamentHistory(tournament.id, supabase);
      if (success) {
        processed++;
      }
      
      // Crear snapshot post-torneo
      await createWeeklyRankingSnapshot(weekStart, supabase);
    }
    
    console.log(`[processHistoricalTournaments] Completed. Processed ${processed} tournaments`);
    return { 
      success: true, 
      message: `Procesamiento completado. ${processed} torneos procesados exitosamente.`,
      processed 
    };
    
  } catch (e: any) {
    console.error('[processHistoricalTournaments] Unexpected error:', e);
    return { success: false, message: `Error inesperado: ${e.message}` };
  }
} 

/**
 * Obtiene las estadísticas de la semana: jugadores que más puntos sumaron
 */
export async function getWeeklyTopPerformers(weekStartDate?: string): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
  weekStart?: string;
}> {
  const supabase = await createClient();
  
  try {
    // Si no se proporciona fecha, usar la semana actual
    const targetWeekStart = weekStartDate || getWeekStartDate(new Date());
    
    // Obtener historial de torneos de esa semana
    const { data: weekHistory, error } = await supabase
      .from('player_tournament_history')
      .select(`
        player_id,
        points_earned,
        rank_change,
        points_before,
        points_after,
        tournament_id,
        tournaments!inner(name, end_date),
        players!inner(first_name, last_name)
      `)
      .gte('created_at', `${targetWeekStart}T00:00:00Z`)
      .lt('created_at', `${new Date(new Date(targetWeekStart).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}T00:00:00Z`)
      .order('points_earned', { ascending: false });
    
    if (error) {
      console.error('[getWeeklyTopPerformers] Error fetching weekly data:', error);
      return { success: false, error: error.message };
    }
    
    if (!weekHistory || weekHistory.length === 0) {
      return { 
        success: true, 
        data: [], 
        weekStart: targetWeekStart,
        error: 'No hay datos para esta semana' 
      };
    }
    
    // Procesar datos para mostrar top performers
    const processedData = weekHistory
      .filter((record: any) => record.points_earned > 0) // Solo los que sumaron puntos
      .slice(0, 10) // Top 10
      .map((record: any) => ({
        playerId: record.player_id,
        playerName: `${record.players.first_name} ${record.players.last_name}`.trim(),
        pointsEarned: record.points_earned,
        rankChange: record.rank_change,
        pointsBefore: record.points_before,
        pointsAfter: record.points_after,
        tournamentName: record.tournaments.name,
        tournamentDate: record.tournaments.end_date
      }));
    
    return {
      success: true,
      data: processedData,
      weekStart: targetWeekStart
    };
    
  } catch (e: any) {
    console.error('[getWeeklyTopPerformers] Unexpected error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Obtiene comparación de ranking entre dos semanas
 */
export async function getWeeklyRankingComparison(currentWeek?: string, previousWeek?: string): Promise<{
  success: boolean;
  data?: {
    biggestGainers: any[];
    biggestLosers: any[];
    weeklyStats: {
      currentWeek: string;
      previousWeek: string;
      totalPlayers: number;
      playersWithChanges: number;
    };
  };
  error?: string;
}> {
  const supabase = await createClient();
  
  try {
    const currentWeekStart = currentWeek || getWeekStartDate(new Date());
    const previousWeekDate = new Date(currentWeekStart);
    previousWeekDate.setDate(previousWeekDate.getDate() - 7);
    const previousWeekStart = previousWeek || previousWeekDate.toISOString().split('T')[0];
    
    // Obtener snapshots de ambas semanas
    const [currentSnapshots, previousSnapshots] = await Promise.all([
      supabase
        .from('ranking_snapshots')
        .select(`
          player_id,
          rank_position,
          score,
          players!inner(first_name, last_name)
        `)
        .eq('week_start_date', currentWeekStart)
        .eq('snapshot_type', 'weekly'),
      
      supabase
        .from('ranking_snapshots')
        .select(`
          player_id,
          rank_position,
          score,
          players!inner(first_name, last_name)
        `)
        .eq('week_start_date', previousWeekStart)
        .eq('snapshot_type', 'weekly')
    ]);
    
    if (currentSnapshots.error || previousSnapshots.error) {
      console.error('[getWeeklyRankingComparison] Error fetching snapshots:', 
        currentSnapshots.error || previousSnapshots.error);
      return { 
        success: false, 
        error: currentSnapshots.error?.message || previousSnapshots.error?.message 
      };
    }
    
    if (!currentSnapshots.data || !previousSnapshots.data) {
      return { 
        success: false, 
        error: 'No se encontraron datos de ranking para las semanas solicitadas' 
      };
    }
    
    // Crear mapas para fácil comparación
    const currentMap = new Map();
    const previousMap = new Map();
    
    currentSnapshots.data.forEach((snap: any) => {
      currentMap.set(snap.player_id, snap);
    });
    
    previousSnapshots.data.forEach((snap: any) => {
      previousMap.set(snap.player_id, snap);
    });
    
    // Calcular cambios
    const changes: any[] = [];
    
    currentMap.forEach((current: any, playerId: string) => {
      const previous = previousMap.get(playerId);
      if (previous) {
        const rankChange = previous.rank_position - current.rank_position; // Positivo = subió
        const pointsChange = current.score - previous.score;
        
        if (rankChange !== 0) {
          changes.push({
            playerId,
            playerName: `${current.players.first_name} ${current.players.last_name}`.trim(),
            currentRank: current.rank_position,
            previousRank: previous.rank_position,
            rankChange,
            currentScore: current.score,
            previousScore: previous.score,
            pointsChange
          });
        }
      }
    });
    
    // Ordenar y obtener top gainers/losers
    const biggestGainers = changes
      .filter(change => change.rankChange > 0)
      .sort((a, b) => b.rankChange - a.rankChange)
      .slice(0, 5);
      
    const biggestLosers = changes
      .filter(change => change.rankChange < 0)
      .sort((a, b) => a.rankChange - b.rankChange)
      .slice(0, 5);
    
    return {
      success: true,
      data: {
        biggestGainers,
        biggestLosers,
        weeklyStats: {
          currentWeek: currentWeekStart,
          previousWeek: previousWeekStart,
          totalPlayers: currentSnapshots.data.length,
          playersWithChanges: changes.length
        }
      }
    };
    
  } catch (e: any) {
    console.error('[getWeeklyRankingComparison] Unexpected error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Obtiene el resumen de actividad de las últimas semanas
 */
export async function getRecentWeeksActivity(weeksCount: number = 4): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  const supabase = await createClient();
  
  try {
    const currentDate = new Date();
    const weeks = [];
    
    // Generar las fechas de las últimas N semanas
    for (let i = 0; i < weeksCount; i++) {
      const weekDate = new Date(currentDate);
      weekDate.setDate(weekDate.getDate() - (i * 7));
      const weekStart = getWeekStartDate(weekDate);
      weeks.push(weekStart);
    }
    
    const weeklyData = [];
    
    for (const weekStart of weeks) {
      // Obtener torneos de esa semana
      const weekEndDate = new Date(weekStart);
      weekEndDate.setDate(weekEndDate.getDate() + 7);
      
      const { data: tournaments, error: tournamentsError } = await supabase
        .from('tournaments')
        .select('id, name, end_date')
        .eq('status', 'FINISHED')
        .gte('end_date', `${weekStart}T00:00:00Z`)
        .lt('end_date', `${weekEndDate.toISOString().split('T')[0]}T00:00:00Z`);
      
      // Obtener estadísticas de puntos de esa semana
      const { data: weekStats, error: statsError } = await supabase
        .rpc('get_week_summary', { week_start: weekStart });
      
      if (!tournamentsError && tournaments) {
        weeklyData.push({
          weekStart,
          tournamentsCount: tournaments.length,
          tournaments: tournaments.map((t: any) => ({ id: t.id, name: t.name, endDate: t.end_date })),
          // stats: weekStats || { totalPointsAwarded: 0, playersParticipated: 0 }
        });
      }
    }
    
    return {
      success: true,
      data: weeklyData.reverse() // Orden cronológico
    };
    
  } catch (e: any) {
    console.error('[getRecentWeeksActivity] Unexpected error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Obtiene los puntos ganados por un jugador en la última semana
 */
export async function getPlayerWeeklyPoints(playerId: string): Promise<{
  success: boolean;
  pointsThisWeek: number;
  error?: string;
}> {
  const supabase = await createClient();
  
  try {
    // Calcular el inicio de la semana actual
    const currentWeekStart = getWeekStartDate(new Date());
    const weekEndDate = new Date(currentWeekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 7);
    
    // Obtener el historial de torneos de esta semana para el jugador
    const { data: weekHistory, error } = await supabase
      .from('player_tournament_history')
      .select('points_earned')
      .eq('player_id', playerId)
      .gte('created_at', `${currentWeekStart}T00:00:00Z`)
      .lt('created_at', `${weekEndDate.toISOString().split('T')[0]}T00:00:00Z`);
    
    if (error) {
      console.error('[getPlayerWeeklyPoints] Error fetching weekly points:', error);
      return { success: false, pointsThisWeek: 0, error: error.message };
    }
    
    // Sumar todos los puntos ganados en la semana
    const totalPoints = weekHistory?.reduce((sum, record) => sum + (record.points_earned || 0), 0) || 0;
    
    return {
      success: true,
      pointsThisWeek: totalPoints
    };
    
  } catch (e: any) {
    console.error('[getPlayerWeeklyPoints] Unexpected error:', e);
    return { success: false, pointsThisWeek: 0, error: e.message };
  }
}

/**
 * Obtiene los puntos ganados en la última semana para múltiples jugadores
 */
export async function getMultiplePlayersWeeklyPoints(playerIds: string[]): Promise<{
  success: boolean;
  weeklyPoints: { [playerId: string]: number };
  error?: string;
}> {
  const supabase = await createClient();
  
  try {
    if (playerIds.length === 0) {
      return { success: true, weeklyPoints: {} };
    }
    
    // Calcular el inicio de la semana actual
    const currentWeekStart = getWeekStartDate(new Date());
    const weekEndDate = new Date(currentWeekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 7);
    
    // Obtener el historial de torneos de esta semana para todos los jugadores
    const { data: weekHistory, error } = await supabase
      .from('player_tournament_history')
      .select('player_id, points_earned')
      .in('player_id', playerIds)
      .gte('created_at', `${currentWeekStart}T00:00:00Z`)
      .lt('created_at', `${weekEndDate.toISOString().split('T')[0]}T00:00:00Z`);
    
    if (error) {
      console.error('[getMultiplePlayersWeeklyPoints] Error fetching weekly points:', error);
      return { success: false, weeklyPoints: {}, error: error.message };
    }
    
    // Agrupar y sumar puntos por jugador
    const weeklyPoints: { [playerId: string]: number } = {};
    
    // Inicializar todos los jugadores con 0 puntos
    playerIds.forEach(playerId => {
      weeklyPoints[playerId] = 0;
    });
    
    // Sumar los puntos ganados
    weekHistory?.forEach(record => {
      if (weeklyPoints.hasOwnProperty(record.player_id)) {
        weeklyPoints[record.player_id] += record.points_earned || 0;
      }
    });
    
    return {
      success: true,
      weeklyPoints
    };
    
  } catch (e: any) {
    console.error('[getMultiplePlayersWeeklyPoints] Unexpected error:', e);
    return { success: false, weeklyPoints: {}, error: e.message };
  }
}

/**
 * Converts an individual player registration to a couple registration
 * Automatically removes the individual registration and creates a couple registration
 */
/**
 * 🎾 CONVERSIÓN DE INDIVIDUAL A PAREJA (USANDO STRATEGY PATTERN)
 * 
 * Función principal refactorizada para usar el sistema Strategy Pattern.
 * Mantiene backward compatibility con la signatura original.
 */
export async function registerCoupleForTournamentAndRemoveIndividual(
  tournamentId: string, 
  player1Id: string, 
  player2Id: string
): Promise<{ 
  success: boolean; 
  error?: string; 
  inscription?: any; 
  convertedFrom?: 'player1' | 'player2' | null;
  message?: string;
}> {
  console.log(`[registerCoupleForTournamentAndRemoveIndividual] 🔄 Refactorizado con Strategy Pattern`, { tournamentId, player1Id, player2Id });
  
  // Usar la nueva implementación V2 con Strategy Pattern
  return await registerCoupleForTournamentAndRemoveIndividualV2(tournamentId, player1Id, player2Id);
}

// =============================================================================
// NUEVO ALGORITMO DE SEEDING PARA BRACKETS ELIMINATORIOS
// =============================================================================

import { 
  generateEliminationBracket, 
  CoupleSeeded, 
  BracketMatch,
  validateCouplesData,
  convertMatchesToDatabaseFormat,
  debugSeeding,
  assignGlobalSeeds
} from '@/utils/bracket-generator';
//import { getPlayerGender } from '../players/actions';

/**
 * Extrae datos de parejas clasificadas desde la base de datos y los convierte al formato CoupleSeeded
 */
async function extractCouplesSeededFromDatabase(tournamentId: string, supabase: any): Promise<CoupleSeeded[]> {
  console.log(`[extractCouplesSeeded] Extrayendo parejas clasificadas para torneo ${tournamentId}`);

  // 1. Obtener todas las zonas del torneo con sus parejas y estadísticas
  // IMPORTANTE: Ordenar por created_at para respetar el orden de creación
  const { data: zones, error: zonesError } = await supabase
    .from('zones')
    .select(`
      id,
      name,
      created_at,
      zone_couples (
        couple_id,
        couples (
          id,
          player1_id,
          player2_id,
          player1_details:players!couples_player1_id_fkey(first_name, last_name),
          player2_details:players!couples_player2_id_fkey(first_name, last_name)
        )
      )
    `)
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true }); // Ordenar por orden de creación

  if (zonesError) {
    console.error('[extractCouplesSeeded] Error fetching zones:', zonesError);
    throw new Error(`Error obteniendo zonas: ${zonesError.message}`);
  }

  if (!zones || zones.length === 0) {
    console.log('[extractCouplesSeeded] No se encontraron zonas para el torneo');
    return [];
  }

  console.log('[extractCouplesSeeded] Zonas ordenadas por creación:', zones.map((z: any) => ({ name: z.name, created_at: z.created_at })));

  // 2. Para cada zona, calcular las estadísticas de las parejas
  const couplesSeeded: CoupleSeeded[] = [];

  for (const zone of zones) {
    const zoneName = zone.name;
    const couples = zone.zone_couples?.map((zc: any) => zc.couples).filter(Boolean) || [];

    if (couples.length === 0) continue;

    console.log(`[extractCouplesSeeded] Procesando zona ${zoneName} con ${couples.length} parejas`);

    // Obtener matches de esta zona para calcular estadísticas
    const { data: zoneMatches, error: matchesError } = await supabase
      .from('matches')
      .select('couple1_id, couple2_id, winner_id, result_couple1, result_couple2, status')
      .eq('tournament_id', tournamentId)
      .eq('zone_id', zone.id)
      .eq('status', 'FINISHED');

    if (matchesError) {
      console.error(`[extractCouplesSeeded] Error fetching matches for zone ${zoneName}:`, matchesError);
      continue;
    }

    // Calcular estadísticas para cada pareja en esta zona
    const coupleStats: { [coupleId: string]: { points: number; scored: number; conceded: number; played: number; won: number; lost: number } } = {};

    couples.forEach((couple: any) => {
      coupleStats[couple.id] = { points: 0, scored: 0, conceded: 0, played: 0, won: 0, lost: 0 };
    });

    (zoneMatches || []).forEach((match: any) => {
      const couple1Id = match.couple1_id;
      const couple2Id = match.couple2_id;
      const winnerId = match.winner_id;

      if (couple1Id && coupleStats[couple1Id]) {
        coupleStats[couple1Id].played++;
        const games1 = parseInt(match.result_couple1 || '0');
        const games2 = parseInt(match.result_couple2 || '0');
        coupleStats[couple1Id].scored += games1;
        coupleStats[couple1Id].conceded += games2;
        
        if (winnerId === couple1Id) {
          coupleStats[couple1Id].won++;
          coupleStats[couple1Id].points += POINTS_FOR_WINNING_MATCH; // Puntos por ganar
        } else {
          coupleStats[couple1Id].lost++;
          coupleStats[couple1Id].points += Math.abs(POINTS_FOR_LOSING_MATCH); // Usar valor absoluto para cálculo
        }
      }

      if (couple2Id && coupleStats[couple2Id]) {
        coupleStats[couple2Id].played++;
        const games1 = parseInt(match.result_couple1 || '0');
        const games2 = parseInt(match.result_couple2 || '0');
        coupleStats[couple2Id].scored += games2;
        coupleStats[couple2Id].conceded += games1;
        
        if (winnerId === couple2Id) {
          coupleStats[couple2Id].won++;
          coupleStats[couple2Id].points += POINTS_FOR_WINNING_MATCH; // Puntos por ganar
        } else {
          coupleStats[couple2Id].lost++;
          coupleStats[couple2Id].points += Math.abs(POINTS_FOR_LOSING_MATCH); // Usar valor absoluto para cálculo
        }
      }
    });

    // Ordenar parejas en la zona por puntos y diferencia de juegos
    const sortedCouples = couples.sort((a: any, b: any) => {
      const statsA = coupleStats[a.id];
      const statsB = coupleStats[b.id];
      
      // Primero por puntos
      if (statsB.points !== statsA.points) {
        return statsB.points - statsA.points;
      }
      
      // Luego por diferencia de juegos
      const diffA = statsA.scored - statsA.conceded;
      const diffB = statsB.scored - statsB.conceded;
      if (diffB !== diffA) {
        return diffB - diffA;
      }
      
      // Finalmente por juegos a favor
      return statsB.scored - statsA.scored;
    });

    // Convertir a formato CoupleSeeded
    // IMPORTANTE: Incluir TODAS las parejas, no solo las ganadoras
    sortedCouples.forEach((couple: any, index: number) => {
      const stats = coupleStats[couple.id];
      const player1Name = `${couple.player1_details?.first_name || ''} ${couple.player1_details?.last_name || ''}`.trim();
      const player2Name = `${couple.player2_details?.first_name || ''} ${couple.player2_details?.last_name || ''}`.trim();
      
      couplesSeeded.push({
        id: couple.id,
        zona: zoneName,
        puntos: stats.points,
        posicionEnZona: index + 1, // 1-indexado
        player1_id: couple.player1_id,
        player2_id: couple.player2_id,
        player1_name: player1Name || 'Jugador 1',
        player2_name: player2Name || 'Jugador 2',
        zone_id: zone.id,
        // Incluir stats completas para referencia
        games_scored: stats.scored,
        games_conceded: stats.conceded,
        matches_played: stats.played,
        matches_won: stats.won,
        matches_lost: stats.lost
      });
    });
  }

  console.log(`[extractCouplesSeeded] Extraídas ${couplesSeeded.length} parejas clasificadas de ${zones.length} zonas`);
  
  // Mostrar resumen por zona
  const zonesSummary = zones.map((z: any) => {
    const couplesInZone = couplesSeeded.filter(c => c.zona === z.name);
    return `${z.name}: ${couplesInZone.length} parejas`;
  });
  console.log(`[extractCouplesSeeded] Resumen: ${zonesSummary.join(', ')}`);
  
  return couplesSeeded;
}

/**
 * Función principal mejorada que genera las seeds y los matches eliminatorios
 * Reemplaza a populateTournamentSeedCouples y createKnockoutStageMatchesAction
 * NUEVA VERSIÓN: Usa el generador de brackets actualizado con lógica BYE/WAITING_OPONENT
 *

/**
 * Función de utilidad para verificar el estado de las zonas antes de generar brackets
 */
export async function checkZonesReadyForElimination(tournamentId: string): Promise<{
  ready: boolean;
  message: string;
  zones?: any[];
  totalCouples?: number;
}> {
  try {
    const supabase = await createClient();

    // Obtener zonas con matches
    const { data: zones, error: zonesError } = await supabase
      .from('zones')
      .select(`
        id,
        name,
        zone_couples (count),
        matches (
          id,
          status
        )
      `)
      .eq('tournament_id', tournamentId);

    if (zonesError) {
      return { ready: false, message: `Error verificando zonas: ${zonesError.message}` };
    }

    if (!zones || zones.length === 0) {
      return { ready: false, message: "No hay zonas configuradas en el torneo." };
    }

    let totalCouples = 0;
    const zonesStatus = zones.map(zone => {
      const couplesCount = zone.zone_couples?.[0]?.count || 0;
      const matches = zone.matches || [];
      const completedMatches = matches.filter(m => m.status === 'FINISHED').length;
      const totalMatches = matches.length;
      
      totalCouples += couplesCount;
      
      return {
        name: zone.name,
        couples: couplesCount,
        matches: `${completedMatches}/${totalMatches}`,
        completed: totalMatches > 0 && completedMatches === totalMatches
      };
    });

    const allZonesCompleted = zonesStatus.every(z => z.completed);

    if (!allZonesCompleted) {
      const incompleteZones = zonesStatus.filter(z => !z.completed).map(z => z.name);
      return {
        ready: false,
        message: `Las siguientes zonas no han completado todos sus matches: ${incompleteZones.join(', ')}`,
        zones: zonesStatus,
        totalCouples
      };
    }

    if (totalCouples < 2) {
      return {
        ready: false,
        message: `Se necesitan al menos 2 parejas para generar brackets. Encontradas: ${totalCouples}`,
        zones: zonesStatus,
        totalCouples
      };
    }

    return {
      ready: true,
      message: `✅ Todas las zonas están listas. ${totalCouples} parejas clasificadas.`,
      zones: zonesStatus,
      totalCouples
    };

  } catch (error: any) {
    return { ready: false, message: `Error inesperado: ${error.message}` };
  }
}

// Helper function to get custom pairing indices for traditional bracket distribution

/**
 * Calcula los puntos ganados/perdidos para un partido específico
 * @param match Datos del partido
 * @param supabase Cliente de Supabase
 * @returns Array de puntos por jugador
 */
async function calculateMatchPoints(
  match: any,
  supabase: any,
  playerSnapshotMap: PlayerSnapshotMap
): Promise<MatchPoints[]> {
  // Obtener solo la composición de las parejas, los datos de puntos y categoría vendrán del snapshot
  const { data: winnerCouple, error: winnerError } = await supabase
    .from('couples')
    .select('id, player1_id, player2_id')
    .eq('id', match.winner_id)
    .single();

  const losingCoupleId = match.couple1_id === match.winner_id ? match.couple2_id : match.couple1_id;
  const { data: loserCouple, error: loserError } = await supabase
    .from('couples')
    .select('id, player1_id, player2_id')
    .eq('id', losingCoupleId)
    .single();

  if (winnerError || loserError || !winnerCouple || !loserCouple) {
    console.error('[calculateMatchPoints] Error fetching couples composition');
    return [];
  }

  // Función auxiliar para obtener datos del jugador desde el snapshot Map
  const getPlayerData = (playerId: string | null): { id: string; score: number; category_name: string; playerName: string } => {
    if (!playerId) {
      return { id: '', score: 0, category_name: '', playerName: 'Jugador no encontrado' };
    }
    
    const data = playerSnapshotMap.get(playerId);
    if (!data) {
      console.warn(`[calculateMatchPoints] Player ${playerId} not found in snapshot map. Defaulting to 0 score.`);
      return { id: playerId, score: 0, category_name: '', playerName: 'Jugador sin snapshot' };
    }
    
    return {
      id: playerId,
      score: data.score,
      category_name: data.category,
      playerName: data.playerName,
    };
  };

  // Obtener datos de los jugadores desde el snapshot
  const wp1 = getPlayerData(winnerCouple.player1_id);
  const wp2 = getPlayerData(winnerCouple.player2_id);
  const lp1 = getPlayerData(loserCouple.player1_id);
  const lp2 = getPlayerData(loserCouple.player2_id);

  // Calcular promedio de puntos de cada pareja (usando datos del snapshot)
  const winnerAvgScore = (wp1.score + wp2.score) / 2;
  const loserAvgScore = (lp1.score + lp2.score) / 2;

  // Calcular puntos finales usando la nueva escala Δ
  const scoreDiff = winnerAvgScore - loserAvgScore;
  const { winnerPoints, loserPoints } = getPointsFromScoreDiff(scoreDiff);

  // Retornar array con los puntos calculados
  return [
    // Ganadores
    {
      playerId: wp1.id,
      points: winnerPoints,
      matchId: match.id,
      playerName: wp1.playerName
    },
    {
      playerId: wp2.id,
      points: winnerPoints,
      matchId: match.id,
      playerName: wp2.playerName
    },
    // Perdedores
    {
      playerId: lp1.id,
      points: loserPoints,
      matchId: match.id,
      playerName: lp1.playerName
    },
    {
      playerId: lp2.id,
      points: loserPoints,
      matchId: match.id,
      playerName: lp2.playerName
    }
  ];
}

/**
 * Calcula y aplica los puntos para todos los partidos de un torneo
 * @param tournamentId ID del torneo
 * @param supabase Cliente de Supabase
 * @returns Resultado de la operación
 */
export async function calculateTournamentPoints(
  tournamentId: string,
  supabase: any
): Promise<TournamentPointsCalculation> {
  // 1. Crear snapshot del torneo antes de calcular los puntos
  // Esto asegura que tengamos un registro del estado de los jugadores ANTES de aplicar los puntos.
  await createTournamentSnapshot(tournamentId, supabase);

  // 2. Obtener el snapshot y cargarlo en un Map para acceso rápido
  const { data: snapshotData, error: snapshotError } = await supabase
    .from('ranking_snapshots')
    .select('player_id, score, category, player_name')
    .eq('tournament_id', tournamentId)
    .eq('snapshot_type', 'tournament_start');

  if (snapshotError) throw new Error('Error fetching tournament snapshot');
  
  const playerSnapshotMap: PlayerSnapshotMap = new Map();
  (snapshotData || []).forEach((player: any) => {
    playerSnapshotMap.set(player.player_id, {
      score: player.score,
      category: player.category,
      playerName: player.player_name,
    });
  });


  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select(`
      *,
      couple1:couples!matches_couple1_id_fkey(*, player1:players!couples_player1_id_fkey(*), player2:players!couples_player2_id_fkey(*)),
      couple2:couples!matches_couple2_id_fkey(*, player1:players!couples_player1_id_fkey(*), player2:players!couples_player2_id_fkey(*))
    `)
    .eq('tournament_id', tournamentId)
    .eq('status', 'FINISHED');

  if (matchesError) throw new Error('Error fetching matches');

  const playerPoints: { [key: string]: { earned: number, bonus: number } } = {};
  const matchPointsCouples: Omit<MatchPointsCouple, 'id' | 'created_at'>[] = [];

  for (const match of matches) {
    // Skip matches without resultado completo
    if (!match.winner_id || !match.couple1_id || !match.couple2_id) continue;

    // Calcular puntos dinámicos usando el snapshot de jugadores
    const matchPlayerPoints = await calculateMatchPoints(match, supabase, playerSnapshotMap);

    // Acumular puntos por jugador
    matchPlayerPoints.forEach((mp) => {
      if (!playerPoints[mp.playerId]) {
        playerPoints[mp.playerId] = { earned: 0, bonus: 0 };
      }
      playerPoints[mp.playerId].earned += mp.points;
    });

    // Determinar puntos por pareja (ganadores positivos, perdedores negativos)
    const winnerPointsValue =
      matchPlayerPoints.find((mp) => mp.points > 0)?.points ?? POINTS_FOR_WINNING_MATCH;
    const loserPointsValue =
      matchPlayerPoints.find((mp) => mp.points < 0)?.points ?? POINTS_FOR_LOSING_MATCH;

    const winnerIsCouple1 = match.winner_id === match.couple1_id;
    const loser_id = winnerIsCouple1 ? match.couple2_id : match.couple1_id;

    matchPointsCouples.push({
      match_id: match.id,
      winner_couple_id: match.winner_id,
      loser_couple_id: loser_id,
      points_winner: winnerPointsValue,
      points_loser: loserPointsValue,
    });
  }
  
  // Calcular bonus para campeón y finalista
  // Nota: los valores de la ronda se guardan en mayúsculas ("FINAL"),
  // por lo que debemos compararlo exactamente así. De lo contrario,
  // no se detecta la final y no se asignan los puntos de bonus.
  const finalMatch = matches.find((m: any) => m.round === 'FINAL');
  if (finalMatch && finalMatch.winner_id) {
    const winnerCouple = finalMatch.couple1_id === finalMatch.winner_id ? finalMatch.couple1 : finalMatch.couple2;
    const finalistCouple = finalMatch.couple1_id === finalMatch.winner_id ? finalMatch.couple2 : finalMatch.couple1;
    
    [winnerCouple.player1, winnerCouple.player2].forEach(p => {
      if (p && playerPoints[p.id]) playerPoints[p.id].bonus += BONUS_POINTS_WINNER;
    });
    [finalistCouple.player1, finalistCouple.player2].forEach(p => {
      if (p && playerPoints[p.id]) playerPoints[p.id].bonus += BONUS_POINTS_FINALIST;
    });
  }

  const playerIds = Object.keys(playerPoints);
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, first_name, last_name, score')
    .in('id', playerIds);

  if (playersError) throw new Error('Error fetching players');

  const playerScores: PlayerScore[] = players.map((player: PlayerDTO) => {
    const points = playerPoints[player.id];
    const totalEarned = points.earned + points.bonus;
    return {
      playerId: player.id,
      playerName: `${player.first_name} ${player.last_name}`,
      pointsBefore: player.score || 0,
      pointsEarned: totalEarned,
      pointsAfter: (player.score || 0) + totalEarned,
      bonus: points.bonus > 0 ? points.bonus : undefined
    };
  });

  return {
    playerScores,
    totalMatches: matches.length,
    matchPoints: matchPointsCouples,
  };
}

async function applyTournamentPoints(
  calculation: TournamentPointsCalculation,
  supabase: any
): Promise<void> {
  const playerUpdates = calculation.playerScores.map(score => {
    return supabase
      .from('players')
      .update({ score: score.pointsAfter })
      .eq('id', score.playerId);
  });

  await Promise.all(playerUpdates);

  // Insertar los puntos por partido
  if (calculation.matchPoints && calculation.matchPoints.length > 0) {
    const { error } = await supabase
      .from('match_points_couples')
      .insert(calculation.matchPoints);

    if (error) {
      console.error('Error inserting match points:', error);
      // No lanzar error para no revertir la actualización de puntos de jugadores
    }
  }
}

/**
 * Función principal para procesar los puntos de un torneo
 * @param tournamentId ID del torneo
 * @param supabase Cliente de Supabase
 */
export async function processTournamentPoints(
  tournamentId: string,
  supabase: any
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Calcular y aplicar puntos del torneo
    const calculation = await calculateTournamentPoints(tournamentId, supabase);
    await applyTournamentPoints(calculation, supabase);

    // 2. Guardar historial simplificado
    await insertTournamentHistory(tournamentId, calculation, supabase);

    // 3. Recategorizar jugadores automáticamente basándose en sus nuevos puntajes
    try {
      console.log(`[processTournamentPoints] Iniciando recategorización automática para torneo ${tournamentId}`);
      const recategorizationStats = await recategorizePlayersAfterPoints(tournamentId, supabase);
      
      if (recategorizationStats && recategorizationStats.recategorized.length > 0) {
        console.log(`[processTournamentPoints] ✅ Recategorización automática completada: ${recategorizationStats.recategorized.length} jugadores recategorizados`);
      } else {
        console.log(`[processTournamentPoints] ✓ Recategorización automática completada: no se requirieron cambios de categoría`);
      }
    } catch (recategorizationError: any) {
      // La recategorización es complementaria - no debe fallar el proceso principal
      console.error(`[processTournamentPoints] ⚠️ Error en recategorización automática (no crítico): ${recategorizationError.message}`);
    }

    return { success: true, message: 'Puntos aplicados correctamente.' };
  } catch (error: any) {
    console.error(`[processTournamentPoints] Error: ${error.message}`);
    return { success: false, message: `Error al procesar puntos: ${error.message}` };
  }
}

// Helper para convertir categoría a valor numérico
const getCategoryValue = (cat: string): number => {
  switch (cat) {
    case '1ra': return 8;
    case '2da': return 7;
    case '3ra': return 6;
    case '4ta': return 5;
    case '5ta': return 4;
    case '6ta': return 3;
    case '7ma': return 2;
    case '8va': return 1;
    default: return 0;
  }
};

/**
 * Actualiza el historial del torneo con los puntos finales después de aplicar los puntos
 * @param tournamentId ID del torneo
 * @param supabase Cliente de Supabase
 */
async function updateTournamentHistoryAfterPoints(tournamentId: string, supabase: any): Promise<boolean> {
  try {
    console.log(`[updateTournamentHistoryAfterPoints] Updating history for tournament ${tournamentId}`);
    
    // Obtener todos los jugadores que participaron en el torneo
    const allPlayerIds = new Set<string>();
    
    // 1. Obtener jugadores individuales
    const { data: individualInscriptions } = await supabase
      .from('inscriptions')
      .select('player_id')
      .eq('tournament_id', tournamentId)
      .is('couple_id', null)
      .not('player_id', 'is', null);
      
    individualInscriptions?.forEach((inscription: any) => {
      if (inscription.player_id) {
        allPlayerIds.add(inscription.player_id);
      }
    });
    
    // 2. Obtener jugadores de parejas
    const { data: coupleInscriptions } = await supabase
      .from('inscriptions')
      .select(`
        couple_id,
        couples!inner(
          player1_id,
          player2_id
        )
      `)
      .eq('tournament_id', tournamentId)
      .not('couple_id', 'is', null);
      
    coupleInscriptions?.forEach((inscription: any) => {
      const couple = inscription.couples;
      if (couple && couple.player1_id) {
        allPlayerIds.add(couple.player1_id);
      }
      if (couple && couple.player2_id) {
        allPlayerIds.add(couple.player2_id);
      }
    });
    
    // Obtener información actualizada de todos los jugadores DESPUÉS de aplicar puntos
    const { data: allPlayers, error: playersError } = await supabase
      .from('players')
      .select('id, score')
      .in('id', Array.from(allPlayerIds));
      
    if (playersError || !allPlayers) {
      console.error('[updateTournamentHistoryAfterPoints] Error fetching updated player data:', playersError);
      return false;
    }
    
    // Calcular ranking actual DESPUÉS de aplicar puntos del torneo
    const currentRanking = await calculateCurrentRanking(supabase);
    const currentRankMap = new Map();
    currentRanking.forEach(rank => {
      currentRankMap.set(rank.player_id, {
        rank_after: rank.rank_position,
        points_after: rank.score
      });
    });
    
    // Actualizar cada registro del historial
    for (const player of allPlayers) {
      const playerId = player.id;
      const currentScore = player.score || 0;
      
      // Obtener datos del historial existente
      const { data: historyRecord, error: fetchError } = await supabase
        .from('player_tournament_history')
        .select('points_before, rank_before')
        .eq('player_id', playerId)
        .eq('tournament_id', tournamentId)
        .single();
        
      if (fetchError || !historyRecord) {
        console.error(`[updateTournamentHistoryAfterPoints] Error fetching history for player ${playerId}:`, fetchError);
        continue;
      }
      
      const pointsBefore = historyRecord.points_before || 0;
      const rankBefore = historyRecord.rank_before;
      const pointsAfter = currentScore;
      const rankAfter = currentRankMap.get(playerId)?.rank_after || null;
      
      const pointsEarned = pointsAfter - pointsBefore;
      const rankChange = rankBefore && rankAfter 
        ? rankBefore - rankAfter // Positivo = subió posiciones
        : null;
      
      // Actualizar el registro del historial
      const { error: updateError } = await supabase
        .from('player_tournament_history')
        .update({
          points_after: pointsAfter,
          points_earned: pointsEarned,
          rank_after: rankAfter,
          rank_change: rankChange
        })
        .eq('player_id', playerId)
        .eq('tournament_id', tournamentId);
        
      if (updateError) {
        console.error(`[updateTournamentHistoryAfterPoints] Error updating history for player ${playerId}:`, updateError);
      }
    }
    
    console.log(`[updateTournamentHistoryAfterPoints] Updated history for ${allPlayers.length} players`);
    return true;
  } catch (e: any) {
    console.error('[updateTournamentHistoryAfterPoints] Unexpected error:', e);
    return false;
  }
}

/**
 * Guarda el historial del torneo usando los datos del cálculo
 * @param tournamentId ID del torneo
 * @param calculation Resultado del cálculo de puntos
 * @param supabase Cliente de Supabase
 */
async function insertTournamentHistory(
  tournamentId: string,
  calculation: TournamentPointsCalculation,
  supabase: any
): Promise<boolean> {
  try {
    console.log(`[insertTournamentHistory] Inserting history for tournament ${tournamentId}`);
    
    // Preparar datos del historial usando playerScores del cálculo
    const historyData = calculation.playerScores.map(score => ({
      player_id: score.playerId,
      tournament_id: tournamentId,
      points_before: score.pointsBefore,
      points_after: score.pointsAfter,
      points_earned: score.pointsEarned,
      rank_before: null, // No calculamos ranking por ahora
      rank_after: null,
      rank_change: null
    }));
    
    // Insertar historial
    const { error: historyError } = await supabase
      .from('player_tournament_history')
      .upsert(historyData, { 
        onConflict: 'player_id,tournament_id',
        ignoreDuplicates: false 
      });
      
    if (historyError) {
      console.error('[insertTournamentHistory] Error inserting history:', historyError);
      return false;
    }
    
    console.log(`[insertTournamentHistory] Created history for ${historyData.length} players`);
    return true;
  } catch (e: any) {
    console.error('[insertTournamentHistory] Unexpected error:', e);
    return false;
  }
}

/**
 * Obtiene los puntos de cada partido de un torneo
 * @param tournamentId ID del torneo
 * @param supabase Cliente de Supabase
 * @returns Record con match_id como key y MatchPointsCouple como value
 */
export async function getMatchPoints(
  tournamentId: string,
  supabase?: any
): Promise<Record<string, MatchPointsCouple>> {
  try {
    console.log(`[getMatchPoints] Fetching match points for tournament ${tournamentId}`);
    
    // Usar createClient si no se pasa supabase
    const client = supabase || await createClient();
    
    // Obtener todos los partidos del torneo
    const { data: matches, error: matchesError } = await client
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId);
      
    if (matchesError) {
      console.error('[getMatchPoints] Error fetching matches:', matchesError);
      return {};
    }
    
    if (!matches || matches.length === 0) {
      console.log('[getMatchPoints] No matches found for tournament');
      return {};
    }
    
    
    const matchIds = matches.map((match: any) => match.id);
    
    // Obtener puntos de los partidos
    const { data: matchPoints, error: pointsError } = await client
      .from('match_points_couples')
      .select('*')
      .in('match_id', matchIds);
      
    if (pointsError) {
      console.error('[getMatchPoints] Error fetching match points:', pointsError);
      return {};
    }
    
    // Convertir a Record<string, MatchPointsCouple>
    const pointsRecord = (matchPoints || []).reduce((acc: Record<string, MatchPointsCouple>, match: any) => {
      acc[match.match_id] = match;
      return acc;
    }, {} as Record<string, MatchPointsCouple>);
    
    console.log(`[getMatchPoints] Found ${Object.keys(pointsRecord).length} matches with points`);
    return pointsRecord;
  } catch (e: any) {
    console.error('[getMatchPoints] Unexpected error:', e);
    return {};
  }
}

/**
 * Crea un snapshot del ranking antes del torneo
 * @param tournamentId ID del torneo
 * @param supabase Cliente de Supabase
 */
async function createTournamentSnapshot(
  tournamentId: string,
  supabase: any
): Promise<boolean> {
  try {
    // 1. Verificar si ya existe un snapshot
    const { data: existingSnapshot } = await supabase
      .from('ranking_snapshots')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('snapshot_type', 'tournament_start')
      .limit(1);
      
    if (existingSnapshot && existingSnapshot.length > 0) {
      console.log('[createTournamentSnapshot] Snapshot already exists');
      return true;
    }

    // 2. Obtener jugadores del torneo
    const { data: inscriptions } = await supabase
      .from('inscriptions')
      .select(`
        player_id,
        couple_id,
        couples (
          player1_id,
          player2_id
        )
      `)
      .eq('tournament_id', tournamentId);

    if (!inscriptions || inscriptions.length === 0) {
      console.error('[createTournamentSnapshot] No players found');
      return false;
    }

    // 3. Recolectar IDs únicos de jugadores
    const playerIds = new Set<string>();
    inscriptions.forEach((inscription: any) => {
      if (inscription.player_id) {
        playerIds.add(inscription.player_id);
      }
      if (inscription.couple_id && inscription.couples) {
        if (inscription.couples.player1_id) playerIds.add(inscription.couples.player1_id);
        if (inscription.couples.player2_id) playerIds.add(inscription.couples.player2_id);
      }
    });

    // 4. Obtener datos actuales de los jugadores
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, first_name, last_name, score, category_name')
      .in('id', Array.from(playerIds));

    if (playersError || !players) {
      console.error('[createTournamentSnapshot] Error fetching players:', playersError);
      return false;
    }

    // 5. Crear snapshots con campos requeridos
    // Obtener fecha del torneo para week_start_date
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('start_date')
      .eq('id', tournamentId)
      .single();

    // Usar fecha del torneo o fecha actual como fallback
    const tournamentDate = tournament?.start_date ? new Date(tournament.start_date) : new Date();
    
    // Ordenar jugadores por score descendente para generar rank_position
    const sortedPlayers = players
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
      .map((player: any, index: number) => ({ ...player, rank_position: index + 1 }));

    const snapshotData = sortedPlayers.map((player: { id: string; first_name: string; last_name: string; score: number; category_name: string; rank_position: number }) => ({
      player_id: player.id,
      tournament_id: tournamentId,
      score: player.score || 0,
      category: player.category_name,
      player_name: `${player.first_name} ${player.last_name}`,
      snapshot_type: 'tournament_start',
      // ✅ NUEVOS CAMPOS REQUERIDOS:
      rank_position: player.rank_position,
      week_start_date: tournamentDate.toISOString().split('T')[0] // YYYY-MM-DD format
    }));

    // Debug info antes del insert
    console.log(`[createTournamentSnapshot] Attempting to create ${snapshotData.length} snapshots for tournament ${tournamentId}`);
    console.log(`[createTournamentSnapshot] Sample snapshot data:`, snapshotData[0]);

    const { error: insertError } = await supabase
      .from('ranking_snapshots')
      .insert(snapshotData);

    if (insertError) {
      console.error('[createTournamentSnapshot] Error creating snapshots:', insertError);
      console.error('[createTournamentSnapshot] Failed snapshot sample:', snapshotData[0]);
      return false;
    }

    console.log(`[createTournamentSnapshot] ✅ Successfully created ${snapshotData.length} snapshots`);
    return true;
  } catch (error) {
    console.error('[createTournamentSnapshot] Unexpected error:', error);
    return false;
  }
}

/**
 * Obtiene los puntajes del snapshot de un torneo
 * @param tournamentId ID del torneo
 * @param supabase Cliente de Supabase (opcional)
 * @returns Map con player_id como clave y score como valor
 */
export async function getTournamentSnapshot(
  tournamentId: string,
  supabase?: any
): Promise<Map<string, number>> {
  try {
    // Usar createClient si no se pasa supabase
    const client = supabase || await createClient();
    
    const { data: snapshotData, error } = await client
      .from('ranking_snapshots')
      .select('player_id, score')
      .eq('tournament_id', tournamentId)
      .eq('snapshot_type', 'tournament_start');
    
    if (error) {
      console.error('[getTournamentSnapshot] Error fetching snapshot:', error);
      return new Map();
    }
    
    // Convertir a Map para acceso rápido
    const snapshotMap = new Map<string, number>();
    (snapshotData || []).forEach((snapshot: any) => {
      snapshotMap.set(snapshot.player_id, snapshot.score);
    });
    
    return snapshotMap;
  } catch (e: any) {
    console.error('[getTournamentSnapshot] Unexpected error:', e);
    return new Map();
  }
}

/**
 * Calcula los puntos del ganador y perdedor en base a la diferencia de puntaje promedio (Δ).
 * @param scoreDiff PromedioGanador − PromedioPerdedor (positivo ⇒ ganador favorito)
 */


function getPointsFromScoreDiff(scoreDiff: number): { winnerPoints: number; loserPoints: number } {
  const BASE_WINNER = POINTS_FOR_WINNING_MATCH; // 16
  const BASE_LOSER = POINTS_FOR_LOSING_MATCH;   // -12

  const step = Math.floor(Math.abs(scoreDiff) / 50); // cada 50 pts cuenta como 1 step
  const winnerAdjust = step * 1.5;
  const loserAdjust = step * 1;

  let winnerPoints: number;
  let loserPoints: number;

  if (scoreDiff > 0) {
    // Ganador era favorito → recibe menos; perdedor pierde menos
    winnerPoints = BASE_WINNER - winnerAdjust;
    loserPoints = BASE_LOSER + loserAdjust;
  } else if (scoreDiff < 0) {
    // Ganador under-dog → recibe más; perdedor pierde más
    winnerPoints = BASE_WINNER + winnerAdjust;
    loserPoints = BASE_LOSER - loserAdjust;
  } else {
    winnerPoints = BASE_WINNER;
    loserPoints = BASE_LOSER;
  }

  // Redondeo y topes finales
  winnerPoints = Math.round(winnerPoints);
  loserPoints = Math.round(loserPoints);

  // Aplicar límites
  winnerPoints = Math.min(Math.max(winnerPoints, 6), 36);
  loserPoints = Math.max(Math.min(loserPoints, -4), -24);

  return { winnerPoints, loserPoints }
}

// =============================================================================
// 🔄 PROPAGACIÓN DE CAMBIO DE GANADOR HACIA RONDAS SUPERIORES
// =============================================================================

/**
 * Cuando un resultado se corrige y cambia el ganador de un match, este helper
 * limpia y actualiza todos los matches siguientes que contenían al ganador
 * anterior, garantizando consistencia del bracket.
 */
async function propagateWinnerChange(
  supabase: any,
  tournamentId: string,
  changedMatch: { id: string; round: string; order: number; winner_id: string | null },
  oldWinnerId: string,
  newWinnerId: string | null
): Promise<void> {
  try {
    if (!oldWinnerId || oldWinnerId === newWinnerId) return;

    const roundOrder = ["32VOS", "16VOS", "8VOS", "4TOS", "SEMIFINAL", "FINAL"];
    const currentIndex = roundOrder.indexOf(changedMatch.round);
    if (currentIndex === -1 || currentIndex === roundOrder.length - 1) return; // no hay ronda superior

    const nextRound = roundOrder[currentIndex + 1];

    // Obtener el match de la siguiente ronda
    const nextRoundMatch = await findNextRoundMatchForWinner(
      supabase,
      tournamentId,
      changedMatch,
      nextRound
    );

    if (!nextRoundMatch) return;

    // -------------------------
    // Preparar actualización
    // -------------------------
    const updateData: any = {
      winner_id: null,
      result_couple1: null,
      result_couple2: null,
    };

    if (nextRoundMatch.couple1_id === oldWinnerId) {
      updateData.couple1_id = newWinnerId;
    }
    if (nextRoundMatch.couple2_id === oldWinnerId) {
      updateData.couple2_id = newWinnerId;
    }

    // Determinar estado posterior
    const couple1After = updateData.hasOwnProperty("couple1_id") ? updateData.couple1_id : nextRoundMatch.couple1_id;
    const couple2After = updateData.hasOwnProperty("couple2_id") ? updateData.couple2_id : nextRoundMatch.couple2_id;
    updateData.status = couple1After && couple2After ? "PENDING" : "WAITING_OPONENT";

    // Aplicar cambios
    const { error: updErr } = await supabase
      .from("matches")
      .update(updateData)
      .eq("id", nextRoundMatch.id);

    if (updErr) {
      console.error("[propagateWinnerChange] Error actualizando match:", updErr);
      return;
    }

    // Revisión de BYE
    await checkAndAutoCompleteByeMatch(supabase, nextRoundMatch.id, updateData);

    // Si el match destino ya tenía un ganador que ahora quedó inválido, continuar propagación
    if (nextRoundMatch.winner_id && nextRoundMatch.winner_id !== newWinnerId) {
      await propagateWinnerChange(
        supabase,
        tournamentId,
        {
          id: nextRoundMatch.id,
          round: nextRoundMatch.round,
          order: nextRoundMatch.order,
          winner_id: null,
        },
        nextRoundMatch.winner_id,
        null
      );
    }
  } catch (err) {
    console.error("[propagateWinnerChange] Error inesperado:", err);
  }
}

// ============================================================================
// 🆕 NUEVA FUNCIÓN: ZONE-AWARE BRACKET GENERATION
// ============================================================================

/**
 * 🎾 NUEVA FUNCIÓN: Genera bracket eliminatorio usando algoritmo zone-aware
 * 
 * Características:
 * - Usa la tabla zone_positions para seeding automático
 * - Evita rematches entre parejas que ya jugaron en zonas
 * - Aplica seeding tradicional serpenteo por posición
 * - Genera bracket completo con BYEs automáticos
 */

// ===== FUNCIONES REFACTORIZADAS CON STRATEGY PATTERN =====

/**
 * 🎾 REGISTRO DE PAREJA (REFACTORIZADO CON STRATEGY PATTERN)
 * 
 * Versión refactorizada que usa el sistema Strategy Pattern.
 * Comportamiento automático según tipo de torneo:
 * - AMERICAN: Solo inscriptions
 * - LONG: inscriptions + zone_couples automático
 */
export async function registerCoupleForTournamentV2(
  tournamentId: string, 
  player1Id: string, 
  player2Id: string,
  isOrganizerRegistration: boolean = false,
  termsAccepted: boolean = false,
  allowBlockedPlayerOverride: boolean = false,
): Promise<{ success: boolean; error?: string; inscription?: any }> {
  console.log(`[registerCoupleForTournamentV2] 🎾 Usando Strategy Pattern para torneo ${tournamentId}`, { player1Id, player2Id, isOrganizerRegistration });
  
  try {
    // Usar el nuevo sistema de registro con Strategy Pattern
    const { registerCouple } = await import('@/lib/services/registration');
    
    const result = await registerCouple({
      tournamentId,
      player1Id,
      player2Id,
      isOrganizerRegistration,
      termsAccepted,
      allowBlockedPlayerOverride,
    });
    
    // Revalidar path para mantener comportamiento anterior
    if (result.success) {
      // revalidatePath(`/tournaments/${tournamentId}`); // Temporarily disabled for debugging
      console.log(`✅ [registerCoupleForTournamentV2] Pareja registrada exitosamente usando Strategy Pattern`);
    }
    
    // Mapear resultado al formato esperado por la API anterior
    return {
      success: result.success,
      error: result.error,
      inscription: {
        ...(result.inscription || { id: result.inscriptionId }),
        coupleId: result.coupleId
      }
    };
    
  } catch (error) {
    console.error('[registerCoupleForTournamentV2] Error con Strategy Pattern:', error);
    return {
      success: false,
      error: 'Error interno del sistema de registro'
    };
  }
}

/**
 * 🎾 REGISTRO DE JUGADOR NUEVO (REFACTORIZADO CON STRATEGY PATTERN)
 * 
 * Versión refactorizada que crea un jugador nuevo usando Strategy Pattern.
 * Mantiene backward compatibility con la signatura original.
 */
export async function registerNewPlayerForTournamentV2(
  tournamentId: string,
  firstName: string,
  lastName: string,
  phone: string,
  dni: string | null,
  playerGender: Gender,
  forceCreateNew = false,
): Promise<{ success: boolean; message?: string; playerId?: string; inscription?: any }> {
  console.log(`[registerNewPlayerForTournamentV2] 🎾 Creando jugador nuevo con Strategy Pattern`, { firstName, lastName, dni });
  
  try {
    // Crear jugador usando el sistema Strategy Pattern
    // Nota: Por ahora creamos el jugador manualmente y luego usamos Strategy para inscribirlo
    // En el futuro se puede mejorar para que Strategy maneje la creación también
    
    const supabase = await createClient();
    
    // Obtener género del torneo para validar coherencia
    const { data: tournamentData, error: tournamentError } = await supabase
      .from('tournaments')
      .select('gender, category_name')
      .eq('id', tournamentId)
      .single();

    if (tournamentError) {
      return { success: false, message: `Error al obtener torneo: ${tournamentError.message}` };
    }

    const tournamentGenderUpper = (tournamentData?.gender ?? '').toUpperCase();
    const playerGenderUpper = (playerGender ?? '').toUpperCase();

    if (tournamentGenderUpper === 'FEMALE' && playerGenderUpper !== 'FEMALE') {
      return {
        success: false,
        message: 'Es un torneo femenino, pero el jugador es masculino',
      };
    }

    const normalizedDni = normalizePlayerDni(dni);

    if (!forceCreateNew) {
      const existingPlayerResult = await findExistingPlayerByIdentity({
        supabase,
        firstName,
        lastName,
        dni,
        gender: playerGender,
      });

      if (existingPlayerResult.error) {
        return { success: false, message: `Error al verificar jugador existente: ${existingPlayerResult.error}` };
      }

      const existingPlayer = existingPlayerResult.player

      if (existingPlayer) {
        const existingPlayerGenderUpper = (existingPlayer.gender ?? "").toUpperCase();
        if (tournamentGenderUpper === "FEMALE" && existingPlayerGenderUpper !== "FEMALE") {
          return {
            success: false,
            message: "Es un torneo femenino, pero el jugador existente es masculino"
          };
        }

        // Jugador existe, usar Strategy Pattern para inscribirlo
        const { registerIndividualPlayer } = await import('@/lib/services/registration');

        const result = await registerIndividualPlayer({
          tournamentId,
          playerId: existingPlayer.id
        });

        // Revalidar paths
        if (result.success) {
          // revalidatePath(`/tournaments/${tournamentId}`); // Temporarily disabled for debugging
          // revalidatePath(`/my-tournaments/${tournamentId}`); // Temporarily disabled for debugging
        }

        return {
          success: result.success,
          message: result.success ? 'Jugador existente inscrito exitosamente' : result.error,
          playerId: existingPlayer.id,
          inscription: result.inscription || { id: result.inscriptionId }
        };
      }
    }

    // ✅ STRATEGY PATTERN: Crear jugador nuevo SIN categorización inicial
    // La categorización se hace después via Strategy Pattern

    const { data: newPlayer, error: createError } = await supabase
      .from('players')
      .insert({
        first_name: firstName,
        last_name: lastName,
        dni: normalizedDni.dni,
        dni_is_temporary: normalizedDni.dniIsTemporary,
        gender: playerGender,
        phone: phone,
        score: null, // ✅ Dejar null, Strategy Pattern categorizará después
        category_name: null, // ✅ Dejar null, Strategy Pattern categorizará después
        is_categorized: false // ✅ Dejar false, Strategy Pattern categorizará después
      })
      .select()
      .single();

    if (createError) {
      return { success: false, message: `Error al crear jugador: ${createError.message}` };
    }

    // Inscribir usando Strategy Pattern
    const { registerIndividualPlayer } = await import('@/lib/services/registration');
    
    const result = await registerIndividualPlayer({
      tournamentId,
      playerId: newPlayer.id
    });

    if (!result.success) {
      // Si falla la inscripción, eliminar el jugador creado
      await supabase.from('players').delete().eq('id', newPlayer.id);
      return {
        success: false,
        message: `Error al inscribir jugador: ${result.error}`
      };
    }

    // Revalidar paths
    // revalidatePath(`/tournaments/${tournamentId}`); // Temporarily disabled for debugging
    // revalidatePath(`/my-tournaments/${tournamentId}`); // Temporarily disabled for debugging
    
    console.log(`✅ [registerNewPlayerForTournamentV2] Jugador creado e inscrito usando Strategy Pattern: ${newPlayer.id}`);

    return {
      success: true,
      message: 'Jugador creado e inscrito exitosamente',
      playerId: newPlayer.id,
      inscription: result.inscription || { id: result.inscriptionId }
    };

  } catch (error) {
    console.error('[registerNewPlayerForTournamentV2] Error con Strategy Pattern:', error);
    return {
      success: false,
      message: 'Error interno del sistema de registro'
    };
  }
}

/**
 * 🎾 REGISTRO DE JUGADOR AUTENTICADO (REFACTORIZADO CON STRATEGY PATTERN)
 * 
 * Versión refactorizada que usa el sistema Strategy Pattern.
 * Registra al jugador logueado en un torneo.
 */
export async function registerAuthenticatedPlayerForTournamentV2(
  tournamentId: string, 
  phone?: string,
  termsAccepted: boolean = false,
): Promise<{ success: boolean; message: string; inscriptionId?: string }> {
  console.log(`[registerAuthenticatedPlayerForTournamentV2] 🎾 Auto-registro con Strategy Pattern para torneo ${tournamentId}`);
  
  try {
    // Usar el nuevo sistema de registro con Strategy Pattern
    const { registerAuthenticatedPlayer } = await import('@/lib/services/registration');
    
    const result = await registerAuthenticatedPlayer({
      tournamentId,
      phone,
      termsAccepted,
    });
    
    // Revalidar paths para mantener comportamiento anterior
    if (result.success) {
      // revalidatePath(`/tournaments/${tournamentId}`); // Temporarily disabled for debugging
      // revalidatePath('/tournaments'); // Temporarily disabled for debugging
      console.log(`✅ [registerAuthenticatedPlayerForTournamentV2] Jugador autenticado registrado usando Strategy Pattern`);
    }
    
    // Mapear resultado al formato esperado por la API anterior
    return {
      success: result.success,
      message: result.success ? '¡Inscripción exitosa!' : (result.error || 'Error desconocido'),
      inscriptionId: result.inscriptionId
    };
    
  } catch (error) {
    console.error('[registerAuthenticatedPlayerForTournamentV2] Error con Strategy Pattern:', error);
    return {
      success: false,
      message: 'Error interno del sistema de registro'
    };
  }
}

/**
 * 🎾 ELIMINACIÓN DE PAREJA (REFACTORIZADO CON STRATEGY PATTERN)
 * 
 * Versión refactorizada que usa el sistema Strategy Pattern.
 * Elimina una pareja del torneo con comportamiento específico por tipo.
 */
export async function removeCoupleFromTournamentV2(
  tournamentId: string, 
  coupleId: string,
  recordLateWithdrawal: boolean = false,
): Promise<{ success: boolean; message: string }> {
  console.log(`[removeCoupleFromTournamentV2] 🎾 Eliminando pareja con Strategy Pattern`, { tournamentId, coupleId });
  
  try {
    // Usar el nuevo sistema de eliminación con Strategy Pattern
    const { removeCouple } = await import('@/lib/services/registration');
    
    const result = await removeCouple({
      tournamentId,
      coupleId,
      recordLateWithdrawal,
    });
    
    // Revalidar paths para mantener comportamiento anterior
    if (result.success) {
      // revalidatePath(`/tournaments/${tournamentId}`); // Temporarily disabled for debugging
      // revalidatePath('/tournaments'); // Temporarily disabled for debugging
      // revalidatePath(`/my-tournaments/${tournamentId}`); // Temporarily disabled for debugging
      console.log(`✅ [removeCoupleFromTournamentV2] Pareja eliminada usando Strategy Pattern`);
    }
    
    // Mapear resultado al formato esperado por la API anterior
    return {
      success: result.success,
      message: result.success ? 
        (result.message || 'Pareja eliminada del torneo exitosamente.') : 
        (result.error || 'Error desconocido')
    };
    
  } catch (error) {
    console.error('[removeCoupleFromTournamentV2] Error con Strategy Pattern:', error);
    return {
      success: false,
      message: 'Error interno del sistema de eliminación'
    };
  }
}

/**
 * 🎾 CONVERSIÓN DE INDIVIDUAL A PAREJA (REFACTORIZADO CON STRATEGY PATTERN)
 * 
 * Versión refactorizada que usa el sistema Strategy Pattern.
 * Convierte inscripciones individuales en una inscripción de pareja.
 */
export async function registerCoupleForTournamentAndRemoveIndividualV2(
  tournamentId: string, 
  player1Id: string, 
  player2Id: string
): Promise<{ 
  success: boolean; 
  error?: string; 
  inscription?: any; 
  convertedFrom?: 'player1' | 'player2' | null;
  message?: string;
}> {
  console.log(`[registerCoupleForTournamentAndRemoveIndividualV2] 🎾 Conversión individual→pareja con Strategy Pattern`, 
    { tournamentId, player1Id, player2Id });
  
  try {
    // Usar el nuevo sistema de conversión con Strategy Pattern
    const { convertIndividualToCouple } = await import('@/lib/services/registration');
    
    const result = await convertIndividualToCouple({
      tournamentId,
      player1Id,
      player2Id
    });
    
    // Revalidar paths para mantener comportamiento anterior
    if (result.success) {
      // revalidatePath(`/tournaments/${tournamentId}`); // Temporarily disabled for debugging
      // revalidatePath('/tournaments'); // Temporarily disabled for debugging
      // revalidatePath(`/my-tournaments/${tournamentId}`); // Temporarily disabled for debugging
      console.log(`✅ [registerCoupleForTournamentAndRemoveIndividualV2] Conversión exitosa usando Strategy Pattern`);
    }
    
    // Mapear resultado al formato esperado por la API anterior
    // Nota: El Strategy Pattern maneja internamente el "convertedFrom", 
    // pero para mantener backward compatibility, lo inferimos de los datos disponibles
    return {
      success: result.success,
      error: result.error,
      inscription: result.inscription || { id: result.inscriptionId },
      convertedFrom: null, // El Strategy no maneja este campo legacy, se puede inferir después si es necesario
      message: result.success ? 
        'Inscripciones individuales convertidas a pareja exitosamente.' : 
        result.error
    };
    
  } catch (error) {
    console.error('[registerCoupleForTournamentAndRemoveIndividualV2] Error con Strategy Pattern:', error);
    return {
      success: false,
      error: 'Error interno del sistema de conversión',
      message: 'Error interno del sistema de conversión'
    };
  }
}

// =============================================================================
// GESTION DE INSCRIPCIONES PENDIENTES
// =============================================================================

/**
 * Aprobar una inscripcion pendiente
 * Solo puede ser ejecutado por el organizador/club del torneo
 */
export async function approveInscription(inscriptionId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  console.log(`[approveInscription] Aprobando inscripcion ${inscriptionId}`);
  
  const supabase = await createClient();
  
  // Verificar autenticacion
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autenticado' };
  }
  
  // Obtener la inscripcion
  const { data: inscription, error: fetchError } = await supabase
    .from('inscriptions')
    .select('id, tournament_id, is_pending, payment_proof_status')
    .eq('id', inscriptionId)
    .single();
  
  if (fetchError || !inscription) {
    console.error('[approveInscription] Error obteniendo inscripcion:', fetchError);
    return { success: false, error: 'Inscripcion no encontrada' };
  }
  
  // Verificar que la inscripcion este pendiente
  if (!inscription.is_pending) {
    return { success: false, error: 'La inscripcion ya fue aprobada' };
  }
  
  // Verificar permisos usando la funcion centralizada
  const permissions = await checkTournamentPermissions(user.id, inscription.tournament_id);
  if (!permissions.hasPermission) {
    return { success: false, error: permissions.reason || 'No tienes permisos para aprobar esta inscripcion' };
  }
  
  // Aprobar la inscripcion
    const approvalPayload: Record<string, string | boolean | null> = {
      is_pending: false,
    };

    if (inscription.payment_proof_status === 'PENDING_REVIEW') {
      approvalPayload.payment_proof_status = 'APPROVED';
      approvalPayload.payment_reviewed_at = new Date().toISOString();
      approvalPayload.payment_reviewed_by = user.id;
    }

    const { error: updateError } = await supabase
      .from('inscriptions')
      .update(approvalPayload)
      .eq('id', inscriptionId);
  
  if (updateError) {
    console.error('[approveInscription] Error actualizando inscripcion:', updateError);
    return { success: false, error: 'Error al aprobar la inscripcion' };
  }

  try {
    const { sendTournamentMessage } = await import('@/lib/services/messages');
    await sendTournamentMessage({
      type: 'INSCRIPTION_APPROVED_PLAYER',
      supabase,
      inscriptionId,
    });
  } catch (emailError) {
    console.error('[approveInscription] Error enviando email de aprobacion:', emailError);
  }
  
  console.log(`[approveInscription] Inscripcion ${inscriptionId} aprobada exitosamente`);
  
  // Revalidar paths
  revalidatePath(`/tournaments/${inscription.tournament_id}`);
  revalidatePath(`/my-tournaments/${inscription.tournament_id}`);
  
  return { success: true };
}

/**
 * Rechazar/eliminar una inscripcion pendiente
 * Solo puede ser ejecutado por el organizador/club del torneo
 */
export async function rejectInscription(inscriptionId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  console.log(`[rejectInscription] Rechazando inscripcion ${inscriptionId}`);
  
  const supabase = await createClient();
  
  // Verificar autenticacion
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autenticado' };
  }
  
  // Obtener la inscripcion
  const { data: inscription, error: fetchError } = await supabase
    .from('inscriptions')
    .select('id, tournament_id, is_pending, couple_id, payment_proof_path')
    .eq('id', inscriptionId)
    .single();
  
  if (fetchError || !inscription) {
    console.error('[rejectInscription] Error obteniendo inscripcion:', fetchError);
    return { success: false, error: 'Inscripcion no encontrada' };
  }
  
  // Verificar que la inscripcion este pendiente
  if (!inscription.is_pending) {
    return { success: false, error: 'Solo se pueden rechazar inscripciones pendientes' };
  }
  
  // Verificar permisos usando la funcion centralizada
  const permissions = await checkTournamentPermissions(user.id, inscription.tournament_id);
  if (!permissions.hasPermission) {
    return { success: false, error: permissions.reason || 'No tienes permisos para rechazar esta inscripcion' };
  }

  if (inscription.couple_id) {
    const cleanupResult = await removeTournamentCoupleMembership({
      supabase,
      tournamentId: inscription.tournament_id,
      coupleId: inscription.couple_id,
      deleteInscription: false,
    });

    if (!cleanupResult.success) {
      console.error('[rejectInscription] Error limpiando zonas canonicas:', cleanupResult.error);
      return { success: false, error: 'Error limpiando zonas de la inscripcion' };
    }
  }

  if (inscription.payment_proof_path) {
    const { deleteInscriptionProof } = await import('@/lib/services/inscription-proofs');
    const deleteProofResult = await deleteInscriptionProof(inscription.payment_proof_path);
    if (!deleteProofResult.success) {
      console.warn('[rejectInscription] Error al borrar comprobante:', deleteProofResult.error);
    }
  }
  
  // Eliminar la inscripcion
  const { error: deleteError } = await supabase
    .from('inscriptions')
    .delete()
    .eq('id', inscriptionId);
  
  if (deleteError) {
    console.error('[rejectInscription] Error eliminando inscripcion:', deleteError);
    return { success: false, error: 'Error al rechazar la inscripcion' };
  }
  
  console.log(`[rejectInscription] Inscripcion ${inscriptionId} rechazada exitosamente`);

  try {
    await syncTournamentCapacityRegistrationLock(inscription.tournament_id)
  } catch (capacityError) {
    console.error('[rejectInscription] Error sincronizando cupo del torneo:', capacityError)
  }
  
  // Revalidar paths
  revalidatePath('/');
  revalidatePath('/panel');
  revalidatePath('/tournaments');
  revalidatePath('/tournaments/upcoming');
  revalidatePath(`/tournaments/${inscription.tournament_id}`);
  revalidatePath(`/my-tournaments/${inscription.tournament_id}`);
  
  return { success: true };
}

/**
 * Obtener inscripciones pendientes de un torneo
 */
export async function getPendingInscriptions(tournamentId: string): Promise<{
  success: boolean;
  inscriptions?: any[];
  error?: string;
}> {
  console.log(`[getPendingInscriptions] Obteniendo inscripciones pendientes del torneo ${tournamentId}`);
  
  const supabase = await createClient();
  
  const { data: inscriptions, error } = await supabase
    .from('inscriptions')
    .select(`
      id,
      tournament_id,
      player_id,
      couple_id,
      phone,
      is_pending,
      created_at,
      payment_proof_status,
      payment_proof_uploaded_at,
      payment_alias_snapshot,
      payment_amount_snapshot,
      players:player_id (
        id,
        first_name,
        last_name,
        phone,
        dni
      ),
      couples:couple_id (
        id,
        player1:player1_id (
          id,
          first_name,
          last_name,
          phone
        ),
        player2:player2_id (
          id,
          first_name,
          last_name,
          phone
        )
      )
    `)
    .eq('tournament_id', tournamentId)
    .eq('is_pending', true)
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('[getPendingInscriptions] Error:', error);
    return { success: false, error: 'Error al obtener inscripciones pendientes' };
  }
  
  return { success: true, inscriptions: inscriptions || [] };
}

// ============================================================================
// PAYMENT MANAGEMENT ACTIONS
// ============================================================================

interface PaymentStatus {
  playerId: string;
  playerName: string;
  hasPaid: boolean;
  paidAt: string | null;
}

interface InscriptionPaymentsResult {
  success: boolean;
  payments?: PaymentStatus[];
  error?: string;
}

/**
 * Obtener el estado de pagos de una inscripcion
 */
export async function getInscriptionPayments(inscriptionId: string): Promise<InscriptionPaymentsResult> {
  console.log(`[getInscriptionPayments] Obteniendo pagos de inscripcion ${inscriptionId}`);
  
  const supabase = await createClient();
  
  const { data: payments, error } = await supabase
    .from('inscription_payments')
    .select(`
      id,
      player_id,
      has_paid,
      paid_at,
      players:player_id (
        id,
        first_name,
        last_name
      )
    `)
    .eq('inscription_id', inscriptionId);
  
  if (error) {
    console.error('[getInscriptionPayments] Error:', error);
    return { success: false, error: 'Error al obtener estado de pagos' };
  }
  
  const formattedPayments: PaymentStatus[] = (payments || []).map((p: any) => ({
    playerId: p.player_id,
    playerName: p.players ? `${p.players.first_name || ''} ${p.players.last_name || ''}`.trim() : 'Desconocido',
    hasPaid: p.has_paid,
    paidAt: p.paid_at
  }));
  
  return { success: true, payments: formattedPayments };
}

/**
 * Actualizar el estado de pago de un jugador en una inscripción
 * Solo puede ser ejecutado por el organizador/club del torneo
 *
 * NOTA: Los pagos son independientes de la aprobación de inscripciones.
 * El organizador marca pagos manualmente para organizarse.
 */
export async function updatePlayerPaymentStatus(
  inscriptionId: string,
  playerId: string,
  hasPaid: boolean
): Promise<{ success: boolean; error?: string }> {
  console.log(`[updatePlayerPaymentStatus] inscripción=${inscriptionId}, jugador=${playerId}, pagado=${hasPaid}`);

  const supabase = await createClient();

  // Verificar autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autenticado' };
  }

  // Obtener la inscripción para verificar permisos
  const { data: inscription, error: fetchError } = await supabase
    .from('inscriptions')
    .select('id, tournament_id, is_pending')
    .eq('id', inscriptionId)
    .single();

  if (fetchError || !inscription) {
    console.error('[updatePlayerPaymentStatus] Error obteniendo inscripción:', fetchError);
    return { success: false, error: 'Inscripción no encontrada' };
  }

  // Verificar que la inscripción esté aprobada
  // NOTA: Solo se pueden marcar pagos en inscripciones aprobadas
  if (inscription.is_pending) {
    return { success: false, error: 'Solo se puede gestionar pagos de inscripciones aprobadas' };
  }

  // Verificar permisos usando la función centralizada
  const permissions = await checkTournamentPermissions(user.id, inscription.tournament_id);
  if (!permissions.hasPermission) {
    return { success: false, error: permissions.reason || 'No tienes permisos para gestionar pagos' };
  }

  // Usar el servicio de pagos para actualizar el estado
  const { updatePaymentStatus } = await import('@/lib/services/payments');

  const result = await updatePaymentStatus({
    inscriptionId,
    playerId,
    hasPaid,
    supabase
  });

  if (!result.success) {
    return result;
  }

  // Revalidar paths
  revalidatePath(`/tournaments/${inscription.tournament_id}`);
  revalidatePath(`/tournaments/${inscription.tournament_id}/inscriptions`);

  return { success: true };
}

/**
 * Obtener todos los pagos de un torneo (para vista de organizador)
 */
export async function getTournamentPayments(tournamentId: string): Promise<{
  success: boolean;
  payments?: Array<{
    inscriptionId: string;
    coupleId: string;
    player1: PaymentStatus | null;
    player2: PaymentStatus | null;
  }>;
  error?: string;
}> {
  console.log(`[getTournamentPayments] Obteniendo pagos del torneo ${tournamentId}`);
  
  const supabase = await createClient();
  
  // Verificar autenticacion
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'No autenticado' };
  }
  
  // Verificar permisos
  const permissions = await checkTournamentPermissions(user.id, tournamentId);
  if (!permissions.hasPermission) {
    return { success: false, error: permissions.reason || 'No tienes permisos para ver pagos' };
  }
  
  // Obtener inscripciones aprobadas con sus pagos
  const { data: inscriptions, error: inscError } = await supabase
    .from('inscriptions')
    .select(`
      id,
      couple_id,
      couples:couple_id (
        id,
        player_1_id,
        player_2_id,
        player1:player_1_id (
          id,
          first_name,
          last_name
        ),
        player2:player_2_id (
          id,
          first_name,
          last_name
        )
      ),
      inscription_payments (
        player_id,
        has_paid,
        paid_at
      )
    `)
    .eq('tournament_id', tournamentId)
    .eq('is_pending', false);
  
  if (inscError) {
    console.error('[getTournamentPayments] Error:', inscError);
    return { success: false, error: 'Error al obtener pagos del torneo' };
  }
  
  const formattedPayments = (inscriptions || []).map((insc: any) => {
    const couple = insc.couples;
    const payments = insc.inscription_payments || [];
    
    const player1Payment = payments.find((p: any) => p.player_id === couple?.player_1_id);
    const player2Payment = payments.find((p: any) => p.player_id === couple?.player_2_id);
    
    return {
      inscriptionId: insc.id,
      coupleId: insc.couple_id,
      player1: couple?.player1 ? {
        playerId: couple.player_1_id,
        playerName: `${couple.player1.first_name || ''} ${couple.player1.last_name || ''}`.trim(),
        hasPaid: player1Payment?.has_paid || false,
        paidAt: player1Payment?.paid_at || null
      } : null,
      player2: couple?.player2 ? {
        playerId: couple.player_2_id,
        playerName: `${couple.player2.first_name || ''} ${couple.player2.last_name || ''}`.trim(),
        hasPaid: player2Payment?.has_paid || false,
        paidAt: player2Payment?.paid_at || null
      } : null
    };
  });
  
  return { success: true, payments: formattedPayments };
}
