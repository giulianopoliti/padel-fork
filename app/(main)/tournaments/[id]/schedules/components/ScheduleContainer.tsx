'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { TournamentFecha } from '../types'
import { useScheduleAccess } from '../hooks/useScheduleAccess'
import { 
  PageLoadingState, 
  ScheduleMatrixSkeleton, 
  PlayerAvailabilitySkeleton 
} from './LoadingStates'
import { 
  AccessDeniedError, 
  NotInscribedError, 
  NotOrganizerError, 
  NetworkError,
  InlineError 
} from './ErrorStates'
import FechaSelector from './FechaSelector'

// Lazy load heavy components for better performance
import { lazy } from 'react'

const OrganizerView = lazy(() => import('./OrganizerView'))
const PlayerView = lazy(() => import('./PlayerView'))

interface ScheduleContainerProps {
  tournamentId: string
  fechas: TournamentFecha[]
  initialFechaId?: string
  tournamentName: string
  clubName: string
}

export default function ScheduleContainer({
  tournamentId,
  fechas,
  initialFechaId,
  tournamentName,
  clubName
}: ScheduleContainerProps) {
  const { userAccess, loading, error, retry } = useScheduleAccess(tournamentId)
  
  // Determine selected fecha
  const selectedFechaId = initialFechaId || fechas[0]?.id
  
  // Loading state
  if (loading) {
    return <PageLoadingState />
  }

  // Error states
  if (error) {
    // Specific error handling based on error message
    if (error.includes('permisos')) {
      return <AccessDeniedError onRetry={retry} />
    }
    
    if (error.includes('inscrito')) {
      return <NotInscribedError />
    }
    
    return <NetworkError onRetry={retry} />
  }

  // No access data
  if (!userAccess) {
    return <NetworkError onRetry={retry} />
  }

  // Access denied - not organizer or inscribed
  if (!userAccess.isOrganizer && !userAccess.isInscribed) {
    return <AccessDeniedError onRetry={retry} />
  }

  // No fechas available
  if (!fechas.length) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="container mx-auto px-4 py-4 lg:py-6">
            <div className="max-w-7xl mx-auto">
              
              {/* Navigation */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 lg:mb-6">
                <Button asChild variant="outline" className="border-gray-300 w-fit">
                  <Link href={`/tournaments/${tournamentId}`} className="flex items-center gap-2">
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
                  <ArrowLeft className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">
                    Horarios - {tournamentName}
                  </h1>
                  
                  {clubName ? (
                    <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <span>Club: {clubName}</span>
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
            <InlineError 
              message="No hay fechas disponibles para este torneo." 
            />
          </div>
        </div>
      </div>
    )
  }

  // No selected fecha
  if (!selectedFechaId) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="container mx-auto px-4 py-4 lg:py-6">
            <div className="max-w-7xl mx-auto">
              
              {/* Navigation */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 lg:mb-6">
                <Button asChild variant="outline" className="border-gray-300 w-fit">
                  <Link href={`/tournaments/${tournamentId}`} className="flex items-center gap-2">
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
                  <ArrowLeft className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">
                    Horarios - {tournamentName}
                  </h1>
                  
                  {clubName ? (
                    <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <span>Club: {clubName}</span>
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
            <FechaSelector
              tournamentId={tournamentId}
              fechas={fechas}
              selectedFechaId={selectedFechaId}
            />
            
            <InlineError 
              message="Selecciona una fecha para ver los horarios disponibles." 
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 lg:py-6">
          <div className="max-w-7xl mx-auto">
            
            {/* Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 lg:mb-6">
              <Button asChild variant="outline" className="border-gray-300 w-fit">
                <Link href={`/tournaments/${tournamentId}`} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Volver al Torneo</span>
                </Link>
              </Button>
              
              <div className="flex items-center gap-2">
                <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                  Horarios
                </div>
                {userAccess.isOrganizer && (
                  <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                    Vista Organizador
                  </div>
                )}
                {userAccess.isInscribed && !userAccess.isOrganizer && (
                  <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
                    Vista Jugador
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="flex items-start gap-3 lg:gap-4">
              <div className="bg-blue-100 p-2 lg:p-3 rounded-elevated">
                <ArrowLeft className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">
                  Horarios - {tournamentName}
                </h1>
                
                {clubName ? (
                  <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm text-slate-600">
                    <div className="flex items-center gap-1">
                      <span>Club: {clubName}</span>
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

          {/* Fecha Selector */}
          <FechaSelector
            tournamentId={tournamentId}
            fechas={fechas}
            selectedFechaId={selectedFechaId}
          />

          {/* Main Content - Conditional rendering based on role */}
          <div className="space-y-6">
            {userAccess.isOrganizer ? (
              <Suspense fallback={<ScheduleMatrixSkeleton />}>
                <OrganizerView
                  tournamentId={tournamentId}
                  fechaId={selectedFechaId}
                  userAccess={userAccess}
                />
              </Suspense>
            ) : userAccess.isInscribed ? (
              <Suspense fallback={<PlayerAvailabilitySkeleton />}>
                <PlayerView
                  tournamentId={tournamentId}
                  fechaId={selectedFechaId}
                  userAccess={userAccess}
                />
              </Suspense>
            ) : (
              <AccessDeniedError onRetry={retry} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
