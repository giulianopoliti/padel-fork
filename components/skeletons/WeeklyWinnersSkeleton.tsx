export function WeeklyWinnersSkeleton() {
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <div className="h-8 bg-gray-200 rounded w-20 mx-auto mb-6 animate-pulse" />
          <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto mb-4 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto animate-pulse" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 shadow-lg rounded-surface overflow-hidden animate-pulse">
              <div className="h-64 bg-gray-200" />
              <div className="p-6">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-full" />
                  <div className="w-12 h-12 bg-gray-200 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
} 