import { Trophy, Zap, Calendar, Clock, MapPin } from "lucide-react"
import Link from "next/link"

// Types matching database structure
interface BracketMatch {
  id: string
  round: string
  status: string
  couple1_id: string | null
  couple2_id: string | null
  winner_id: string | null
  result_couple1: string | null
  result_couple2: string | null
  couple1_player1_name?: string
  couple1_player2_name?: string
  couple2_player1_name?: string
  couple2_player2_name?: string
  couple1?: { player1_id: string; player2_id: string }
  couple2?: { player1_id: string; player2_id: string }

  // ✅ NUEVO: Datos de fecha_matches para horarios (LONG)
  fecha_matches?: Array<{
    scheduled_date?: string
    scheduled_start_time?: string
    court_assignment?: string
  }>
}

interface MatchPoints {
  points_winner: number
  points_loser: number
}

interface SetMatch {
  set_number: number
  couple1_games: number
  couple2_games: number
  winner_couple_id: string
}

interface NewMatchCardProps {
  match: BracketMatch
  points?: MatchPoints
  sets?: SetMatch[]
  tournamentType?: 'AMERICAN' | 'LONG'
}

// Round translations
const ROUND_TRANSLATIONS: Record<string, string> = {
  '32VOS': '32vos de Final',
  '16VOS': '16vos de Final',
  '8VOS': 'Octavos',
  '4TOS': 'Cuartos',
  'SEMIFINAL': 'Semifinales',
  'FINAL': 'Final'
}

// Helper: Parse sets based on tournament type
function parseSets(match: BracketMatch, tournamentType: string, setsData?: SetMatch[]): string[] {
  // 1. LONG: Intentar usar set_matches si existen
  if (tournamentType === 'LONG' && setsData && setsData.length > 0) {
    console.log('📊 [parseSets] Using set_matches data:', setsData)
    return setsData.map(set => `${set.couple1_games}-${set.couple2_games}`)
  }

  // 2. Fallback: Parsear desde result_couple1 y result_couple2
  if (match.result_couple1 && match.result_couple2) {
    const couple1Results = match.result_couple1.split(',').map(s => s.trim())
    const couple2Results = match.result_couple2.split(',').map(s => s.trim())

    console.log('📊 [parseSets] Parsing from result strings:', {
      tournamentType,
      result_couple1: match.result_couple1,
      result_couple2: match.result_couple2,
      parsed: couple1Results.map((c1, idx) => `${c1}-${couple2Results[idx] || '0'}`)
    })

    // Validar que haya datos válidos
    if (couple1Results.length > 0 && couple2Results.length > 0) {
      return couple1Results.map((c1, idx) => {
        const c2 = couple2Results[idx] || '0'
        return `${c1}-${c2}`
      })
    }
  }

  console.log('⚠️ [parseSets] No sets data available for match:', match.id)
  return []
}

// Helper: Get team points
function getTeamPoints(match: BracketMatch, points: MatchPoints | undefined, coupleId: string | null): number | null {
  if (!points || !coupleId) return null

  if (match.winner_id === coupleId) {
    return points.points_winner
  } else if (match.winner_id && match.winner_id !== coupleId) {
    return points.points_loser
  }

  return null
}

// Helper: Determine match status display
function getMatchStatus(match: BracketMatch): { label: string; variant: string } {
  if (match.status === 'WAITING_OPONENT') {
    return { label: 'Esperando oponente', variant: 'secondary' }
  }
  if (match.status === 'PENDING') {
    return { label: 'Pendiente', variant: 'secondary' }
  }
  if (match.status === 'FINISHED') {
    const isBye = match.couple1_id === null || match.couple2_id === null
    if (isBye) {
      return { label: 'Bye', variant: 'default' }
    }
    return { label: 'Finalizado', variant: 'success' }
  }
  return { label: match.status, variant: 'secondary' }
}

// Player name with link
function PlayerLink({ playerId, playerName }: { playerId?: string; playerName: string }) {
  if (!playerId) {
    return <span>{playerName}</span>
  }

  return (
    <Link
      href={`/ranking/${playerId}`}
      className="hover:text-blue-600 hover:underline transition-colors"
    >
      {playerName}</Link>
  )
}

