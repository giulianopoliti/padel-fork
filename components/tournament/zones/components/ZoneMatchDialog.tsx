'use client'

/**
 * ZoneMatchDialog - Consolidated Match Management Dialog
 *
 * Single contextual dialog that handles ALL match operations based on match state:
 * CASE 1: No match → Create match UI (assign court)
 * CASE 2: Pending/In Progress → Result loading UI directly (no intermediate dialog)
 * CASE 3: Finished → Show result + edit/delete buttons
 *
 * Adapted for 1 SET only (American format)
 */

import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertCircle, Loader2, Trophy, CheckCircle, Trash2, FileEdit, MapPin, Save } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface ZoneMatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  couple1: {
    id: string
    player1_name: string
    player2_name: string
  }
  couple2: {
    id: string
    player1_name: string
    player2_name: string
  }
  existingMatch: any | null
  tournamentId: string
  zoneId: string
  zoneName: string
  onMatchChanged: () => void
}

export default function ZoneMatchDialog({
  open,
  onOpenChange,
  couple1,
  couple2,
  existingMatch,
  tournamentId,
  zoneId,
  zoneName,
  onMatchChanged
}: ZoneMatchDialogProps) {
  const { toast } = useToast()

  // States
  const [couple1Score, setCouple1Score] = useState('')
  const [couple2Score, setCouple2Score] = useState('')
  const [court, setCourt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Refs for auto-focus
  const couple1InputRef = useRef<HTMLInputElement>(null)
  const couple2InputRef = useRef<HTMLInputElement>(null)
  const courtInputRef = useRef<HTMLInputElement>(null)

  // Determine dialog mode based on match state
  const hasMatch = !!existingMatch
  const isFinished = hasMatch && existingMatch.status === 'FINISHED'
  const isPending = hasMatch && existingMatch.status !== 'FINISHED'

  // Reset form cuando se abre/cierra el dialog
  React.useEffect(() => {
    if (open) {
      if (isFinished) {
        // ✅ SIMPLE: El orden ya viene corregido desde handleCellClick en TournamentZonesMatrix
        // couple1 del dialog siempre corresponde a couple1_id de DB
        // couple2 del dialog siempre corresponde a couple2_id de DB
        // Por lo tanto, simplemente cargar los scores directamente
        setCouple1Score(existingMatch.result_couple1?.toString() || '')
        setCouple2Score(existingMatch.result_couple2?.toString() || '')
        setCourt(existingMatch.court?.toString() || '')
        setIsEditing(false) // Show result by default, not edit mode
      } else if (isPending) {
        // For pending matches, prepare result input
        setCouple1Score('')
        setCouple2Score('')
        setCourt(existingMatch.court?.toString() || '')
        setTimeout(() => couple1InputRef.current?.focus(), 100)
      } else {
        // For new matches, prepare court input
        setCouple1Score('')
        setCouple2Score('')
        setCourt('')
        setTimeout(() => courtInputRef.current?.focus(), 100)
      }
      setError(null)
    }
  }, [open, existingMatch, isFinished, isPending])

  // Validación de pádel para 1 set
  const isValidSetScore = (c1: number, c2: number): boolean => {
    if (c1 < 0 || c2 < 0 || c1 > 7 || c2 > 7) return false

    // Valid padel scores (en torneos americanos se permite 6-5)
    if ((c1 === 6 && c2 <= 5) || (c2 === 6 && c1 <= 5)) return true // 6-0, 6-1, 6-2, 6-3, 6-4, 6-5
    if ((c1 === 7 && c2 === 5) || (c2 === 7 && c1 === 5)) return true // 7-5
    if ((c1 === 7 && c2 === 6) || (c2 === 7 && c1 === 6)) return true // 7-6 tiebreak

    return false
  }

  // Calcular ganador
  const getWinner = (): 1 | 2 | null => {
    const c1 = parseInt(couple1Score)
    const c2 = parseInt(couple2Score)

    if (isNaN(c1) || isNaN(c2)) return null
    if (!isValidSetScore(c1, c2)) return null

    return c1 > c2 ? 1 : 2
  }

  // Validar si se puede enviar resultado
  const canSubmitResult = (): boolean => {
    const c1 = parseInt(couple1Score)
    const c2 = parseInt(couple2Score)

    if (isNaN(c1) || isNaN(c2)) return false
    return isValidSetScore(c1, c2)
  }

  // Validar si se puede crear partido
  const canCreateMatch = (): boolean => {
    return court.trim() !== '' && !isNaN(parseInt(court))
  }

  // Handle create match
  const handleCreateMatch = async () => {
    if (!canCreateMatch()) {
      setError('Por favor ingresa un número de cancha válido')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneId,
          couple1Id: couple1.id,
          couple2Id: couple2.id,
          court: parseInt(court)
        })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        toast({
          title: 'Partido creado',
          description: `Se ha creado el partido en la cancha ${court}`,
          variant: 'default'
        })

        onMatchChanged()
        onOpenChange(false)
      } else {
        setError(result.error || 'Error al crear el partido')
        toast({
          title: 'Error',
          description: result.error || 'No se pudo crear el partido',
          variant: 'destructive'
        })
      }
    } catch (err) {
      console.error('Error creating match:', err)
      setError('Error de conexión al crear el partido')
      toast({
        title: 'Error',
        description: 'Error de conexión al crear el partido',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  // Handle save/update result
  const handleSaveResult = async () => {
    if (!canSubmitResult()) {
      setError('Por favor ingresa un resultado válido de pádel')
      return
    }

    const score1 = parseInt(couple1Score)
    const score2 = parseInt(couple2Score)

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: existingMatch.id,
          couple1Score: score1,
          couple2Score: score2,
          couple1Id: couple1.id,
          couple2Id: couple2.id
        })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        const isEditingFinished = result.isEditingFinishedMatch
        const positionUpdate = result.positionUpdate

        let description = isEditingFinished
          ? 'Se ha editado el partido finalizado'
          : 'El resultado del partido se ha actualizado exitosamente'

        if (positionUpdate?.positionsUpdated) {
          description += ' y se han recalculado las posiciones de zona'
        }

        toast({
          title: 'Resultado guardado',
          description,
          variant: 'default'
        })

        onMatchChanged()
        onOpenChange(false)
      } else {
        setError(result.error || 'Error al guardar el resultado')
        toast({
          title: 'Error',
          description: result.error || 'No se pudo guardar el resultado',
          variant: 'destructive'
        })
      }
    } catch (err) {
      console.error('Error saving match result:', err)
      setError('Error de conexión al guardar el resultado')
      toast({
        title: 'Error',
        description: 'Error de conexión al guardar el resultado',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  // Handle delete match
  const handleDeleteMatch = async () => {
    const confirmed = window.confirm(
      `¿Estás seguro de borrar este partido?\n\n` +
      `${couple1.player1_name} / ${couple1.player2_name}\nvs\n` +
      `${couple2.player1_name} / ${couple2.player2_name}\n\n` +
      `⚠️ Esto recalculará las posiciones de zona.`
    )

    if (!confirmed) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/matches/${existingMatch.id}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId: existingMatch.id })
        }
      )

      const result = await response.json()

      if (response.ok && result.success) {
        toast({
          title: 'Partido eliminado',
          description: 'El partido ha sido eliminado y se han recalculado las posiciones',
          variant: 'default'
        })

        onMatchChanged()
        onOpenChange(false)
      } else {
        setError(result.error || 'Error al eliminar el partido')
        toast({
          title: 'Error',
          description: result.error || 'No se pudo eliminar el partido',
          variant: 'destructive'
        })
      }
    } catch (err) {
      console.error('Error deleting match:', err)
      setError('Error de conexión al eliminar el partido')
      toast({
        title: 'Error',
        description: 'Error de conexión al eliminar el partido',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  // Handle form submit on Enter
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasMatch && canCreateMatch() && !loading) {
      handleCreateMatch()
    } else if (canSubmitResult() && !loading) {
      handleSaveResult()
    }
  }

  // Handle key press for auto-focus
  const handleCouple1KeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && couple1Score) {
      e.preventDefault()
      couple2InputRef.current?.focus()
    }
  }

  const handleCouple2KeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmitResult()) {
      e.preventDefault()
      handleSaveResult()
    }
  }

  const winner = getWinner()
  const c1 = parseInt(couple1Score)
  const c2 = parseInt(couple2Score)
  const isValid = !isNaN(c1) && !isNaN(c2) && isValidSetScore(c1, c2)

  // Dialog title based on state
  const getDialogTitle = () => {
    if (!hasMatch) return 'Crear Partido'
    if (isFinished && !isEditing) return 'Resultado del Partido'
    return 'Cargar Resultado'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-slate-900 text-center">
            {getDialogTitle()}
          </DialogTitle>
          <div className="text-sm text-slate-500 text-center">
            {zoneName}
          </div>
        </DialogHeader>

        <form onSubmit={handleFormSubmit} className="space-y-6">
          {/* CASE 1: No match - Create match UI */}
          {!hasMatch && (
            <div className="space-y-4">
              {/* Couple names */}
              <div className="bg-slate-50 border border-slate-200 rounded-surface p-4">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-900">
                    {couple1.player1_name} / {couple1.player2_name}
                  </div>
                  <div className="text-center text-slate-500 font-bold">vs</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {couple2.player1_name} / {couple2.player2_name}
                  </div>
                </div>
              </div>

              {/* Court input */}
              <div>
                <Label htmlFor="court" className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4" />
                  Cancha
                </Label>
                <Input
                  id="court"
                  ref={courtInputRef}
                  type="text"
                  value={court}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '')
                    setCourt(value)
                  }}
                  placeholder="Ej: 1, 2, 3..."
                  className="mt-1"
                  maxLength={2}
                />
              </div>

              <div className="text-xs text-slate-500 text-center">
                Asignar una cancha creará el partido en estado PENDING
              </div>
            </div>
          )}

          {/* CASE 2 & 3: Has match - Show result input or display */}
          {hasMatch && (
            <>
              {/* Show result (finished, not editing) */}
              {isFinished && !isEditing && (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-surface p-4">
                    <div className="space-y-3">
                      {/* Couple 1 with result */}
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">
                          {couple1.player1_name} / {couple1.player2_name}
                        </div>
                        <div className={`text-2xl font-bold px-3 py-1 rounded ${
                          existingMatch.result_couple1 > existingMatch.result_couple2
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {existingMatch.result_couple1}
                        </div>
                      </div>

                      <div className="text-center text-slate-500 font-bold">vs</div>

                      {/* Couple 2 with result */}
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">
                          {couple2.player1_name} / {couple2.player2_name}
                        </div>
                        <div className={`text-2xl font-bold px-3 py-1 rounded ${
                          existingMatch.result_couple2 > existingMatch.result_couple1
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {existingMatch.result_couple2}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Winner display */}
                  <div className="flex items-center justify-center gap-2 text-blue-600 bg-blue-50 rounded-surface p-3">
                    <Trophy className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      Ganador: {existingMatch.result_couple1 > existingMatch.result_couple2
                        ? `${couple1.player1_name} / ${couple1.player2_name}`
                        : `${couple2.player1_name} / ${couple2.player2_name}`
                      }
                    </span>
                  </div>

                  {/* Court info if available */}
                  {existingMatch.court && (
                    <div className="text-center text-sm text-slate-600">
                      Cancha: <span className="font-bold">C{existingMatch.court}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Show result input (pending OR finished in edit mode) */}
              {(!isFinished || isEditing) && (
                <>
                  {/* Header con label de SET 1 */}
                  <div className="flex items-center gap-4">
                    <div className="w-40"></div>
                    <div className="flex items-center justify-center w-16">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-sm font-medium text-slate-600">SET 1</span>
                        {couple1Score && couple2Score && !isNaN(c1) && !isNaN(c2) && !isValidSetScore(c1, c2) && (
                          <span className="text-xs text-red-500">✗</span>
                        )}
                        {isValid && (
                          <span className="text-xs text-green-500">✓</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pareja 1 */}
                  <div className="flex items-center gap-4">
                    <div className="w-40">
                      <div className="text-base font-semibold text-slate-900 leading-tight">
                        {couple1.player1_name}
                      </div>
                      <div className="text-base font-semibold text-slate-900 leading-tight">
                        {couple1.player2_name}
                      </div>
                    </div>
                    <div className="flex items-center justify-center">
                      <Input
                        ref={couple1InputRef}
                        type="text"
                        maxLength={1}
                        value={couple1Score}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-7]/g, '')
                          setCouple1Score(value)
                          if (value && couple2InputRef.current) {
                            couple2InputRef.current.focus()
                          }
                        }}
                        onKeyDown={handleCouple1KeyDown}
                        className="w-16 h-16 text-center font-mono text-2xl font-bold border-2 border-slate-300 focus:border-blue-500 bg-white shadow-sm"
                        placeholder="0"
                        tabIndex={1}
                      />
                    </div>
                  </div>

                  {/* VS separador */}
                  <div className="text-center text-slate-500 font-bold text-lg">vs</div>

                  {/* Pareja 2 */}
                  <div className="flex items-center gap-4">
                    <div className="w-40">
                      <div className="text-base font-semibold text-slate-900 leading-tight">
                        {couple2.player1_name}
                      </div>
                      <div className="text-base font-semibold text-slate-900 leading-tight">
                        {couple2.player2_name}
                      </div>
                    </div>
                    <div className="flex items-center justify-center">
                      <Input
                        ref={couple2InputRef}
                        type="text"
                        maxLength={1}
                        value={couple2Score}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-7]/g, '')
                          setCouple2Score(value)
                        }}
                        onKeyDown={handleCouple2KeyDown}
                        className="w-16 h-16 text-center font-mono text-2xl font-bold border-2 border-slate-300 focus:border-blue-500 bg-white shadow-sm"
                        placeholder="0"
                        tabIndex={2}
                      />
                    </div>
                  </div>

                  {/* Result Summary */}
                  {couple1Score && couple2Score && (
                    <div className="text-center py-3 bg-slate-50 rounded-surface border border-slate-200">
                      {isValid ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center gap-2 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-sm font-medium">
                              Set válido: {couple1Score}-{couple2Score}
                            </span>
                          </div>
                          {winner && (
                            <div className="flex items-center justify-center gap-2 text-blue-600">
                              <Trophy className="h-4 w-4" />
                              <span className="text-sm font-medium">
                                Ganador: {winner === 1
                                  ? `${couple1.player1_name} / ${couple1.player2_name}`
                                  : `${couple2.player1_name} / ${couple2.player2_name}`
                                }
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-red-600">
                          <AlertCircle className="h-4 w-4" />
                          <span className="text-sm">
                            Resultado inválido (válidos: 6-0 a 6-5, 7-5, 7-6)
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hint */}
                  <div className="text-xs text-slate-500 text-center">
                    Presiona Enter para guardar • Scores válidos: 6-0 a 6-5, 7-5, 7-6
                  </div>
                </>
              )}
            </>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </form>

        <DialogFooter>
          {/* CASE 1: No match - Create button */}
          {!hasMatch && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                onClick={handleCreateMatch}
                disabled={!canCreateMatch() || loading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando...
                  </div>
                ) : (
                  'Crear Partido'
                )}
              </Button>
            </>
          )}

          {/* CASE 3: Finished match (not editing) - Edit and Delete buttons */}
          {hasMatch && isFinished && !isEditing && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cerrar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDeleteMatch}
                disabled={loading}
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Borrando...
                  </div>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Borrar
                  </>
                )}
              </Button>
              <Button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <FileEdit className="w-4 h-4 mr-2" />
                Editar Resultado
              </Button>
            </>
          )}

          {/* CASE 2: Pending OR finished in edit mode - Save and Delete */}
          {hasMatch && (!isFinished || isEditing) && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (isEditing) {
                    setIsEditing(false) // Cancel edit
                  } else {
                    onOpenChange(false) // Cancel dialog
                  }
                }}
                disabled={loading}
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </Button>

              {/* Delete button for pending matches */}
              {!isFinished && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDeleteMatch}
                  disabled={loading}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Borrando...
                    </div>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Borrar
                    </>
                  )}
                </Button>
              )}

              <Button
                type="submit"
                onClick={handleSaveResult}
                disabled={!canSubmitResult() || loading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </div>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Guardar Resultado
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
