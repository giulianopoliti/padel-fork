import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Globe,
  ImageIcon,
  Instagram,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Star,
  Trophy,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getTenantBranding } from "@/config/tenant"
import { getClubDetails, getClubPlayersForRanking } from "@/app/api/users"
import { PublicTournamentCards } from "@/components/tournaments/public-tournament-cards"
import PlayerAvatar from "@/components/player-avatar"
import ContactButton from "./contact-button"
import { buildGoogleMapsSearchUrl } from "@/lib/maps/google-maps"

const ClubGallery = ({ images }: { images: string[] }) => (
  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
    {images.map((image, index) => (
      <div key={index} className="aspect-square overflow-hidden rounded-display border border-white/10 bg-white/5">
        <img
          src={image || "/placeholder.svg"}
          alt={`Imagen ${index + 1}`}
          className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
        />
      </div>
    ))}
  </div>
)

const formatWebsiteHref = (website: string | null) => {
  if (!website) return null
  return website.startsWith("http://") || website.startsWith("https://") ? website : `https://${website}`
}

const getMedalIcon = (index: number) => {
  if (index === 0) return <Trophy className="h-4 w-4 text-amber-400" />
  if (index === 1) return <Award className="h-4 w-4 text-slate-300" />
  return <Star className="h-4 w-4 text-orange-300" />
}

