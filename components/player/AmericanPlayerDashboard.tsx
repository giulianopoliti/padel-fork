'use client'

import React, { useState, useEffect } from 'react'
import { Trophy, Users, UserPlus, AlertCircle, Calendar, CheckCircle } from 'lucide-react'

import CancelRegistrationButton from '@/components/tournament/player/cancel-registration-button'
import SharedNotRegisteredView from '@/components/tournament/NotRegisteredView'
import PublicRegistrationLauncher from '@/components/tournament/public-registration-launcher'
import TournamentHeroDetails from '@/components/tournament/TournamentHeroDetails'
import TournamentPublicInfoCard from '@/components/tournament/TournamentPublicInfoCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useUser } from '@/contexts/user-context'
import type { TournamentPublicInfo } from '@/lib/tournaments/public-tournament-details'
import { Gender } from '@/types'
import {
  getAmericanPlayerTournamentData,
  AmericanPlayerTournamentData,
  getAmericanRoundDisplayName,
  getAmericanOpponentCoupleName,
  didAmericanPlayerWin
} from '@/utils/american-player-matches'

interface AmericanPlayerDashboardProps {
  tournamentId: string
  tournament: {
    id: string
    name: string
    clubName?: string
    type?: string | null
    status?: string
    gender?: Gender
    price?: string | number | null
    start_date?: string | null
    enable_public_inscriptions?: boolean
    registration_locked?: boolean | null
    bracket_status?: string | null
    is_full?: boolean
    has_few_slots?: boolean
    enable_transfer_proof?: boolean
    transfer_alias?: string | null
    transfer_amount?: number | null
    publicInfo?: TournamentPublicInfo
  }
}

