import Link from 'next/link'
import { ArrowRight, Calendar, Clock, Filter, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listScheduleWorkspace, scheduleWorkspaceFilterSchema } from '@/lib/services/schedule-sharing/reader'
import { cupLabels, distributionLabels, formatPeriod, roundLabels, tournamentSchedulePath } from './display'

type Search = Record<string, string | string[] | undefined>
const selectStyle = 'h-10 w-full rounded-control border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const ScheduleWorkspace = async ({ searchParams }: { searchParams: Promise<Search> }) => {
  const search = await searchParams
  const parsed = scheduleWorkspaceFilterSchema.safeParse(Object.fromEntries(
    Object.entries(search).filter(([, value]) => typeof value === 'string' && value !== ''),
  ))
  const { scope, filters, entries, total, pageSize } = await listScheduleWorkspace(parsed.success ? parsed.data : {})
  const clubs = new Map(scope.clubs.map(club => [club.id, club.name]))
  const tournaments = new Map(scope.tournaments.map(tournament => [tournament.id, tournament]))
  const hasEligible = scope.tournaments.some(tournament => tournament.eligible)
  const isFiltered = Object.entries(filters).some(([key, value]) => key !== 'page' && value && value !== 'all')
  const workspaceUrl = (page: number) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (key !== 'page' && value && value !== 'all') params.set(key, String(value))
    }
    if (page > 1) params.set('page', String(page))
    return params.size ? `/schedules?${params}` : '/schedules'
  }
  const back = encodeURIComponent(workspaceUrl(filters.page))
  const creationClub = filters.club || (scope.clubs.length === 1 ? scope.clubs[0].id : '')
  const createUrl = `/schedules/new?${new URLSearchParams({ back: workspaceUrl(filters.page), ...(creationClub ? { club: creationClub } : {}) })}`

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-primary"><Calendar className="size-4" aria-hidden /> Gestión de torneos</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Fechas y horarios</h1>
          <p className="text-muted-foreground">Consultá y compartí la programación entre tus torneos.</p>
        </div>
        {hasEligible && <Button asChild><Link href={createUrl}><Plus aria-hidden /> Crear fecha compartida</Link></Button>}
      </header>

      {!parsed.success && <p role="alert" className="rounded-lg border bg-muted/40 p-3 text-sm">El enlace tenía filtros inválidos. Se muestran todas las fechas.</p>}
      <details className="rounded-xl border bg-card" open={isFiltered || undefined}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium"><Filter className="mr-2 inline size-4" aria-hidden /> Filtros</summary>
        <form action="/schedules" className="grid grid-cols-2 gap-4 border-t p-4 lg:grid-cols-4">
          <label className="space-y-1.5 text-sm">Club
            <select className={selectStyle} name="club" defaultValue={filters.club ?? ''}>
              <option value="">Todos los clubes</option>
              {scope.clubs.map(club => <option key={club.id} value={club.id}>{club.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">Torneo
            <select className={selectStyle} name="tournament" defaultValue={filters.tournament ?? ''}>
              <option value="">Todos los torneos</option>
              {scope.tournaments.map(tournament => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">Ronda
            <select className={selectStyle} name="round" defaultValue={filters.round ?? ''}>
              <option value="">Todas</option>
              {Object.entries(roundLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">Copa
            <select className={selectStyle} name="bracket" defaultValue={filters.bracket ?? ''}>
              <option value="">Todas</option>
              {Object.entries(cupLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">Desde<Input type="date" name="from" defaultValue={filters.from} className="min-w-0" /></label>
          <label className="space-y-1.5 text-sm">Hasta<Input type="date" name="to" defaultValue={filters.to} className="min-w-0" /></label>
          <label className="space-y-1.5 text-sm">Período
            <select className={selectStyle} name="period" defaultValue={filters.period}>
              <option value="all">Todos</option><option value="dated">Con período</option><option value="undated">Sin período</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm">Estado del vínculo
            <select className={selectStyle} name="state" defaultValue={filters.state ?? ''}>
              <option value="">Todos los estados</option>
              {Object.entries(distributionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <div className="col-span-full flex flex-wrap gap-2">
            <Button type="submit" size="sm">Aplicar filtros</Button>
            {isFiltered && <Button asChild size="sm" variant="ghost"><Link href="/schedules">Limpiar filtros</Link></Button>}
          </div>
        </form>
      </details>

      {entries.length === 0 ? (
        <section className="space-y-3 rounded-xl border border-dashed p-7 text-center">
          <Calendar className="mx-auto size-7 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{isFiltered ? 'No encontramos fechas con estos filtros' : 'Todavía no hay fechas'}</h2>
          <p className="text-sm text-muted-foreground">{hasEligible ? 'Podés crear una fecha en uno o varios torneos.' : 'Para crear una fecha necesitás un torneo largo que puedas administrar y que siga abierto.'}</p>
          {isFiltered ? <Button asChild variant="outline"><Link href="/schedules">Ver todas las fechas</Link></Button>
            : hasEligible ? <Button asChild><Link href={createUrl}>Crear primera fecha</Link></Button>
              : <Button asChild variant="outline"><Link href="/panel">Ir a gestión de torneos</Link></Button>}
        </section>
      ) : (
        <section aria-label="Fechas" className="space-y-3">
          <p className="text-sm text-muted-foreground">{total} {total === 1 ? 'fecha' : 'fechas'}</p>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {entries.map(entry => {
              const group = entry.kind === 'GROUP'
              const tournament = tournaments.get(entry.tournament_ids[0])
              const href = group ? `/schedules/${entry.id}?back=${back}` : tournamentSchedulePath(entry.tournament_ids[0], entry.id)
              const tournamentNames = entry.tournament_ids.map(id => tournaments.get(id)?.name).filter(Boolean)
              const clubNames = entry.club_ids.map(id => clubs.get(id)).filter(Boolean)
              return (
                <li key={`${entry.kind}-${entry.id}`} className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
                  <div className="min-w-0 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 break-words text-lg font-semibold">{entry.name}</h2>
                      <Badge variant={group ? 'secondary' : 'outline'}>{group ? 'Compartida' : 'Individual'}</Badge>
                      {group && entry.distribution_state !== 'COMPLETE' && (
                        <Badge variant="outline">{distributionLabels[entry.distribution_state]}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><Calendar className="size-3.5 shrink-0" aria-hidden />{formatPeriod(entry.start_date, entry.end_date)}</span>
                      <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5 shrink-0" aria-hidden />{entry.slot_count} {entry.slot_count === 1 ? 'franja' : 'franjas'}</span>
                      {group && <span>{entry.tournament_count === 0 ? 'Sin fechas vinculadas'
                        : `${entry.tournament_count} ${entry.tournament_count === 1 ? 'torneo vinculado' : 'torneos vinculados'}`}</span>}
                    </div>
                    {tournamentNames.length > 0 && <p className="break-words text-sm font-medium">{tournamentNames.join(' · ')}</p>}
                    <p className="break-words text-xs text-muted-foreground">{clubNames.join(' · ') || 'Sin club asignado'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:max-w-48 sm:justify-end">
                    <Button asChild size="sm" variant="outline"><Link href={href}>{group ? 'Ver fecha compartida' : 'Gestionar fecha'} <ArrowRight aria-hidden /></Link></Button>
                    {!group && tournament?.eligible && <Button asChild size="sm" variant="ghost"><Link href={`/schedules/new?source=${entry.id}&back=${back}`}>Compartir</Link></Button>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {(filters.page > 1 || total > pageSize) && (
        <nav aria-label="Páginas de fechas" className="flex flex-wrap items-center gap-3 text-sm">
          {filters.page > 1 && <Button asChild size="sm" variant="outline"><Link href={workspaceUrl(filters.page - 1)}>Anterior</Link></Button>}
          <span>Página {filters.page} de {Math.max(1, Math.ceil(total / pageSize))}</span>
          {total > filters.page * pageSize && <Button asChild size="sm" variant="outline"><Link href={workspaceUrl(filters.page + 1)}>Siguiente</Link></Button>}
        </nav>
      )}
    </div>
  )
}

export default ScheduleWorkspace
