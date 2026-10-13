import { Skeleton } from '@/components/ui/skeleton'

const OrganizerPanelLoading = () => (
  <div className="container mx-auto space-y-8 px-4 py-8 sm:px-6 lg:px-8" role="status" aria-label="Cargando panel de organizador">
    <Skeleton className="h-32 w-full rounded-display" />
    <div className="flex items-center justify-between gap-4">
      <Skeleton className="h-12 w-64 max-w-full" />
      <Skeleton className="h-9 w-24 shrink-0" />
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="space-y-3 rounded-surface border bg-card p-4">
          <div className="flex justify-between gap-4"><Skeleton className="h-4 w-20" /><Skeleton className="h-5 w-24" /></div>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
    <Skeleton className="h-64 w-full rounded-surface" />
    <span className="sr-only">Cargando torneos y jugadores…</span>
  </div>
)

export default OrganizerPanelLoading
