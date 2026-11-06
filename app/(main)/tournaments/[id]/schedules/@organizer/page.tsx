import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { checkTournamentPermissions } from "@/utils/tournament-permissions"
import OrganizerScheduleView from "../components/organizer/OrganizerScheduleView"
import { isScheduleSharingEnabled, SCHEDULE_SHARING_SCHEMA_VERSION } from "@/config/schedule-sharing"
import { isScheduleTournamentEligible } from "@/lib/services/schedule-sharing/permissions"

interface OrganizerSchedulePageProps {
  params: {
    id: string
  }
  searchParams: {
    fecha_id?: string
  }
}

export default async function OrganizerSchedulePage({
  params,
  searchParams
}: OrganizerSchedulePageProps) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams
  const supabase = await createClient()

  // Basic auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Check tournament permissions
  const permissionResult = await checkTournamentPermissions(user.id, resolvedParams.id)
  if (!permissionResult.hasPermission) {
    redirect('/tournaments')
  }

  // Get tournament basic info
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select(`
      id,
      name,
      type,
      status,
      clubes:club_id (
        name
      )
    `)
    .eq('id', resolvedParams.id)
    .single()

  if (tournamentError || !tournament) {
    redirect('/tournaments')
  }

  const clubName =
    (Array.isArray((tournament as any).clubes)
      ? (tournament as any).clubes[0]?.name
      : (tournament as any).clubes?.name) || 'Sin club'

  // Verify it's a long tournament (dates and schedules only apply to long tournaments)
  if (tournament.type !== 'LONG') {
    redirect(`/tournaments/${resolvedParams.id}`)
  }

  // Get existing fechas with comprehensive data
  const { data: fechas } = await supabase
    .from('tournament_fechas')
    .select(`
      *,
      _count_time_slots:tournament_time_slots(count)
    `)
    .eq('tournament_id', resolvedParams.id)
    .eq('_count_time_slots.slot_type', 'TIME_RANGE')
    .order('fecha_number', { ascending: true })

  // Handle fecha selection from URL
  const selectedFechaId = resolvedSearchParams.fecha_id
  let validatedFechaId: string | null = null

  if (selectedFechaId) {
    // Validate that the fecha exists
    const fechaExists = fechas?.some(f => f.id === selectedFechaId)
    if (fechaExists) {
      validatedFechaId = selectedFechaId
    } else {
      // Redirect to page without invalid fecha param
      redirect(`/tournaments/${resolvedParams.id}/schedules`)
    }
  } else if (fechas && fechas.length > 0) {
    // If no fecha selected but fechas exist, redirect to first fecha
    redirect(`/tournaments/${resolvedParams.id}/schedules?fecha_id=${fechas[0].id}`)
  }

  let sharedSchedule: { id: string; count: number } | null = null
  let canShare = false
  if (isScheduleSharingEnabled() && process.env.SCHEDULE_SHARING_ENABLED === 'true') {
    const version = await supabase.rpc('schedule_sharing_schema_version')
    if (version.data === SCHEDULE_SHARING_SCHEMA_VERSION && !version.error) {
      canShare = isScheduleTournamentEligible({ id: tournament.id, type: tournament.type, status: tournament.status, club_id: null, organization_id: null })
      if (validatedFechaId) {
        const { data: member } = await supabase.from('schedule_share_members')
          .select('group_id').eq('fecha_id', validatedFechaId).eq('status', 'active').maybeSingle()
        if (member) {
          const { data: group } = await supabase.from('schedule_workspace_entries')
            .select('id,tournament_count').eq('kind', 'GROUP').eq('id', member.group_id).maybeSingle()
          if (group) sharedSchedule = { id: group.id, count: group.tournament_count }
        }
      }
    }
  }

  return (
    <OrganizerScheduleView
      tournamentId={resolvedParams.id}
      tournamentName={tournament.name}
      clubName={clubName}
      fechas={fechas || []}
      initialSelectedFechaId={validatedFechaId}
      userRole={permissionResult.userRole || 'CLUB'}
      canShare={canShare}
      sharedSchedule={sharedSchedule}
    />
  )
}
