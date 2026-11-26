import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { buildPlayerSearchQuery } from '../_shared/search-utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SearchRequest {
  searchTerm?: string
  page?: number
  pageSize?: number
  category?: string | null
  clubId?: string | null
  gender?: 'MALE' | 'FEMALE'
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[search-ranking-players] Request received')

    // Crear cliente de Supabase (público, sin autenticación)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Parse request body
    const body: SearchRequest = await req.json()
    const {
      searchTerm = '',
      page = 1,
      pageSize = 50,
      category = null,
      clubId = null,
      gender = 'MALE'
    } = body

    console.log('[search-ranking-players] Params:', { searchTerm, page, pageSize, category, clubId, gender })

    // Validar parámetros
    const validatedPage = Math.max(1, page)
    const validatedPageSize = Math.min(100, Math.max(1, pageSize))
    const offset = (validatedPage - 1) * validatedPageSize

    // Construir query base
    let query = supabaseClient
      .from('players')
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
      `, { count: 'exact' })
      .eq('gender', gender)
      .eq('es_prueba', false)
      .not('score', 'is', null)

    // Búsqueda por nombre (sin DNI para ranking público)
    if (searchTerm && searchTerm.length > 0) {
      console.log('[search-ranking-players] 🔍 Searching with term:', searchTerm)

      // ✅ Usar utility compartida con búsqueda por DNI DESACTIVADA
      const { players: searchResults, total: totalCount } = await buildPlayerSearchQuery(
        supabaseClient,
        {
          searchTerm: searchTerm.trim(),
          gender,
          category,
          clubId,
          includeTest: false,    // Ranking NO incluye jugadores de prueba
          requireScore: true,    // Ranking SOLO jugadores con score
          searchDni: false       // ❌ Ranking NO busca por DNI (privacidad)
        },
        validatedPageSize,
        offset
      )

      console.log('[search-ranking-players] ✅ Found:', searchResults.length, 'players (total:', totalCount, ')')

      const players = searchResults?.map((rawPlayer: any) => ({
        id: rawPlayer.id,
        firstName: rawPlayer.first_name,
        lastName: rawPlayer.last_name,
        score: rawPlayer.score,
        category: rawPlayer.category_name || 'Sin categoría',
        club_name: rawPlayer.clubes?.name || rawPlayer.club_name,
        organizador_name: rawPlayer.organizador_name,
        profileImage: rawPlayer.profile_image_url,
        weeklyPoints: 0
      })) || []

      const totalPages = Math.ceil(totalCount / validatedPageSize)

      return new Response(
        JSON.stringify({
          success: true,
          players,
          total: totalCount,
          totalPages,
          currentPage: validatedPage,
          pageSize: validatedPageSize
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Filtro por categoría
    if (category) {
      query = query.eq('category_name', category)
    }

    // Filtro por club
    if (clubId) {
      query = query.eq('club_id', clubId)
    }

    // Ordenar y paginar
    const { data, error, count } = await query
      .order('score', { ascending: false })
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + validatedPageSize - 1)

    if (error) {
      console.error('[search-ranking-players] Query error:', error)
      throw error
    }

    console.log('[search-ranking-players] Found:', count, 'players')

    // Transformar datos al formato esperado
    const players = data?.map((rawPlayer: any) => ({
      id: rawPlayer.id,
      firstName: rawPlayer.first_name,
      lastName: rawPlayer.last_name,
      score: rawPlayer.score,
      category: rawPlayer.category_name || 'Sin categoría',
      club_name: rawPlayer.clubes?.name,
      organizador_name: rawPlayer.organizador_name,
      profileImage: rawPlayer.profile_image_url,
      weeklyPoints: 0 // TODO: Implementar cálculo de puntos semanales si es necesario
    })) || []

    const totalPages = Math.ceil((count || 0) / validatedPageSize)

    return new Response(
      JSON.stringify({
        success: true,
        players,
        total: count || 0,
        totalPages,
        currentPage: validatedPage,
        pageSize: validatedPageSize
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('[search-ranking-players] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Error al buscar jugadores en el ranking'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
