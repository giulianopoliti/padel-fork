'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Calendar, Loader2, X, Check, AlertCircle } from 'lucide-react'
import { TournamentFecha } from '../../schedules/types'
import { createTournamentFecha, CreateFechaData } from '../../dates/actions'
import { toast } from 'sonner'
import RoundSelector, { RoundType } from './RoundSelector'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { resolveFechaBracketKeyForTournament } from '@/lib/services/fecha-bracket-policy'

interface InlineCreateFechaFormProps {
  tournamentId: string
  nextFechaNumber: number
  onSuccess: (fecha: TournamentFecha) => void
  onCancel: () => void
}

export default function InlineCreateFechaForm({
  tournamentId,
  nextFechaNumber,
  onSuccess,
  onCancel
}: InlineCreateFechaFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGoldSilverLong, setIsGoldSilverLong] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    round_type: 'ZONE' as RoundType,
    bracket_key: 'MAIN' as 'MAIN' | 'GOLD' | 'SILVER',
  })

  useEffect(() => {
    const fetchTournamentFormat = async () => {
      try {
        const supabase = createClientComponentClient()
        const { data: tournament } = await supabase
          .from('tournaments')
          .select('type, format_config')
          .eq('id', tournamentId)
          .single()

        if (!tournament) {
          setIsGoldSilverLong(false)
          return
        }

        const checkResult = resolveFechaBracketKeyForTournament(tournament as any, {
          roundType: 'SEMIFINAL',
          requestedBracketKey: 'GOLD',
        })

        setIsGoldSilverLong(tournament.type === 'LONG' && checkResult.ok)
      } catch (fetchError) {
        console.error('Error fetching tournament format:', fetchError)
        setIsGoldSilverLong(false)
      }
    }

    fetchTournamentFormat()
  }, [tournamentId])

  useEffect(() => {
    if (formData.round_type === 'ZONE' && formData.bracket_key !== 'MAIN') {
      setFormData(prev => ({ ...prev, bracket_key: 'MAIN' }))
    }
  }, [formData.round_type, formData.bracket_key])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const fechaData: CreateFechaData = {
        tournament_id: tournamentId,
        fecha_number: nextFechaNumber,
        name: formData.name,
        description: formData.description || undefined,
        start_date: formData.start_date || undefined,
        end_date: formData.end_date || undefined,
        round_type: formData.round_type,
        bracket_key: formData.bracket_key,
      }

      const result = await createTournamentFecha(fechaData)

      if (result.success && result.data) {
        onSuccess(result.data as TournamentFecha)
        toast.success(result.message || `Fecha ${nextFechaNumber} creada exitosamente`)
      } else {
        throw new Error(result.error || 'Error desconocido al crear la fecha')
      }

    } catch (error: any) {
      console.error('Error creating fecha:', error)
      setError(error.message || 'Error al crear la fecha. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (!loading) {
      onCancel()
    }
  }

  return (
    <Card className="border-blue-200 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            Nueva Fecha del Torneo
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Fecha #{nextFechaNumber}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={loading}
              className="h-6 w-6 p-0 hover:bg-gray-100"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="inline-name" className="text-xs font-medium">
              Nombre de la Fecha *
            </Label>
            <Input
              id="inline-name"
              placeholder="ej: Tabla de posiciones, Cuartos de Final..."
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
              disabled={loading}
              className="text-sm"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="inline-description" className="text-xs font-medium">
              Descripción (opcional)
            </Label>
            <Textarea
              id="inline-description"
              placeholder="Detalles adicionales..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              disabled={loading}
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="inline-start-date" className="text-xs font-medium">
                Fecha Inicio
              </Label>
              <Input
                id="inline-start-date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                disabled={loading}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inline-end-date" className="text-xs font-medium">
                Fecha Fin
              </Label>
              <Input
                id="inline-end-date"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                disabled={loading}
                className="text-sm"
              />
            </div>
          </div>

          {/* Round Type Selector */}
          <RoundSelector
            tournamentId={tournamentId}
            value={formData.round_type}
            onChange={(round) => setFormData(prev => ({ ...prev, round_type: round }))}
            disabled={loading}
            required={true}
          />

          {formData.round_type !== 'ZONE' && isGoldSilverLong && (
            <div className="space-y-2">
              <Label htmlFor="inline-bracket-key" className="text-xs font-medium">
                Copa de la Llave
              </Label>
              <select
                id="inline-bracket-key"
                value={formData.bracket_key}
                onChange={(e) =>
                  setFormData(prev => ({
                    ...prev,
                    bracket_key: e.target.value as 'MAIN' | 'GOLD' | 'SILVER'
                  }))
                }
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-control focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="GOLD">Copa de Oro</option>
                <option value="SILVER">Copa de Plata</option>
              </select>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={loading}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !formData.name.trim()}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Check className="h-3 w-3 mr-2" />
                  Crear Fecha
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
