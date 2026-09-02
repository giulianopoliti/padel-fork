import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Users, Clock, Star, Award, MapPin, ArrowRight, Building2 } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { getTopClubsForHome } from "@/app/api/users"
import { getStorageUrl } from "@/utils/storage-url"

export async function ClubsSection() {
  // OPTIMIZED: Get only top 3 clubs directly from DB
  const topClubs = await getTopClubsForHome(3)

  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Clubes que ya son parte del circuito</h2>
          <p className="text-slate-600">Estos clubes no solo organizan torneos: construyen comunidad y promueven el pádel amateur.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {topClubs.length > 0 ? (
            topClubs.map((club: any) => (
              <Card
                key={club.id}
                className="bg-white border-slate-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
              >
                <div className="relative h-48">
                  {club.coverImage ? (
                    <>
                      <Image
                        src={getStorageUrl(club.coverImage) || club.coverImage}
                        alt={club.name || "Club de pádel"}
                        width={400}
                        height={250}
                        className="w-full h-48 object-cover transition-transform duration-500 hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                    </>
                  ) : (
                    <>
                      {/* Placeholder cuando no hay imagen */}
                      <div className="absolute inset-0 bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800"></div>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
                        <Building2 className="h-12 w-12 sm:h-16 sm:w-16 mb-3 opacity-40" />
                        <p className="text-sm sm:text-base font-bold text-center line-clamp-3 opacity-90">
                          {club.name || "Club sin nombre"}
                        </p>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                    </>
                  )}

                  <div className="absolute top-3 left-3">
                    <Badge className="bg-white/90 text-slate-700 backdrop-blur-sm shadow-sm border-0">
                      <Star className="h-3 w-3 mr-1 fill-amber-400 text-amber-400" />
                      {club.rating > 0 ? club.rating : "Nuevo"}
                    </Badge>
                  </div>

                  <div className="absolute top-3 right-3">
                    <Badge className="bg-gradient-to-r from-slate-600 to-slate-800 text-white shadow-sm border-0">
                      <Award className="h-3 w-3 mr-1" />
                      Premium
                    </Badge>
                  </div>
                </div>

                <CardContent className="p-6 flex-1 flex flex-col">
                  <h3 className="text-xl font-bold text-slate-800 mb-2 hover:text-slate-600 transition-colors">
                    {club.name || "Club sin nombre"}
                  </h3>

                  <div className="flex items-center text-slate-500 text-sm mb-4">
                    <MapPin className="h-4 w-4 mr-2 flex-shrink-0 text-slate-400" />
                    <span className="font-medium truncate">{club.address || "Dirección no disponible"}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="flex items-center text-slate-600 text-sm bg-slate-50 rounded-surface p-3 border border-slate-100">
                      <Users className="h-4 w-4 mr-2 text-slate-500" />
                      <div>
                        <span className="block font-bold text-lg text-slate-800">{club.courts || 0}</span>
                        <span className="text-xs text-slate-500">pistas</span>
                      </div>
                    </div>
                    <div className="flex items-center text-slate-600 text-sm bg-slate-50 rounded-surface p-3 border border-slate-100">
                      <Clock className="h-4 w-4 mr-2 text-slate-500" />
                      <div>
                        <span className="block font-bold text-sm text-slate-800">
                          {club.opens_at && club.closes_at ? `${club.opens_at.slice(0, 5)}` : "8:00"}
                        </span>
                        <span className="text-xs text-slate-500">apertura</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    asChild
                    variant="ghost"
                    className="w-full justify-between text-blue-600 hover:text-blue-700 hover:bg-blue-50 mt-auto"
                  >
                    <Link href={`/clubes/${club.id}`}>
                      Ver detalles
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-3 text-center py-12">
              <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-medium text-gray-700 mb-2">No hay clubes registrados</h3>
              <p className="text-gray-500 max-w-md mx-auto">Próximamente tendremos los mejores clubes de pádel.</p>
            </div>
          )}
        </div>

        <div className="text-center mt-12">
          <Button asChild variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50 px-6 py-3">
            <Link href="/clubes">
              Ver Todos los Clubes
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
} 