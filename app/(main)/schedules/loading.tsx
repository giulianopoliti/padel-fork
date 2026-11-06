import { Skeleton } from '@/components/ui/skeleton'

const Loading = () => (
  <div className="space-y-5" role="status" aria-label="Cargando fechas y horarios">
    <Skeleton className="h-10 w-56" />
    <Skeleton className="h-24 w-full" />
    {[1, 2, 3].map(row => <Skeleton key={row} className="h-28 w-full" />)}
  </div>
)

export default Loading
