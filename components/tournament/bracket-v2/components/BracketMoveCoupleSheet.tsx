'use client'

import React from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/components/ui/use-mobile'
import { cn } from '@/lib/utils'
import { ArrowRightLeft, ChevronRight, Clock3, GitBranch, Trophy, Users } from 'lucide-react'

export interface BracketMoveSelection {
  coupleId: string
  coupleName: string
  sourceMatchId: string
  sourceMatchLabel: string
  sourceSlot: 'slot1' | 'slot2'
  round: string
}

export interface BracketMoveTargetOption {
  key: string
  matchId: string
  matchLabel: string
  slot: 'slot1' | 'slot2'
  slotLabel: string
  round: string
  operationType: 'swap' | 'move-to-empty' | 'move-to-placeholder'
  occupantName?: string | null
  placeholderLabel?: string | null
  statusLabel: string
}

interface BracketMoveTargetGroup {
  matchId: string
  matchLabel: string
  statusLabel: string
  slotOptions: BracketMoveTargetOption[]
}

interface BracketMoveCoupleSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCouple: BracketMoveSelection | null
  targetGroups: BracketMoveTargetGroup[]
  onSelectTarget: (target: BracketMoveTargetOption) => void
}

function getOperationBadge(option: BracketMoveTargetOption) {
  switch (option.operationType) {
    case 'swap':
      return <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Reemplaza</Badge>
    case 'move-to-placeholder':
      return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Placeholder</Badge>
    case 'move-to-empty':
      return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Vacio</Badge>
    default:
      return null
  }
}

export function BracketMoveCoupleSheet({
  open,
  onOpenChange,
  selectedCouple,
  targetGroups,
  onSelectTarget
}: BracketMoveCoupleSheetProps) {
  const isMobile = useIsMobile()

  if (!selectedCouple) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'flex flex-col gap-0',
          isMobile ? 'h-[85vh]' : 'w-full sm:max-w-[540px]'
        )}
      >
        <SheetHeader className="flex-shrink-0 border-b border-slate-200 pb-4">
          <SheetTitle>Mover pareja</SheetTitle>
          <SheetDescription className="space-y-2 text-left">
            <span className="block text-base font-medium text-slate-900">
              {selectedCouple.coupleName}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                <GitBranch className="mr-1 h-3 w-3" />
                {selectedCouple.round}
              </Badge>
              <span>Origen: {selectedCouple.sourceMatchLabel} - {selectedCouple.sourceSlot.toUpperCase()}</span>
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4">
          <div className="space-y-4">
            {targetGroups.length > 0 ? (
              targetGroups.map(group => (
                <section key={group.matchId} className="rounded-elevated border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{group.matchLabel}</h3>
                      <p className="text-xs text-slate-500">{group.statusLabel}</p>
                    </div>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      2 slots
                    </Badge>
                  </div>

                  <div className="space-y-3 p-3">
                    {group.slotOptions.map(option => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => onSelectTarget(option)}
                        className="w-full rounded-surface border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                                {option.slotLabel}
                              </div>
                              {getOperationBadge(option)}
                            </div>

                            <div className="space-y-1">
                              {option.occupantName ? (
                                <div className="flex items-center gap-2 text-sm text-slate-800">
                                  <Users className="h-4 w-4 text-slate-400" />
                                  <span className="font-medium">{option.occupantName}</span>
                                </div>
                              ) : option.placeholderLabel ? (
                                <div className="flex items-center gap-2 text-sm text-amber-700">
                                  <Clock3 className="h-4 w-4 text-amber-500" />
                                  <span>{option.placeholderLabel}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-sm text-emerald-700">
                                  <Trophy className="h-4 w-4 text-emerald-500" />
                                  <span>Slot libre</span>
                                </div>
                              )}

                              <div className="text-xs text-slate-500">
                                {option.operationType === 'swap'
                                  ? 'La pareja actual pasara al lugar seleccionado.'
                                  : option.operationType === 'move-to-placeholder'
                                    ? 'La pareja ocupara este placeholder.'
                                    : 'La pareja se movera a este slot vacio.'}
                              </div>
                            </div>
                          </div>

                          <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="rounded-elevated border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                <ArrowRightLeft className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-3 text-sm font-medium text-slate-700">No hay destinos disponibles</p>
                <p className="mt-1 text-xs text-slate-500">
                  Solo se pueden mover parejas entre matches pendientes del mismo round.
                </p>
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="flex-shrink-0 border-t border-slate-200 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full bg-slate-50 hover:bg-slate-100"
          >
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export default BracketMoveCoupleSheet
