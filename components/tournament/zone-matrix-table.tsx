"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, GripVertical, Trophy, Users } from "lucide-react"
import { useDraggable } from "@dnd-kit/core"

interface Couple {
  id: string
  player1_name: string
  player2_name: string
  stats: {
    played: number
    won: number
    lost: number
    scored: number
    conceded: number
    points: number
  }
}

interface Match {
  id: string
  couple1_id: string
  couple2_id: string
  result_couple1?: number
  result_couple2?: number
  status: string
  winner_id?: string
  court?: number | null
}

interface Zone {
  id: string
  name: string | null
  capacity?: number | null
  couples: Couple[]
}

interface CoupleMatchStatusSummary {
  finished: number
  inProgress: number
  pending: number
}

interface ZoneMatrixTableProps {
  zone: Zone
  matches: Match[]
  onCoupleClick?: (couple: Couple, zoneId: string) => void
  onCellClick?: (couple1: Couple, couple2: Couple, match: Match | null) => void
  selectedCouples?: Couple[]
  couplesWithFinishedMatches?: string[]
  pendingCoupleIds?: string[]
  matchStatusSummaryByCouple?: Record<string, CoupleMatchStatusSummary>
  isOwner?: boolean
}

const MatchCountDots = ({
  count,
  colorClassName,
  label
}: {
  count: number
  colorClassName: string
  label: string
}) => {
  if (count === 0) return null

  return (
    <span className="inline-flex items-center gap-1" aria-label={`${count} ${label}`} title={`${count} ${label}`}>
      <span className="text-[10px] font-medium text-slate-600">{label}</span>
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <span key={index} className={`h-2 w-2 rounded-full ${colorClassName}`} />
        ))}
      </span>
    </span>
  )
}

