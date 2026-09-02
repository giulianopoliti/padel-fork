import React from 'react'
import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { checkTournamentPermissions, checkUserTournamentInscription } from "@/utils/tournament-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ArrowLeft, Trophy } from "lucide-react"
import Link from "next/link"

interface SchedulesLayoutProps {
  children: React.ReactNode
  organizer: React.ReactNode
  player: React.ReactNode
  params: {
    id: string
  }
}

export default async function SchedulesLayout({
  children,
  organizer,
  player,
  params
}: SchedulesLayoutProps) {
  const resolvedParams = await params
  const supabase = await createClient()

  // Basic auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Check tournament permissions (CLUB + ORGANIZADOR)
  const permissions = await checkTournamentPermissions(user.id, resolvedParams.id)

  if (permissions.hasPermission) {
    // User has management permissions (CLUB or ORGANIZADOR)
    return organizer
  }

  // Check if user is inscribed as player
  const inscription = await checkUserTournamentInscription(user.id, resolvedParams.id)

  if (inscription.isInscribed && !inscription.isEliminated && !inscription.isPending) {
    // User is inscribed and active player
    return player
  }

  // Special case: Player is eliminated
  if (inscription.isInscribed && inscription.isEliminated) {
    return (
      <EliminatedPlayerSchedulesView
        tournamentId={resolvedParams.id}
        eliminationInfo={inscription.inscriptionDetails}
      />
    )
  }

  if (inscription.isPending) {
    redirect(`/tournaments/${resolvedParams.id}`)
  }

  // Players not inscribed should not access schedules
  // No access - show fallback
  return children
}

function EliminatedPlayerSchedulesView({
  tournamentId,
  eliminationInfo
}: {
  tournamentId: string
  eliminationInfo?: any
}) {
  const getRoundName = (round: string | null): string => {
    const roundNames: Record<string, string> = {
      'ZONE': 'Fase de Zonas',
      '32VOS': '32vos de Final',
      '16VOS': '16vos de Final',
      '8VOS': 'Octavos de Final',
      '4TOS': 'Cuartos de Final',
      'SEMIFINAL': 'Semifinal',
      'FINAL': 'Final'
    }
    return roundNames[round || ''] || round || 'Ronda no especificada'
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 lg:py-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 lg:mb-6">
              <Button asChild variant="outline" className="border-gray-300 w-fit">
                <Link href={`/tournaments/${tournamentId}`} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Volver al Torneo</span>
                </Link>
              </Button>

              <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                Player Eliminado
              </div>
            </div>

            <div className="flex items-start gap-3 lg:gap-4">
              <div className="bg-red-100 p-2 lg:p-3 rounded-elevated">
                <Trophy className="h-5 w-5 lg:h-6 lg:w-6 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">
                  Fechas y Horarios - Acceso Restringido
                </h1>
                <p className="text-sm text-slate-600">
                  Tu participación en este torneo ha finalizado
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>Ya no puedes acceder a los horarios:</strong> Has sido eliminado del torneo.
              <br />
              <span className="text-sm">
                Fuiste eliminado en: <strong>{getRoundName(eliminationInfo?.is_eliminated ? 'ZONE' : null)}</strong>
              </span>
            </AlertDescription>
          </Alert>

          <div className="mt-6 bg-white rounded-surface border border-gray-200 p-6">
            <div className="text-center">
              <Trophy className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Participación Finalizada
              </h3>
              <p className="text-gray-600 mb-4">
                Aunque tu participación ha terminado, puedes seguir viendo tu progreso en el torneo.
              </p>
              <Button asChild>
                <Link href={`/tournaments/${tournamentId}`}>
                  <Trophy className="h-4 w-4 mr-2" />
                  Ver Mi Progreso
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
