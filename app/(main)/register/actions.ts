"use server"

import { createClient, createClientServiceRole } from "@/utils/supabase/server"
import { revalidatePath } from 'next/cache'
import { validateAndFormatPhone } from '@/utils/phone'
import { normalizePlayerDni, sanitizeDniInput } from '@/lib/utils/player-dni'
import { findExistingPlayerByIdentity } from '@/lib/utils/player-identity'

// Interface for registration result
interface RegisterResult {
  success: boolean;
  error?: string;
  message?: string;
  matched?: boolean;
  requiresConfirmation?: boolean;
  showConflictReport?: boolean;
  existingPlayer?: {
    id: string;
    name: string;
    score: number;
    category: string;
    dni: string | null;
    isExistingPlayer: boolean;
  };
  tempUserId?: string;
  conflictData?: {
    dni: string | null;
    existingPlayerId: string;
    newPlayerId: string;
  };
  playerData?: {
    name: string;
    score: number;
    category: string;
    isExistingPlayer: boolean;
  };
  redirectUrl?: string;
}

/**
 * Helper function to check if a player exists by DNI
 */
async function checkPlayerByDNI(dni: string, supabase: any) {
  const sanitizedDni = sanitizeDniInput(dni)
  if (!sanitizedDni) {
    return { success: true, player: null };
  }

  console.log(`[checkPlayerByDNI] Searching for player with DNI: ${sanitizedDni}`);
  
  const { data: existingPlayer, error } = await supabase
    .from('players')
    .select('id, first_name, last_name, dni, dni_is_temporary, user_id, score, category_name, is_categorized')
    .eq('dni', sanitizedDni)
    .eq('es_prueba', false)
    .maybeSingle();
    
  if (error) {
    console.error(`[checkPlayerByDNI] Error searching player by DNI ${sanitizedDni}:`, error);
    return { success: false, error: error.message };
  }
  
  console.log(`[checkPlayerByDNI] Found player:`, existingPlayer);
  return { success: true, player: existingPlayer };
}

async function deleteAuthUserSafely(userId: string) {
  try {
    const adminSupabase = await createClientServiceRole()
    const { error } = await adminSupabase.auth.admin.deleteUser(userId)

    if (error) {
      console.error(`[register-actions] Could not delete auth user ${userId}:`, error)
    }
  } catch (error) {
    console.error(`[register-actions] Unexpected error deleting auth user ${userId}:`, error)
  }
}

async function cleanupRegisteredUser(userId: string) {
  try {
    const adminSupabase = await createClientServiceRole()
    const { error } = await adminSupabase.from('users').delete().eq('id', userId)

    if (error) {
      console.error(`[register-actions] Could not delete public user ${userId}:`, error)
    }
  } catch (error) {
    console.error(`[register-actions] Unexpected error deleting public user ${userId}:`, error)
  }

  await deleteAuthUserSafely(userId)
}

function sanitizeRedirectTo(redirectTo: string | null): string | null {
  if (!redirectTo || !redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
    return null
  }

  return redirectTo
}

