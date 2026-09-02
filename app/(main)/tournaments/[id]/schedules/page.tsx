import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, ArrowLeft } from "lucide-react"
import Link from "next/link"

interface SchedulesPageProps {
  params: {
    id: string
  }
}

export default async function SchedulesPage({
  params
}: SchedulesPageProps) {
  const resolvedParams = await params
  const supabase = await createClient()

  // Basic auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Get tournament basic info
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('name, hide_venue, clubes(name)')
    .eq('id', resolvedParams.id)
    .single()

  if (tournamentError || !tournament) {
    redirect('/tournaments')
  }

  // This is the fallback page for users without access
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 lg:py-6">
          <div className="max-w-7xl mx-auto">

            {/* Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 lg:mb-6">
              <Button asChild variant="outline" className="border-gray-300 w-fit">
                <Link href={`/tournaments/${resolvedParams.id}`} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Volver al Torneo</span>
                </Link>
              </Button>

              <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                Horarios
              </div>
            </div>

            {/* Title */}
            <div className="flex items-start gap-3 lg:gap-4">
              <div className="bg-blue-100 p-2 lg:p-3 rounded-elevated">
                <AlertTriangle className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">
                  Horarios - {tournament.name}
                </h1>

                {!tournament.hide_venue ? (
                  <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm text-slate-600">
                    <div className="flex items-center gap-1">
                      <span>Club: {(tournament.clubes as any)?.name || 'Sin club'}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <Alert className="border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <strong>Acceso restringido:</strong> Solo los organizadores del torneo y jugadores inscritos pueden ver los horarios.
              <br />
              <span className="text-sm">
                Si eres jugador, asegúrate de estar inscrito en el torneo. Si eres organizador, verifica tus permisos.
              </span>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  )
}
