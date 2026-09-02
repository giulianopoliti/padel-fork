'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Clock3, Edit3, EyeOff, Maximize2, Save, Trophy, Users, X, Zap } from 'lucide-react'
import {
  BracketMoveCoupleSheet,
  type BracketMoveSelection,
  type BracketMoveTargetOption
} from './BracketMoveCoupleSheet'
import { GranularMatchCard } from './GranularMatchCard'
import {
  BracketMatchActionDialogs,
  type BracketMatchDialogAction,
} from './BracketMatchActionDialogs'
import { useBracketDragDrop } from '../context/bracket-drag-context'
import { useBracketDragOperations } from '../hooks/useBracketDragOperations'
import { useBracketTreeLayout, type TreeMatchPosition } from '../hooks/useBracketTreeLayout'
import { applyPendingOperationsToData, getMatchPreviewInfo } from '../utils/preview-operations'
import type { BracketData, BracketMatchV2, CoupleData } from '../types/bracket-types'

interface MatchSetScore {
  id: string
  set_number: number
  couple1_games: number
  couple2_games: number
}

export interface ImprovedBracketRendererProps {
  bracketData: BracketData
  tournamentId: string
  tournamentType?: 'AMERICAN' | 'LONG'
  isOwner?: boolean
  enableDragDrop?: boolean
  onMatchUpdate?: (matchId: string, updatedData: any) => void
  onDataRefresh?: () => void
  setScoresByMatch?: Record<string, MatchSetScore[]>
  className?: string
}

interface RoundGroup {
  round: string
  matches: BracketMatchV2[]
  displayName: string
  totalMatches: number
  completedMatches: number
  canPlay: number
}

interface SelectedCoupleForMove {
  couple: CoupleData
  match: BracketMatchV2
  slot: 'slot1' | 'slot2'
}

