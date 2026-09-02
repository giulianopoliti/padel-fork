import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Network, Trophy, ArrowRight, Users, Phone, Mail, Star, MapPin, Clock } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { getTopOrganizersForHome } from "@/app/api/users"
import { getStorageUrl } from "@/utils/storage-url"

export async function OrganizersSection() {
  // OPTIMIZED: Get only top 3 organizations directly from DB
  const topOrganizers = await getTopOrganizersForHome(3)

  return (
    <section className="py-16 bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-900 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.3),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(6,182,212,0.2),transparent_50%)]"></div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-gradient-to-r from-amber-400 to-amber-600 text-white border-0 px-4 py-1.5 text-xs font-semibold shadow-md">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />
            ORGANIZACIONES PREMIUM
          </Badge>
          <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">
            Líderes que Impulsan el Circuito
          </h2>
          <p className="text-base text-cyan-100 max-w-2xl mx-auto leading-relaxed">
            Redes profesionales que gestionan clubes y torneos para el desarrollo del pádel amateur
          </p>
        </div>

        <div className="space-y-5 max-w-5xl mx-auto">
          {topOrganizers.length > 0 ? (
            topOrganizers.map((org: any) => (
              <Card
                key={org.id}
                className="bg-white/95 backdrop-blur-sm border-white/20 shadow-xl hover:shadow-blue-500/20 transition-all duration-300 hover:scale-[1.01] overflow-hidden group"
              >
                <div className="flex flex-col md:flex-row">
                  {/* LEFT SIDE: Logo Section with Cover Image Background */}
                  <div className="md:w-56 relative overflow-hidden">
                    {/* Cover Image Background */}
                    <div className="absolute inset-0">
                      <Image
                        src={
                          getStorageUrl(org.coverImage) ||
                          "https://vulusxqgknaejdxnhiex.supabase.co/storage/v1/object/public/imagenes/prueba/cancha%20prueba.jpg?height=400&width=320"
                        }
                        alt={`${org.name || "Organización"} - Cover`}
                        width={224}
                        height={300}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {/* Dark overlay for better logo visibility */}
                      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-blue-900/70 to-cyan-900/60"></div>
                    </div>

                    {/* Logo Container - Floating over cover image */}
                    <div className="relative z-10 p-5 flex items-center justify-center h-full min-h-[200px]">
                      <div className="relative">
                        {org.logoUrl ? (
                          <div className="w-24 h-24 rounded-elevated bg-white shadow-xl border-3 border-white overflow-hidden ring-2 ring-blue-400/40">
                            <Image
                              src={getStorageUrl(org.logoUrl) || "/placeholder.svg"}
                              alt={`${org.name} - Logo`}
                              width={96}
                              height={96}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="w-24 h-24 rounded-elevated bg-gradient-to-br from-blue-600 to-cyan-600 shadow-xl border-3 border-white flex items-center justify-center ring-2 ring-blue-400/40">
                            <Building2 className="h-12 w-12 text-white" />
                          </div>
                        )}

                        {/* Floating Badge */}
                        <div className="absolute -top-1 -right-1">
                          <Badge className="bg-gradient-to-r from-amber-400 to-amber-600 text-white border-0 shadow-md text-xs px-2 py-0.5">
                            <Network className="h-2.5 w-2.5 mr-1" />
                            Premium
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT SIDE: Content Section */}
                  <div className="flex-1 p-5">
                    {/* Header */}
                    <div className="mb-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="text-2xl font-bold text-slate-900 mb-1.5 group-hover:text-blue-700 transition-colors">
                            {org.name || "Organización sin nombre"}
                          </h3>

                          {/* Description */}
                          {org.description && (
                            <p className="text-slate-600 text-sm leading-relaxed mb-2">
                              {org.description}
                            </p>
                          )}

                          {/* Responsible */}
                          {org.responsibleName && (
                            <div className="flex items-center text-slate-500 text-xs">
                              <Users className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                              <span className="font-semibold">Responsable:</span>
                              <span className="ml-1">{org.responsibleName}</span>
                            </div>
                          )}
                        </div>

                        {/* Type Badge */}
                        <Badge className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-0 shadow-sm ml-3 text-xs px-2.5 py-0.5">
                          <Building2 className="h-3 w-3 mr-1" />
                          Organización
                        </Badge>
                      </div>

                      {/* Contact Info Row */}
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        {org.phone && (
                          <div className="flex items-center">
                            <Phone className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                            <span>{org.phone}</span>
                          </div>
                        )}
                        {org.email && (
                          <div className="flex items-center">
                            <Mail className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                            <span>{org.email}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stats Grid - More compact */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {/* Clubs Count */}
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-surface p-3 border border-blue-200">
                        <div className="flex items-center justify-center mb-1.5">
                          <Network className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-900">{org.clubCount}</div>
                          <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Clubes</div>
                        </div>
                      </div>

                      {/* Tournaments Count */}
                      <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-surface p-3 border border-cyan-200">
                        <div className="flex items-center justify-center mb-1.5">
                          <Trophy className="h-4 w-4 text-cyan-600" />
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-cyan-900">{org.tournamentCount}</div>
                          <div className="text-[10px] font-semibold text-cyan-600 uppercase tracking-wide">Torneos</div>
                        </div>
                      </div>

                      {/* Players Count (calculated from clubs) */}
                      <div className="bg-gradient-to-br from-sky-50 to-sky-100 rounded-surface p-3 border border-sky-200">
                        <div className="flex items-center justify-center mb-1.5">
                          <Users className="h-4 w-4 text-sky-600" />
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-sky-900">{org.clubCount * 20}+</div>
                          <div className="text-[10px] font-semibold text-sky-600 uppercase tracking-wide">Jugadores</div>
                        </div>
                      </div>
                    </div>

                    {/* Featured Club Section */}
                    {org.featuredClub && (
                      <div className="mb-4 p-3 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-control border border-amber-200">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Star className="h-3.5 w-3.5 text-amber-600 fill-amber-500" />
                          <h4 className="font-semibold text-sm text-amber-900">Club Destacado</h4>
                        </div>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center gap-2 text-amber-800">
                            <Building2 className="h-3.5 w-3.5" />
                            <span className="font-semibold">{org.featuredClub.name}</span>
                          </div>
                          {org.featuredClub.address && (
                            <div className="flex items-center gap-2 text-amber-700">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>{org.featuredClub.address}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-amber-700">
                            {org.featuredClub.courts && (
                              <div className="flex items-center gap-1">
                                <Users className="h-3.5 w-3.5" />
                                <span>{org.featuredClub.courts} canchas</span>
                              </div>
                            )}
                            {org.featuredClub.opensAt && org.featuredClub.closesAt && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                <span>{org.featuredClub.opensAt} - {org.featuredClub.closesAt}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CTA Button - Standard size */}
                    <Button
                      size="default"
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-md hover:shadow-lg transition-all duration-300"
                      asChild
                    >
                      <Link href={`/organizations/${org.slug}`}>
                        <span className="mr-2">Conocer Organización</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-12">
              <div className="bg-white/10 backdrop-blur-sm w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white/20">
                <Building2 className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No hay organizaciones registradas</h3>
              <p className="text-purple-200 max-w-md mx-auto text-sm">
                Próximamente tendremos organizaciones líderes en la gestión de torneos.
              </p>
            </div>
          )}
        </div>

        {/* View All Button - Hidden if no organizers */}
        {topOrganizers.length > 0 && (
          <div className="text-center mt-10">
            <Button
              size="default"
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 px-6 py-2 cursor-not-allowed opacity-60 backdrop-blur-sm"
              disabled
            >
              Ver Todas las Organizaciones
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