// Draggable couple name component for the matrix
const DraggableCoupleRow = ({ 
  couple, 
  zoneId, 
  rowIndex, 
  isSelected, 
  cannotBeMoved,
  isPendingCreation,
  matchStatusSummary,
  onClick 
}: {
  couple: Couple
  zoneId: string
  rowIndex: number
  isSelected: boolean
  cannotBeMoved: boolean
  isPendingCreation: boolean
  matchStatusSummary: CoupleMatchStatusSummary
  onClick: () => void
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `couple-${couple.id}`,
    data: { couple, zoneId },
    disabled: cannotBeMoved
  })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center gap-1 text-xs">
        <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-medium">
          {rowIndex + 1}
        </span>
        {couple.stats.won === 3 && ( // Assuming zone has 4 couples, so 3 wins = zone leader
          <Trophy className="h-3 w-3 text-yellow-500" />
        )}
      </div>
      <button
        type="button"
        className="min-w-0 flex-1 rounded px-1 py-1 text-left transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed"
        onClick={onClick}
        disabled={cannotBeMoved}
        aria-pressed={isSelected}
        aria-label={`Seleccionar a ${couple.player1_name} y ${couple.player2_name}`}
      >
        <div className="font-medium text-slate-900 text-xs truncate">
          {couple.player1_name} / {couple.player2_name}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {isSelected && (
            <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">Seleccionada</span>
          )}
          {isPendingCreation && (
            <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">En cola</span>
          )}
          <MatchCountDots count={matchStatusSummary.finished} colorClassName="bg-emerald-500" label="Jugados" />
          <MatchCountDots count={matchStatusSummary.inProgress} colorClassName="bg-blue-500 ring-2 ring-blue-100" label="En juego" />
          <MatchCountDots count={matchStatusSummary.pending} colorClassName="bg-amber-500" label="Programados" />
          {cannotBeMoved && (
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Cupo completo</span>
          )}
        </div>
      </button>
      {!cannotBeMoved && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          className="hidden h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-700 active:cursor-grabbing lg:flex"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Arrastrar a ${couple.player1_name} y ${couple.player2_name}`}
          title="Arrastrar pareja"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export default function ZoneMatrixTable({
  zone,
  matches,
  onCoupleClick,
  onCellClick,
  selectedCouples = [],
  couplesWithFinishedMatches = [],
  pendingCoupleIds = [],
  matchStatusSummaryByCouple = {},
  isOwner = false
}: ZoneMatrixTableProps) {
  // Helper function to get match result between two couples
  const getMatchResult = (couple1Id: string, couple2Id: string) => {
    const match = matches.find(m =>
      (m.couple1_id === couple1Id && m.couple2_id === couple2Id) ||
      (m.couple1_id === couple2Id && m.couple2_id === couple1Id)
    )

    if (!match) return null

    if (match.status !== 'FINISHED' || match.result_couple1 == null || match.result_couple2 == null) {
      return {
        match, // ✅ Retornar match completo
        status: match.status,
        result: null,
        isPending: true
      }
    }

    // Determine the result from couple1's perspective
    let couple1Result, couple2Result
    if (match.couple1_id === couple1Id) {
      couple1Result = match.result_couple1
      couple2Result = match.result_couple2
    } else {
      couple1Result = match.result_couple2
      couple2Result = match.result_couple1
    }

    return {
      match, // ✅ Retornar match completo
      status: match.status,
      result: `${couple1Result}-${couple2Result}`,
      isPending: false,
      isWin: couple1Result > couple2Result
    }
  }

  // Helper function to check if couple is selected
  const isCoupleSelected = (coupleId: string) => {
    return selectedCouples.some(c => c.id === coupleId)
  }

  // Helper function to check if couple has finished matches (can't be moved)
  const coupleCannotBeMoved = (coupleId: string) => {
    return couplesWithFinishedMatches.includes(coupleId)
  }

  const isCouplePendingCreation = (coupleId: string) => pendingCoupleIds.includes(coupleId)

  const getCoupleMatchStatusSummary = (coupleId: string): CoupleMatchStatusSummary =>
    matchStatusSummaryByCouple[coupleId] || { finished: 0, inProgress: 0, pending: 0 }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium text-slate-900">
            {zone.name || `Zona ${zone.id}`}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {zone.couples.length} parejas
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {zone.couples.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            <Users className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p>No hay parejas en esta zona</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left p-2 font-medium text-slate-700 min-w-[140px] sticky left-0 bg-slate-50 z-10">
                    Pareja
                  </th>
                  {zone.couples.map((couple, index) => (
                    <th key={couple.id} className="text-center p-2 font-medium text-slate-700 min-w-[60px]">
                      {index + 1}
                    </th>
                  ))}
                  <th className="text-center p-2 font-medium text-slate-700 min-w-[80px]">
                    G-P
                  </th>
                  <th className="text-center p-2 font-medium text-slate-700 min-w-[60px]">
                    Sets
                  </th>
                </tr>
              </thead>
              <tbody>
                {zone.couples.map((couple, rowIndex) => (
                  <tr 
                    key={couple.id} 
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                      isCoupleSelected(couple.id)
                        ? 'bg-rose-50 ring-2 ring-inset ring-rose-300'
                        : isCouplePendingCreation(couple.id)
                          ? 'bg-rose-50/70'
                          : getCoupleMatchStatusSummary(couple.id).inProgress > 0
                            ? 'bg-blue-50/70'
                            : getCoupleMatchStatusSummary(couple.id).finished > 0
                              ? 'bg-emerald-50/60'
                              : ''
                    }`}
                  >
                    {/* Couple name column - sticky */}
                    <td 
                      className={`p-2 sticky left-0 bg-white hover:bg-slate-50 transition-colors ${
                        isCoupleSelected(couple.id)
                          ? 'bg-rose-50'
                          : isCouplePendingCreation(couple.id)
                            ? 'bg-rose-50'
                            : getCoupleMatchStatusSummary(couple.id).inProgress > 0
                              ? 'bg-blue-50'
                              : getCoupleMatchStatusSummary(couple.id).finished > 0
                                ? 'bg-emerald-50'
                                : ''
                      }`}
                    >
                      <DraggableCoupleRow
                        couple={couple}
                        zoneId={zone.id}
                        rowIndex={rowIndex}
                        isSelected={isCoupleSelected(couple.id)}
                        cannotBeMoved={coupleCannotBeMoved(couple.id)}
                        isPendingCreation={isCouplePendingCreation(couple.id)}
                        matchStatusSummary={getCoupleMatchStatusSummary(couple.id)}
                        onClick={() => {
                          if (!coupleCannotBeMoved(couple.id)) {
                            onCoupleClick?.(couple, zone.id)
                          }
                        }}
                      />
                    </td>

                    {/* Match result columns */}
                    {zone.couples.map((opponentCouple, colIndex) => {
                      const matchResult = getMatchResult(couple.id, opponentCouple.id)
                      const isClickable = rowIndex !== colIndex && isOwner && onCellClick

                      return (
                        <td
                          key={opponentCouple.id}
                          className={`p-1 text-center ${
                            isClickable
                              ? 'cursor-pointer hover:bg-blue-50 hover:ring-2 hover:ring-blue-300 hover:ring-inset transition-all rounded'
                              : ''
                          }`}
                          onClick={() => {
                            if (isClickable) {
                              onCellClick(couple, opponentCouple, matchResult?.match || null)
                            }
                          }}
                          title={isClickable ? 'Click para gestionar partido' : ''}
                        >
                          {rowIndex === colIndex ? (
                            // Same couple - blocked cell
                            <div className="bg-slate-300 text-slate-500 text-xs font-bold py-1 px-2 rounded">
                              ■■■
                            </div>
                          ) : (
                            // Different couple - show match result
                            (() => {
                              if (!matchResult) {
                                // No match scheduled
                                return (
                                  <div className="text-slate-400 text-xs py-1 px-2">
                                    —
                                  </div>
                                )
                              } else if (matchResult.isPending) {
                                // Match scheduled but not finished
                                return (
                                  <div className="flex flex-col items-center justify-center gap-0.5 py-1">
                                    <Clock className="h-3 w-3 text-blue-500" />
                                    {matchResult.match?.court && (
                                      <span className="text-[10px] font-bold text-blue-600">
                                        C{matchResult.match.court}
                                      </span>
                                    )}
                                  </div>
                                )
                              } else {
                                // Match finished - show result
                                return (
                                  <div className={`text-xs font-medium py-1 px-2 rounded ${
                                    matchResult.isWin
                                      ? 'text-green-700 bg-green-50'
                                      : 'text-red-700 bg-red-50'
                                  }`}>
                                    {matchResult.result}
                                  </div>
                                )
                              }
                            })()
                          )}
                        </td>
                      )
                    })}

                    {/* Win-Loss record */}
                    <td className="p-2 text-center">
                      <div className="text-xs font-medium">
                        <span className="text-green-600">{couple.stats.won}</span>
                        <span className="text-slate-500">-</span>
                        <span className="text-red-600">{couple.stats.lost}</span>
                      </div>
                    </td>

                    {/* Sets difference */}
                    <td className="p-2 text-center">
                      <Badge 
                        variant={couple.stats.points >= 0 ? "default" : "secondary"} 
                        className={`text-xs ${couple.stats.points >= 0 ? 'bg-green-600 text-white' : 'bg-red-100 text-red-700'}`}
                      >
                        {couple.stats.points >= 0 ? '+' : ''}{couple.stats.points}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