const ROUND_ORDER = ['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
const ROUND_DISPLAY_NAMES: Record<string, string> = {
  '32VOS': 'Treintaidosavos',
  '16VOS': 'Dieciseisavos',
  '8VOS': 'Octavos de Final',
  '4TOS': 'Cuartos de Final',
  'SEMIFINAL': 'Semifinales',
  'FINAL': 'Final'
}

const getBracketMatchStatusLabel = (status: string) => {
  switch (status) {
    case 'DRAFT':
      return 'Borrador'
    case 'PENDING':
      return 'Pendiente'
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

const AUTO_SCROLL_EDGE_PX = 96
const MAX_VERTICAL_SCROLL_STEP = 28
const MAX_HORIZONTAL_SCROLL_STEP = 22

export function ImprovedBracketRenderer({
  bracketData,
  tournamentId,
  tournamentType = 'AMERICAN',
  isOwner = false,
  enableDragDrop = false,
  onMatchUpdate,
  onDataRefresh,
  setScoresByMatch,
  className
}: ImprovedBracketRendererProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [selectedCoupleForMove, setSelectedCoupleForMove] = useState<SelectedCoupleForMove | null>(null)
  const [isMovePanelOpen, setIsMovePanelOpen] = useState(false)
  const [matchDialogAction, setMatchDialogAction] = useState<BracketMatchDialogAction | null>(null)
  const { state: dragState } = useBracketDragDrop()
  const desktopScrollRef = useRef<HTMLDivElement | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  const [desktopViewportWidth, setDesktopViewportWidth] = useState(0)
  const [fitToWidth, setFitToWidth] = useState(true)

  const dragOperations = useBracketDragOperations({
    tournamentId,
    isOwner,
    config: {
      enabled: enableDragDrop && isOwner && isEditMode,
      sameRoundOnly: true,
      pendingMatchesOnly: true,
      maxPendingOperations: 10
    }
  })

  const previewData = useMemo(() => {
    if (dragState.pendingOperations.length === 0) {
      return bracketData
    }

    return applyPendingOperationsToData(bracketData, dragState.pendingOperations)
  }, [bracketData, dragState.pendingOperations])

  const roundGroups = useMemo<RoundGroup[]>(() => {
    const groups = new Map<string, BracketMatchV2[]>()

    previewData.matches.forEach(match => {
      const current = groups.get(match.round) ?? []
      current.push(match)
      groups.set(match.round, current)
    })

    return Array.from(groups.entries())
      .sort(([roundA], [roundB]) => {
        const indexA = ROUND_ORDER.indexOf(roundA)
        const indexB = ROUND_ORDER.indexOf(roundB)
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
      })
      .map(([round, matches]) => {
        const sortedMatches = [...matches].sort((a, b) => (a.order_in_round ?? 0) - (b.order_in_round ?? 0))
        const completedMatches = sortedMatches.filter(match => match.status === 'FINISHED').length
        const canPlay = sortedMatches.filter(
          match => match.participants?.slot1?.couple && match.participants?.slot2?.couple
        ).length

        return {
          round,
          matches: sortedMatches,
          displayName: ROUND_DISPLAY_NAMES[round] ?? round,
          totalMatches: sortedMatches.length,
          completedMatches,
          canPlay
        }
      })
  }, [previewData.matches])

  const stats = useMemo(() => {
    const total = previewData.matches.length
    const completed = previewData.matches.filter(match => match.status === 'FINISHED').length
    const inProgress = previewData.matches.filter(match => match.status === 'IN_PROGRESS').length
    const draft = previewData.matches.filter(match => match.status === 'DRAFT').length
    const canPlay = previewData.matches.filter(
      match =>
        match.status === 'PENDING' &&
        match.participants?.slot1?.couple &&
        match.participants?.slot2?.couple
    ).length

    return { total, completed, inProgress, draft, canPlay }
  }, [previewData.matches])

  const { layout } = useBracketTreeLayout({
    tournamentId,
    roundGroups,
    tournamentType
  })

  useEffect(() => {
    const container = desktopScrollRef.current

    if (!container) {
      return
    }

    const updateViewportWidth = () => {
      setDesktopViewportWidth(container.clientWidth)
    }

    updateViewportWidth()

    const observer = new ResizeObserver(updateViewportWidth)
    observer.observe(container)

    return () => observer.disconnect()
  }, [roundGroups.length])

  const desktopCanvasWidth = layout.canvasSize.width
  const desktopCanvasHeight = layout.canvasSize.height
  const desktopFitScale = desktopViewportWidth > 0 && desktopCanvasWidth > 0
    ? Math.min(1, Math.max(0.72, (desktopViewportWidth - 24) / desktopCanvasWidth))
    : 1
  const desktopScale = fitToWidth ? desktopFitScale : 1
  const scaledDesktopCanvasWidth = desktopCanvasWidth * desktopScale
  const scaledDesktopCanvasHeight = desktopCanvasHeight * desktopScale

  const moveSelectionDetails = useMemo<BracketMoveSelection | null>(() => {
    if (!selectedCoupleForMove) {
      return null
    }

    return {
      coupleId: selectedCoupleForMove.couple.id,
      coupleName: selectedCoupleForMove.couple.name || [
        `${selectedCoupleForMove.couple.player1_details?.first_name || ''} ${selectedCoupleForMove.couple.player1_details?.last_name || ''}`.trim(),
        `${selectedCoupleForMove.couple.player2_details?.first_name || ''} ${selectedCoupleForMove.couple.player2_details?.last_name || ''}`.trim()
      ].filter(Boolean).join(' / '),
      sourceMatchId: selectedCoupleForMove.match.id,
      sourceMatchLabel: `${ROUND_DISPLAY_NAMES[selectedCoupleForMove.match.round] ?? selectedCoupleForMove.match.round} - Match ${selectedCoupleForMove.match.order_in_round || 'N/A'}`,
      sourceSlot: selectedCoupleForMove.slot,
      round: ROUND_DISPLAY_NAMES[selectedCoupleForMove.match.round] ?? selectedCoupleForMove.match.round
    }
  }, [selectedCoupleForMove])

  const moveTargetGroups = useMemo(() => {
    if (!selectedCoupleForMove || !isEditMode) {
      return []
    }

    const sameRoundGroup = roundGroups.find(group => group.round === selectedCoupleForMove.match.round)
    if (!sameRoundGroup) {
      return []
    }

    return sameRoundGroup.matches
      .map(match => {
        const slotOptions = (['slot1', 'slot2'] as const)
          .map(slot => {
            const validation = dragOperations.canQueueOperationFromSelection(
              selectedCoupleForMove.couple,
              selectedCoupleForMove.match,
              selectedCoupleForMove.slot,
              match,
              slot
            )

            if (!validation.canDrop) {
              return null
            }

            const operationType = dragOperations.determineOperationType(match, slot)
            const participant = match.participants?.[slot]
            const occupantName = participant?.type === 'couple' && participant.couple
              ? participant.couple.name || [
                  `${participant.couple.player1_details?.first_name || ''} ${participant.couple.player1_details?.last_name || ''}`.trim(),
                  `${participant.couple.player2_details?.first_name || ''} ${participant.couple.player2_details?.last_name || ''}`.trim()
                ].filter(Boolean).join(' / ')
              : null
            const placeholderLabel = participant?.type === 'placeholder'
              ? participant.placeholder?.display || null
              : null

            const option: BracketMoveTargetOption = {
              key: `${match.id}-${slot}`,
              matchId: match.id,
              matchLabel: `${ROUND_DISPLAY_NAMES[match.round] ?? match.round} - Match ${match.order_in_round || 'N/A'}`,
              slot,
              slotLabel: slot === 'slot1' ? 'Slot 1' : 'Slot 2',
              round: match.round,
              operationType,
              occupantName,
              placeholderLabel,
              statusLabel: getBracketMatchStatusLabel(match.status)
            }

            return option
          })
          .filter((option): option is BracketMoveTargetOption => option !== null)

        if (slotOptions.length === 0) {
          return null
        }

        return {
          matchId: match.id,
          matchLabel: `${ROUND_DISPLAY_NAMES[match.round] ?? match.round} - Match ${match.order_in_round || 'N/A'}`,
          statusLabel: getBracketMatchStatusLabel(match.status),
          slotOptions
        }
      })
      .filter((group): group is {
        matchId: string
        matchLabel: string
        statusLabel: string
        slotOptions: BracketMoveTargetOption[]
      } => group !== null)
  }, [dragOperations, isEditMode, roundGroups, selectedCoupleForMove])

  const moveTargetKeySet = useMemo(() => new Set(
    moveTargetGroups.flatMap(group => group.slotOptions.map(option => option.key))
  ), [moveTargetGroups])

  useEffect(() => {
    if (!isEditMode || !dragState.isDragging) {
      lastPointerRef.current = null
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current)
        autoScrollFrameRef.current = null
      }
      return
    }

    const updatePointer = (event: DragEvent) => {
      lastPointerRef.current = {
        x: event.clientX,
        y: event.clientY
      }
    }

    const stopAutoScroll = () => {
      lastPointerRef.current = null
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current)
        autoScrollFrameRef.current = null
      }
    }

    const computeVelocity = (distance: number, maxDistance: number, maxStep: number) => {
      const ratio = Math.max(0, Math.min(1, distance / maxDistance))
      return Math.ceil(maxStep * ratio)
    }

    const tick = () => {
      const pointer = lastPointerRef.current

      if (pointer) {
        let verticalDelta = 0

        if (pointer.y < AUTO_SCROLL_EDGE_PX) {
          verticalDelta = -computeVelocity(AUTO_SCROLL_EDGE_PX - pointer.y, AUTO_SCROLL_EDGE_PX, MAX_VERTICAL_SCROLL_STEP)
        } else if (pointer.y > window.innerHeight - AUTO_SCROLL_EDGE_PX) {
          verticalDelta = computeVelocity(
            pointer.y - (window.innerHeight - AUTO_SCROLL_EDGE_PX),
            AUTO_SCROLL_EDGE_PX,
            MAX_VERTICAL_SCROLL_STEP
          )
        }

        if (verticalDelta !== 0) {
          window.scrollBy({
            top: verticalDelta,
            behavior: 'auto'
          })
        }

        const horizontalContainer = desktopScrollRef.current
        if (horizontalContainer) {
          const rect = horizontalContainer.getBoundingClientRect()
          let horizontalDelta = 0

          if (pointer.x > rect.left && pointer.x < rect.right) {
            if (pointer.x < rect.left + AUTO_SCROLL_EDGE_PX) {
              horizontalDelta = -computeVelocity(
                rect.left + AUTO_SCROLL_EDGE_PX - pointer.x,
                AUTO_SCROLL_EDGE_PX,
                MAX_HORIZONTAL_SCROLL_STEP
              )
            } else if (pointer.x > rect.right - AUTO_SCROLL_EDGE_PX) {
              horizontalDelta = computeVelocity(
                pointer.x - (rect.right - AUTO_SCROLL_EDGE_PX),
                AUTO_SCROLL_EDGE_PX,
                MAX_HORIZONTAL_SCROLL_STEP
              )
            }
          }

          if (horizontalDelta !== 0) {
            horizontalContainer.scrollLeft += horizontalDelta
          }
        }
      }

      autoScrollFrameRef.current = requestAnimationFrame(tick)
    }

    window.addEventListener('dragover', updatePointer)
    window.addEventListener('drop', stopAutoScroll)
    window.addEventListener('dragend', stopAutoScroll)
    autoScrollFrameRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('dragover', updatePointer)
      window.removeEventListener('drop', stopAutoScroll)
      window.removeEventListener('dragend', stopAutoScroll)
      stopAutoScroll()
    }
  }, [dragState.isDragging, isEditMode])

  const handleEnterEditMode = () => {
    setIsEditMode(true)
  }

  const closeMovePanel = () => {
    setIsMovePanelOpen(false)
    setSelectedCoupleForMove(null)
  }

  const handleExitEditMode = () => {
    closeMovePanel()
    dragOperations.clearPendingOperations()
    setIsEditMode(false)
  }

  const handleSaveChanges = async () => {
    if (dragState.pendingOperations.length === 0) {
      return
    }

    const result = await dragOperations.saveAllOperations()
    if (result.success) {
      closeMovePanel()
      setIsEditMode(false)
      onDataRefresh?.()
    }
  }

  const handleSelectCoupleForMove = (couple: CoupleData, match: BracketMatchV2, slot: 'slot1' | 'slot2') => {
    if (!isEditMode) {
      return
    }

    const validation = dragOperations.canDragCouple(couple, match, slot)
    if (!validation.canDrag) {
      return
    }

    setSelectedCoupleForMove({ couple, match, slot })
    setIsMovePanelOpen(true)
  }

  const handleSelectMoveTarget = (target: BracketMoveTargetOption) => {
    if (!selectedCoupleForMove) {
      return
    }

    const targetMatch = previewData.matches.find(match => match.id === target.matchId)
    if (!targetMatch) {
      return
    }

    const didQueue = dragOperations.queueOperationFromSelection(
      selectedCoupleForMove.couple,
      selectedCoupleForMove.match,
      selectedCoupleForMove.slot,
      targetMatch,
      target.slot
    )

    if (didQueue) {
      closeMovePanel()
    }
  }

  const renderMatchCard = (match: BracketMatchV2, variant: 'tree' | 'stack') => {
    const previewInfo = getMatchPreviewInfo(match.id, dragState.pendingOperations)
    const hasChanges = previewInfo.hasChanges
    const containerStyle = variant === 'tree'
      ? { height: layout.cardSize.height }
      : undefined

    return (
      <div
        key={match.id}
        className={cn(
          'relative transition-all duration-200',
          variant === 'tree' ? 'w-full' : 'w-full max-w-full',
          hasChanges && 'ring-2 ring-blue-300 ring-opacity-60 rounded-elevated'
        )}
        style={containerStyle}
      >
        {hasChanges && (
          <div className="absolute -top-2 -right-2 z-30">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white shadow-lg">
              {previewInfo.operationsCount}
            </div>
          </div>
        )}

        <GranularMatchCard
          match={match}
          tournamentId={tournamentId}
          tournamentType={tournamentType}
          isOwner={isOwner}
          isEditMode={isEditMode}
          seeds={previewData.seeds}
          onMatchUpdate={onMatchUpdate}
          onRequestStartMatch={(targetMatch) => setMatchDialogAction({ type: 'start', match: targetMatch })}
          onRequestLoadResult={(targetMatch) => setMatchDialogAction({ type: 'result', match: targetMatch })}
          onRequestModifyResult={(targetMatch) =>
            setMatchDialogAction({ type: 'result', match: targetMatch, isModify: true })
          }
          onSelectForMove={handleSelectCoupleForMove}
          selectedMoveSlot={
            selectedCoupleForMove?.match.id === match.id
              ? selectedCoupleForMove.slot
              : null
          }
          moveTargetSlots={{
            slot1: moveTargetKeySet.has(`${match.id}-slot1`),
            slot2: moveTargetKeySet.has(`${match.id}-slot2`)
          }}
          preloadedSetScores={setScoresByMatch ? (setScoresByMatch[match.id] ?? []) : undefined}
          className={cn(
            'w-full border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg',
            variant === 'tree' && 'h-full',
            hasChanges && 'ring-1 ring-blue-200 shadow-blue-50'
          )}
        />
      </div>
    )
  }

  const renderDesktopTreeMatch = (position: TreeMatchPosition) => (
    <div
      key={position.match.id}
      className="absolute"
      style={{
        left: position.x,
        top: position.y,
        width: position.width
      }}
    >
      {renderMatchCard(position.match, 'tree')}
    </div>
  )

  const renderControls = () => (
    <div className="border-b border-slate-200 bg-white">
      <div className="flex flex-col gap-3 p-3 lg:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
              <Users className="h-3.5 w-3.5" />
              {stats.total} partidos
            </div>
            <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
              <Trophy className="h-3.5 w-3.5" />
              {stats.completed} completados
            </div>
            <div className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-blue-700">
              <Clock3 className="h-3.5 w-3.5" />
              {stats.inProgress} en curso
            </div>
            <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              <EyeOff className="h-3.5 w-3.5" />
              {stats.draft} borrador
            </div>
            <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-amber-700">
              <Zap className="h-3.5 w-3.5" />
              {stats.canPlay} listos
            </div>
            <Button
              type="button"
              variant={fitToWidth ? 'default' : 'outline'}
              size="sm"
              className="hidden h-7 gap-1.5 px-2 text-xs lg:inline-flex"
              onClick={() => setFitToWidth(current => !current)}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              {fitToWidth ? `Ajustado ${Math.round(desktopScale * 100)}%` : '100%'}
            </Button>
          </div>

          {isOwner && enableDragDrop && (
              !isEditMode ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleEnterEditMode}
                        variant="outline"
                        size="sm"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        <Edit3 className="mr-2 h-4 w-4" />
                        Reorganizar parejas
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Arrastra o hace click en una pareja para moverla dentro de la misma ronda.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : dragState.pendingOperations.length > 0 ? (
                <>
                  <Button
                    onClick={handleSaveChanges}
                    size="sm"
                    className="bg-green-600 text-white hover:bg-green-700"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Guardar {dragState.pendingOperations.length} cambio(s)
                  </Button>
                  <Button
                    onClick={handleExitEditMode}
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleExitEditMode}
                  variant="outline"
                  size="sm"
                  className="border-gray-300"
                >
                  <X className="mr-2 h-4 w-4" />
                  Editando llave
                </Button>
              )
          )}
        </div>

        {dragState.pendingOperations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-surface border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            <span className="font-medium">
              {dragState.pendingOperations.length} intercambio(s) pendiente(s)
            </span>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              No guardado
            </Badge>
          </div>
        )}
      </div>
    </div>
  )

  if (roundGroups.length === 0) {
    return (
      <div className={cn('rounded-surface border bg-slate-50', className)}>
        {renderControls()}
        <div className="px-6 py-16 text-center">
          <div className="text-lg text-slate-500">No hay partidos para mostrar</div>
          <div className="mt-2 text-sm text-slate-400">Verifica que la llave este generada correctamente.</div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('min-w-0 max-w-full overflow-hidden rounded-surface border bg-slate-50', className)}>
      {renderControls()}

      <div className="lg:hidden">
        <div className="space-y-6 p-4">
          {roundGroups.map(group => (
            <section key={group.round} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{group.displayName}</h3>
                  <p className="text-xs text-slate-500">{group.canPlay} listos para jugar</p>
                </div>
                <Badge
                  variant={group.completedMatches === group.totalMatches ? 'default' : 'secondary'}
                  className={cn(group.completedMatches === group.totalMatches && 'bg-emerald-600')}
                >
                  {group.completedMatches}/{group.totalMatches}
                </Badge>
              </div>
              <div className="space-y-3">
                {group.matches.map(match => renderMatchCard(match, 'stack'))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="hidden lg:block">
        <div ref={desktopScrollRef} className="max-w-full overflow-x-auto overflow-y-hidden px-3 pb-4 pt-3 lg:px-4">
          <div
            className="relative"
            style={{
              width: Math.max(scaledDesktopCanvasWidth, desktopViewportWidth || scaledDesktopCanvasWidth),
              height: scaledDesktopCanvasHeight
            }}
          >
            <div
              className="relative origin-top-left"
              style={{
                width: desktopCanvasWidth,
                height: desktopCanvasHeight,
                transform: `scale(${desktopScale})`,
                transformOrigin: 'top left'
              }}
            >
              <svg
                className="absolute inset-0 pointer-events-none"
                width={desktopCanvasWidth}
                height={desktopCanvasHeight}
              >
                {layout.connectors.map(connector => (
                  <path
                    key={connector.id}
                    d={connector.d}
                    fill="none"
                    stroke="#0f766e"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.9"
                  />
                ))}
              </svg>

              {layout.columns.map(column => (
                <div
                  key={column.round}
                  className="absolute top-3"
                  style={{
                    left: column.x,
                    width: column.width
                  }}
                >
                  <div className="rounded-elevated border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ronda</p>
                        <h3 className="text-sm font-semibold text-slate-900">{column.displayName}</h3>
                      </div>
                      <Badge
                        variant={column.completedMatches === column.totalMatches ? 'default' : 'secondary'}
                        className={cn(column.completedMatches === column.totalMatches && 'bg-emerald-600')}
                      >
                        {column.completedMatches}/{column.totalMatches}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}

              {layout.positions.map(renderDesktopTreeMatch)}
            </div>
          </div>
        </div>
      </div>

      <BracketMoveCoupleSheet
        open={isMovePanelOpen}
        onOpenChange={(open) => {
          setIsMovePanelOpen(open)
          if (!open) {
            setSelectedCoupleForMove(null)
          }
        }}
        selectedCouple={moveSelectionDetails}
        targetGroups={moveTargetGroups}
        onSelectTarget={handleSelectMoveTarget}
      />
      <BracketMatchActionDialogs
        tournamentId={tournamentId}
        tournamentType={tournamentType}
        action={matchDialogAction}
        onClose={() => setMatchDialogAction(null)}
        onMatchUpdate={onMatchUpdate}
        onDataRefresh={onDataRefresh}
      />
    </div>
  )
}

export default ImprovedBracketRenderer
