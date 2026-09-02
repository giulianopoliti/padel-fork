'use client'

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowRight, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import { getCategoryColor } from '@/lib/utils/category-colors'

interface TournamentPlayer {
  id: string
  first_name: string
  last_name: string
  score: number
  category_name: string
}

interface Category {
  name: string
  lower_range: number
  upper_range: number | null
}

interface PendingChange {
  player: TournamentPlayer
  newCategory: string
  newScore: number
  scoreChange: number
}

interface ConfirmationDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  players: TournamentPlayer[]
  categories: Category[]
  pendingUpdates: Map<string, string>
  loading?: boolean
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  players,
  categories,
  pendingUpdates,
  loading = false
}) => {

  // Calcular cambios pendientes con detalles de puntaje
  const pendingChanges: PendingChange[] = Array.from(pendingUpdates.entries()).map(([playerId, newCategory]) => {
    const player = players.find(p => p.id === playerId)!
    const category = categories.find(c => c.name === newCategory)!
    const newScore = category.lower_range
    const scoreChange = newScore - player.score

    return {
      player,
      newCategory,
      newScore,
      scoreChange
    }
  })

  // Estadísticas de cambios
  const totalChanges = pendingChanges.length
  const scoreIncreases = pendingChanges.filter(c => c.scoreChange > 0).length
  const scoreDecreases = pendingChanges.filter(c => c.scoreChange < 0).length
  const noScoreChange = pendingChanges.filter(c => c.scoreChange === 0).length


  if (totalChanges === 0) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Confirmar Recategorización
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumen de cambios */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Estás a punto de recategorizar <strong>{totalChanges} jugadores</strong>.
              Los puntajes se ajustarán automáticamente al mínimo de cada nueva categoría.
            </AlertDescription>
          </Alert>

          {/* Estadísticas */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 p-3 rounded-surface border border-green-200">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">Aumentos</span>
              </div>
              <p className="text-2xl font-bold text-green-900">{scoreIncreases}</p>
            </div>
            
            <div className="bg-red-50 p-3 rounded-surface border border-red-200">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-800">Disminuciones</span>
              </div>
              <p className="text-2xl font-bold text-red-900">{scoreDecreases}</p>
            </div>
            
            <div className="bg-gray-50 p-3 rounded-surface border border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">Sin cambio</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{noScoreChange}</p>
            </div>
          </div>

          {/* Lista de cambios */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Detalles de cambios:</h3>
            <ScrollArea className="h-64 border rounded-surface">
              <div className="p-4 space-y-3">
                {pendingChanges.map((change) => (
                  <div 
                    key={change.player.id} 
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-surface"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {change.player.first_name} {change.player.last_name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={getCategoryColor(change.player.category_name)}>
                          {change.player.category_name}
                        </Badge>
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                        <Badge className={getCategoryColor(change.newCategory)}>
                          {change.newCategory}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {change.player.score}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-gray-400" />
                      <Badge 
                        variant="outline" 
                        className={`font-mono ${
                          change.scoreChange > 0 
                            ? 'bg-green-50 border-green-200 text-green-800' 
                            : change.scoreChange < 0
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : 'bg-gray-50 border-gray-200 text-gray-800'
                        }`}
                      >
                        {change.newScore}
                      </Badge>
                      {change.scoreChange !== 0 && (
                        <span className={`text-xs ${
                          change.scoreChange > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          ({change.scoreChange > 0 ? '+' : ''}{change.scoreChange})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Advertencia para cambios grandes */}
          {(scoreIncreases > 0 || scoreDecreases > 0) && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Importante:</strong> Los cambios de puntaje son permanentes. 
                Asegúrate de que las recategorizaciones sean correctas antes de confirmar.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {loading ? 'Aplicando cambios...' : `Confirmar ${totalChanges} cambios`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
