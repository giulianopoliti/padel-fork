'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, AlertTriangle, RotateCcw } from 'lucide-react'
import { getBackFromBracketPreview, backTournamentFromBracketToZones } from '../actions'

interface BackFromBracketButtonProps {
  tournamentId: string
  mode?: 'card' | 'inline'
  tooltipMessage?: string
  buttonLabel?: string
}

interface BracketPreviewData {
  seedsCount: number
  hierarchyCount: number
  bracketMatchesCount: number
  finishedBracketMatches: number
  pendingBracketMatches: number
}

export default function BackFromBracketButton({
  tournamentId,
  mode = 'card',
  tooltipMessage,
  buttonLabel,
}: BackFromBracketButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [previewData, setPreviewData] = useState<BracketPreviewData | null>(null)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const { toast } = useToast()

  const handleOpenDialog = async () => {
    setIsLoading(true)
    setIsConfirmed(false)

    try {
      const result = await getBackFromBracketPreview(tournamentId)

      if (!result.success) {
        toast({
          title: 'Error',
          description: result.error || 'No se pudo obtener la informacion del bracket',
          variant: 'destructive',
        })
        return
      }

      if (!result.data) {
        toast({
          title: 'Informacion',
          description: 'No hay datos de bracket para eliminar en este torneo',
          variant: 'default',
        })
        return
      }

      setPreviewData(result.data)
      setIsDialogOpen(true)
    } catch (error) {
      console.error('Error getting preview:', error)
      toast({
        title: 'Error',
        description: 'Error al obtener la informacion del bracket',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmReset = async () => {
    if (!isConfirmed) {
      toast({
        title: 'Confirmacion requerida',
        description: 'Debes confirmar que entiendes las consecuencias de esta accion',
        variant: 'destructive',
      })
      return
    }

    setIsConfirming(true)

    try {
      const result = await backTournamentFromBracketToZones(tournamentId)

      if (result.success) {
        toast({
          title: 'Exito',
          description: result.message || 'Torneo revertido exitosamente a fase de zonas',
          variant: 'default',
        })
        setIsDialogOpen(false)
        setIsConfirmed(false)
        setPreviewData(null)
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        toast({
          title: 'Error',
          description: result.error || 'No se pudo revertir el torneo',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error reverting tournament:', error)
      toast({
        title: 'Error',
        description: 'Error inesperado al revertir el torneo',
        variant: 'destructive',
      })
    } finally {
      setIsConfirming(false)
    }
  }

  const totalItems = previewData
    ? previewData.seedsCount + previewData.hierarchyCount + previewData.bracketMatchesCount
    : 0

  const hasFinishedMatches = previewData && previewData.finishedBracketMatches > 0
  const resolvedTooltipMessage =
    tooltipMessage ||
    'Si tuviste algun problema con la llave y queres borrarla, usa este boton para volver el torneo a fase de zonas.'
  const resolvedButtonLabel = buttonLabel || 'Revertir a Fase de Zonas'

  const triggerButton = (
    <Button
      onClick={handleOpenDialog}
      variant="outline"
      className={
        mode === 'inline'
          ? 'border-orange-300 bg-white hover:bg-orange-50 text-orange-800'
          : 'w-full border-orange-300 hover:bg-orange-100 text-orange-800'
      }
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando informacion...
        </>
      ) : (
        <>
          <RotateCcw className="mr-2 h-4 w-4" />
          {resolvedButtonLabel}
        </>
      )}
    </Button>
  )

  return (
    <>
      {mode === 'card' ? (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <RotateCcw className="h-5 w-5" />
              Volver a Fase de Zonas
            </CardTitle>
            <CardDescription className="text-orange-700">
              Revierte el torneo a fase de zonas, eliminando el bracket generado pero manteniendo
              los datos de zona intactos.
            </CardDescription>
          </CardHeader>
          <CardContent>{triggerButton}</CardContent>
        </Card>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
            <TooltipContent className="max-w-xs text-sm">
              {resolvedTooltipMessage}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Revertir a fase de zonas
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Esta accion eliminara <strong>permanentemente</strong> el bracket generado:
              </p>

              {previewData && (
                <div className="space-y-1 rounded-control border border-orange-200 bg-orange-50 p-3">
                  <h4 className="font-medium text-orange-900">Datos a eliminar:</h4>
                  <div className="space-y-1 text-sm text-orange-800">
                    {previewData.seedsCount > 0 && (
                      <p>- {previewData.seedsCount} seed{previewData.seedsCount !== 1 ? 's' : ''} del bracket</p>
                    )}
                    {previewData.hierarchyCount > 0 && (
                      <p>
                        - {previewData.hierarchyCount} relacion
                        {previewData.hierarchyCount !== 1 ? 'es' : ''} de jerarquia
                      </p>
                    )}
                    {previewData.bracketMatchesCount > 0 && (
                      <p>
                        - {previewData.bracketMatchesCount} partido
                        {previewData.bracketMatchesCount !== 1 ? 's' : ''} de bracket
                      </p>
                    )}
                    {totalItems === 0 && <p>- No hay datos de bracket para eliminar</p>}
                  </div>
                </div>
              )}

              {hasFinishedMatches && (
                <div className="space-y-1 rounded-control border-2 border-red-300 bg-red-100 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
                    <div>
                      <h4 className="font-semibold text-red-900">Atencion</h4>
                      <p className="mt-1 text-sm text-red-800">
                        Hay <strong>{previewData?.finishedBracketMatches}</strong> partido
                        {previewData?.finishedBracketMatches !== 1 ? 's' : ''} de bracket ya
                        finalizado{previewData?.finishedBracketMatches !== 1 ? 's' : ''}. Se
                        perderan todos esos resultados permanentemente.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-control border border-blue-200 bg-blue-50 p-3">
                <p className="text-sm text-blue-800">
                  Los datos de zona se mantendran intactos. Podras regenerar la llave cuando estes
                  listo.
                </p>
              </div>

              <p className="font-medium text-orange-800">Esta accion no se puede deshacer.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="confirm-bracket-reset"
                checked={isConfirmed}
                onCheckedChange={(checked) => setIsConfirmed(checked as boolean)}
              />
              <label
                htmlFor="confirm-bracket-reset"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Entiendo que se eliminara el bracket y sus resultados
              </label>
            </div>
          </div>

          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              onClick={() => {
                setIsDialogOpen(false)
                setIsConfirmed(false)
              }}
              disabled={isConfirming}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReset}
              disabled={!isConfirmed || isConfirming}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Revirtiendo...
                </>
              ) : (
                'Confirmar y Revertir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
