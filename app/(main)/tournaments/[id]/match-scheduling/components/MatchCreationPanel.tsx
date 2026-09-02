'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { X, Users, Clock, MapPin, AlertCircle, Loader2, Check, ChevronsUpDown } from 'lucide-react'
import { CoupleWithData, SchedulingData } from '../actions'
import { cn } from '@/lib/utils'

interface MatchCreationPanelProps {
  selectedCouples: CoupleWithData[]
  createdMatches: any[] // For displaying created matches in panel
  timeSlots: SchedulingData['timeSlots']
  loading?: boolean
  error: string | null
  warning?: string | null
  showMatchesList?: boolean
  onCoupleRemove: (coupleId: string) => void
  onMatchCreate: (formData: {
    fecha: string
    horaInicio: string
    horaFin: string
    cancha: string
    timeSlotId?: string
    clubId?: string
  }) => Promise<boolean>
  onMatchDelete: (matchId: string) => Promise<void>
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  clubes: Club[]
}

interface Club {
  id: string
  name: string
}

const MatchCreationPanel: React.FC<MatchCreationPanelProps> = ({
  selectedCouples,
  createdMatches,
  timeSlots,
  loading,
  error,
  warning,
  showMatchesList = false,
  onCoupleRemove,
  onMatchCreate,
  onMatchDelete,
  onDragOver,
  onDrop,
  clubes = []
}) => {
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    horaInicio: '',
    horaFin: '',
    cancha: '',
    timeSlotId: '',
    clubId: ''
  })

  const [openClubCombobox, setOpenClubCombobox] = useState(false)
  const [selectedClubId, setSelectedClubId] = useState('')

  // Set first club as default when clubs are available
  useEffect(() => {
    if (clubes.length > 0 && !selectedClubId) {
      setSelectedClubId(clubes[0].id)
    }
  }, [clubes, selectedClubId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (selectedCouples.length !== 2) {
      return
    }

    const success = await onMatchCreate({
      ...formData,
      clubId: selectedClubId
    })

    if (success) {
      // Reset form on success
      setFormData({
        fecha: new Date().toISOString().split('T')[0],
        horaInicio: '',
        horaFin: '',
        cancha: '',
        timeSlotId: '',
        clubId: ''
      })
      setSelectedClubId('')
    }
  }

  const handleTimeSlotChange = (timeSlotId: string) => {
    const timeSlot = timeSlots.find(ts => ts.id === timeSlotId)
    if (timeSlot) {
      setFormData(prev => ({
        ...prev,
        timeSlotId,
        horaInicio: timeSlot.start_time || '',
        horaFin: timeSlot.end_time || '',
        fecha: timeSlot.date || prev.fecha
      }))
    }
  }

  const getCoupleDisplayName = (couple: CoupleWithData): string => {
    const player1Name = `${couple.player1.name} ${couple.player1.last_name || ''}`.trim()
    const player2Name = `${couple.player2.name} ${couple.player2.last_name || ''}`.trim()
    return `${player1Name} / ${player2Name}`
  }

  const formatTimeSlot = (timeSlot: SchedulingData['timeSlots'][0]): string => {
    if (timeSlot.start_time && timeSlot.end_time) {
      return `${timeSlot.start_time.slice(0, 5)} - ${timeSlot.end_time.slice(0, 5)}`
    }
    return timeSlot.start_time ? timeSlot.start_time.slice(0, 5) : 'N/A'
  }

  const isFormValid = selectedCouples.length === 2

  return (
    <div className="space-y-6">
      <Card className="bg-white border-gray-200 shadow-sm hover:shadow-lg transition-shadow">
        <CardHeader className="pb-4">
          <CardTitle className="text-slate-900 flex items-center gap-2">
            <div className="bg-purple-100 p-2 rounded-surface">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            Crear Partido
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Drop Zone */}
          <div
            className="border-2 border-dashed border-blue-300 bg-blue-50/30 rounded-surface p-4 min-h-[120px] flex flex-col items-center justify-center mb-4 transition-colors hover:border-blue-400 hover:bg-blue-50/50"
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (onDragOver) onDragOver(e)
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (onDrop) onDrop(e)
            }}
            onDragEnter={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            role="region"
            aria-label="Zona para arrastrar parejas"
          >
            {selectedCouples.length === 0 && (
              <div className="text-center">
                <Users className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-slate-600 text-sm">
                  Arrastra 2 parejas aquí para crear un partido
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  O haz clic en las parejas de la matriz
                </p>
              </div>
            )}

            {selectedCouples.map((couple) => (
              <div
                key={couple.id}
                className="bg-blue-100 border border-blue-200 rounded-surface p-3 mb-2 w-full flex items-center justify-between shadow-sm"
              >
                <span className="text-slate-900 text-sm font-medium">
                  {getCoupleDisplayName(couple)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onCoupleRemove(couple.id)}
                  className="text-slate-600 hover:bg-red-100 hover:text-red-600 h-6 w-6 p-0"
                  aria-label={`Quitar pareja: ${getCoupleDisplayName(couple)}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-surface flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-red-700 text-sm">{typeof error === 'string' ? error : JSON.stringify(error)}</p>
            </div>
          )}

          {warning && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-surface flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-amber-700 text-sm">{warning}</p>
            </div>
          )}

          {/* Form */}
          {selectedCouples.length === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4 border-t border-gray-200 pt-4">

              {/* Info message about optional fields */}
              <div className="bg-blue-50 border border-blue-200 rounded-surface p-3">
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-blue-800 text-xs">
                    <p className="font-medium mb-1">📅 Programación flexible</p>
                    <p>Puedes crear el partido ahora y programar fecha/hora después, o completar todo de una vez.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label htmlFor="fecha" className="text-slate-700 text-sm font-medium">
                    Fecha <span className="text-slate-500 font-normal">(opcional)</span>
                  </Label>
                  <Input
                    id="fecha"
                    type="date"
                    value={formData.fecha}
                    onChange={(e) => setFormData(prev => ({ ...prev, fecha: e.target.value }))}
                    className="bg-white border-gray-300 text-slate-900 focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Dejar vacío para programar después"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="horaInicio" className="text-slate-700 text-sm font-medium">
                    Hora Inicio <span className="text-slate-500 font-normal">(opcional)</span>
                  </Label>
                  <Input
                    id="horaInicio"
                    type="time"
                    value={formData.horaInicio}
                    onChange={(e) => setFormData(prev => ({ ...prev, horaInicio: e.target.value }))}
                    className="bg-white border-gray-300 text-slate-900 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <Label htmlFor="horaFin" className="text-slate-700 text-sm font-medium">
                    Hora Fin <span className="text-slate-500 font-normal">(opcional)</span>
                  </Label>
                  <Input
                    id="horaFin"
                    type="time"
                    value={formData.horaFin}
                    onChange={(e) => setFormData(prev => ({ ...prev, horaFin: e.target.value }))}
                    className="bg-white border-gray-300 text-slate-900 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <Label className="text-slate-700 text-sm font-medium mb-2 block">
                  Club (Opcional)
                </Label>
                <Popover open={openClubCombobox} onOpenChange={setOpenClubCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openClubCombobox}
                      className="w-full justify-between bg-white border-gray-300 text-slate-900 hover:bg-gray-50"
                    >
                      {selectedClubId
                        ? clubes.find((club) => club.id === selectedClubId)?.name
                        : "Seleccionar club..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Buscar club..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>No se encontró el club.</CommandEmpty>
                        <CommandGroup>
                          {clubes.map((club) => (
                            <CommandItem
                              key={club.id}
                              value={club.name}
                              onSelect={() => {
                                setSelectedClubId(club.id === selectedClubId ? '' : club.id)
                                setOpenClubCombobox(false)
                              }}
                            >
                              {club.name}
                              <Check
                                className={cn(
                                  "ml-auto h-4 w-4",
                                  selectedClubId === club.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label htmlFor="cancha" className="text-slate-700 text-sm font-medium">
                  Cancha (Opcional)
                </Label>
                <Input
                  id="cancha"
                  placeholder="Ej: Cancha 1"
                  value={formData.cancha}
                  onChange={(e) => setFormData(prev => ({ ...prev, cancha: e.target.value }))}
                  className="bg-white border-gray-300 text-slate-900 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                disabled={!isFormValid || loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando Partido...
                  </div>
                ) : (
                  'Crear Partido'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Optional Quick Matches List in Panel */}
      {showMatchesList && createdMatches.length > 0 && (
        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-lg transition-shadow">
          <CardHeader className="pb-4">
            <CardTitle className="text-slate-900 flex items-center gap-2">
              <div className="bg-orange-100 p-2 rounded-surface">
                <MapPin className="w-5 h-5 text-orange-600" />
              </div>
              Últimos Partidos ({createdMatches.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {createdMatches.slice(-3).map((match) => (
                <div
                  key={match.id}
                  className="bg-gray-50 border border-gray-200 rounded-surface p-3 space-y-2 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">
                      {match.court_assignment || 'Sin cancha'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onMatchDelete(match.id)}
                      className="text-slate-400 hover:bg-red-100 hover:text-red-600 h-6 w-6 p-0"
                      aria-label="Eliminar partido"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="text-sm space-y-1">
                    <div className="font-semibold text-slate-900">
                      {match.couple1?.player1?.first_name} {match.couple1?.player1?.last_name} / 
                      {match.couple1?.player2?.first_name} {match.couple1?.player2?.last_name}
                    </div>
                    <div className="text-slate-500 text-center font-medium">vs</div>
                    <div className="font-semibold text-slate-900">
                      {match.couple2?.player1?.first_name} {match.couple2?.player1?.last_name} / 
                      {match.couple2?.player2?.first_name} {match.couple2?.player2?.last_name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-control w-fit">
                    <Clock className="w-3 h-3" />
                    {match.scheduled_start_time?.slice(0, 5)} - {match.scheduled_end_time?.slice(0, 5)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default MatchCreationPanel
