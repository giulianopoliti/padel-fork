'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { FileEdit, Send, Clock, MapPin, Building2, Loader2, CheckCircle2, AlertCircle, Info, Trash2, Edit } from 'lucide-react'
import { getDraftMatches, publishMatches, deleteMatches, modifyMatchSchedule, type DraftMatch, type ExistingMatch, type ModifyScheduleData } from '../actions'
import ModifyScheduleDialog from './ModifyScheduleDialog'

interface Club {
  id: string
  name: string
}

interface DraftMatchesManagerProps {
  fechaId: string
  tournamentId: string
  isDraftModeEnabled: boolean
  onMatchesPublished?: () => void
  clubes?: Club[]
}

export default function DraftMatchesManager({ fechaId, tournamentId, isDraftModeEnabled, onMatchesPublished, clubes }: DraftMatchesManagerProps) {
  const [draftMatches, setDraftMatches] = useState<DraftMatch[]>([])
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set())
  const [selectedMatchForEdit, setSelectedMatchForEdit] = useState<DraftMatch | null>(null)
  const [showModifyDialog, setShowModifyDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    loadDraftMatches()
  }, [fechaId])

  const loadDraftMatches = async () => {
    setLoading(true)
    setMessage(null)

    try {
      const result = await getDraftMatches(fechaId)

      if (result.success && result.data) {
        setDraftMatches(result.data)
        if (result.data.length === 0 && isDraftModeEnabled) {
          setMessage({
            type: 'info',
            text: 'No hay partidos en borrador. Los nuevos partidos que crees aparecerán aquí.'
          })
        }
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Error al cargar partidos en borrador'
        })
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error inesperado al cargar partidos'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSelectMatch = (matchId: string) => {
    const newSelected = new Set(selectedMatches)
    if (newSelected.has(matchId)) {
      newSelected.delete(matchId)
    } else {
      newSelected.add(matchId)
    }
    setSelectedMatches(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedMatches.size === draftMatches.length) {
      setSelectedMatches(new Set())
    } else {
      setSelectedMatches(new Set(draftMatches.map(m => m.id)))
    }
  }

  const handlePublish = async () => {
    if (selectedMatches.size === 0) return

    setPublishing(true)
    setMessage(null)

    try {
      const result = await publishMatches(Array.from(selectedMatches), tournamentId)

      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || 'Partidos publicados exitosamente'
        })
        setSelectedMatches(new Set())
        // Reload draft matches to remove published ones
        await loadDraftMatches()
        // Notify parent component to refresh its data
        if (onMatchesPublished) {
          onMatchesPublished()
        }
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Error al publicar partidos'
        })
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error inesperado al publicar partidos'
      })
    } finally {
      setPublishing(false)
    }
  }

  const handleDeleteClick = () => {
    if (selectedMatches.size === 0) return
    setShowDeleteConfirm(true)
  }

  const handleDeleteConfirm = async () => {
    if (selectedMatches.size === 0) return

    setDeleting(true)
    setMessage(null)
    setShowDeleteConfirm(false)

    try {
      const result = await deleteMatches(Array.from(selectedMatches), tournamentId)

      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || 'Partidos eliminados exitosamente'
        })
        setSelectedMatches(new Set())
        // Reload draft matches to remove deleted ones
        await loadDraftMatches()
        // Notify parent component to refresh its data
        if (onMatchesPublished) {
          onMatchesPublished()
        }
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Error al eliminar partidos'
        })
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error inesperado al eliminar partidos'
      })
    } finally {
      setDeleting(false)
    }
  }

  const formatCoupleName = (match: DraftMatch, coupleKey: 'couple1' | 'couple2'): string => {
    const couple = match[coupleKey]
    if (!couple) return 'Pareja no definida'
    return `${couple.player1.first_name} ${couple.player1.last_name} / ${couple.player2.first_name} ${couple.player2.last_name}`
  }

  const formatDateTime = (date: string | null, time: string | null): string => {
    if (!date) return 'Sin fecha'
    const dateObj = new Date(date + 'T12:00:00')
    const dateStr = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
    if (time) {
      const [hour, minute] = time.split(':')
      return `${dateStr} ${hour}:${minute}hs`
    }
    return dateStr
  }

  const getClubName = (clubId: string | null): string | null => {
    if (!clubId) return null
    return clubes?.find((club) => club.id === clubId)?.name || null
  }

  // Convert DraftMatch to ExistingMatch for ModifyScheduleDialog compatibility
  const convertDraftToExistingMatch = (draft: DraftMatch): ExistingMatch => {
    return {
      id: draft.id,
      couple1_id: draft.couple1_id,
      couple2_id: draft.couple2_id,
      time_slot_id: null,
      status: draft.status,
      scheduled_date: draft.scheduled_date,
      scheduled_start_time: draft.scheduled_start_time,
      scheduled_end_time: draft.scheduled_end_time,
      court_assignment: draft.court_assignment,
      couple1: draft.couple1,
      couple2: draft.couple2,
      club_id: draft.club_id,
      club: null
    } as ExistingMatch
  }

  const handleEditClick = (match: DraftMatch) => {
    setSelectedMatchForEdit(match)
    setShowModifyDialog(true)
  }

  const handleModifySchedule = async (scheduleData: ModifyScheduleData) => {
    const result = await modifyMatchSchedule(scheduleData)
    if (result.success) {
      setMessage({ type: 'success', text: 'Datos del partido actualizados exitosamente' })
      await loadDraftMatches()
    } else {
      setMessage({ type: 'error', text: result.error || 'Error al modificar datos del partido' })
    }
    return result
  }

  if (!isDraftModeEnabled) {
    return null
  }

  if (loading) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-600 mr-2" />
          <span className="text-amber-800">Cargando partidos en borrador...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <FileEdit className="h-5 w-5 text-amber-600 mt-1" />
            <div>
              <CardTitle className="text-amber-900">Partidos en Borrador</CardTitle>
              <CardDescription className="text-amber-700">
                Estos partidos NO son visibles para los jugadores hasta que los publiques
              </CardDescription>
            </div>
          </div>
          {draftMatches.length > 0 && (
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
              {draftMatches.length} {draftMatches.length === 1 ? 'partido' : 'partidos'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {message && (
          <Alert className={
            message.type === 'success'
              ? 'border-green-200 bg-green-50'
              : message.type === 'error'
              ? 'border-red-200 bg-red-50'
              : 'border-blue-200 bg-blue-50'
          }>
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : message.type === 'error' ? (
              <AlertCircle className="h-4 w-4 text-red-600" />
            ) : (
              <Info className="h-4 w-4 text-blue-600" />
            )}
            <AlertDescription className={
              message.type === 'success'
                ? 'text-green-800'
                : message.type === 'error'
                ? 'text-red-800'
                : 'text-blue-800'
            }>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        {draftMatches.length === 0 ? (
          <div className="text-center py-8 text-amber-700">
            <FileEdit className="h-12 w-12 mx-auto mb-3 text-amber-400" />
            <p className="font-medium">No hay partidos en borrador</p>
            <p className="text-sm text-amber-600 mt-1">
              Los nuevos partidos que crees aparecerán aquí antes de publicarse
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={selectedMatches.size === draftMatches.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Seleccionar todos"
                />
                <label htmlFor="select-all" className="text-sm text-amber-800 cursor-pointer">
                  Seleccionar todos ({draftMatches.length})
                </label>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleDeleteClick}
                  disabled={selectedMatches.size === 0 || deleting || publishing}
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar {selectedMatches.size > 0 && `(${selectedMatches.size})`}
                    </>
                  )}
                </Button>
                <Button
                  onClick={handlePublish}
                  disabled={selectedMatches.size === 0 || publishing || deleting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {publishing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Publicando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Publicar {selectedMatches.size > 0 && `(${selectedMatches.size})`}
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {draftMatches.map((match) => (
                <div
                  key={match.id}
                  className={`border rounded-lg p-4 transition-all ${
                    selectedMatches.has(match.id)
                      ? 'border-amber-400 bg-amber-100 shadow-md'
                      : 'border-amber-200 bg-white hover:bg-amber-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`match-${match.id}`}
                      checked={selectedMatches.has(match.id)}
                      onCheckedChange={() => handleSelectMatch(match.id)}
                      className="mt-1"
                      aria-label={`Seleccionar partido ${formatCoupleName(match, 'couple1')} vs ${formatCoupleName(match, 'couple2')}`}
                    />
                    <div className="flex-1 space-y-2">
                      <div className="font-medium text-gray-900">
                        {formatCoupleName(match, 'couple1')}
                        <span className="mx-2 text-gray-400">vs</span>
                        {formatCoupleName(match, 'couple2')}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                        {match.scheduled_date && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDateTime(match.scheduled_date, match.scheduled_start_time)}
                          </div>
                        )}
                        {match.court_assignment && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            Cancha {match.court_assignment}
                          </div>
                        )}
                        {getClubName(match.club_id) && (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {getClubName(match.club_id)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditClick(match)}
                        className="h-8 w-8 p-0 hover:bg-amber-200 text-amber-700 hover:text-amber-900 transition-colors"
                        aria-label="Editar datos del partido"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                        BORRADOR
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      {/* Modify Schedule Dialog - Reuses same dialog as published matches */}
      {selectedMatchForEdit && (
        <ModifyScheduleDialog
          match={convertDraftToExistingMatch(selectedMatchForEdit)}
          open={showModifyDialog}
          onOpenChange={setShowModifyDialog}
          onScheduleModified={() => {
            loadDraftMatches()
            setMessage({ type: 'success', text: 'Datos actualizados exitosamente' })
          }}
          onModifySchedule={handleModifySchedule}
          clubes={clubes || []}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro de eliminar estos partidos?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar {selectedMatches.size} partido{selectedMatches.size === 1 ? '' : 's'} en borrador.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
