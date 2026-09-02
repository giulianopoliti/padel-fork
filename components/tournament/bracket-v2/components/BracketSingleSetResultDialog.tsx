'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertCircle, Loader2, Trophy } from 'lucide-react'
import type { BracketMatchV2, CoupleData } from '../types/bracket-types'
import { useMatchManagement } from '../hooks/useMatchManagement'

interface BracketSingleSetResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  match: BracketMatchV2
  couple1: CoupleData
  couple2: CoupleData
  tournamentId: string
  isModifyMode?: boolean
  onResultSaved?: () => void
}

const isValidSetScore = (c1: number, c2: number): boolean => {
  if (c1 < 0 || c2 < 0 || c1 > 7 || c2 > 7) return false
  if ((c1 === 6 && c2 <= 5) || (c2 === 6 && c1 <= 5)) return true
  if ((c1 === 7 && c2 === 5) || (c2 === 7 && c1 === 5)) return true
  if ((c1 === 7 && c2 === 6) || (c2 === 7 && c1 === 6)) return true
  return false
}

const formatPlayerName = (first?: string | null, last?: string | null) =>
  `${first || ''} ${last || ''}`.trim()

const formatCoupleLabel = (couple: CoupleData) =>
  `${formatPlayerName(couple.player1_details?.first_name, couple.player1_details?.last_name)} / ${formatPlayerName(couple.player2_details?.first_name, couple.player2_details?.last_name)}`

export function BracketSingleSetResultDialog({
  open,
  onOpenChange,
  match,
  couple1,
  couple2,
  tournamentId,
  isModifyMode = false,
  onResultSaved,
}: BracketSingleSetResultDialogProps) {
  const [couple1Score, setCouple1Score] = useState('')
  const [couple2Score, setCouple2Score] = useState('')
  const [error, setError] = useState<string | null>(null)
  const couple1InputRef = useRef<HTMLInputElement>(null)

  const [matchState, matchActions] = useMatchManagement(tournamentId)

  useEffect(() => {
    if (!open) return

    const existingSet = match.result?.sets?.[0]
    if (isModifyMode && existingSet) {
      const score1 =
        'slot1Score' in existingSet
          ? existingSet.slot1Score
          : (existingSet as { couple1_games?: number }).couple1_games
      const score2 =
        'slot2Score' in existingSet
          ? existingSet.slot2Score
          : (existingSet as { couple2_games?: number }).couple2_games
      setCouple1Score(score1 != null ? String(score1) : '')
      setCouple2Score(score2 != null ? String(score2) : '')
    } else {
      setCouple1Score('')
      setCouple2Score('')
    }
    setError(null)
    setTimeout(() => couple1InputRef.current?.focus(), 100)
  }, [open, isModifyMode, match])

  const c1 = parseInt(couple1Score, 10)
  const c2 = parseInt(couple2Score, 10)
  const isValid = !Number.isNaN(c1) && !Number.isNaN(c2) && isValidSetScore(c1, c2)
  const canSubmit = isValid && couple1Score !== '' && couple2Score !== ''

  const handleSave = async () => {
    if (!canSubmit) {
      setError('Ingresá un resultado válido de pádel (1 set).')
      return
    }

    setError(null)
    const winnerId = c1 > c2 ? couple1.id : couple2.id
    const result = matchActions.createSingleSetResult(c1, c2, winnerId)
    const success = await matchActions.updateResult(match.id, result, true)

    if (success) {
      onResultSaved?.()
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="text-center text-slate-900">
            {isModifyMode ? 'Modificar resultado' : 'Cargar resultado'}
          </DialogTitle>
          <p className="text-center text-sm text-slate-500">
            {match.round} · Match {match.order_in_round ?? '-'} · 1 set
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-surface border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">{formatCoupleLabel(couple1)}</span>
                <Input
                  ref={couple1InputRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={couple1Score}
                  onChange={(e) => setCouple1Score(e.target.value.replace(/\D/g, '').slice(0, 1))}
                  className="h-10 w-12 text-center text-lg font-bold"
                  disabled={matchState.updatingResult}
                />
              </div>
              <div className="text-center text-xs font-bold uppercase text-slate-400">vs</div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">{formatCoupleLabel(couple2)}</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={couple2Score}
                  onChange={(e) => setCouple2Score(e.target.value.replace(/\D/g, '').slice(0, 1))}
                  className="h-10 w-12 text-center text-lg font-bold"
                  disabled={matchState.updatingResult}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSubmit) {
                      e.preventDefault()
                      void handleSave()
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {isValid && (
            <div className="flex items-center justify-center gap-2 rounded-surface bg-blue-50 p-2 text-sm text-blue-700">
              <Trophy className="h-4 w-4" />
              Ganador: {c1 > c2 ? formatCoupleLabel(couple1) : formatCoupleLabel(couple2)}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-surface bg-red-50 p-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={matchState.updatingResult}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSubmit || matchState.updatingResult}>
            {matchState.updatingResult ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar resultado'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default BracketSingleSetResultDialog
