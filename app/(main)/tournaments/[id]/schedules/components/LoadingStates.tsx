import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// Loading skeleton for schedule matrix
export function ScheduleMatrixSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <Skeleton className="h-9 w-56 rounded-surface" />
        <Skeleton className="h-11 w-36 rounded-surface" />
      </div>

      {/* Time slots skeletons */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="border-l-4 border-l-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-3 flex-1">
                <Skeleton className="h-7 w-72 rounded-surface" />
                <Skeleton className="h-5 w-48 rounded-surface" />
              </div>
              <Skeleton className="h-20 w-32 rounded-elevated" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-4 w-full rounded-surface" />
              <Skeleton className="h-16 w-full rounded-elevated" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array.from({ length: 2 }).map((_, j) => (
                  <Skeleton key={j} className="h-14 w-full rounded-surface" />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Loading skeleton for player availability
export function PlayerAvailabilitySkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero skeleton */}
      <Card className="border-l-4 border-l-blue-600 shadow-md">
        <CardContent className="p-6">
          <div className="flex items-start gap-5">
            <Skeleton className="h-16 w-16 rounded-display" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-8 w-64 rounded-surface" />
              <Skeleton className="h-20 w-full rounded-elevated" />
              <Skeleton className="h-5 w-96 rounded-surface" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Instructions skeleton */}
      <Skeleton className="h-16 w-full rounded-surface" />

      {/* Time slots with switches skeleton */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="border-l-4 border-l-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-3 flex-1">
                <Skeleton className="h-7 w-72 rounded-surface" />
                <Skeleton className="h-5 w-48 rounded-surface" />
              </div>
              <Skeleton className="h-20 w-32 rounded-elevated" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-16 w-full rounded-elevated" />
            <Skeleton className="h-12 w-40 rounded-surface" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Generic loading spinner
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-5 w-5 border-2',
    md: 'h-10 w-10 border-3',
    lg: 'h-16 w-16 border-4'
  }

  return (
    <div className="flex items-center justify-center p-2">
      <div className={`animate-spin rounded-full border-gray-300 border-t-blue-600 ${sizeClasses[size]}`} />
    </div>
  )
}

// Loading state for full page
export function PageLoadingState() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header skeleton */}
          <Card className="border-2 shadow-md">
            <CardContent className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <Skeleton className="h-16 w-16 rounded-display" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-10 w-96 rounded-surface" />
                  <Skeleton className="h-6 w-64 rounded-surface" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fecha selector skeleton */}
          <Card className="border-2 shadow-sm">
            <CardContent className="p-5">
              <Skeleton className="h-5 w-32 mb-3 rounded-surface" />
              <Skeleton className="h-11 w-80 rounded-surface" />
            </CardContent>
          </Card>

          {/* Content skeleton */}
          <ScheduleMatrixSkeleton />
        </div>
      </div>
    </div>
  )
}