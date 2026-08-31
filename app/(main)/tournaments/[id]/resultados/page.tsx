import { notFound } from "next/navigation"
import { ArrowLeft, Table2, Trophy } from "lucide-react"
import Link from "next/link"

import PublicResultsMatrix from "./components/PublicResultsMatrix"
import { getPublicLongResults } from "@/lib/services/public-long-results.service"

interface ResultsPageProps {
  params: Promise<{ id: string }>
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { id: tournamentId } = await params
  const results = await getPublicLongResults(tournamentId)

  if (!results) notFound()

  return (
    <div className="min-h-full bg-background/70">
      <header className="border-b border-border/70 bg-card/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Link href={`/tournaments/${tournamentId}/qually`} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Volver a tablas de posiciones
          </Link>
          <div className="mt-3 flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Table2 className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold sm:text-2xl">Resultados</h1>
              <p className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm"><Trophy className="h-3.5 w-3.5" />{results.tournament.name}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="mb-5 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm text-slate-700">
          Cada matriz muestra los partidos de una zona. Los marcadores incluyen sets ganados y, cuando están disponibles, el detalle de games de cada set.
        </div>
        <PublicResultsMatrix results={results} tournamentId={tournamentId} />
      </main>
    </div>
  )
}
