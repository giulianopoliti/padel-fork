import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Building2, Network, Trophy, ArrowRight, Users } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { getTopOrganizersForHome } from "@/app/api/users"
import { getStorageUrl } from "@/utils/storage-url"

/**
 * COMPACT VERSION of OrganizersSection
 * - Smaller cards in grid layout
 * - Less information displayed
 * - More space-efficient
 */
export async function OrganizersSectionCompact() {
  const topOrganizers = await getTopOrganizersForHome(3)

  return (
    <section className="py-12 bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-900 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.3),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(6,182,212,0.2),transparent_50%)]"></div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-8">
          <Badge className="mb-3 bg-gradient-to-r from-amber-400 to-amber-600 text-white border-0 px-3 py-1 text-xs font-semibold shadow-md">
            <Building2 className="h-3 w-3 mr-1" />
            ORGANIZACIONES PREMIUM
          </Badge>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 tracking-tight">
            Líderes que Impulsan el Circuito
          </h2>
          <p className="text-sm text-cyan-100 max-w-2xl mx-auto">
            Redes profesionales que gestionan clubes y torneos
          </p>
        </div>

        {topOrganizers.length > 0 ? (
          topOrganizers.length === 1 ? (
            // Si hay solo 1 organización, centrarla con ancho máximo
            <div className="max-w-2xl mx-auto">
              {topOrganizers.map((org: any) => (
                <Card
                  key={org.id}
                  className="bg-white/95 backdrop-blur-sm border-white/20 shadow-xl hover:shadow-blue-500/20 transition-all duration-300 hover:scale-[1.02] overflow-hidden group"
                >
                  {/* Cover Image Background */}
                  <div className="relative h-48 overflow-hidden">
                    <Image
                      src={
                        getStorageUrl(org.coverImage) ||
                        "https://vulusxqgknaejdxnhiex.supabase.co/storage/v1/object/public/imagenes/prueba/cancha%20prueba.jpg"
                      }
                      alt={`${org.name || "Organización"} - Cover`}
                      width={500}
                      height={192}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Dark overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900/70 via-blue-900/60 to-cyan-900/50"></div>

                    {/* Centered Logo */}
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                      {org.logoUrl ? (
                        <div className="w-24 h-24 rounded-elevated bg-white shadow-2xl border-3 border-white overflow-hidden ring-4 ring-blue-400/50">
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
                        <div className="w-24 h-24 rounded-elevated bg-gradient-to-br from-blue-600 to-cyan-600 shadow-2xl border-3 border-white flex items-center justify-center ring-4 ring-blue-400/50">
                          <Building2 className="h-12 w-12 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Premium Badge - Top Right */}
                    <div className="absolute top-3 right-3">
                      <Badge className="bg-gradient-to-r from-amber-400 to-amber-600 text-white border-0 shadow-lg text-xs px-2 py-1">
                        <Network className="h-3 w-3 mr-1" />
                        Premium
                      </Badge>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    {/* Title */}
                    <h3 className="text-xl font-bold text-slate-900 mb-3 text-center group-hover:text-blue-700 transition-colors">
                      {org.name || "Organización sin nombre"}
                    </h3>

                    {/* Stats - Grid */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-surface p-3 text-center border border-blue-200">
                        <Network className="h-4 w-4 text-blue-600 mx-auto mb-1.5" />
                        <div className="text-2xl font-bold text-blue-900">{org.clubCount}</div>
                        <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Clubes</div>
                      </div>
                      <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-surface p-3 text-center border border-cyan-200">
                        <Trophy className="h-4 w-4 text-cyan-600 mx-auto mb-1.5" />
                        <div className="text-2xl font-bold text-cyan-900">{org.tournamentCount}</div>
                        <div className="text-[10px] font-semibold text-cyan-600 uppercase tracking-wide">Torneos</div>
                      </div>
                      <div className="bg-gradient-to-br from-sky-50 to-sky-100 rounded-surface p-3 text-center border border-sky-200">
                        <Users className="h-4 w-4 text-sky-600 mx-auto mb-1.5" />
                        <div className="text-2xl font-bold text-sky-900">{org.clubCount * 20}+</div>
                        <div className="text-[10px] font-semibold text-sky-600 uppercase tracking-wide">Jugadores</div>
                      </div>
                    </div>

                    {/* CTA Button */}
                    <Button
                      size="default"
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-md hover:shadow-lg transition-all duration-300"
                      asChild
                    >
                      <Link href={`/organizations/${org.slug}`}>
                        <span className="text-sm">Conocer Organización</span>
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            // Si hay 2 o más organizaciones, usar grid de 2 columnas
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
              {topOrganizers.map((org: any) => (
                <Card
                  key={org.id}
                  className="bg-white/95 backdrop-blur-sm border-white/20 shadow-xl hover:shadow-blue-500/20 transition-all duration-300 hover:scale-[1.02] overflow-hidden group"
                >
                {/* Cover Image Background */}
                <div className="relative h-48 overflow-hidden">
                  <Image
                    src={
                      getStorageUrl(org.coverImage) ||
                      "https://vulusxqgknaejdxnhiex.supabase.co/storage/v1/object/public/imagenes/prueba/cancha%20prueba.jpg"
                    }
                    alt={`${org.name || "Organización"} - Cover`}
                    width={500}
                    height={192}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* Dark overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-900/70 via-blue-900/60 to-cyan-900/50"></div>

                  {/* Centered Logo */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    {org.logoUrl ? (
                      <div className="w-24 h-24 rounded-elevated bg-white shadow-2xl border-3 border-white overflow-hidden ring-4 ring-blue-400/50">
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
                      <div className="w-24 h-24 rounded-elevated bg-gradient-to-br from-blue-600 to-cyan-600 shadow-2xl border-3 border-white flex items-center justify-center ring-4 ring-blue-400/50">
                        <Building2 className="h-12 w-12 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Premium Badge - Top Right */}
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-gradient-to-r from-amber-400 to-amber-600 text-white border-0 shadow-lg text-xs px-2 py-1">
                      <Network className="h-3 w-3 mr-1" />
                      Premium
                    </Badge>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  {/* Title */}
                  <h3 className="text-xl font-bold text-slate-900 mb-3 text-center group-hover:text-blue-700 transition-colors">
                    {org.name || "Organización sin nombre"}
                  </h3>

                  {/* Stats - Grid */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-surface p-3 text-center border border-blue-200">
                      <Network className="h-4 w-4 text-blue-600 mx-auto mb-1.5" />
                      <div className="text-2xl font-bold text-blue-900">{org.clubCount}</div>
                      <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Clubes</div>
                    </div>
                    <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-surface p-3 text-center border border-cyan-200">
                      <Trophy className="h-4 w-4 text-cyan-600 mx-auto mb-1.5" />
                      <div className="text-2xl font-bold text-cyan-900">{org.tournamentCount}</div>
                      <div className="text-[10px] font-semibold text-cyan-600 uppercase tracking-wide">Torneos</div>
                    </div>
                    <div className="bg-gradient-to-br from-sky-50 to-sky-100 rounded-surface p-3 text-center border border-sky-200">
                      <Users className="h-4 w-4 text-sky-600 mx-auto mb-1.5" />
                      <div className="text-2xl font-bold text-sky-900">{org.clubCount * 20}+</div>
                      <div className="text-[10px] font-semibold text-sky-600 uppercase tracking-wide">Jugadores</div>
                    </div>
                  </div>

                  {/* CTA Button */}
                  <Button
                    size="default"
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-md hover:shadow-lg transition-all duration-300"
                    asChild
                  >
                    <Link href={`/organizations/${org.slug}`}>
                      <span className="text-sm">Conocer Organización</span>
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
            </div>
          )
        ) : (
          <div className="text-center py-12">
            <div className="bg-white/10 backdrop-blur-sm w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white/20">
              <Building2 className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">No hay organizaciones registradas</h3>
            <p className="text-purple-200 max-w-md mx-auto text-sm">
              Próximamente tendremos organizaciones líderes en la gestión de torneos.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
