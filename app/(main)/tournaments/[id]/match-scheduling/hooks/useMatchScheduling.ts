'use client'

import { useState, useCallback } from 'react'
import { SchedulingData, CoupleWithData, ExistingMatch, createMatch, CustomSchedule, updateMatchResult, SetResult, MatchResultData, modifyMatchResult, modifyMatchSchedule, ModifyScheduleData, updateOrganizerCoupleAvailability } from '../actions'

interface MatchSchedulingState {
  couples: CoupleWithData[]
  timeSlots: SchedulingData['timeSlots']
  availability: SchedulingData['availability']
  selectedCouples: CoupleWithData[]
  createdMatches: ExistingMatch[]
  draggedCouple: CoupleWithData | null
  manualAvailabilitySavingKey: string | null
  loading: boolean
  error: string | null
  warning: string | null
}

interface MatchFormData {
  fecha: string
  horaInicio: string
  horaFin: string
  cancha: string
  timeSlotId?: string
  clubId?: string
}

export const useMatchScheduling = (
  initialData: SchedulingData, 
  fechaId: string,
  onMatchCreated: () => void
) => {
  const [state, setState] = useState<MatchSchedulingState>({
    couples: initialData.couples,
    timeSlots: initialData.timeSlots,
    availability: initialData.availability,
    selectedCouples: [],
    createdMatches: initialData.existingMatches,
    draggedCouple: null,
    manualAvailabilitySavingKey: null,
    loading: false,
    error: null,
    warning: null
  })

  const getFreeDateWarningMessage = useCallback((selectedCouples: CoupleWithData[]) => {
    const hasFreeDateBlockedCouple = selectedCouples.some(couple => couple.free_date_blocked)

    if (!hasFreeDateBlockedCouple) {
      return null
    }

    return 'Advertencia: una o ambas parejas marcaron FECHA LIBRE. Igual puedes crear el partido.'
  }, [])

  // Handle couple selection (drag from matrix)
  const handleCoupleSelect = useCallback((couple: CoupleWithData) => {
    setState(prev => {
      const isAlreadySelected = prev.selectedCouples.find(c => c.id === couple.id)
      let selectedCouples = prev.selectedCouples

      if (isAlreadySelected) {
        selectedCouples = prev.selectedCouples.filter(c => c.id !== couple.id)
      } else if (prev.selectedCouples.length < 2) {
        selectedCouples = [...prev.selectedCouples, couple]
      }

      return {
        ...prev,
        selectedCouples,
        error: null,
        warning: getFreeDateWarningMessage(selectedCouples)
      }
    })
  }, [getFreeDateWarningMessage])

  // Handle drag start
  const handleDragStart = useCallback((couple: CoupleWithData) => {
    setState(prev => ({
      ...prev,
      draggedCouple: couple
    }))
  }, [])

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setState(prev => ({
      ...prev,
      draggedCouple: null
    }))
  }, [])

  // Handle drag over drop zone
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  // Handle drop on drop zone
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const coupleId = e.dataTransfer.getData('text/plain')
    
    // Find the couple from the dragged ID
    const draggedCouple = state.couples.find(c => c.id === coupleId)
    
    if (draggedCouple) {
      handleCoupleSelect(draggedCouple)
    }
    
    handleDragEnd()
  }, [state.couples, handleCoupleSelect, handleDragEnd])

  // Remove couple from selection
  const handleCoupleRemove = useCallback((coupleId: string) => {
    setState(prev => ({
      ...prev,
      selectedCouples: prev.selectedCouples.filter(c => c.id !== coupleId),
      warning: getFreeDateWarningMessage(prev.selectedCouples.filter(c => c.id !== coupleId))
    }))
  }, [getFreeDateWarningMessage])

  const handleManualAvailabilityToggle = useCallback(async (
    coupleId: string,
    timeSlotId: string,
    isAvailable?: boolean,
    notes?: string | null
  ) => {
    const savingKey = `${coupleId}:${timeSlotId}`
    const currentAvailability = state.availability.find(item =>
      item.couple_id === coupleId && item.time_slot_id === timeSlotId
    )
    const nextIsAvailable = isAvailable ?? !(currentAvailability?.is_available ?? false)

    setState(prev => ({
      ...prev,
      manualAvailabilitySavingKey: savingKey,
      error: null
    }))

    try {
      const result = await updateOrganizerCoupleAvailability({
        coupleId,
        timeSlotId,
        isAvailable: nextIsAvailable,
        notes
      })

      if (!result.success) {
        setState(prev => ({
          ...prev,
          manualAvailabilitySavingKey: null,
          error: result.error || 'Error al actualizar disponibilidad'
        }))
        return false
      }

      setState(prev => {
        const availabilityWithoutCell = prev.availability.filter(item =>
          !(item.couple_id === coupleId && item.time_slot_id === timeSlotId)
        )

        return {
          ...prev,
          availability: nextIsAvailable
            ? [
                ...availabilityWithoutCell,
                {
                  couple_id: coupleId,
                  time_slot_id: timeSlotId,
                  is_available: true,
                  notes: result.data?.notes || null
                }
              ]
            : availabilityWithoutCell,
          manualAvailabilitySavingKey: null,
          error: null
        }
      })

      return true
    } catch (error) {
      setState(prev => ({
        ...prev,
        manualAvailabilitySavingKey: null,
        error: error instanceof Error ? error.message : 'Error inesperado al actualizar disponibilidad'
      }))
      return false
    }
  }, [state.availability])

  // Validate match creation for conflicts
  const validateMatchCreation = useCallback((couple1Id: string, couple2Id: string, fecha: string) => {
    // Find conflicting matches for these couples on this date
    const conflictingMatches = state.createdMatches.filter(match => {
      const matchDate = match.scheduled_date
      const involvesCouples = [match.couple1_id, match.couple2_id].includes(couple1Id) ||
                             [match.couple1_id, match.couple2_id].includes(couple2Id)
      return matchDate === fecha && involvesCouples
    })
    
    if (conflictingMatches.length > 0) {
      const conflictingMatch = conflictingMatches[0]
      const status = conflictingMatch.status
      
      if (status === 'FINISHED' || status === 'COMPLETED') {
        return { 
          valid: false, 
          message: 'Una de las parejas ya jugó un partido en esta fecha' 
        }
      } else {
        return { 
          valid: false, 
          message: 'Una de las parejas ya tiene un partido programado en esta fecha' 
        }
      }
    }
    
    return { valid: true, message: '' }
  }, [state.createdMatches])

  // Create match with server action
  const handleCreateMatch = useCallback(async (formData: MatchFormData): Promise<boolean> => {
    if (state.selectedCouples.length !== 2) {
      setState(prev => ({
        ...prev,
        error: 'Debes seleccionar exactamente 2 parejas'
      }))
      return false
    }

    const [couple1, couple2] = state.selectedCouples

    // Validate for conflicts
    const validation = validateMatchCreation(couple1.id, couple2.id, formData.fecha)
    if (!validation.valid) {
      setState(prev => ({
        ...prev,
        error: validation.message
      }))
      return false
    }

    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      warning: getFreeDateWarningMessage(prev.selectedCouples)
    }))

    try {
      
      // Use provided time slot (now optional)
      let timeSlotId = formData.timeSlotId || undefined

      // Prepare custom schedule only if we have specific time/date info
      let customSchedule: CustomSchedule | undefined = undefined

      if (formData.fecha || formData.horaInicio || formData.horaFin || formData.cancha) {
        customSchedule = {
          date: formData.fecha || (timeSlotId ? state.timeSlots.find(ts => ts.id === timeSlotId)?.date : undefined) || new Date().toISOString().split('T')[0],
          startTime: formData.horaInicio || '',
          endTime: formData.horaFin || '',
          court: formData.cancha || '',
          notes: `Partido creado manualmente`
        }
      }

      const result = await createMatch(
        fechaId,
        couple1.id,
        couple2.id,
        timeSlotId,
        customSchedule,
        formData.clubId
      )

      if (result.success && result.data) {
        // Build new match object for instant UI update
        const newMatch: ExistingMatch = {
          id: result.data.matchId,
          couple1_id: result.data.couple1Id,
          couple2_id: result.data.couple2Id,
          time_slot_id: result.data.timeSlotId || null,
          status: 'PENDING',
          scheduled_date: result.data.scheduledDate,
          scheduled_start_time: result.data.scheduledStartTime,
          scheduled_end_time: result.data.scheduledEndTime,
          court_assignment: result.data.courtAssignment,
          club_id: formData.clubId || null,
          club: null,
          // Add couple data for proper display
          couple1: {
            player1: { 
              first_name: couple1.player1.name, 
              last_name: couple1.player1.last_name 
            },
            player2: { 
              first_name: couple1.player2.name, 
              last_name: couple1.player2.last_name 
            }
          },
          couple2: {
            player1: { 
              first_name: couple2.player1.name, 
              last_name: couple2.player1.last_name 
            },
            player2: { 
              first_name: couple2.player2.name, 
              last_name: couple2.player2.last_name 
            }
          }
        }

        // Update state with new match and clear selection
        setState(prev => ({
          ...prev,
          selectedCouples: [],
          createdMatches: [...prev.createdMatches, newMatch],
          loading: false,
          error: null,
          warning: null
        }))
        
        // Trigger server-side revalidation as fallback
        onMatchCreated()
        
        console.log('Match created successfully:', result.message)
        return true
      } else if (result.success) {
        // Fallback: success but no data - clear selection and trigger refresh
        setState(prev => ({
          ...prev,
          selectedCouples: [],
          loading: false,
          error: null,
          warning: null
        }))
        
        onMatchCreated()
        console.log('Match created successfully (fallback refresh)')
        return true
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: result.error || 'Error desconocido al crear partido'
        }))
        return false
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Error inesperado'
      }))
      return false
    }
  }, [state.selectedCouples, state.timeSlots, fechaId, onMatchCreated, getFreeDateWarningMessage, validateMatchCreation])

  // Update match result with optimistic UI update
  const handleUpdateMatchResult = useCallback(async (matchId: string, sets: SetResult[], winnerId: string, resultCouple1: string, resultCouple2: string) => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: null
    }))

    try {
      const result = await updateMatchResult({
        matchId,
        sets,
        winnerId,
        result_couple1: resultCouple1,
        result_couple2: resultCouple2
      })

      if (result.success) {
        // Optimistic update: Update match status and results immediately
        setState(prev => ({
          ...prev,
          createdMatches: prev.createdMatches.map(match => 
            match.id === matchId 
              ? {
                  ...match,
                  status: 'COMPLETED',
                  result_couple1: resultCouple1,
                  result_couple2: resultCouple2,
                  winner_couple_id: winnerId
                }
              : match
          ),
          loading: false,
          error: null
        }))

        // Fallback refresh (optional)
        onMatchCreated()
        
        console.log('Match result updated successfully:', result.message)
        return { success: true }
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: result.error || 'Error al actualizar el resultado'
        }))
        return { success: false, error: result.error }
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Error inesperado al actualizar resultado'
      }))
      console.error('Error updating match result:', error)
      return { success: false, error: 'Error inesperado' }
    }
  }, [onMatchCreated])

  // Modify match result with optimistic UI update
  const handleModifyMatchResult = useCallback(async (matchId: string, sets: SetResult[], winnerId: string, resultCouple1: string, resultCouple2: string) => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: null
    }))

    try {
      const result = await modifyMatchResult({
        matchId,
        sets,
        winnerId,
        result_couple1: resultCouple1,
        result_couple2: resultCouple2
      })

      if (result.success) {
        // Optimistic update: Update match status and results immediately
        setState(prev => ({
          ...prev,
          createdMatches: prev.createdMatches.map(match => 
            match.id === matchId 
              ? {
                  ...match,
                  status: 'COMPLETED',
                  result_couple1: resultCouple1,
                  result_couple2: resultCouple2,
                  winner_couple_id: winnerId
                }
              : match
          ),
          loading: false,
          error: null
        }))

        // Fallback refresh
        onMatchCreated()
        
        console.log('Match result modified successfully:', result.message)
        return { success: true }
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: result.error || 'Error al modificar el resultado'
        }))
        return { success: false, error: result.error }
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Error inesperado al modificar resultado'
      }))
      console.error('Error modifying match result:', error)
      return { success: false, error: 'Error inesperado' }
    }
  }, [onMatchCreated])

  // Modify match schedule with optimistic UI update
  const handleModifySchedule = useCallback(async (scheduleData: ModifyScheduleData) => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: null
    }))

    try {
      const result = await modifyMatchSchedule(scheduleData)

      if (result.success) {
        // Optimistic update: Update match schedule and club immediately
        setState(prev => ({
          ...prev,
          createdMatches: prev.createdMatches.map(match =>
            match.id === scheduleData.matchId
              ? {
                  ...match,
                  scheduled_date: scheduleData.date,
                  scheduled_start_time: scheduleData.startTime,
                  scheduled_end_time: scheduleData.endTime,
                  court_assignment: scheduleData.court,
                  club_id: scheduleData.clubId || match.club_id
                }
              : match
          ),
          loading: false,
          error: null
        }))

        // Fallback refresh
        onMatchCreated()
        
        console.log('Match schedule modified successfully:', result.message)
        return { success: true }
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: result.error || 'Error al modificar el horario'
        }))
        return { success: false, error: result.error }
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Error inesperado al modificar horario'
      }))
      console.error('Error modifying match schedule:', error)
      return { success: false, error: 'Error inesperado' }
    }
  }, [onMatchCreated])

  // Delete match with API call
  const handleDeleteMatch = useCallback(async (matchId: string) => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: null
    }))

    try {
      // Get tournament ID from an existing match (all matches have tournament_id)
      const existingMatch = state.createdMatches.find(m => m.id === matchId)
      if (!existingMatch) {
        throw new Error('Partido no encontrado en el estado local')
      }

      // Extract tournament ID from URL or get it from the match context
      // Since we're in /tournaments/[id]/match-scheduling, we can extract [id] from window.location
      const pathSegments = window.location.pathname.split('/')
      const tournamentId = pathSegments[pathSegments.indexOf('tournaments') + 1]

      if (!tournamentId) {
        throw new Error('No se pudo determinar el ID del torneo')
      }

      // Call the DELETE API endpoint
      const response = await fetch(`/api/tournaments/${tournamentId}/match-scheduling/matches/${matchId}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (result.success) {
        // Remove from local state immediately for instant UI update
        setState(prev => ({
          ...prev,
          createdMatches: prev.createdMatches.filter(m => m.id !== matchId),
          loading: false,
          error: null
        }))

        // Trigger refresh to update couples matrix (match_status will be reset)
        onMatchCreated()

        console.log('Match deleted successfully:', result.message)
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: result.error || 'Error al eliminar el partido'
        }))
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Error inesperado al eliminar partido'
      }))
      console.error('Error deleting match:', error)
    }
  }, [fechaId, state.createdMatches])

  // Update data from parent (when fecha changes or after operations)
  const updateData = useCallback((newData: SchedulingData) => {
    setState(prev => {
      // Merge server data with any local-only matches that might not be in server response yet
      const serverMatchIds = new Set(newData.existingMatches.map(m => m.id))
      const localOnlyMatches = prev.createdMatches.filter(m => !serverMatchIds.has(m.id))
      
      return {
        ...prev,
        couples: newData.couples,
        timeSlots: newData.timeSlots,
        availability: newData.availability,
        // Merge server matches with local-only matches (preserves instant updates)
        createdMatches: [...newData.existingMatches, ...localOnlyMatches],
        selectedCouples: [], // Clear selections on data update
        manualAvailabilitySavingKey: null,
        error: null,
        warning: null
      }
    })
  }, [])

  const actions = {
    handleCoupleSelect,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    handleCoupleRemove,
    handleManualAvailabilityToggle,
    handleCreateMatch,
    handleUpdateMatchResult,
    handleModifyMatchResult,
    handleModifySchedule,
    handleDeleteMatch,
    updateData
  }

  return {
    ...state,
    actions
  }
}
