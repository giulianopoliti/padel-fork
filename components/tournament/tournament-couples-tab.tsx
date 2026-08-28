"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { PlusCircle, Search, Trash2, Loader2, CheckCircle2, X, DollarSign, CircleHelp } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/use-toast"
import CoupleRegistrationAdvanced from "@/components/tournament/couple-registration-advanced"
import { Gender } from "@/types"
import RegisterCoupleForm from "@/components/tournament/player/register-couple-form"
import { removeCoupleFromTournament, approveInscription, rejectInscription, updatePlayerPaymentStatus } from "@/app/api/tournaments/actions"
import { useUser } from "@/contexts/user-context"
import AuthRequiredDialog from "@/components/tournament/auth-required-dialog"
import { useTournamentPermissions } from "@/hooks/use-tournament-permissions"
import PlayerDetailsDialog from "@/components/tournament/player-details-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import PlayerDniDisplay from "@/components/players/player-dni-display"
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

interface CoupleInfo {
  id: string
  tournament_id: string
  player_1_id: string | null
  player_2_id: string | null
  created_at: string
  player_1_info: PlayerInfo | null
  player_2_info: PlayerInfo | null
  is_pending?: boolean
  inscription_id?: string
  payment_proof_status?: 'NOT_REQUIRED' | 'PENDING_REVIEW' | 'APPROVED'
  payment_proof_uploaded_at?: string | null
  payment_alias_snapshot?: string | null
  payment_amount_snapshot?: number | null
  // Payment status for each player
  player_1_has_paid?: boolean
  player_2_has_paid?: boolean
}

interface TournamentCouplesTabProps {
  coupleInscriptions: CoupleInfo[]
  tournamentId: string
  tournamentStatus: string
  allPlayers?: PlayerInfo[]
  isOwner?: boolean
  tournamentGender: Gender
  tournamentType?: string | null
  tournamentStartDate?: string | null
  // 🚀 New registration control props
  registrationLocked?: boolean
  bracketStatus?: string
  enablePaymentCheckboxes?: boolean
  enableTransferProof?: boolean
  transferAlias?: string | null
  transferAmount?: number | null
  // 🚀 Optimistic mutations callbacks
  onCoupleAdded?: (couple: CoupleInfo) => Promise<void>
  onCoupleRemoved?: (coupleId: string) => Promise<void>
  onRefresh?: () => Promise<void>
}

