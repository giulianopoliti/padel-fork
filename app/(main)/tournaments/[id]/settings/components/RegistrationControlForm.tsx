"use client"

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { Loader2, Lock, Unlock, AlertTriangle, Users } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface RegistrationControlFormProps {
  tournamentId: string
  initialRegistrationLocked?: boolean
  initialBracketStatus?: string
  currentStatus?: string
}

export default function RegistrationControlForm({
  tournamentId,
  initialRegistrationLocked = false,
  initialBracketStatus = "NOT_STARTED",
  currentStatus = "NOT_STARTED"
}: RegistrationControlFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [registrationLocked, setRegistrationLocked] = useState(initialRegistrationLocked)
  const { toast } = useToast()

  // Determine if registration can be controlled
  const canControlRegistration = currentStatus === "NOT_STARTED" ||
                                 currentStatus === "ZONE_PHASE" ||
                                 currentStatus === "ZONE_REGISTRATION"

  const isBracketGenerated = initialBracketStatus === "BRACKET_GENERATED" ||
                             initialBracketStatus === "BRACKET_ACTIVE"

  const handleToggleRegistration = async () => {
    if (!canControlRegistration) {
      toast({
        title: "Acción no permitida",
        description: "No se puede modificar el estado de inscripciones en esta fase del torneo",
        variant: "destructive"
      })
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/registration-control`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registration_locked: !registrationLocked
        }),
      })

      if (!response.ok) {
        throw new Error('Error updating registration status')
      }

      const result = await response.json()

      if (result.success) {
        setRegistrationLocked(!registrationLocked)
        toast({
          title: !registrationLocked ? "Inscripciones cerradas" : "Inscripciones abiertas",
          description: !registrationLocked
            ? "Las inscripciones han sido cerradas. No se permitirán nuevas inscripciones."
            : "Las inscripciones han sido reabiertas. Se permiten nuevas inscripciones.",
          variant: "default"
        })

        // Refresh the page to update UI
        window.location.reload()
      } else {
        throw new Error(result.message || 'Error updating registration status')
      }
    } catch (error) {
      console.error('Error updating registration status:', error)
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado de inscripciones. Intenta nuevamente.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Current Status Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded-surface">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-blue-600" />
            <span className="font-medium">Estado de Inscripciones</span>
          </div>
          <div className="flex items-center gap-2">
            {registrationLocked ? (
              <>
                <Lock className="h-4 w-4 text-red-600" />
                <Badge variant="destructive">Cerradas</Badge>
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4 text-green-600" />
                <Badge variant="default" className="bg-green-600">Abiertas</Badge>
              </>
            )}
          </div>
        </div>

        <div className="p-4 border rounded-surface">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <span className="font-medium">Estado de la Llave</span>
          </div>
          <div className="flex items-center gap-2">
            {isBracketGenerated ? (
              <Badge variant="secondary">Llave Generada</Badge>
            ) : (
              <Badge variant="outline">Sin Generar</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Registration Control */}
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded-surface">
          <div className="space-y-1">
            <Label htmlFor="registration-toggle" className="text-sm font-medium">
              Permitir nuevas inscripciones
            </Label>
            <p className="text-sm text-muted-foreground">
              {registrationLocked
                ? "Las inscripciones están cerradas. No se pueden registrar nuevas parejas."
                : "Las inscripciones están abiertas. Se pueden registrar nuevas parejas mientras haya cupo."
              }
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="registration-toggle"
              checked={!registrationLocked}
              onCheckedChange={handleToggleRegistration}
              disabled={isLoading || !canControlRegistration || isBracketGenerated}
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        </div>
      </div>

      {/* Info Alerts */}
      {isBracketGenerated && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Llave generada:</strong> Las inscripciones están automáticamente bloqueadas porque la llave ya fue generada.
            No se pueden agregar nuevas parejas sin regenerar la llave.
          </AlertDescription>
        </Alert>
      )}

      {!canControlRegistration && !isBracketGenerated && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Control no disponible:</strong> El control manual de inscripciones solo está disponible durante las fases
            de registro y zona. El torneo está en fase: <strong>{currentStatus}</strong>
          </AlertDescription>
        </Alert>
      )}

      {canControlRegistration && !isBracketGenerated && (
        <Alert className="border-blue-200 bg-blue-50">
          <Users className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Recomendación:</strong> Cierra las inscripciones manualmente cuando tengas todas las parejas necesarias,
            incluso si aún no has generado la llave. Esto evita inscripciones de último momento.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
