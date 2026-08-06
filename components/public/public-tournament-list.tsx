import Link from "next/link"
import { CalendarDays, ChevronRight, Clock3, MapPin, Ticket } from "lucide-react"
import PublicRegistrationLauncher from "@/components/tournament/public-registration-launcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getTenantBranding } from "@/config/tenant"
import { Gender } from "@/types"
import type { PublicTournamentSummary } from "@/types/public-tournament"
import { canShowPublicRegistration, getPublicRegistrationClosedLabel } from "@/lib/tournaments/registration-availability"
import { shouldShowFewSlotsAlert } from "@/lib/tournaments/few-slots-visibility"

interface PublicTournamentListProps {
  tournaments: PublicTournamentSummary[]
  emptyTitle: string
  emptyDescription: string
  showRegistration?: boolean
}

const statusLabels: Record<string, string> = {
  NOT_STARTED: "Inscripciones abiertas",
  IN_PROGRESS: "En juego",
  ZONE_PHASE: "Fase de zonas",
  BRACKET_PHASE: "Llaves",
  FINISHED: "Finalizado",
  FINISHED_POINTS_PENDING: "Finalizado",
  FINISHED_POINTS_CALCULATED: "Finalizado",
}

const genderLabels: Partial<Record<Gender, string>> = {
  [Gender.MALE]: "Caballeros",
  [Gender.FEMALE]: "Damas",
  [Gender.MIXED]: "Mixtos",
}

const capitalizeWords = (value: string) => value.replace(/\b\w/g, (char) => char.toUpperCase())

const formatDateLabel = (value: string | null) => {
  if (!value) return "Fecha a confirmar"

  return capitalizeWords(
    new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(value)),
  )
}

const formatTimeLabel = (value: string | null) => {
  if (!value) return "Horario a confirmar"

  return `${new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value))} hs`
}

const formatPrice = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null

  if (typeof value === "number") {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(value)
  }

  return value
}

const getCategoryLabel = (tournament: PublicTournamentSummary) =>
  tournament.categoryName || tournament.category || tournament.name

