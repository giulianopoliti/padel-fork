'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ArrowLeft, Calendar, Clock, Plus, ChevronDown } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { TournamentFecha } from '../../types'
import FechaManager from './FechaManager'
import TimeSlotManager from './TimeSlotManager'
import QuickActions from './QuickActions'

interface OrganizerScheduleViewProps {
  tournamentId: string
  tournamentName: string
  clubName: string
  fechas: TournamentFecha[]
  initialSelectedFechaId: string | null
  userRole: string
}

export default function OrganizerScheduleView({
  tournamentId,
  tournamentName,
  clubName,
  fechas: initialFechas,
  initialSelectedFechaId,
  userRole
}: OrganizerScheduleViewProps) {
  const [fechas, setFechas] = useState<TournamentFecha[]>(initialFechas)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const isMobile = useIsMobile()

  // Mobile collapsible state
  const [fechaManagerOpen, setFechaManagerOpen] = useState(!isMobile)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)

  // Get selected fecha from URL
  const selectedFechaId = searchParams.get('fecha_id') || initialSelectedFechaId
  const selectedFecha = fechas.find(f => f.id === selectedFechaId)

  const handleFechaSelect = (fechaId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('fecha_id', fechaId)
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleFechaCreated = (newFecha: TournamentFecha) => {
    setFechas(prev => [...prev, newFecha].sort((a, b) => a.fecha_number - b.fecha_number))
    handleFechaSelect(newFecha.id)
  }

  const handleFechaUpdated = (updatedFecha: TournamentFecha) => {
    setFechas(prev => prev.map(fecha =>
      fecha.id === updatedFecha.id ? updatedFecha : fecha
    ))
    router.refresh()
  }

  const handleFechaDeleted = (fechaId: string) => {
    setFechas(prev => prev.filter(fecha => fecha.id !== fechaId))
    if (selectedFechaId === fechaId) {
      const remainingFechas = fechas.filter(f => f.id !== fechaId)
      if (remainingFechas.length > 0) {
        handleFechaSelect(remainingFechas[0].id)
      } else {
        router.push(`${pathname}`)
      }
    }
  }

  const handleTimeSlotChanged = () => {
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
                <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                  {userRole === 'CLUB' ? 'Club' : 'Organizador'}
                </div>
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

      {/* Main Content - Responsive Layout */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-7xl mx-auto">
          {isMobile ? (
            /* Mobile: Vertical Stack with Collapsible Cards */
            <div className="space-y-4">
              {/* Fecha Management - Collapsible */}
              <Card>
                <Collapsible open={fechaManagerOpen} onOpenChange={setFechaManagerOpen}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Calendar className="h-5 w-5" />
                          Gestión de Fechas
                        </CardTitle>
                        <ChevronDown className={cn(
                          "h-4 w-4 transition-transform",
                          fechaManagerOpen && "rotate-180"
                        )} />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      <FechaManager
                        fechas={fechas}
                        selectedFechaId={selectedFechaId}
                        onFechaSelect={handleFechaSelect}
                        onFechaCreated={handleFechaCreated}
                        onFechaUpdated={handleFechaUpdated}
                        onFechaDeleted={handleFechaDeleted}
                        tournamentId={tournamentId}
                      />
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              {/* Main Content: Time Slot Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Gestión de Horarios
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TimeSlotManager
                    selectedFecha={selectedFecha}
                    tournamentId={tournamentId}
                    onTimeSlotChanged={handleTimeSlotChanged}
                  />
                </CardContent>
              </Card>

              {/* Quick Actions - Collapsible */}
              <Card>
                <Collapsible open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Plus className="h-5 w-5" />
                          Acciones Rápidas
                        </CardTitle>
                        <ChevronDown className={cn(
                          "h-4 w-4 transition-transform",
                          quickActionsOpen && "rotate-180"
                        )} />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      <QuickActions
                        selectedFecha={selectedFecha}
                        tournamentId={tournamentId}
                        onFechaUpdated={handleFechaUpdated}
                        onTimeSlotChanged={handleTimeSlotChanged}
                      />
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            </div>
          ) : (
            /* Desktop: Original Grid Layout */
            <div className="grid grid-cols-12 gap-6 h-[calc(100vh-240px)]">
              {/* Left Sidebar: Fecha Management */}
              <div className="col-span-3">
                <FechaManager
                  fechas={fechas}
                  selectedFechaId={selectedFechaId}
                  onFechaSelect={handleFechaSelect}
                  onFechaCreated={handleFechaCreated}
                  onFechaUpdated={handleFechaUpdated}
                  onFechaDeleted={handleFechaDeleted}
                  tournamentId={tournamentId}
                />
              </div>

              {/* Main Content: Time Slot Management */}
              <div className="col-span-6">
                <TimeSlotManager
                  selectedFecha={selectedFecha}
                  tournamentId={tournamentId}
                  onTimeSlotChanged={handleTimeSlotChanged}
                />
              </div>

              {/* Right Panel: Quick Actions */}
              <div className="col-span-3">
                <QuickActions
                  selectedFecha={selectedFecha}
                  tournamentId={tournamentId}
                  onFechaUpdated={handleFechaUpdated}
                  onTimeSlotChanged={handleTimeSlotChanged}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}