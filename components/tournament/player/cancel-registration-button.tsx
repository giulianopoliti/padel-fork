"use client"

import { useState } from "react"
import { Loader2, UserMinus } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useUser } from "@/contexts/user-context"
import { removeCoupleFromTournament, removePlayerFromTournament } from "@/app/api/tournaments/actions"
import { getTenantBranding } from "@/config/tenant"
import { toast } from "@/components/ui/use-toast"

interface CancelRegistrationButtonProps {
  tournamentId: string
  tournamentName: string
  coupleId?: string | null
  tournamentType?: string | null
  tournamentStartDate?: string | null
  className?: string
  onCancelled?: () => void
}

export default function CancelRegistrationButton({
  tournamentId,
  tournamentName,
  coupleId = null,
  tournamentType = null,
  tournamentStartDate = null,
  className,
  onCancelled,
}: CancelRegistrationButtonProps) {
  const router = useRouter()
  const { userDetails } = useUser()
  const [open, setOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const millisecondsUntilStart = tournamentStartDate
    ? new Date(tournamentStartDate).getTime() - Date.now()
    : null
  const isTpeLateCancellation = getTenantBranding().key === "padel-elite"
    && tournamentType === "AMERICAN"
    && millisecondsUntilStart !== null
    && millisecondsUntilStart >= 0
    && millisecondsUntilStart < 3 * 60 * 60 * 1000

  const handleCancelRegistration = async () => {
    if (!userDetails?.player_id) {
      toast({
        title: "Perfil requerido",
        description: "Debes estar logueado como jugador para cancelar tu inscripción.",
        variant: "destructive",
      })
      return
    }

    setIsCancelling(true)

    try {
      const result = coupleId
        ? await removeCoupleFromTournament(tournamentId, coupleId)
        : await removePlayerFromTournament(tournamentId, userDetails.player_id)

      if (!result.success) {
        toast({
          title: "Error al cancelar inscripción",
          description: result.message || "No se pudo cancelar tu inscripción.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Inscripción cancelada",
        description: "Tu inscripción fue cancelada exitosamente.",
      })

      setOpen(false)
      onCancelled?.()
      router.refresh()
    } catch (error) {
      console.error("[CancelRegistrationButton] Error cancelling registration:", error)
      toast({
        title: "Error inesperado",
        description: "Ocurrió un error al cancelar tu inscripción.",
        variant: "destructive",
      })
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={className}
          disabled={isCancelling}
        >
          {isCancelling ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserMinus className="mr-2 h-4 w-4" />
          )}
          Cancelar inscripción
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar tu inscripción?</AlertDialogTitle>
          <AlertDialogDescription>
            {isTpeLateCancellation
              ? "Faltan menos de 3 horas para que comience el torneo. Si confirmás la baja, deberás abonar de igual forma el 50% de la inscripción. ¿Estás seguro de dar la baja?"
              : coupleId
              ? `Se cancelará tu inscripción en pareja para "${tournamentName}". Esta acción no se puede deshacer.`
              : `Se cancelará tu inscripción para "${tournamentName}". Esta acción no se puede deshacer.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCancelling}>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              void handleCancelRegistration()
            }}
            className="bg-red-600 hover:bg-red-700"
            disabled={isCancelling}
          >
            {isCancelling ? "Cancelando..." : "Confirmar cancelación"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