export default function PublicTournamentList({
  tournaments,
  emptyTitle,
  emptyDescription,
  showRegistration = false,
}: PublicTournamentListProps) {
  const branding = getTenantBranding()
  const allowActivePhaseRegistration = branding.key === "padel-fv"

  if (tournaments.length === 0) {
    return (
      <div className="tpe-shell rounded-[2rem] p-8 text-center text-white">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/8">
          <CalendarDays className="h-8 w-8 text-[var(--tpe-lime)]" />
        </div>
        <h3 className="text-2xl font-black">{emptyTitle}</h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-white/72 sm:text-base">{emptyDescription}</p>
      </div>
    )
  }

  return (
    <div className="tpe-shell overflow-hidden rounded-[2rem]">
      <div className="tpe-banner border-b-4 border-[var(--tpe-forest)] px-5 py-4 sm:px-8">
        <p className="text-center text-lg font-black uppercase tracking-[0.14em] sm:text-2xl">Torneos americanos</p>
      </div>

      <div className="p-4 sm:p-6">
        {tournaments.map((tournament) => {
          const statusLabel = statusLabels[tournament.status] || tournament.status
          const hideVenue = Boolean(tournament.hideVenue)
          const venueName = tournament.club?.name || tournament.club?.address || null
          const genderLabel =
            typeof tournament.gender === "string"
              ? genderLabels[tournament.gender as Gender] || tournament.gender
              : "Categoria abierta"
          const priceLabel = formatPrice(tournament.price)
          const categoryLabel = getCategoryLabel(tournament)
          const canRegister = showRegistration && canShowPublicRegistration({
            status: tournament.status,
            enablePublicInscriptions: tournament.enablePublicInscriptions,
            registrationLocked: tournament.registrationLocked,
            bracketStatus: tournament.bracketStatus,
            isFull: tournament.isFull,
            allowActivePhaseRegistration,
          })

          return (
            <article
              key={tournament.id}
              className="grid gap-5 border-b px-1 py-5 text-white last:border-b-0 sm:px-2 lg:grid-cols-[minmax(0,180px)_minmax(0,1fr)_220px]"
              style={{ borderColor: "rgba(255,255,255,0.18)" }}
            >
              <div className="space-y-2">
                <p className="text-[2rem] font-black uppercase leading-none text-[var(--tpe-lime)] sm:text-[2.5rem]">
                  {categoryLabel}
                </p>
                {tournament.name !== categoryLabel ? (
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/72">{tournament.name}</p>
                ) : null}
                <Badge className="w-fit border-0 bg-[var(--tpe-night-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[var(--tpe-paper)]">
                  {genderLabel}
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-sm font-bold uppercase tracking-[0.12em] text-[var(--tpe-paper)] sm:text-base">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-[var(--tpe-lime)]" />
                    {formatDateLabel(tournament.startDate)}
                  </span>
                  <span className="hidden text-white/40 sm:inline">-</span>
                  <span className="inline-flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-[var(--tpe-lime)]" />
                    {formatTimeLabel(tournament.startDate)}
                  </span>
                </div>

                {!hideVenue && venueName ? (
                  <div className="space-y-2">
                    <p className="inline-flex items-start gap-2 text-sm font-black uppercase tracking-[0.04em] text-[var(--tpe-cyan)] sm:text-lg">
                      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{venueName}</span>
                    </p>
                    {tournament.club?.address && tournament.club.address !== venueName ? (
                      <p className="pl-6 text-sm font-semibold uppercase tracking-[0.03em] text-white/82">
                        {tournament.club.address}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Badge className="tpe-chip rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]">
                    {statusLabel}
                  </Badge>
                  {tournament.isFull ? (
                    <Badge className="rounded-full border border-red-200/90 bg-red-700 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-[0_0_22px_rgba(220,38,38,0.38)]">
                      Completo
                    </Badge>
                  ) : null}
                  {shouldShowFewSlotsAlert(tournament.showFewSlotsAlert, tournament.hasFewSlots) ? (
                    <Badge className="animate-pulse rounded-full border border-red-200/90 bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_0_24px_rgba(220,38,38,0.45)]">
                      Pocos cupos
                    </Badge>
                  ) : null}
                  {priceLabel ? (
                    <Badge className="rounded-full border-0 bg-[var(--tpe-lime)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--tpe-night)]">
                      <Ticket className="mr-1 h-3.5 w-3.5" />
                      {priceLabel}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col justify-between gap-3">
                {canRegister ? (
                  <PublicRegistrationLauncher
                    tournamentId={tournament.id}
                    tournamentName={tournament.name}
                    tournamentGender={(tournament.gender as Gender) || Gender.MALE}
                    tournamentPrice={tournament.price || null}
                    enableTransferProof={tournament.enableTransferProof || false}
                    transferAlias={tournament.transferAlias || null}
                    transferAmount={tournament.transferAmount || null}
                    fullWidth
                    buttonClassName="w-full rounded-full bg-[var(--tpe-lime)] text-sm font-black uppercase tracking-[0.16em] text-[var(--tpe-night)] hover:bg-[#e6ff63]"
                  />
                ) : showRegistration && (allowActivePhaseRegistration || tournament.status === "NOT_STARTED") ? (
                  <div className="rounded-[1.25rem] border border-white/12 bg-white/6 px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-white/80">
                    {getPublicRegistrationClosedLabel({
                      isFull: tournament.isFull,
                    })}
                  </div>
                ) : null}

                <Button
                  asChild
                  variant="outline"
                  className="w-full rounded-full border-white/20 bg-white/5 text-sm font-bold uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href={`/tournaments/${tournament.id}`}>
                    Ver detalles
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
