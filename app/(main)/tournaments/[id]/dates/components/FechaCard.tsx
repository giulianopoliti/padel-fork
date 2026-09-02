'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, Users, Settings, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { TournamentFecha } from '../../schedules/types'
import { getBracketLabel } from '../../schedules/utils'

interface FechaCardProps {
  fecha: TournamentFecha
  tournamentId: string
  onUpdate: (fecha: TournamentFecha) => void
}

export default function FechaCard({ fecha, tournamentId, onUpdate }: FechaCardProps) {
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'NOT_STARTED': { label: 'No Iniciada', variant: 'secondary' as const },
      'SCHEDULING': { label: 'Programando', variant: 'outline' as const },
      'IN_PROGRESS': { label: 'En Progreso', variant: 'default' as const },
      'COMPLETED': { label: 'Completada', variant: 'destructive' as const },
      'CANCELED': { label: 'Cancelada', variant: 'destructive' as const }
    }
    
    return statusConfig[status as keyof typeof statusConfig] || statusConfig.NOT_STARTED
  }

  const statusBadge = getStatusBadge(fecha.status)

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="bg-green-100 p-2 rounded-surface">
              <Calendar className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-lg">
                Fecha {fecha.fecha_number}: {fecha.name}
              </CardTitle>
              {fecha.description && (
                <p className="text-sm text-gray-600 mt-1">{fecha.description}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant={statusBadge.variant}>
              {statusBadge.label}
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
              {fecha.round_type === 'ZONE' ? 'Tabla de posiciones' : 'Eliminatoria'}
            </Badge>
            {fecha.round_type !== 'ZONE' && (
              <Badge variant="outline">
                {getBracketLabel(fecha.bracket_key)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          
          {/* Fechas */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <div className="text-sm">
              <div className="font-medium">Período</div>
              <div className="text-gray-600">
                {fecha.start_date && fecha.end_date ? (
                  <>
                    {new Date(fecha.start_date).toLocaleDateString('es-ES')} - {new Date(fecha.end_date).toLocaleDateString('es-ES')}
                  </>
                ) : (
                  'Sin definir'
                )}
              </div>
            </div>
          </div>

          {/* Límite de partidos */}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <div className="text-sm">
              <div className="font-medium">Límite por pareja</div>
              <div className="text-gray-600">
                {fecha.max_matches_per_couple ? `${fecha.max_matches_per_couple} partidos` : 'Sin límite'}
              </div>
            </div>
          </div>

          {/* Tipo */}
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-gray-500" />
            <div className="text-sm">
              <div className="font-medium">Tipo</div>
              <div className="text-gray-600">
                {fecha.round_type === 'ZONE' ? 'Tabla de posiciones' : `Eliminatoria (${getBracketLabel(fecha.bracket_key)})`}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          <Button asChild variant="outline" size="sm">
            <Link href={`/tournaments/${tournamentId}/schedules?fecha_id=${fecha.id}`}>
              <Clock className="h-4 w-4 mr-2" />
              Ver Horarios
            </Link>
          </Button>
          
          <Button variant="outline" size="sm" disabled>
            <Settings className="h-4 w-4 mr-2" />
            Configurar
          </Button>

          <Button variant="outline" size="sm" disabled>
            <ExternalLink className="h-4 w-4 mr-2" />
            Partidos
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
