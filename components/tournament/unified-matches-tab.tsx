"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ListChecks, Plus, RefreshCw } from "lucide-react"

// Import existing components that we'll reuse
import MatchCreationSection from "./match-creation-section"
import ExistingMatchesSection from "./existing-matches-section"
import ReadOnlyMatchesTabNew from "./read-only-matches-tab-new"

interface UnifiedMatchesTabProps {
  tournamentId: string
  clubCourts: number
  isOwner?: boolean
  isPublicView?: boolean
  onDataRefresh?: () => void
  tournamentStatus?: string
  recommendationEnabled?: boolean
}

export default function UnifiedMatchesTab({
  tournamentId,
  clubCourts,
  isOwner = false,
  isPublicView = false,
  onDataRefresh,
  tournamentStatus = "UNKNOWN",
  recommendationEnabled = false,
}: UnifiedMatchesTabProps) {
  const [creationOpen, setCreationOpen] = useState(true)
  const [pendingMatchesCount, setPendingMatchesCount] = useState(0)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Handler for when matches are created - refresh both views
  const handleMatchesCreated = () => {
    setRefreshTrigger(prev => prev + 1)
    if (onDataRefresh) {
      onDataRefresh()
    }
  }

  // Handler for when match results are updated
  const handleMatchUpdated = () => {
    setRefreshTrigger(prev => prev + 1)
    if (onDataRefresh) {
      onDataRefresh()
    }
  }

  // Si no es owner, mostrar vista pública (read-only)
  if (!isOwner) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Partidos del Torneo</h2>
          <Badge variant="secondary" className="text-sm">
            {isPublicView ? 'Vista Pública' : 'Vista de Jugador'}
          </Badge>
        </div>
        <ReadOnlyMatchesTabNew
          tournamentId={tournamentId}
          tournamentStatus={tournamentStatus}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Operación del torneo</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Partidos de zona</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Prepará nuevos cruces arriba y administrá todos los partidos creados debajo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshTrigger(prev => prev + 1)}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        </div>
      </div>

      <Collapsible open={creationOpen} onOpenChange={setCreationOpen}>
        <Card className="overflow-hidden border-emerald-200 shadow-sm">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset sm:p-5"
              aria-label={creationOpen ? "Minimizar creación de partidos" : "Mostrar creación de partidos"}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">Crear nuevos partidos</span>
                  <span className="block text-sm text-slate-500">Seleccioná dos parejas con un clic y prepará varios cruces.</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {pendingMatchesCount > 0 && (
                  <Badge className="bg-rose-600 text-white hover:bg-rose-600">
                    {pendingMatchesCount} en cola
                  </Badge>
                )}
                <ChevronDown className={`h-5 w-5 text-slate-500 transition-transform ${creationOpen ? 'rotate-180' : ''}`} />
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="border-t border-emerald-100 p-4 sm:p-6">
          <MatchCreationSection
            tournamentId={tournamentId}
            clubCourts={clubCourts}
            isOwner={isOwner}
            onMatchesCreated={handleMatchesCreated}
            onPendingMatchesChange={setPendingMatchesCount}
            refreshTrigger={refreshTrigger}
            recommendationEnabled={recommendationEnabled}
          />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <section aria-labelledby="created-matches-title" className="space-y-4 pt-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <ListChecks className="h-5 w-5" />
          </span>
          <div>
            <h3 id="created-matches-title" className="text-xl font-bold text-slate-900">Partidos creados</h3>
            <p className="text-sm text-slate-500">Cargá resultados, cambiá canchas y administrá cada encuentro.</p>
          </div>
        </div>
        <ExistingMatchesSection
          tournamentId={tournamentId}
          isOwner={isOwner}
          isPublicView={false}
          refreshTrigger={refreshTrigger}
          onMatchUpdated={handleMatchUpdated}
          tournamentStatus={tournamentStatus}
        />
      </section>
    </div>
  )
}
