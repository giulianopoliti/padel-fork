"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, Users, Loader2, Phone } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

import { CoupleRegistrationAdvancedProps } from './types'
import { usePlayerSelection } from './hooks/usePlayerSelection'
import PlayerSelector from './components/PlayerSelector'
import CouplePreview from './components/CouplePreview'
import RegistrationActions from './components/RegistrationActions'

// Import backend functions
import { registerCoupleForTournament, registerCoupleForTournamentAndRemoveIndividual } from '@/app/api/tournaments/actions'
import { checkPlayersPhones, updatePlayerPhone } from '@/app/api/players/actions'
// ✅ API ROUTE PATTERN: Usar API endpoints para evitar problemas de serialización
// NO importar Strategy Pattern directamente - usar API routes para Server/Client compatibility

// Interface para datos de verificacion de telefono
interface PhoneCheckData {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  needsPhone: boolean
}

export default function CoupleRegistrationAdvanced({
  tournamentId,
  onComplete,
  players,
  isClubMode = false,
  userPlayerId = null,
  tournamentGender
}: CoupleRegistrationAdvancedProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  
  // Estados para verificacion de telefonos
  const [isCheckingPhones, setIsCheckingPhones] = useState(false)
  const [phoneCheckResult, setPhoneCheckResult] = useState<{
    player1: PhoneCheckData | null
    player2: PhoneCheckData | null
    atLeastOneHasPhone: boolean
    noneHasPhone: boolean
  } | null>(null)
  const [showPhoneForm, setShowPhoneForm] = useState(false)
  const [player1Phone, setPlayer1Phone] = useState("")
  const [player2Phone, setPlayer2Phone] = useState("")
  const [isUpdatingPhones, setIsUpdatingPhones] = useState(false)
  // Guardar IDs de jugadores para el registro despues de actualizar telefonos
  const [pendingRegistration, setPendingRegistration] = useState<{
    player1Id: string
    player2Id: string
  } | null>(null)
  
  const {
    coupleState,
    updatePlayerSelection,
    clearPlayerSelection,
    resetSelection,
    isSelectionComplete,
    areSamePlayer,
    getValidationErrors
  } = usePlayerSelection()

  // Verificar telefonos de jugadores existentes antes de registrar
  const checkPhonesForExistingPlayers = async (player1Id: string, player2Id: string): Promise<boolean> => {
    setIsCheckingPhones(true)
    try {
      console.log("[CoupleRegistrationAdvanced] Verificando telefonos de jugadores existentes...")
      const result = await checkPlayersPhones(player1Id, player2Id)

      if (!result.success) {
        toast({
          title: "Error de verificacion",
          description: result.error || "No se pudo verificar los telefonos",
          variant: "destructive",
        })
        return false
      }

      setPhoneCheckResult({
        player1: result.player1,
        player2: result.player2,
        atLeastOneHasPhone: result.atLeastOneHasPhone,
        noneHasPhone: result.noneHasPhone
      })

      // Si al menos uno tiene telefono, proceder con el registro
      if (result.atLeastOneHasPhone) {
        console.log("[CoupleRegistrationAdvanced] Al menos un jugador tiene telefono, procediendo...")
        return true
      }

      // Si ninguno tiene telefono, mostrar formulario para agregar al menos uno
      console.log("[CoupleRegistrationAdvanced] Ningun jugador tiene telefono, mostrando formulario...")
      setPendingRegistration({ player1Id, player2Id })
      setShowPhoneForm(true)
      return false
    } catch (error) {
      console.error("[CoupleRegistrationAdvanced] Error al verificar telefonos:", error)
      toast({
        title: "Error inesperado",
        description: "Ocurrio un error al verificar los telefonos",
        variant: "destructive",
      })
      return false
    } finally {
      setIsCheckingPhones(false)
    }
  }

  // Actualizar telefonos faltantes y luego registrar
  // Solo se requiere agregar AL MENOS UN telefono si ninguno tiene
  const handleUpdatePhonesAndRegister = async () => {
    if (!phoneCheckResult || !pendingRegistration) return

    const player1PhoneValid = player1Phone && player1Phone.trim().length >= 6
    const player2PhoneValid = player2Phone && player2Phone.trim().length >= 6

    // Validar que al menos uno tenga telefono valido
    if (!player1PhoneValid && !player2PhoneValid) {
      toast({
        title: "Telefono requerido",
        description: "Debes agregar el telefono de al menos uno de los jugadores",
        variant: "destructive",
      })
      return
    }

    setIsUpdatingPhones(true)

    try {
      // Actualizar telefono del jugador 1 si se proporciono
      if (player1PhoneValid && phoneCheckResult.player1?.needsPhone && phoneCheckResult.player1.id) {
        console.log(`[CoupleRegistrationAdvanced] Actualizando telefono de player1: ${phoneCheckResult.player1.id}`)
        const updateResult = await updatePlayerPhone(phoneCheckResult.player1.id, player1Phone)
        if (!updateResult.success) {
          toast({
            title: "Error al actualizar telefono",
            description: updateResult.error || "No se pudo actualizar el telefono",
            variant: "destructive",
          })
          return
        }
      }

      // Actualizar telefono del jugador 2 si se proporciono
      if (player2PhoneValid && phoneCheckResult.player2?.needsPhone && phoneCheckResult.player2.id) {
        console.log(`[CoupleRegistrationAdvanced] Actualizando telefono de player2: ${phoneCheckResult.player2.id}`)
        const updateResult = await updatePlayerPhone(phoneCheckResult.player2.id, player2Phone)
        if (!updateResult.success) {
          toast({
            title: "Error al actualizar telefono",
            description: updateResult.error || "No se pudo actualizar el telefono",
            variant: "destructive",
          })
          return
        }
      }

      // Proceder con el registro
      await executeRegistration(pendingRegistration.player1Id, pendingRegistration.player2Id)
      
      // Limpiar estados
      setShowPhoneForm(false)
      setPhoneCheckResult(null)
      setPendingRegistration(null)
      setPlayer1Phone("")
      setPlayer2Phone("")
    } catch (error) {
      console.error("[CoupleRegistrationAdvanced] Error al actualizar telefonos:", error)
      toast({
        title: "Error inesperado",
        description: "Ocurrio un error al actualizar los telefonos",
        variant: "destructive",
      })
    } finally {
      setIsUpdatingPhones(false)
    }
  }

  // Ejecutar el registro preservando el contexto real del usuario.
  const executeRegistration = async (player1Id: string, player2Id: string, allowBlockedPlayerOverride = false) => {
    console.log("[CoupleRegistrationAdvanced] Ejecutando registro de pareja existente");
    console.log("Player IDs:", { player1Id, player2Id });
    
    const result = await registerCoupleForTournament(tournamentId, player1Id, player2Id, isClubMode, false, allowBlockedPlayerOverride)
    
    if (result.success) {
      toast({
        title: "Pareja registrada",
        description: "La pareja se ha inscrito exitosamente en el torneo",
      })
      onComplete(true)
    } else {
      if (isClubMode && !allowBlockedPlayerOverride && result.error?.startsWith("Te prohibieron la inscripción")) {
        const shouldOverride = window.confirm("Uno de los jugadores está bloqueado para los torneos TPE. ¿Deseas registrar esta inscripción como excepción sin quitar el bloqueo?")
        if (shouldOverride) {
          await executeRegistration(player1Id, player2Id, true)
          return
        }
      }
      console.error('[CoupleRegistrationAdvanced] Registration error:', result.error)
      toast({
        title: "Error en el registro",
        description: result.error || "No se pudo registrar la pareja",
        variant: "destructive"
      })
      onComplete(false)
    }
  }

  const handleSubmit = async () => {
    const errors = getValidationErrors()
    if (errors.length > 0) {
      toast({
        title: "Error de validacion",
        description: errors.join(', '),
        variant: "destructive"
      })
      return
    }

    setIsSubmitting(true)
    try {
      // Verificar si se puede agregar una nueva pareja (via API)
      const canAddRes = await fetch(`/api/tournaments/${tournamentId}/can-add-new-couple`)
      const canAddResult = await canAddRes.json()
      
      if (!canAddResult.canAdd) {
        toast({
          title: "No se puede agregar la pareja",
          description: canAddResult.reason,
          variant: "destructive"
        })
        onComplete(false)
        return
      }
      const { player1, player2 } = coupleState
      
      // Escenario 1: Ambos jugadores existentes
      if (player1.type === 'existing' && player2.type === 'existing') {
        console.log("[CoupleRegistrationAdvanced] Ambos jugadores existentes");

        // ✅ Si es modo club (organizador), NO verificar teléfonos
        if (isClubMode) {
          console.log("[CoupleRegistrationAdvanced] Modo organizador - saltando validación de teléfonos");
          await executeRegistration(player1.existingPlayer!.id, player2.existingPlayer!.id)
          return
        }

        // ✅ Si es modo jugador, verificar teléfonos
        console.log("[CoupleRegistrationAdvanced] Modo jugador - verificando teléfonos");
        const canProceed = await checkPhonesForExistingPlayers(
          player1.existingPlayer!.id,
          player2.existingPlayer!.id
        )

        if (!canProceed) {
          // Si no puede proceder, es porque se mostro el formulario de telefonos
          // o hubo un error. En ambos casos, terminar aqui
          setIsSubmitting(false)
          return
        }

        // Si ambos tienen telefono, proceder con el registro
        await executeRegistration(player1.existingPlayer!.id, player2.existingPlayer!.id)
        return
      }
      
      // ✅ STRATEGY PATTERN: Usar registerNewPlayersAsCouple para cualquier escenario con jugadores nuevos

      // Escenario 2: Al menos un jugador nuevo - usar Strategy Pattern
      const hasNewPlayers = player1.type === 'new' || player2.type === 'new'

      if (hasNewPlayers && player1.type === 'new' && player2.type === 'new') {
        console.log("🚀🚀🚀 [Frontend] Usando API Route con Strategy Pattern 🚀🚀🚀");

        // ✅ API ROUTE PATTERN: Llamada HTTP serializable
        const response = await fetch(`/api/tournaments/${tournamentId}/register-new-couple`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            isOrganizerRegistration: isClubMode,
            player1: {
              firstName: player1.newPlayerData!.first_name,
              lastName: player1.newPlayerData!.last_name,
              phone: player1.newPlayerData!.phone || '',
              dni: player1.newPlayerData!.dni,
              gender: player1.newPlayerData!.gender,
              forceCreateNew: !!player1.newPlayerData!.forceCreateNew
            },
            player2: {
              firstName: player2.newPlayerData!.first_name,
              lastName: player2.newPlayerData!.last_name,
              phone: player2.newPlayerData!.phone || '',
              dni: player2.newPlayerData!.dni,
              gender: player2.newPlayerData!.gender,
              forceCreateNew: !!player2.newPlayerData!.forceCreateNew
            }
          })
        });

        const result = await response.json();

        if (result.success) {
          toast({
            title: "¡Pareja registrada!",
            description: "La pareja se ha inscrito exitosamente en el torneo con categorización automática",
          })
          onComplete(true)
        } else {
          console.error('[CoupleRegistrationAdvanced] API Route error:', result.error)
          toast({
            title: "Error en el registro",
            description: result.error || "No se pudo registrar la pareja",
            variant: "destructive"
          })
          onComplete(false)
        }
        return
      }

      // Para casos mixtos (uno nuevo, uno existente), usar createPlayerForCouple legacy temporalmente
      let player1Id: string
      let player2Id: string
      
      // ⚠️ TODO: Migrar casos mixtos también al Strategy Pattern
      // Crear o usar jugador 1
      if (player1.type === 'new') {
        // Usar createPlayerForCouple legacy temporalmente para casos mixtos
        const { createPlayerForCouple } = await import('@/app/api/players/actions')
        const newPlayerResult = await createPlayerForCouple({
           tournamentId,
           playerData: {
             first_name: player1.newPlayerData!.first_name,
             last_name: player1.newPlayerData!.last_name,
             gender: player1.newPlayerData!.gender,
             dni: player1.newPlayerData!.dni,
             forceCreateNew: !!player1.newPlayerData!.forceCreateNew
           }
         })
        
        if (!newPlayerResult.success) {
          throw new Error("No se pudo crear el jugador 1")
        }
        
        // Usar el ID devuelto por createPlayerForCouple
        player1Id = newPlayerResult.playerId!
        console.log("[CoupleRegistration] Jugador 1 creado con ID:", player1Id)
        
        // Si el jugador nuevo no tiene telefono en newPlayerData, actualizar
        if (player1.newPlayerData!.phone) {
          await updatePlayerPhone(player1Id, player1.newPlayerData!.phone)
        }
      } else {
        player1Id = player1.existingPlayer!.id
      }
      
      // Crear o usar jugador 2
      if (player2.type === 'new') {
        // Usar createPlayerForCouple legacy temporalmente para casos mixtos
        const { createPlayerForCouple } = await import('@/app/api/players/actions')
        const newPlayerResult = await createPlayerForCouple({
          tournamentId,
          playerData: {
            first_name: player2.newPlayerData!.first_name,
            last_name: player2.newPlayerData!.last_name,
            gender: player2.newPlayerData!.gender,
            dni: player2.newPlayerData!.dni,
            forceCreateNew: !!player2.newPlayerData!.forceCreateNew
          }
        })
        
        if (!newPlayerResult.success) {
          throw new Error("No se pudo crear el jugador 2")
        }
        
        // Usar el ID devuelto por createPlayerForCouple
        player2Id = newPlayerResult.playerId!
        console.log("[CoupleRegistration] Jugador 2 creado con ID:", player2Id)
        
        // Si el jugador nuevo tiene telefono en newPlayerData, actualizar
        if (player2.newPlayerData!.phone) {
          await updatePlayerPhone(player2Id, player2.newPlayerData!.phone)
        }
      } else {
        player2Id = player2.existingPlayer!.id
      }
      
      // Verificar telefonos de los jugadores existentes en caso mixto
      const existingPlayerIds: string[] = []
      if (player1.type === 'existing') existingPlayerIds.push(player1Id)
      if (player2.type === 'existing') existingPlayerIds.push(player2Id)

      // Si hay jugadores existentes y es modo jugador, verificar sus teléfonos
      if (existingPlayerIds.length > 0 && !isClubMode) {
        console.log("[CoupleRegistrationAdvanced] Modo jugador - verificando teléfonos de jugadores existentes");
        // Verificar telefonos de ambos jugadores (el nuevo ya tiene telefono del formulario)
        const canProceed = await checkPhonesForExistingPlayers(player1Id, player2Id)

        if (!canProceed) {
          // Si no puede proceder, es porque se mostro el formulario de telefonos
          setIsSubmitting(false)
          return
        }
      }
      
      // Registrar la pareja con los IDs obtenidos usando la función correcta
      await executeRegistration(player1Id, player2Id)
      
    } catch (error) {
      console.error('Error registrando pareja:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo registrar la pareja. Intente nuevamente.",
        variant: "destructive"
      })
      onComplete(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    resetSelection()
    // Limpiar estados de verificacion de telefonos
    setShowPhoneForm(false)
    setPhoneCheckResult(null)
    setPendingRegistration(null)
    setPlayer1Phone("")
    setPlayer2Phone("")
  }

  const handleCancelPhoneForm = () => {
    setShowPhoneForm(false)
    setPhoneCheckResult(null)
    setPendingRegistration(null)
    setPlayer1Phone("")
    setPlayer2Phone("")
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Registro de Pareja - Modo {isClubMode ? 'Club' : 'Jugador'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Sistema Avanzado de Registro</AlertTitle>
            <AlertDescription>
              Seleccione para cada posición si desea registrar un jugador nuevo o buscar uno existente. 
              Puede combinar cualquier opción: ambos nuevos, ambos existentes, o uno de cada tipo.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Player Selectors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PlayerSelector
          playerNumber={1}
          playerSelection={coupleState.player1}
          availablePlayers={players}
          onUpdateSelection={updatePlayerSelection}
          onClearSelection={clearPlayerSelection}
          isClubMode={isClubMode}
          userPlayerId={userPlayerId}
          tournamentGender={tournamentGender}
          tournamentId={tournamentId}
        />

        <PlayerSelector
          playerNumber={2}
          playerSelection={coupleState.player2}
          availablePlayers={players}
          onUpdateSelection={updatePlayerSelection}
          onClearSelection={clearPlayerSelection}
          isClubMode={isClubMode}
          userPlayerId={userPlayerId}
          tournamentGender={tournamentGender}
          tournamentId={tournamentId}
        />
      </div>

      {/* Couple Preview */}
      <CouplePreview
        coupleState={coupleState}
        onClearPlayer={clearPlayerSelection}
      />

      {/* Formulario para telefonos faltantes */}
      {showPhoneForm && phoneCheckResult && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 space-y-4">
            <Alert className="border-amber-300 bg-amber-100">
              <Phone className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Telefono requerido</AlertTitle>
              <AlertDescription className="text-amber-700">
                Ninguno de los jugadores tiene telefono registrado. Por favor, agrega el telefono de al menos uno de ellos para completar la inscripcion.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              {/* Telefono del jugador 1 */}
              {phoneCheckResult.player1?.needsPhone && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefono de {phoneCheckResult.player1.firstName} {phoneCheckResult.player1.lastName}
                  </label>
                  <Input
                    type="tel"
                    placeholder="Ingresa el numero de telefono"
                    value={player1Phone}
                    onChange={(e) => setPlayer1Phone(e.target.value)}
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                    aria-label={`Telefono de ${phoneCheckResult.player1.firstName}`}
                  />
                  <p className="text-xs text-gray-500">Minimo 6 caracteres</p>
                </div>
              )}

              {/* Telefono del jugador 2 */}
              {phoneCheckResult.player2?.needsPhone && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefono de {phoneCheckResult.player2.firstName} {phoneCheckResult.player2.lastName}
                  </label>
                  <Input
                    type="tel"
                    placeholder="Ingresa el numero de telefono"
                    value={player2Phone}
                    onChange={(e) => setPlayer2Phone(e.target.value)}
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                    aria-label={`Telefono de ${phoneCheckResult.player2.firstName}`}
                  />
                  <p className="text-xs text-gray-500">Minimo 6 caracteres</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelPhoneForm}
                disabled={isUpdatingPhones}
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdatePhonesAndRegister}
                disabled={isUpdatingPhones}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isUpdatingPhones ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  "Guardar y registrar pareja"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Errors */}
      {!showPhoneForm && getValidationErrors().length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Errores de validacion</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside">
              {getValidationErrors().map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons - Solo mostrar si no esta el formulario de telefonos */}
      {!showPhoneForm && (
        <RegistrationActions
          isSelectionComplete={isSelectionComplete()}
          hasErrors={getValidationErrors().length > 0}
          isSubmitting={isSubmitting || isCheckingPhones}
          onSubmit={handleSubmit}
          onReset={handleReset}
        />
      )}
    </div>
  )
} 
