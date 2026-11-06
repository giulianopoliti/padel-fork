'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Calendar,
  Clock,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { TournamentFecha } from '../../types'
import { getBracketLabel } from '../../utils'
import { formatPeriod } from '@/app/(main)/schedules/display'

interface QuickActionsProps {
  selectedFecha: TournamentFecha | undefined
  tournamentId: string
  onFechaUpdated: (fecha: TournamentFecha) => void
  onTimeSlotChanged: () => void
}

export default function QuickActions({
  selectedFecha,
  tournamentId,
  onFechaUpdated,
  onTimeSlotChanged
}: QuickActionsProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4 text-blue-600" />
      case 'CANCELED':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800'
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800'
      case 'CANCELED':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-yellow-100 text-yellow-800'
    }
  }

  if (!selectedFecha) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Acciones Rápidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Selecciona una fecha</p>
            <p className="text-sm">para ver las acciones disponibles</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const timeSlotCount = selectedFecha._count_time_slots?.[0]?.count ?? 0

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Acciones Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fecha Info */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {getStatusIcon(selectedFecha.status)}
            <span className="font-medium truncate">{selectedFecha.name}</span>
          </div>

          <Badge className={getStatusColor(selectedFecha.status)}>
            {selectedFecha.status === 'IN_PROGRESS' ? 'Activa' :
             selectedFecha.status === 'COMPLETED' ? 'Completada' :
             selectedFecha.status === 'CANCELED' ? 'Cancelada' : 'Pendiente'}
          </Badge>

          {(selectedFecha.start_date || selectedFecha.end_date) && (
            <div className="text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 inline mr-1" />
              {formatPeriod(selectedFecha.start_date ?? null, selectedFecha.end_date ?? null)}
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            <Clock className="h-4 w-4 inline mr-1" />
            {timeSlotCount} {timeSlotCount === 1 ? 'horario' : 'horarios'}
          </div>

          {selectedFecha.round_type === 'ZONE' && (
            <Badge variant="outline">Fecha de posiciones</Badge>
          )}
          {selectedFecha.round_type !== 'ZONE' && (
            <Badge variant="outline">{getBracketLabel(selectedFecha.bracket_key)}</Badge>
          )}
        </div>

        <Separator />

        {/* Quick Stats */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Estadísticas</h4>

          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha N°:</span>
              <span className="font-medium">{selectedFecha.fecha_number}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Horarios:</span>
              <span className="font-medium">{timeSlotCount}</span>
            </div>

            {selectedFecha.max_matches_per_couple && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Máx. partidos:</span>
                <span className="font-medium">{selectedFecha.max_matches_per_couple}</span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Status Messages */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Estado</h4>

          <div className="space-y-2">
            {timeSlotCount === 0 && (
              <div className="text-xs text-muted-foreground p-2 bg-yellow-50 rounded border border-yellow-200">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                Esta fecha no tiene horarios configurados
              </div>
            )}

            {timeSlotCount > 0 && (
              <div className="text-xs text-muted-foreground p-2 bg-green-50 rounded border border-green-200">
                <CheckCircle2 className="h-4 w-4 inline mr-1" />
                Esta fecha tiene horarios cargados
              </div>
            )}
          </div>
        </div>

        {selectedFecha.description && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Descripción</h4>
              <p className="text-sm text-muted-foreground">
                {selectedFecha.description}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
