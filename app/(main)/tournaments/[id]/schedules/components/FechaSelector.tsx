'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TournamentFecha } from '../types'
import { formatDate, getBracketBadgeClass, getBracketLabel } from '../utils'
import { LoadingSpinner } from './LoadingStates'

interface FechaSelectorProps {
  tournamentId: string
  fechas: TournamentFecha[]
  selectedFechaId: string
}

export default function FechaSelector({ 
  tournamentId, 
  fechas, 
  selectedFechaId 
}: FechaSelectorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [bracketFilter, setBracketFilter] = useState<'ALL' | 'MAIN' | 'GOLD' | 'SILVER'>('ALL')
  
  const selectedFecha = fechas.find(f => f.id === selectedFechaId)
  const hasBracketSplit = fechas.some(f => f.bracket_key === 'GOLD' || f.bracket_key === 'SILVER')

  const filteredFechas = useMemo(() => {
    if (bracketFilter === 'ALL') return fechas
    return fechas.filter(fecha => fecha.bracket_key === bracketFilter)
  }, [fechas, bracketFilter])

  const selectableFechas = filteredFechas.length > 0 ? filteredFechas : fechas

  const handleFechaChange = (fechaId: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('fecha_id', fechaId)
      router.push(`/tournaments/${tournamentId}/schedules?${params.toString()}`)
    })
  }

  const getStatusColor = (status: string) => {
    const colors = {
      'NOT_STARTED': 'bg-gray-100 text-gray-800',
      'SCHEDULING': 'bg-blue-100 text-blue-800',
      'IN_PROGRESS': 'bg-green-100 text-green-800',
      'COMPLETED': 'bg-purple-100 text-purple-800',
      'CANCELED': 'bg-red-100 text-red-800'
    }
    return colors[status as keyof typeof colors] || colors.NOT_STARTED
  }

  const getStatusLabel = (status: string) => {
    const labels = {
      'NOT_STARTED': 'No iniciada',
      'SCHEDULING': 'Programando',
      'IN_PROGRESS': 'En progreso',
      'COMPLETED': 'Completada',
      'CANCELED': 'Cancelada'
    }
    return labels[status as keyof typeof labels] || status
  }

  if (fechas.length === 0) {
    return (
      <Card className="mb-6 bg-slate-50 border-dashed">
        <CardContent className="p-8 text-center">
          <div className="bg-slate-200 p-4 rounded-full w-fit mx-auto mb-4">
            <Calendar className="h-8 w-8 text-slate-500" />
          </div>
          <p className="text-slate-600 font-medium">No hay fechas disponibles para este torneo.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mb-6 space-y-5">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:hidden" aria-label="Seleccionar fecha">
        {selectableFechas.map((fecha) => (
          <button
            key={fecha.id}
            type="button"
            onClick={() => handleFechaChange(fecha.id)}
            disabled={isPending}
            aria-pressed={fecha.id === selectedFechaId}
            className={`min-h-12 shrink-0 rounded-display border px-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              fecha.id === selectedFechaId
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground'
            }`}
          >
            <span className="block text-xs font-bold">Fecha {fecha.fecha_number}</span>
            <span className="block max-w-36 truncate text-xs opacity-80">{fecha.name}</span>
          </button>
        ))}
      </div>

      {/* Fecha Selector */}
      <Card className="hidden border-2 border-border shadow-sm sm:block">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <Label className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Seleccionar Fecha:
              </Label>

              <Select
                value={selectedFechaId}
                onValueChange={handleFechaChange}
                disabled={isPending}
              >
                <SelectTrigger className="w-full sm:w-80 h-11 border-2">
                  <SelectValue placeholder="Selecciona una fecha" />
                  {isPending && <LoadingSpinner size="sm" />}
                </SelectTrigger>
                <SelectContent>
                  {selectableFechas.map((fecha) => (
                    <SelectItem key={fecha.id} value={fecha.id}>
                      <div className="flex items-center gap-3 py-1">
                        <div className="flex flex-col">
                          <span className="font-semibold flex items-center gap-2">
                            {fecha.name} (Fecha {fecha.fecha_number})
                            {fecha.round_type !== 'ZONE' && (
                              <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${getBracketBadgeClass(fecha.bracket_key)}`}>
                                {getBracketLabel(fecha.bracket_key)}
                              </span>
                            )}
                          </span>
                          {fecha.description && (
                            <span className="text-xs text-muted-foreground">
                              {fecha.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quick navigation for adjacent fechas */}
            {selectableFechas.length > 1 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => {
                    const currentIndex = selectableFechas.findIndex(f => f.id === selectedFechaId)
                    const prevIndex = currentIndex > 0 ? currentIndex - 1 : selectableFechas.length - 1
                    handleFechaChange(selectableFechas[prevIndex].id)
                  }}
                  disabled={isPending}
                  className="gap-1 border-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => {
                    const currentIndex = selectableFechas.findIndex(f => f.id === selectedFechaId)
                    const nextIndex = currentIndex < selectableFechas.length - 1 ? currentIndex + 1 : 0
                    handleFechaChange(selectableFechas[nextIndex].id)
                  }}
                  disabled={isPending}
                  className="gap-1 border-2"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {hasBracketSplit && (
        <Card className="border border-slate-200">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={bracketFilter === 'ALL' ? 'default' : 'outline'}
                onClick={() => setBracketFilter('ALL')}
              >
                Todas
              </Button>
              <Button
                type="button"
                size="sm"
                variant={bracketFilter === 'GOLD' ? 'default' : 'outline'}
                onClick={() => setBracketFilter('GOLD')}
              >
                Copa de Oro
              </Button>
              <Button
                type="button"
                size="sm"
                variant={bracketFilter === 'SILVER' ? 'default' : 'outline'}
                onClick={() => setBracketFilter('SILVER')}
              >
                Copa de Plata
              </Button>
              <Button
                type="button"
                size="sm"
                variant={bracketFilter === 'MAIN' ? 'default' : 'outline'}
                onClick={() => setBracketFilter('MAIN')}
              >
                Principal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected Fecha Info */}
      {selectedFecha && (
          <Card className="border-l-4 border-l-primary bg-card shadow-sm">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-bold text-xl text-slate-900">
                    {selectedFecha.name}
                  </h3>
                  <Badge
                    variant="secondary"
                    className={`${getStatusColor(selectedFecha.status)} font-semibold shadow-sm`}
                  >
                    {getStatusLabel(selectedFecha.status)}
                  </Badge>
                  {selectedFecha.round_type === 'ZONE' && (
                    <Badge variant="outline" className="border-2 border-purple-300 text-purple-700 font-medium">
                      Tablas de posiciones
                    </Badge>
                  )}
                  {selectedFecha.round_type !== 'ZONE' && (
                    <Badge variant="outline" className={getBracketBadgeClass(selectedFecha.bracket_key)}>
                      {getBracketLabel(selectedFecha.bracket_key)}
                    </Badge>
                  )}
                </div>

                <Separator />

                {selectedFecha.description && (
                  <div className="rounded-surface border border-primary/15 bg-primary/5 p-3">
                    <p className="text-sm text-slate-700 font-medium">
                      {selectedFecha.description}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-surface">
                    <Calendar className="h-4 w-4 text-slate-600" />
                    <span className="font-medium text-slate-700">Fecha {selectedFecha.fecha_number}</span>
                  </div>

                  {(selectedFecha.start_date || selectedFecha.end_date) && (
                    <div className="flex items-center gap-2 rounded-surface bg-primary/10 px-3 py-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="font-medium text-primary">
                        {selectedFecha.start_date && selectedFecha.end_date ? (
                          <>{formatDate(selectedFecha.start_date)} - {formatDate(selectedFecha.end_date)}</>
                        ) : selectedFecha.start_date ? (
                          <>Desde {formatDate(selectedFecha.start_date)}</>
                        ) : (
                          <>Hasta {formatDate(selectedFecha.end_date!)}</>
                        )}
                      </span>
                    </div>
                  )}

                  {selectedFecha.max_matches_per_couple && (
                    <div className="flex items-center bg-gradient-to-r from-orange-100 to-amber-100 text-orange-800 px-3 py-2 rounded-surface border border-orange-200">
                      <span className="text-xs font-bold">
                        Máx. {selectedFecha.max_matches_per_couple} partidos por pareja
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading overlay */}
      {isPending && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="p-6 shadow-2xl border-2">
            <div className="flex items-center gap-4">
              <LoadingSpinner size="md" />
              <div>
                <span className="font-semibold text-lg">Cambiando fecha...</span>
                <p className="text-sm text-muted-foreground">Por favor espera</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
