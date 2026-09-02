'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Calendar, Plus, Clock, Users, Settings } from 'lucide-react'
import { TournamentFecha } from '../../schedules/types'
import { useTournamentPermissions } from '@/hooks/use-tournament-permissions'
import CreateFechaModal from './CreateFechaModal'
import FechaCard from './FechaCard'

interface DatesContainerProps {
  tournamentId: string
  tournamentName: string
  clubName: string
  fechas: TournamentFecha[]
}

export default function DatesContainer({
  tournamentId,
  tournamentName,
  clubName,
  fechas: initialFechas
}: DatesContainerProps) {
  const [fechas, setFechas] = useState<TournamentFecha[]>(initialFechas)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const { permissions, isLoading } = useTournamentPermissions(tournamentId)

  const handleFechaCreated = (newFecha: TournamentFecha) => {
    setFechas(prev => [...prev, newFecha].sort((a, b) => a.fecha_number - b.fecha_number))
  }

  const handleFechaUpdated = (updatedFecha: TournamentFecha) => {
    setFechas(prev => prev.map(fecha => 
      fecha.id === updatedFecha.id ? updatedFecha : fecha
    ))
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
              
              {isLoading ? (
                <Button disabled className="w-fit">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Cargando...
                </Button>
              ) : permissions.hasPermission ? (
                <Button onClick={() => setShowCreateModal(true)} className="w-fit">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Fecha
                </Button>
              ) : null}
            </div>

            {/* Title */}
            <div className="flex items-start gap-3 lg:gap-4">
              <div className="bg-green-100 p-2 lg:p-3 rounded-elevated">
                <Calendar className="h-5 w-5 lg:h-6 lg:w-6 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-2 truncate">
                  Gestión de Fechas - {tournamentName}
                </h1>
                
                <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm text-slate-600">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3 lg:h-4 lg:w-4" />
                    <span>{clubName}</span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 lg:h-4 lg:w-4" />
                    <span>{fechas.length} {fechas.length === 1 ? 'fecha configurada' : 'fechas configuradas'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-7xl mx-auto">
          
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-surface p-4 mb-6">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">
                  📅 Gestión de Fechas del Torneo
                </h3>
                <p className="text-blue-700 text-sm">
                  Configura las fechas conceptuales de tu torneo (Posiciones, Cuartos, etc.).
                  Cada fecha puede tener múltiples horarios y configuraciones específicas.
                </p>
              </div>
            </div>
          </div>

          {/* Fechas List */}
          {fechas.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin fechas configuradas</h3>
                <p className="text-gray-600 mb-4">
                  Crea la primera fecha para organizar tu torneo. Puedes configurar fechas 
                  clasificatorias, eliminatorias, y más.
                </p>
                {isLoading ? (
                  <Button disabled>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Cargando...
                  </Button>
                ) : permissions.hasPermission ? (
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Primera Fecha
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {fechas.map((fecha) => (
                <FechaCard
                  key={fecha.id}
                  fecha={fecha}
                  tournamentId={tournamentId}
                  onUpdate={handleFechaUpdated}
                />
              ))}
            </div>
          )}

          {/* Create Fecha Modal */}
          {permissions.hasPermission && (
            <CreateFechaModal
              isOpen={showCreateModal}
              onClose={() => setShowCreateModal(false)}
              tournamentId={tournamentId}
              nextFechaNumber={fechas.length + 1}
              onSuccess={handleFechaCreated}
            />
          )}

        </div>
      </div>
    </div>
  )
}
