export function RankingSkeleton() {
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto mb-4 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto animate-pulse" />
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="border border-slate-200 shadow-lg rounded-surface overflow-hidden">
            <div className="bg-slate-900 text-white p-4">
              <div className="h-6 bg-slate-700 rounded w-1/3 animate-pulse" />
            </div>

            <div className="divide-y divide-slate-100">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="p-4 flex items-center justify-between animate-pulse">
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-gray-200 rounded-full" />
                    <div className="w-10 h-10 bg-gray-200 rounded-full" />
                    <div>
                      <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-24" />
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="h-4 bg-gray-200 rounded w-12 mb-1" />
                      <div className="h-3 bg-gray-200 rounded w-16" />
                    </div>
                    <div className="h-6 bg-gray-200 rounded w-12" />
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-50 border-t">
              <div className="h-10 bg-gray-200 rounded w-full animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
} 