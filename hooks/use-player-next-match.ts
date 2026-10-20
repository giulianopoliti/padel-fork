'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Database } from '@/database.types'

type NextMatch = {
  id: string
  tournament_name: string
  tournament_id: string
  opponent_names: [string, string]
  partner_name: string
  scheduled_date?: string
  scheduled_time?: string
  court?: string
  status: 'PENDING' | 'IN_PROGRESS'
}

type UsePlayerNextMatchReturn = {
  nextMatch: NextMatch | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function usePlayerNextMatch(playerId?: string): UsePlayerNextMatchReturn {
  const [nextMatch, setNextMatch] = useState<NextMatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const supabase = createClientComponentClient<Database>()

  const fetchNextMatch = async () => {
    if (!playerId) {
      setNextMatch(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      // First, get all couples where this player participates
      // This uses idx_couples_player1_id and idx_couples_player2_id
      const { data: playerCouples, error: couplesError } = await supabase
        .from('couples')
        .select('id')
        .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)

      if (couplesError) throw couplesError
      
      if (!playerCouples || playerCouples.length === 0) {
        setNextMatch(null)
        return
      }

      const coupleIds = playerCouples.map(c => c.id)

      // Now find the next pending match for any of these couples
      // This uses idx_matches_couples_status and idx_matches_status_tournament
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select(`
          id,
          status,
          couple1_id,
          couple2_id,
          tournaments!inner(id, name),
          fecha_matches(scheduled_date, scheduled_start_time, court_assignment),
          couple1:couples!couple1_id(
            player1:players!player1_id(first_name, last_name),
            player2:players!player2_id(first_name, last_name)
          ),
          couple2:couples!couple2_id(
            player1:players!player1_id(first_name, last_name),
            player2:players!player2_id(first_name, last_name)
          )
        `)
        .or(`couple1_id.in.(${coupleIds.join(',')}),couple2_id.in.(${coupleIds.join(',')})`)
        .in('status', ['PENDING', 'IN_PROGRESS'])
        .eq('bracket_is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)

      if (matchesError) throw matchesError

      if (!matches || matches.length === 0) {
        setNextMatch(null)
        return
      }

      const match = matches[0]
      const isPlayerInCouple1 = coupleIds.includes(match.couple1_id)
      
      // Determine opponent and partner
      let opponentNames: [string, string]
      let partnerName: string

      if (isPlayerInCouple1) {
        // Player is in couple1, so couple2 are opponents
        const couple1 = match.couple1 as any
        const couple2 = match.couple2 as any
        
        opponentNames = [
          `${couple2.player1.first_name} ${couple2.player1.last_name}`,
          `${couple2.player2.first_name} ${couple2.player2.last_name}`
        ]
        
        // Find partner in couple1
        if (couple1.player1.id === playerId) {
          partnerName = `${couple1.player2.first_name} ${couple1.player2.last_name}`
        } else {
          partnerName = `${couple1.player1.first_name} ${couple1.player1.last_name}`
        }
      } else {
        // Player is in couple2, so couple1 are opponents
        const couple1 = match.couple1 as any
        const couple2 = match.couple2 as any
        
        opponentNames = [
          `${couple1.player1.first_name} ${couple1.player1.last_name}`,
          `${couple1.player2.first_name} ${couple1.player2.last_name}`
        ]
        
        // Find partner in couple2  
        if (couple2.player1.id === playerId) {
          partnerName = `${couple2.player2.first_name} ${couple2.player2.last_name}`
        } else {
          partnerName = `${couple2.player1.first_name} ${couple2.player1.last_name}`
        }
      }

      const fechaMatch = Array.isArray(match.fecha_matches) ? match.fecha_matches[0] : match.fecha_matches
      const tournament = Array.isArray(match.tournaments) ? match.tournaments[0] : match.tournaments

      setNextMatch({
        id: match.id,
        tournament_name: tournament?.name || 'Sin nombre',
        tournament_id: tournament?.id || '',
        opponent_names: opponentNames,
        partner_name: partnerName,
        scheduled_date: fechaMatch?.scheduled_date || undefined,
        scheduled_time: fechaMatch?.scheduled_start_time || undefined,
        court: fechaMatch?.court_assignment || undefined,
        status: match.status as 'PENDING' | 'IN_PROGRESS'
      })

    } catch (err) {
      console.error('Error fetching next match:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNextMatch()
  }, [playerId])

  return {
    nextMatch,
    loading,
    error,
    refetch: fetchNextMatch
  }
}
