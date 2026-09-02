'use client'

import React, { useState } from 'react'
import { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertCircle, Loader2 } from 'lucide-react'
import { ExistingMatch, updateMatchResult, SetResult, MatchResultData, modifyMatchResult } from '../actions'
import { createClient } from '@/utils/supabase/client'

interface LoadMatchResultDialogProps {
  match: ExistingMatch
  open: boolean
  onOpenChange: (open: boolean) => void
  onResultSaved: () => void
  onUpdateMatchResult?: (matchId: string, sets: SetResult[], winnerId: string, resultCouple1: string, resultCouple2: string) => Promise<{success: boolean, error?: string}>
  isModifyMode?: boolean // New prop to indicate modification mode
  tournamentId?: string // ✅ NUEVO: Para invalidar cache SWR
}

const LoadMatchResultDialog: React.FC<LoadMatchResultDialogProps> = ({
  match,
  open,
  onOpenChange,
  onResultSaved,
  onUpdateMatchResult,
  isModifyMode = false,
  tournamentId
}) => {
  const [set1Score, setSet1Score] = useState('')
  const [set2Score, setSet2Score] = useState('')
  const [set3Score, setSet3Score] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingExistingSets, setLoadingExistingSets] = useState(false)

  // Load existing sets if in modify mode
  const loadExistingSets = async () => {
    if (!isModifyMode || !match.id) return

    setLoadingExistingSets(true)
    try {
      const supabase = createClient()
      const { data: existingSets, error } = await supabase
        .from('set_matches')
        .select('set_number, couple1_games, couple2_games')
        .eq('match_id', match.id)
        .order('set_number', { ascending: true })

      if (error) {
        console.error('Error loading existing sets:', error)
        return
      }

      if (existingSets && existingSets.length > 0) {
        // Pre-fill the form with existing set data
        if (existingSets[0]) {
          setSet1Score(`${existingSets[0].couple1_games}${existingSets[0].couple2_games}`)
        }
        if (existingSets[1]) {
          setSet2Score(`${existingSets[1].couple1_games}${existingSets[1].couple2_games}`)
        }
        if (existingSets[2]) {
          setSet3Score(`${existingSets[2].couple1_games}${existingSets[2].couple2_games}`)
        }
      }
    } catch (err) {
      console.error('Error loading existing sets:', err)
    } finally {
      setLoadingExistingSets(false)
    }
  }

  // Load existing sets when dialog opens in modify mode
  React.useEffect(() => {
    if (open && isModifyMode) {
      loadExistingSets()
    } else if (open && !isModifyMode) {
      // Reset form for load mode
      setSet1Score('')
      setSet2Score('')
      setSet3Score('')
      setError(null)
    }
  }, [open, isModifyMode, match.id])

  // Get couple players for stacked display
  const getCouple1Players = () => {
    if (match.couple1?.player1 && match.couple1?.player2) {
      return {
        player1: `${match.couple1.player1.first_name} ${match.couple1.player1.last_name}`,
        player2: `${match.couple1.player2.first_name} ${match.couple1.player2.last_name}`
      }
    }
    return { player1: 'Jugador 1A', player2: 'Jugador 1B' }
  }

  const getCouple2Players = () => {
    if (match.couple2?.player1 && match.couple2?.player2) {
      return {
        player1: `${match.couple2.player1.first_name} ${match.couple2.player1.last_name}`,
        player2: `${match.couple2.player2.first_name} ${match.couple2.player2.last_name}`
      }
    }
    return { player1: 'Jugador 2A', player2: 'Jugador 2B' }
  }

  // Parse set score from OTP format (e.g., "64" -> [6, 4])
  const parseSetScore = (scoreString: string): [number, number] | null => {
    if (scoreString.length !== 2) return null
    const c1 = parseInt(scoreString[0])
    const c2 = parseInt(scoreString[1])
    if (isNaN(c1) || isNaN(c2)) return null
    return [c1, c2]
  }

  // Validate set score (padel rules)
  const isValidSetScore = (c1: number, c2: number): boolean => {
    if (c1 < 0 || c2 < 0 || c1 > 7 || c2 > 7) return false

    // Valid padel scores (en torneos americanos se permite 6-5)
    if ((c1 === 6 && c2 <= 5) || (c2 === 6 && c1 <= 5)) return true // 6-0, 6-1, 6-2, 6-3, 6-4, 6-5
    if ((c1 === 7 && c2 === 5) || (c2 === 7 && c1 === 5)) return true // 7-5
    if ((c1 === 7 && c2 === 6) || (c2 === 7 && c1 === 6)) return true // 7-6 tiebreak

    return false
  }

  // Calculate match result
  const calculateMatchResult = () => {
    const scores: [number, number][] = []
    
    if (set1Score) {
      const parsed = parseSetScore(set1Score)
      if (parsed) scores.push(parsed)
    }
    if (set2Score) {
      const parsed = parseSetScore(set2Score)
      if (parsed) scores.push(parsed)
    }
    if (set3Score) {
      const parsed = parseSetScore(set3Score)
      if (parsed) scores.push(parsed)
    }

    let couple1Sets = 0
    let couple2Sets = 0

    scores.forEach(([c1, c2]) => {
      if (c1 > c2) couple1Sets++
      else couple2Sets++
    })

    return { couple1Sets, couple2Sets, validSets: scores }
  }

  // Check if match result is valid
  const isValidMatchResult = (): boolean => {
    const { couple1Sets, couple2Sets, validSets } = calculateMatchResult()
    
    // Must have at least 2 sets
    if (validSets.length < 2) return false
    
    // All entered sets must be valid
    const allSetsValid = validSets.every(([c1, c2]) => isValidSetScore(c1, c2))
    if (!allSetsValid) return false
    
    // Match must have a clear winner
    if (validSets.length === 2) {
      return couple1Sets === 2 || couple2Sets === 2
    } else if (validSets.length === 3) {
      return (couple1Sets === 2 && couple2Sets === 1) || (couple1Sets === 1 && couple2Sets === 2)
    }
    
    return false
  }

  // Handle form submission
  const handleSubmit = async () => {
    if (!isValidMatchResult()) {
      setError('Por favor verifica que todos los sets tengan resultados válidos')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { couple1Sets, couple2Sets, validSets } = calculateMatchResult()
      
      // Convert to SetResult format for the API
      const sets: SetResult[] = validSets.map(([c1, c2], index) => ({
        set_number: index + 1,
        couple1_games: c1,
        couple2_games: c2
      }))

      const winnerId = couple1Sets > couple2Sets ? match.couple1_id : match.couple2_id
      
      if (!winnerId) {
        setError('Error determinando el ganador del partido')
        return
      }

      const matchResultData: MatchResultData = {
        matchId: match.id,
        sets,
        winnerId,
        result_couple1: couple1Sets.toString(),
        result_couple2: couple2Sets.toString()
      }

      let result
      
      // Use modify or update based on mode
      if (isModifyMode) {
        // Try optimistic update first if available, otherwise use direct modify action
        if (onUpdateMatchResult && winnerId) {
          result = await onUpdateMatchResult(
            match.id,
            sets,
            winnerId,
            couple1Sets.toString(),
            couple2Sets.toString()
          )
        } else {
          result = await modifyMatchResult(matchResultData)
        }
      } else {
        // Standard load result flow
        if (onUpdateMatchResult && winnerId) {
          result = await onUpdateMatchResult(
            match.id,
            sets,
            winnerId,
            couple1Sets.toString(),
            couple2Sets.toString()
          )
        } else {
          result = await updateMatchResult(matchResultData)
        }
      }

      if (result.success) {
        // ✅ INVALIDAR CACHE SWR INMEDIATAMENTE AL ÉXITO
        if (tournamentId) {
          mutate(`/api/tournaments/${tournamentId}/matches`)
          mutate(`tournament-sidebar-${tournamentId}`)
          mutate(`/api/tournaments/${tournamentId}/seeds`)

          console.log('🔄 [LoadMatchResultDialog] Cache SWR invalidado:', {
            matches: `/api/tournaments/${tournamentId}/matches`,
            sidebar: `tournament-sidebar-${tournamentId}`,
            seeds: `/api/tournaments/${tournamentId}/seeds`,
            mode: isModifyMode ? 'modify' : 'load'
          })
        }

        onResultSaved()
        onOpenChange(false)
        // Reset form
        setSet1Score('')
        setSet2Score('')
        setSet3Score('')
        setError(null)
      } else {
        setError(result.error || `Error al ${isModifyMode ? 'modificar' : 'cargar'} el resultado`)
      }
    } catch (err) {
      setError('Error inesperado al cargar el resultado')
      console.error('Error loading match result:', err)
    } finally {
      setLoading(false)
    }
  }

  const { couple1Sets, couple2Sets, validSets } = calculateMatchResult()

  // Handle form submit on Enter
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isValidMatchResult() && !loading && !loadingExistingSets) {
      handleSubmit()
    }
  }

  // Auto-focus to next input after entering a digit
  const handleInputChange = (
    setValue: React.Dispatch<React.SetStateAction<string>>,
    currentValue: string,
    newDigit: string,
    nextInputRef?: React.RefObject<HTMLInputElement>
  ) => {
    setValue(currentValue[0] ? currentValue[0] + newDigit : newDigit)
    if (nextInputRef?.current) {
      setTimeout(() => nextInputRef.current?.focus(), 0)
    }
  }

  // Refs for auto-focus
  const set1P1Ref = React.useRef<HTMLInputElement>(null)
  const set1P2Ref = React.useRef<HTMLInputElement>(null)
  const set2P1Ref = React.useRef<HTMLInputElement>(null)
  const set2P2Ref = React.useRef<HTMLInputElement>(null)
  const set3P1Ref = React.useRef<HTMLInputElement>(null)
  const set3P2Ref = React.useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-slate-900 text-center">
            {isModifyMode ? 'Modificar Resultado' : 'Cargar Resultado'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleFormSubmit} className="space-y-6">
          {/* Loading indicator for existing sets */}
          {loadingExistingSets && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-slate-600">Cargando resultado actual...</span>
            </div>
          )}

          {/* Header con labels de sets y validaciones - más hacia la derecha */}
          <div className="flex items-center gap-4">
            <div className="w-40"></div>
            <div className="flex items-center gap-4 ml-4">
              <div className="flex flex-col items-center gap-1 w-10">
                <span className="text-sm font-medium text-slate-600">S1</span>
                {set1Score.length === 2 && parseSetScore(set1Score) && !isValidSetScore(...parseSetScore(set1Score)!) && (
                  <span className="text-xs text-red-500">✗</span>
                )}
                {set1Score.length === 2 && parseSetScore(set1Score) && isValidSetScore(...parseSetScore(set1Score)!) && (
                  <span className="text-xs text-green-500">✓</span>
                )}
              </div>
              <div className="flex flex-col items-center gap-1 w-10">
                <span className="text-sm font-medium text-slate-600">S2</span>
                {set2Score.length === 2 && parseSetScore(set2Score) && !isValidSetScore(...parseSetScore(set2Score)!) && (
                  <span className="text-xs text-red-500">✗</span>
                )}
                {set2Score.length === 2 && parseSetScore(set2Score) && isValidSetScore(...parseSetScore(set2Score)!) && (
                  <span className="text-xs text-green-500">✓</span>
                )}
              </div>
              <div className="flex flex-col items-center gap-1 w-10">
                <span className="text-sm font-medium text-slate-600">S3</span>
                {set3Score.length === 2 && parseSetScore(set3Score) && !isValidSetScore(...parseSetScore(set3Score)!) && (
                  <span className="text-xs text-red-500">✗</span>
                )}
                {set3Score.length === 2 && parseSetScore(set3Score) && isValidSetScore(...parseSetScore(set3Score)!) && (
                  <span className="text-xs text-green-500">✓</span>
                )}
              </div>
            </div>
          </div>

          {/* Pareja 1 con nombres apilados y inputs mejorados */}
          <div className="flex items-center gap-4">
            <div className="w-40">
              <div className="text-base font-semibold text-slate-900 leading-tight">
                {getCouple1Players().player1}
              </div>
              <div className="text-base font-semibold text-slate-900 leading-tight">
                {getCouple1Players().player2}
              </div>
            </div>
            <div className="flex items-center gap-4 ml-4">
              <Input
                ref={set1P1Ref}
                type="text"
                maxLength={1}
                value={set1Score[0] || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-7]/g, '')
                  if (value) {
                    setSet1Score(value + (set1Score[1] || ''))
                  } else {
                    setSet1Score('')
                  }
                }}
                className="w-10 h-10 text-center font-mono text-lg font-bold border-2 border-slate-300 focus:border-blue-500 bg-white shadow-sm"
                tabIndex={1}
              />
              <Input
                ref={set2P1Ref}
                type="text"
                maxLength={1}
                value={set2Score[0] || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-7]/g, '')
                  if (value) {
                    setSet2Score(value + (set2Score[1] || ''))
                  } else {
                    setSet2Score('')
                  }
                }}
                className="w-10 h-10 text-center font-mono text-lg font-bold border-2 border-slate-300 focus:border-blue-500 bg-white shadow-sm"
                tabIndex={3}
              />
              <Input
                ref={set3P1Ref}
                type="text"
                maxLength={1}
                value={set3Score[0] || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-7]/g, '')
                  if (value) {
                    setSet3Score(value + (set3Score[1] || ''))
                  } else {
                    setSet3Score('')
                  }
                }}
                className="w-10 h-10 text-center font-mono text-lg font-bold border-2 border-slate-300 focus:border-blue-500 bg-white shadow-sm"
                tabIndex={5}
              />
            </div>
          </div>

          {/* VS separador más prominente */}
          <div className="text-center text-slate-500 font-bold text-lg">vs</div>

          {/* Pareja 2 con nombres apilados y inputs mejorados */}
          <div className="flex items-center gap-4">
            <div className="w-40">
              <div className="text-base font-semibold text-slate-900 leading-tight">
                {getCouple2Players().player1}
              </div>
              <div className="text-base font-semibold text-slate-900 leading-tight">
                {getCouple2Players().player2}
              </div>
            </div>
            <div className="flex items-center gap-4 ml-4">
              <Input
                ref={set1P2Ref}
                type="text"
                maxLength={1}
                value={set1Score[1] || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-7]/g, '')
                  if (value) {
                    setSet1Score((set1Score[0] || '') + value)
                  } else {
                    setSet1Score(set1Score[0] || '')
                  }
                }}
                className="w-10 h-10 text-center font-mono text-lg font-bold border-2 border-slate-300 focus:border-blue-500 bg-white shadow-sm"
                tabIndex={2}
              />
              <Input
                ref={set2P2Ref}
                type="text"
                maxLength={1}
                value={set2Score[1] || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-7]/g, '')
                  if (value) {
                    setSet2Score((set2Score[0] || '') + value)
                  } else {
                    setSet2Score(set2Score[0] || '')
                  }
                }}
                className="w-10 h-10 text-center font-mono text-lg font-bold border-2 border-slate-300 focus:border-blue-500 bg-white shadow-sm"
                tabIndex={4}
              />
              <Input
                ref={set3P2Ref}
                type="text"
                maxLength={1}
                value={set3Score[1] || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-7]/g, '')
                  if (value) {
                    setSet3Score((set3Score[0] || '') + value)
                  } else {
                    setSet3Score(set3Score[0] || '')
                  }
                }}
                className="w-10 h-10 text-center font-mono text-lg font-bold border-2 border-slate-300 focus:border-blue-500 bg-white shadow-sm"
                tabIndex={6}
              />
            </div>
          </div>

          {/* Result Summary */}
          {validSets.length >= 2 && (
            <div className="text-center py-2 bg-slate-50 rounded-surface">
              <div className="text-sm text-slate-600">
                Sets: <span className="font-medium text-blue-600">{couple1Sets}</span> - <span className="font-medium text-blue-600">{couple2Sets}</span>
              </div>
              {isValidMatchResult() && (
                <div className="text-xs text-green-600 mt-1">
                  Ganador: {couple1Sets > couple2Sets ? 
                    `${getCouple1Players().player1} / ${getCouple1Players().player2}` : 
                    `${getCouple2Players().player1} / ${getCouple2Players().player2}`
                  }
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
            tabIndex={8}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={!isValidMatchResult() || loading || loadingExistingSets}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            tabIndex={7}
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {isModifyMode ? 'Modificando...' : 'Cargando...'}
              </div>
            ) : (
              isModifyMode ? 'Modificar' : 'Cargar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default LoadMatchResultDialog