'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, Trophy, CheckCircle, XCircle, Clock, RotateCcw } from 'lucide-react'
import { CoupleWithData } from '../actions'

interface CouplesSelectionPanelProps {
  couples: CoupleWithData[]
  selectedCouples: string[]
  onCoupleSelect: (coupleId: string) => void
  onClearSelection: () => void
  loading: boolean
}

interface CoupleCardProps {
  couple: CoupleWithData
  isSelected: boolean
  canPlay: boolean
  canSelect: boolean
  onSelect: () => void
}

const CoupleCard: React.FC<CoupleCardProps> = ({
  couple,
  isSelected,
  canPlay,
  canSelect,
  onSelect
}) => {
  const getCardClasses = () => {
    const baseClasses = 'transition-all duration-200 cursor-pointer relative overflow-hidden'
    
    if (isSelected) {
      return `${baseClasses} ring-2 ring-blue-500 bg-blue-50 border-blue-300 shadow-md`
    }
    
    if (!canPlay) {
      return `${baseClasses} opacity-60 cursor-not-allowed bg-gray-50 border-gray-200`
    }
    
    if (!canSelect) {
      return `${baseClasses} opacity-40 cursor-not-allowed bg-gray-50 border-gray-200`
    }
    
    return `${baseClasses} hover:shadow-md hover:bg-blue-50 border-gray-200 bg-white`
  }

  const getStatusInfo = () => {
    if (couple.has_played_in_this_date) {
      return {
        icon: <CheckCircle className="h-4 w-4 text-green-600" />,
        text: 'Ya jugó',
        color: 'text-green-600'
      }
    }
    
    if (canPlay) {
      return {
        icon: <Clock className="h-4 w-4 text-blue-600" />,
        text: 'Puede jugar',
        color: 'text-blue-600'
      }
    }
    
    return {
      icon: <XCircle className="h-4 w-4 text-red-600" />,
      text: 'No disponible',
      color: 'text-red-600'
    }
  }

  const statusInfo = getStatusInfo()

  return (
    <Card 
      className={getCardClasses()}
      onClick={canSelect && canPlay ? onSelect : undefined}
    >
      <CardContent className="p-4">
        {/* Selection Indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2">
            <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
              ✓
            </div>
          </div>
        )}

        {/* Players Names */}
        <div className="mb-3">
          <div className="font-semibold text-slate-900 text-sm leading-tight">
            {couple.player1.name} {couple.player1.last_name}
          </div>
          <div className="font-semibold text-slate-900 text-sm leading-tight">
            {couple.player2.name} {couple.player2.last_name}
          </div>
        </div>

        {/* Zone Position Badge */}
        {couple.zone_position && (
          <div className="mb-3">
            <Badge variant="outline" className="text-xs">
              <Trophy className="h-3 w-3 mr-1" />
              Zona {couple.zone_position.zone_name} - Pos. {couple.zone_position.position}
            </Badge>
          </div>
        )}

        {/* Matches Count */}
        {couple.matches_in_fecha > 0 && (
          <div className="mb-3">
            <Badge variant="secondary" className="text-xs">
              {couple.matches_in_fecha} partido{couple.matches_in_fecha !== 1 ? 's' : ''} en fecha
            </Badge>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-2 mb-2">
          {statusInfo.icon}
          <span className={`text-xs font-medium ${statusInfo.color}`}>
            {statusInfo.text}
          </span>
        </div>

        {/* Action Hint */}
        {canPlay && canSelect && (
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <Users className="h-3 w-3" />
            {isSelected ? 'Seleccionada' : 'Click para seleccionar'}
          </div>
        )}
        
        {canPlay && !canSelect && (
          <div className="text-xs text-orange-600">
            Máximo 2 parejas seleccionadas
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const CouplesSelectionPanel: React.FC<CouplesSelectionPanelProps> = ({
  couples,
  selectedCouples,
  onCoupleSelect,
  onClearSelection,
  loading
}) => {
  // Filter out couples that have already played - they should not appear at all
  const availableCouples = couples.filter(c => !c.has_played_in_this_date)

  const handleCoupleSelect = (coupleId: string) => {
    if (selectedCouples.includes(coupleId)) {
      // Deselect if already selected
      onCoupleSelect(coupleId)
    } else if (selectedCouples.length < 2) {
      // Select if under limit
      onCoupleSelect(coupleId)
    }
  }

  const canSelectMoreCouples = selectedCouples.length < 2

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          Parejas Disponibles
          <Badge variant="outline">{availableCouples.length}</Badge>
        </CardTitle>
        
        {/* Selection Status */}
        {selectedCouples.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-surface p-3 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-blue-900">
                  {selectedCouples.length}/2 parejas seleccionadas
                </div>
                <div className="text-xs text-blue-700">
                  {selectedCouples.length === 1 
                    ? 'Selecciona 1 pareja más'
                    : 'Listo para crear partido'
                  }
                </div>
              </div>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={onClearSelection}
                className="text-blue-600 border-blue-300 hover:bg-blue-100"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="max-h-[500px] overflow-y-auto">
          {loading && (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-xs text-slate-500">Cargando parejas...</p>
            </div>
          )}

          {!loading && (
            <>
              {/* Available Couples Section */}
              {availableCouples.length > 0 && (
                <div className="p-4">
                  <div className="space-y-3">
                    {availableCouples.map((couple) => (
                      <CoupleCard
                        key={couple.id}
                        couple={couple}
                        isSelected={selectedCouples.includes(couple.id)}
                        canPlay={true}
                        canSelect={canSelectMoreCouples || selectedCouples.includes(couple.id)}
                        onSelect={() => handleCoupleSelect(couple.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State - All couples have played */}
              {availableCouples.length === 0 && couples.length > 0 && (
                <div className="p-6 text-center">
                  <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-700 mb-1">Todas las parejas ya jugaron</p>
                  <p className="text-xs text-slate-500">No hay parejas disponibles en esta fecha</p>
                </div>
              )}

              {/* Empty State - No couples registered */}
              {couples.length === 0 && (
                <div className="p-6 text-center">
                  <Users className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No hay parejas inscritas</p>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default CouplesSelectionPanel