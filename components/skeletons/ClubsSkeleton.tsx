export function ClubsSkeleton() {
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto mb-4 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto animate-pulse" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 shadow-lg rounded-surface overflow-hidden animate-pulse">
              <div className="h-48 bg-gray-200" />
              <div className="p-6">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-50 rounded-surface p-3 border border-slate-100">
                    <div className="h-6 bg-gray-200 rounded w-8 mb-1" />
                    <div className="h-3 bg-gray-200 rounded w-12" />
                  </div>
                  <div className="bg-slate-50 rounded-surface p-3 border border-slate-100">
                    <div className="h-4 bg-gray-200 rounded w-12 mb-1" />
                    <div className="h-3 bg-gray-200 rounded w-16" />
                  </div>
                </div>
                <div className="h-10 bg-gray-200 rounded w-full" />
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <div className="h-10 bg-gray-200 rounded w-48 mx-auto animate-pulse" />
        </div>
      </div>
    </section>
  )
} 