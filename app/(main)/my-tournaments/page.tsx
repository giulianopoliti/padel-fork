import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trophy, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import TournamentCard from '@/app/(main)/panel/@organizador/components/tournament-card'
import { getTenantBranding } from '@/config/tenant'
import { getTournamentListingContext, getTournamentListCounts, getTournamentListPage, TournamentListingAccessError, type ListedTournament } from '@/lib/services/tournament-list.service'
import { TOURNAMENT_LIST_FILTERS, LIST_PAGE_SIZE, normalizeListFilter, normalizeListPage, getTournamentListHref, type TournamentListFilter } from '@/lib/tournaments/tournament-list-filters'
import { DuplicateTournamentDialog } from './components/duplicate-tournament-dialog'
import { RestoreTournamentButton } from './components/restore-tournament-button'
import ListRetryButton from './components/list-retry-button'
import TournamentClubSelector from '@/components/tournament/tournament-club-selector'
import { getActiveTournamentClubs, validateTournamentClub } from '@/lib/services/tournament-club-filter.service'

export const dynamic = 'force-dynamic'

type CountsResult = { value: Awaited<ReturnType<typeof getTournamentListCounts>>; error?: never } | { error: true; value?: never }
type CountsPromise = Promise<CountsResult>

const CountBadge = async ({ counts, filter }: { counts: CountsPromise; filter: TournamentListFilter }) => {
  const result = await counts
  return <Badge variant="secondary" aria-label={result.error ? 'Cantidad no disponible' : `${result.value.counts[filter]} torneos`}>{result.error ? '—' : result.value.counts[filter]}</Badge>
}
const Summary = async ({ counts }: { counts: CountsPromise }) => {
  const result = await counts
  if (result.error) return <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>No pudimos cargar los contadores.</span><ListRetryButton /></div>
  return <div className="mt-4 flex flex-wrap gap-6 text-sm text-muted-foreground"><span>Total de torneos <strong className="ml-2 text-lg text-foreground">{result.value.total}</strong></span><span>Activos <strong className="ml-2 text-lg text-foreground">{result.value.active}</strong></span></div>
}

const FilterLink = ({ filter, selected, counts, clubId }: { filter: TournamentListFilter; selected: TournamentListFilter; counts: CountsPromise; clubId?: string }) => (
  <Link href={getTournamentListHref(filter, 1, clubId)} prefetch={false} aria-current={filter === selected ? 'page' : undefined}
    className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === selected ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
    {TOURNAMENT_LIST_FILTERS[filter].label}
    <Suspense fallback={<Skeleton className="h-5 w-7" />}><CountBadge counts={counts} filter={filter} /></Suspense>
  </Link>
)
const OtherFilter = async ({ selected, counts, clubId }: { selected: TournamentListFilter; counts: CountsPromise; clubId?: string }) => {
  const result = await counts
  if (selected !== 'other' && (result.error || result.value.counts.other === 0)) return null
  return <FilterLink filter="other" selected={selected} counts={counts} clubId={clubId} />
}

const TournamentWithActions = ({ tournament, priority }: { tournament: ListedTournament; priority: boolean }) => (
  <article className="overflow-hidden rounded-surface border bg-card">
    <TournamentCard tournament={tournament} priority={priority} />
    {(tournament.type === 'LONG' || tournament.type === 'AMERICAN' || tournament.status === 'CANCELED') && (
      <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/30 px-4 py-3">
        {(tournament.type === 'LONG' || tournament.type === 'AMERICAN') && <DuplicateTournamentDialog tournamentId={tournament.id} tournamentName={tournament.name} />}
        {tournament.status === 'CANCELED' && <RestoreTournamentButton tournamentId={tournament.id} tournamentName={tournament.name} />}
      </div>
    )}
  </article>
)

