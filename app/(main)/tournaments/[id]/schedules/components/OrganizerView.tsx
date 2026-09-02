'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Clock, Users, AlertCircle } from 'lucide-react'
import { UserAccess, ScheduleData } from '../types'
import { getScheduleData } from '../actions'
import { ScheduleMatrixSkeleton } from './LoadingStates'
import { InlineError } from './ErrorStates'
import CreateTimeSlotModal from './CreateTimeSlotModal'

interface OrganizerViewProps {
  tournamentId: string
  fechaId: string
  userAccess: UserAccess
}

export default function OrganizerView({
  tournamentId,
  fechaId,
  userAccess: _userAccess,
}: OrganizerViewProps) {
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const loadScheduleData = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await getScheduleData(tournamentId, fechaId)
        if (result.success) {
          setScheduleData(result.data as any)
        } else {
          setError(result.error as any)
        }
      } catch (err) {
        setError('Error inesperado al cargar los datos')
        console.error('Error loading schedule data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadScheduleData()
  }, [tournamentId, fechaId, refreshKey])

  const handleRetry = () => setRefreshKey((prev) => prev + 1)
  const handleCreateSuccess = () => handleRetry()

  if (loading) return <ScheduleMatrixSkeleton />
  if (error) return <InlineError message={error} onRetry={handleRetry} />
  if (!scheduleData) {
    return <InlineError message="No se pudieron cargar los datos de horarios" onRetry={handleRetry} />
  }

  const { timeSlots } = scheduleData as any
  const allCouples = new Set<string>()

  timeSlots?.forEach((slot: any) => {
    slot.availableCouples?.forEach((availability: any) => {
      if (availability.couple) {
        allCouples.add(availability.couple.id)
      }
    })
  })

  const couplesCount = allCouples.size

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Gestion de Horarios</h2>
          <p className="text-gray-600">Administra los horarios disponibles para esta fecha</p>
        </div>

        <Button className="sm:w-auto" onClick={() => setShowCreateModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Crear Horario
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Horarios Creados</p>
                <p className="text-2xl font-bold">{timeSlots?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Parejas Inscritas</p>
                <p className="text-2xl font-bold">{couplesCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600">Disponibilidades</p>
                <p className="text-2xl font-bold">
                  {timeSlots.reduce(
                    (total: number, slot: any) => total + (slot.availableCouples?.length || 0),
                    0
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {timeSlots.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Clock className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-semibold">Sin horarios configurados</h3>
            <p className="mb-4 text-gray-600">
              Crea el primer horario para que las parejas puedan marcar su disponibilidad.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear Primer Horario
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {timeSlots.map((timeSlot: any) => (
            <TimeSlotCard key={timeSlot.id} timeSlot={timeSlot} totalCouples={couplesCount} />
          ))}
        </div>
      )}

      <CreateTimeSlotModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        fechaId={fechaId}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}

interface TimeSlotCardProps {
  timeSlot: any
  totalCouples: number
}

function TimeSlotCard({ timeSlot, totalCouples }: TimeSlotCardProps) {
  const availableCouples = timeSlot.availableCouples || []
  const availabilityRate = totalCouples > 0 ? (availableCouples.length / totalCouples) * 100 : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {timeSlot.court_name || `Horario ${timeSlot.start_time}`}
            </CardTitle>
            <p className="text-gray-600">
              {timeSlot.start_time} - {timeSlot.end_time}
              {timeSlot.date && ` • ${new Date(timeSlot.date).toLocaleDateString()}`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Disponibilidad</div>
            <div className="text-lg font-bold text-green-600">
              {availableCouples.length}/{totalCouples}
            </div>
            <div className="text-xs text-gray-500">{availabilityRate.toFixed(0)}%</div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {timeSlot.description && <p className="mb-4 text-gray-600">{timeSlot.description}</p>}

        {availableCouples.length > 0 ? (
          <div>
            <h4 className="mb-2 font-medium">Parejas Disponibles:</h4>
            <div className="space-y-2">
              {availableCouples.map((availability: any) => (
                <div
                  key={availability.couple_id}
                  className="rounded-control border border-green-100 bg-green-50 p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium">
                      {`${availability.couple.player1?.first_name || ''} ${availability.couple.player1?.last_name || ''}`.trim()}{' '}
                      /{' '}
                      {`${availability.couple.player2?.first_name || ''} ${availability.couple.player2?.last_name || ''}`.trim()}
                    </span>
                  </div>
                  {availability.notes && (
                    <div className="ml-4 mt-2 rounded border-l-2 border-blue-300 bg-blue-50 p-2 text-xs text-gray-700">
                      <span className="font-medium text-blue-800">Nota:</span> {availability.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-gray-500">
            <AlertCircle className="mx-auto mb-2 h-6 w-6" />
            <p>Ninguna pareja disponible en este horario</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
