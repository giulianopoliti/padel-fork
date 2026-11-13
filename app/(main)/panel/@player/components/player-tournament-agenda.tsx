import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PlayerTournamentAgenda as Agenda } from '@/app/api/panel/actions'
import { formatMatchDateTime } from './panel-formatters'

export const PlayerTournamentAgenda = ({ agenda }: { agenda: Agenda }) => {
  const match = agenda.scheduled_matches[0]
  if (agenda.state === 'MATCH_SCHEDULED' && match) {
    return <div className="space-y-1 rounded-display border border-white/15 bg-white/5 p-3 text-sm text-white">
      <Badge variant="outline" className="border-white/25 text-white">Partido programado</Badge>
      <p className="font-semibold">{formatMatchDateTime(match.scheduled_info.date, match.scheduled_info.time)}</p>
      <p>Con {match.partner_name} · vs. {match.opponent_names.join(' / ')}</p>
      {match.scheduled_info.court && <p>Cancha {match.scheduled_info.court}</p>}
      {agenda.scheduled_matches.length > 1 && <p>+{agenda.scheduled_matches.length - 1} en Próximos partidos</p>}
    </div>
  }

  const availability = agenda.availability
  if (!availability) return null
  const labels = {
    NO_CURRENT_SLOTS: 'Sin horarios vigentes',
    AVAILABILITY_NOT_PUBLISHED: 'Sin horarios publicados',
  }
  const unavailable = agenda.state === 'NO_CURRENT_SLOTS' || agenda.state === 'AVAILABILITY_NOT_PUBLISHED'
  const availabilityLabel = availability.free_date_selected ? 'Fecha libre solicitada'
    : availability.responded_slots === availability.total_slots ? 'Disponibilidad completa'
      : `${availability.responded_slots} de ${availability.total_slots} horarios respondidos por tu dupla`

  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-display border border-white/15 bg-white/5 p-3 text-sm text-white">
    <div>
      <p className="font-semibold">{availability.fecha_name}</p>
      <p className="text-white/80">{unavailable ? labels[agenda.state] : availabilityLabel}</p>
    </div>
    {!unavailable && <Button asChild size="sm" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white">
      <Link href={availability.href}>{agenda.state === 'AVAILABILITY_RECORDED' ? 'Revisar horarios' : 'Votar horarios'}</Link>
    </Button>}
  </div>
}
