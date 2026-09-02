import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Building2, Network, Trophy, ArrowRight, Users, Check } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { getOrganizationsForHome } from "@/app/api/users"
import { getStorageUrl } from "@/utils/storage-url"

/**
 * REDESIGNED VERSION of OrganizersSection
 * - Separates premium and non-premium organizations
 * - Premium: Large cards with cover image, logo, stats (up to 3)
 * - Non-premium: Compact logo-only cards (up to 6)
 * - Adaptive layout: Works with 1, 2, or 3 premium organizations
 */
export async function OrganizersSectionRedesign() {
  const { premium: premiumOrgs, nonPremium: nonPremiumOrgs } = await getOrganizationsForHome()

  // If no organizations at all, show empty state
  const hasAnyOrganizations = premiumOrgs.length > 0 || nonPremiumOrgs.length > 0

  return (
    <section className="py-16 bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-900 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.3),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(6,182,212,0.2),transparent_50%)]"></div>

      <div className="container mx-auto px-6 relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
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

        {hasAnyOrganizations ? (
          <>
            {/* PREMIUM ORGANIZATIONS SECTION */}
            {premiumOrgs.length > 0 && (
              <div
                className={`
                  grid gap-6 mb-12
                  ${premiumOrgs.length === 1
                    ? "grid-cols-1 max-w-2xl mx-auto"
                    : premiumOrgs.length === 2
                      ? "grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto"
                      : "grid-cols-1 md:grid-cols-3 max-w-6xl mx-auto"
                  }
                `}
              >
                {premiumOrgs.map((org: any) => (
                  <Card
                    key={org.id}
                    className="bg-white/95 backdrop-blur-sm border-white/20 shadow-xl hover:shadow-blue-500/20 transition-all duration-300 hover:scale-[1.01] overflow-hidden group"
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
                        priority={false}
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
            )}

            {/* DIVIDER (only show if we have both premium and non-premium) */}
            {premiumOrgs.length > 0 && nonPremiumOrgs.length > 0 && (
              <div className="max-w-6xl mx-auto mb-10">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/20"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-4 text-sm text-cyan-200 bg-slate-900/50 backdrop-blur-sm rounded-full border border-white/20">
                      Más organizaciones del circuito
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* NON-PREMIUM ORGANIZATIONS SECTION */}
            {nonPremiumOrgs.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
                {nonPremiumOrgs.map((org: any) => (
                  <Link
                    key={org.id}
                    href={`/organizations/${org.slug}`}
                    className="group block"
                  >
                    <Card className="bg-white border-slate-200 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.02] overflow-hidden min-h-[140px]">
                      {/* Single container with gradient background */}
                      <div className="relative h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-slate-100">

                        {/* Logo - Primary focus */}
                        <div className="relative mb-3 flex-shrink-0">
                          {org.logoUrl ? (
                            <div className="w-16 h-16 rounded-surface bg-white shadow-md border-2 border-slate-200 overflow-hidden group-hover:border-blue-400 transition-colors">
                              <Image
                                src={getStorageUrl(org.logoUrl)}
                                alt={org.name || "Organización"}
                                width={64}
                                height={64}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          ) : (
                            <div className="w-16 h-16 rounded-surface bg-gradient-to-br from-slate-300 to-slate-400 shadow-md border-2 border-slate-200 flex items-center justify-center">
                              <Building2 className="h-8 w-8 text-white" />
                            </div>
                          )}

                          {/* Small verified badge */}
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        </div>

                        {/* Organization Name - Mostrar completo */}
                        <h4 className="text-xs sm:text-sm font-semibold text-slate-800 text-center leading-tight px-1 group-hover:text-blue-600 transition-colors">
                          {org.name || "Organización"}
                        </h4>

                        {/* Subtle hover indicator */}
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400 mt-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          /* EMPTY STATE */
          <div className="text-center py-12">
            <div className="bg-white/10 backdrop-blur-sm w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white/20">
              <Building2 className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">No hay organizaciones registradas</h3>
            <p className="text-cyan-100 max-w-md mx-auto text-sm">
              Próximamente tendremos organizaciones líderes en la gestión de torneos.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
