'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Trophy, Target } from 'lucide-react'

export type RoundType = 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL'

export interface RoundOption {
  value: RoundType
  label: string
  description: string
}

// Mapeo de rounds a UI amigable
const ROUND_LABELS: Record<RoundType, string> = {
  'ZONE': 'Tabla de posiciones',
  '32VOS': '32vos de Final',
  '16VOS': '16vos de Final',
  '8VOS': 'Octavos de Final',
  '4TOS': 'Cuartos de Final',
  'SEMIFINAL': 'Semifinal',
  'FINAL': 'Final'
}

interface RoundSelectorProps {
  tournamentId: string
  value?: RoundType
  onChange: (round: RoundType) => void
  disabled?: boolean
  required?: boolean
}

export default function RoundSelector({
  tournamentId,
  value,
  onChange,
  disabled = false,
  required = true
}: RoundSelectorProps) {
  const [availableRounds, setAvailableRounds] = useState<RoundOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAvailableRounds()
  }, [tournamentId])

  const loadAvailableRounds = async () => {
    try {
      setLoading(true)
      setError(null)

      // Llamar al API endpoint
      const response = await fetch(`/api/tournaments/${tournamentId}/available-rounds`)
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Error al cargar rondas')
      }

      setAvailableRounds(data.rounds)

      // Si no hay valor seleccionado, usar el por defecto
      if (!value && data.rounds.length > 0) {
        onChange(data.defaultRound)
      }

    } catch (err) {
      console.error('Error loading available rounds:', err)
      setError('Error al cargar las rondas disponibles')

      // Fallback: mostrar solo ZONE
      const fallbackRounds = [{
        value: 'ZONE' as RoundType,
        label: ROUND_LABELS.ZONE,
        description: 'Fase clasificatoria por zonas'
      }]
      setAvailableRounds(fallbackRounds)
      if (!value) {
        onChange('ZONE')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleValueChange = (selectedValue: string) => {
    onChange(selectedValue as RoundType)
  }

  const getRoundIcon = (round: RoundType) => {
    return round === 'ZONE' ? Target : Trophy
  }

  const getRoundBadgeVariant = (round: RoundType) => {
    switch (round) {
      case 'ZONE':
        return 'default'
      case 'FINAL':
        return 'destructive'
      case 'SEMIFINAL':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Label className="text-xs font-medium">
          Tipo de Ronda {required && '*'}
        </Label>
        <div className="flex items-center gap-2 p-3 border rounded-control bg-gray-50">
          <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          <span className="text-sm text-gray-600">Cargando rondas disponibles...</span>
        </div>
      </div>
    )
  }

  if (error || availableRounds.length === 0) {
    return (
      <div className="space-y-2">
        <Label className="text-xs font-medium">
          Tipo de Ronda {required && '*'}
        </Label>
        <div className="p-3 border rounded-control bg-red-50 border-red-200">
          <p className="text-sm text-red-600">
            {error || 'No hay rondas disponibles'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="round-selector" className="text-xs font-medium">
        Tipo de Ronda {required && '*'}
      </Label>

      <Select
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger id="round-selector" className="text-sm">
          <SelectValue placeholder="Seleccionar ronda..." />
        </SelectTrigger>

        <SelectContent>
          {availableRounds.map((round) => {
            const Icon = getRoundIcon(round.value)
            return (
              <SelectItem
                key={round.value}
                value={round.value}
                className="cursor-pointer"
              >
                <div className="flex items-center gap-2 w-full">
                  <Icon className="h-4 w-4 text-gray-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{round.label}</span>
                      <Badge
                        variant={getRoundBadgeVariant(round.value)}
                        className="text-xs"
                      >
                        {round.value}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {round.description}
                    </p>
                  </div>
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      {/* Info sobre la ronda seleccionada */}
      {value && (
        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-control">
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = getRoundIcon(value)
              return <Icon className="h-3 w-3 text-blue-600" />
            })()}
            <p className="text-xs text-blue-700">
              {availableRounds.find(r => r.value === value)?.description}
            </p>
          </div>
        </div>
      )}

      {/* Información adicional */}
      <div className="text-xs text-gray-500">
        {availableRounds.length === 1 ? (
          'Solo esta ronda está disponible basándose en los matches generados'
        ) : (
          `${availableRounds.length} rondas disponibles basándose en el bracket actual`
        )}
      </div>
    </div>
  )
}
