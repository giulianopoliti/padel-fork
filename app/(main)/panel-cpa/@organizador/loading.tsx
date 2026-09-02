import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"

export default function OrganizadorLoading() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-surface" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Tournament Cards Skeleton */}
      <div className="grid gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-l-4 border-l-gray-200 overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-col md:flex-row gap-0">
                {/* Image Skeleton */}
                <div className="relative w-full md:w-64 md:min-h-[180px] flex-shrink-0">
                  <Skeleton className="w-full h-[180px] md:h-full rounded-none" />
                </div>

                {/* Content Skeleton */}
                <div className="flex-1 p-5 md:p-6 space-y-4">
                  {/* Title */}
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <div className="flex gap-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 gap-4">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="flex flex-col items-center p-3 bg-muted/50 rounded-surface">
                        <Skeleton className="h-5 w-5 mb-2" />
                        <Skeleton className="h-7 w-12 mb-1" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))}
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-3 w-8" />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator className="my-8" />

      {/* Players Section Skeleton */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-surface" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-9 w-28" />
        </div>

        {/* Table Skeleton */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {/* Table Header */}
              <div className="bg-muted/50 border-b">
                <div className="flex items-center h-12 px-4">
                  <Skeleton className="h-4 w-8 mr-8" />
                  <Skeleton className="h-4 w-32 mr-8" />
                  <Skeleton className="h-4 w-24 mr-8" />
                  <Skeleton className="h-4 w-28 mr-8" />
                  <Skeleton className="h-4 w-20 mr-8" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>

              {/* Table Rows */}
              <div className="divide-y">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center h-16 px-4">
                    <Skeleton className="h-4 w-6 mr-8" />
                    <div className="flex items-center gap-3 mr-8">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <Skeleton className="h-5 w-32" />
                    </div>
                    <Skeleton className="h-4 w-24 mr-8" />
                    <Skeleton className="h-4 w-28 mr-8" />
                    <Skeleton className="h-5 w-16 mr-8" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
