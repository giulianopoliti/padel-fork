"use client"

import { useMemo, useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PublicTournamentCards, type PublicTournamentSummary } from "@/components/tournaments/public-tournament-cards"

interface HomeTournamentTabsProps {
  tournaments: PublicTournamentSummary[]
  surface?: "dark" | "light"
}

export function HomeTournamentTabs({ tournaments, surface = "dark" }: HomeTournamentTabsProps) {
  const [activeType, setActiveType] = useState<"LONG" | "AMERICAN">("LONG")

  const filteredTournaments = useMemo(
    () => tournaments.filter((tournament) => (tournament.type || "LONG") === activeType),
    [activeType, tournaments],
  )

  return (
    <div className="space-y-5 sm:space-y-6">
      <Tabs value={activeType} onValueChange={(value) => setActiveType(value as "LONG" | "AMERICAN")}>
        <TabsList className={`grid h-auto w-full grid-cols-2 rounded-display p-1 sm:max-w-md ${surface === "light" ? "border border-[#20335d]/12 bg-white shadow-sm" : "border border-white/10 bg-white/5"}`}>
          <TabsTrigger
            value="LONG"
            className={`rounded-elevated px-3 py-3 text-sm font-semibold data-[state=active]:bg-court-500 data-[state=active]:text-brand-900 sm:px-4 ${surface === "light" ? "text-slate-600" : "text-slate-300"}`}
          >
            Ligas
          </TabsTrigger>
          <TabsTrigger
            value="AMERICAN"
            className={`rounded-elevated px-3 py-3 text-sm font-semibold data-[state=active]:bg-court-500 data-[state=active]:text-brand-900 sm:px-4 ${surface === "light" ? "text-slate-600" : "text-slate-300"}`}
          >
            Americanos
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <PublicTournamentCards
        tournaments={filteredTournaments}
        emptyTitle={activeType === "LONG" ? "No hay ligas publicadas" : "No hay americanos publicados"}
        emptyDescription="En cuanto Padel FV cargue nuevos torneos, van a aparecer aca automaticamente."
        surface={surface}
      />
    </div>
  )
}
