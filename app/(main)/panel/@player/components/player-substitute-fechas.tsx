import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { PlayerSubstituteTournament } from '@/app/api/panel/actions'
import { PlayerTournamentAgenda } from './player-tournament-agenda'

const PlayerSubstituteTournamentCard = ({ tournament }: { tournament: PlayerSubstituteTournament }) => (
  <article className="space-y-3 rounded-display border border-white/15 bg-white/5 p-4 text-white">
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/tournaments/${tournament.id}`} className="font-semibold hover:underline">{tournament.name}</Link>
      <Badge variant="outline" className="border-white/25 text-white">Suplente</Badge>
    </div>
    {tournament.lineup && tournament.agenda.state !== 'MATCH_SCHEDULED' && <p className="text-sm text-white/80">{tournament.lineup}</p>}
    <PlayerTournamentAgenda agenda={tournament.agenda} />
  </article>
)

export const PlayerSubstituteTournaments = ({ tournaments }: { tournaments: PlayerSubstituteTournament[] }) => (
  tournaments.length > 0 && <div className="space-y-3 px-4 py-4 sm:px-6">
    {tournaments.map(tournament => <PlayerSubstituteTournamentCard key={tournament.id} tournament={tournament} />)}
  </div>
)
