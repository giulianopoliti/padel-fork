"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { UserPlus, Search, Users, Loader2, CheckCircle, Trash2, CircleHelp } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import RegisterPlayerForm from "./club/register-player-form"
import { pairIndividualPlayers, removePlayerFromTournament, registerPlayerForTournament } from "@/app/api/tournaments/actions"
import { useUser } from "@/contexts/user-context"
import AuthRequiredDialog from "@/components/tournament/auth-required-dialog"
import CoupleRegistrationAdvanced from "@/components/tournament/couple-registration-advanced"
import RegisterCoupleForm from "@/components/tournament/player/register-couple-form"
import { useTournamentPermissions } from "@/hooks/use-tournament-permissions"
import { Gender } from "@/types"
import PlayerDetailsDialog from "@/components/tournament/player-details-dialog"
import PlayerDniDisplay from "@/components/players/player-dni-display"
import { Checkbox } from "@/components/ui/checkbox"
import { getTenantBranding } from "@/config/tenant"

interface PlayerInfo {
  id: string
  first_name: string | null
  last_name: string | null
  score: number | null
  dni?: string | null
  phone?: string | null
  late_withdrawal_count?: number
}

interface TournamentPlayersTabProps {
  individualInscriptions: PlayerInfo[]
  tournamentId: string
  tournamentStatus: string
  maxPlayers?: number
  allPlayers?: PlayerInfo[]
  isPublicView?: boolean
  tournamentGender: Gender
  tournamentType?: string | null
  tournamentStartDate?: string | null
  // 🚀 New registration control props
  registrationLocked?: boolean
  bracketStatus?: string
  enableTransferProof?: boolean
  transferAlias?: string | null
  transferAmount?: number | null
  // 🚀 Optimistic mutations callbacks
  onPlayerAdded?: (player: PlayerInfo) => Promise<void>
  onPlayerRemoved?: (playerId: string) => Promise<void>
  onPlayersPaired?: (player1Id: string, player2Id: string, newCouple: any) => Promise<void>
  onCoupleAdded?: (couple: any) => Promise<void>
  onRefresh?: () => Promise<void>
}

