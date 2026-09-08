'use client'

import { useState, useEffect } from 'react'
import TournamentBracketTab from '@/components/tournament/tournament-bracket-tab'
import PublicBracketTreeView from '@/components/tournament/bracket-v2/components/PublicBracketTreeView'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Database } from '@/database.types'

interface BracketClientWrapperProps {
  tournamentId: string
  isOwner: boolean
  isPublicView?: boolean
}

/**
 * Client wrapper para TournamentBracketTab (torneos americanos)
 * Necesario porque Server Components no pueden pasar event handlers
 * Fetch tournament status para mostrar vistas condicionales
 */
export default function BracketClientWrapper({
  tournamentId,
  isOwner,
  isPublicView = false
}: BracketClientWrapperProps) {
  const [tournamentStatus, setTournamentStatus] = useState<string | null>()
  const [tournament, setTournament] = useState<{
    status: string | null
    type: 'AMERICAN' | 'LONG'
    format_config: unknown
  } | null>(null)
  const supabase = createClientComponentClient<Database>()

  // Fetch tournament status
  useEffect(() => {
    const fetchStatus = async () => {
      const { data } = await supabase
        .from('tournaments')
        .select('status, type, format_config')
        .eq('id', tournamentId)
        .single()

      if (data) {
        setTournamentStatus(data.status)
        setTournament({
          status: data.status,
          type: data.type as 'AMERICAN' | 'LONG',
          format_config: data.format_config,
        })
      }
    }
    fetchStatus()
  }, [tournamentId, supabase])

  const handleDataRefresh = () => {
    window.location.reload()
  }

  if (!tournament) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-500 lg:px-6">
        Cargando llave...
      </div>
    )
  }

  if (!isOwner && tournament) {
    return (
      <div className="px-4 py-4 lg:px-6">
        <div className="mx-auto max-w-7xl">
          <PublicBracketTreeView
            tournamentId={tournamentId}
            tournamentType={tournament.type}
            tournamentFormatConfig={tournament.format_config}
          />
        </div>
      </div>
    )
  }

  return (
    <TournamentBracketTab
      tournamentId={tournamentId}
      isOwner={isOwner}
      isPublicView={isPublicView}
      tournamentStatus={tournamentStatus ?? undefined}
      bracketMode={(tournament.format_config as { bracketMode?: 'NONE' | 'SINGLE' | 'GOLD_SILVER' } | null)?.bracketMode ?? 'SINGLE'}
      onDataRefresh={handleDataRefresh}
    />
  )
}
