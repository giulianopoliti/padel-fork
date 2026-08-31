"use server"

import { createClient } from "@/utils/supabase/server";
import { supabase } from "@/utils/supabase/client";
import { Player, Couple, Category, Role } from "@/types";
import { User } from "@supabase/supabase-js";

export async function getTop5MalePlayers() {
    const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("gender", "MALE")
        .order("score", { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error fetching top 5 male players:", error);
        return [];
    }

    return data;
}

// ÃƒÂ°Ã…Â¸Ã…Â¡Ã¢â€šÂ¬ OPTIMIZACIÃƒÆ’Ã¢â‚¬Å“N FASE 2: Query optimizada con campos especÃƒÆ’Ã‚Â­ficos
export async function getTopPlayers(limit: number = 5) {
    const query = supabase
        .from("players")
        .select(`
            id,
            first_name,
            last_name,
            score,
            category_name,
            profile_image_url,
            clubes (
                name
            )
        `)
        .eq("gender", "MALE")
        .eq("es_prueba", false)
        .not("score", "is", null)
        .order("score", { ascending: false })
        .limit(limit);

    const { data, error } = await query;

    if (error) {
        console.error("Error fetching top players:", error);
        return [];
    }

    // Obtener puntos semanales para cada jugador
    const { getPlayerWeeklyPoints } = await import("@/app/api/tournaments/actions");
    
    const playersWithWeeklyPoints = await Promise.all(
        data?.map(async (rawPlayer: any) => {
            const weeklyResult = await getPlayerWeeklyPoints(rawPlayer.id);
            const weeklyPoints = weeklyResult.success ? weeklyResult.pointsThisWeek : 0;
            
            let profileImageUrl = rawPlayer.profile_image_url;
            
            if (profileImageUrl) {
                if (!profileImageUrl.startsWith('http')) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(profileImageUrl);
                    profileImageUrl = publicUrl;
                }
            } else {
                const { data: { publicUrl } } = supabase.storage
                    .from('avatars')
                    .getPublicUrl('avatars/foto predeterminada.jpg');
                profileImageUrl = publicUrl;
            }
            
            return {
                id: rawPlayer.id,
                firstName: rawPlayer.first_name,
                lastName: rawPlayer.last_name,
                score: rawPlayer.score,
                category: rawPlayer.category_name || "Sin categoría",
                preferredHand: undefined, // No necesario para ranking
                racket: undefined, // No necesario para ranking
                preferredSide: undefined, // No necesario para ranking
                createdAt: new Date().toISOString(), // Placeholder para cumplir el tipo
                club_name: rawPlayer.clubes?.name || "Sin club",
                gender: "MALE",
                profileImage: profileImageUrl,
                weeklyPoints: weeklyPoints
            };
        }) || []
    );

    return playersWithWeeklyPoints;
}

/**
 * Obtiene una lista paginada de jugadores ordenados por puntaje
 * @param options Opciones de filtrado y paginaciÃƒÆ’Ã‚Â³n
 * @returns Objeto con la lista de jugadores y el conteo total
 */
export async function getRankedPlayers({ 
    page = 1, 
    pageSize = 50, 
    category = null, 
    clubId = null,
    gender = "MALE"
}: { 
    page?: number; 
    pageSize?: number; 
    category?: string | null; 
    clubId?: string | null;
    gender?: "MALE" | "FEMALE";
} = {}) {
    try {
        // Validar parÃƒÆ’Ã‚Â¡metros de entrada
        const validatedPage = Math.max(1, page);
        const validatedPageSize = Math.min(100, Math.max(1, pageSize)); // Limitar tamaÃƒÆ’Ã‚Â±o de pÃƒÆ’Ã‚Â¡gina
        const offset = (validatedPage - 1) * validatedPageSize;

        // Construir la consulta base para jugadores
        const baseQuery = supabase
            .from("players")
            .select(`
                *,
                clubes (
                    name
                )
            `)
            .eq("gender", gender)
            .eq("es_prueba", false);

        // Construir la consulta base para el conteo
        const countQuery = supabase
            .from("players")
            .select("*", { count: "exact" })
            .eq("gender", gender);

        // Aplicar filtros si existen
        if (category) {
            baseQuery.eq("category_name", category);
            countQuery.eq("category_name", category);
        }
        if (clubId) {
            baseQuery.eq("club_id", clubId);
            countQuery.eq("club_id", clubId);
        }

        // ÃƒÂ°Ã…Â¸Ã…Â¡Ã¢â€šÂ¬ OPTIMIZACIÃƒÆ’Ã¢â‚¬Å“N FASE 2: Ejecutar ambas consultas en paralelo
        const [countResult, playersResult] = await Promise.all([
            countQuery,
            baseQuery
                .order("score", { ascending: false })
                .range(offset, offset + validatedPageSize - 1)
        ]);

        // Verificar errores en las consultas
        if (countResult.error) {
            console.error("Error al obtener el conteo total:", countResult.error);
            throw new Error("Error al obtener el conteo total de jugadores");
        }

        if (playersResult.error) {
            console.error("Error al obtener los jugadores:", playersResult.error);
            throw new Error("Error al obtener la lista de jugadores");
        }

        // Obtener puntos semanales para todos los jugadores en batch (optimizaciÃƒÆ’Ã‚Â³n)
        const { getMultiplePlayersWeeklyPoints } = await import("@/app/api/tournaments/actions");
        
        // Extraer IDs de jugadores para consulta batch
        const playerIds = playersResult.data?.map((player: any) => player.id) || [];
        
        // Obtener puntos semanales en una sola consulta con manejo de errores
        let weeklyPointsMap: { [playerId: string]: number } = {};
        try {
            const weeklyPointsResult = await getMultiplePlayersWeeklyPoints(playerIds);
            if (weeklyPointsResult.success) {
                weeklyPointsMap = weeklyPointsResult.weeklyPoints;
            } else {
                console.warn("Warning: Could not fetch weekly points, defaulting to 0:", weeklyPointsResult.error);
            }
        } catch (error) {
            console.error("Error fetching weekly points for players:", error);
            // weeklyPointsMap remains empty object, all players will get 0 points
        }
        
        const mappedPlayers = await Promise.all(
            playersResult.data?.map(async (rawPlayer: any) => {
                const weeklyPoints = weeklyPointsMap[rawPlayer.id] || 0;
                
                // Procesar la URL de la imagen de perfil
                let profileImageUrl = rawPlayer.profile_image_url;
                
                if (profileImageUrl) {
                    if (!profileImageUrl.startsWith('http')) {
                        const { data: { publicUrl } } = supabase.storage
                            .from('avatars')
                            .getPublicUrl(profileImageUrl);
                        profileImageUrl = publicUrl;
                    }
                } else {
                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl('avatars/foto predeterminada.jpg');
                    profileImageUrl = publicUrl;
                }
                
                // Mapear los datos del jugador
                return {
                    id: rawPlayer.id,
                    firstName: rawPlayer.first_name,
                    lastName: rawPlayer.last_name,
                    score: rawPlayer.score,
                    category: rawPlayer.category_name || rawPlayer.category || "Sin categoría",
                    preferredHand: rawPlayer.preferred_hand,
                    racket: rawPlayer.racket,
                    preferredSide: rawPlayer.preferred_side,
                    createdAt: rawPlayer.created_at,
                    club_name: rawPlayer.clubes?.name,
                    organizador_name: null,
                    gender: rawPlayer.gender || "MALE",
                    profileImage: profileImageUrl,
                    weeklyPoints: weeklyPoints
                };
            }) || []
        );
        
        // Retornar resultados con metadata
        return {
            players: mappedPlayers,
            totalCount: countResult.count || 0,
            currentPage: validatedPage,
            pageSize: validatedPageSize,
            totalPages: Math.ceil((countResult.count || 0) / validatedPageSize)
        };
    } catch (error) {
        console.error("Error en getRankedPlayers:", error);
        return {
            players: [],
            totalCount: 0,
            currentPage: page,
            pageSize: pageSize,
            totalPages: 0,
            error: "Error al obtener el ranking de jugadores"
        };
    }
}

