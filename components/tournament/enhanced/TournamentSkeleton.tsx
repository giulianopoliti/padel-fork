'use client'

import React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface TournamentSkeletonProps {
  layout?: 'bracket' | 'list' | 'grid'
  count?: number
  showHeader?: boolean
  className?: string
}

const BracketSkeleton = () => (
  <div className="w-full space-y-6">
    {/* Header skeleton */}
    <div className="text-center space-y-3">
      <Skeleton className="h-8 w-64 mx-auto bg-gradient-to-r from-slate-200 to-slate-100" />
      <div className="flex items-center justify-center gap-4">
        <Skeleton className="h-6 w-24 bg-gradient-to-r from-blue-200 to-blue-100" />
        <Skeleton className="h-4 w-32 bg-gradient-to-r from-slate-200 to-slate-100" />
      </div>
    </div>

    {/* Bracket columns skeleton */}
    <div className="flex gap-6 overflow-x-auto pb-4">
      {[1, 2, 3, 4].map((column) => (
        <div key={column} className="flex-shrink-0 min-w-[280px] space-y-4">
          {/* Column header */}
          <div className="text-center space-y-2">
            <Skeleton className="h-6 w-20 mx-auto bg-gradient-to-r from-slate-300 to-slate-200" />
            <Skeleton className="h-3 w-16 mx-auto bg-gradient-to-r from-slate-200 to-slate-100" />
          </div>

          {/* Match cards */}
          <div className="space-y-3">
            {[1, 2].map((match) => (
              <Card key={match} className="overflow-hidden border border-slate-200 bg-white/60 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-5 w-16 bg-gradient-to-r from-slate-800 to-slate-700" />
                    <Skeleton className="h-5 w-20 bg-gradient-to-r from-yellow-200 to-yellow-100" />
                  </div>
                </CardHeader>
                <CardContent className="pt-2 pb-3 px-3 space-y-3">
                  {/* Couple 1 */}
                  <div className="p-3 rounded-surface bg-slate-50/80 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-full bg-gradient-to-r from-slate-300 to-slate-200" />
                      <Skeleton className="h-4 w-24 bg-gradient-to-r from-slate-300 to-slate-200" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-full bg-gradient-to-r from-slate-300 to-slate-200" />
                      <Skeleton className="h-4 w-28 bg-gradient-to-r from-slate-300 to-slate-200" />
                    </div>
                  </div>

                  {/* VS divider */}
                  <div className="text-center">
                    <Skeleton className="h-5 w-8 mx-auto bg-gradient-to-r from-slate-200 to-slate-100" />
                  </div>

                  {/* Couple 2 */}
                  <div className="p-3 rounded-surface bg-slate-50/80 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-full bg-gradient-to-r from-slate-300 to-slate-200" />
                      <Skeleton className="h-4 w-20 bg-gradient-to-r from-slate-300 to-slate-200" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-full bg-gradient-to-r from-slate-300 to-slate-200" />
                      <Skeleton className="h-4 w-32 bg-gradient-to-r from-slate-300 to-slate-200" />
                    </div>
                  </div>
                </CardContent>

                {/* Glassmorphism overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-50/10 animate-pulse" />
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
)

const ListSkeleton = ({ count = 6 }: { count: number }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, index) => (
      <Card key={index} className="overflow-hidden border border-slate-200 bg-white/60 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {/* Left side - players */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full bg-gradient-to-r from-slate-300 to-slate-200" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-24 bg-gradient-to-r from-slate-300 to-slate-200" />
                  <Skeleton className="h-3 w-32 bg-gradient-to-r from-slate-200 to-slate-100" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full bg-gradient-to-r from-slate-300 to-slate-200" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-28 bg-gradient-to-r from-slate-300 to-slate-200" />
                  <Skeleton className="h-3 w-20 bg-gradient-to-r from-slate-200 to-slate-100" />
                </div>
              </div>
            </div>

            {/* Center - VS */}
            <div className="px-4">
              <Skeleton className="h-6 w-8 bg-gradient-to-r from-slate-200 to-slate-100" />
            </div>

            {/* Right side - status and score */}
            <div className="flex-1 text-right space-y-2">
              <Skeleton className="h-5 w-20 ml-auto bg-gradient-to-r from-blue-200 to-blue-100" />
              <Skeleton className="h-8 w-16 ml-auto bg-gradient-to-r from-slate-300 to-slate-200" />
            </div>
          </div>
        </CardContent>

        {/* Animated shimmer effect */}
        <div className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
      </Card>
    ))}
  </div>
)

const GridSkeleton = ({ count = 9 }: { count: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, index) => (
      <Card key={index} className="overflow-hidden border border-slate-200 bg-white/60 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <Skeleton className="h-5 w-16 bg-gradient-to-r from-slate-800 to-slate-700" />
            <Skeleton className="h-5 w-20 bg-gradient-to-r from-yellow-200 to-yellow-100" />
          </div>
        </CardHeader>
        <CardContent className="pt-2 space-y-4">
          {/* Players */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full bg-gradient-to-r from-slate-300 to-slate-200" />
              <Skeleton className="h-4 w-20 bg-gradient-to-r from-slate-300 to-slate-200" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full bg-gradient-to-r from-slate-300 to-slate-200" />
              <Skeleton className="h-4 w-24 bg-gradient-to-r from-slate-300 to-slate-200" />
            </div>
          </div>

          {/* VS */}
          <div className="text-center">
            <Skeleton className="h-4 w-6 mx-auto bg-gradient-to-r from-slate-200 to-slate-100" />
          </div>

          {/* More players */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full bg-gradient-to-r from-slate-300 to-slate-200" />
              <Skeleton className="h-4 w-28 bg-gradient-to-r from-slate-300 to-slate-200" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full bg-gradient-to-r from-slate-300 to-slate-200" />
              <Skeleton className="h-4 w-16 bg-gradient-to-r from-slate-300 to-slate-200" />
            </div>
          </div>
        </CardContent>

        {/* Floating shimmer */}
        <div className="absolute top-0 right-0 w-4 h-4 bg-gradient-to-br from-blue-200/50 to-transparent animate-bounce" />
      </Card>
    ))}
  </div>
)

export default function TournamentSkeleton({
  layout = 'bracket',
  count = 6,
  showHeader = true,
  className
}: TournamentSkeletonProps) {
  return (
    <div className={cn('w-full', className)}>
      {/* Optional global header */}
      {showHeader && layout !== 'bracket' && (
        <div className="mb-6 space-y-3">
          <Skeleton className="h-8 w-48 bg-gradient-to-r from-slate-900 to-slate-800" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-24 bg-gradient-to-r from-blue-200 to-blue-100" />
            <Skeleton className="h-4 w-32 bg-gradient-to-r from-slate-200 to-slate-100" />
          </div>
        </div>
      )}

      {/* Layout-specific skeletons */}
      {layout === 'bracket' && <BracketSkeleton />}
      {layout === 'list' && <ListSkeleton count={count} />}
      {layout === 'grid' && <GridSkeleton count={count} />}

      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/5 rounded-full animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-slate-500/5 rounded-full animate-pulse delay-1000" />
      </div>
    </div>
  )
}