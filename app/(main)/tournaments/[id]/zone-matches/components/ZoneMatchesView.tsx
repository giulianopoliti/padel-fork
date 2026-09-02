'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Trophy, Clock, MapPin, Users, ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import ThreeSetResultDisplay from '@/components/tournament/universal/ThreeSetResultDisplay'

interface ZoneMatch {
  id: string
  status: string
  couple1_id: string | null
  couple2_id: string | null
  winner_id: string | null
  result_couple1: string | null
  result_couple2: string | null
  zone_id: string
  created_at: string
  couple1?: {
    id: string
    player1: { id: string; first_name: string; last_name: string }
    player2: { id: string; first_name: string; last_name: string }
  }
  couple2?: {
    id: string
    player1: { id: string; first_name: string; last_name: string }
    player2: { id: string; first_name: string; last_name: string }
  }
  fecha_matches?: {
    scheduled_date: string | null
    scheduled_start_time: string | null
    court_assignment: string | null
  }[]
}

interface Zone {
  id: string
  name: string
  capacity?: number
}

interface ZoneMatchesViewProps {
  tournamentId: string
  selectedZoneId?: string
}

export default function ZoneMatchesView({ tournamentId, selectedZoneId }: ZoneMatchesViewProps) {
  const [zones, setZones] = useState<Zone[]>([])
  const [matches, setMatches] = useState<ZoneMatch[]>([])
  const [selectedZone, setSelectedZone] = useState<string | null>(selectedZoneId || null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const supabase = createClient()

        // Obtener zonas del torneo
        const { data: zonesData, error: zonesError } = await supabase
          .from('zones')
          .select('id, name, capacity')
          .eq('tournament_id', tournamentId)
          .order('name')

        if (zonesError) throw zonesError

        setZones(zonesData || [])

        // Si hay una zona seleccionada o solo hay una zona, cargar sus partidos
        const zoneToSelect = selectedZoneId || (zonesData && zonesData.length === 1 ? zonesData[0].id : null)

        if (zoneToSelect) {
          setSelectedZone(zoneToSelect)
          await fetchZoneMatches(zoneToSelect)
        }

      } catch (err) {
        console.error('Error fetching zones:', err)
        setError(err instanceof Error ? err.message : 'Error loading zones')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [tournamentId, selectedZoneId])

  const fetchZoneMatches = async (zoneId: string) => {
    try {
      const supabase = createClient()

      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select(`
          id,
          status,
          couple1_id,
          couple2_id,
          winner_id,
          result_couple1,
          result_couple2,
          zone_id,
          created_at,
          couple1:couples!couple1_id(
            id,
            player1:players!player1_id(
              id,
              first_name,
              last_name
            ),
            player2:players!player2_id(
              id,
              first_name,
              last_name
            )
          ),
          couple2:couples!couple2_id(
            id,
            player1:players!player1_id(
              id,
              first_name,
              last_name
            ),
            player2:players!player2_id(
              id,
              first_name,
              last_name
            )
          ),
          fecha_matches(
            scheduled_date,
            scheduled_start_time,
            court_assignment
          )
        `)
        .eq('tournament_id', tournamentId)
        .eq('zone_id', zoneId)
        .eq('round', 'ZONE')
        .neq('status', 'DRAFT')  // 🆕 Exclude DRAFT matches from player view
        .order('created_at', { ascending: true })

      if (matchesError) throw matchesError

      setMatches(matchesData || [])

    } catch (err) {
      console.error('Error fetching zone matches:', err)
      setError(err instanceof Error ? err.message : 'Error loading zone matches')
    }
  }

  const handleZoneChange = (zoneId: string) => {
    setSelectedZone(zoneId)
    setMatches([])
    fetchZoneMatches(zoneId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Cargando partidos de zona...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <Trophy className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          {error}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="outline" asChild>
          <Link href={`/tournaments/${tournamentId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al Torneo
          </Link>
        </Button>
      </div>

      {/* Zone Selector */}
      {zones.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Seleccionar Zona
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedZone || ''} onValueChange={handleZoneChange}>
              <SelectTrigger className="w-full md:w-1/3">
                <SelectValue placeholder="Selecciona una zona..." />
              </SelectTrigger>
              <SelectContent>
                {zones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name} {zone.capacity && `(${zone.capacity} parejas)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Zone Info and Matches */}
      {selectedZone ? (
        <ZoneMatchesDisplay
          zone={zones.find(z => z.id === selectedZone)}
          matches={matches}
          tournamentId={tournamentId}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500 text-center">
              Selecciona una zona para ver sus partidos
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface ZoneMatchesDisplayProps {
  zone?: Zone
  matches: ZoneMatch[]
  tournamentId: string
}

function ZoneMatchesDisplay({ zone, matches, tournamentId }: ZoneMatchesDisplayProps) {
  if (!zone) return null

  const completedMatches = matches.filter(m => m.status === 'FINISHED').length
  const pendingMatches = matches.filter(m => m.status === 'PENDING').length
  const inProgressMatches = matches.filter(m => m.status === 'IN_PROGRESS').length

  return (
    <div className="space-y-6">
      {/* Zone Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            {zone.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{matches.length}</div>
              <div className="text-sm text-gray-600">Total Partidos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{completedMatches}</div>
              <div className="text-sm text-gray-600">Completados</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{inProgressMatches}</div>
              <div className="text-sm text-gray-600">En Curso</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{pendingMatches}</div>
              <div className="text-sm text-gray-600">Pendientes</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Matches List */}
      {matches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500 text-center">
              No hay partidos en esta zona aún
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {matches.map((match) => (
            <ZoneMatchCard
              key={match.id}
              match={match}
              tournamentId={tournamentId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ZoneMatchCardProps {
  match: ZoneMatch
  tournamentId: string
}

function ZoneMatchCard({ match, tournamentId }: ZoneMatchCardProps) {
  const couple1Name = match.couple1
    ? `${match.couple1.player1.first_name} ${match.couple1.player1.last_name} / ${match.couple1.player2.first_name} ${match.couple1.player2.last_name}`
    : 'Pareja no definida'

  const couple2Name = match.couple2
    ? `${match.couple2.player1.first_name} ${match.couple2.player1.last_name} / ${match.couple2.player2.first_name} ${match.couple2.player2.last_name}`
    : 'Pareja no definida'

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FINISHED':
        return 'bg-green-100 text-green-800'
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800'
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'FINISHED':
        return 'Finalizado'
      case 'IN_PROGRESS':
        return 'En Curso'
      case 'PENDING':
        return 'Pendiente'
      default:
        return status
    }
  }

  // Normalizar fecha_matches: puede venir como objeto o array
  const fechaMatchesArray = Array.isArray(match.fecha_matches)
    ? match.fecha_matches
    : match.fecha_matches
      ? [match.fecha_matches]
      : []

  const scheduleInfo = fechaMatchesArray[0]
  const hasSchedule = scheduleInfo?.scheduled_date

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Badge className={getStatusColor(match.status)}>
            {getStatusText(match.status)}
          </Badge>
          <span className="text-xs text-gray-500">
            {new Date(match.created_at).toLocaleDateString('es-ES')}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Players */}
        <div className="space-y-3">
          <div className={`p-3 rounded-surface ${
            match.winner_id === match.couple1_id
              ? 'bg-green-50 border border-green-200'
              : 'bg-gray-50'
          }`}>
            <div className="space-y-1">
              {match.couple1 && (
                <>
                  <div className="text-sm">
                    <Link
                      href={`/ranking/${match.couple1.player1.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {match.couple1.player1.first_name} {match.couple1.player1.last_name}
                    </Link>
                  </div>
                  <div className="text-sm">
                    <Link
                      href={`/ranking/${match.couple1.player2.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {match.couple1.player2.first_name} {match.couple1.player2.last_name}
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="text-center">
            <span className="text-xs text-gray-500 font-medium px-2 py-1 bg-gray-100 rounded">
              VS
            </span>
          </div>

          <div className={`p-3 rounded-surface ${
            match.winner_id === match.couple2_id
              ? 'bg-green-50 border border-green-200'
              : 'bg-gray-50'
          }`}>
            <div className="space-y-1">
              {match.couple2 && (
                <>
                  <div className="text-sm">
                    <Link
                      href={`/ranking/${match.couple2.player1.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {match.couple2.player1.first_name} {match.couple2.player1.last_name}
                    </Link>
                  </div>
                  <div className="text-sm">
                    <Link
                      href={`/ranking/${match.couple2.player2.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {match.couple2.player2.first_name} {match.couple2.player2.last_name}
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Schedule Info */}
        {hasSchedule && (
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-surface border border-blue-200">
            <Clock className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-blue-900">
                {new Date(scheduleInfo.scheduled_date + 'T12:00:00').toLocaleDateString('es-ES')}
              </div>
              {scheduleInfo.scheduled_start_time && (
                <div className="text-blue-700">
                  {scheduleInfo.scheduled_start_time.slice(0, 5)}
                </div>
              )}
              {scheduleInfo.court_assignment && (
                <div className="text-blue-700">
                  Cancha {scheduleInfo.court_assignment}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Result */}
        {match.status === 'FINISHED' && (
          <div className="pt-3 border-t border-gray-200">
            <ThreeSetResultDisplay matchId={match.id} className="text-sm" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}