export async function getCouples() {
    const { data, error } = await supabase
        .from("couples")
        .select("*");

    if (error) {
        console.error("Error fetching couples:", error);
        return [];
    }

    return data as Couple[];
}

export async function getCategories() {
    const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");

    if (error) {
        console.error("Error fetching categories:", error);
        return [];
    }

    return data as Category[];
}

export async function completeProfile(player: Player) {
    const { data, error } = await supabase
        .from("players")
        .insert(player)
        .select()
}

export const getUser = async (): Promise<User | null> => {
    const supabase = await createClient();
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      
      // Don't log AuthSessionMissingError as it's expected for non-authenticated users
      if (error && error.message !== 'Auth session missing!') {
        console.error("Error fetching user:", error);
      }
      
      if (error) return null;
      return user;
    } catch (error: any) {
      // Don't log AuthSessionMissingError as it's expected for non-authenticated users
      if (error?.message !== 'Auth session missing!') {
        console.error("Error fetching user:", error);
      }
      return null;
    }
  };
  

  export const getUserRole = async (): Promise<Role | null> => {
    try {
      const supabase = await createClient();
      const user = await getUser();
      if (!user) {
        return null;
      }
      const { data, error } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();
      
      if (error) {
        console.error("Error fetching user role:", error);
        return null;
      }
      
      return data.role as Role;
    } catch (error) {
      console.error("Error fetching user role:", error);
      return null;
    }
  };


  export async function getUserByDni(dni: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("dni", dni);

    if (error) {
      console.error("Error fetching user by DNI:", error);
      return null;
    }

    return data;
  }


    export async function getClubById(clubId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clubes")
      .select("*")
      .eq("id", clubId)
      .eq("is_active", true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error("Error fetching club by ID:", error);
      return null;
    }

    return data;
  }

  // Internal function for admin/system use - gets club regardless of active status
  export async function getClubByIdInternal(clubId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clubes")
      .select("*")
      .eq("id", clubId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error("Error fetching club by ID (internal):", error);
      return null;
    }

    return data;
  }



  export async function getClubes() {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clubes")
      .select("*");

    if (error) {
      console.error("Error fetching clubes:", error);
      return [];
    }

    return data;
  }
  
  export async function getPlayersByClubId(clubId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("club_id", clubId);

    if (error) {
      console.error("Error fetching players by club ID:", error);
      return [];
    }

    return data;
  }

  /**
   * Get players of a specific club with detailed information for ranking display
   */
  export async function getClubPlayersForRanking(clubId: string) {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from("players")
      .select(`
        id,
        first_name,
        last_name,
        score,
        category_name,
        preferred_hand,
        preferred_side,
        racket,
        gender,
        profile_image_url,
        created_at,
        clubes (
          id,
          name
        )
      `)
      .eq("club_id", clubId)
      .order("score", { ascending: false });

    if (error) {
      console.error("Error fetching club players for ranking:", error);
      return [];
    }

    // Transform the data to match the ranking UI format
    const players = data?.map((rawPlayer: any, index: number) => {
      // Handle profile image URL
      let profileImageUrl = rawPlayer.profile_image_url;
      
      if (profileImageUrl && !profileImageUrl.startsWith('http')) {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(profileImageUrl);
        profileImageUrl = publicUrl;
      } else if (!profileImageUrl) {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl('avatars/foto predeterminada.jpg');
        profileImageUrl = publicUrl;
      }

      return {
        id: rawPlayer.id,
        firstName: rawPlayer.first_name,
        lastName: rawPlayer.last_name,
        score: rawPlayer.score || 0,
        category: rawPlayer.category_name || "Sin categoría",
        preferredHand: rawPlayer.preferred_hand,
        preferredSide: rawPlayer.preferred_side,
        racket: rawPlayer.racket,
        gender: rawPlayer.gender || "MALE",
        profileImage: profileImageUrl,
        createdAt: rawPlayer.created_at,
        position: (index + 1),
        club_name: (rawPlayer.clubes as any)?.name || "Sin club",
        // Add some demo data for better UI
        trend: Math.floor(Math.random() * 5) - 2, // Random trend between -2 and 2
        winRate: Math.floor(Math.random() * 30) + 70, // Win rate between 70% and 100%
        matchesPlayed: Math.floor(Math.random() * 50) + 10, // Matches between 10 and 60
      };
    }) || [];

    return players;
  }

  // =================== CLUB FUNCTIONS ===================
  
  /**
   * Get all clubs with their services
   */
  export async function getClubesWithServices() {
    const supabase = await createClient();
    
    try {
      // First get all active clubs
      const { data: clubs, error: clubsError } = await supabase
        .from("clubes")
        .select("id, name, address, formatted_address, google_place_id, latitude, longitude, maps_url, instagram, courts, opens_at, closes_at, cover_image_url, gallery_images")
        .eq("is_active", true)
        .order("name");

      if (clubsError) {
        console.error("Error fetching clubs:", clubsError);
        return [];
      }

      if (!clubs || clubs.length === 0) {
        return [];
      }

      // Get services for each club
      const clubsWithServices = await Promise.all(
        clubs.map(async (club: any) => {
          try {
            const { data: services, error: servicesError } = await supabase
              .from("services_clubes")
              .select(`
                services (
                  id,
                  name
                )
              `)
              .eq("club_id", club.id);

            if (servicesError) {
              console.error(`Error fetching services for club ${club.id}:`, servicesError);
            }

            // Get average rating and review count
            const { data: reviews, error: reviewsError } = await supabase
              .from("reviews")
              .select("score")
              .eq("club_id", club.id);

            if (reviewsError) {
              console.error(`Error fetching reviews for club ${club.id}:`, reviewsError);
            }

            const reviewCount = reviews?.length || 0;
            const averageRating = reviewCount > 0 && reviews
              ? reviews.reduce((sum: number, review: any) => sum + (review.score || 0), 0) / reviewCount 
              : 0;

            // Return plain object with only serializable data
            return {
              id: club.id,
              name: club.name || null,
              address: club.address || null,
              formattedAddress: club.formatted_address || null,
              googlePlaceId: club.google_place_id || null,
              latitude: club.latitude || null,
              longitude: club.longitude || null,
              mapsUrl: club.maps_url || null,
              instagram: club.instagram || null,
              courts: club.courts || 0,
              opens_at: club.opens_at || null,
              closes_at: club.closes_at || null,
              services: services?.map((s: any) => s.services).filter(Boolean) || [],
              rating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
              reviewCount: reviewCount,
              coverImage: club.cover_image_url || null,
              galleryImages: Array.isArray(club.gallery_images) ? club.gallery_images : []
            };
          } catch (error) {
            console.error(`Error processing club ${club.id}:`, error);
            // Return a safe fallback object
            return {
              id: club.id,
              name: club.name || null,
              address: club.address || null,
              formattedAddress: club.formatted_address || null,
              googlePlaceId: club.google_place_id || null,
              latitude: club.latitude || null,
              longitude: club.longitude || null,
              mapsUrl: club.maps_url || null,
              instagram: club.instagram || null,
              courts: club.courts || 0,
              opens_at: club.opens_at || null,
              closes_at: club.closes_at || null,
              services: [],
              rating: 0,
              reviewCount: 0,
              coverImage: club.cover_image_url || null,
              galleryImages: []
            };
          }
        })
      );

      return clubsWithServices;
    } catch (error) {
      console.error("Error in getClubesWithServices:", error);
      return [];
    }
  }

  /**
   * Get detailed information for a single club
   */
  export async function getClubDetails(clubId: string) {
    const supabase = await createClient();
    
    // Get club basic info including images and contact info (only if active)
    const { data: club, error: clubError } = await supabase
      .from("clubes")
      .select("*, cover_image_url, gallery_images, phone, email, website, description")
      .eq("id", clubId)
      .eq("is_active", true)
      .single();

    if (clubError) {
      if (clubError.code === 'PGRST116') {
        return null;
      }
      console.error("Error fetching club details:", clubError);
      return null;
    }

    if (!club) return null;

    // Get club services
    const { data: services, error: servicesError } = await supabase
      .from("services_clubes")
      .select(`
        services (
          id,
          name
        )
      `)
      .eq("club_id", clubId);

    if (servicesError) {
      console.error(`Error fetching services for club ${clubId}:`, servicesError);
    }

    // Get club reviews with player info
    const { data: reviews, error: reviewsError } = await supabase
      .from("reviews")
      .select(`
        score,
        review_description,
        players (
          first_name,
          last_name
        )
      `)
      .eq("club_id", clubId);

    if (reviewsError) {
      console.error(`Error fetching reviews for club ${clubId}:`, reviewsError);
    }

    // Calculate ratings
    const reviewCount = reviews?.length || 0;
    const averageRating = reviewCount > 0 && reviews
      ? reviews.reduce((sum: number, review: any) => sum + (review.score || 0), 0) / reviewCount 
      : 0;

    // Get upcoming tournaments for this club
    const { data: tournaments, error: tournamentsError } = await supabase
      .from("tournaments")
      .select(`
        id,
        seo_slug,
        name,
        start_date,
        end_date,
        category_name,
        pre_tournament_image_url,
        max_participants,
        description,
        price,
        status,
        enable_public_inscriptions,
        show_few_slots_alert
      `)
      .eq("club_id", clubId)
      .gte("start_date", new Date().toISOString())
      .order("start_date", { ascending: true })
      .limit(3);

    if (tournamentsError) {
      console.error(`Error fetching tournaments for club ${clubId}:`, tournamentsError);
    }

    return {
      ...club,
      services: services?.map((s: any) => s.services).filter(Boolean) || [],
      rating: Number(averageRating.toFixed(1)),
      reviewCount,
      reviews: reviews?.map((review: any) => ({
        score: review.score,
        description: review.review_description,
        playerName: (review).players 
          ? `${(review).players.first_name} ${(review).players.last_name}`
          : "Usuario anónimo",
        date: new Date().toISOString() // Placeholder since no date in reviews table
      })) || [],
      upcomingTournaments: (tournaments || []).map(tournament => {
        const hasStartDate = Boolean(tournament.start_date);
        const hasEndDate = Boolean(tournament.end_date);

        return {
          id: tournament.id,
          seoSlug: tournament.seo_slug || null,
          name: tournament.name || `Torneo ${tournament.category_name}`,
          date: hasStartDate
            ? hasEndDate
              ? `${new Date(tournament.start_date).toLocaleDateString()} - ${new Date(tournament.end_date).toLocaleDateString()}`
              : new Date(tournament.start_date).toLocaleDateString()
            : "Fecha por confirmar",
          category: tournament.category_name || "Sin categoría",
          categoryName: tournament.category_name || "Sin categoría",
          image: tournament.pre_tournament_image_url,
          description: tournament.description,
          price: tournament.price,
          status: tournament.status,
          enablePublicInscriptions: Boolean(tournament.enable_public_inscriptions),
          showFewSlotsAlert: tournament.show_few_slots_alert !== false,
          startDate: tournament.start_date || null,
          endDate: tournament.end_date || null,
          club: {
            id: club.id,
            name: club.name || null,
            address: club.address || null,
            formattedAddress: club.formatted_address || null,
            googlePlaceId: club.google_place_id || null,
            latitude: club.latitude || null,
            longitude: club.longitude || null,
            mapsUrl: club.maps_url || null,
          },
        };
      }),
      // Image data
      coverImage: club.cover_image_url,
      galleryImages: (club.gallery_images as string[]) || [],
      // Contact information - use real data from DB
      phone: club.phone || null,
      email: club.email || null,
      website: club.website || null,
      description: club.description || "Descripción del club por completar",
    };
  }

  /**
   * Get all available services
   */
  export async function getServices() {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching services:", error);
      return [];
    }

    return data || [];
  }

  /**
   * Add a review for a club
   */
  export async function addClubReview(clubId: string, playerId: string, score: number, description: string) {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from("reviews")
      .insert({
        club_id: clubId,
        player_id: playerId, 
        score,
        review_description: description
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding club review:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  }

  /**
   * Get reviews for a specific club
   */
  export async function getClubReviews(clubId: string) {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from("reviews")
      .select(`
        score,
        review_description,
        players (
          first_name,
          last_name
        )
      `)
      .eq("club_id", clubId)
      .order("score", { ascending: false });

    if (error) {
      console.error("Error fetching club reviews:", error);
      return [];
    }

    return data?.map((review: any) => ({
      score: review.score,
      description: review.review_description,
        playerName: (review).players 
        ? `${(review).players.first_name} ${(review).players.last_name}`
        : "Usuario anónimo",
      date: new Date().toISOString() // Placeholder since no date in reviews table
    })) || [];
  }

  // =================== CLUB IMAGES FUNCTIONS ===================

  /**
   * Upload cover image for a club
   */
  export async function uploadClubCoverImage(clubId: string, file: File) {
    const supabase = await createClient();

    try {
      console.log('[uploadClubCoverImage] Starting upload for club:', clubId);

      // Generate file path: clubes/{clubId}/cover.{extension}
      const fileExtension = file.name.split('.').pop();
      const fileName = `${clubId}/cover.${fileExtension}`;
      console.log('[uploadClubCoverImage] File name:', fileName);

      // Upload file to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('clubes')
        .upload(fileName, file, {
          upsert: true // Replace if exists
        });

      if (uploadError) {
        console.error('[uploadClubCoverImage] Upload error:', uploadError);
        return { success: false, error: uploadError.message };
      }
      console.log('[uploadClubCoverImage] File uploaded successfully');

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('clubes')
        .getPublicUrl(fileName);
      console.log('[uploadClubCoverImage] Public URL generated:', publicUrl);

      // Update club record with cover image URL
      console.log('[uploadClubCoverImage] Attempting to update clubes table...');
      const { data: updateData, error: updateError } = await supabase
        .from('clubes')
        .update({ cover_image_url: publicUrl })
        .eq('id', clubId)
        .select();

      if (updateError) {
        console.error('[uploadClubCoverImage] Database update error:', updateError);
        console.error('[uploadClubCoverImage] Update error details:', JSON.stringify(updateError, null, 2));
        return { success: false, error: updateError.message };
      }

      console.log('[uploadClubCoverImage] Database update result:', updateData);

      if (!updateData || updateData.length === 0) {
        console.error('[uploadClubCoverImage] WARNING: Update returned no rows. Possible RLS issue.');
        return { success: false, error: 'No se pudo actualizar el club. Posible problema de permisos (RLS).' };
      }

      console.log('[uploadClubCoverImage] Cover image updated successfully');
      return { success: true, url: publicUrl };
    } catch (error) {
      console.error('[uploadClubCoverImage] Unexpected error:', error);
      return { success: false, error: 'Error inesperado al subir la imagen' };
    }
  }

  /**
   * Upload gallery image for a club
   */
  export async function uploadClubGalleryImage(clubId: string, file: File) {
    const supabase = await createClient();
    
    try {
      // Get current gallery images
      const { data: club, error: fetchError } = await supabase
        .from('clubes')
        .select('gallery_images')
        .eq('id', clubId)
        .single();

      if (fetchError) {
        console.error('Error fetching club gallery:', fetchError);
        return { success: false, error: fetchError.message };
      }

      const currentGallery = club.gallery_images as string[] || [];
      const imageNumber = currentGallery.length + 1;
      
      // Generate file path: clubes/{clubId}/gallery/{number}.{extension}
      const fileExtension = file.name.split('.').pop();
      const fileName = `${clubId}/gallery/${imageNumber}.${fileExtension}`;
      
      // Upload file to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('clubes')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Error uploading gallery image:', uploadError);
        return { success: false, error: uploadError.message };
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('clubes')
        .getPublicUrl(fileName);

      // Update club record with new gallery image
      const updatedGallery = [...currentGallery, publicUrl];
      const { error: updateError } = await supabase
        .from('clubes')
        .update({ gallery_images: updatedGallery })
        .eq('id', clubId);

      if (updateError) {
        console.error('Error updating club gallery:', updateError);
        return { success: false, error: updateError.message };
      }

      return { success: true, url: publicUrl, galleryImages: updatedGallery };
    } catch (error) {
      console.error('Unexpected error uploading gallery image:', error);
      return { success: false, error: 'Error inesperado al subir la imagen' };
    }
  }

  /**
   * Remove gallery image from a club
   */
  export async function removeClubGalleryImage(clubId: string, imageUrl: string) {
    const supabase = await createClient();
    
    try {
      // Get current gallery images
      const { data: club, error: fetchError } = await supabase
        .from('clubes')
        .select('gallery_images')
        .eq('id', clubId)
        .single();

      if (fetchError) {
        console.error('Error fetching club gallery:', fetchError);
        return { success: false, error: fetchError.message };
      }

      const currentGallery = club.gallery_images as string[] || [];
      const updatedGallery = currentGallery.filter(url => url !== imageUrl);

      // Update club record
      const { error: updateError } = await supabase
        .from('clubes')
        .update({ gallery_images: updatedGallery })
        .eq('id', clubId);

      if (updateError) {
        console.error('Error updating club gallery:', updateError);
        return { success: false, error: updateError.message };
      }

      // Extract file path from URL and delete from storage
      const urlParts = imageUrl.split('/');
      const fileName = urlParts.slice(-3).join('/'); // clubId/gallery/filename
      
      const { error: deleteError } = await supabase.storage
        .from('clubes')
        .remove([fileName]);

      if (deleteError) {
        console.error('Error deleting image from storage:', deleteError);
        // Don't return error here as the DB update was successful
      }

      return { success: true, galleryImages: updatedGallery };
    } catch (error) {
      console.error('Unexpected error removing gallery image:', error);
      return { success: false, error: 'Error inesperado al eliminar la imagen' };
    }
  }

  /**
   * Get all images for a club (cover + gallery)
   */
  export async function getClubImages(clubId: string) {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('clubes')
      .select('cover_image_url, gallery_images')
      .eq('id', clubId)
      .single();

    if (error) {
      console.error('Error fetching club images:', error);
      return { coverImage: null, galleryImages: [] };
    }

    return {
      coverImage: data.cover_image_url,
      galleryImages: (data.gallery_images as string[]) || []
    };
  }

  /**
   * Get detailed player profile information including stats
   */
  export async function getPlayerProfile(playerId: string) {
    try {
      
      // Get player basic info including club
      const { data: player, error: playerError } = await supabase
        .from("players")
        .select(`
          *,
          clubes (
            id,
            name,
            address
          )
        `)
        .eq("id", playerId)
        .single();

      if (playerError) {
        console.error("ÃƒÂ¢Ã‚ÂÃ…â€™ Error fetching player profile:", playerError);
        return null;
      }

      if (!player) {
        return null;
      }

      // Calculate age from date_of_birth
      const age = player.date_of_birth 
        ? (() => {
            const today = new Date();
            const birthDate = new Date(player.date_of_birth);
            let calculatedAge = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            
            // If the birthday hasn't occurred this year yet, subtract 1 from age
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              calculatedAge--;
            }
            
            return calculatedAge;
          })()
        : null;

      // Get profile image - use profile_image_url first, then default
      let profileImageUrl = player.profile_image_url;
      
      // If we have a profile image, make sure it's a full URL
      if (profileImageUrl) {
        // If it's not a full URL (doesn't start with http), get the public URL from Supabase
        if (!profileImageUrl.startsWith('http')) {
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(profileImageUrl);
          profileImageUrl = publicUrl;
        }
      } else {
        // If no profile image, use default image from avatars bucket
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl('avatars/foto predeterminada.jpg');
        profileImageUrl = publicUrl;
      }

      // Get player statistics
      const [tournamentsStats, matchesStats, lastTournament, ranking] = await Promise.all([
        getPlayerTournamentStats(playerId),
        getPlayerMatchStats(playerId),
        getPlayerLastTournament(playerId),
        getPlayerRanking(playerId)
      ]);

      const result = {
        id: player.id,
        name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
        profileImage: profileImageUrl, // ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Important: using 'profileImage' to match frontend
        ranking: ranking || {
          current: 0,
          variation: 0,
          isPositive: true,
        },
        status: player.status || 'active',
        dominantHand: player.preferred_hand || 'N/A',
        preferredSide: player.preferred_side,
        circuitJoinDate: player.created_at,
        lastTournament,
        age,
        stats: {
          tournamentsPlayed: tournamentsStats.tournamentsPlayed,
          upcomingTournaments: tournamentsStats.upcomingTournaments,
          winRate: matchesStats.winRate,
          finals: { 
            played: tournamentsStats.finalsPlayed, 
            won: tournamentsStats.finalsWon 
          },
          matchesPlayed: matchesStats.totalMatches,
        },
        contact: {
          instagram: player.instagram_handle ? `@${player.instagram_handle}` : null,
          phone: player.phone || null,
          address: player.address || (player.clubes as any)?.address || null,
        },
        gallery: Array.isArray(player.gallery_images) ? player.gallery_images : [],
        club: player.clubes ? {
          id: (player.clubes as any).id,
          name: (player.clubes as any).name,
        } : null,
        // Additional fields
        category: player.category_name,
        racket: player.racket,
        score: player.score,
        description: player.description,
      };

      return result;

    } catch (error) {
      console.error("ÃƒÂ°Ã…Â¸Ã¢â‚¬â„¢Ã‚Â¥ Error in getPlayerProfile:", error);
      return null;
    }
  }

  /**
   * Get player tournament statistics
   */
  export async function getPlayerTournamentStats(playerId: string) {
    const supabase = await createClient();
    try {
      // Get individual inscriptions where the player participated
      const { data: individualInscriptions, error: individualError } = await supabase
        .from('inscriptions')
        .select(`
          tournament_id,
          tournaments!inner(
            id,
            name,
            status,
            start_date,
            end_date
          )
        `)
        .eq('player_id', playerId)
        .eq('is_pending', false);

      if (individualError) {
        console.error("Error fetching individual inscriptions:", individualError);
      }

      // Get couple inscriptions where the player participated
      const { data: coupleInscriptions, error: coupleError } = await supabase
        .from('inscriptions')
        .select(`
          tournament_id,
          couple_id,
          tournaments!inner(
            id,
            name,
            status,
            start_date,
            end_date
          ),
          couples!inner(
            id,
            player1_id,
            player2_id
          )
        `)
        .not('couple_id', 'is', null)
        .eq('is_pending', false);

      if (coupleError) {
        console.error("Error fetching couple inscriptions:", coupleError);
      }

      // Filter couple inscriptions to only include those where the player is part of the couple
      const playerCoupleInscriptions = (coupleInscriptions || []).filter(
        (inscription: any) => {
          const couple = inscription.couples;
          return couple && (couple.player1_id === playerId || couple.player2_id === playerId);
        }
      );

      // Combine all inscriptions
      const allInscriptions = [
        ...(individualInscriptions || []),
        ...playerCoupleInscriptions
      ];

      console.log(`[getPlayerTournamentStats] Player ${playerId} - Individual: ${individualInscriptions?.length || 0}, Couple: ${playerCoupleInscriptions.length}, Total: ${allInscriptions.length}`);

      if (allInscriptions.length === 0) {
        return { 
          tournamentsPlayed: 0, 
          upcomingTournaments: 0, 
          finalsPlayed: 0, 
          finalsWon: 0 
        };
      }

      // Remove duplicates (in case a player is inscribed both individually and in couple to same tournament)
      const uniqueInscriptions = allInscriptions.filter((inscription, index, self) =>
        index === self.findIndex(i => i.tournament_id === inscription.tournament_id)
      );

      console.log(`[getPlayerTournamentStats] Player ${playerId} - Unique tournaments: ${uniqueInscriptions.length}`);
      
      // Debug: Log tournament details
      uniqueInscriptions.forEach((inscription: any, index: number) => {
        const tournament = inscription.tournaments;
        console.log(`[getPlayerTournamentStats] Tournament ${index + 1}: ${tournament.name}, Status: ${tournament.status}, Start Date: ${tournament.start_date}`);
      });

      // Separate tournaments by status
      const playedTournaments = uniqueInscriptions.filter(
        (inscription: any) => {
          const tournament = inscription.tournaments;
          // Consider a tournament "played" if it's FINISHED, IN_PROGRESS, PAIRING, or has already started
          return tournament.status === 'FINISHED' || 
                 tournament.status === 'IN_PROGRESS' || 
                 tournament.status === 'PAIRING' ||
                 (tournament.start_date && new Date(tournament.start_date) <= new Date());
        }
      );

      const upcomingTournaments = uniqueInscriptions.filter(
        (inscription: any) => {
          const tournament = inscription.tournaments;
          // Consider a tournament "upcoming" if it's NOT_STARTED and hasn't started yet
          return tournament.status === 'NOT_STARTED' && 
                 tournament.start_date && 
                 new Date(tournament.start_date) > new Date();
        }
      );

      // Get real finals statistics from match data instead of estimating
      const matchesStats = await getPlayerMatchStats(playerId);

      console.log(`[getPlayerTournamentStats] Player ${playerId} - Played: ${playedTournaments.length}, Upcoming: ${upcomingTournaments.length}, Finals Played: ${matchesStats.finalsPlayed}, Finals Won: ${matchesStats.finalsWon}`);

      return {
        tournamentsPlayed: playedTournaments.length,
        upcomingTournaments: upcomingTournaments.length,
        finalsPlayed: matchesStats.finalsPlayed,
        finalsWon: matchesStats.finalsWon
      };
    } catch (error) {
      console.error("Error in getPlayerTournamentStats:", error);
      return { 
        tournamentsPlayed: 0, 
        upcomingTournaments: 0, 
        finalsPlayed: 0, 
        finalsWon: 0 
      };
    }
  }

  /**
   * Get player match statistics
   */
  export async function getPlayerMatchStats(playerId: string) {
    const supabase = await createClient();
    try {
      // Get all couples where the player participates
      const { data: couples, error: couplesError } = await supabase
        .from('couples')
        .select('id')
        .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`);

      if (couplesError || !couples) {
        console.error("Error fetching player couples:", couplesError);
        return { totalMatches: 0, wins: 0, winRate: 0, finalsPlayed: 0, finalsWon: 0 };
      }

      const coupleIds = couples.map((couple: any) => couple.id);

      if (coupleIds.length === 0) {
        return { totalMatches: 0, wins: 0, winRate: 0, finalsPlayed: 0, finalsWon: 0 };
      }

      // Get all matches where any of the player's couples participated
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select(`
          id,
          couple1_id,
          couple2_id,
          winner_id,
          status,
          round
        `)
        .or(`couple1_id.in.(${coupleIds.join(',')}),couple2_id.in.(${coupleIds.join(',')})`)
        .eq('status', 'FINISHED');

      if (matchesError) {
        console.error("Error fetching player matches:", matchesError);
        return { totalMatches: 0, wins: 0, winRate: 0, finalsPlayed: 0, finalsWon: 0 };
      }

      const totalMatches = matches?.length || 0;
      const wins = matches?.filter((match: any) => 
        coupleIds.includes(match.winner_id)
      ).length || 0;

      const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

      // Calculate finals statistics based on real match data
      const finalMatches = matches?.filter((match: any) => match.round === 'FINAL') || [];
      const finalsPlayed = finalMatches.length;
      const finalsWon = finalMatches.filter((match: any) => 
        coupleIds.includes(match.winner_id)
      ).length;

      console.log(`[getPlayerMatchStats] Player ${playerId} - Total matches: ${totalMatches}, Wins: ${wins}, Finals played: ${finalsPlayed}, Finals won: ${finalsWon}`);

      return {
        totalMatches,
        wins,
        winRate,
        finalsPlayed,
        finalsWon
      };
    } catch (error) {
      console.error("Error in getPlayerMatchStats:", error);
      return { totalMatches: 0, wins: 0, winRate: 0, finalsPlayed: 0, finalsWon: 0 };
    }
  }

  /**
   * Get player's last tournament
   */
  export async function getPlayerLastTournament(playerId: string) {
    const supabase = await createClient();
    try {
      const { data: lastInscription, error } = await supabase
        .from('inscriptions')
        .select(`
          tournament_id,
          created_at,
          tournaments!inner(
            id,
            name,
            status,
            start_date,
            end_date
          )
        `)
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !lastInscription) {
        return null;
      }

      return {
        name: (lastInscription.tournaments as any).name,
        date: (lastInscription.tournaments as any).start_date || (lastInscription.tournaments as any).end_date
      };
    } catch (error) {
      console.error("Error in getPlayerLastTournament:", error);
      return null;
    }
  }

  /**
   * Get player ranking information
   */
  export async function getPlayerRanking(playerId: string) {
    const supabase = await createClient();
    try {
      // Get the player's current score
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('score, category_name')
        .eq('id', playerId)
        .single();

      if (playerError || !player) {
        return { current: 0, variation: 0, isPositive: true };
      }

      // Get all players in the same category to calculate ranking
      const { data: categoryPlayers, error: categoryError } = await supabase
        .from('players')
        .select('id, score')
        .eq('category_name', player.category_name)
        .order('score', { ascending: false });

      if (categoryError || !categoryPlayers) {
        return { current: 0, variation: 0, isPositive: true };
      }

      // Find player's ranking position
      const playerIndex = categoryPlayers.findIndex((p: any) => p.id === playerId);
      const ranking = playerIndex + 1; // Convert to 1-based ranking

      // For variation, we'd need to track historical rankings
      // For now, we'll return a placeholder
      return {
        current: ranking,
        variation: 0, // Would need historical data to calculate
        isPositive: true
      };
    } catch (error) {
      console.error("Error in getPlayerRanking:", error);
      return { current: 0, variation: 0, isPositive: true };
    }
  }

  /**
   * Get the current user's club ID
   */
  export async function getCurrentUserClubId() {
    try {
      const user = await getUser()
      const role = await getUserRole()
      
      if (!user || role !== 'CLUB') {
        return null
      }

      const supabase = await createClient()
      
      const { data: club, error } = await supabase
        .from('clubes')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (error || !club) {
        return null
      }

      return club.id
    } catch (error) {
      console.error('Error getting current user club ID:', error)
      return null
    }
  }

  /**
   * OPTIMIZED: Get top clubs for home page - only fetches the top 3 clubs
   * This reduces DB queries from ~20+ to just 3 queries total
   */
  export async function getTopClubsForHome(limit: number = 3) {
    const supabase = await createClient();
    
    try {
      // Single query to get active clubs with their average ratings, sorted by rating
      const { data: clubsWithRatings, error: clubsError } = await supabase
        .from("clubes")
        .select(`
          id,
          name,
          address,
          formatted_address,
          google_place_id,
          latitude,
          longitude,
          maps_url,
          courts,
          opens_at,
          closes_at,
          cover_image_url,
          gallery_images
        `)
        .eq("is_active", true)
        .order("name")
        .limit(limit * 3); // Get more clubs to calculate ratings properly

      if (clubsError) {
        console.error("Error fetching clubs for home:", clubsError);
        return [];
      }

      if (!clubsWithRatings || clubsWithRatings.length === 0) {
        return [];
      }

      // Get all reviews for these clubs in one query
      const clubIds = clubsWithRatings.map((club: any) => club.id);
      const { data: allReviews, error: reviewsError } = await supabase
        .from("reviews")
        .select("club_id, score")
        .in("club_id", clubIds);

      if (reviewsError) {
        console.error("Error fetching reviews for home clubs:", reviewsError);
      }

      // Calculate ratings and prepare final data
      const clubsWithCalculatedRatings = clubsWithRatings.map((club: any) => {
        const clubReviews = allReviews?.filter((review: any) => review.club_id === club.id) || [];
        const reviewCount = clubReviews.length;
        const averageRating = reviewCount > 0 
          ? clubReviews.reduce((sum: number, review: any) => sum + (review.score || 0), 0) / reviewCount 
          : 0;

        return {
          id: club.id,
          name: club.name || null,
          address: club.address || null,
          formattedAddress: club.formatted_address || null,
          googlePlaceId: club.google_place_id || null,
          latitude: club.latitude || null,
          longitude: club.longitude || null,
          mapsUrl: club.maps_url || null,
          courts: club.courts || 0,
          opens_at: club.opens_at || null,
          closes_at: club.closes_at || null,
          rating: Math.round(averageRating * 10) / 10,
          reviewCount: reviewCount,
          coverImage: club.cover_image_url || null,
          galleryImages: Array.isArray(club.gallery_images) ? club.gallery_images : []
        };
      });

          // Sort by rating descending and return top clubs
    return clubsWithCalculatedRatings
      .sort((a: any, b: any) => b.rating - a.rating)
      .slice(0, limit);

    } catch (error) {
      console.error("Error in getTopClubsForHome:", error);
      return [];
    }
  }

/**
 * OPTIMIZED: Get top organizations for home page
 * Fetches organizations with their club count and tournament count
 * @deprecated Use getOrganizationsForHome instead for new premium/non-premium layout
 */
export async function getTopOrganizersForHome(limit: number = 3) {
  const supabase = await createClient();

  try {
    // Get active organizations with featured club data
    const { data: organizations, error: orgsError } = await supabase
      .from("organizaciones")
      .select(`
        id,
        slug,
        name,
        description,
        phone,
        email,
        logo_url,
        cover_image_url,
        gallery_images,
        responsible_first_name,
        responsible_last_name,
        created_at,
        featured_club_id,
        featured_club:clubes!featured_club_id (
          id,
          name,
          address,
          courts,
          opens_at,
          closes_at
        )
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (orgsError) {
      console.error("Error fetching organizations for home:", orgsError);
      return [];
    }

    if (!organizations || organizations.length === 0) {
      return [];
    }

    // Get club counts and tournament counts for each organization
    const organizationsWithStats = await Promise.all(
      organizations.map(async (org: any) => {
        // Count associated clubs
        const { data: clubsData, error: clubsError } = await supabase
          .from("organization_clubs")
          .select("club_id")
          .eq("organizacion_id", org.id);

        if (clubsError) {
          console.error(`Error fetching clubs for organization ${org.id}:`, clubsError);
        }

        const clubCount = clubsData?.length || 0;

        // Count tournaments created by this organization
        const { data: tournamentsData, error: tournamentsError } = await supabase
          .from("tournaments")
          .select("id")
          .eq("organization_id", org.id);

        if (tournamentsError) {
          console.error(`Error fetching tournaments for organization ${org.id}:`, tournamentsError);
        }

        const tournamentCount = tournamentsData?.length || 0;

        return {
          id: org.id,
          slug: org.slug,
          name: org.name || null,
          description: org.description || null,
          phone: org.phone || null,
          email: org.email || null,
          logoUrl: org.logo_url || null,
          coverImage: org.cover_image_url || null,
          galleryImages: Array.isArray(org.gallery_images) ? org.gallery_images : [],
          responsibleName: org.responsible_first_name && org.responsible_last_name
            ? `${org.responsible_first_name} ${org.responsible_last_name}`
            : null,
          clubCount,
          tournamentCount,
          createdAt: org.created_at,
          featuredClub: org.featured_club ? {
            id: org.featured_club.id,
            name: org.featured_club.name,
            address: org.featured_club.address,
            courts: org.featured_club.courts,
            opensAt: org.featured_club.opens_at,
            closesAt: org.featured_club.closes_at
          } : null
        };
      })
    );

    // Return organizations (already sorted by created_at DESC)
    return organizationsWithStats;

  } catch (error) {
    console.error("Error in getTopOrganizersForHome:", error);
    return [];
  }
}

/**
 * NEW: Get organizations for home page with premium/non-premium separation
 * Returns object with separate arrays for premium and non-premium organizations
 */
export async function getOrganizationsForHome() {
  const supabase = await createClient();

  try {
    // Get premium organizations (top 3 by creation date)
    const { data: premiumOrgs, error: premiumError } = await supabase
      .from("organizaciones")
      .select(`
        id,
        slug,
        name,
        logo_url,
        cover_image_url,
        created_at,
        featured_club_id,
        featured_club:clubes!featured_club_id (
          id,
          name,
          address,
          courts,
          opens_at,
          closes_at
        )
      `)
      .eq("is_active", true)
      .eq("is_premium", true)
      .order("created_at", { ascending: false })
      .limit(3);

    if (premiumError) {
      console.error("Error fetching premium organizations:", premiumError);
    }

    // Get non-premium organizations (top 6 alphabetically)
    const { data: nonPremiumOrgs, error: nonPremiumError } = await supabase
      .from("organizaciones")
      .select("id, slug, name, logo_url")
      .eq("is_active", true)
      .eq("is_premium", false)
      .order("name", { ascending: true })
      .limit(6);

    if (nonPremiumError) {
      console.error("Error fetching non-premium organizations:", nonPremiumError);
    }

    // Get stats for premium organizations only (optimization)
    const premiumWithStats = await Promise.all(
      (premiumOrgs || []).map(async (org: any) => {
        // Count associated clubs
        const { data: clubsData, error: clubsError } = await supabase
          .from("organization_clubs")
          .select("club_id")
          .eq("organizacion_id", org.id);

        if (clubsError) {
          console.error(`Error fetching clubs for premium org ${org.id}:`, clubsError);
        }

        const clubCount = clubsData?.length || 0;

        // Count tournaments created by this organization
        const { data: tournamentsData, error: tournamentsError } = await supabase
          .from("tournaments")
          .select("id")
          .eq("organization_id", org.id);

        if (tournamentsError) {
          console.error(`Error fetching tournaments for premium org ${org.id}:`, tournamentsError);
        }

        const tournamentCount = tournamentsData?.length || 0;

        return {
          id: org.id,
          slug: org.slug,
          name: org.name || null,
          logoUrl: org.logo_url || null,
          coverImage: org.cover_image_url || null,
          clubCount,
          tournamentCount,
          createdAt: org.created_at,
          featuredClub: org.featured_club ? {
            id: org.featured_club.id,
            name: org.featured_club.name,
            address: org.featured_club.address,
            courts: org.featured_club.courts,
            opensAt: org.featured_club.opens_at,
            closesAt: org.featured_club.closes_at
          } : null
        };
      })
    );

    // Format non-premium organizations (no stats needed)
    const nonPremiumFormatted = (nonPremiumOrgs || []).map((org: any) => ({
      id: org.id,
      slug: org.slug,
      name: org.name || null,
      logoUrl: org.logo_url || null,
    }));

    return {
      premium: premiumWithStats,
      nonPremium: nonPremiumFormatted,
    };

  } catch (error) {
    console.error("Error in getOrganizationsForHome:", error);
    return {
      premium: [],
      nonPremium: [],
    };
  }
}

/**
 * Get organization by slug for public profile page
 */
export async function getOrganizationBySlug(slug: string) {
  const supabase = await createClient();

  try {
    console.log("[getOrganizationBySlug] Searching for slug:", slug);

    // Get organization with featured club data
    const { data: organization, error: orgError } = await supabase
      .from("organizaciones")
      .select(`
        id,
        slug,
        name,
        description,
        phone,
        email,
        logo_url,
        cover_image_url,
        gallery_images,
        responsible_first_name,
        responsible_last_name,
        responsible_position,
        created_at,
        featured_club_id,
        featured_club:clubes!featured_club_id (
          id,
          name,
          address,
          courts,
          opens_at,
          closes_at,
          logo_url,
          cover_image_url
        )
      `)
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    console.log("[getOrganizationBySlug] Organization result:", { organization, orgError });

    if (orgError || !organization) {
      console.error("Error fetching organization by slug:", orgError);
      return null;
    }

    // Get all clubs for this organization
    const { data: clubsData, error: clubsError } = await supabase
      .from("organization_clubs")
      .select(`
        club_id,
        clubes (
          id,
          name,
          address,
          courts,
          opens_at,
          closes_at,
          logo_url,
          cover_image_url
        )
      `)
      .eq("organizacion_id", organization.id);

    const clubs = clubsData?.map((item: any) => item.clubes).filter(Boolean) || [];
    const clubCount = clubs.length;

    // Get all tournaments for this organization with additional fields (excluding CANCELED)
    const { data: tournamentsData, error: tournamentsError } = await supabase
      .from("tournaments")
      .select(`
        id,
        name,
        start_date,
        end_date,
        status,
        type,
        price,
        award,
        pre_tournament_image_url,
        category_name,
        gender,
        max_participants,
        club_id,
        clubes (
          id,
          name,
          address
        )
      `)
      .eq("organization_id", organization.id)
      .neq("status", "CANCELED")
      .order("start_date", { ascending: false });

    if (tournamentsError) {
      console.error("Error fetching organization tournaments:", tournamentsError);
    }

    // Add metrics to tournaments (inscriptions count, matches finished)
    const tournamentsWithMetrics = await Promise.all(
      (tournamentsData || []).map(async (tournament) => {
        const [inscriptionsResult, matchesResult] = await Promise.all([
          supabase
            .from('inscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('tournament_id', tournament.id)
            .eq('is_pending', false),
          supabase
            .from('matches')
            .select('*', { count: 'exact', head: true })
            .eq('tournament_id', tournament.id)
            .eq('status', 'FINISHED')
        ])

        // Transform to TournamentCard format
        return {
          id: tournament.id,
          name: tournament.name,
          startDate: tournament.start_date,
          endDate: tournament.end_date,
          status: tournament.status,
          type: tournament.type,
          category: tournament.category_name,
          price: tournament.price,
          award: tournament.award,
          maxParticipants: tournament.max_participants,
          currentParticipants: inscriptionsResult.count || 0,
          pre_tournament_image_url: tournament.pre_tournament_image_url,
          club: tournament.clubes ? {
            id: (tournament.clubes as any).id,
            name: (tournament.clubes as any).name,
            address: (tournament.clubes as any).address
          } : null,
          // Keep metrics for organization page specific use
          inscriptionsCount: inscriptionsResult.count || 0,
          matchesFinished: matchesResult.count || 0,
          gender: tournament.gender,
          category_name: tournament.category_name
        }
      })
    )

    const tournaments = tournamentsWithMetrics || [];
    const tournamentCount = tournaments.length;

    return {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      description: organization.description,
      phone: organization.phone,
      email: organization.email,
      logoUrl: organization.logo_url,
      coverImage: organization.cover_image_url,
      galleryImages: Array.isArray(organization.gallery_images) ? organization.gallery_images : [],
      responsibleName: organization.responsible_first_name && organization.responsible_last_name
        ? `${organization.responsible_first_name} ${organization.responsible_last_name}`
        : null,
      responsiblePosition: organization.responsible_position,
      clubCount,
      tournamentCount,
      playersCount: clubCount * 20, // Estimate
      featuredClub: organization.featured_club ? {
        id: organization.featured_club.id,
        name: organization.featured_club.name,
        address: organization.featured_club.address,
        courts: organization.featured_club.courts,
        opensAt: organization.featured_club.opens_at,
        closesAt: organization.featured_club.closes_at,
        logoUrl: organization.featured_club.logo_url,
        coverImage: organization.featured_club.cover_image_url,
      } : null,
      clubs,
      tournaments,
      createdAt: organization.created_at,
    };

  } catch (error) {
    console.error("Error in getOrganizationBySlug:", error);
    return null;
  }
}

