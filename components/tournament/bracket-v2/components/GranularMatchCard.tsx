'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { mutate } from 'swr'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Trophy, MapPin, Edit3, Zap, Play, ClipboardList, Trash2, Loader2, Ban, MoreHorizontal, Eye, EyeOff } from 'lucide-react'
import { DraggableCoupleSlot } from './DraggableCoupleSlot'
import { useBracketDragOperations } from '../hooks/useBracketDragOperations'
import { useBracketDragDrop } from '../context/bracket-drag-context'
import { useMatchManagement } from '../hooks/useMatchManagement'
import { ByeActionsDropdown } from './ByeActionsDropdown'
import { SameZonePlaceholderConflictBadge, ZoneConflictBadge } from './ZoneConflictBadge'
import { useZoneMatchHistory, havePlayedInZone } from '../hooks/useZoneMatchHistory'
import { resolveCoupleIds } from '../utils/couple-resolver'
import { detectSameZonePlaceholderConflict } from '../utils/same-zone-placeholder-conflict'
import { isBracketMoveAllowedStatus } from '../utils/bracket-move-status'
import type { BracketMatchV2, CoupleData, SeedInfo } from '../types/bracket-types'

interface MatchSetScore {
  id: string
  set_number: number
  couple1_games: number
  couple2_games: number
}

type PendingDisqualification = {
  couple: CoupleData
  coupleName: string
}

export interface GranularMatchCardProps {
  match: BracketMatchV2
  tournamentId: string
  tournamentType?: 'AMERICAN' | 'LONG'
  isOwner: boolean
  isEditMode: boolean
  seeds?: SeedInfo[]
  onMatchUpdate?: (matchId: string, updatedData: unknown) => void
  onRequestStartMatch?: (match: BracketMatchV2) => void
  onRequestLoadResult?: (match: BracketMatchV2) => void
  onRequestModifyResult?: (match: BracketMatchV2) => void
  onSelectForMove?: (couple: CoupleData, match: BracketMatchV2, slot: 'slot1' | 'slot2') => void
  selectedMoveSlot?: 'slot1' | 'slot2' | null
  moveTargetSlots?: Partial<Record<'slot1' | 'slot2', boolean>>
  preloadedSetScores?: MatchSetScore[]
  className?: string
}

