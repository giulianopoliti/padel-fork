"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { User, UserPlus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import AuthRequiredDialog from "@/components/tournament/auth-required-dialog"
import RegisterPlayerForm from "@/components/tournament/player/register-player-form"
import RegisterCoupleForm from "@/components/tournament/player/register-couple-form"
import { useUser } from "@/contexts/user-context"
import { Gender } from "@/types"
import { useToast } from "@/components/ui/use-toast"
import { getTenantBranding } from "@/config/tenant"

interface PublicRegistrationLauncherProps {
  tournamentId: string
  tournamentName: string
  tournamentGender: Gender
  tournamentPrice?: string | number | null
  enableTransferProof?: boolean
  transferAlias?: string | null
  transferAmount?: number | null
  buttonLabel?: string
  buttonClassName?: string
  fullWidth?: boolean
  requireTermsAcceptance?: boolean
}

export default function PublicRegistrationLauncher({
  tournamentId,
  tournamentName,
  tournamentGender,
  tournamentPrice = null,
  enableTransferProof = false,
  transferAlias = null,
  transferAmount = null,
  buttonLabel = "Inscribirme",
  buttonClassName,
  fullWidth = false,
  requireTermsAcceptance = getTenantBranding().key === "padel-elite",
}: PublicRegistrationLauncherProps) {
  const coupleOnlyMode = enableTransferProof
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"couple" | "individual">("couple")
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, userDetails, authState, refreshUserDetails } = useUser()
  const { toast } = useToast()

  const redirectBase = useMemo(() => `/tournaments/${tournamentId}`, [tournamentId])

  useEffect(() => {
    const intent = searchParams.get("intent")

    if (!user || !intent) {
      return
    }

    if (authState === "session-only") {
      void refreshUserDetails(user)
      return
    }

    if (authState !== "ready" || userDetails?.role !== "PLAYER" || !userDetails?.player_id) {
      return
    }

    if (intent === "individual" || intent === "couple") {
      setActiveTab(coupleOnlyMode ? "couple" : intent)
      setRegisterDialogOpen(true)

      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.delete("intent")
      const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname
      router.replace(nextUrl, { scroll: false })
    }
  }, [authState, coupleOnlyMode, pathname, refreshUserDetails, router, searchParams, user, userDetails?.player_id, userDetails?.role])

  const registerHref = `/register?role=PLAYER&redirectTo=${encodeURIComponent(redirectBase)}&intent=${activeTab}`
  const loginHref = `/login?role=PLAYER&redirectTo=${encodeURIComponent(redirectBase)}&intent=${activeTab}`

  const handleOpen = async () => {
    if (!user) {
      setAuthDialogOpen(true)
      return
    }

    const resolvedUserDetails =
      authState === "ready" && userDetails?.id === user.id
        ? userDetails
        : await refreshUserDetails(user)

    if (!resolvedUserDetails) {
      toast({
        title: "Estamos preparando tu cuenta",
        description: "La sesión se abrió, pero todavía estamos cargando tu perfil. Intenta nuevamente en unos segundos.",
      })
      return
    }

    if (resolvedUserDetails.role !== "PLAYER" || !resolvedUserDetails.player_id) {
      toast({
        title: "Perfil requerido",
        description: "Debes ingresar con una cuenta de jugador para inscribirte.",
        variant: "destructive",
      })
      return
    }

    if (coupleOnlyMode) {
      setActiveTab("couple")
    }

    setRegisterDialogOpen(true)
  }

  const handleRegistrationComplete = (success: boolean) => {
    if (!success) {
      setRegisterDialogOpen(false)
      return
    }

    setRegisterDialogOpen(false)
    window.location.assign(redirectBase)
  }

  return (
    <>
      <Button
        onClick={handleOpen}
        className={[fullWidth ? "w-full" : "", buttonClassName || ""].filter(Boolean).join(" ")}
        size="lg"
      >
        <UserPlus className="mr-2 h-4 w-4" />
        {buttonLabel}
      </Button>

      <Dialog open={registerDialogOpen} onOpenChange={setRegisterDialogOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inscripción al torneo</DialogTitle>
            <DialogDescription>
              {coupleOnlyMode
                ? `Este torneo requiere inscripción en pareja con transferencia y comprobante para ${tournamentName}.`
                : `Completa tu inscripción individual o en pareja para ${tournamentName}.`}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "couple" | "individual")} className="w-full">
            <TabsList className={`grid w-full ${coupleOnlyMode ? "grid-cols-1" : "grid-cols-2"}`}>
              <TabsTrigger value="couple" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Pareja
              </TabsTrigger>
              {!coupleOnlyMode && (
                <TabsTrigger value="individual" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Individual
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="couple" className="mt-4">
              <RegisterCoupleForm
                tournamentId={tournamentId}
                onComplete={handleRegistrationComplete}
                players={[]}
                tournamentGender={tournamentGender}
                transferConfig={{
                  enabled: enableTransferProof,
                  alias: transferAlias,
                  amount: transferAmount,
                }}
                requireTermsAcceptance={requireTermsAcceptance}
              />
            </TabsContent>

            {!coupleOnlyMode && (
              <TabsContent value="individual" className="mt-4">
                <RegisterPlayerForm
                  tournamentId={tournamentId}
                  tournament={{
                    id: tournamentId,
                    name: tournamentName,
                    price: tournamentPrice ? Number(tournamentPrice) : null,
                  }}
                  onComplete={handleRegistrationComplete}
                  requireTermsAcceptance={requireTermsAcceptance}
                />
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      <AuthRequiredDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        title="Necesitas iniciar sesión"
        description="Para inscribirte en el torneo necesitas una cuenta de jugador."
        actionText="inscribirte"
        registerHref={registerHref}
        loginHref={loginHref}
      />
    </>
  )
}
