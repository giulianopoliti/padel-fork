import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { checkUserTournamentInscription } from "@/utils/tournament-permissions"
import ScheduleContainer from "../components/ScheduleContainer"
import { TournamentFormatResolver } from "@/lib/services/tournament-format-resolver"
import { getMyLongFechaSubstitutions } from '@/lib/services/long-fecha-substitutions'

interface PlayerSchedulePageProps {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    fecha_id?: string
    couple_id?: string
  }>
}

export default async function PlayerSchedulePage({
  params,
  searchParams
}: PlayerSchedulePageProps) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams
  const supabase = await createClient()

  // Basic auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Check if user is inscribed
  const inscriptionResult = await checkUserTournamentInscription(user.id, resolvedParams.id)
  const isActiveStarter = inscriptionResult.isInscribed && !inscriptionResult.isPending && !inscriptionResult.isEliminated

  // Get tournament basic info
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select(`
      id,
      name,
      type,
      status,
      format_config,
      hide_venue,
      clubes:club_id (
        name
      )
    `)
    .eq('id', resolvedParams.id)
    .single()

  if (tournamentError || !tournament) {
    redirect('/tournaments')
  }
  const substitutes = tournament.type === 'LONG' ? await getMyLongFechaSubstitutions(supabase, resolvedParams.id) : []
  const substituteFechas = new Set(substitutes.filter(item => item.is_substitute && item.can_vote).map(item => item.fecha_id))
  if (!isActiveStarter && substituteFechas.size === 0) redirect(`/tournaments/${resolvedParams.id}`)

  const resolvedFormat = TournamentFormatResolver.getResolvedFormat(tournament as any)
  const isLongGoldSilver =
    tournament.type === 'LONG' && resolvedFormat.effectiveBracketMode === 'GOLD_SILVER'

  let assignedBracketKey: 'GOLD' | 'SILVER' | null = null
  if (isLongGoldSilver && inscriptionResult.coupleId) {
    const { data: assignmentRows } = await supabase
      .from('tournament_couple_seeds')
      .select('bracket_key')
      .eq('tournament_id', resolvedParams.id)
      .eq('couple_id', inscriptionResult.coupleId)
      .in('bracket_key', ['GOLD', 'SILVER'])
      .limit(1)

    const assignmentKey = assignmentRows?.[0]?.bracket_key
    if (assignmentKey === 'GOLD' || assignmentKey === 'SILVER') {
      assignedBracketKey = assignmentKey
    }
  }

  const clubName =
    tournament.hide_venue
      ? ''
      : (Array.isArray((tournament as any).clubes)
          ? (tournament as any).clubes[0]?.name
          : (tournament as any).clubes?.name) || 'Sin club'

  // Get tournament fechas
  const { data: rawFechas } = await supabase
    .from('tournament_fechas')
    .select('id, name, fecha_number, description, status, start_date, end_date, round_type, bracket_key, max_matches_per_couple, estimated_match_duration_minutes, tournament_id, created_at')
    .eq('tournament_id', resolvedParams.id)
    .order('fecha_number', { ascending: true })

  const fechas = (rawFechas || []).filter((fecha) => {
    if (substituteFechas.has(fecha.id)) return true
    if (!isActiveStarter) return false
    if (!isLongGoldSilver) return true
    if (fecha.round_type === 'ZONE') return true
    if (!assignedBracketKey) return false
    return fecha.bracket_key === assignedBracketKey
  })

  const findLatestFechaId = (): string | undefined => {
    if (fechas.length === 0) return undefined
    const sorted = [...fechas].sort((a, b) => {
      const aDate = a.created_at ? Date.parse(a.created_at) : 0
      const bDate = b.created_at ? Date.parse(b.created_at) : 0
      if (aDate !== bDate) return bDate - aDate
      return (b.fecha_number || 0) - (a.fecha_number || 0)
    })
    return sorted[0]?.id
  }

  const requestedFechaId = resolvedSearchParams.fecha_id || null
  const latestFechaId = findLatestFechaId()
  const isRequestedValid = requestedFechaId ? fechas.some((fecha) => fecha.id === requestedFechaId) : false
  const effectiveFechaId = isRequestedValid ? requestedFechaId : latestFechaId

  if (effectiveFechaId && requestedFechaId !== effectiveFechaId) {
    redirect(`/tournaments/${resolvedParams.id}/schedules?fecha_id=${effectiveFechaId}`)
  }

  if (!effectiveFechaId && requestedFechaId) {
    redirect(`/tournaments/${resolvedParams.id}/schedules`)
  }
  const requestedCoupleId = resolvedSearchParams.couple_id
  const initialCoupleId = requestedCoupleId && (requestedCoupleId === inscriptionResult.coupleId && isActiveStarter
    || substitutes.some(item => item.fecha_id === effectiveFechaId && item.couple_id === requestedCoupleId && item.is_substitute && item.can_vote))
    ? requestedCoupleId : undefined

  return (
    <ScheduleContainer
      tournamentId={resolvedParams.id}
      fechas={fechas || []}
      initialFechaId={effectiveFechaId || undefined}
      initialCoupleId={initialCoupleId}
      tournamentName={tournament.name}
      clubName={clubName}
    />
  )
}