export default function AmericanPlayerDashboard({
  tournamentId,
  tournament
}: AmericanPlayerDashboardProps) {
  const { userDetails } = useUser()
  const [playerData, setPlayerData] = useState<AmericanPlayerTournamentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [registrationCancelled, setRegistrationCancelled] = useState(false)

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (!userDetails?.player_id) {
        setError('No se pudo obtener información del jugador')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const data = await getAmericanPlayerTournamentData(userDetails.player_id, tournamentId)
        setPlayerData(data)
      } catch (err) {
        console.error('Error fetching american player tournament data:', err)
        setError('Error al cargar los datos del torneo')
      } finally {
        setLoading(false)
      }
    }

    fetchPlayerData()
  }, [tournamentId, userDetails?.player_id])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Cargando torneo...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {error}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (registrationCancelled || !playerData?.isRegistered) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <SharedNotRegisteredView tournamentId={tournamentId} tournament={tournament} />
      </div>
    )
  }

  const totalMatches = playerData.zoneMatches.length + playerData.bracketMatches.length
  const finishedMatches = [...playerData.zoneMatches, ...playerData.bracketMatches].filter(
    match => match.status === 'FINISHED'
  ).length
  const canShowParticipantStats = Boolean(tournament.enable_public_inscriptions)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="container mx-auto px-4 py-12 lg:py-16">
          <div className="max-w-4xl mx-auto text-center">
            <div className="bg-white/10 backdrop-blur-sm inline-block px-4 py-2 rounded-full text-sm font-medium mb-4">
              Torneo Americano
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-4">{tournament.name}</h1>
            {tournament.clubName && (
              <p className="text-xl text-blue-100 mb-6">{tournament.clubName}</p>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-8">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-3xl font-bold">
                  {canShowParticipantStats ? playerData.totalCouplesInTournament : tournament.publicInfo?.typeLabel || 'Torneo'}
                </div>
                <div className="text-blue-100 text-sm mt-1">
                  {canShowParticipantStats ? 'Parejas Inscriptas' : 'Formato'}
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-3xl font-bold">{totalMatches}</div>
                <div className="text-blue-100 text-sm mt-1">Mis Partidos</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-3xl font-bold">{finishedMatches}</div>
                <div className="text-blue-100 text-sm mt-1">Completados</div>
              </div>
            </div>

            {tournament.publicInfo && (
              <TournamentHeroDetails publicInfo={tournament.publicInfo} className="mt-6 text-left" />
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 lg:py-12">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Alert className="border-green-200 bg-green-50 sm:flex-1">
              <Users className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>¡Estás inscripto!</strong> Puedes ver tu progreso y próximos partidos.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <CancelRegistrationButton
                tournamentId={tournamentId}
                tournamentName={tournament.name}
                coupleId={playerData.playerCoupleId}
                tournamentType={tournament.type}
                tournamentStartDate={tournament.start_date}
                className="w-full border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 sm:w-auto"
                onCancelled={() => setRegistrationCancelled(true)}
              />
            </div>
          </div>

          {playerData.nextMatch ? (
            <NextMatchCard
              match={playerData.nextMatch}
              playerCoupleId={playerData.playerCoupleId!}
            />
          ) : (
            <Card className="border-gray-200">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Trophy className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-500 text-center font-medium">
                  No tienes partidos pendientes
                </p>
                <p className="text-gray-400 text-center text-sm">
                  Todos tus partidos han sido completados o aún no han sido programados
                </p>
              </CardContent>
            </Card>
          )}

          {tournament.publicInfo && (
            <TournamentPublicInfoCard publicInfo={tournament.publicInfo} showSchedule />
          )}

          <AmericanMatchHistory
            zoneMatches={playerData.zoneMatches}
            bracketMatches={playerData.bracketMatches}
            playerCoupleId={playerData.playerCoupleId!}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Partidos de Zona</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{playerData.zoneMatches.length}</div>
                <p className="text-xs text-muted-foreground">
                  {playerData.zoneMatches.filter(match => match.status === 'FINISHED').length} completados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Partidos de Llave</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{playerData.bracketMatches.length}</div>
                <p className="text-xs text-muted-foreground">
                  {playerData.bracketMatches.filter(match => match.status === 'FINISHED').length} completados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Partidos</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalMatches}</div>
                <p className="text-xs text-muted-foreground">En este torneo</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function NextMatchCard({
  match,
  playerCoupleId
}: {
  match: any
  playerCoupleId: string
}) {
  const opponentName = getAmericanOpponentCoupleName(match, playerCoupleId)
  const roundName = getAmericanRoundDisplayName(match.round)

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <Calendar className="h-5 w-5" />
          Próximo Partido
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-blue-700 mb-2">Rival</p>
          <p className="text-lg font-semibold text-blue-900">{opponentName}</p>
        </div>

        <div>
          <p className="text-sm text-blue-700 mb-2">Ronda</p>
          <p className="text-base font-medium text-blue-900">{roundName}</p>
        </div>

        {match.zone_id && (
          <div>
            <p className="text-sm text-blue-700 mb-2">Zona</p>
            <p className="text-base font-medium text-blue-900">Zona {match.zone_id}</p>
          </div>
        )}

        <div className="pt-4">
          <p className="text-sm text-blue-600 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Estado: {match.status === 'SCHEDULED' ? 'Programado' : match.status === 'IN_PROGRESS' ? 'En progreso' : 'Pendiente'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function AmericanMatchHistory({
  zoneMatches,
  bracketMatches,
  playerCoupleId
}: {
  zoneMatches: any[]
  bracketMatches: any[]
  playerCoupleId: string
}) {
  const [activeTab, setActiveTab] = useState<'zone' | 'bracket'>('zone')

  const matches = activeTab === 'zone' ? zoneMatches : bracketMatches
  const finishedMatches = matches.filter(match => match.status === 'FINISHED')

  if (matches.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de Partidos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Button
            variant={activeTab === 'zone' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('zone')}
          >
            Zona ({zoneMatches.length})
          </Button>
          <Button
            variant={activeTab === 'bracket' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('bracket')}
          >
            Llave ({bracketMatches.length})
          </Button>
        </div>

        <div className="space-y-3">
          {finishedMatches.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No hay partidos completados en esta fase
            </p>
          ) : (
            finishedMatches.map(match => {
              const opponentName = getAmericanOpponentCoupleName(match, playerCoupleId)
              const didWin = didAmericanPlayerWin(match, playerCoupleId)
              const roundName = getAmericanRoundDisplayName(match.round)

              return (
                <div
                  key={match.id}
                  className={`p-4 rounded-lg border ${
                    didWin
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">
                        {didWin ? '✅ Victoria' : '❌ Derrota'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">vs {opponentName}</p>
                      <p className="text-xs text-gray-500 mt-1">{roundName}</p>
                    </div>
                    {match.result_couple1 && match.result_couple2 && (
                      <div className="text-right">
                        <p className="text-sm font-mono text-gray-700">
                          {match.couple1_id === playerCoupleId
                            ? `${match.result_couple1} - ${match.result_couple2}`
                            : `${match.result_couple2} - ${match.result_couple1}`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function NotRegisteredView({
  tournamentId,
  tournament
}: {
  tournamentId: string
  tournament: AmericanPlayerDashboardProps['tournament']
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="container mx-auto px-4 py-12 lg:py-16">
          <div className="max-w-4xl mx-auto text-center">
            <div className="bg-white/10 backdrop-blur-sm inline-block px-4 py-2 rounded-full text-sm font-medium mb-4">
              Torneo Americano
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-4">{tournament.name}</h1>
            {tournament.clubName && (
              <p className="text-xl text-blue-100">{tournament.clubName}</p>
            )}

            {tournament.publicInfo && (
              <TournamentHeroDetails publicInfo={tournament.publicInfo} className="mt-6 text-left" />
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 lg:py-12">
        <div className="max-w-4xl mx-auto space-y-6">
          <Alert className="border-orange-200 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <strong>No estás inscripto</strong> en este torneo. Para participar, necesitas registrarte.
            </AlertDescription>
          </Alert>

          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <UserPlus className="h-5 w-5" />
                ¿Quieres participar?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-blue-800">
                Para unirte a este torneo, abre el formulario de inscripción y completa tu registro.
              </p>

              <PublicRegistrationLauncher
                tournamentId={tournamentId}
                tournamentName={tournament.name}
                tournamentGender={tournament.gender || Gender.MALE}
                tournamentPrice={tournament.price ?? null}
                enableTransferProof={tournament.enable_transfer_proof || false}
                transferAlias={tournament.transfer_alias || null}
                transferAmount={tournament.transfer_amount || null}
                buttonLabel="Inscribirme"
                buttonClassName="w-full"
              />

              <div className="text-sm text-blue-700 space-y-1">
                <p><strong>Recuerda:</strong></p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Debes inscribirte en pareja</li>
                  <li>Necesitas tener tu perfil completo</li>
                  <li>Las inscripciones pueden tener fecha límite</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {tournament.publicInfo && (
            <TournamentPublicInfoCard publicInfo={tournament.publicInfo} showSchedule />
          )}
        </div>
      </div>
    </div>
  )
}
