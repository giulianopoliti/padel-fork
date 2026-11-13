import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { LongSubstitutePanelFecha } from '@/lib/services/long-fecha-substitutions'

export const PlayerSubstituteFechas = ({ fechas }: { fechas: LongSubstitutePanelFecha[] }) => {
  if (!fechas.length) return null
  const tournaments = new Map<string, LongSubstitutePanelFecha[]>()
  for (const fecha of fechas) {
    const entries = tournaments.get(fecha.tournament_id) ?? []
    entries.push(fecha)
    tournaments.set(fecha.tournament_id, entries)
  }

  return <div className="space-y-3 px-4 py-4 text-white sm:px-6">
    {Array.from(tournaments, ([tournamentId, entries]) => (
      <article key={tournamentId} className="space-y-3 rounded-display border border-white/15 bg-white/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/tournaments/${tournamentId}`} className="font-semibold hover:underline">{entries[0].tournament_name}</Link>
          <Badge variant="outline" className="border-white/25 text-white">Suplente</Badge>
        </div>
        <ul className="divide-y divide-white/10">
          {entries.map(fecha => <li key={`${fecha.fecha_id}:${fecha.couple_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div>
              <p className="font-medium">{fecha.fecha_name}</p>
              <p className="text-white/75">{fecha.player1_name} / {fecha.player2_name}</p>
            </div>
            {fecha.has_slots ? <Button asChild size="sm" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link aria-label={`Votar horarios de ${fecha.fecha_name} con ${fecha.player1_name} / ${fecha.player2_name}`}
                href={`/tournaments/${tournamentId}/schedules?${new URLSearchParams({ fecha_id: fecha.fecha_id, couple_id: fecha.couple_id })}`}>Votar horarios</Link>
            </Button> : <span className="text-white/75">Horarios por publicar</span>}
          </li>)}
        </ul>
      </article>
    ))}
  </div>
}
