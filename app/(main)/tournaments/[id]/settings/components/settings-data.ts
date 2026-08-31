import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'
import { getTournamentCategoryDisplay } from '@/lib/services/tournament-category-config'
import { shouldUseLegacyQualifying } from '@/lib/services/tournament-format-policy'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'

export const getTournamentSettingsData = cache(async (tournamentId: string) => {
  const supabase = await createClient()

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select(`
      id,
      name,
      description,
      max_participants,
      price,
      category_name,
      category_config,
      gender,
      type,
      format_type,
      format_config,
      status,
      registration_locked,
      bracket_status,
      show_public_inscriptions,
      validate_inscriptions,
      show_few_slots_alert,
      enable_payment_checkboxes,
      enable_transfer_proof,
      messages_enabled,
      transfer_alias,
      transfer_amount,
      pre_tournament_image_url,
      enable_draft_matches,
      is_draft,
      hide_venue,
      club_id,
      start_date,
      end_date,
      clubes (
        name,
        cover_image_url
      )
    `)
    .eq('id', tournamentId)
    .single()

  if (error || !tournament) {
    return null
  }

  const tournamentCategoryDisplay = getTournamentCategoryDisplay(tournament)

  const { count: inscriptionsCount } = await supabase
    .from('inscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('es_prueba', false)

  const { data: rankingConfig } = await supabase
    .from('tournament_ranking_config')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('is_active', true)
    .single()

  const { count: couplesCount } = await supabase
    .from('inscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('es_prueba', false)
    .eq('inscription_type', 'couple')

  const { count: playersCount } = await supabase
    .from('inscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('es_prueba', false)
    .eq('inscription_type', 'individual')

  const { data: currentClubs } = await supabase
    .from('clubes_tournament')
    .select(`
      club_id,
      clubes:club_id ( id, name )
    `)
    .eq('tournament_id', tournamentId)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('organizacion_id')
    .eq('user_id', user?.id)
    .eq('is_active', true)
    .maybeSingle()

  let manageableClubs: { id: string; name: string }[] = []
  if (orgMember?.organizacion_id) {
    const { data: orgClubs } = await supabase
      .from('organization_clubs')
      .select(`clubes:club_id ( id, name )`)
      .eq('organizacion_id', orgMember.organizacion_id)

    manageableClubs = (orgClubs || []).map((clubLink: any) => ({
      id: clubLink.clubes.id,
      name: clubLink.clubes.name,
    }))
  }

  const imageSectionTournament = {
    id: tournament.id as string,
    name: tournament.name as string,
    pre_tournament_image_url: (tournament as any).pre_tournament_image_url ?? null,
    clubes: (() => {
      const clubes = (tournament as any).clubes
      if (!clubes) return null
      const club = Array.isArray(clubes) ? clubes[0] : clubes
      return club ? { cover_image_url: club.cover_image_url ?? null } : null
    })(),
  }

  const cancelTournamentData = {
    id: tournament.id as string,
    name: tournament.name as string,
    description: tournament.description ?? undefined,
    start_date: (tournament as any).start_date ?? undefined,
    end_date: (tournament as any).end_date ?? undefined,
    status: tournament.status ?? 'NOT_STARTED',
    type: tournament.type ?? 'AMERICANO',
    gender: (tournament as any).gender ?? 'MIXTO',
    max_participants: tournament.max_participants ?? undefined,
    clubes: (() => {
      const clubes = (tournament as any).clubes
      if (!clubes) return undefined
      const club = Array.isArray(clubes) ? clubes[0] : clubes
      return club ? { name: club.name ?? undefined } : undefined
    })(),
  }

  const isAmericanTournament = tournament.type === 'AMERICANO' || tournament.type === 'AMERICAN'
  const showLegacyQualifying = !isAmericanTournament && shouldUseLegacyQualifying(tournament as any)
  const tournamentTypeLabel = isAmericanTournament ? 'Americano' : 'Largo'
  const publicInscriptionsLabel = tournament.show_public_inscriptions ? 'Publicas' : 'Privadas'
  const publicationLabel = tournament.is_draft ? 'Borrador' : 'Publicado'
  const resolvedFormat = TournamentFormatResolver.getResolvedFormat({
    type: tournament.type,
    format_type: tournament.format_type,
    format_config: tournament.format_config,
  })

  return {
    tournament,
    tournamentCategoryDisplay,
    inscriptionsCount: inscriptionsCount || 0,
    rankingConfig,
    couplesCount: couplesCount || 0,
    playersCount: playersCount || 0,
    currentClubs: currentClubs || [],
    manageableClubs,
    imageSectionTournament,
    cancelTournamentData,
    isAmericanTournament,
    showLegacyQualifying,
    tournamentTypeLabel,
    publicInscriptionsLabel,
    publicationLabel,
    resolvedFormat,
  }
})
