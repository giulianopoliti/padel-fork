import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { checkTournamentPermissions } from "@/utils/tournament-permissions"
import MatchSchedulingContainer from "./components/MatchSchedulingContainer"

interface MatchSchedulingPageProps {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    fecha_id?: string
  }>
}

interface Club {
  id: string
  name: string
}

export default async function MatchSchedulingPage({ 
  params, 
  searchParams 
}: MatchSchedulingPageProps) {
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

  // Get tournament basic info including draft mode setting
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, name, type, enable_draft_matches, clubes(name)')
    .eq('id', resolvedParams.id)
    .single()
  if (tournamentError || !tournament || tournament.type !== 'LONG') {
    redirect('/tournaments')
  }

  // Get tournament clubs - join clubes table to get club details
  const { data: clubsData } = await supabase
    .from('clubes_tournament')
    .select('clubes(id, name)')
    .eq('tournament_id', resolvedParams.id)

  // Map to Club[] format
  const clubs: Club[] = (clubsData || []).flatMap(item => {
    const club = Array.isArray(item.clubes) ? item.clubes[0] : item.clubes
    return club ? [{ id: club.id, name: club.name }] : []
  })

  // Get tournament fechas - 🔒 ONLY ZONE round type fechas
  const { data: fechas } = await supabase
    .from('tournament_fechas')
    .select('id, name, fecha_number, description, status, start_date, end_date, round_type, estimated_match_duration_minutes')
    .eq('tournament_id', resolvedParams.id)
    .eq('round_type', 'ZONE')
    .order('fecha_number', { ascending: true })

  if (!fechas || fechas.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">No hay fechas de zona configuradas</h1>
          <p className="text-slate-600 mb-2">
            Match Scheduling solo funciona para partidos de <strong>fase de zonas</strong>.
          </p>
          <p className="text-slate-500 text-sm">
            Crea fechas con <code className="bg-slate-200 px-2 py-1 rounded">round_type = ZONE</code> en "Fechas & Horarios"
          </p>
        </div>
      </div>
    )
  }

  // Use provided fecha_id or default to first fecha
  const selectedFechaId = resolvedSearchParams.fecha_id || fechas[0].id

  return (
    <MatchSchedulingContainer
      tournamentId={resolvedParams.id}
      tournamentName={tournament.name || 'Torneo'}
      clubName={(Array.isArray(tournament.clubes) ? tournament.clubes[0]?.name : tournament.clubes?.name) || 'Sin club'}
      clubes={clubs || []}
      fechas={fechas}
      selectedFechaId={selectedFechaId}
      isDraftModeEnabled={tournament.enable_draft_matches || false}
    />
  )
}
