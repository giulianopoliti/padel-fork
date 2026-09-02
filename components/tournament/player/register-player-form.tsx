"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { registerAuthenticatedPlayerForTournament } from "@/app/api/tournaments/actions"
import { useUser } from "@/contexts/user-context"
import { Phone, UserPlus, DollarSign, User, Trophy } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { useTournamentOrganizer } from "@/hooks/use-tournament-organizer"
import OrganizerConsentDialog from "./organizer-consent-dialog"
import type { ConsentResult } from "@/types/organizer-consent"
import { createClient } from "@/utils/supabase/client"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"
import { TPE_TERMS_PATH } from "@/lib/tpe/terms"

interface Tournament {
  id: string
  name: string
  price?: number | null
}

interface RegisterPlayerFormProps {
  tournamentId: string
  tournament?: Tournament
  onComplete: (success: boolean) => void
  requireTermsAcceptance?: boolean
}

export default function RegisterPlayerForm({ tournamentId, tournament, onComplete, requireTermsAcceptance = false }: RegisterPlayerFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConsentDialog, setShowConsentDialog] = useState(false)
  const [consentResult, setConsentResult] = useState<ConsentResult | null>(null)
  const [pendingPhone, setPendingPhone] = useState("")
  const [phone, setPhone] = useState("")
  const [termsAccepted, setTermsAccepted] = useState(false)

  const { user: contextUser, userDetails } = useUser()
  const { organizador, hasOrganizador } = useTournamentOrganizer(tournamentId)

  useEffect(() => {
    if (!userDetails?.player_id) {
      return
    }

    let cancelled = false

    const loadPlayerPhone = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("players")
        .select("phone")
        .eq("id", userDetails.player_id)
        .maybeSingle()

      if (error) {
        console.error("[RegisterPlayerForm] Error loading player phone:", error)
        return
      }

      if (cancelled) {
        return
      }

      const storedPhone = data?.phone?.trim() || ""
      if (!storedPhone) {
        return
      }

      setPhone((currentValue) => (currentValue.trim().length > 0 ? currentValue : storedPhone))
    }

    void loadPlayerPhone()

    return () => {
      cancelled = true
    }
  }, [userDetails?.player_id])

  const validatePhone = (value: string) => {
    const normalizedValue = value.trim()
    if (normalizedValue.length < 6) {
      toast({
        title: "Telefono requerido",
        description: "Ingresa un numero de telefono valido de al menos 6 caracteres.",
        variant: "destructive",
      })
      return null
    }

    return normalizedValue
  }

  const executeRegistration = async (phoneValue: string) => {
    setIsSubmitting(true)

    try {
      const result = await registerAuthenticatedPlayerForTournament(tournamentId, phoneValue, termsAccepted)

      if (result.success) {
        if (consentResult) {
          console.log(
            `[RegisterPlayerForm] Registro exitoso con consentimiento para organizador: ${consentResult.organizadorId}`
          )
        }

        toast({
          title: "Registro exitoso",
          description: "Te has registrado correctamente en el torneo",
        })
        onComplete(true)
      } else {
        toast({
          title: "Error en el registro",
          description: result.message || "No se pudo completar el registro",
          variant: "destructive",
        })
        onComplete(false)
      }
    } catch (error) {
      console.error("Error al registrar jugador:", error)
      toast({
        title: "Error inesperado",
        description: "Ocurrio un error al procesar tu solicitud",
        variant: "destructive",
      })
      onComplete(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (!contextUser) {
      toast({
        title: "Error de autenticacion",
        description: "Debes iniciar sesion para registrarte",
        variant: "destructive",
      })
      return
    }

    if (!userDetails?.player_id) {
      toast({
        title: "Error de perfil",
        description: "No se pudo obtener tu informacion de jugador. Verifica tu perfil.",
        variant: "destructive",
      })
      return
    }

    if (requireTermsAcceptance && !termsAccepted) {
      toast({ title: "Términos requeridos", description: "Debes aceptar los Términos y Condiciones para inscribirte.", variant: "destructive" })
      return
    }

    const normalizedPhone = validatePhone(phone)
    if (!normalizedPhone) {
      return
    }

    if (hasOrganizador && organizador && !consentResult) {
      console.log("[RegisterPlayerForm] Torneo con organizador detectado - solicitando consentimiento")
      setPendingPhone(normalizedPhone)
      setShowConsentDialog(true)
      return
    }

    await executeRegistration(normalizedPhone)
  }

  const formatPrice = (price: number | null | undefined) => {
    if (!price) return "Gratuito"
    return `$${price.toLocaleString()}`
  }

  const handleConsentAccept = () => {
    if (!organizador) return

    const consent: ConsentResult = {
      accepted: true,
      organizadorId: organizador.id,
      timestamp: new Date().toISOString(),
    }

    setConsentResult(consent)
    setShowConsentDialog(false)

    if (pendingPhone) {
      void executeRegistration(pendingPhone)
      setPendingPhone("")
    }
  }

  const handleConsentReject = () => {
    console.log("[RegisterPlayerForm] Usuario rechazo consentimiento de organizador")
    setShowConsentDialog(false)
    setPendingPhone("")

    toast({
      title: "Registro cancelado",
      description: "No puedes inscribirte sin aceptar la gestion de datos por el organizador",
      variant: "destructive",
    })
  }

  return (
    <Card className="w-full max-w-md mx-auto bg-white border border-gray-200 shadow-sm">
      <CardHeader className="text-center pb-4">
        <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <UserPlus className="h-6 w-6 text-blue-600" />
        </div>
        <CardTitle className="text-xl font-semibold text-gray-900">Registro Individual</CardTitle>
        {tournament && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-center text-sm text-gray-600">
              <Trophy className="h-4 w-4 mr-1" />
              {tournament.name}
            </div>
            <div className="flex items-center justify-center">
              <DollarSign className="h-4 w-4 mr-1 text-green-600" />
              <span className="text-lg font-medium text-green-600">{formatPrice(tournament.price)}</span>
            </div>
          </div>
        )}
        <p className="text-sm text-gray-600 mt-3">
          Confirma tu registro con tu numero de telefono para que el club pueda contactarte
        </p>
      </CardHeader>

      <CardContent>
        <div className="mb-6 p-3 bg-gray-50 rounded-surface border border-gray-200">
          <div className="flex items-center text-sm text-gray-600 mb-1">
            <User className="h-4 w-4 mr-1" />
            Registrandose como:
          </div>
          <div className="font-medium text-gray-800">{userDetails?.email || contextUser?.email || "Usuario"}</div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label htmlFor="player-phone" className="text-sm font-medium text-gray-700">
              <Phone className="h-4 w-4 inline mr-1" />
              Numero de telefono
            </label>
            <Input
              id="player-phone"
              placeholder="Ej: 1123456789"
              className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              El club utilizara este numero para contactarte sobre el torneo
            </p>
          </div>

          {requireTermsAcceptance && (
            <label className="flex cursor-pointer items-start gap-2 rounded-surface border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <Checkbox checked={termsAccepted} onCheckedChange={(checked) => setTermsAccepted(checked === true)} />
              <span>
                Leí y acepto los <Link href={TPE_TERMS_PATH} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">Términos y Condiciones</Link>.
              </span>
            </label>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onComplete(false)}
              disabled={isSubmitting}
              className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || (requireTermsAcceptance && !termsAccepted)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? "Registrando..." : "Confirmar registro"}
            </Button>
          </div>
        </form>
      </CardContent>

      {showConsentDialog && organizador && tournament && (
        <OrganizerConsentDialog
          open={showConsentDialog}
          organizador={organizador}
          tournamentName={tournament.name}
          onAccept={handleConsentAccept}
          onReject={handleConsentReject}
          isLoading={isSubmitting}
        />
      )}
    </Card>
  )
}