const TournamentList = async ({ context, filter, page, clubId }: { clubId?: string; context: Awaited<ReturnType<typeof getTournamentListingContext>>; filter: TournamentListFilter; page: number }) => {
  let result: Awaited<ReturnType<typeof getTournamentListPage>>
  try {
    result = await getTournamentListPage(context.supabase, context.scope, filter, page, clubId)
  } catch (error) {
    console.error('[MyTournaments] Could not load page:', error)
    return <Alert variant="destructive"><AlertTitle>No pudimos cargar los torneos</AlertTitle><AlertDescription className="mt-2 space-y-3"><p>Intentá nuevamente. Los torneos y sus métricas no están disponibles en este momento.</p><ListRetryButton /></AlertDescription></Alert>
  }
  if (result.redirectPage !== null) redirect(getTournamentListHref(filter, result.redirectPage, clubId))
  if (result.total === 0) return (
    <div className="rounded-surface border bg-card px-6 py-12 text-center">
      <Trophy className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden="true" />
      <h2 className="text-lg font-semibold">No hay torneos en {TOURNAMENT_LIST_FILTERS[filter].label.toLowerCase()}</h2>
      <p className="mt-2 text-sm text-muted-foreground">Los torneos de este estado aparecerán aquí.</p>
      {filter === 'upcoming' && <Button asChild className="mt-5"><Link href="/tournaments/create"><Plus className="mr-2 h-4 w-4" />Crear torneo</Link></Button>}
    </div>
  )
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground" role="status">Mostrando {(page - 1) * LIST_PAGE_SIZE + 1}–{(page - 1) * LIST_PAGE_SIZE + result.tournaments.length} de {result.total} torneos</p>
    {result.tournaments.map((tournament, index) => <TournamentWithActions key={tournament.id} tournament={tournament} priority={index === 0} />)}
    <nav aria-label="Paginación de torneos" className="flex flex-wrap items-center justify-between gap-3 pt-4">
      {page > 1 ? <Button variant="outline" asChild><Link prefetch={false} href={getTournamentListHref(filter, page - 1, clubId)}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Link></Button> : <Button variant="outline" disabled>Anterior</Button>}
      <span className="text-sm text-muted-foreground">Página {page} de {result.pages}</span>
      {page < result.pages ? <Button variant="outline" asChild><Link prefetch={false} href={getTournamentListHref(filter, page + 1, clubId)}>Siguiente<ChevronRight className="ml-1 h-4 w-4" /></Link></Button> : <Button variant="outline" disabled>Siguiente</Button>}
    </nav>
  </div>
}

const ListLoading = () => <div aria-label="Cargando torneos" role="status" className="space-y-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-64 w-full rounded-surface" />)}<span className="sr-only">Cargando la página de torneos…</span></div>

const MyTournamentsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const params = await searchParams
  const filter = normalizeListFilter(params.estado)
  const page = normalizeListPage(params.page)
  let context: Awaited<ReturnType<typeof getTournamentListingContext>>
  try {
    context = await getTournamentListingContext()
  } catch (error) {
    if (error instanceof TournamentListingAccessError && error.needsLogin) redirect('/login')
    console.error('[MyTournaments] Could not authorize listing:', error)
    return <div className="container mx-auto px-4 py-8"><Alert variant="destructive"><AlertTitle>No pudimos abrir tus torneos</AlertTitle><AlertDescription className="mt-2 space-y-3"><p>{error instanceof TournamentListingAccessError ? error.message : 'No pudimos verificar tu acceso. Intentá nuevamente.'}</p><ListRetryButton /></AlertDescription></Alert></div>
  }
  let clubs: Awaited<ReturnType<typeof getActiveTournamentClubs>>
  let clubId: string | undefined
  try {
    clubs = await getActiveTournamentClubs(context.supabase, context.scope)
    clubId = validateTournamentClub(params.club, clubs)
  } catch (error) {
    console.error('[MyTournaments] Could not load club filter:', error)
    return <div className="container mx-auto px-4 py-8"><Alert variant="destructive"><AlertTitle>No pudimos aplicar el filtro de club</AlertTitle><AlertDescription className="mt-2 space-y-3"><p>El club no está disponible o no pudimos cargar los clubes activos.</p><Link href={getTournamentListHref(filter)} prefetch={false} className="underline">Volver a todos los clubes</Link><ListRetryButton /></AlertDescription></Alert></div>
  }
  const counts: CountsPromise = getTournamentListCounts(context.supabase, context.scope, clubId)
    .then((value): CountsResult => ({ value }))
    .catch((error): CountsResult => { console.error('[MyTournaments] Could not load counts:', error); return { error: true } })
  return <main className={`${getTenantBranding().tournaments.theme.className} min-h-screen bg-background`}>
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <header className="rounded-elevated border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold sm:text-3xl">Mis Torneos</h1><p className="mt-1 text-sm text-muted-foreground">Gestioná todos tus torneos desde un solo lugar</p></div><Button asChild><Link href="/tournaments/create"><Plus className="mr-2 h-4 w-4" />Crear Nuevo Torneo</Link></Button></div>
        <Suspense fallback={<Skeleton className="mt-4 h-8 w-64" />}><Summary counts={counts} /></Suspense>
      </header>
      <TournamentClubSelector clubs={clubs} clubId={clubId} path="/my-tournaments" state={filter} />
      <nav aria-label="Filtrar torneos por estado" className="flex gap-2 overflow-x-auto pb-2">
        {(Object.keys(TOURNAMENT_LIST_FILTERS) as TournamentListFilter[]).filter((key) => key !== 'other').map((key) => <FilterLink key={key} filter={key} selected={filter} counts={counts} clubId={clubId} />)}
        <Suspense fallback={null}><OtherFilter selected={filter} counts={counts} clubId={clubId} /></Suspense>
      </nav>
      <Suspense key={`${filter}-${page}-${clubId || "all"}`} fallback={<ListLoading />}><TournamentList context={context} filter={filter} page={page} clubId={clubId} /></Suspense>
    </div>
  </main>
}
export default MyTournamentsPage