export function GranularMatchCard({
  match,
  tournamentId,
  tournamentType = 'AMERICAN',
  isOwner,
  isEditMode,
  seeds = [],
  onMatchUpdate,
  onRequestStartMatch,
  onRequestLoadResult,
  onRequestModifyResult,
  onSelectForMove,
  selectedMoveSlot = null,
  moveTargetSlots,
  preloadedSetScores,
  className,
}: GranularMatchCardProps) {
  const [localDragHover, setLocalDragHover] = useState<'slot1' | 'slot2' | null>(null)
  const [setScores, setSetScores] = useState<MatchSetScore[]>([])
  const [pendingDisqualification, setPendingDisqualification] = useState<PendingDisqualification | null>(null)
  const [isDisqualifyingCoupleId, setIsDisqualifyingCoupleId] = useState<string | null>(null)
  const [isUpdatingDraftStatus, setIsUpdatingDraftStatus] = useState(false)
  const isLongTournament = tournamentType === 'LONG'
  const [matchState, matchActions] = useMatchManagement(tournamentId, onMatchUpdate)

  const { state: dragState } = useBracketDragDrop()
  const dragOperations = useBracketDragOperations({
    tournamentId,
    isOwner,
    config: {
      enabled: isEditMode && isOwner,
      sameRoundOnly: true,
      pendingMatchesOnly: true,
      maxPendingOperations: 10,
    },
  })

  const couple1 = match.participants?.slot1?.couple || null
  const couple2 = match.participants?.slot2?.couple || null
  const courtLabel = match.scheduling?.court

  const { history: zoneHistory, isLoading: isLoadingHistory } = useZoneMatchHistory(tournamentId)
  const { couple1Id, couple2Id, bothDefined } = resolveCoupleIds(match, seeds)
  const hasZoneConflict = bothDefined && havePlayedInZone(zoneHistory, couple1Id, couple2Id)
  const sameZonePlaceholderConflict = !bothDefined
    ? detectSameZonePlaceholderConflict(match, seeds)
    : null

  const couple1Name =
    couple1?.name ||
    (couple1?.player1_details && couple1?.player2_details
      ? `${couple1.player1_details.first_name} ${couple1.player1_details.last_name} / ${couple1.player2_details.first_name} ${couple1.player2_details.last_name}`
      : null)

  const couple2Name =
    couple2?.name ||
    (couple2?.player1_details && couple2?.player2_details
      ? `${couple2.player1_details.first_name} ${couple2.player1_details.last_name} / ${couple2.player2_details.first_name} ${couple2.player2_details.last_name}`
      : null)

  const slot1IsDragging =
    dragState.draggedItem?.sourceMatchId === match.id && dragState.draggedItem?.sourceSlot === 'slot1'
  const slot2IsDragging =
    dragState.draggedItem?.sourceMatchId === match.id && dragState.draggedItem?.sourceSlot === 'slot2'

  const canModifyResult =
    isOwner &&
    match.status === 'FINISHED' &&
    match.participants?.slot1?.couple &&
    match.participants?.slot2?.couple &&
    !isEditMode

  const canDisqualifyInBracket =
    isOwner &&
    !isEditMode &&
    !!couple1 &&
    !!couple2 &&
    ['PENDING', 'IN_PROGRESS', 'WAITING_OPONENT', 'WAITING_OPPONENT'].includes(match.status)
  const canToggleDraftStatus =
    isOwner &&
    !isEditMode &&
    (
      match.status === 'PENDING' ||
      match.status === 'DRAFT' ||
      match.status === 'WAITING_OPPONENT'
    )

  useEffect(() => {
    if (preloadedSetScores) {
      setSetScores(preloadedSetScores)
      return
    }

    if (!isLongTournament || match.status !== 'FINISHED') {
      setSetScores([])
      return
    }

    let cancelled = false

    const fetchSetScores = async () => {
      try {
        const response = await fetch(`/api/matches/${match.id}/sets`)
        if (!response.ok) return

        const data = await response.json()
        if (!cancelled && data.success) {
          setSetScores(data.sets || [])
        }
      } catch (error) {
        console.error('Error fetching bracket set scores:', error)
      }
    }

    fetchSetScores()

    return () => {
      cancelled = true
    }
  }, [isLongTournament, match.id, match.status, preloadedSetScores])

  const slotSetScores = useMemo(() => {
    const sortedSets = [...setScores].sort((a, b) => a.set_number - b.set_number)
    return {
      slot1: sortedSets.map((set) => set.couple1_games),
      slot2: sortedSets.map((set) => set.couple2_games)
    }
  }, [setScores])

  const canMoveMatch = isBracketMoveAllowedStatus(match.status)
  const canDragSlot1 = isEditMode && isOwner && !!couple1 && canMoveMatch
  const canDragSlot2 = isEditMode && isOwner && !!couple2 && canMoveMatch

  const canReceiveDropSlot1 =
    isEditMode &&
    isOwner &&
    canMoveMatch &&
    dragState.isDragging &&
    dragState.draggedItem &&
    dragState.draggedItem.sourceRound === match.round &&
    !(dragState.draggedItem.sourceMatchId === match.id && dragState.draggedItem.sourceSlot === 'slot1')

  const canReceiveDropSlot2 =
    isEditMode &&
    isOwner &&
    canMoveMatch &&
    dragState.isDragging &&
    dragState.draggedItem &&
    dragState.draggedItem.sourceRound === match.round &&
    !(dragState.draggedItem.sourceMatchId === match.id && dragState.draggedItem.sourceSlot === 'slot2')

  const handleDragStart = (couple: CoupleData, matchData: BracketMatchV2, slot: 'slot1' | 'slot2') => {
    dragOperations.startDrag(couple, matchData, slot)
  }

  const handleDragEnd = () => {
    dragOperations.endDrag()
    setLocalDragHover(null)
  }

  const handleDragEnter = (targetMatch: BracketMatchV2, targetSlot: 'slot1' | 'slot2') => {
    if (targetMatch.id === match.id) {
      setLocalDragHover(targetSlot)
    }
  }

  const handleDragLeave = () => {
    setLocalDragHover(null)
  }

  const handleDrop = (targetMatch: BracketMatchV2, targetSlot: 'slot1' | 'slot2') => {
    if (!dragState.draggedItem) return
    if (dragState.draggedItem.sourceRound !== targetMatch.round) return
    if (!isBracketMoveAllowedStatus(targetMatch.status)) return
    dragOperations.handleDrop(targetMatch, targetSlot)
    setLocalDragHover(null)
  }

  const handleCoupleClick = (couple: CoupleData | null, matchData: BracketMatchV2, slot: 'slot1' | 'slot2') => {
    if (isEditMode && couple && onSelectForMove) {
      onSelectForMove(couple, matchData, slot)
    }
  }

  const handleByeActionComplete = () => {
    mutate(`/api/tournaments/${tournamentId}/matches`)
    mutate(`tournament-sidebar-${tournamentId}`)
    mutate(`/api/tournaments/${tournamentId}/seeds`)
    onMatchUpdate?.(match.id, { status: match.status })
  }

  const handleDeleteResult = async () => {
    const confirmed = window.confirm('Esto borra el resultado del partido y lo vuelve a Pendiente. El partido no se elimina. ¿Continuar?')
    if (!confirmed) return

    const success = await matchActions.deleteResult(match.id)
    if (!success) return

    mutate(`/api/tournaments/${tournamentId}/matches`)
    mutate(`tournament-sidebar-${tournamentId}`)
    mutate(`/api/tournaments/${tournamentId}/seeds`)
    mutate(
      (key) => typeof key === 'string' && key.includes(tournamentId),
      undefined,
      { revalidate: true }
    )
  }

  const handleToggleDraftStatus = async () => {
    const mode = match.status === 'DRAFT' ? 'publish' : 'draft'
    setIsUpdatingDraftStatus(true)

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bracket-matches/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode,
          scope: 'match',
          matchId: match.id,
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'No se pudo actualizar el partido')
      }

      toast.success(result.message || (mode === 'draft' ? 'Partido ocultado' : 'Partido publicado'))
      mutate((key) => typeof key === 'string' && key.includes(tournamentId), undefined, { revalidate: true })
      onMatchUpdate?.(match.id, { status: mode === 'draft' ? 'DRAFT' : 'PENDING' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el partido')
    } finally {
      setIsUpdatingDraftStatus(false)
    }
  }

  const handleConfirmDisqualification = async () => {
    if (!pendingDisqualification) return

    setIsDisqualifyingCoupleId(pendingDisqualification.couple.id)
    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/couples/${pendingDisqualification.couple.id}/disqualify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchId: match.id,
            reason: 'Descalificacion administrativa en llave',
          }),
        }
      )

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'No se pudo descalificar la pareja')
      }

      toast.success('Pareja descalificada. El rival avanzo automaticamente.')
      setPendingDisqualification(null)
      handleByeActionComplete()
      mutate((key) => typeof key === 'string' && key.includes(tournamentId), undefined, { revalidate: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo descalificar la pareja')
    } finally {
      setIsDisqualifyingCoupleId(null)
    }
  }

  const renderDisqualificationMenu = (couple: CoupleData | null, coupleName: string | null) => {
    if (!canDisqualifyInBracket || !couple || !coupleName) return null

    const isUpdating = isDisqualifyingCoupleId === couple.id

    return (
      <div className="absolute right-1 top-1 z-30">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 bg-white/90 text-slate-500 shadow-sm hover:bg-white hover:text-slate-900"
              onClick={(event) => event.stopPropagation()}
              disabled={isUpdating}
              aria-label={`Acciones de ${coupleName}`}
            >
              {isUpdating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MoreHorizontal className="h-3.5 w-3.5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              className="text-red-700 focus:text-red-700"
              disabled={isUpdating}
              onClick={(event) => {
                event.stopPropagation()
                setPendingDisqualification({ couple, coupleName })
              }}
            >
              <Ban className="mr-2 h-4 w-4" />
              Descalificar pareja
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'Pendiente'
      case 'DRAFT':
        return 'Borrador'
      case 'IN_PROGRESS':
        return 'En curso'
      case 'FINISHED':
        return 'Finalizado'
      case 'WAITING_OPPONENT':
      case 'WAITING_OPONENT':
        return 'Esperando oponente'
      case 'BYE':
        return 'BYE'
      default:
        return 'Pendiente'
    }
  }

  const getMatchStatusInfo = () => {
    switch (match.status) {
      case 'DRAFT':
        return { badge: <Badge variant="secondary" className="bg-slate-100 text-[10px] text-slate-700">Borrador</Badge>, borderColor: 'border-slate-300' }
      case 'PENDING':
        return { badge: <Badge variant="secondary" className="text-[10px]">Pendiente</Badge>, borderColor: 'border-gray-300' }
      case 'IN_PROGRESS':
        return { badge: <Badge className="bg-blue-600 text-[10px]">En curso</Badge>, borderColor: 'border-blue-400' }
      case 'FINISHED':
        return { badge: <Badge className="bg-green-600 text-[10px]">Finalizado</Badge>, borderColor: 'border-green-400' }
      case 'WAITING_OPPONENT' as BracketMatchV2['status']:
      case 'WAITING_OPONENT' as BracketMatchV2['status']:
        return { badge: <Badge variant="outline" className="text-[10px]">Esperando oponente</Badge>, borderColor: 'border-orange-300' }
      default:
        return { badge: <Badge variant="secondary" className="text-[10px]">{getStatusLabel(match.status)}</Badge>, borderColor: 'border-gray-300' }
    }
  }

  const statusInfo = getMatchStatusInfo()
  const showStartAction = isOwner && !isEditMode && match.status === 'PENDING' && couple1 && couple2
  const showLoadResultAction =
    isOwner &&
    !isEditMode &&
    (match.status === 'IN_PROGRESS' || (match.status === 'PENDING' && couple1 && couple2))
  const isDisqualificationResult =
    match.status === 'FINISHED' &&
    (match.result_couple1 === 'W/DQ' ||
      match.result_couple2 === 'W/DQ' ||
      match.result_couple1 === 'DQ' ||
      match.result_couple2 === 'DQ')

  return (
    <Card
      className={cn(
        'flex h-full flex-col overflow-hidden border transition-all duration-200',
        statusInfo.borderColor,
        dragState.isDragging && 'ring-2 ring-blue-300 ring-opacity-50',
        isEditMode && 'shadow-md',
        className
      )}
    >
      <CardHeader className="space-y-1 border-b border-slate-100 px-2.5 pb-1.5 pt-2">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <Trophy className="h-3 w-3 flex-shrink-0 text-slate-500" />
              <span className="truncate text-xs font-semibold text-slate-900">
                {match.round} · M{match.order_in_round || '-'}
              </span>
              {isEditMode && (
                <Badge variant="secondary" className="bg-blue-100 px-1 py-0 text-[10px] text-blue-800">
                  <Zap className="mr-0.5 h-2.5 w-2.5" />
                  Edit
                </Badge>
              )}
            </div>
            {hasZoneConflict && !isLoadingHistory && (
              <div className="mt-1">
                <ZoneConflictBadge
                  couple1Name={couple1Name || undefined}
                  couple2Name={couple2Name || undefined}
                  variant="warning"
                  size="sm"
                />
              </div>
            )}
            {!hasZoneConflict && sameZonePlaceholderConflict && (
              <div className="mt-1">
                <SameZonePlaceholderConflictBadge
                  coupleName={sameZonePlaceholderConflict.coupleName}
                  placeholderLabel={sameZonePlaceholderConflict.placeholderLabel}
                  zoneName={sameZonePlaceholderConflict.zoneName}
                  size="sm"
                />
              </div>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            {canModifyResult && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 border-orange-200 text-orange-700 hover:bg-orange-50"
                      onClick={() => onRequestModifyResult?.(match)}
                      aria-label="Modificar resultado"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Modificar resultado</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={handleDeleteResult}
                      disabled={matchState.updatingResult}
                      aria-label="Borrar partido"
                    >
                      {matchState.updatingResult ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Borrar partido</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {canToggleDraftStatus && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleToggleDraftStatus}
                      disabled={isUpdatingDraftStatus}
                      aria-label={match.status === 'DRAFT' ? 'Publicar partido' : 'Marcar partido como borrador'}
                    >
                      {isUpdatingDraftStatus ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : match.status === 'DRAFT' ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {match.status === 'DRAFT' ? 'Publicar partido' : 'Marcar borrador'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {statusInfo.badge}
            {isOwner && !isEditMode && (
              <ByeActionsDropdown
                match={match}
                tournamentId={tournamentId}
                isOwner={isOwner}
                onActionComplete={handleByeActionComplete}
              />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-1 px-2.5 pb-2 pt-1.5">
        <div className="relative">
          <DraggableCoupleSlot
            couple={couple1}
            match={match}
            slotPosition="slot1"
            placeholderLabel={match.participants?.slot1?.placeholder?.display || null}
            isPlaceholder={match.participants?.slot1?.type === 'placeholder' || false}
            canDrag={canDragSlot1}
            isEditMode={isEditMode}
            isDragging={slot1IsDragging}
            canReceiveDrop={!!canReceiveDropSlot1}
            isDragHover={localDragHover === 'slot1'}
            result={match.result_couple1 as 'W' | 'L' | null}
            setScores={isLongTournament ? slotSetScores.slot1 : undefined}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleCoupleClick}
            isSelectedForMove={selectedMoveSlot === 'slot1'}
            isMoveTarget={Boolean(moveTargetSlots?.slot1)}
            compact
            className="min-h-[2.5rem] p-1.5"
          />
          {renderDisqualificationMenu(couple1, couple1Name)}
        </div>

        <div className="flex items-center justify-center py-0.5">
          <span className="rounded-full bg-slate-100 px-2 py-0 text-[9px] font-semibold text-slate-500">VS</span>
        </div>

        <div className="relative">
          <DraggableCoupleSlot
            couple={couple2}
            match={match}
            slotPosition="slot2"
            placeholderLabel={match.participants?.slot2?.placeholder?.display || null}
            isPlaceholder={match.participants?.slot2?.type === 'placeholder' || false}
            canDrag={canDragSlot2}
            isEditMode={isEditMode}
            isDragging={slot2IsDragging}
            canReceiveDrop={!!canReceiveDropSlot2}
            isDragHover={localDragHover === 'slot2'}
            result={match.result_couple2 as 'W' | 'L' | null}
            setScores={isLongTournament ? slotSetScores.slot2 : undefined}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleCoupleClick}
            isSelectedForMove={selectedMoveSlot === 'slot2'}
            isMoveTarget={Boolean(moveTargetSlots?.slot2)}
            compact
            className="min-h-[2.5rem] p-1.5"
          />
          {renderDisqualificationMenu(couple2, couple2Name)}
        </div>

        <div className="mt-auto space-y-1 border-t border-slate-100 pt-1.5">
          {courtLabel && (
            <div className="flex items-center gap-1 text-[10px] text-slate-600">
              <MapPin className="h-3 w-3" />
              <span>Cancha {courtLabel}</span>
            </div>
          )}

          {isDisqualificationResult && (
            <div className="flex items-center gap-1 text-[10px] text-red-700">
              <Ban className="h-3 w-3" />
              <span className="font-medium">Definido por descalificacion</span>
            </div>
          )}

          {match.status === 'FINISHED' && !isLongTournament && !isDisqualificationResult && (
              (() => {
                const set = match.result?.sets?.[0]
                const score1 = set
                  ? ('slot1Score' in set ? set.slot1Score : (set as { couple1_games?: number }).couple1_games)
                  : null
                const score2 = set
                  ? ('slot2Score' in set ? set.slot2Score : (set as { couple2_games?: number }).couple2_games)
                  : null
                const label =
                  score1 != null && score2 != null
                    ? `${score1}-${score2}`
                    : typeof match.result_couple1 === 'number' && typeof match.result_couple2 === 'number'
                      ? `${match.result_couple1}-${match.result_couple2}`
                      : null

                return label ? (
                  <div className="flex items-center gap-1 text-[10px]">
                    <Trophy className="h-3 w-3 text-yellow-500" />
                    <span className="font-medium">{label}</span>
                  </div>
                ) : null
              })()
          )}

          {isOwner && !isEditMode && (showStartAction || showLoadResultAction) && (
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1">
                {showStartAction && onRequestStartMatch && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 border-blue-200 text-blue-700 hover:bg-blue-50"
                        onClick={() => onRequestStartMatch(match)}
                        aria-label="Iniciar partido"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Iniciar partido</TooltipContent>
                  </Tooltip>
                )}

                {showLoadResultAction && onRequestLoadResult && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onRequestLoadResult(match)}
                        aria-label="Cargar resultado"
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isLongTournament ? 'Cargar resultado (3 sets)' : 'Cargar resultado (1 set)'}
                    </TooltipContent>
                  </Tooltip>
                )}

              </div>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
      <AlertDialog
        open={!!pendingDisqualification}
        onOpenChange={(open) => {
          if (!open && !isDisqualifyingCoupleId) setPendingDisqualification(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descalificar pareja</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDisqualification
                ? `Se cerrara este partido y avanzara automaticamente el rival de ${pendingDisqualification.coupleName}.`
                : 'Se cerrara este partido y avanzara automaticamente el rival.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!isDisqualifyingCoupleId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(event) => {
                event.preventDefault()
                handleConfirmDisqualification()
              }}
              disabled={!!isDisqualifyingCoupleId}
            >
              {isDisqualifyingCoupleId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Descalificando...
                </>
              ) : (
                'Descalificar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export default GranularMatchCard