// Main component
export function NewMatchCard({ match, points, sets = [], tournamentType = 'AMERICAN' }: NewMatchCardProps) {
  // 🔍 DEBUG: Log all props received
  console.log('🎴 [NewMatchCard] Rendering:', {
    matchId: match.id,
    round: match.round,
    status: match.status,
    tournamentType,
    setsReceived: sets?.length || 0,
    setsData: sets,
    result_couple1: match.result_couple1,
    result_couple2: match.result_couple2
  })

  // Determine match state
  const isWaitingOponent = match.status === 'WAITING_OPONENT'
  const isBye = match.status === 'FINISHED' && (match.couple1_id === null || match.couple2_id === null)
  const isPending = match.status === 'PENDING'
  const isFinished = match.status === 'FINISHED'

  const team1Won = match.winner_id === match.couple1_id && isFinished
  const team2Won = match.winner_id === match.couple2_id && isFinished

  const matchStatus = getMatchStatus(match)

  // Parse sets
  const parsedSets = parseSets(match, tournamentType, sets)

  // 🔍 DEBUG: Log parsed sets
  console.log('🎴 [NewMatchCard] Parsed sets:', {
    matchId: match.id,
    parsedSetsCount: parsedSets.length,
    parsedSets
  })

  // ✅ NUEVO: Extraer datos de fecha_matches para horarios (LONG)
  const fechaMatchesArray = Array.isArray(match.fecha_matches)
    ? match.fecha_matches
    : match.fecha_matches ? [match.fecha_matches as any] : []

  const fechaMatch = fechaMatchesArray[0]
  const hasScheduleInfo = fechaMatch && (
    fechaMatch.scheduled_date ||
    fechaMatch.scheduled_start_time ||
    fechaMatch.court_assignment
  )

  const formatDate = (dateString: string) => {
    // Fix timezone issue: parse date components directly to avoid UTC interpretation
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number)
    const date = new Date(year, month - 1, day)

    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    })
  }

  // Calculate points
  const team1Points = getTeamPoints(match, points, match.couple1_id)
  const team2Points = getTeamPoints(match, points, match.couple2_id)

  // Detect BATACAZO
  const hasBatacazo = (team1Points && team1Points > 18) || (team2Points && team2Points > 18)

  // Team names
  const team1Exists = match.couple1_id !== null
  const team2Exists = match.couple2_id !== null

  return (
    <div className={`overflow-hidden rounded-surface border border-slate-200 bg-white shadow-sm ${
      tournamentType === 'LONG' ? 'max-w-md' : 'max-w-xs'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-700 to-slate-600 px-3 py-2">
        <span className="text-sm font-semibold text-white">
          {ROUND_TRANSLATIONS[match.round] || match.round}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
          matchStatus.variant === 'success' ? 'bg-emerald-500 text-white' :
          matchStatus.variant === 'default' ? 'bg-blue-500 text-white' :
          'bg-slate-400 text-white'
        }`}>
          {matchStatus.label}
        </span>
      </div>

      {/* ✅ NUEVO: Sección de Horarios (solo para LONG) */}
      {tournamentType === 'LONG' && hasScheduleInfo && (
        <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {fechaMatch.scheduled_date && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-medium">{formatDate(fechaMatch.scheduled_date)}</span>
            </div>
          )}
          {fechaMatch.scheduled_start_time && (
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-medium">{fechaMatch.scheduled_start_time.slice(0, 5)}</span>
            </div>
          )}
          {fechaMatch.court_assignment && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-medium">Cancha {fechaMatch.court_assignment}</span>
            </div>
          )}
        </div>
      )}

      {/* Special cases: Waiting opponent or BYE */}
      {isWaitingOponent && (
        <div className="px-3 py-4 text-center text-sm text-slate-500">
          {team1Exists && (
            <div className="mb-2">
              <p className="font-semibold text-slate-700">
                {match.couple1?.player1_id && match.couple1?.player2_id ? (
                  <>
                    <PlayerLink playerId={match.couple1.player1_id} playerName={match.couple1_player1_name || ''} />
                    {' / '}
                    <PlayerLink playerId={match.couple1.player2_id} playerName={match.couple1_player2_name || ''} />
                  </>
                ) : (
                  `${match.couple1_player1_name || ''} / ${match.couple1_player2_name || ''}`
                )}
              </p>
            </div>
          )}
          <p className="italic">Esperando oponente...</p>
        </div>
      )}

      {/* Normal match display */}
      {!isWaitingOponent && (
        <div className="divide-y divide-slate-100">
          {/* Team 1 */}
          {team1Exists ? (
            <div className={`flex items-center justify-between px-3 py-2.5 ${team1Won ? "bg-blue-50" : ""}`}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {team1Won && <Trophy className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold truncate ${team1Won ? "text-slate-900" : "text-slate-700"}`}>
                    {match.couple1?.player1_id && match.couple1?.player2_id ? (
                      <>
                        <PlayerLink playerId={match.couple1.player1_id} playerName={match.couple1_player1_name || ''} />
                      </>
                    ) : (
                      match.couple1_player1_name || ''
                    )}
                  </p>
                  <p className={`text-xs truncate ${team1Won ? "text-slate-700" : "text-slate-500"}`}>
                    {match.couple1?.player1_id && match.couple1?.player2_id ? (
                      <PlayerLink playerId={match.couple1.player2_id} playerName={match.couple1_player2_name || ''} />
                    ) : (
                      match.couple1_player2_name || ''
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-2">
                {parsedSets.length > 0 && isFinished && (
                  <div className="flex gap-1">
                    {parsedSets.map((set, idx) => (
                      <span
                        key={idx}
                        className={`rounded px-2 py-0.5 text-sm font-bold tabular-nums ${
                          team1Won ? "bg-slate-200 text-slate-900" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {set.split("-")[0]}
                      </span>
                    ))}
                  </div>
                )}
                {!isFinished && <span className="text-slate-400 text-sm">--</span>}
                {team1Points !== null && (
                  <span
                    className={`min-w-[48px] rounded border px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${
                      team1Points > 0
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-rose-300 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {team1Points > 0 ? "+" : ""}
                    {team1Points}
                  </span>
                )}
              </div>
            </div>
          ) : isBye && (
            <div className="px-3 py-2.5 text-center">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium">
                Bye
              </span>
            </div>
          )}

          {/* BATACAZO badge for team 1 */}
          {team1Won && team1Points && team1Points > 18 && (
            <div className="px-3 py-1 bg-amber-50">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                <Zap className="h-3 w-3" />
                BATACAZO +{team1Points}pts
              </span>
            </div>
          )}

          {/* Team 2 */}
          {team2Exists ? (
            <div className={`flex items-center justify-between px-3 py-2.5 ${team2Won ? "bg-blue-50" : ""}`}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {team2Won && <Trophy className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold truncate ${team2Won ? "text-slate-900" : "text-slate-700"}`}>
                    {match.couple2?.player1_id && match.couple2?.player2_id ? (
                      <PlayerLink playerId={match.couple2.player1_id} playerName={match.couple2_player1_name || ''} />
                    ) : (
                      match.couple2_player1_name || ''
                    )}
                  </p>
                  <p className={`text-xs truncate ${team2Won ? "text-slate-700" : "text-slate-500"}`}>
                    {match.couple2?.player1_id && match.couple2?.player2_id ? (
                      <PlayerLink playerId={match.couple2.player2_id} playerName={match.couple2_player2_name || ''} />
                    ) : (
                      match.couple2_player2_name || ''
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-2">
                {parsedSets.length > 0 && isFinished && (
                  <div className="flex gap-1">
                    {parsedSets.map((set, idx) => (
                      <span
                        key={idx}
                        className={`rounded px-2 py-0.5 text-sm font-bold tabular-nums ${
                          team2Won ? "bg-slate-200 text-slate-900" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {set.split("-")[1]}
                      </span>
                    ))}
                  </div>
                )}
                {!isFinished && <span className="text-slate-400 text-sm">--</span>}
                {team2Points !== null && (
                  <span
                    className={`min-w-[48px] rounded border px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${
                      team2Points > 0
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-rose-300 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {team2Points > 0 ? "+" : ""}
                    {team2Points}
                  </span>
                )}
              </div>
            </div>
          ) : isBye && (
            <div className="px-3 py-2.5 text-center">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium">
                Bye
              </span>
            </div>
          )}

          {/* BATACAZO badge for team 2 */}
          {team2Won && team2Points && team2Points > 18 && (
            <div className="px-3 py-1 bg-amber-50">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                <Zap className="h-3 w-3" />
                BATACAZO +{team2Points}pts
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
