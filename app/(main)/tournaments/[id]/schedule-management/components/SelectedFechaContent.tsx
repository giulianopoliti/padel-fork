'use client'

import { useState, useEffect, Suspense } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Calendar,
  Clock,
  Users,
  Settings,
  AlertCircle,
  CheckCircle2,
  Plus,
  Info
} from 'lucide-react'
import { TournamentFecha } from '../../schedules/types'
import { UserPermissions } from '@/hooks/use-tournament-permissions'
import { getScheduleData } from '../../schedules/actions'
import { Button } from '@/components/ui/button'
import { getBracketLabel } from '../../schedules/utils'

interface SelectedFechaContentProps {
  selectedFecha: TournamentFecha | undefined
  tournamentId: string
  permissions: UserPermissions
}

export default function SelectedFechaContent({
  selectedFecha,
  tournamentId,
  permissions
}: SelectedFechaContentProps) {
  const [scheduleData, setScheduleData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load schedule data when fecha changes
  useEffect(() => {
    if (!selectedFecha) {
      setScheduleData(null)
      return
    }

    const loadScheduleData = async () => {
      console.log('[SelectedFechaContent] Loading schedule data for fecha:', selectedFecha.id)
      setLoading(true)
      setError(null)

      try {
        const result = await getScheduleData(tournamentId, selectedFecha.id)
        if (result.success) {
          console.log('[SelectedFechaContent] Schedule data loaded:', result.data)
          setScheduleData(result.data)
        } else {
          setError(result.error as string)
        }
      } catch (err) {
        setError('Error al cargar los horarios')
        console.error('Error loading schedule data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadScheduleData()
  }, [selectedFecha?.id, tournamentId])

  if (!selectedFecha) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Selecciona una Fecha
          </h3>
          <p className="text-gray-500">
            Elige una fecha del panel izquierdo para ver y gestionar sus horarios,
            o crea una nueva fecha para comenzar.
          </p>
        </div>
      </div>
    )
  }

  const timeSlots = scheduleData?.timeSlots || []
  const isZoneRound = selectedFecha.round_type === 'ZONE'
  const fechaStatusLabel =
    selectedFecha.status === 'IN_PROGRESS'
      ? 'En juego'
      : selectedFecha.status === 'COMPLETED'
        ? 'Completada'
        : selectedFecha.status === 'CANCELED'
          ? 'Cancelada'
          : selectedFecha.status === 'SCHEDULING'
            ? 'En planificación'
            : 'Pendiente'
  const totalCouples = scheduleData ? new Set(
    timeSlots.flatMap((slot: any) =>
      slot.availableCouples?.map((a: any) => a.couple_id) || []
    )
  ).size : 0

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-semibold text-gray-900 truncate">
                {selectedFecha.name}
              </h1>
              <Badge
                variant={isZoneRound ? "default" : "secondary"}
                className="text-xs"
              >
                {isZoneRound ? 'Tabla de posiciones' : `Eliminatoria (${getBracketLabel(selectedFecha.bracket_key)})`}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Fecha #{selectedFecha.fecha_number}
              </Badge>
            </div>

            {selectedFecha.description && (
              <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                {selectedFecha.description}
              </p>
            )}

            {/* Date Range */}
            {selectedFecha.start_date && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar className="h-4 w-4" />
                <span>
                  {new Date(selectedFecha.start_date).toLocaleDateString('es-ES')}
                  {selectedFecha.end_date && selectedFecha.end_date !== selectedFecha.start_date &&
                    ` - ${new Date(selectedFecha.end_date).toLocaleDateString('es-ES')}`
                  }
                </span>
              </div>
            )}
          </div>

          {/* Status Indicator */}
          <div className="text-right">
            {timeSlots.length > 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Configurada</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-400">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm font-medium">Sin horarios</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-blue-50 rounded-surface">
            <Clock className="h-5 w-5 text-blue-600 mx-auto mb-1" />
            <div className="text-lg font-semibold text-blue-900">{timeSlots.length}</div>
            <div className="text-xs text-blue-600">Horarios</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-surface">
            <Users className="h-5 w-5 text-green-600 mx-auto mb-1" />
            <div className="text-lg font-semibold text-green-900">{totalCouples}</div>
            <div className="text-xs text-green-600">Parejas</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-surface">
            <Calendar className="h-5 w-5 text-purple-600 mx-auto mb-1" />
            <div className="text-lg font-semibold text-purple-900">
              {timeSlots.reduce((total: number, slot: any) =>
                total + (slot.availableCouples?.length || 0), 0
              )}
            </div>
            <div className="text-xs text-purple-600">Disponibilidades</div>
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="flex-1 p-6">
        <Tabs defaultValue="overview" className="h-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="timeslots">Horarios</TabsTrigger>
            <TabsTrigger value="availability">Disponibilidad</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4">
            <div className="space-y-4">
              {/* Configuration Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Estado de Configuración
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {timeSlots.length === 0 ? (
                    <div className="text-center py-6">
                      <AlertCircle className="h-8 w-8 text-orange-500 mx-auto mb-3" />
                      <h3 className="font-medium text-gray-900 mb-2">
                        Fecha sin configurar
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Esta fecha aún no tiene horarios configurados.
                        Las parejas no podrán marcar disponibilidad hasta que agregues horarios.
                      </p>
                      {permissions.hasPermission && (
                        <Button size="sm" className="mt-2">
                          <Plus className="h-4 w-4 mr-2" />
                          Agregar Primer Horario
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-green-50 rounded-surface">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-900">
                            Horarios configurados
                          </span>
                        </div>
                        <Badge variant="secondary">{timeSlots.length}</Badge>
                      </div>

                      {totalCouples > 0 && (
                        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-surface">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-900">
                              Parejas participando
                            </span>
                          </div>
                          <Badge variant="secondary">{totalCouples}</Badge>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tournament Phase Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Información de la Fase
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Tipo de fase:</span>
                      <Badge variant={isZoneRound ? "default" : "secondary"}>
                        {isZoneRound ? 'Tabla de posiciones' : `Eliminatoria (${getBracketLabel(selectedFecha.bracket_key)})`}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Número de fecha:</span>
                      <span className="text-sm font-medium">#{selectedFecha.fecha_number}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Estado:</span>
                      <Badge variant={selectedFecha.status === 'IN_PROGRESS' ? "default" : "secondary"}>
                        {fechaStatusLabel}
                      </Badge>
                    </div>

                    {selectedFecha.max_matches_per_couple && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Máx. partidos por pareja:</span>
                        <span className="text-sm font-medium">{selectedFecha.max_matches_per_couple}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Time Slots Tab */}
          <TabsContent value="timeslots" className="mt-4">
            <ScrollArea className="h-[400px]">
              <Suspense fallback={<div>Cargando horarios...</div>}>
                <TimeSlotsList
                  timeSlots={timeSlots}
                  loading={loading}
                  error={error}
                  permissions={permissions}
                />
              </Suspense>
            </ScrollArea>
          </TabsContent>

          {/* Availability Tab */}
          <TabsContent value="availability" className="mt-4">
            <ScrollArea className="h-[400px]">
              <Suspense fallback={<div>Cargando disponibilidad...</div>}>
                <AvailabilityMatrix
                  timeSlots={timeSlots}
                  totalCouples={totalCouples}
                  loading={loading}
                  error={error}
                />
              </Suspense>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// Placeholder components - to be implemented
function TimeSlotsList({ timeSlots, loading, error, permissions }: any) {
  if (loading) return <div className="text-center py-4">Cargando...</div>
  if (error) return <div className="text-center py-4 text-red-600">{error}</div>
  if (timeSlots.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Clock className="h-8 w-8 text-gray-400 mx-auto mb-3" />
          <h3 className="font-medium text-gray-900 mb-2">Sin horarios</h3>
          <p className="text-sm text-gray-600">
            Esta fecha no tiene horarios configurados aún.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {timeSlots.map((slot: any) => (
        <Card key={slot.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {slot.court_name || `Horario ${slot.start_time}`}
            </CardTitle>
            <CardDescription>
              {slot.start_time} - {slot.end_time}
              {slot.date && ` • ${new Date(slot.date).toLocaleDateString()}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Parejas disponibles:</span>
              <Badge variant="secondary">
                {slot.availableCouples?.length || 0}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function AvailabilityMatrix({ timeSlots, totalCouples, loading, error }: any) {
  if (loading) return <div className="text-center py-4">Cargando...</div>
  if (error) return <div className="text-center py-4 text-red-600">{error}</div>

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Matriz de Disponibilidad</CardTitle>
        <CardDescription>
          Vista general de la disponibilidad de parejas por horario
        </CardDescription>
      </CardHeader>
      <CardContent>
        {timeSlots.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            Sin horarios configurados
          </div>
        ) : (
          <div className="space-y-2">
            {timeSlots.map((slot: any) => {
              const availabilityRate = totalCouples > 0 ?
                ((slot.availableCouples?.length || 0) / totalCouples) * 100 : 0

              return (
                <div key={slot.id} className="flex items-center gap-3 p-2 border rounded">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {slot.start_time} - {slot.end_time}
                    </div>
                    <div className="text-xs text-gray-500">
                      {slot.availableCouples?.length || 0} de {totalCouples} parejas
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {availabilityRate.toFixed(0)}%
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
