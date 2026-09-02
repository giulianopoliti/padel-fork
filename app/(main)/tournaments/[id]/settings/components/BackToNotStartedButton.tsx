'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, AlertTriangle } from 'lucide-react'
import { getResetTournamentPreview, backTournamentToNotStartedAction } from '../actions'

interface BackToNotStartedButtonProps {
  tournamentId: string
}

interface ResetPreviewData {
  zonesCount: number
  matchesCount: number
  zoneCouplesCount: number
  zonePositionsCount: number
}

export default function BackToNotStartedButton({ tournamentId }: BackToNotStartedButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [previewData, setPreviewData] = useState<ResetPreviewData | null>(null)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const { toast } = useToast()

  const handleOpenDialog = async () => {
    setIsLoading(true)
    setIsConfirmed(false)
    
    try {
      const result = await getResetTournamentPreview(tournamentId)
      
      if (!result.success) {
        toast({
          title: 'Error',
          description: result.error || 'No se pudo obtener la información del torneo',
          variant: 'destructive'
        })
        return
      }

      if (!result.data) {
        toast({
          title: 'Información',
          description: 'No hay datos para eliminar en este torneo',
          variant: 'default'
        })
        return
      }

      setPreviewData(result.data)
      setIsDialogOpen(true)
    } catch (error) {
      console.error('Error getting preview:', error)
      toast({
        title: 'Error',
        description: 'Error al obtener la información del torneo',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmReset = async () => {
    if (!isConfirmed) {
      toast({
        title: 'Confirmación requerida',
        description: 'Debes confirmar que entiendes las consecuencias de esta acción',
        variant: 'destructive'
      })
      return
    }

    setIsConfirming(true)
    
    try {
      const result = await backTournamentToNotStartedAction(tournamentId)
      
      if (result.success) {
        toast({
          title: 'Éxito',
          description: result.message || 'Torneo revertido exitosamente',
          variant: 'default'
        })
        setIsDialogOpen(false)
        setIsConfirmed(false)
        setPreviewData(null)
      } else {
        toast({
          title: 'Error',
          description: result.error || 'No se pudo revertir el torneo',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error resetting tournament:', error)
      toast({
        title: 'Error',
        description: 'Error inesperado al revertir el torneo',
        variant: 'destructive'
      })
    } finally {
      setIsConfirming(false)
    }
  }

  const totalItems = previewData ? 
    previewData.zonesCount + previewData.matchesCount + previewData.zoneCouplesCount + previewData.zonePositionsCount : 0

  return (
    <>
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-800">Volver a No Iniciado</CardTitle>
          <CardDescription className="text-red-700">
            Revierte el torneo a estado no iniciado eliminando zonas y partidos generados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleOpenDialog}
            variant="destructive"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cargando información...
              </>
            ) : (
              '🔄 Volver Torneo a No Iniciado'
            )}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              ¿Revertir el torneo?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Esta acción eliminará <strong>permanentemente</strong> todos los datos del torneo:</p>
              
              {previewData && (
                <div className="bg-red-50 border border-red-200 rounded-control p-3 space-y-1">
                  <h4 className="font-medium text-red-900">Datos a eliminar:</h4>
                  <div className="text-sm text-red-800 space-y-1">
                    {previewData.zonesCount > 0 && (
                      <p>• {previewData.zonesCount} zona{previewData.zonesCount !== 1 ? 's' : ''}</p>
                    )}
                    {previewData.matchesCount > 0 && (
                      <p>• {previewData.matchesCount} partido{previewData.matchesCount !== 1 ? 's' : ''} de zona</p>
                    )}
                    {previewData.zoneCouplesCount > 0 && (
                      <p>• {previewData.zoneCouplesCount} asignación{previewData.zoneCouplesCount !== 1 ? 'es' : ''} de parejas</p>
                    )}
                    {previewData.zonePositionsCount > 0 && (
                      <p>• {previewData.zonePositionsCount} posición{previewData.zonePositionsCount !== 1 ? 'es' : ''} de zona</p>
                    )}
                    {totalItems === 0 && (
                      <p>• No hay datos para eliminar</p>
                    )}
                  </div>
                </div>
              )}
              
              <p className="text-red-800 font-medium">
                ⚠️ Esta acción no se puede deshacer.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="confirm-reset" 
                checked={isConfirmed}
                onCheckedChange={(checked) => setIsConfirmed(checked as boolean)}
              />
              <label 
                htmlFor="confirm-reset" 
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Entiendo que todos los datos se eliminarán permanentemente
              </label>
            </div>
          </div>

          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel 
              onClick={() => {
                setIsDialogOpen(false)
                setIsConfirmed(false)
                setPreviewData(null)
              }}
              disabled={isConfirming}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReset}
              disabled={!isConfirmed || isConfirming}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Revertiendo...
                </>
              ) : (
                'Confirmar Reversión'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
