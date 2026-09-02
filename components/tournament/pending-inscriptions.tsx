"use client"

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { 
  Clock, 
  Check, 
  X, 
  Users, 
  User, 
  Phone, 
  Loader2,
  AlertCircle,
  RefreshCw
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { 
  getPendingInscriptions, 
  approveInscription, 
  rejectInscription 
} from '@/app/api/tournaments/actions'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface PendingInscriptionsProps {
  tournamentId: string
  onInscriptionChange?: () => void
}

interface PendingInscription {
  id: string
  tournament_id: string
  player_id: string | null
  couple_id: string | null
  phone: string | null
  is_pending: boolean
  created_at: string
  players: {
    id: string
    first_name: string
    last_name: string
    phone: string | null
    dni: string | null
  } | null
  couples: {
    id: string
    player1: {
      id: string
      first_name: string
      last_name: string
      phone: string | null
    } | null
    player2: {
      id: string
      first_name: string
      last_name: string
      phone: string | null
    } | null
  } | null
}

export default function PendingInscriptions({ 
  tournamentId, 
  onInscriptionChange 
}: PendingInscriptionsProps) {
  const [inscriptions, setInscriptions] = useState<PendingInscription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    type: 'approve' | 'reject'
    inscriptionId: string
    name: string
  } | null>(null)
  const { toast } = useToast()

  const loadPendingInscriptions = async () => {
    setIsLoading(true)
    try {
      const result = await getPendingInscriptions(tournamentId)
      if (result.success && result.inscriptions) {
        setInscriptions(result.inscriptions)
      }
    } catch (error) {
      console.error('Error loading pending inscriptions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPendingInscriptions()
  }, [tournamentId])

  const handleApprove = (inscription: PendingInscription) => {
    const name = getInscriptionName(inscription)
    setConfirmDialog({
      open: true,
      type: 'approve',
      inscriptionId: inscription.id,
      name
    })
  }

  const handleReject = (inscription: PendingInscription) => {
    const name = getInscriptionName(inscription)
    setConfirmDialog({
      open: true,
      type: 'reject',
      inscriptionId: inscription.id,
      name
    })
  }

  const executeAction = async () => {
    if (!confirmDialog) return

    setProcessingId(confirmDialog.inscriptionId)
    startTransition(async () => {
      try {
        const result = confirmDialog.type === 'approve'
          ? await approveInscription(confirmDialog.inscriptionId)
          : await rejectInscription(confirmDialog.inscriptionId)

        if (result.success) {
          toast({
            title: confirmDialog.type === 'approve' ? 'Inscripcion aprobada' : 'Inscripcion rechazada',
            description: confirmDialog.type === 'approve' 
              ? `${confirmDialog.name} ha sido aprobado exitosamente`
              : `${confirmDialog.name} ha sido rechazado`,
          })
          
          // Remover de la lista local
          setInscriptions(prev => prev.filter(i => i.id !== confirmDialog.inscriptionId))
          
          // Notificar al componente padre
          if (onInscriptionChange) {
            onInscriptionChange()
          }
        } else {
          toast({
            title: 'Error',
            description: result.error || 'No se pudo procesar la solicitud',
            variant: 'destructive'
          })
        }
      } catch (error) {
        console.error('Error processing inscription:', error)
        toast({
          title: 'Error',
          description: 'Ocurrio un error al procesar la solicitud',
          variant: 'destructive'
        })
      } finally {
        setProcessingId(null)
        setConfirmDialog(null)
      }
    })
  }

  const getInscriptionName = (inscription: PendingInscription): string => {
    if (inscription.couples?.player1 && inscription.couples?.player2) {
      return `${inscription.couples.player1.first_name} ${inscription.couples.player1.last_name} / ${inscription.couples.player2.first_name} ${inscription.couples.player2.last_name}`
    }
    if (inscription.players) {
      return `${inscription.players.first_name} ${inscription.players.last_name}`
    }
    return 'Inscripcion'
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Cargando inscripciones pendientes...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (inscriptions.length === 0) {
    return null // No mostrar nada si no hay inscripciones pendientes
  }

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <Clock className="h-5 w-5" />
              Inscripciones Pendientes
              <Badge variant="secondary" className="bg-amber-200 text-amber-800">
                {inscriptions.length}
              </Badge>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadPendingInscriptions}
              disabled={isLoading}
              className="text-amber-700 hover:text-amber-800 hover:bg-amber-100"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert className="border-amber-300 bg-amber-100">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Inscripciones por aprobar</AlertTitle>
            <AlertDescription className="text-amber-700">
              Estas inscripciones estan pendientes de aprobacion. Aprobalas para confirmar la participacion en el torneo.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            {inscriptions.map((inscription) => (
              <div
                key={inscription.id}
                className="flex items-center justify-between p-3 bg-white rounded-surface border border-amber-200 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-amber-100">
                    {inscription.couple_id ? (
                      <Users className="h-4 w-4 text-amber-700" />
                    ) : (
                      <User className="h-4 w-4 text-amber-700" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {getInscriptionName(inscription)}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(inscription.created_at)}</span>
                      {inscription.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {inscription.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(inscription)}
                    disabled={isPending && processingId === inscription.id}
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    {isPending && processingId === inscription.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(inscription)}
                    disabled={isPending && processingId === inscription.id}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isPending && processingId === inscription.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Aprobar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de confirmacion */}
      <AlertDialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.type === 'approve' ? 'Aprobar inscripcion' : 'Rechazar inscripcion'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.type === 'approve' 
                ? `Vas a aprobar la inscripcion de ${confirmDialog?.name}. Esta accion confirmara su participacion en el torneo.`
                : `Vas a rechazar la inscripcion de ${confirmDialog?.name}. Esta accion eliminara la solicitud de inscripcion.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={isPending}
              className={confirmDialog?.type === 'approve' 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-red-600 hover:bg-red-700'
              }
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {confirmDialog?.type === 'approve' ? 'Aprobar' : 'Rechazar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