function buildPlayerRedirectUrl(formData: FormData, fallback = '/panel'): string {
  const redirectTo = sanitizeRedirectTo(formData.get('redirectTo') as string | null)
  const intent = formData.get('intent') as string | null

  if (!redirectTo) return fallback

  const url = new URL(redirectTo, 'http://localhost')
  if (intent === 'individual' || intent === 'couple') {
    url.searchParams.set('intent', intent)
  }

  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Helper function to link a user to an existing player
 */
async function linkUserToExistingPlayer(playerId: string, userId: string, supabase: any, formData?: FormData) {
  console.log(`[linkUserToExistingPlayer] Linking user ${userId} to player ${playerId}`);
  
  // Prepare update data - always include user_id
  const updateData: any = { user_id: userId };
  
  // If formData is provided, also update additional fields from the registration form
  if (formData) {
    const phone = formData.get('phone') as string | null;
    const gender = formData.get('gender') as string | null;
    const dateOfBirth = formData.get('dateOfBirth') as string | null;
    const normalizedDni = normalizePlayerDni(formData.get('dni') as string | null);
    
    // Only update fields that have values
    if (normalizedDni.dni) {
      updateData.dni = normalizedDni.dni;
      updateData.dni_is_temporary = normalizedDni.dniIsTemporary;
    }

    if (phone && phone.trim() !== '') {
      updateData.phone = phone;
    }
    
    if (gender && gender.trim() !== '') {
      updateData.gender = gender as 'MALE' | 'FEMALE' | 'MIXED';
    }
    
    if (dateOfBirth && dateOfBirth.trim() !== '') {
      updateData.date_of_birth = dateOfBirth;
    }
    
    console.log(`[linkUserToExistingPlayer] Updating player with additional data:`, updateData);
  }
  
  const { error } = await supabase
    .from('players')
    .update(updateData)
    .eq('id', playerId);
    
  if (error) {
    console.error(`[linkUserToExistingPlayer] Error linking user to player:`, error);
    return { success: false, error: error.message };
  }
  
  console.log(`[linkUserToExistingPlayer] Successfully linked user ${userId} to player ${playerId} with updated data`);
  return { success: true };
}

/**
 * Advanced normalize function for flexible string comparison
 */
function advancedNormalize(str: string | null | undefined): string {
  if (!str) return '';

  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')                    // Múltiples espacios → uno
    .replace(/[.,-]/g, '')                   // Quita puntuación
    .normalize('NFD')                        // Descompone acentos
    .replace(/[\u0300-\u036f]/g, '')         // Quita marcas de acento
    .replace(/[^a-z0-9\s]/g, '')             // Solo letras, números, espacios
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity percentage between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Super flexible name matching algorithm
 * Mejorado para manejar segundos nombres y nombres compuestos
 */
function superFlexibleNameMatch(existing: string, provided: string): {
  isMatch: boolean;
  confidence: number;
  reason: string;
} {
  const normalizedExisting = advancedNormalize(existing);
  const normalizedProvided = advancedNormalize(provided);

  console.log(`[superFlexibleNameMatch] Comparing:`, {
    original: { existing, provided },
    normalized: { existing: normalizedExisting, provided: normalizedProvided }
  });

  // NIVEL 1: Match exacto normalizado (100% confianza)
  if (normalizedExisting === normalizedProvided) {
    return { isMatch: true, confidence: 1.0, reason: 'exact_match' };
  }

  // NIVEL 2: Uno contiene al otro - MEJORADO para segundos nombres
  // Caso especial: "Giuliano" está contenido en "Giuliano Agustin"
  if (normalizedExisting.includes(normalizedProvided) || normalizedProvided.includes(normalizedExisting)) {
    // Si uno es substring del otro al inicio (caso de segundos nombres)
    if (normalizedProvided.startsWith(normalizedExisting + ' ') ||
        normalizedExisting.startsWith(normalizedProvided + ' ')) {
      return { isMatch: true, confidence: 0.98, reason: 'middle_name_match' };
    }

    const similarity = calculateSimilarity(normalizedExisting, normalizedProvided);
    if (similarity >= 0.7) {
      return { isMatch: true, confidence: 0.95, reason: 'contains_match' };
    }
  }

  // NIVEL 3: Palabras en común (para nombres compuestos)
  const existingWords = normalizedExisting.split(' ').filter(w => w.length > 1);
  const providedWords = normalizedProvided.split(' ').filter(w => w.length > 1);

  if (existingWords.length > 0 && providedWords.length > 0) {
    let commonWords = 0;
    let totalWords = Math.max(existingWords.length, providedWords.length);

    for (const existingWord of existingWords) {
      for (const providedWord of providedWords) {
        // Match exacto de palabra
        if (existingWord === providedWord) {
          commonWords += 1;
          break;
        }
        // Match flexible de palabra (máximo 1 error)
        if (existingWord.length > 2 && providedWord.length > 2) {
          if (levenshteinDistance(existingWord, providedWord) <= 1) {
            commonWords += 0.8; // Peso menor para matches con typo
            break;
          }
        }
      }
    }

    const wordSimilarity = commonWords / totalWords;
    if (wordSimilarity >= 0.6) {
      return { isMatch: true, confidence: wordSimilarity, reason: 'word_similarity' };
    }
  }

  // NIVEL 4: Similitud por distancia de edición (mínimo 80%)
  const similarity = calculateSimilarity(normalizedExisting, normalizedProvided);
  if (similarity >= 0.8) {
    return { isMatch: true, confidence: similarity, reason: 'edit_distance' };
  }

  // NIVEL 5: Match de iniciales + apellido completo
  const existingParts = normalizedExisting.split(' ');
  const providedParts = normalizedProvided.split(' ');

  if (existingParts.length >= 2 && providedParts.length >= 2) {
    const existingFirst = existingParts[0];
    const existingLast = existingParts[existingParts.length - 1];
    const providedFirst = providedParts[0];
    const providedLast = providedParts[providedParts.length - 1];

    // Si apellidos coinciden y nombres empiezan igual
    if (existingLast === providedLast &&
        existingFirst.charAt(0) === providedFirst.charAt(0)) {
      return { isMatch: true, confidence: 0.75, reason: 'initial_lastname_match' };
    }
  }

  return { isMatch: false, confidence: similarity, reason: 'no_match' };
}

/**
 * Helper function to validate player linking compatibility with super flexible matching
 */
function validatePlayerLinking(existingPlayer: any, formData: FormData) {
  const firstName = formData.get('firstName') as string;
  const lastName = formData.get('lastName') as string;

  // Comparar nombres por separado
  const firstNameResult = superFlexibleNameMatch(
    existingPlayer.first_name || '',
    firstName || ''
  );

  const lastNameResult = superFlexibleNameMatch(
    existingPlayer.last_name || '',
    lastName || ''
  );

  // También comparar nombres completos
  const fullExistingName = `${existingPlayer.first_name || ''} ${existingPlayer.last_name || ''}`.trim();
  const fullProvidedName = `${firstName || ''} ${lastName || ''}`.trim();
  const fullNameResult = superFlexibleNameMatch(fullExistingName, fullProvidedName);

  // Determinar si es válido (múltiples criterios)
  // MEJORADO: Aceptar si:
  // 1. Ambos nombres coinciden con confianza >= 0.7
  // 2. Nombre completo coincide con confianza >= 0.8
  // 3. NUEVO: Nombre coincide con middle_name_match (98%) y apellido es exacto
  const isValid =
    (firstNameResult.isMatch && lastNameResult.isMatch &&
     Math.min(firstNameResult.confidence, lastNameResult.confidence) >= 0.7) ||
    (fullNameResult.isMatch && fullNameResult.confidence >= 0.8) ||
    (firstNameResult.reason === 'middle_name_match' && lastNameResult.isMatch && lastNameResult.confidence >= 0.95);

  const avgConfidence = (firstNameResult.confidence + lastNameResult.confidence + fullNameResult.confidence) / 3;

  console.log(`[validatePlayerLinking] Advanced comparison:`, {
    existing: fullExistingName,
    provided: fullProvidedName,
    firstName: firstNameResult,
    lastName: lastNameResult,
    fullName: fullNameResult,
    isValid,
    avgConfidence: Math.round(avgConfidence * 100) + '%'
  });

  return {
    isValid,
    confidence: avgConfidence,
    existingName: fullExistingName,
    providedName: fullProvidedName,
    details: {
      firstName: firstNameResult,
      lastName: lastNameResult,
      fullName: fullNameResult
    }
  };
}

/**
 * Function to confirm linking a user account to an existing player
 * Legacy version for backward compatibility
 */
export async function confirmPlayerLinking(playerId: string, tempUserId: string, formData?: FormData): Promise<RegisterResult> {
  const supabase = await createClient();
  
  console.log(`[confirmPlayerLinking] Confirming link between user ${tempUserId} and player ${playerId}`);
  
  try {
    // Double-check that the player doesn't already have a user linked
    const { data: playerCheck, error: checkError } = await supabase
      .from('players')
      .select('id, first_name, last_name, user_id, score, category_name')
      .eq('id', playerId)
      .single();
      
    if (checkError) {
      console.error(`[confirmPlayerLinking] Error checking player:`, checkError);
      return { success: false, error: 'Error al verificar el jugador.' };
    }
    
    if (playerCheck.user_id) {
      console.error(`[confirmPlayerLinking] Player already has user linked:`, playerCheck.user_id);
      return { success: false, error: 'Este jugador ya tiene una cuenta vinculada.' };
    }
    
    // Perform the linking with form data if available
    const linkResult = await linkUserToExistingPlayer(playerId, tempUserId, supabase, formData);
    
    if (!linkResult.success) {
      return { success: false, error: `Error al vincular cuenta: ${linkResult.error}` };
    }
    
    console.log(`[confirmPlayerLinking] Successfully linked user ${tempUserId} to player ${playerId}`);
    
    revalidatePath('/', 'layout');
    
    return {
      success: true,
      matched: true,
      message: `¡Cuenta vinculada exitosamente! Tu perfil de jugador existente ha sido conectado con tu nueva cuenta.`,
      playerData: {
        name: `${playerCheck.first_name} ${playerCheck.last_name}`,
        score: playerCheck.score || 0,
        category: playerCheck.category_name || 'Sin categorizar',
        isExistingPlayer: true
      },
      redirectUrl: formData ? buildPlayerRedirectUrl(formData) : '/panel',
    };
    
  } catch (error: any) {
    console.error(`[confirmPlayerLinking] Unexpected error:`, error);
    return { success: false, error: `Error inesperado: ${error.message}` };
  }
}

/**
 * Function to confirm linking a user account to an existing player with complete form data
 * This version receives the complete form data to update additional fields like date_of_birth, phone, etc.
 */
export async function confirmPlayerLinkingWithFormData(
  playerId: string, 
  tempUserId: string, 
  formData: FormData
): Promise<RegisterResult> {
  const supabase = await createClient();
  
  console.log(`[confirmPlayerLinkingWithFormData] Confirming link between user ${tempUserId} and player ${playerId} with form data`);
  
  try {
    // Double-check that the player doesn't already have a user linked
    const { data: playerCheck, error: checkError } = await supabase
      .from('players')
      .select('id, first_name, last_name, user_id, score, category_name')
      .eq('id', playerId)
      .single();
      
    if (checkError) {
      console.error(`[confirmPlayerLinkingWithFormData] Error checking player:`, checkError);
      return { success: false, error: 'Error al verificar el jugador.' };
    }
    
    if (playerCheck.user_id) {
      console.error(`[confirmPlayerLinkingWithFormData] Player already has user linked:`, playerCheck.user_id);
      return { success: false, error: 'Este jugador ya tiene una cuenta vinculada.' };
    }
    
    // Perform the linking with complete form data
    const linkResult = await linkUserToExistingPlayer(playerId, tempUserId, supabase, formData);
    
    if (!linkResult.success) {
      return { success: false, error: `Error al vincular cuenta: ${linkResult.error}` };
    }
    
    console.log(`[confirmPlayerLinkingWithFormData] Successfully linked user ${tempUserId} to player ${playerId} with updated data`);
    
    revalidatePath('/', 'layout');
    
    return {
      success: true,
      matched: true,
      message: `¡Cuenta vinculada exitosamente! Tu perfil de jugador existente ha sido conectado con tu nueva cuenta y datos actualizados.`,
      playerData: {
        name: `${playerCheck.first_name} ${playerCheck.last_name}`,
        score: playerCheck.score || 0,
        category: playerCheck.category_name || 'Sin categorizar',
        isExistingPlayer: true
      },
      redirectUrl: buildPlayerRedirectUrl(formData),
    };
    
  } catch (error: any) {
    console.error(`[confirmPlayerLinkingWithFormData] Unexpected error:`, error);
    return { success: false, error: `Error inesperado: ${error.message}` };
  }
}

/**
 * Function to reject linking and create a new player instead
 */
export async function rejectPlayerLinking(formData: FormData, tempUserId: string, existingPlayerId?: string): Promise<RegisterResult> {
  const supabase = await createClient();
  
  console.log(`[rejectPlayerLinking] User rejected linking to existing player ${existingPlayerId}`);
  
  try {
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const dni = formData.get('dni') as string | null;
    const phone = formData.get('phone') as string | null;
    const gender = formData.get('gender') as string | null;
    const dateOfBirth = formData.get('dateOfBirth') as string | null;
    
    // Create a temporary/blocked player profile so the user record is complete
    // This will be cleaned up by the admin after resolving the conflict
    const { data: blockedPlayer, error: playerError } = await supabase.from('players').insert({
      first_name: firstName,
      last_name: lastName,
      dni: dni, // Keep original DNI for conflict resolution
      phone: phone,
      gender: gender === '' ? null : (gender as 'MALE' | 'FEMALE' | 'MIXED'),
      date_of_birth: dateOfBirth === '' ? null : dateOfBirth,
      user_id: tempUserId,
      score: 0,
      is_categorized: false, // Mark as inactive to indicate it's blocked
    }).select('id').single();
    
    if (playerError) {
      console.error(`[rejectPlayerLinking] Error creating blocked player profile:`, playerError);
      return { success: false, error: `Error al crear perfil temporal: ${playerError.message}` };
    }
    
    console.log(`[rejectPlayerLinking] Created blocked player profile ${blockedPlayer.id} for user ${tempUserId}`);
    
    // Register DNI conflict for admin review if there was an existing player
    if (existingPlayerId && dni) {
      console.log(`[rejectPlayerLinking] Registering DNI conflict for admin review`);
      
      const { error: conflictError } = await supabase.from('dni_conflicts').insert({
        dni: dni,
        existing_player_id: existingPlayerId,
        new_player_id: blockedPlayer.id, // Reference the blocked player
        new_user_id: tempUserId,
        status: 'pending'
      });
      
      if (conflictError) {
        console.error(`[rejectPlayerLinking] Error registering DNI conflict:`, conflictError);
      } else {
        console.log(`[rejectPlayerLinking] DNI conflict registered for admin review`);
      }
    }
    
    console.log(`[rejectPlayerLinking] Registration blocked due to DNI conflict rejection`);
    
    return {
      success: false,
      error: 'Registro bloqueado por conflicto de datos. Contacta al administrador para resolver este problema.',
      showConflictReport: true,
      conflictData: existingPlayerId ? {
        dni: dni,
        existingPlayerId: existingPlayerId,
        newPlayerId: blockedPlayer.id
      } : undefined,
    };
    
  } catch (error: any) {
    console.error(`[rejectPlayerLinking] Unexpected error:`, error);
    return { success: false, error: `Error inesperado: ${error.message}` };
  }
}

/**
 * Function to check for DNI conflicts BEFORE creating auth user
 * This prevents creating orphaned auth users
 */
export async function checkDNIConflictBeforeRegistration(formData: FormData): Promise<RegisterResult> {
  const supabase = await createClient();
  
  console.log(`[checkDNIConflictBeforeRegistration] Checking for DNI conflicts before registration`);
  
  try {
    const normalizedDni = normalizePlayerDni(formData.get('dni') as string | null);
    const role = formData.get('role') as string;
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const gender = formData.get('gender') as string | null;
    
    // Only check for PLAYER role
    if (role !== 'PLAYER') {
      return { success: true }; // No conflict check needed
    }

    let existingPlayer: Awaited<ReturnType<typeof checkPlayerByDNI>>['player'] | null = null;

    if (normalizedDni.dni) {
      // Check if DNI already exists
      const existingPlayerResult = await checkPlayerByDNI(normalizedDni.dni, supabase);

      if (!existingPlayerResult.success) {
        return { success: false, error: `Error al verificar DNI: ${existingPlayerResult.error}` };
      }

      existingPlayer = existingPlayerResult.player;
    }

    if (!existingPlayer && firstName && lastName) {
      const identityResult = await findExistingPlayerByIdentity({
        supabase,
        firstName,
        lastName,
        dni: null,
        gender,
      });

      if (identityResult.error) {
        return { success: false, error: `Error al verificar jugador existente: ${identityResult.error}` };
      }

      existingPlayer = identityResult.player;
    }

    if (!existingPlayer) {
      return { success: true }; // No conflict, proceed with registration
    }

    if (existingPlayer.user_id) {
      return {
        success: false,
        error: 'Ya existe una cuenta vinculada a este jugador. Si es tu cuenta, inicia sesión en lugar de registrarte.',
      };
    }
    
    // Existing player found - validate if it could be the same person
    const validation = validatePlayerLinking(existingPlayer, formData);

    if (normalizedDni.dni && !validation.isValid) {
      console.log(`[checkDNIConflictBeforeRegistration] DNI exists but names don't match - blocking registration`);
      
      // Register conflict for admin review WITHOUT creating any users
      const { error: conflictError } = await supabase.from('dni_conflicts').insert({
        dni: normalizedDni.dni,
        existing_player_id: existingPlayer.id,
        new_player_id: null, // No new player created
        new_user_id: null, // No new user created
        status: 'pending',
        phone: formData.get('phone') as string || null, // Capture user's phone number
        admin_notes: JSON.stringify({
          conflict_type: 'blocked_before_registration',
          attempted_name: `${formData.get('firstName')} ${formData.get('lastName')}`,
          existing_name: `${existingPlayer.first_name} ${existingPlayer.last_name}`,
          email: formData.get('email'),
          phone: formData.get('phone') as string || 'No proporcionado',
          blocked_reason: 'Names do not match existing player - registration blocked before user creation'
        })
      });
      
      if (conflictError) {
        console.error(`[checkDNIConflictBeforeRegistration] Error registering conflict:`, conflictError);
      }
      
      return {
        success: false,
        error: 'Este DNI ya está registrado con un nombre diferente. Contacta al administrador para resolver este conflicto.',
        showConflictReport: true,
        conflictData: {
          dni: normalizedDni.dni,
          existingPlayerId: existingPlayer.id,
          newPlayerId: 'blocked' // Indicates it was blocked before creation
        }
      };
    }

    if (!validation.isValid) {
      return { success: true };
    }
    
    // Names match - let the client auto-link the account to this player.
    return {
      success: false, // Don't proceed with normal registration
      requiresConfirmation: true,
      existingPlayer: {
        id: existingPlayer.id,
        name: `${existingPlayer.first_name} ${existingPlayer.last_name}`,
        score: existingPlayer.score || 0,
        category: existingPlayer.category_name || 'Sin categorizar',
        dni: existingPlayer.dni,
        isExistingPlayer: true
      }
    };
    
  } catch (error: any) {
    console.error(`[checkDNIConflictBeforeRegistration] Unexpected error:`, error);
    return { success: false, error: `Error verificando conflictos: ${error.message}` };
  }
}

/**
 * Function to register user and link to existing player in one step
 * This avoids creating temporary users
 */
export async function registerAndLinkToExistingPlayer(formData: FormData, playerId: string): Promise<RegisterResult> {
  const supabase = await createClient();
  
  console.log(`[registerAndLinkToExistingPlayer] Creating user and linking to player ${playerId}`);
  
  try {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    // Basic validation
    if (!email || !password) {
      return { success: false, error: 'Email y contraseña son requeridos.' };
    }
    if (password.length < 6) {
      return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    }
    
    // Double-check that the player doesn't already have a user linked
    const { data: playerCheck, error: checkError } = await supabase
      .from('players')
      .select('id, first_name, last_name, user_id, score, category_name')
      .eq('id', playerId)
      .single();
      
    if (checkError) {
      console.error(`[registerAndLinkToExistingPlayer] Error checking player:`, checkError);
      return { success: false, error: 'Error al verificar el jugador.' };
    }
    
    if (playerCheck.user_id) {
      console.error(`[registerAndLinkToExistingPlayer] Player already has user linked:`, playerCheck.user_id);
      return { success: false, error: 'Este jugador ya tiene una cuenta vinculada.' };
    }
    
    // 1. Create auth user
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      console.error('[registerAndLinkToExistingPlayer] Supabase auth signUp error:', signUpError);
      return { success: false, error: `Error de autenticación: ${signUpError.message}` };
    }

    const authUser = authData.user;
    if (!authUser) {
      return { success: false, error: 'Error al crear usuario de autenticación.' };
    }
    
    console.log(`[registerAndLinkToExistingPlayer] Auth user created: ${authUser.id}`);
    
    // 2. Create user record in our database
    const { error: userInsertError } = await supabase.from('users').insert({
      id: authUser.id,
      email: authUser.email!,
      role: 'PLAYER',
    });

    if (userInsertError) {
      console.error('[registerAndLinkToExistingPlayer] Error inserting user into users table:', userInsertError);
      await deleteAuthUserSafely(authUser.id);
      return { success: false, error: `Error al crear perfil de usuario: ${userInsertError.message}` };
    }
    
    // 3. Link to existing player
    const linkResult = await linkUserToExistingPlayer(playerId, authUser.id, supabase, formData)

    if (!linkResult.success) {
      console.error(`[registerAndLinkToExistingPlayer] Error linking user to player:`, linkResult.error);
      await cleanupRegisteredUser(authUser.id);
      return { success: false, error: `Error al vincular cuenta: ${linkResult.error}` };
    }
    
    console.log(`[registerAndLinkToExistingPlayer] Successfully linked user ${authUser.id} to player ${playerId}`);
    
    revalidatePath('/', 'layout');
    
    return {
      success: true,
      matched: true,
      message: `¡Cuenta creada y vinculada exitosamente! Tu perfil de jugador existente ha sido conectado con tu nueva cuenta.`,
      playerData: {
        name: `${playerCheck.first_name} ${playerCheck.last_name}`,
        score: playerCheck.score || 0,
        category: playerCheck.category_name || 'Sin categorizar',
        isExistingPlayer: true
      },
      redirectUrl: buildPlayerRedirectUrl(formData),
    };
    
  } catch (error: any) {
    console.error(`[registerAndLinkToExistingPlayer] Unexpected error:`, error);
    return { success: false, error: `Error inesperado: ${error.message}` };
  }
}

export async function register(formData: FormData): Promise<RegisterResult> {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const role = formData.get('role') as 'PLAYER' | 'CLUB' | 'COACH' | 'ORGANIZADOR'

  if (!email || !password || !role) {
    return { error: 'Email, contraseña y rol son requeridos.', success: false }
  }

  if (password.length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres.', success: false }
  }

  try {
    let pendingExistingPlayer: Awaited<ReturnType<typeof checkPlayerByDNI>>['player'] | null = null

    if (role === 'CLUB') {
      const clubName = formData.get('clubName') as string
      const phone = formData.get('phone') as string | null

      if (!clubName) {
        return { error: 'El nombre del club es requerido.', success: false }
      }

      if (!phone || phone.trim() === '') {
        return { error: 'El teléfono del club es requerido.', success: false }
      }

      const phoneValidation = validateAndFormatPhone(phone ?? '', 'AR')
      if (!phoneValidation.isValid || !phoneValidation.e164) {
        return { error: phoneValidation.error || 'Teléfono inválido.', success: false }
      }
    } else if (role === 'PLAYER') {
      const firstName = formData.get('firstName') as string
      const lastName = formData.get('lastName') as string
      const normalizedDni = normalizePlayerDni(formData.get('dni') as string | null)
      const rawGender = formData.get('gender') as string | null

      if (!firstName || !lastName) {
        return { error: 'Nombre y apellido son requeridos para jugadores.', success: false }
      }

      if (!rawGender || !['MALE', 'FEMALE'].includes(rawGender)) {
        return { error: 'Debes seleccionar género Caballeros o Damas.', success: false }
      }

      if (normalizedDni.dni) {
        const playerCheckResult = await checkPlayerByDNI(normalizedDni.dni, supabase)

        if (!playerCheckResult.success) {
          return { error: `Error al verificar DNI: ${playerCheckResult.error}`, success: false }
        }

        if (playerCheckResult.player) {
          const existingPlayer = playerCheckResult.player

          if (existingPlayer.user_id) {
            return {
              error: 'Ya existe una cuenta vinculada a este DNI. Si es tu cuenta, inicia sesión en lugar de registrarte.',
              success: false,
            }
          }

          const validation = validatePlayerLinking(existingPlayer, formData)
          if (!validation.isValid) {
            return {
              error: `El nombre proporcionado (${validation.providedName}) no coincide con el registrado para este DNI (${validation.existingName}). Verifica tus datos.`,
              success: false,
            }
          }

          pendingExistingPlayer = existingPlayer
        }
      }

      if (!pendingExistingPlayer) {
        const identityResult = await findExistingPlayerByIdentity({
          supabase,
          firstName,
          lastName,
          dni: null,
          gender: rawGender,
        })

        if (identityResult.error) {
          return { error: `Error al verificar jugador existente: ${identityResult.error}`, success: false }
        }

        if (identityResult.player) {
          const existingPlayer = identityResult.player

          if (existingPlayer.user_id) {
            return {
              error: 'Ya existe una cuenta vinculada a este jugador. Si es tu cuenta, inicia sesión en lugar de registrarte.',
              success: false,
            }
          }

          const validation = validatePlayerLinking(existingPlayer, formData)
          if (validation.isValid) {
            pendingExistingPlayer = existingPlayer
          }
        }
      }
    } else if (role === 'COACH') {
      const firstName = formData.get('firstName') as string
      const lastName = formData.get('lastName') as string

      if (!firstName || !lastName) {
        return { error: 'Nombre y apellido son requeridos para entrenadores.', success: false }
      }
    } else if (role === 'ORGANIZADOR') {
      const organizationName = formData.get('organizationName') as string
      const organizationPhone = formData.get('organizationPhone') as string | null
      const responsibleFirstName = formData.get('responsibleFirstName') as string
      const responsibleLastName = formData.get('responsibleLastName') as string
      const responsibleDni = formData.get('responsibleDni') as string

      if (!organizationName) {
        return { error: 'El nombre de la organización es requerido.', success: false }
      }
      if (!responsibleFirstName || !responsibleLastName) {
        return { error: 'Nombre y apellido del responsable son requeridos.', success: false }
      }
      if (!responsibleDni) {
        return { error: 'El DNI del responsable es requerido.', success: false }
      }
      if (!organizationPhone || organizationPhone.trim() === '') {
        return { error: 'El teléfono de la organización es requerido.', success: false }
      }

      const phoneValidation = validateAndFormatPhone(organizationPhone ?? '', 'AR')
      if (!phoneValidation.isValid || !phoneValidation.e164) {
        return { error: phoneValidation.error || 'Teléfono de organización inválido.', success: false }
      }
    }

    if (role === 'PLAYER' && pendingExistingPlayer) {
      return {
        success: true,
        requiresConfirmation: true,
        message: 'Encontramos un jugador registrado con este DNI.',
        existingPlayer: {
          id: pendingExistingPlayer.id,
          name: `${pendingExistingPlayer.first_name} ${pendingExistingPlayer.last_name}`,
          score: pendingExistingPlayer.score || 0,
          category: pendingExistingPlayer.category_name || 'Sin categorizar',
          dni: pendingExistingPlayer.dni,
          isExistingPlayer: true,
        },
      }
    }

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {},
    })

    if (signUpError) {
      console.error('[RegisterAction] Supabase auth signUp error:', signUpError)
      return { error: `Error de autenticación: ${signUpError.message}`, success: false }
    }

    if (!authData.user) {
      console.error('[RegisterAction] No user data returned from signUp.')
      return { error: 'No se pudo crear el usuario en autenticación.', success: false }
    }

    const authUserId = authData.user.id

    const { data: publicUser, error: publicUserError } = await supabase
      .from('users')
      .insert({
        id: authUserId,
        email: email,
        role: role,
      })
      .select('id')
      .single()

    if (publicUserError || !publicUser) {
      console.error('[RegisterAction] Error inserting into public.users:', publicUserError)
      await deleteAuthUserSafely(authUserId)
      return { error: `Error creando perfil de usuario: ${publicUserError?.message || 'Datos de usuario público no retornados.'}`, success: false }
    }

    const publicUsersTableId = publicUser.id
    let roleTableError: any = null

    if (role === 'CLUB') {
      const clubName = formData.get('clubName') as string
      const address = formData.get('address') as string | null
      const phone = formData.get('phone') as string | null
      const phoneValidation = validateAndFormatPhone(phone ?? '', 'AR')

      if (!phoneValidation.isValid || !phoneValidation.e164) {
        await cleanupRegisteredUser(authUserId)
        return { error: phoneValidation.error || 'Teléfono inválido.', success: false }
      }

      const { error } = await supabase.from('clubes').insert({
        name: clubName,
        address: address,
        phone: phoneValidation.e164,
        user_id: publicUsersTableId,
      })
      roleTableError = error
    } else if (role === 'PLAYER') {
      const firstName = formData.get('firstName') as string
      const lastName = formData.get('lastName') as string
      const normalizedDni = normalizePlayerDni(formData.get('dni') as string | null)
      const phone = formData.get('phone') as string | null
      const rawGender = formData.get('gender') as string | null
      const dateOfBirth = formData.get('dateOfBirth') as string | null

      const { error } = await supabase.from('players').insert({
        first_name: firstName,
        last_name: lastName,
        dni: normalizedDni.dni,
        dni_is_temporary: normalizedDni.dniIsTemporary,
        phone: phone,
        gender: rawGender as 'MALE' | 'FEMALE',
        date_of_birth: dateOfBirth === '' ? null : dateOfBirth,
        user_id: publicUsersTableId,
        score: 0,
        is_categorized: false,
      })
      roleTableError = error
    } else if (role === 'COACH') {
      const firstName = formData.get('firstName') as string
      const lastName = formData.get('lastName') as string

      const { error } = await supabase.from('coaches').insert({
        name: firstName,
        last_name: lastName,
        user_id: publicUsersTableId,
      })
      roleTableError = error
    } else if (role === 'ORGANIZADOR') {
      const organizationName = formData.get('organizationName') as string
      const organizationDescription = formData.get('organizationDescription') as string | null
      const organizationPhone = formData.get('organizationPhone') as string | null
      const responsibleFirstName = formData.get('responsibleFirstName') as string
      const responsibleLastName = formData.get('responsibleLastName') as string
      const responsibleDni = formData.get('responsibleDni') as string
      const responsiblePosition = formData.get('responsiblePosition') as string
      const phoneValidation = validateAndFormatPhone(organizationPhone ?? '', 'AR')

      if (!phoneValidation.isValid || !phoneValidation.e164) {
        await cleanupRegisteredUser(authUserId)
        return { error: phoneValidation.error || 'Teléfono de organización inválido.', success: false }
      }

      const { data: organizationData, error: orgError } = await supabase.from('organizaciones').insert({
        name: organizationName,
        description: organizationDescription,
        phone: phoneValidation.e164,
        responsible_first_name: responsibleFirstName,
        responsible_last_name: responsibleLastName,
        responsible_dni: responsibleDni,
        responsible_position: responsiblePosition,
        is_active: false,
      }).select('id').single()

      if (orgError) {
        console.error('[RegisterAction] Error creating organization:', orgError)
        await cleanupRegisteredUser(authUserId)
        return { error: `Error creando organización: ${orgError.message}`, success: false }
      }

      const { error: memberError } = await supabase.from('organization_members').insert({
        organizacion_id: organizationData.id,
        user_id: publicUsersTableId,
        member_role: 'admin',
        is_active: false,
      })

      roleTableError = memberError

      if (!roleTableError) {
        return {
          success: true,
          message: 'Organización registrada exitosamente. Tu cuenta está pendiente de aprobación por parte del administrador.',
          redirectUrl: '/pending-approval',
        }
      }
    }

    if (roleTableError) {
      console.error(`[RegisterAction] Error inserting into ${role} table:`, roleTableError)
      await cleanupRegisteredUser(authUserId)
      return { error: `Error creando perfil de ${role.toLowerCase()}: ${roleTableError.message}`, success: false }
    }

    revalidatePath('/', 'layout')

    return {
      success: true,
      message: '¡Registro completado! Serás redirigido al dashboard.',
      redirectUrl: role === 'PLAYER' ? buildPlayerRedirectUrl(formData) : '/panel',
    }
  } catch (e: any) {
    console.error('[RegisterAction] Unexpected error:', e)
    return { error: `Error inesperado: ${e.message}`, success: false }
  }
}

