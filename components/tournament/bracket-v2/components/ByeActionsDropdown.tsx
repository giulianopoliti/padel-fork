/**
 * BYE ACTIONS DROPDOWN
 *
 * Componente dropdown para gestionar acciones de BYE en matches del bracket.
 * Detecta automáticamente si un match es un BYE procesado o procesable
 * y muestra las acciones correspondientes.
 *
 * @author Claude Code Assistant
 * @version 1.0.0
 * @created 2025-01-29
 */

'use client'

import { useState } from 'react'
import { MoreVertical, Play, Undo2, RefreshCw } from 'lucide-react'
import { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { useToast } from '@/components/ui/use-toast'
import { SubstitutionDialog } from '@/components/tournament/long/substitution-dialog'
import type { BracketMatchV2 } from '../types/bracket-types'

// ============================================================================
// TIPOS
// ============================================================================

export interface ByeActionsDropdownProps {
  /** Match data */
  match: BracketMatchV2
  /** Tournament ID */
  tournamentId: string
  /** Si es owner del torneo */
  isOwner: boolean
  /** Callback cuando se completa una acción */
  onActionComplete?: () => void
  canAssignSubstitute?: boolean
  onSubstitutionSaved?: () => void
}

interface ByeState {
  /** Si el BYE ya está procesado (FINISHED) */
  isByeProcessed: boolean
  /** Si el BYE es procesable (PENDING con estructura válida) */
  isByeProcessable: boolean
  /** Si se puede cambiar el estado del match */
  canChangeStatus: boolean
  /** Estado actual del match si es cambiable */
  changeableFromStatus: 'IN_PROGRESS' | 'WAITING_OPONENT' | null
  /** Si se debe mostrar el menú */
  canShowMenu: boolean
}

type ByeCompatibleStatus = 'PENDING' | 'IN_PROGRESS' | 'WAITING_OPPONENT' | 'WAITING_OPONENT' | string

const normalizeByeCompatibleStatus = (status: ByeCompatibleStatus) => {
  if (status === 'WAITING_OPONENT') {
    return 'WAITING_OPPONENT'
  }

  return status
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Detecta el estado del match respecto a BYEs
 *
 * Lógica de detección:
 * - BYE Procesado: FINISHED + winner_id + una sola pareja
 * - BYE Procesable: PENDING + estructura válida (couple + seed de un lado, NULL del otro)
 */
function detectByeState(match: BracketMatchV2): ByeState {
  const couple1 = match.participants?.slot1?.couple
  const couple2 = match.participants?.slot2?.couple
  const seed1Id = match.tournament_couple_seed1_id
  const seed2Id = match.tournament_couple_seed2_id
  const seed1Info = match.participants?.slot1?.seed
  const seed2Info = match.participants?.slot2?.seed
  const slot1IsPlaceholder = match.participants?.slot1?.type === 'placeholder'
  const slot2IsPlaceholder = match.participants?.slot2?.type === 'placeholder'

  const hasCouple1 = !!couple1
  const hasCouple2 = !!couple2
  const hasSeed1 = !!seed1Id || !!seed1Info
  const hasSeed2 = !!seed2Id || !!seed2Info
  const normalizedStatus = normalizeByeCompatibleStatus(match.status)

  // BYE Procesado: FINISHED con una sola pareja (el otro slot NULL)
  const isByeProcessed =
    match.status === 'FINISHED' &&
    !!match.winner_id &&
    ((hasCouple1 && !hasCouple2) || (!hasCouple1 && hasCouple2))

  // BYE Procesable: PENDING con estructura válida
  // Lado A: pareja real + seed; Lado B: vacío (sin pareja, sin seed y NO placeholder)
  const side1StructuralBye = hasCouple1 && hasSeed1 && !hasCouple2 && !hasSeed2 && !slot2IsPlaceholder
  const side2StructuralBye = hasCouple2 && hasSeed2 && !hasCouple1 && !hasSeed1 && !slot1IsPlaceholder

  const isByeProcessable =
    (normalizedStatus === 'PENDING' || normalizedStatus === 'WAITING_OPPONENT') &&
    !match.winner_id &&
    (side1StructuralBye || side2StructuralBye)

  // ✨ NUEVO: Detectar si se puede cambiar el estado del match
  // Solo permitir cambio desde IN_PROGRESS o WAITING_OPONENT, y sin winner_id
  const canChangeStatus =
    !match.winner_id &&
    (normalizedStatus === 'IN_PROGRESS' || normalizedStatus === 'WAITING_OPPONENT')

  const changeableFromStatus: 'IN_PROGRESS' | 'WAITING_OPONENT' | null =
    canChangeStatus
      ? (normalizedStatus === 'WAITING_OPPONENT' ? 'WAITING_OPONENT' : 'IN_PROGRESS')
      : null

  // Mostrar menú si hay al menos una acción disponible
  const canShowMenu = isByeProcessed || isByeProcessable || canChangeStatus

  return {
    isByeProcessed,
    isByeProcessable,
    canChangeStatus,
    changeableFromStatus,
    canShowMenu
  }
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function ByeActionsDropdown({
  match,
  tournamentId,
  isOwner,
  onActionComplete,
  canAssignSubstitute = false,
  onSubstitutionSaved,
}: ByeActionsDropdownProps) {

  // Estados locales
  const [isProcessing, setIsProcessing] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [substitutionOpen, setSubstitutionOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'process' | 'undo' | 'changeStatus' | null>(null)
  const { toast } = useToast()

  // Detección de estado del match
  const { isByeProcessed, isByeProcessable, canChangeStatus, changeableFromStatus, canShowMenu } = detectByeState(match)

  // ============================================================================
  // HANDLERS
  // ============================================================================

  /**
   * Abre el diálogo de confirmación para procesar BYE
   */
  const handleProcessByeClick = () => {
    setPendingAction('process')
    setConfirmDialogOpen(true)
    setDropdownOpen(false)
  }

  /**
   * Procesar BYE: Marca el match como FINISHED y avanza al ganador
   */
  const handleProcessBye = async () => {
    setIsProcessing(true)
    setConfirmDialogOpen(false)

    try {
      console.log('🎯 [ByeActionsDropdown] Processing BYE for match:', match.id)

      const response = await fetch(
        `/api/tournaments/${tournamentId}/matches/${match.id}/process-bye-strict`,
        { method: 'POST' }
      )

      const result = await response.json()

      if (response.ok && result.success) {
        console.log('✅ [ByeActionsDropdown] BYE processed successfully:', result)

        toast({
          title: "BYE Procesado",
          description: result.message || "El ganador ha avanzado automáticamente",
          variant: "default"
        })

        // Invalidar cache SWR
        await invalidateCache()

        // Notificar al padre
        if (onActionComplete) {
          onActionComplete()
        }
      } else {
        console.error('❌ [ByeActionsDropdown] Error processing BYE:', result)

        toast({
          title: "Error al Procesar BYE",
          description: result.error || "No se pudo procesar el BYE",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('❌ [ByeActionsDropdown] Critical error processing BYE:', error)

      toast({
        title: "Error",
        description: "Ocurrió un error inesperado al procesar el BYE",
        variant: "destructive"
      })
    } finally {
      setIsProcessing(false)
    }
  }

  /**
   * Abre el diálogo de confirmación para desprocesar BYE
   */
  const handleUndoByeClick = () => {
    setPendingAction('undo')
    setConfirmDialogOpen(true)
    setDropdownOpen(false)
  }

  /**
   * Desprocesar BYE: Revierte el BYE y remueve al ganador del siguiente match
   */
  const handleUndoBye = async () => {
    setIsProcessing(true)
    setConfirmDialogOpen(false)

    try {
      console.log('🔄 [ByeActionsDropdown] Undoing BYE for match:', match.id)

      const response = await fetch(
        `/api/tournaments/${tournamentId}/undo-bye`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId: match.id })
        }
      )

      const result = await response.json()

      if (response.ok && result.success) {
        console.log('✅ [ByeActionsDropdown] BYE undone successfully:', result)

        toast({
          title: "BYE Desprocesado",
          description: result.message || "El BYE ha sido revertido correctamente",
          variant: "default"
        })

        // Invalidar cache SWR
        await invalidateCache()

        // Notificar al padre
        if (onActionComplete) {
          onActionComplete()
        }
      } else {
        console.error('❌ [ByeActionsDropdown] Error undoing BYE:', result)

        toast({
          title: "Error al Desprocesar",
          description: result.error || "No se pudo desprocesar el BYE",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('❌ [ByeActionsDropdown] Critical error undoing BYE:', error)

      toast({
        title: "Error",
        description: "Ocurrió un error inesperado al desprocesar el BYE",
        variant: "destructive"
      })
    } finally {
      setIsProcessing(false)
    }
  }

  /**
   * Invalida todos los caches SWR relevantes del torneo
   */
  const invalidateCache = async () => {
    console.log('🔄 [ByeActionsDropdown] Invalidating cache for tournament:', tournamentId)

    const keys = [
      `/api/tournaments/${tournamentId}/matches`,
      `tournament-sidebar-${tournamentId}`,
      `/api/tournaments/${tournamentId}/seeds`
    ]

    // Invalidar keys específicas
    await Promise.all(keys.map(key => mutate(key)))

    // Invalidación masiva como fallback
    await mutate(
      key => typeof key === 'string' && key.includes(tournamentId),
      undefined,
      { revalidate: true }
    )

    console.log('✅ [ByeActionsDropdown] Cache invalidated successfully')
  }

  /**
   * Abre el diálogo de confirmación para cambiar estado
   */
  const handleChangeStatusClick = () => {
    setPendingAction('changeStatus')
    setConfirmDialogOpen(true)
    setDropdownOpen(false)
  }

  /**
   * Cambiar estado del match a PENDING
   */
  const handleChangeStatus = async () => {
    setIsProcessing(true)
    setConfirmDialogOpen(false)

    try {
      console.log('🔄 [ByeActionsDropdown] Cambiando estado a PENDING para match:', match.id)

      const response = await fetch(
        `/api/tournaments/${tournamentId}/matches/${match.id}/change-status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newStatus: 'PENDING' })
        }
      )

      const result = await response.json()

      if (response.ok && result.success) {
        console.log('✅ [ByeActionsDropdown] Estado cambiado exitosamente:', result)

        toast({
          title: "Estado Cambiado",
          description: result.message || "El match ha vuelto a estado PENDING",
          variant: "default"
        })

        // Invalidar cache SWR
        await invalidateCache()

        // Notificar al padre
        if (onActionComplete) {
          onActionComplete()
        }
      } else {
        console.error('❌ [ByeActionsDropdown] Error al cambiar estado:', result)

        toast({
          title: "Error al Cambiar Estado",
          description: result.error || "No se pudo cambiar el estado del match",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('❌ [ByeActionsDropdown] Error crítico al cambiar estado:', error)

      toast({
        title: "Error",
        description: "Ocurrió un error inesperado al cambiar el estado",
        variant: "destructive"
      })
    } finally {
      setIsProcessing(false)
    }
  }

  /**
   * Maneja la confirmación del diálogo
   */
  const handleConfirm = () => {
    if (pendingAction === 'process') {
      handleProcessBye()
    } else if (pendingAction === 'undo') {
      handleUndoBye()
    } else if (pendingAction === 'changeStatus') {
      handleChangeStatus()
    }
    setPendingAction(null)
  }

  /**
   * Maneja la cancelación del diálogo
   */
  const handleCancel = () => {
    setConfirmDialogOpen(false)
    setPendingAction(null)
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  // No mostrar menú si no hay acciones disponibles o no es owner
  if ((!canShowMenu && !canAssignSubstitute) || !isOwner) {
    return null
  }

  return (
    <>
      {substitutionOpen && <SubstitutionDialog tournamentId={tournamentId} matchId={match.id}
        onClose={() => setSubstitutionOpen(false)} onSaved={onSubstitutionSaved} />}
      {/* Diálogo de Confirmación */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction === 'process' && 'Procesar BYE'}
              {pendingAction === 'undo' && 'Desprocesar BYE'}
              {pendingAction === 'changeStatus' && 'Cambiar Estado a PENDING'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === 'process' && (
                <>
                  ¿Confirmar el procesamiento del BYE?
                  <br />
                  El ganador avanzará automáticamente al siguiente partido.
                </>
              )}
              {pendingAction === 'undo' && (
                <>
                  ¿Confirmar desprocesar este BYE?
                  <br />
                  El ganador será removido del siguiente partido y el match volverá a estado PENDING.
                </>
              )}
              {pendingAction === 'changeStatus' && (
                <>
                  ¿Confirmar cambio de estado a PENDING?
                  <br />
                  El partido volverá a estado pendiente y podrá ser reprogramado.
                  {changeableFromStatus && (
                    <>
                      <br />
                      <span className="font-medium">Estado actual: {changeableFromStatus}</span>
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Aceptar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dropdown Menu */}
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            disabled={isProcessing}
          >
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Abrir menú de acciones del partido</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52 bg-white border-gray-200">
          {canAssignSubstitute && <DropdownMenuItem onSelect={() => setSubstitutionOpen(true)}>Asignar suplente</DropdownMenuItem>}
          {/* ACCIÓN: Procesar BYE */}
          {isByeProcessable && (
            <DropdownMenuItem
              onClick={handleProcessByeClick}
              disabled={isProcessing}
              className="flex items-center gap-2 text-green-700 hover:bg-green-50 hover:text-green-800 focus:bg-green-50 focus:text-green-800 cursor-pointer"
            >
              <Play className="h-4 w-4" />
              <span>{isProcessing ? 'Procesando...' : 'Procesar BYE'}</span>
            </DropdownMenuItem>
          )}

          {/* ACCIÓN: Desprocesar BYE */}
          {isByeProcessed && (
            <DropdownMenuItem
              onClick={handleUndoByeClick}
              disabled={isProcessing}
              className="flex items-center gap-2 text-orange-700 hover:bg-orange-50 hover:text-orange-800 focus:bg-orange-50 focus:text-orange-800 cursor-pointer"
            >
              <Undo2 className="h-4 w-4" />
              <span>{isProcessing ? 'Desprocesando...' : 'Desprocesar BYE'}</span>
            </DropdownMenuItem>
          )}

          {/* ✨ NUEVA ACCIÓN: Cambiar Estado a PENDING */}
          {canChangeStatus && (
            <DropdownMenuItem
              onClick={handleChangeStatusClick}
              disabled={isProcessing}
              className="flex items-center gap-2 text-blue-700 hover:bg-blue-50 hover:text-blue-800 focus:bg-blue-50 focus:text-blue-800 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>{isProcessing ? 'Cambiando...' : 'Volver a PENDING'}</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

export default ByeActionsDropdown
