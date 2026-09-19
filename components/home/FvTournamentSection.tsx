import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PublicTournamentCards } from "@/components/tournaments/public-tournament-cards"
import type { PublicTournamentSummary } from "@/types/public-tournament"

interface FvTournamentSectionProps {
  id: string
  kicker: string
  title: string
  description: string
  action: string
  tournaments: PublicTournamentSummary[]
  emptyTitle: string
  emptyDescription: string
  embedded?: boolean
}

const FvTournamentSection = ({
  id,
  kicker,
  title,
  description,
  action,
  tournaments,
  emptyTitle,
  emptyDescription,
  embedded = false,
}: FvTournamentSectionProps) => {
  return (
    <section
      id={id}
      className={
        embedded
          ? "overflow-hidden rounded-display-lg border border-[#20335d]/10 bg-[#e9eef6] text-[#20335d] shadow-[0_12px_32px_rgba(16,26,49,0.06)]"
          : "bg-[#f7f5ee]"
      }
    >
      <div
        className={
          embedded
            ? "px-4 py-5 sm:px-6 sm:py-6"
            : "container mx-auto px-4 py-14 sm:px-6 sm:py-16 lg:py-20"
        }
      >
        <div className={embedded ? undefined : "mx-auto max-w-6xl"}>
          <div
            className={
              embedded
                ? "mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
                : "mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between"
            }
          >
            <div className="max-w-2xl">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-[#20335d] sm:text-sm">
                {kicker}
              </p>
              <h2
                className={
                  embedded
                    ? "text-2xl font-black leading-tight tracking-[-0.03em] text-[#20335d] sm:text-3xl"
                    : "text-3xl font-black leading-[1.03] tracking-[-0.04em] text-[#20335d] sm:text-4xl lg:text-5xl"
                }
              >
                {title}
              </h2>
              <p
                className={
                  embedded
                    ? "mt-2 max-w-xl text-sm font-medium leading-6 text-slate-600 sm:text-base"
                    : "mt-4 max-w-xl text-base font-medium leading-7 text-slate-600 sm:text-lg"
                }
              >
                {description}
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              className="h-11 w-full shrink-0 border-[#20335d]/25 bg-white px-5 font-bold text-[#20335d] hover:border-[#20335d] hover:bg-white hover:text-[#20335d] focus-visible:ring-[#c6de06] sm:w-auto"
            >
              <Link href="/torneos?type=AMERICAN" aria-label={action}>
                {action}
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <PublicTournamentCards
            tournaments={tournaments}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            surface="light"
          />
        </div>
      </div>
    </section>
  )
}

export default FvTournamentSection