export default function TournamentCouplesTab({
  coupleInscriptions,
  tournamentId,
  tournamentStatus,
  allPlayers = [],
  isOwner = false,
  tournamentGender,
  tournamentType,
  tournamentStartDate = null,
  // 🚀 New registration control props
  registrationLocked = false,
  bracketStatus = "NOT_STARTED",
  enablePaymentCheckboxes = false,
  enableTransferProof = false,
  transferAlias = null,
  transferAmount = null,
  // 🚀 Optimistic mutations
  onCoupleAdded,
  onCoupleRemoved,
  onRefresh,
}: TournamentCouplesTabProps) {
  const [registerCoupleDialogOpen, setRegisterCoupleDialogOpen] = useState(false)
  const [deleteCoupleDialogOpen, setDeleteCoupleDialogOpen] = useState(false)
  const [coupleToDelete, setCoupleToDelete] = useState<CoupleInfo | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [recordLateWithdrawal, setRecordLateWithdrawal] = useState(false)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [playerDetailsDialogOpen, setPlayerDetailsDialogOpen] = useState(false)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [coupleToReject, setCoupleToReject] = useState<CoupleInfo | null>(null)
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null)
  const [openingProofId, setOpeningProofId] = useState<string | null>(null)

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
  const isPlayer = userDetails?.role === 'PLAYER' && userDetails?.player_id
  const isClub = userDetails?.role === 'CLUB' && userDetails?.club_id
  const currentCouples = coupleInscriptions.length
  const isLoggedIn = !!user
  const registerHref = `/register?role=PLAYER&redirectTo=${encodeURIComponent(`/tournaments/${tournamentId}`)}&intent=couple`
  const loginHref = `/login?role=PLAYER&redirectTo=${encodeURIComponent(`/tournaments/${tournamentId}`)}&intent=couple`

  // Use centralized permissions instead of basic role checks
  const canManageTournament = hasManagementPermissions || isOwner
  const canRecordTpeLateWithdrawal = getTenantBranding().key === "padel-elite" && tournamentType === "AMERICAN"
  const millisecondsUntilStart = tournamentStartDate
    ? new Date(tournamentStartDate).getTime() - Date.now()
    : null
  const isTpeLateCancellationWindow = canRecordTpeLateWithdrawal
    && millisecondsUntilStart !== null
    && millisecondsUntilStart >= 0
    && millisecondsUntilStart < 3 * 60 * 60 * 1000
  const showPaymentCheckboxes = canManageTournament && enablePaymentCheckboxes
  const showTransferProof = canManageTournament && enableTransferProof

  // Use isOwner from useTournamentPermissions to show/hide player details
  const canViewPlayerDetails = isOwner

  const handleRegisterSuccess = async (success?: boolean | CoupleInfo) => {
    setRegisterCoupleDialogOpen(false)

    if (success) {
      // 🚀 Try SWR refresh first, fallback to page reload
      if (onRefresh) {
        try {
          console.log('🔄 Attempting SWR refresh...')
          await onRefresh()
          console.log('✅ SWR refresh completed')
        } catch (error) {
          console.error('❌ SWR refresh failed:', error)
          console.log('🔄 Falling back to page reload...')
          window.location.reload()
          return
        }
      } else {
        console.log('🔄 No onRefresh function, using page reload...')
        window.location.reload()
        return
      }

      toast({
        title: "¡Pareja registrada!",
        description: "La pareja se ha inscrito exitosamente en el torneo.",
        variant: "default"
      })
    }
  }

  const handleDeleteCoupleClick = (couple: CoupleInfo) => {
    setCoupleToDelete(couple)
    setRecordLateWithdrawal(false)
    setDeleteCoupleDialogOpen(true)
  }

  const handleDeleteCouple = async () => {
    if (!coupleToDelete) return

    setIsDeleting(true)
    const isUserCouple = isUserInCouple(coupleToDelete)

    try {
      // 🚀 First: Optimistic update for immediate UI feedback
      if (onCoupleRemoved) {
        await onCoupleRemoved(coupleToDelete.id)
      }

      const result = await removeCoupleFromTournament(
        tournamentId,
        coupleToDelete.id,
        !isUserCouple && recordLateWithdrawal,
      )

      if (result.success) {
        // 🔄 Force refresh to ensure cache sync after successful deletion
        if (onRefresh) {
          try {
            await onRefresh()
          } catch (error) {
            console.warn('Failed to refresh after deletion, but deletion was successful:', error)
          }
        }

        toast({
          title: isUserCouple ? "Inscripción cancelada" : "Pareja eliminada",
          description: isUserCouple
            ? "Tu inscripción de pareja ha sido cancelada exitosamente"
            : result.message,
          variant: "default"
        })
        setDeleteCoupleDialogOpen(false)
        setCoupleToDelete(null)
      } else {
        // If server action failed, restore the optimistic update
        if (onCoupleAdded) {
          await onCoupleAdded(coupleToDelete)
        }
        toast({
          title: isUserCouple ? "Error al cancelar inscripción" : "Error al eliminar",
          description: result.message,
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error deleting couple:", error)
      // If error occurred, restore the optimistic update
      if (onCoupleAdded && coupleToDelete) {
        await onCoupleAdded(coupleToDelete)
      }
      toast({
        title: "Error inesperado",
        description: isUserCouple
          ? "Ocurrió un error al cancelar tu inscripción."
          : "Ocurrió un error al eliminar la pareja.",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const getPlayerDisplayName = (playerInfo: PlayerInfo | null) => {
    if (!playerInfo) return "—"
    const firstName = playerInfo.first_name || ""
    const lastName = playerInfo.last_name || ""
    const fullName = `${firstName} ${lastName}`.trim()
    return fullName || `Jugador ${playerInfo.id?.slice(-4) || "???"}`
  }

  // Check if the logged-in user is part of this couple
  const isUserInCouple = (couple: CoupleInfo) => {
    if (!isPlayer || !userDetails?.player_id) return false
    return couple.player_1_id === userDetails.player_id || couple.player_2_id === userDetails.player_id
  }

  const handleRegisterCoupleClick = () => {
    if (!isLoggedIn) {
      setAuthDialogOpen(true)
      return
    }

    // Check permissions: tournament managers OR players can inscribe
    if (!canManageTournament && !isPlayer) {
      toast({
        title: "Sin permisos para inscripción",
        description: "Solo los organizadores del torneo y jugadores pueden inscribir parejas.",
        variant: "destructive"
      })
      return
    }

    setRegisterCoupleDialogOpen(true)
  }

  const handlePlayerClick = (playerId: string) => {
    setSelectedPlayerId(playerId)
    setPlayerDetailsDialogOpen(true)
  }

  const handlePlayerDetailsClose = () => {
    setPlayerDetailsDialogOpen(false)
    setSelectedPlayerId(null)
  }

  const handlePlayerUpdate = async () => {
    // Refresh data after player update
    if (onRefresh) {
      await onRefresh()
    }
  }

  // Aprobar inscripcion
  const handleToggleInscriptionStatus = async (couple: CoupleInfo) => {
    if (!couple.inscription_id) return

    setUpdatingStatusId(couple.inscription_id)
    
    try {
      const result = await approveInscription(couple.inscription_id)
      
      if (result.success) {
        toast({
          title: "Inscripcion aprobada",
          description: "La inscripcion ha sido aprobada",
        })
        if (onRefresh) await onRefresh()
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudo aprobar",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Ocurrio un error",
        variant: "destructive"
      })
    } finally {
      setUpdatingStatusId(null)
    }
  }

  // Abrir dialog de confirmacion para rechazar
  const openRejectDialog = (couple: CoupleInfo) => {
    setCoupleToReject(couple)
    setRejectDialogOpen(true)
  }

  // Rechazar inscripcion (confirmado)
  const confirmRejectInscription = async () => {
    if (!coupleToReject?.inscription_id) return

    setUpdatingStatusId(coupleToReject.inscription_id)

    try {
      const result = await rejectInscription(coupleToReject.inscription_id)

      if (result.success) {
        toast({
          title: "Inscripcion rechazada",
          description: "La inscripcion ha sido rechazada",
        })
        if (onRefresh) await onRefresh()
        setRejectDialogOpen(false)
        setCoupleToReject(null)
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudo rechazar",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Ocurrio un error",
        variant: "destructive"
      })
    } finally {
      setUpdatingStatusId(null)
    }
  }

  // Actualizar estado de pago de un jugador
  const handlePaymentToggle = async (couple: CoupleInfo, playerId: string, playerNumber: 1 | 2, currentStatus: boolean) => {
    if (!couple.inscription_id || !playerId) return
    
    const uniqueId = `${couple.inscription_id}-${playerId}`
    setUpdatingPaymentId(uniqueId)
    
    try {
      const result = await updatePlayerPaymentStatus(couple.inscription_id, playerId, !currentStatus)
      
      if (result.success) {
        toast({
          title: currentStatus ? "Pago desmarcado" : "Pago registrado",
          description: `Se actualizo el estado de pago del jugador ${playerNumber}`,
        })
        if (onRefresh) await onRefresh()
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudo actualizar el pago",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Ocurrio un error al actualizar el pago",
        variant: "destructive"
      })
    } finally {
      setUpdatingPaymentId(null)
    }
  }

  const handleOpenProof = async (inscriptionId: string) => {
    setOpeningProofId(inscriptionId)

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/inscriptions/${inscriptionId}/proof`)
      const result = await response.json()

      if (!response.ok || !result.success || !result.url) {
        throw new Error(result.message || 'No se pudo abrir el comprobante')
      }

      window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error('[TournamentCouplesTab] Error opening proof:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo abrir el comprobante',
        variant: 'destructive'
      })
    } finally {
      setOpeningProofId(null)
    }
  }

  const formatMoney = (amount?: number | null) => {
    if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return 'Sin monto'
    return `$${Number(amount).toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`
  }

  const getProofBadgeClasses = (status?: CoupleInfo['payment_proof_status']) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-700 border-green-200'
      case 'PENDING_REVIEW':
        return 'bg-amber-100 text-amber-700 border-amber-200'
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200'
    }
  }

  const getProofBadgeText = (status?: CoupleInfo['payment_proof_status']) => {
    switch (status) {
      case 'APPROVED':
        return 'Aprobado'
      case 'PENDING_REVIEW':
        return 'Pendiente'
      default:
        return 'No requerido'
    }
  }

  return (
    <>
      <div className="p-6 border-b border-gray-200 bg-slate-50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Parejas Inscritas</h3>
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{currentCouples}</span> parejas inscritas en el torneo
            </p>
          </div>

          {!isRegistrationBlocked && (canManageTournament || isPlayer) && (
            <Button
              onClick={handleRegisterCoupleClick}
              className="bg-slate-900 hover:bg-slate-800 text-white py-3 sm:py-2"
              size="default"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Inscribir Pareja
            </Button>
          )}
        </div>
      </div>

      <div className="p-6">
        {coupleInscriptions.length > 0 ? (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="border-b border-gray-200">
                  <TableHead className="font-semibold text-slate-700">Jugador 1</TableHead>
                  {canViewPlayerDetails && (
                    <TableHead className="font-semibold text-slate-700 text-center">DNI</TableHead>
                  )}
                  <TableHead className="font-semibold text-slate-700 text-center">Puntaje</TableHead>
                  {showPaymentCheckboxes && (
                    <TableHead className="font-semibold text-slate-700 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Pago
                      </div>
                    </TableHead>
                  )}
                  <TableHead className="font-semibold text-slate-700">Jugador 2</TableHead>
                  {canViewPlayerDetails && (
                    <TableHead className="font-semibold text-slate-700 text-center">DNI</TableHead>
                  )}
                  <TableHead className="font-semibold text-slate-700 text-center">Puntaje</TableHead>
                  {showPaymentCheckboxes && (
                    <TableHead className="font-semibold text-slate-700 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Pago
                      </div>
                    </TableHead>
                  )}
                  {showTransferProof && (
                    <TableHead className="font-semibold text-slate-700 text-center">Comprobante</TableHead>
                  )}
                  {canManageTournament && (
                    <TableHead className="font-semibold text-slate-700 text-center">Estado</TableHead>
                  )}
                  {!isRegistrationBlocked && (
                    <TableHead className="font-semibold text-slate-700 text-center">Acciones</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupleInscriptions.map((couple, index) => (
                  <TableRow key={couple.id || `couple-${index}`} className="hover:bg-slate-50 border-b border-gray-100">
                    <TableCell className="font-medium text-slate-900">
                      {canViewPlayerDetails && couple.player_1_info?.id ? (
                        <button
                          onClick={() => handlePlayerClick(couple.player_1_info!.id)}
                          className="hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                        >
                          {getPlayerDisplayName(couple.player_1_info)}
                        </button>
                      ) : (
                        getPlayerDisplayName(couple.player_1_info)
                      )}
                      {isOwner && (couple.player_1_info?.late_withdrawal_count || 0) > 0 && (
                        <span title={`Historial de bajas tardías: ${couple.player_1_info?.late_withdrawal_count}`} className="ml-2 inline-flex align-middle text-amber-600"><CircleHelp className="h-4 w-4" /></span>
                      )}
                    </TableCell>
                    {canViewPlayerDetails && (
                      <TableCell className="text-center text-slate-600 text-sm">
                        <PlayerDniDisplay dni={couple.player_1_info?.dni} className="text-slate-600 text-sm" />
                      </TableCell>
                    )}
                    <TableCell className="text-center">
                      {couple.player_1_info?.score !== null && couple.player_1_info?.score !== undefined ? (
                        <div className="inline-flex items-center justify-center bg-slate-100 text-slate-700 font-semibold rounded-full h-8 w-8 border border-slate-200">
                          {couple.player_1_info.score}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    {showPaymentCheckboxes && (
                      <TableCell className="text-center">
                        {/* Solo mostrar checkbox de pago si la inscripcion esta aprobada */}
                        {!couple.is_pending && couple.inscription_id && couple.player_1_id ? (
                          <div className="flex items-center justify-center">
                            {updatingPaymentId === `${couple.inscription_id}-${couple.player_1_id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                            ) : (
                              <Checkbox
                                checked={couple.player_1_has_paid ?? false}
                                onCheckedChange={() => {
                                  const playerId = couple.player_1_id
                                  if (playerId) {
                                    handlePaymentToggle(couple, playerId, 1, couple.player_1_has_paid ?? false)
                                  }
                                }}
                                className={couple.player_1_has_paid 
                                  ? "border-green-500 bg-green-500 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500" 
                                  : "border-slate-300"
                                }
                                aria-label={`Pago jugador 1: ${couple.player_1_has_paid ? 'Pagado' : 'No pagado'}`}
                              />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="font-medium text-slate-900">
                      {canViewPlayerDetails && couple.player_2_info?.id ? (
                        <button
                          onClick={() => handlePlayerClick(couple.player_2_info!.id)}
                          className="hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                        >
                          {getPlayerDisplayName(couple.player_2_info)}
                        </button>
                      ) : (
                        getPlayerDisplayName(couple.player_2_info)
                      )}
                      {isOwner && (couple.player_2_info?.late_withdrawal_count || 0) > 0 && (
                        <span title={`Historial de bajas tardías: ${couple.player_2_info?.late_withdrawal_count}`} className="ml-2 inline-flex align-middle text-amber-600"><CircleHelp className="h-4 w-4" /></span>
                      )}
                    </TableCell>
                    {canViewPlayerDetails && (
                      <TableCell className="text-center text-slate-600 text-sm">
                        <PlayerDniDisplay dni={couple.player_2_info?.dni} className="text-slate-600 text-sm" />
                      </TableCell>
                    )}
                    <TableCell className="text-center">
                      {couple.player_2_info?.score !== null && couple.player_2_info?.score !== undefined ? (
                        <div className="inline-flex items-center justify-center bg-slate-100 text-slate-700 font-semibold rounded-full h-8 w-8 border border-slate-200">
                          {couple.player_2_info.score}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    {showPaymentCheckboxes && (
                      <TableCell className="text-center">
                        {/* Solo mostrar checkbox de pago si la inscripcion esta aprobada */}
                        {!couple.is_pending && couple.inscription_id && couple.player_2_id ? (
                          <div className="flex items-center justify-center">
                            {updatingPaymentId === `${couple.inscription_id}-${couple.player_2_id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                            ) : (
                              <Checkbox
                                checked={couple.player_2_has_paid ?? false}
                                onCheckedChange={() => {
                                  const playerId = couple.player_2_id
                                  if (playerId) {
                                    handlePaymentToggle(couple, playerId, 2, couple.player_2_has_paid ?? false)
                                  }
                                }}
                                className={couple.player_2_has_paid 
                                  ? "border-green-500 bg-green-500 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500" 
                                  : "border-slate-300"
                                }
                                aria-label={`Pago jugador 2: ${couple.player_2_has_paid ? 'Pagado' : 'No pagado'}`}
                              />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </TableCell>
                    )}
                    {showTransferProof && (
                      <TableCell className="text-center">
                        <div className="space-y-2">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getProofBadgeClasses(couple.payment_proof_status)}`}>
                            {getProofBadgeText(couple.payment_proof_status)}
                          </span>
                          <div className="text-xs text-slate-600">
                            <div>{couple.payment_alias_snapshot || "Sin alias"}</div>
                            <div>{formatMoney(couple.payment_amount_snapshot)}</div>
                          </div>
                          {couple.inscription_id &&
                            couple.payment_proof_status &&
                            couple.payment_proof_status !== 'NOT_REQUIRED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenProof(couple.inscription_id!)}
                              disabled={openingProofId === couple.inscription_id}
                            >
                              {openingProofId === couple.inscription_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Ver'
                              )}
                            </Button>
                            )}
                        </div>
                      </TableCell>
                    )}
                    {canManageTournament && (
                      <TableCell className="text-center">
                        {couple.is_pending && couple.inscription_id ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRejectDialog(couple)}
                              disabled={updatingStatusId === couple.inscription_id}
                              className="h-8 w-8 p-0 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
                              title="Rechazar"
                            >
                              {updatingStatusId === couple.inscription_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleToggleInscriptionStatus(couple)}
                              disabled={updatingStatusId === couple.inscription_id}
                              className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white"
                            >
                              {updatingStatusId === couple.inscription_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Aprobar
                                </>
                              )}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-green-600 text-sm">Aprobada</span>
                        )}
                      </TableCell>
                    )}
                    {!isRegistrationBlocked && (
                      <TableCell className="text-center">
                        <div className="flex gap-2 justify-center">
                          {/* Show "Cancel my registration" button if user is part of this couple */}
                          {isUserInCouple(couple) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteCoupleClick(couple)}
                              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200"
                            >
                              Cancelar mi inscripción
                            </Button>
                          )}
                          
                          {/* Show admin delete button for clubs and organizadores with permissions */}
                          {canManageTournament && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteCoupleClick(couple)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No hay parejas inscritas</h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6">
              Aún no hay parejas inscritas en este torneo. Comienza agregando la primera pareja.
            </p>

          </div>
        )}
      </div>

      {/* Diálogo para inscribir pareja */}
      <Dialog open={registerCoupleDialogOpen} onOpenChange={setRegisterCoupleDialogOpen}>
        <DialogContent className={isPlayer ? "sm:max-w-[800px] max-h-[90vh] overflow-y-auto" : "sm:max-w-[1000px] max-h-[95vh] overflow-y-auto"}>
          <DialogHeader>
            <DialogTitle>
              {isPlayer ? "Inscripción en Pareja" : "Sistema Avanzado de Inscripción de Parejas"}
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
              onComplete={handleRegisterSuccess}
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
              onComplete={handleRegisterSuccess}
              players={allPlayers}
              isClubMode={true}
              userPlayerId={null}
              tournamentGender={tournamentGender}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo para eliminar pareja */}
      <Dialog open={deleteCoupleDialogOpen} onOpenChange={setDeleteCoupleDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              {coupleToDelete && isUserInCouple(coupleToDelete) 
                ? "¿Cancelar tu inscripción de pareja?" 
                : "¿Eliminar pareja del torneo?"
              }
            </DialogTitle>
            <DialogDescription>
              {coupleToDelete && isUserInCouple(coupleToDelete) && isTpeLateCancellationWindow
                ? "Faltan menos de 3 horas para que comience el torneo. Si confirmás la baja, deberás abonar de igual forma el 50% de la inscripción. ¿Estás seguro de dar la baja?"
                : coupleToDelete && isUserInCouple(coupleToDelete)
                ? "Esta acción cancelará tu inscripción como pareja en este torneo. No se puede deshacer."
                : "Esta acción eliminará permanentemente a la pareja del torneo. No se puede deshacer."
              }
            </DialogDescription>
          </DialogHeader>

          {coupleToDelete && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <h4 className="font-medium text-red-900 mb-2">Datos de la pareja a eliminar:</h4>
              <div className="space-y-2 text-sm text-red-800">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium">Jugador 1:</p>
                    <p>{getPlayerDisplayName(coupleToDelete.player_1_info)}</p>
                    <p className="text-xs">
                      Puntaje: {coupleToDelete.player_1_info?.score ?? "No especificado"}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">Jugador 2:</p>
                    <p>{getPlayerDisplayName(coupleToDelete.player_2_info)}</p>
                    <p className="text-xs">
                      Puntaje: {coupleToDelete.player_2_info?.score ?? "No especificado"}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-red-300">
                  <p><strong>Pareja formada:</strong> {getPlayerDisplayName(coupleToDelete.player_1_info)} + {getPlayerDisplayName(coupleToDelete.player_2_info)}</p>
                </div>
              </div>
            </div>
          )}

          {coupleToDelete && canManageTournament && isTpeLateCancellationWindow && !isUserInCouple(coupleToDelete) && (
            <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Checkbox checked={recordLateWithdrawal} onCheckedChange={(checked) => setRecordLateWithdrawal(checked === true)} />
              <span>
                <strong className="block">Faltan menos de 3 horas para el torneo.</strong>
                ¿Deseás aplicar una marca de baja tardía a ambos jugadores?
              </span>
            </label>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteCoupleDialogOpen(false)
                setCoupleToDelete(null)
              }}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDeleteCouple}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {coupleToDelete && isUserInCouple(coupleToDelete) ? "Cancelando..." : "Eliminando..."}
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {coupleToDelete && isUserInCouple(coupleToDelete) ? "Cancelar Inscripción" : "Eliminar"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de autenticación requerida */}
      <AuthRequiredDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        title="Necesitas iniciar sesión"
        description="Para inscribir una pareja en el torneo necesitas tener una cuenta activa."
        actionText="inscribir una pareja"
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
          isOwner={isOwner}
          onPlayerUpdate={handlePlayerUpdate}
        />
      )}

      {/* Diálogo de confirmación para rechazar inscripción */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro que deseas rechazar esta inscripción?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción rechazará permanentemente la inscripción de la siguiente pareja:
            </AlertDialogDescription>
          </AlertDialogHeader>

          {coupleToReject && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md">
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium text-slate-700">Jugador 1:</p>
                    <p className="text-slate-900">{getPlayerDisplayName(coupleToReject.player_1_info)}</p>
                    <p className="text-xs text-slate-600">
                      Puntaje: {coupleToReject.player_1_info?.score ?? "No especificado"}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">Jugador 2:</p>
                    <p className="text-slate-900">{getPlayerDisplayName(coupleToReject.player_2_info)}</p>
                    <p className="text-xs text-slate-600">
                      Puntaje: {coupleToReject.player_2_info?.score ?? "No especificado"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingStatusId !== null}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRejectInscription}
              disabled={updatingStatusId !== null}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {updatingStatusId !== null ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rechazando...
                </>
              ) : (
                "Rechazar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
