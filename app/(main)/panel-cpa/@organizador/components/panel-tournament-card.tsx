import Link from 'next/link'
import { ArrowUpRight, Building2, CalendarDays, Users, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDateArgentina, formatTimeArgentina } from '@/lib/utils'
import { getTournamentStatusLabel } from '@/lib/tournaments/public-tournament-details'
import type { PanelTournamentWithMetrics } from '@/lib/services/organizer-panel-metrics'
import { getPublicTournamentHref } from '@/lib/tournaments/public-tournament-url'
import { getTenantBranding } from '@/config/tenant'

const statusClasses: Record<string, string> = {
  NOT_STARTED: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
  ZONE_PHASE: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-200',
  BRACKET_PHASE: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-200',
}
const typeLabels: Record<string, string> = { LONG: 'Long', AMERICAN: 'Americano', AMERICAN_OTP: 'Americano OTP' }
const genderLabels: Record<string, string> = { MALE: 'Caballeros', FEMALE: 'Damas', MIXED: 'Mixto', SHEMALE: 'Mixto' }

const formatPrice = (price: number | string | null): string => {
  if (typeof price === 'number') return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(price)
  return price?.trim() || 'A confirmar'
}

const PanelTournamentCard = ({ tournament }: { tournament: PanelTournamentWithMetrics }) => {
  const theme = getTenantBranding().tournaments.theme
  const statusLabel = getTournamentStatusLabel(tournament.status)
  const dateLabel = tournament.start_date
    ? formatDateArgentina(tournament.start_date, { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Fecha a confirmar'
  const isAmerican = tournament.type === 'AMERICAN' || tournament.type === 'AMERICAN_OTP'

  return (
    <Link
      href={getPublicTournamentHref({ id: tournament.id, seoSlug: tournament.seo_slug, isDraft: tournament.is_draft })}
      aria-label={`Abrir ${tournament.name}, ${statusLabel}`}
      className={`${theme.className} group flex min-w-0 flex-col gap-3 overflow-hidden rounded-surface border border-t-4 border-t-primary bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-t-accent`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary dark:text-accent"><span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />{typeLabels[tournament.type] || tournament.type}</span>
        <div className="flex flex-wrap gap-1.5">
          {tournament.is_draft && <Badge variant="outline" className="text-amber-700 dark:text-amber-300">Borrador</Badge>}
          <Badge variant="secondary" className={statusClasses[tournament.status]}>{statusLabel}</Badge>
        </div>
      </div>
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-base font-bold leading-snug text-primary group-hover:underline group-hover:decoration-accent group-hover:underline-offset-4 dark:text-card-foreground">{tournament.name}</h3>
          <span className="rounded-full bg-accent/40 p-1 text-primary transition-colors group-hover:bg-accent dark:bg-accent dark:text-accent-foreground"><ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{tournament.category_name || 'Categoría a confirmar'} · {genderLabels[tournament.gender] || tournament.gender}</p>
      </div>
      <div className="-mx-4 flex flex-wrap gap-x-5 gap-y-2 border-y border-primary/10 bg-primary/[0.04] px-4 py-2.5 text-sm dark:border-accent/15 dark:bg-accent/5">
        <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-primary dark:text-accent" aria-hidden="true" /><strong className="text-primary dark:text-accent">{tournament.players}</strong> jugadores <span className="text-muted-foreground">· {tournament.couples} parejas</span></span>
        <span className="inline-flex items-center gap-1.5"><Trophy className="h-4 w-4 text-primary dark:text-accent" aria-hidden="true" /><strong className="text-primary dark:text-accent">{tournament.matchesFinished}/{tournament.totalMatches}</strong> partidos jugados</span>
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <p className="flex items-start gap-1.5"><Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{tournament.clubes?.name || 'Club a confirmar'}</span></p>
        <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{dateLabel}{isAmerican && tournament.start_date ? ` · ${formatTimeArgentina(tournament.start_date, { hour: '2-digit', minute: '2-digit', hour12: false })} hs` : ''}</p>
        <p>Inscripción: <span className="font-medium text-foreground">{formatPrice(tournament.price)}</span></p>
        {tournament.pendingInscriptions > 0 && <p className="font-medium text-amber-700 dark:text-amber-300">{tournament.pendingInscriptions} solicitudes de inscripción pendientes</p>}
        {tournament.pendingWithoutSlot > 0 && <p className="font-semibold text-amber-800 dark:text-amber-200">{tournament.max_participants != null && tournament.occupiedSlots >= tournament.max_participants ? 'Torneo completo · ' : ''}{tournament.pendingWithoutSlot} parejas sin cupo reservado</p>}
        {tournament.proofWithoutSlot > 0 && <p className="font-semibold text-red-700 dark:text-red-300">{tournament.proofWithoutSlot} con comprobante recibido sin cupo · Requiere atención</p>}
      </div>
    </Link>
  )
}

export default PanelTournamentCard
