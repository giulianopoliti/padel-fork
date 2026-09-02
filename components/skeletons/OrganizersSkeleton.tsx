/**
 * Skeleton for OrganizersSectionRedesign
 * Shows 3 premium card skeletons + 6 non-premium card skeletons
 */
export function OrganizersSkeleton() {
  return (
    <section className="py-16 bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-900 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.3),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(6,182,212,0.2),transparent_50%)]"></div>

      <div className="container mx-auto px-6 relative z-10">
        {/* Header Skeleton */}
        <div className="text-center mb-12">
          <div className="h-6 bg-white/20 rounded-full w-48 mx-auto mb-3 animate-pulse" />
          <div className="h-8 bg-white/20 rounded w-96 mx-auto mb-3 animate-pulse" />
          <div className="h-4 bg-white/10 rounded w-64 mx-auto animate-pulse" />
        </div>

        {/* PREMIUM CARDS SKELETON - 3 cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-12">
          {[...Array(3)].map((_, i) => (
            <div key={`premium-${i}`} className="bg-white/95 backdrop-blur-sm rounded-surface overflow-hidden shadow-xl animate-pulse">
              {/* Cover Image Placeholder */}
              <div className="h-48 bg-gradient-to-br from-slate-300 to-blue-300 relative">
                {/* Logo Placeholder - Centered */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <div className="w-24 h-24 rounded-elevated bg-white/70 shadow-2xl border-3 border-white" />
                </div>
                {/* Premium Badge Placeholder */}
                <div className="absolute top-3 right-3">
                  <div className="h-6 w-20 bg-amber-300 rounded" />
                </div>
              </div>

              {/* Content Placeholder */}
              <div className="p-5">
                {/* Title */}
                <div className="h-6 bg-gray-200 rounded w-3/4 mx-auto mb-3 animate-pulse" />

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-surface p-3 border border-blue-200">
                    <div className="h-4 w-4 bg-blue-300 rounded-full mx-auto mb-1.5 animate-pulse" />
                    <div className="h-6 bg-blue-300 rounded w-8 mx-auto mb-1 animate-pulse" />
                    <div className="h-2 bg-blue-300 rounded w-12 mx-auto animate-pulse" />
                  </div>
                  <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-surface p-3 border border-cyan-200">
                    <div className="h-4 w-4 bg-cyan-300 rounded-full mx-auto mb-1.5 animate-pulse" />
                    <div className="h-6 bg-cyan-300 rounded w-8 mx-auto mb-1 animate-pulse" />
                    <div className="h-2 bg-cyan-300 rounded w-12 mx-auto animate-pulse" />
                  </div>
                  <div className="bg-gradient-to-br from-sky-50 to-sky-100 rounded-surface p-3 border border-sky-200">
                    <div className="h-4 w-4 bg-sky-300 rounded-full mx-auto mb-1.5 animate-pulse" />
                    <div className="h-6 bg-sky-300 rounded w-8 mx-auto mb-1 animate-pulse" />
                    <div className="h-2 bg-sky-300 rounded w-12 mx-auto animate-pulse" />
                  </div>
                </div>

                {/* Button */}
                <div className="h-10 bg-gradient-to-r from-blue-200 to-cyan-200 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* DIVIDER */}
        <div className="max-w-6xl mx-auto mb-10">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/20"></div>
            </div>
            <div className="relative flex justify-center">
              <div className="h-6 w-48 bg-slate-700/50 rounded-full animate-pulse" />
            </div>
          </div>
        </div>

        {/* NON-PREMIUM CARDS SKELETON - 6 cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {[...Array(6)].map((_, i) => (
            <div key={`non-premium-${i}`} className="bg-white rounded-surface shadow-md h-[140px] animate-pulse">
              <div className="h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-100 to-slate-200">
                {/* Logo Placeholder */}
                <div className="relative mb-3">
                  <div className="w-16 h-16 rounded-surface bg-slate-300" />
                  {/* Badge Placeholder */}
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-400 rounded-full" />
                </div>

                {/* Name Placeholder */}
                <div className="h-4 bg-slate-300 rounded w-24 mb-1 animate-pulse" />
                <div className="h-4 bg-slate-300 rounded w-20 animate-pulse" />

                {/* Arrow Placeholder */}
                <div className="h-3.5 w-3.5 bg-slate-300 rounded mt-2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
