/**
 * Zone Positions Component
 * 
 * Displays and manages position calculations for zones.
 * Integrates seamlessly with the existing TournamentZonesMatrix.
 */

"use client"

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  RefreshCw, 
  Trophy, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { toast } from '../utils/toast-alternative'
import { useZonePositionsEnhanced, useZonePositionActions } from '../hooks/use-zone-positions-enhanced'
import type { EnhancedZone, EnhancedCouple } from '../hooks/use-zone-positions-enhanced'

interface ZonePositionsProps {
  tournamentId: string
  isOwner?: boolean
  className?: string
}

interface ZonePositionCardProps {
  zone: EnhancedZone
  onCalculateZone: (zoneId: string) => Promise<void>
  isCalculating: boolean
}

interface CouplePositionRowProps {
  couple: EnhancedCouple
  index: number
}

/**
 * Individual couple position row with expandable details
 */
const CouplePositionRow: React.FC<CouplePositionRowProps> = ({ couple, index }) => {
  const [showDetails, setShowDetails] = useState(false)
  
  const displayPosition = couple.position || (index + 1)
  const hasCalculatedPosition = couple.position !== undefined
  
  return (
    <div className="couple-position-row border rounded-surface p-3 bg-white hover:bg-gray-50 transition-colors">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setShowDetails(!showDetails)}
      >
        <div className="flex items-center space-x-3">
          {/* Position Badge */}
          <Badge 
            variant={hasCalculatedPosition ? "default" : "outline"}
            className={`min-w-8 h-8 rounded-full flex items-center justify-center font-bold ${
              hasCalculatedPosition 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            {displayPosition}
          </Badge>

          {/* Couple Names */}
          <div>
            <p className="font-medium text-gray-900">
              {couple.player1_name} / {couple.player2_name}
            </p>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span className="text-green-600 font-medium">
                {couple.stats.won}W
              </span>
              <span className="text-red-600">
                {couple.stats.lost}L
              </span>
              <span className="text-blue-600">
                {couple.stats.points}pts
              </span>
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center space-x-2">
          {hasCalculatedPosition && (
            <CheckCircle className="h-4 w-4 text-green-500" title="Posición calculada automáticamente" />
          )}
          
          {showDetails ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expandable Details */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Partidos jugados:</span>
              <span className="ml-2 font-medium">{couple.stats.played}</span>
            </div>
            <div>
              <span className="text-gray-500">Sets:</span>
              <span className="ml-2 font-medium">{couple.stats.scored}-{couple.stats.conceded}</span>
            </div>
            
            {couple.positionData && (
              <>
                <div>
                  <span className="text-gray-500">Dif. games:</span>
                  <span className="ml-2 font-medium">{couple.positionData.gamesDifference}</span>
                </div>
                <div>
                  <span className="text-gray-500">Score jugadores:</span>
                  <span className="ml-2 font-medium">{couple.positionData.totalPlayerScore}</span>
                </div>
              </>
            )}
          </div>
          
          {couple.positionData?.positionTieInfo && (
            <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">
              <strong>Criterio de desempate:</strong> {couple.positionData.positionTieInfo}
            </div>
          )}
          
          {couple.positionData?.calculatedAt && (
            <div className="text-xs text-gray-500">
              Calculado: {new Date(couple.positionData.calculatedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Individual zone position card
 */
const ZonePositionCard: React.FC<ZonePositionCardProps> = ({ 
  zone, 
  onCalculateZone, 
  isCalculating 
}) => {
  const handleCalculate = useCallback(async () => {
    try {
      await onCalculateZone(zone.id)
    } catch (error: any) {
      toast.error(`Error calculando zona ${zone.name}: ${error.message}`)
    }
  }, [zone.id, zone.name, onCalculateZone])

  return (
    <Card className="zone-position-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            {zone.name}
          </CardTitle>
          
          <div className="flex items-center space-x-2">
            {/* Zone Status */}
            {zone.metadata?.hasAllMatchesPlayed && (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                Completo
              </Badge>
            )}
            
            {/* Calculate Button */}
            <Button
              onClick={handleCalculate}
              disabled={isCalculating}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${isCalculating ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        {/* Zone Metadata */}
        {zone.metadata && (
          <div className="text-xs text-gray-500 space-y-1">
            <div>
              {zone.metadata.totalMatches} partidos jugados • {zone.couples.length} parejas
            </div>
            {zone.metadata.lastCalculated && (
              <div className="flex items-center">
                <Clock className="h-3 w-3 mr-1" />
                Actualizado: {new Date(zone.metadata.lastCalculated).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {zone.couples.length === 0 ? (
          <div className="text-center text-gray-500 py-4">
            Sin parejas asignadas
          </div>
        ) : (
          <div className="space-y-2">
            {zone.couples.map((couple, index) => (
              <CouplePositionRow 
                key={couple.id}
                couple={couple}
                index={index}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Main Zone Positions component
 */
const ZonePositions: React.FC<ZonePositionsProps> = ({ 
  tournamentId, 
  isOwner = false,
  className = "" 
}) => {
  const [isCalculating, setIsCalculating] = useState<string | null>(null)
  
  // Use enhanced zones data with positions
  const { 
    zones, 
    globalMetadata, 
    isLoading, 
    error, 
    refresh 
  } = useZonePositionsEnhanced(tournamentId)
  
  // Position actions
  const { calculatePositions } = useZonePositionActions(tournamentId)

  // Calculate all positions
  const handleCalculateAll = useCallback(async () => {
    setIsCalculating('all')
    try {
      await calculatePositions()
      await refresh()
      toast.success(`Posiciones recalculadas para ${globalMetadata.totalZones} zonas`)
    } catch (error: any) {
      toast.error(`Error calculando posiciones: ${error.message}`)
    } finally {
      setIsCalculating(null)
    }
  }, [calculatePositions, refresh, globalMetadata.totalZones])

  // Calculate specific zone
  const handleCalculateZone = useCallback(async (zoneId: string) => {
    setIsCalculating(zoneId)
    try {
      await calculatePositions(zoneId)
      await refresh()
      const zoneName = zones.find(z => z.id === zoneId)?.name || zoneId
      toast.success(`Posiciones recalculadas para ${zoneName}`)
    } catch (error: any) {
      toast.error(`Error: ${error.message}`)
    } finally {
      setIsCalculating(null)
    }
  }, [calculatePositions, refresh, zones])

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-600 mr-3" />
        <span className="text-gray-600">Cargando posiciones...</span>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <div className="flex items-center text-red-800">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>Error cargando posiciones: {error}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Render empty state
  if (zones.length === 0) {
    return (
      <div className="text-center py-8">
        <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No hay zonas para mostrar
        </h3>
        <p className="text-gray-600">
          Las posiciones aparecerán cuando se creen las zonas.
        </p>
      </div>
    )
  }

  return (
    <div className={`zone-positions ${className}`}>
      {/* Header with global actions */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Posiciones de Zonas
            </h2>
            <p className="text-gray-600 mt-1">
              {globalMetadata.totalZones} zonas • {globalMetadata.totalCouples} parejas
              {globalMetadata.hasAnyCalculatedPositions && globalMetadata.lastGlobalUpdate && (
                <span className="ml-2">
                  • Última actualización: {new Date(globalMetadata.lastGlobalUpdate).toLocaleString()}
                </span>
              )}
            </p>
          </div>
          
          {isOwner && (
            <Button
              onClick={handleCalculateAll}
              disabled={!!isCalculating}
              className="flex items-center space-x-2"
            >
              {isCalculating === 'all' ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Calculando...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  <span>
                    {globalMetadata.hasAnyCalculatedPositions ? 'Recalcular Todo' : 'Calcular Posiciones'}
                  </span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Zones Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {zones.map((zone) => (
          <ZonePositionCard
            key={zone.id}
            zone={zone}
            onCalculateZone={handleCalculateZone}
            isCalculating={isCalculating === zone.id}
          />
        ))}
      </div>
    </div>
  )
}

export default ZonePositions