export default async function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const branding = getTenantBranding()
  const isElite = branding.key === "padel-elite"

  const [club, playersData] = await Promise.all([getClubDetails(id), getClubPlayersForRanking(id)])

  if (!club) {
    notFound()
  }

  const totalPlayers = playersData.length
  const topPlayers = playersData.slice(0, 3)
  const galleryImages = Array.isArray(club.galleryImages) ? club.galleryImages.filter(Boolean) : []
  const tournamentsHref = "/torneos"
  const websiteHref = formatWebsiteHref(club.website)
  const mapsHref = club.maps_url || buildGoogleMapsSearchUrl({
    name: club.name,
    address: club.address,
    formattedAddress: club.formatted_address,
    googlePlaceId: club.google_place_id,
    latitude: club.latitude,
    longitude: club.longitude,
  })
  const heroImage = club.coverImage || null
  const hasHeroImage = Boolean(heroImage)
  const showPlayersHighlights = totalPlayers > 0
  const showReviewHighlights = club.reviewCount > 0 && club.rating > 0
  const heroHeightClassName = hasHeroImage ? "h-72 sm:h-80 lg:h-[24rem]" : "h-52 sm:h-56 lg:h-64"

  const pageClassName = isElite
    ? "tpe-page min-h-screen pb-16 text-[var(--tpe-night)]"
    : "min-h-screen bg-[linear-gradient(180deg,#162545_0%,#192b50_42%,#152340_100%)] pb-16 text-white"
  const shellClassName = isElite
    ? "rounded-[2rem] border border-white/60 bg-white/72 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur"
    : "rounded-[2rem] border border-white/10 bg-[#1b2d52]/78 shadow-sm backdrop-blur-sm"
  const secondaryShellClassName = isElite
    ? "rounded-[1.75rem] border border-slate-200 bg-white"
    : "rounded-[1.75rem] border border-white/10 bg-white/5"
  const subtleTextClassName = isElite ? "text-slate-600" : "text-slate-300"
  const headingTextClassName = isElite ? "text-[var(--tpe-night)]" : "text-white"
  const backLinkClassName = isElite
    ? "inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-[var(--tpe-night)] transition hover:text-[var(--tpe-night-soft)]"
    : "inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-court-300 transition hover:text-white"
  const primaryButtonClassName = isElite
    ? "rounded-full bg-[var(--tpe-night)] text-[var(--tpe-paper)] hover:bg-[var(--tpe-night-soft)]"
    : "bg-court-500 text-brand-900 hover:bg-court-400"
  const outlineButtonClassName = isElite
    ? "rounded-full border-[var(--tpe-night)] bg-transparent text-[var(--tpe-night)] hover:bg-[var(--tpe-night)] hover:text-[var(--tpe-paper)]"
    : "border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
  const badgeClassName = isElite
    ? "rounded-full border-0 bg-[var(--tpe-lime)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--tpe-night)]"
    : "border-0 bg-court-500 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-900"
  const infoCardClassName = isElite
    ? "rounded-display border border-slate-200 bg-white p-4"
    : "rounded-display border border-white/10 bg-white/5 p-4"
  const reviewCardClassName = isElite
    ? "rounded-display border border-slate-200 bg-white p-5"
    : "rounded-display border border-white/10 bg-white/5 p-5"
  const playerCardClassName = isElite
    ? "rounded-display border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-md"
    : "rounded-display border border-white/10 bg-white/5 p-4 transition hover:border-court-500/40 hover:bg-white/10"

  return (
    <div className={pageClassName}>
      <div className="container mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:pt-12">
        <Link href="/clubes" className={backLinkClassName}>
          <ArrowLeft className="h-4 w-4" />
          Volver a clubes
        </Link>

        <section className={`mt-6 overflow-hidden ${shellClassName}`}>
          <div className={`relative ${heroHeightClassName}`}>
            {hasHeroImage ? (
              <>
                <img src={heroImage} alt={club.name || "Club"} className="h-full w-full object-cover" />
                <div
                  className={
                    isElite
                      ? "absolute inset-0 bg-gradient-to-t from-[rgba(13,21,38,0.9)] via-[rgba(13,21,38,0.45)] to-[rgba(13,21,38,0.15)]"
                      : "absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent"
                  }
                />
              </>
            ) : (
              <>
                <div
                  className={
                    isElite
                      ? "absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(206,231,91,0.24),transparent_22%),linear-gradient(180deg,#f8fafc_0%,#e6edf7_100%)]"
                      : "absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(210,236,99,0.12),transparent_24%),linear-gradient(180deg,#223765_0%,#1a2d54_100%)]"
                  }
                />
                <div className="absolute right-6 top-6 hidden sm:block">
                  <div
                    className={
                      isElite
                        ? "flex h-16 w-16 items-center justify-center rounded-display border border-slate-200/80 bg-white/70 text-[var(--tpe-night)] shadow-sm backdrop-blur"
                        : "flex h-16 w-16 items-center justify-center rounded-display border border-white/10 bg-white/10 text-court-300 backdrop-blur"
                    }
                  >
                    <ImageIcon className="h-7 w-7" />
                  </div>
                </div>
              </>
            )}

            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className={badgeClassName}>{showReviewHighlights ? `${club.rating} estrellas` : "Nuevo club"}</Badge>
                {showReviewHighlights ? (
                  <Badge
                    className={
                      hasHeroImage
                        ? "rounded-full border-0 bg-white/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur"
                        : isElite
                          ? "rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--tpe-night)]"
                          : "rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white"
                    }
                  >
                    {club.reviewCount} opiniones
                  </Badge>
                ) : null}
              </div>

              <h1 className={`mt-4 text-3xl font-black sm:text-4xl lg:text-5xl ${hasHeroImage ? "text-white" : headingTextClassName}`}>
                {club.name}
              </h1>
              <div
                className={`mt-3 flex flex-wrap items-center gap-4 text-sm font-semibold sm:text-base ${hasHeroImage ? "text-white/90" : subtleTextClassName}`}
              >
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {club.address || "Dirección a confirmar"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {club.courts || 0} canchas
                </span>
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />
                  {club.opens_at && club.closes_at ? `${club.opens_at.slice(0, 5)} - ${club.closes_at.slice(0, 5)}` : "Horario a confirmar"}
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.95fr)]">
          <div className="space-y-8">
            <section className={`p-6 sm:p-8 ${shellClassName}`}>
              <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                <div>
                  <p className={isElite ? "tpe-kicker mb-3" : "mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-court-300"}>
                    Sobre el club
                  </p>
                  <h2 className={`text-2xl font-black sm:text-3xl ${headingTextClassName}`}>Una sede pensada para jugar</h2>
                  {club.description ? (
                    <p className={`mt-4 text-base leading-7 ${subtleTextClassName}`}>{club.description}</p>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {showPlayersHighlights ? (
                    <div className={infoCardClassName}>
                      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em]">
                        <Users className={isElite ? "h-4 w-4 text-[var(--tpe-night)]" : "h-4 w-4 text-court-300"} />
                        Jugadores
                      </div>
                      <p className={`mt-3 text-3xl font-black ${headingTextClassName}`}>{totalPlayers}</p>
                    </div>
                  ) : null}

                  {showReviewHighlights ? (
                    <div className={infoCardClassName}>
                      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em]">
                        <Star className={isElite ? "h-4 w-4 text-[var(--tpe-night)]" : "h-4 w-4 text-court-300"} />
                        Calificación
                      </div>
                      <p className={`mt-3 text-3xl font-black ${headingTextClassName}`}>{club.rating}</p>
                    </div>
                  ) : null}

                  <div className={`${infoCardClassName} sm:col-span-2`}>
                    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em]">
                      <CalendarDays className={isElite ? "h-4 w-4 text-[var(--tpe-night)]" : "h-4 w-4 text-court-300"} />
                      Horario habitual
                    </div>
                    <p className={`mt-3 text-lg font-bold ${headingTextClassName}`}>
                      {club.opens_at && club.closes_at ? `${club.opens_at.slice(0, 5)} - ${club.closes_at.slice(0, 5)}` : "Horario a confirmar"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className={`p-6 sm:p-8 ${shellClassName}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className={isElite ? "tpe-kicker mb-2" : "mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-court-300"}>
                    Próximos torneos
                  </p>
                  <h2 className={`text-2xl font-black sm:text-3xl ${headingTextClassName}`}>Agenda del club</h2>
                </div>

                <Button asChild variant="outline" className={outlineButtonClassName}>
                  <Link href={tournamentsHref}>
                    Ver todos los torneos
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <div className="mt-6">
                <PublicTournamentCards
                  tournaments={club.upcomingTournaments || []}
                  emptyTitle="Sin torneos publicados"
                  emptyDescription="Cuando este club publique nuevas fechas, van a aparecer acá automáticamente."
                />
              </div>
            </section>

            {showPlayersHighlights ? (
              <section className={`p-6 sm:p-8 ${shellClassName}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className={isElite ? "tpe-kicker mb-2" : "mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-court-300"}>
                      Jugadores destacados
                    </p>
                    <h2 className={`text-2xl font-black sm:text-3xl ${headingTextClassName}`}>Top del club</h2>
                  </div>

                  <Button asChild className={primaryButtonClassName}>
                    <Link href={`/clubes/${id}/players`}>Ver todos los jugadores</Link>
                  </Button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {topPlayers.map((player, index) => (
                    <Link key={player.id} href={`/ranking/${player.id}`} className={playerCardClassName}>
                      <div className="flex items-start gap-3">
                        <PlayerAvatar src={player.profileImage} alt={`${player.firstName} ${player.lastName}`} size={52} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {getMedalIcon(index)}
                            <span className={`truncate text-sm font-bold ${headingTextClassName}`}>
                              {player.firstName} {player.lastName}
                            </span>
                          </div>
                          <p className={`mt-1 text-xs font-semibold uppercase tracking-[0.12em] ${subtleTextClassName}`}>{player.category}</p>
                          <p className={`mt-3 text-2xl font-black ${headingTextClassName}`}>{player.score.toLocaleString()}</p>
                          <p className={`text-xs ${subtleTextClassName}`}>puntos</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {galleryImages.length > 0 ? (
              <section className={`p-6 sm:p-8 ${shellClassName}`}>
                <p className={isElite ? "tpe-kicker mb-2" : "mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-court-300"}>
                  Espacios
                </p>
                <h2 className={`text-2xl font-black sm:text-3xl ${headingTextClassName}`}>Galería de fotos</h2>
                <div className="mt-6">
                  <ClubGallery images={galleryImages} />
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-6">
            <section className={`p-6 ${shellClassName}`}>
              <p className={isElite ? "tpe-kicker mb-3" : "mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-court-300"}>
                Contacto
              </p>
              <h2 className={`text-2xl font-black ${headingTextClassName}`}>Información útil</h2>

              <div className="mt-6 space-y-3">
                <div className={infoCardClassName}>
                  <div className="flex items-start gap-3">
                    <MapPin className={isElite ? "mt-0.5 h-4 w-4 text-[var(--tpe-night)]" : "mt-0.5 h-4 w-4 text-court-300"} />
                    <span className={subtleTextClassName}>{club.address || "Dirección a confirmar"}</span>
                  </div>
                </div>

                {mapsHref ? (
                  <Button asChild className={primaryButtonClassName}>
                    <a href={mapsHref} target="_blank" rel="noopener noreferrer">
                      <Navigation className="mr-2 h-4 w-4" />
                      Como llegar
                    </a>
                  </Button>
                ) : null}

                {club.phone ? (
                  <div className={infoCardClassName}>
                    <div className="flex items-center gap-3">
                      <Phone className={isElite ? "h-4 w-4 text-[var(--tpe-night)]" : "h-4 w-4 text-court-300"} />
                      <span className={subtleTextClassName}>{club.phone}</span>
                    </div>
                  </div>
                ) : null}

                {club.email ? (
                  <div className={infoCardClassName}>
                    <div className="flex items-center gap-3">
                      <Mail className={isElite ? "h-4 w-4 text-[var(--tpe-night)]" : "h-4 w-4 text-court-300"} />
                      <span className={`min-w-0 break-all ${subtleTextClassName}`}>{club.email}</span>
                    </div>
                  </div>
                ) : null}

                {websiteHref ? (
                  <div className={infoCardClassName}>
                    <div className="flex items-center gap-3">
                      <Globe className={isElite ? "h-4 w-4 text-[var(--tpe-night)]" : "h-4 w-4 text-court-300"} />
                      <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                        {club.website}
                      </a>
                    </div>
                  </div>
                ) : null}

                {club.instagram ? (
                  <div className={infoCardClassName}>
                    <div className="flex items-center gap-3">
                      <Instagram className={isElite ? "h-4 w-4 text-[var(--tpe-night)]" : "h-4 w-4 text-court-300"} />
                      <a href={`https://instagram.com/${club.instagram}`} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                        @{club.instagram}
                      </a>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-6">
                <ContactButton club={club} />
              </div>
            </section>

            <section className={`p-6 ${shellClassName}`}>
              <p className={isElite ? "tpe-kicker mb-3" : "mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-court-300"}>
                Servicios
              </p>
              <h2 className={`text-2xl font-black ${headingTextClassName}`}>Qué ofrece esta sede</h2>

              <div className="mt-6 space-y-3">
                {club.services && club.services.length > 0 ? (
                  club.services.map((service: { name: string }, index: number) => (
                    <div key={index} className={infoCardClassName}>
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className={isElite ? "h-4 w-4 text-[var(--tpe-night)]" : "h-4 w-4 text-court-300"} />
                        <span className={subtleTextClassName}>{service.name}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={secondaryShellClassName}>
                    <div className="p-6 text-center">
                      <p className={`text-sm ${subtleTextClassName}`}>No hay servicios especificados.</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>

        {showReviewHighlights ? (
          <section className={`mt-8 p-6 sm:p-8 ${shellClassName}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className={isElite ? "tpe-kicker mb-2" : "mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-court-300"}>
                  Opiniones
                </p>
                <h2 className={`text-2xl font-black sm:text-3xl ${headingTextClassName}`}>Lo que dicen los jugadores</h2>
              </div>

              <Badge className={badgeClassName}>{`${club.rating} / 5`}</Badge>
            </div>

            <div className="mt-6 space-y-4">
              {club.reviews.map((review: { score: number; description: string; playerName: string; date: string }, index: number) => (
                <div key={index} className={reviewCardClassName}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className={`font-bold ${headingTextClassName}`}>{review.playerName}</p>
                      <p className={`mt-1 text-xs uppercase tracking-[0.12em] ${subtleTextClassName}`}>
                        {new Date(review.date).toLocaleDateString("es-AR", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, starIndex) => (
                        <Star
                          key={starIndex}
                          className={starIndex < review.score ? "h-4 w-4 fill-amber-400 text-amber-400" : "h-4 w-4 text-slate-400"}
                        />
                      ))}
                    </div>
                  </div>
                  <p className={`mt-4 text-sm leading-6 ${subtleTextClassName}`}>{review.description}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
