'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { ImprovedBracketRenderer } from '@/components/tournament/bracket-v2/components/ImprovedBracketRenderer'
import { BracketDragDropProvider } from '@/components/tournament/bracket-v2/context/bracket-drag-context'
import { useBracketData } from '@/components/tournament/bracket-v2/hooks/useBracketData'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, Eye, EyeOff, Loader2, MoreHorizontal, Repeat2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TournamentFormatResolver } from '@/lib/services/tournament-format-resolver'
import type { BracketKey } from '@/types/tournament-format-v2'
import BracketReplacementDialog from './BracketReplacementDialog'

interface LongBracketViewProps {
  tournamentId: string
  onMatchUpdate?: () => void
}

interface Tournament {
  id: string
  name: string
  type: 'AMERICAN' | 'LONG'
  format_config?: unknown
  user_is_owner?: boolean
}

interface TournamentPermissions {
  hasPermission: boolean
  userRole?: string
  source?: 'club_owner' | 'organization_member' | 'admin'
  reason?: string
}

export default function LongBracketView({ tournamentId, onMatchUpdate }: LongBracketViewProps) {
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [permissions, setPermissions] = useState<TournamentPermissions | null>(null)
  const [tournamentLoading, setTournamentLoading] = useState(true)
  const [tournamentError, setTournamentError] = useState<string | null>(null)
  const [activeBracketKey, setActiveBracketKey] = useState<BracketKey>('MAIN')
  const [replacementDialogOpen, setReplacementDialogOpen] = useState(false)
  const [updatingDraftScope, setUpdatingDraftScope] = useState<string | null>(null)

  useEffect(() => {
    if (!tournamentId) return

    const fetchTournament = async () => {
      try {
        const supabase = createClient()

        const [
          { data: tournamentData, error: tournamentDataError },
          permissionsResponse
        ] = await Promise.all([
          supabase
            .from('tournaments')
            .select('id, name, type, club_id, format_config')
            .eq('id', tournamentId)
            .single(),
          fetch(`/api/tournaments/${tournamentId}/permissions`, {
            method: 'GET',
            credentials: 'include'
          })
        ])

        if (tournamentDataError) throw tournamentDataError

        if (!permissionsResponse.ok) {
          const errorData = await permissionsResponse.json()
          throw new Error(errorData.error || 'Error verificando permisos')
        }

        const permissionsData: TournamentPermissions = await permissionsResponse.json()

        setTournament({
          id: tournamentData.id,
          name: tournamentData.name,
          type: tournamentData.type as 'AMERICAN' | 'LONG',
          format_config: tournamentData.format_config,
          user_is_owner: permissionsData.hasPermission
        })

        setPermissions(permissionsData)
      } catch (error: any) {
        console.error('Error fetching tournament:', error)
        setTournamentError(error.message || 'Error loading tournament')
      } finally {
        setTournamentLoading(false)
      }
    }

    fetchTournament()
  }, [tournamentId])

  const hasManagementPermissions = permissions?.hasPermission || false
  const resolvedFormat = useMemo(() => {
    if (!tournament) return null
    return TournamentFormatResolver.getResolvedFormat(tournament)
  }, [tournament])
  const isGoldSilverFormat = resolvedFormat?.effectiveBracketMode === 'GOLD_SILVER'

  useEffect(() => {
    if (isGoldSilverFormat && activeBracketKey === 'MAIN') {
      setActiveBracketKey('GOLD')
    }
    if (!isGoldSilverFormat && activeBracketKey !== 'MAIN') {
      setActiveBracketKey('MAIN')
    }
  }, [isGoldSilverFormat, activeBracketKey])

  const {
    data: bracketData,
    loading: bracketLoading,
    error,
    refetch
  } = useBracketData(tournamentId, {
    algorithm: 'serpentine',
    bracketKey: activeBracketKey,
    config: {
      features: {
        enableDragDrop: hasManagementPermissions,
        enableLiveScoring: hasManagementPermissions,
        showSeeds: true,
        showZoneInfo: true,
        showStatistics: true,
        autoProcessBYEs: true
      }
    },
    enabled: !tournamentLoading && !!tournament && !!permissions
  })

  const bracketDraftStats = useMemo(() => {
    const matches = bracketData?.matches || []
    return {
      draft: matches.filter(match => match.status === 'DRAFT').length,
      published: matches.filter(match => match.status === 'PENDING').length,
      total: matches.length,
    }
  }, [bracketData?.matches])

  const activeBracketLabel = activeBracketKey === 'GOLD'
    ? 'Oro'
    : activeBracketKey === 'SILVER'
      ? 'Plata'
      : 'llave'

  const handleDataRefresh = () => {
    console.log('Long Bracket - Data refreshed')
    refetch()
  }

  const handleMatchUpdate = (matchId: string, updatedData: any) => {
    console.log('Long Bracket - Match updated:', { matchId, updatedData })
    refetch()
    onMatchUpdate?.()
  }

  const handleReplacementComplete = () => {
    refetch()
    onMatchUpdate?.()
  }

  const handleUpdateBracketDraft = async (
    mode: 'draft' | 'publish',
    scope: 'bracket' | 'all'
  ) => {
    const updateKey = `${mode}-${scope}`
    setUpdatingDraftScope(updateKey)

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bracket-matches/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode,
          scope,
          bracketKey: scope === 'bracket' ? activeBracketKey : undefined,
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'No se pudieron actualizar los partidos')
      }

      toast.success(result.message || 'Partidos actualizados')
      await refetch()
      onMatchUpdate?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron actualizar los partidos')
    } finally {
      setUpdatingDraftScope(null)
    }
  }

  const bracketHeader = tournament && isGoldSilverFormat ? (
    <div className="rounded-lg border border-slate-200 bg-white p-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          size="lg"
          variant={activeBracketKey === 'GOLD' ? 'default' : 'ghost'}
          className="h-11 text-base font-semibold"
          onClick={() => setActiveBracketKey('GOLD')}
        >
          Oro
        </Button>
        <Button
          type="button"
          size="lg"
          variant={activeBracketKey === 'SILVER' ? 'default' : 'ghost'}
          className="h-11 text-base font-semibold"
          onClick={() => setActiveBracketKey('SILVER')}
        >
          Plata
        </Button>
      </div>
    </div>
  ) : null

  if (tournamentLoading) {
    return <LongBracketSkeleton />
  }

  if (tournamentError) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          <strong>Error al cargar torneo:</strong> {tournamentError}
        </AlertDescription>
      </Alert>
    )
  }

  if (!tournament) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Torneo no encontrado o no tienes permisos para acceder a el.
        </AlertDescription>
      </Alert>
    )
  }

  if (bracketLoading) {
    return (
      <div className="space-y-3">
        {bracketHeader}
        <LongBracketContentSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3">
        {bracketHeader}
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Error al cargar llave:</strong> {error.message}. Podés cambiar de copa o recargar la pagina.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!bracketData) {
    return (
      <div className="space-y-3">
        {bracketHeader}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No hay datos de la llave disponibles para esta copa. Podés cambiar entre Oro y Plata sin recargar.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {(bracketHeader || hasManagementPermissions) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            {bracketHeader}
          </div>
          {hasManagementPermissions && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {bracketDraftStats.total > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {bracketDraftStats.draft} borrador / {bracketDraftStats.published} publicados
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 gap-2"
                    disabled={updatingDraftScope !== null || bracketDraftStats.published === 0}
                    onClick={() => handleUpdateBracketDraft('draft', 'bracket')}
                  >
                    {updatingDraftScope === 'draft-bracket' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                    Ocultar {activeBracketLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 gap-2"
                    disabled={updatingDraftScope !== null || bracketDraftStats.draft === 0}
                    onClick={() => handleUpdateBracketDraft('publish', 'bracket')}
                  >
                    {updatingDraftScope === 'publish-bracket' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    Publicar {activeBracketLabel}
                  </Button>
                  {isGoldSilverFormat && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-11 w-11"
                          disabled={updatingDraftScope !== null}
                          aria-label="Acciones de ambas llaves"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleUpdateBracketDraft('draft', 'all')}>
                          <EyeOff className="mr-2 h-4 w-4" />
                          Ocultar Oro y Plata
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleUpdateBracketDraft('publish', 'all')}>
                          <Eye className="mr-2 h-4 w-4" />
                          Publicar Oro y Plata
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-2"
                onClick={() => setReplacementDialogOpen(true)}
              >
                <Repeat2 className="h-4 w-4" />
                Reemplazar pareja
              </Button>
            </div>
          )}
        </div>
      )}

      {hasManagementPermissions && (
        <BracketReplacementDialog
          tournamentId={tournamentId}
          open={replacementDialogOpen}
          onOpenChange={setReplacementDialogOpen}
          activeBracketKey={activeBracketKey}
          onBracketKeyChange={setActiveBracketKey}
          onReplaced={handleReplacementComplete}
        />
      )}

      <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
        <BracketDragDropProvider key={activeBracketKey}>
          <ImprovedBracketRenderer
            key={activeBracketKey}
            bracketData={bracketData}
            tournamentId={tournamentId}
            tournamentType="LONG"
            isOwner={hasManagementPermissions}
            enableDragDrop={hasManagementPermissions}
            onMatchUpdate={handleMatchUpdate}
            onDataRefresh={handleDataRefresh}
            className="w-full border-0 rounded-none bg-transparent"
          />
        </BracketDragDropProvider>
      </div>
    </div>
  )
}

function LongBracketSkeleton() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

function LongBracketContentSkeleton() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cargando llave...</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
