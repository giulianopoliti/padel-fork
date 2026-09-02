export function BracketDemoSkeleton() {
  return (
    <section className="py-24 bg-gradient-to-br from-slate-50 to-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <div className="h-10 bg-gray-200 rounded w-2/3 mx-auto mb-4 animate-pulse" />
          <div className="h-6 bg-gray-200 rounded w-1/2 mx-auto animate-pulse" />
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Navigation buttons skeleton */}
          <div className="flex justify-center gap-4 mb-8">
            <div className="h-12 bg-gray-200 rounded w-32 animate-pulse" />
            <div className="h-12 bg-gray-200 rounded w-32 animate-pulse" />
          </div>

          {/* Main bracket/zones content skeleton */}
          <div className="bg-white rounded-surface shadow-lg p-8 border border-slate-200">
            <div className="min-h-[500px] flex items-center justify-center">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                {/* Zone/Bracket cards skeleton */}
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-gray-50 rounded-surface p-6 animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-24 mb-4" />
                    <div className="space-y-3">
                      {[...Array(4)].map((_, j) => (
                        <div key={j} className="h-4 bg-gray-200 rounded w-full" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom text skeleton */}
          <div className="text-center mt-8">
            <div className="h-4 bg-gray-200 rounded w-1/3 mx-auto animate-pulse" />
          </div>
        </div>
      </div>
    </section>
  )
} 