export default function TournamentPlayersTab({
  individualInscriptions,
  tournamentId,
  tournamentStatus,
  maxPlayers = 32,
  allPlayers = [],
  isPublicView = false,
  tournamentGender,
  tournamentType,
  tournamentStartDate = null,
  // 🚀 New registration control props
  registrationLocked = false,
  bracketStatus = "NOT_STARTED",
  enableTransferProof = false,
  transferAlias = null,
  transferAmount = null,
  // 🚀 Optimistic mutations
  onPlayerAdded,
  onPlayerRemoved,
  onPlayersPaired,
  onCoupleAdded,
  onRefresh,
}: TournamentPlayersTabProps) {
  const [registerPlayerDialogOpen, setRegisterPlayerDialogOpen] = useState(false)
  const [pairPlayersDialogOpen, setPairPlayersDialogOpen] = useState(false)
  const [deletePlayerDialogOpen, setDeletePlayerDialogOpen] = useState(false)
  const [playerToDelete, setPlayerToDelete] = useState<PlayerInfo | null>(null)
  const [selectedPlayers, setSelectedPlayers] = useState<{
    player1: PlayerInfo | null;
    player2: PlayerInfo | null;
  }>({
    player1: null,
    player2: null
  })
  const [isPairing, setIsPairing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [recordLateWithdrawal, setRecordLateWithdrawal] = useState(false)
  const [isRegisteringMyself, setIsRegisteringMyself] = useState(false)
  const [showRegisterConfirmation, setShowRegisterConfirmation] = useState(false)
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false)
  const [isCancelingMyself, setIsCancelingMyself] = useState(false)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [authIntent, setAuthIntent] = useState<"individual" | "couple">("individual")
  const [registerCoupleDialogOpen, setRegisterCoupleDialogOpen] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [playerDetailsDialogOpen, setPlayerDetailsDialogOpen] = useState(false)

  const { toast } = useToast()
  const { user, userDetails } = useUser()
  const { isOwner: hasManagementPermissions, isLoading: permissionsLoading } = useTournamentPermissions(tournamentId)

  // 🔒 NEW REGISTRATION LOGIC:
  // ✅ Allow registrations when: status = ZONE_PHASE AND registration_locked = FALSE
  // ❌ Block registrations when: registration_locked = TRUE OR bracket already generated
  const isRegistrationBlocked = registrationLocked ||
    bracketStatus === "BRACKET_GENERATED" ||
    bracketStatus === "BRACKET_ACTIVE" ||
    (tournamentStatus !== "NOT_STARTED" && tournamentStatus !== "ZONE_PHASE" && tournamentStatus !== "ZONE_REGISTRATION")
  const currentPlayers = individualInscriptions.length
  const isMaxPlayersReached = currentPlayers >= maxPlayers
  const canPairPlayers = !isRegistrationBlocked && currentPlayers >= 2
  const isPlayer = userDetails?.role === 'PLAYER' && userDetails?.player_id
  const isPlayerAlreadyRegistered = isPlayer && individualInscriptions.some(p => p.id === userDetails.player_id)

  // Use centralized permissions instead of basic role checks
  const canManageTournament = hasManagementPermissions
  const canRecordTpeLateWithdrawal = getTenantBranding().key === "padel-elite" && tournamentType === "AMERICAN"
  const millisecondsUntilStart = tournamentStartDate
    ? new Date(tournamentStartDate).getTime() - Date.now()
    : null
  const isTpeLateCancellationWindow = canRecordTpeLateWithdrawal
    && millisecondsUntilStart !== null
    && millisecondsUntilStart >= 0
    && millisecondsUntilStart < 3 * 60 * 60 * 1000
  const selfServiceRequiresCouple = enableTransferProof && !canManageTournament

  // Use isOwner from useTournamentPermissions to show/hide player details
  const canViewPlayerDetails = hasManagementPermissions
  const registerBaseHref = `/register?role=PLAYER&redirectTo=${encodeURIComponent(`/tournaments/${tournamentId}`)}`
  const registerHref = `${registerBaseHref}&intent=${authIntent}`
  const loginHref = `/login?role=PLAYER&redirectTo=${encodeURIComponent(`/tournaments/${tournamentId}`)}&intent=${authIntent}`

  const handleRegisterSuccess = async (newPlayer?: PlayerInfo) => {
    setRegisterPlayerDialogOpen(false)

    // 🚀 Optimistic update instead of window.reload()
    if (onPlayerAdded && newPlayer) {
      try {
        await onPlayerAdded(newPlayer)
        toast({
          title: "¡Jugador inscrito!",
          description: "El jugador se ha inscrito exitosamente en el torneo.",
          variant: "default"
        })
      } catch (error) {
        console.error('Error in optimistic update:', error)
        // Fallback behavior if needed
        toast({
          title: "Jugador inscrito",
          description: "El jugador se inscribió correctamente. Los datos se sincronizarán en breve.",
          variant: "default"
        })
      }
    }
  }

  const handleRegisterMyself = async () => {
    if (!isPlayer || !userDetails.player_id) {
      toast({
        title: "Error de autenticación",
        description: "Debes estar logueado como jugador para inscribirte.",
        variant: "destructive"
      })
      return
    }

    setIsRegisteringMyself(true)
    try {
      // 🚀 First: Optimistic update for immediate UI feedback
      const currentPlayerInfo = allPlayers.find(p => p.id === userDetails.player_id)
      if (onPlayerAdded && currentPlayerInfo) {
        await onPlayerAdded(currentPlayerInfo)
      }

      const result = await registerPlayerForTournament(tournamentId, userDetails.player_id, tournamentGender)

      if (result.success) {
        toast({
          title: "¡Inscripción exitosa!",
          description: "Te has inscrito exitosamente en el torneo.",
          variant: "default"
        })
        setShowRegisterConfirmation(false)
        // ✅ No more window.reload() - using optimistic update
      } else {
        // If server action failed, remove the optimistic update
        if (onPlayerRemoved && userDetails.player_id) {
          await onPlayerRemoved(userDetails.player_id)
        }
        toast({
          title: "Error en la inscripción",
          description: result.message || "No se pudo completar la inscripción.",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error registering myself:", error)
      // If error occurred, remove the optimistic update
      if (onPlayerRemoved && userDetails.player_id) {
        await onPlayerRemoved(userDetails.player_id)
      }
      toast({
        title: "Error inesperado",
        description: "Ocurrió un error al inscribirte en el torneo.",
        variant: "destructive"
      })
    } finally {
      setIsRegisteringMyself(false)
    }
  }

  const handleCancelMyself = async () => {
    if (!isPlayer || !userDetails.player_id) {
      toast({
        title: "Error de autenticación",
        description: "Debes estar logueado como jugador para cancelar tu inscripción.",
        variant: "destructive"
      })
      return
    }

    setIsCancelingMyself(true)
    try {
      // 🚀 First: Optimistic update for immediate UI feedback
      if (onPlayerRemoved) {
        await onPlayerRemoved(userDetails.player_id)
      }

      const result = await removePlayerFromTournament(tournamentId, userDetails.player_id)

      if (result.success) {
        // 🔄 Force refresh to ensure cache sync after successful deletion
        if (onRefresh) {
          try {
            await onRefresh()
          } catch (error) {
            console.warn('Failed to refresh after player deletion, but deletion was successful:', error)
          }
        }

        toast({
          title: "Inscripción cancelada",
          description: "Has cancelado tu inscripción exitosamente.",
          variant: "default"
        })
        setShowCancelConfirmation(false)
      } else {
        // If server action failed, restore the optimistic update
        const currentPlayerInfo = allPlayers.find(p => p.id === userDetails.player_id)
        if (onPlayerAdded && currentPlayerInfo) {
          await onPlayerAdded(currentPlayerInfo)
        }
        toast({
          title: "Error al cancelar",
          description: result.message || "No se pudo cancelar la inscripción.",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error canceling myself:", error)
      // If error occurred, restore the optimistic update
      const currentPlayerInfo = allPlayers.find(p => p.id === userDetails.player_id)
      if (onPlayerAdded && currentPlayerInfo) {
        await onPlayerAdded(currentPlayerInfo)
      }
      toast({
        title: "Error inesperado",
        description: "Ocurrió un error al cancelar tu inscripción.",
        variant: "destructive"
      })
    } finally {
      setIsCancelingMyself(false)
    }
  }

  const handleSelectPlayer = (player: PlayerInfo, slot: 'player1' | 'player2') => {
    const otherSlot = slot === 'player1' ? 'player2' : 'player1'
    
    // Evitar seleccionar el mismo jugador en ambos slots
    if (selectedPlayers[otherSlot]?.id === player.id) {
      setSelectedPlayers(prev => ({
        ...prev,
        [otherSlot]: null,
        [slot]: player
      }))
    } else {
      setSelectedPlayers(prev => ({
        ...prev,
        [slot]: player
      }))
    }
  }

  const handleRemovePlayer = (slot: 'player1' | 'player2') => {
    setSelectedPlayers(prev => ({
      ...prev,
      [slot]: null
    }))
  }

  const handlePairPlayers = async () => {
    if (!selectedPlayers.player1 || !selectedPlayers.player2) {
      toast({
        title: "Selección incompleta",
        description: "Debe seleccionar ambos jugadores para formar la pareja.",
        variant: "destructive"
      })
      return
    }

    setIsPairing(true)
    try {
      // 🚀 Create mock couple data for optimistic update
      const mockCouple = {
        id: `temp-couple-${Date.now()}`, // Temporary ID
        tournament_id: tournamentId,
        player_1_id: selectedPlayers.player1.id,
        player_2_id: selectedPlayers.player2.id,
        created_at: new Date().toISOString(),
        player_1_info: selectedPlayers.player1,
        player_2_info: selectedPlayers.player2,
      }

      // 🚀 First: Optimistic update (remove 2 individuals, add 1 couple)
      if (onPlayersPaired) {
        await onPlayersPaired(selectedPlayers.player1.id, selectedPlayers.player2.id, mockCouple)
      }

      const result = await pairIndividualPlayers(
        tournamentId,
        selectedPlayers.player1.id,
        selectedPlayers.player2.id
      )

      if (result.success) {
        toast({
          title: "Pareja creada",
          description: result.message || "Los jugadores han sido emparejados exitosamente.",
          variant: "default"
        })
        setPairPlayersDialogOpen(false)
        setSelectedPlayers({ player1: null, player2: null })
        // ✅ No more window.reload() - using optimistic update
      } else {
        // If server action failed, restore the optimistic update
        if (onPlayerAdded) {
          await onPlayerAdded(selectedPlayers.player1)
          await onPlayerAdded(selectedPlayers.player2)
        }
        // Remove the mock couple
        if (onCoupleAdded) {
          // Note: We'd need a removeCoupleOptimistic function or handle this in the backend
        }
        toast({
          title: "Error al emparejar",
          description: result.error || "No se pudo crear la pareja.",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error pairing players:", error)
      // If error occurred, restore the optimistic update
      if (onPlayerAdded && selectedPlayers.player1 && selectedPlayers.player2) {
        await onPlayerAdded(selectedPlayers.player1)
        await onPlayerAdded(selectedPlayers.player2)
      }
      toast({
        title: "Error inesperado",
        description: "Ocurrió un error al emparejar los jugadores.",
        variant: "destructive"
      })
    } finally {
      setIsPairing(false)
    }
  }

  const handleDeletePlayerClick = (player: PlayerInfo) => {
    setPlayerToDelete(player)
    setRecordLateWithdrawal(false)
    setDeletePlayerDialogOpen(true)
  }

  const handleDeletePlayer = async () => {
    if (!playerToDelete) return

    setIsDeleting(true)
    try {
      // 🚀 First: Optimistic update for immediate UI feedback
      if (onPlayerRemoved) {
        await onPlayerRemoved(playerToDelete.id)
      }

      const result = await removePlayerFromTournament(tournamentId, playerToDelete.id, recordLateWithdrawal)

      if (result.success) {
        // 🔄 Force refresh to ensure cache sync after successful deletion
        if (onRefresh) {
          try {
            await onRefresh()
          } catch (error) {
            console.warn('Failed to refresh after admin player deletion, but deletion was successful:', error)
          }
        }

        toast({
          title: "Jugador eliminado",
          description: result.message,
          variant: "default"
        })
        setDeletePlayerDialogOpen(false)
        setPlayerToDelete(null)
      } else {
        // If server action failed, restore the optimistic update
        if (onPlayerAdded) {
          await onPlayerAdded(playerToDelete)
        }
        toast({
          title: "Error al eliminar",
          description: result.message,
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error deleting player:", error)
      // If error occurred, restore the optimistic update
      if (onPlayerAdded && playerToDelete) {
        await onPlayerAdded(playerToDelete)
      }
      toast({
        title: "Error inesperado",
        description: "Ocurrió un error al eliminar el jugador.",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const getPlayerDisplayName = (player: PlayerInfo) => {
    const firstName = player.first_name || ""
    const lastName = player.last_name || ""
    return `${firstName} ${lastName}`.trim() || "Jugador sin nombre"
  }

  const handleRegisterMyselfClick = () => {
    if (selfServiceRequiresCouple) {
      handleRegisterCoupleClick()
      return
    }

    if (!user) {
      setAuthIntent("individual")
      setAuthDialogOpen(true)
      return
    }
    
    if (!isPlayer) {
      toast({
        title: "Sin permisos para inscripción",
        description: "Solo los jugadores pueden inscribirse individualmente.",
        variant: "destructive"
      })
      return
    }
    
    setShowRegisterConfirmation(true)
  }

  const handleRegisterCoupleClick = () => {
    if (!user) {
      setAuthIntent("couple")
      setAuthDialogOpen(true)
      return
    }
    
    if (!isPlayer && userDetails?.role !== 'CLUB' && userDetails?.role !== 'ORGANIZADOR') {
      toast({
        title: "Sin permisos para inscripción",
        description: "Solo los jugadores, clubes y organizadores pueden inscribir parejas.",
        variant: "destructive"
      })
      return
    }
    
    setRegisterCoupleDialogOpen(true)
  }

  const handleRegisterCoupleSuccess = async (wasSuccessful: boolean = true, newCouple?: any) => {
    setRegisterCoupleDialogOpen(false)

    // 🚀 Optimistic update instead of window.reload()
    if (wasSuccessful && onCoupleAdded && newCouple) {
      try {
        await onCoupleAdded(newCouple)
        toast({
          title: "¡Pareja registrada!",
          description: "La pareja se ha inscrito exitosamente en el torneo.",
          variant: "default"
        })
      } catch (error) {
        console.error('Error in optimistic couple update:', error)
        // Fallback behavior if needed
        toast({
          title: "Pareja registrada",
          description: "La pareja se inscribió correctamente. Los datos se sincronizarán en breve.",
          variant: "default"
        })
      }
    }
  }

  const handlePlayerClick = (playerId: string) => {
    setSelectedPlayerId(playerId)
    setPlayerDetailsDialogOpen(true)
  }

  const handlePlayerDetailsClose = () => {
    setPlayerDetailsDialogOpen(false)
    setSelectedPlayerId(null)
  }

  const handlePlayerDetailsUpdate = async () => {
    // Refresh data after player update
    if (onRefresh) {
      await onRefresh()
    }
  }

  return (
    <>
      <div className="p-4 sm:p-6 border-b border-gray-200 bg-slate-50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Jugadores Individuales</h3>
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{currentPlayers}</span> de{" "}
              <span className="font-semibold text-slate-900">{maxPlayers}</span> jugadores inscritos
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {canPairPlayers && user && !isPublicView && !isPlayer && canManageTournament && (
              <Button
                onClick={() => setPairPlayersDialogOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                size="sm"
              >
                <Users className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Emparejar Jugadores</span>
                <span className="sm:hidden">Emparejar</span>
              </Button>
            )}
            
            {!isRegistrationBlocked && !isPublicView && (
              <>
                {isPlayer && !isPlayerAlreadyRegistered ? (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    {!selfServiceRequiresCouple && (
                      <Button
                        onClick={handleRegisterMyselfClick}
                        className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none py-3 sm:py-2"
                        size="default"
                        disabled={isMaxPlayersReached}
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">Inscribirme solo</span>
                        <span className="sm:hidden">Inscribir jugador</span>
                      </Button>
                    )}
                    <Button
                      onClick={handleRegisterCoupleClick}
                      className="bg-slate-900 hover:bg-slate-800 text-white flex-1 sm:flex-none py-3 sm:py-2"
                      size="default"
                    >
                      <Users className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Inscribir pareja</span>
                      <span className="sm:hidden">Inscribir pareja</span>
                    </Button>
                  </div>
                ) : !user ? (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    {!selfServiceRequiresCouple && (
                      <Button
                        onClick={handleRegisterMyselfClick}
                        className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none py-3 sm:py-2"
                        size="default"
                        disabled={isMaxPlayersReached}
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">Inscribirme solo</span>
                        <span className="sm:hidden">Inscribir jugador</span>
                      </Button>
                    )}
                    <Button
                      onClick={handleRegisterCoupleClick}
                      className="bg-slate-900 hover:bg-slate-800 text-white flex-1 sm:flex-none py-3 sm:py-2"
                      size="default"
                    >
                      <Users className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Inscribir pareja</span>
                      <span className="sm:hidden">Inscribir pareja</span>
                    </Button>
                  </div>
                ) : isPlayer && isPlayerAlreadyRegistered ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2">
                      <p className="text-sm text-green-700 font-medium text-center">
                        ✓ Ya estás inscrito
                      </p>
                    </div>
                    <Button
                      onClick={() => setShowCancelConfirmation(true)}
                      variant="outline"
                      size="default"
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 py-3 sm:py-2"
                    >
                      <span className="hidden sm:inline">Cancelar inscripción</span>
                      <span className="sm:hidden">Cancelar</span>
                    </Button>
                  </div>
                ) : canManageTournament ? (
                  <Button
                    onClick={() => setRegisterPlayerDialogOpen(true)}
                    className="bg-slate-900 hover:bg-slate-800 text-white w-full sm:w-auto py-3 sm:py-2"
                    size="default"
                    disabled={isMaxPlayersReached}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Inscribir Jugador</span>
                    <span className="sm:hidden">Inscribir jugador</span>
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {individualInscriptions.length > 0 ? (
          <>
            {/* Vista móvil - Cards */}
            <div className="block sm:hidden space-y-3">
              {individualInscriptions.map((player) => (
                <div
                  key={player.id}
                  className={`bg-white border border-gray-200 rounded-lg p-4 shadow-sm ${
                    canViewPlayerDetails ? 'cursor-pointer hover:border-blue-300 hover:shadow-md transition-all' : ''
                  }`}
                  onClick={canViewPlayerDetails ? () => handlePlayerClick(player.id) : undefined}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h4 className={`font-medium text-slate-900 text-lg ${canViewPlayerDetails ? 'hover:text-blue-600' : ''}`}>
                        {getPlayerDisplayName(player)}
                      </h4>
                      {canViewPlayerDetails && (
                        <div className="space-y-1 mt-2">
                          <p className="text-sm text-slate-600">
                            <span className="font-medium">DNI:</span>{" "}
                            <PlayerDniDisplay dni={player.dni} className="text-sm text-slate-600" />
                          </p>
                          <p className="text-sm text-slate-600">
                            <span className="font-medium">Teléfono:</span> {player.phone || "No especificado"}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {player.score !== null ? (
                        <div className="inline-flex items-center justify-center bg-slate-100 text-slate-700 font-semibold rounded-full h-10 w-10 border border-slate-200">
                          {player.score}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm">Sin puntaje</span>
                      )}
                      {!isRegistrationBlocked && !isPublicView && (
                        <>
                          {isPlayer && player.id === userDetails.player_id ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowCancelConfirmation(true)
                              }}
                              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Cancelar
                            </Button>
                          ) : canManageTournament ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeletePlayerClick(player)
                              }}
                              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Eliminar
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Vista desktop - Tabla */}
            <div className="hidden sm:block border border-gray-200 rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-b border-gray-200">
                    <TableHead className="font-semibold text-slate-700">Nombre</TableHead>
                    <TableHead className="font-semibold text-slate-700">Apellido</TableHead>
                    {canViewPlayerDetails && (
                      <>
                        <TableHead className="font-semibold text-slate-700">DNI</TableHead>
                        <TableHead className="font-semibold text-slate-700">Teléfono</TableHead>
                      </>
                    )}
                    <TableHead className="font-semibold text-slate-700 text-center">Puntaje</TableHead>
                    {!isRegistrationBlocked && !isPublicView && (
                      <TableHead className="font-semibold text-slate-700 text-center">Acciones</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {individualInscriptions.map((player) => (
                    <TableRow
                      key={player.id}
                      className={`border-b border-gray-100 ${
                        canViewPlayerDetails ? 'hover:bg-blue-50 cursor-pointer' : 'hover:bg-slate-50'
                      }`}
                      onClick={canViewPlayerDetails ? () => handlePlayerClick(player.id) : undefined}
                    >
                      <TableCell className={`font-medium text-slate-900 ${canViewPlayerDetails ? 'hover:text-blue-600' : ''}`}>
                        {player.first_name || "—"}
                        {hasManagementPermissions && tournamentType === "AMERICAN" && (player.late_withdrawal_count || 0) > 0 && (
                          <span title={`Historial de bajas tardías: ${player.late_withdrawal_count}`} className="ml-2 inline-flex align-middle text-amber-600"><CircleHelp className="h-4 w-4" /></span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-700">{player.last_name || "—"}</TableCell>
                      {canViewPlayerDetails && (
                        <>
                          <TableCell className="text-slate-700">
                            <PlayerDniDisplay dni={player.dni} className="text-slate-700" />
                          </TableCell>
                          <TableCell className="text-slate-700">{player.phone || "—"}</TableCell>
                        </>
                      )}
                      <TableCell className="text-center">
                        {player.score !== null ? (
                          <div className="inline-flex items-center justify-center bg-slate-100 text-slate-700 font-semibold rounded-full h-8 w-8 border border-slate-200">
                            {player.score}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      {!isRegistrationBlocked && !isPublicView && (
                        <TableCell className="text-center">
                          {isPlayer && player.id === userDetails.player_id ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowCancelConfirmation(true)
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : canManageTournament ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeletePlayerClick(player)
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="text-center py-12 sm:py-16 px-4">
            <div className="bg-slate-100 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <Search className="h-8 w-8 sm:h-10 sm:w-10 text-slate-400" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">No hay jugadores inscritos</h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6 text-sm sm:text-base">
              {isPlayer && !isPlayerAlreadyRegistered 
                ? "Aún no hay jugadores individuales inscritos en este torneo. ¡Sé el primero en inscribirte!"
                : isPlayer && isPlayerAlreadyRegistered
                ? "Ya estás inscrito en este torneo como jugador individual."
                : "Aún no hay jugadores individuales inscritos en este torneo. Comienza agregando el primer jugador."
              }
            </p>

          </div>
        )}
      </div>

      {/* Diálogo para inscribir jugador */}
      <Dialog open={registerPlayerDialogOpen} onOpenChange={setRegisterPlayerDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Inscribir Jugador</DialogTitle>
            <DialogDescription>
              Busque un jugador existente o registre uno nuevo para inscribirlo en el torneo
            </DialogDescription>
          </DialogHeader>
          <RegisterPlayerForm
            tournamentId={tournamentId}
            onSuccess={handleRegisterSuccess}
            existingPlayers={allPlayers}
            tournamentGender={tournamentGender}
          />
        </DialogContent>
      </Dialog>

      {/* Diálogo para emparejar jugadores */}
      <Dialog open={pairPlayersDialogOpen} onOpenChange={setPairPlayersDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Emparejar Jugadores Individuales
            </DialogTitle>
            <DialogDescription>
              Seleccione dos jugadores para formar una pareja. Una vez emparejados, las inscripciones individuales se eliminarán y se creará una inscripción de pareja.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Jugador 1 */}
              <div className="space-y-3">
                <h4 className="font-medium text-slate-900">Primer Jugador</h4>
                {selectedPlayers.player1 ? (
                  <Card className="border border-blue-200">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-slate-900">
                            {getPlayerDisplayName(selectedPlayers.player1)}
                          </p>
                          <p className="text-sm text-slate-600">
                            DNI: <PlayerDniDisplay dni={selectedPlayers.player1.dni} className="text-sm text-slate-600" />
                          </p>
                          <p className="text-sm text-slate-600">
                            Puntaje: {selectedPlayers.player1.score ?? "No especificado"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemovePlayer('player1')}
                        >
                          ×
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2">
                    {individualInscriptions.map((player) => (
                      <Button
                        key={player.id}
                        variant="outline"
                        className="justify-start h-auto p-3"
                        onClick={() => handleSelectPlayer(player, 'player1')}
                        disabled={selectedPlayers.player2?.id === player.id}
                      >
                        <div className="text-left">
                          <p className="font-medium">{getPlayerDisplayName(player)}</p>
                          <p className="text-xs text-slate-500">
                            DNI: {player.dni ? player.dni : "pendiente"} | Puntaje: {player.score ?? "N/A"}
                          </p>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* Jugador 2 */}
              <div className="space-y-3">
                <h4 className="font-medium text-slate-900">Segundo Jugador</h4>
                {selectedPlayers.player2 ? (
                  <Card className="border border-green-200">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-slate-900">
                            {getPlayerDisplayName(selectedPlayers.player2)}
                          </p>
                          <p className="text-sm text-slate-600">
                            DNI: <PlayerDniDisplay dni={selectedPlayers.player2.dni} className="text-sm text-slate-600" />
                          </p>
                          <p className="text-sm text-slate-600">
                            Puntaje: {selectedPlayers.player2.score ?? "No especificado"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemovePlayer('player2')}
                        >
                          ×
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2">
                    {individualInscriptions.map((player) => (
                      <Button
                        key={player.id}
                        variant="outline"
                        className="justify-start h-auto p-3"
                        onClick={() => handleSelectPlayer(player, 'player2')}
                        disabled={selectedPlayers.player1?.id === player.id}
                      >
                        <div className="text-left">
                          <p className="font-medium">{getPlayerDisplayName(player)}</p>
                          <p className="text-xs text-slate-500">
                            DNI: {player.dni ? player.dni : "pendiente"} | Puntaje: {player.score ?? "N/A"}
                          </p>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Vista previa de la pareja */}
            {selectedPlayers.player1 && selectedPlayers.player2 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <div className="flex items-center gap-2 text-green-800 mb-2">
                  <CheckCircle className="h-4 w-4" />
                  <p className="font-medium">Pareja lista para crear:</p>
                </div>
                <p className="text-sm text-green-700">
                  <strong>{getPlayerDisplayName(selectedPlayers.player1)}</strong> + <strong>{getPlayerDisplayName(selectedPlayers.player2)}</strong>
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPairPlayersDialogOpen(false)
                setSelectedPlayers({ player1: null, player2: null })
              }}
              disabled={isPairing}
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePairPlayers}
              disabled={!selectedPlayers.player1 || !selectedPlayers.player2 || isPairing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isPairing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Emparejando...
                </>
              ) : (
                <>
                  <Users className="mr-2 h-4 w-4" />
                  Crear Pareja
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo para eliminar jugador */}
      <Dialog open={deletePlayerDialogOpen} onOpenChange={setDeletePlayerDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              ¿Eliminar jugador del torneo?
            </DialogTitle>
            <DialogDescription>
              Esta acción eliminará permanentemente al jugador del torneo. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          {playerToDelete && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <h4 className="font-medium text-red-900 mb-2">Datos del jugador a eliminar:</h4>
              <div className="space-y-1 text-sm text-red-800">
                <p><strong>Nombre:</strong> {getPlayerDisplayName(playerToDelete)}</p>
                <p><strong>DNI:</strong> {playerToDelete.dni || "Pendiente"}</p>
                <p><strong>Teléfono:</strong> {playerToDelete.phone || "No especificado"}</p>
                <p><strong>Puntaje:</strong> {playerToDelete.score ?? "No especificado"}</p>
              </div>
            </div>
          )}

          {playerToDelete && canManageTournament && isTpeLateCancellationWindow && (
            <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Checkbox checked={recordLateWithdrawal} onCheckedChange={(checked) => setRecordLateWithdrawal(checked === true)} />
              <span>
                <strong className="block">Faltan menos de 3 horas para el torneo.</strong>
                ¿Deseás aplicar una marca de baja tardía a este jugador?
              </span>
            </label>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeletePlayerDialogOpen(false)
                setPlayerToDelete(null)
              }}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDeletePlayer}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación para inscribirse */}
      <Dialog open={showRegisterConfirmation} onOpenChange={setShowRegisterConfirmation}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-600" />
              ¿Confirmar inscripción?
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que quieres inscribirte como jugador individual en este torneo?
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <h4 className="font-medium text-green-900 mb-2">Detalles de la inscripción:</h4>
            <div className="space-y-1 text-sm text-green-800">
              <p><strong>Modalidad:</strong> Jugador individual</p>
              <p><strong>Podrás:</strong> Ser emparejado automáticamente por el club organizador</p>
              <p><strong>Nota:</strong> También puedes inscribirte en pareja desde la pestaña "Parejas"</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRegisterConfirmation(false)}
              disabled={isRegisteringMyself}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRegisterMyself}
              disabled={isRegisteringMyself}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isRegisteringMyself ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inscribiéndome...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Confirmar inscripción
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación para cancelar inscripción */}
      <Dialog open={showCancelConfirmation} onOpenChange={setShowCancelConfirmation}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              ¿Cancelar tu inscripción?
            </DialogTitle>
            <DialogDescription>
              {isTpeLateCancellationWindow
                ? "Faltan menos de 3 horas para que comience el torneo. Si confirmás la baja, deberás abonar de igual forma el 50% de la inscripción. ¿Estás seguro de dar la baja?"
                : "¿Estás seguro de que quieres cancelar tu inscripción en este torneo? Esta acción no se puede deshacer."}
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <h4 className="font-medium text-red-900 mb-2">Consecuencias de cancelar:</h4>
            <div className="space-y-1 text-sm text-red-800">
              <p>• Perderás tu lugar en el torneo</p>
              <p>• Si ya fuiste emparejado, tu compañero quedará sin pareja</p>
              <p>• Tendrás que volver a inscribirte si cambias de opinión</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCancelConfirmation(false)}
              disabled={isCancelingMyself}
            >
              Mantener inscripción
            </Button>
            <Button
              onClick={handleCancelMyself}
              disabled={isCancelingMyself}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isCancelingMyself ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelando...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cancelar inscripción
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo para inscribir pareja */}
      <Dialog open={registerCoupleDialogOpen} onOpenChange={setRegisterCoupleDialogOpen}>
        <DialogContent className={isPlayer ? "sm:max-w-[800px] max-h-[90vh] overflow-y-auto" : "sm:max-w-[1000px] max-h-[95vh] overflow-y-auto"}>
          <DialogHeader>
            <DialogTitle>
              {isPlayer ? "Inscripción en Pareja" : "Inscripción de Parejas"}
            </DialogTitle>
            <DialogDescription>
              {isPlayer 
                ? "Registra una pareja para el torneo" 
                : "Registre parejas de manera flexible: combine jugadores nuevos y existentes según sus necesidades"
              }
            </DialogDescription>
          </DialogHeader>
          
          {isPlayer ? (
            <RegisterCoupleForm
              tournamentId={tournamentId}
              onComplete={handleRegisterCoupleSuccess}
              players={allPlayers}
              tournamentGender={tournamentGender}
              transferConfig={{
                enabled: enableTransferProof,
                alias: transferAlias,
                amount: transferAmount,
              }}
            />
          ) : (
            <CoupleRegistrationAdvanced
              tournamentId={tournamentId}
              onComplete={handleRegisterCoupleSuccess}
              players={allPlayers}
              isClubMode={true}
              userPlayerId={userDetails?.player_id || null}
              tournamentGender={tournamentGender}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo de autenticación requerida */}
      <AuthRequiredDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        title="Necesitas iniciar sesión"
        description="Para inscribirte en el torneo necesitas tener una cuenta activa como jugador."
        actionText="inscribirte"
        registerHref={registerHref}
        loginHref={loginHref}
      />

      {/* Diálogo de detalles del jugador */}
      {selectedPlayerId && (
        <PlayerDetailsDialog
          open={playerDetailsDialogOpen}
          onOpenChange={handlePlayerDetailsClose}
          playerId={selectedPlayerId}
          tournamentId={tournamentId}
          isOwner={hasManagementPermissions}
          onPlayerUpdate={handlePlayerDetailsUpdate}
        />
      )}
    </>
  )
}
