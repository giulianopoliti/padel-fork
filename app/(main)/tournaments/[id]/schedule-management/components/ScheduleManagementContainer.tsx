'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { ArrowLeft, Calendar, Clock } from 'lucide-react'
import { TournamentFecha } from '../../schedules/types'
import { useTournamentPermissions } from '@/hooks/use-tournament-permissions'
import FechaNavigationSidebar from './FechaNavigationSidebar'
import SelectedFechaContent from './SelectedFechaContent'
import ActionsPanel from './ActionsPanel'

interface ScheduleManagementContainerProps {
  tournamentId: string
  tournamentName: string
  clubName: string
  fechas: TournamentFecha[]
  initialSelectedFechaId: string | null
}

export default function ScheduleManagementContainer({
  tournamentId,
  tournamentName,
  clubName,
  fechas: initialFechas,
  initialSelectedFechaId
}: ScheduleManagementContainerProps) {
  const [fechas, setFechas] = useState<TournamentFecha[]>(initialFechas)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { permissions, isLoading } = useTournamentPermissions(tournamentId)

  // Get selected fecha from URL
  const selectedFechaId = searchParams.get('fecha_id') || initialSelectedFechaId

  const selectedFecha = fechas.find(f => f.id === selectedFechaId)
  
  // Debug logging
  console.log('[ScheduleManagementContainer] Debug info:', {
    selectedFechaId,
    selectedFecha: selectedFecha ? { id: selectedFecha.id, name: selectedFecha.name, fecha_number: selectedFecha.fecha_number } : null,
    fechasCount: fechas.length,
    fechasIds: fechas.map(f => ({ id: f.id, name: f.name, fecha_number: f.fecha_number }))
  })

  const handleFechaSelect = (fechaId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('fecha_id', fechaId)
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleFechaCreated = (newFecha: TournamentFecha) => {
    setFechas(prev => [...prev, newFecha].sort((a, b) => a.fecha_number - b.fecha_number))
    // Navigate to the newly created fecha
    handleFechaSelect(newFecha.id)
  }

  const handleFechaUpdated = (updatedFecha: TournamentFecha) => {
    setFechas(prev => prev.map(fecha =>
      fecha.id === updatedFecha.id ? updatedFecha : fecha
    ))
    // Trigger a page refresh to update all data
    router.refresh()
  }

  const handleFechaDeleted = (fechaId: string) => {
    setFechas(prev => prev.filter(fecha => fecha.id !== fechaId))
    if (selectedFechaId === fechaId) {
      const remainingFechas = fechas.filter(f => f.id !== fechaId)
      if (remainingFechas.length > 0) {
        handleFechaSelect(remainingFechas[0].id)
      } else {
        // No fechas left, go to main page
        router.push(`${pathname}`)
      }
    }
  }

  const handleTimeSlotChanged = () => {
    // Refresh the entire page to get fresh data
    router.refresh()
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
                  Gestión de Horarios
                </div>
                {permissions.hasPermission && (
                  <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                    Organizador
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="flex items-start gap-3 lg:gap-4">
              <div className="bg-gradient-to-br from-blue-100 to-green-100 p-2 lg:p-3 rounded-elevated">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4 lg:h-5 lg:w-5 text-blue-600" />
                  <Clock className="h-4 w-4 lg:h-5 lg:w-5 text-green-600" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">
                  Fechas y Horarios - {tournamentName}
                </h1>

                <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm text-slate-600">
                  <div className="flex items-center gap-1">
                    <span>Club: {clubName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 lg:h-4 lg:w-4" />
                    <span>{fechas.length} {fechas.length === 1 ? 'fecha' : 'fechas'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Resizable Panels */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-7xl mx-auto h-[calc(100vh-240px)]">
          <ResizablePanelGroup direction="horizontal" className="rounded-surface border bg-white">

            {/* Left Sidebar: Fecha Navigation */}
            <ResizablePanel defaultSize={30} minSize={25} maxSize={40}>
              <FechaNavigationSidebar
                fechas={fechas}
                selectedFechaId={selectedFechaId}
                onFechaSelect={handleFechaSelect}
                onFechaCreated={handleFechaCreated}
                onFechaUpdated={handleFechaUpdated}
                onFechaDeleted={handleFechaDeleted}
                tournamentId={tournamentId}
                permissions={permissions}
                isLoading={isLoading}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Main Content: Selected Fecha Details */}
            <ResizablePanel defaultSize={45} minSize={35}>
              <SelectedFechaContent
                selectedFecha={selectedFecha}
                tournamentId={tournamentId}
                permissions={permissions}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Panel: Actions */}
            <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
              <ActionsPanel
                selectedFecha={selectedFecha}
                tournamentId={tournamentId}
                permissions={permissions}
                onFechaUpdated={handleFechaUpdated}
                onTimeSlotChanged={handleTimeSlotChanged}
              />
            </ResizablePanel>

          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  )
}