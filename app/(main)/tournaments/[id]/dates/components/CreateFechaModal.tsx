'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar, Loader2 } from 'lucide-react'
import { TournamentFecha } from '../../schedules/types'
import { toast } from 'sonner'
import { createTournamentFecha, CreateFechaData } from '../actions'

type RoundType = 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL'

interface CreateFechaModalProps {
  isOpen: boolean
  onClose: () => void
  tournamentId: string
  nextFechaNumber: number
  onSuccess: (fecha: TournamentFecha) => void
}

export default function CreateFechaModal({
  isOpen,
  onClose,
  tournamentId,
  nextFechaNumber,
  onSuccess
}: CreateFechaModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    round_type: 'ZONE' as RoundType,
    bracket_key: 'MAIN' as 'MAIN' | 'GOLD' | 'SILVER',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const fechaData: CreateFechaData = {
        tournament_id: tournamentId,
        fecha_number: nextFechaNumber,
        name: formData.name,
        description: formData.description || undefined,
        start_date: formData.start_date || undefined,
        end_date: formData.end_date || undefined,
        round_type: formData.round_type,
        bracket_key: formData.round_type === 'ZONE' ? 'MAIN' : formData.bracket_key,
      }

      const result = await createTournamentFecha(fechaData)

      if (result.success && result.data) {
        onSuccess(result.data as TournamentFecha)
        onClose()

        setFormData({
          name: '',
          description: '',
          start_date: '',
          end_date: '',
          round_type: 'ZONE',
          bracket_key: 'MAIN',
        })

        toast.success(result.message || `Fecha ${nextFechaNumber} creada exitosamente`)
      } else {
        throw new Error(result.error || 'Error desconocido al crear la fecha')
      }

    } catch (error: any) {
      console.error('Error creating fecha:', error)
      toast.error(error.message || 'Error al crear la fecha. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-green-600" />
            Nueva Fecha del Torneo
          </DialogTitle>
          <DialogDescription>
            Crea una nueva fecha para organizar los partidos del torneo.
            Fecha número: <strong>{nextFechaNumber}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la Fecha *</Label>
            <Input
              id="name"
              placeholder="ej: Tabla de posiciones, Cuartos de Final..."
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Detalles adicionales sobre esta fecha..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              disabled={loading}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Fecha Inicio</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">Fecha Fin</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="round_type">Tipo de Ronda</Label>
            <select
              id="round_type"
              value={formData.round_type}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                round_type: e.target.value as RoundType,
                bracket_key: e.target.value === 'ZONE' ? 'MAIN' : prev.bracket_key
              }))}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-control focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ZONE">Tabla de posiciones (Zona)</option>
              <option value="32VOS">32vos de Final</option>
              <option value="16VOS">16vos de Final</option>
              <option value="8VOS">8vos de Final</option>
              <option value="4TOS">Cuartos de Final</option>
              <option value="SEMIFINAL">Semifinal</option>
              <option value="FINAL">Final</option>
            </select>
          </div>

          {formData.round_type !== 'ZONE' && (
            <div className="space-y-2">
              <Label htmlFor="bracket_key">Copa de la Llave</Label>
              <select
                id="bracket_key"
                value={formData.bracket_key}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  bracket_key: e.target.value as 'MAIN' | 'GOLD' | 'SILVER'
                }))}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-control focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="MAIN">Principal</option>
                <option value="GOLD">Copa de Oro</option>
                <option value="SILVER">Copa de Plata</option>
              </select>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !formData.name.trim()}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Fecha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
