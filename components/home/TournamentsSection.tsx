import { Button } from "@/components/ui/button"
import { Calendar, ArrowRight } from "lucide-react"
import Link from "next/link"
import { getUpcomingTournamentsForHome, getCategories } from "@/app/api/tournaments"
import TournamentCard from "@/components/tournament-card"

export async function TournamentsSection() {
  const [upcomingTournaments, categories] = await Promise.all([
    getUpcomingTournamentsForHome(3), // OPTIMIZED: Get only 3 upcoming tournaments directly from DB
    getCategories(),
  ])

  // Data is already filtered and limited from DB

  return (
    <section className="py-24 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Torneos Disponibles</h2>
          <p className="text-slate-600">Inscribite online en segundos, sin grupos de WhatsApp</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {upcomingTournaments.length > 0 ? (
            upcomingTournaments.map((tournament: any) => (
              <TournamentCard key={tournament.id} tournament={tournament} categories={categories} />
            ))
          ) : (
            <div className="col-span-3 text-center py-12">
              <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-medium text-gray-700 mb-2">No hay próximos torneos</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                No hay próximos torneos disponibles en este momento. Vuelve a consultar más tarde.
              </p>
            </div>
          )}
        </div>

        <div className="text-center mt-12">
          <Button asChild variant="outline" className="border-gray-400 text-gray-700 hover:bg-gray-200 px-6 py-3">
            <Link href="/torneos">
              Ver Todos los Torneos
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
