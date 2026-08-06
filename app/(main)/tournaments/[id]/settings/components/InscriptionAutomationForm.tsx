"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { AlertTriangle, Eye, Landmark, Loader2, Mail, Receipt, ShieldCheck } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface InscriptionAutomationFormProps {
  tournamentId: string
  initialValidateInscriptions: boolean
  initialEnablePublicInscriptions: boolean
  initialShowFewSlotsAlert: boolean
  initialEnablePaymentCheckboxes: boolean
  initialEnableTransferProof: boolean
  initialEnableTrustBasedPaymentPolicy: boolean
  initialTrustPolicyMinPlayedTournaments: number
  initialMessagesEnabled: boolean
  initialTransferAlias: string | null
  initialTransferAmount: number | null
  initialTransferAmountPerPlayer: number | null
}

type SaveState = "idle" | "saving" | "saved" | "error"

interface PersistPatch {
  validate_inscriptions?: boolean
  enable_public_inscriptions?: boolean
  show_few_slots_alert?: boolean
  enable_payment_checkboxes?: boolean
  enable_transfer_proof?: boolean
  enable_trust_based_payment_policy?: boolean
  trust_policy_min_played_tournaments?: number
  messages_enabled?: boolean
  transfer_alias?: string | null
  transfer_amount?: number | null
  transfer_amount_per_player?: number | null
}

function StatusBadge({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Guardando
      </Badge>
    )
  }

  if (state === "saved") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Guardado</Badge>
  }

  if (state === "error") {
    return <Badge variant="destructive">Error</Badge>
  }

  return <Badge variant="outline">Sin cambios</Badge>
}

function SettingCard({
  icon,
  title,
  description,
  children,
  status,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
  status: SaveState
}) {
  return (
    <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-slate-100 p-2 text-slate-700">{icon}</div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <StatusBadge state={status} />
      </div>
      {children}
    </div>
  )
}

export default function InscriptionAutomationForm({
  tournamentId,
  initialValidateInscriptions,
  initialEnablePublicInscriptions,
  initialShowFewSlotsAlert,
  initialEnablePaymentCheckboxes,
  initialEnableTransferProof,
  initialEnableTrustBasedPaymentPolicy,
  initialTrustPolicyMinPlayedTournaments,
  initialMessagesEnabled,
  initialTransferAlias,
  initialTransferAmount,
  initialTransferAmountPerPlayer,
}: InscriptionAutomationFormProps) {
  const [validateInscriptions, setValidateInscriptions] = useState(initialValidateInscriptions)
  const [enablePublicInscriptions, setEnablePublicInscriptions] = useState(initialEnablePublicInscriptions)
  const [showFewSlotsAlert, setShowFewSlotsAlert] = useState(initialShowFewSlotsAlert)
  const [enablePaymentCheckboxes, setEnablePaymentCheckboxes] = useState(initialEnablePaymentCheckboxes)
  const [enableTransferProof, setEnableTransferProof] = useState(initialEnableTransferProof)
  const [enableTrustBasedPaymentPolicy, setEnableTrustBasedPaymentPolicy] = useState(initialEnableTrustBasedPaymentPolicy)
  const [messagesEnabled, setMessagesEnabled] = useState(initialMessagesEnabled)
  const [transferAlias, setTransferAlias] = useState(initialTransferAlias || "")
  const [transferAmount, setTransferAmount] = useState(
    initialTransferAmount !== null && initialTransferAmount !== undefined ? String(initialTransferAmount) : ""
  )
  const [transferAmountPerPlayer, setTransferAmountPerPlayer] = useState(
    initialTransferAmountPerPlayer !== null && initialTransferAmountPerPlayer !== undefined
      ? String(initialTransferAmountPerPlayer)
      : ""
  )
  const [trustPolicyMinPlayedTournaments, setTrustPolicyMinPlayedTournaments] = useState(
    String(initialTrustPolicyMinPlayedTournaments || 2)
  )

  const [validationStatus, setValidationStatus] = useState<SaveState>("idle")
  const [publicStatus, setPublicStatus] = useState<SaveState>("idle")
  const [fewSlotsStatus, setFewSlotsStatus] = useState<SaveState>("idle")
  const [checkboxStatus, setCheckboxStatus] = useState<SaveState>("idle")
  const [transferToggleStatus, setTransferToggleStatus] = useState<SaveState>("idle")
  const [trustPolicyStatus, setTrustPolicyStatus] = useState<SaveState>("idle")
  const [messagesStatus, setMessagesStatus] = useState<SaveState>("idle")
  const [transferFieldsStatus, setTransferFieldsStatus] = useState<SaveState>("idle")
  const [transferFieldsError, setTransferFieldsError] = useState<string | null>(null)

  const { toast } = useToast()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydratedRef = useRef(false)
  const lastSavedTransferRef = useRef({
    alias: initialTransferAlias || "",
    amount:
      initialTransferAmount !== null && initialTransferAmount !== undefined
        ? String(initialTransferAmount)
        : "",
  })

  const parsedTransferAmount = useMemo(() => {
    if (!transferAmount) return null
    const value = Number(transferAmount)
    return Number.isNaN(value) ? null : value
  }, [transferAmount])

  const persistSettings = async (
    patch: PersistPatch,
    handlers?: {
      onStart?: () => void
      onSuccess?: () => void
      onError?: (message: string) => void
    }
  ) => {
    handlers?.onStart?.()

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/inscription-settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo guardar la configuracion")
      }

      handlers?.onSuccess?.()
      return { success: true as const }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo guardar la configuracion."
      handlers?.onError?.(message)
      return { success: false as const, message }
    }
  }

  const handlePublicToggle = async (checked: boolean) => {
    setEnablePublicInscriptions(checked)

    const result = await persistSettings(
      { enable_public_inscriptions: checked },
      {
        onStart: () => setPublicStatus("saving"),
        onSuccess: () => setPublicStatus("saved"),
        onError: (message) => {
          setPublicStatus("error")
          setEnablePublicInscriptions((current) => !current)
          toast({
            title: "No se pudo actualizar la vista publica",
            description: message,
            variant: "destructive",
          })
        },
      }
    )

    if (result.success) {
      toast({
        title: checked ? "Vista publica habilitada" : "Vista publica privada",
        description: checked
          ? "La pagina /inscriptions vuelve a estar visible."
          : "La pagina /inscriptions queda reservada para gestion interna.",
      })
    }
  }

  const handleCheckboxToggle = async (checked: boolean) => {
    setEnablePaymentCheckboxes(checked)

    const result = await persistSettings(
      { enable_payment_checkboxes: checked },
      {
        onStart: () => setCheckboxStatus("saving"),
        onSuccess: () => setCheckboxStatus("saved"),
        onError: (message) => {
          setCheckboxStatus("error")
          setEnablePaymentCheckboxes((current) => !current)
          toast({
            title: "No se pudieron actualizar los checkboxes",
            description: message,
            variant: "destructive",
          })
        },
      }
    )

    if (result.success) {
      toast({
        title: checked ? "Checkboxes activados" : "Checkboxes desactivados",
        description: checked
          ? "El organizador ya puede marcar pagos manualmente."
          : "El panel oculta el seguimiento manual de pagos.",
      })
    }
  }

  const handleValidationToggle = async (checked: boolean) => {
    setValidateInscriptions(checked)

    const result = await persistSettings(
      { validate_inscriptions: checked },
      {
        onStart: () => setValidationStatus("saving"),
        onSuccess: () => setValidationStatus("saved"),
        onError: (message) => {
          setValidationStatus("error")
          setValidateInscriptions((current) => !current)
          toast({
            title: "No se pudo actualizar la validacion",
            description: message,
            variant: "destructive",
          })
        },
      }
    )

    if (result.success) {
      toast({
        title: checked ? "Validacion activada" : "Validacion desactivada",
        description: checked
          ? "Las nuevas inscripciones de jugadores requeriran aprobacion."
          : "Las inscripciones pendientes fueron aprobadas y las nuevas ingresaran directamente.",
      })
    }
  }

  const handleFewSlotsToggle = async (checked: boolean) => {
    setShowFewSlotsAlert(checked)

    const result = await persistSettings(
      { show_few_slots_alert: checked },
      {
        onStart: () => setFewSlotsStatus("saving"),
        onSuccess: () => setFewSlotsStatus("saved"),
        onError: (message) => {
          setFewSlotsStatus("error")
          setShowFewSlotsAlert((current) => !current)
          toast({
            title: "No se pudo actualizar el aviso de cupos",
            description: message,
            variant: "destructive",
          })
        },
      }
    )

    if (result.success) {
      toast({
        title: checked ? "Aviso de pocos cupos visible" : "Aviso de pocos cupos oculto",
        description: checked
          ? "Se mostrara cuando queden dos lugares o menos."
          : "El conteo sigue privado y tampoco se mostrara el aviso rojo.",
      })
    }
  }

  const handleMessagesToggle = async (checked: boolean) => {
    setMessagesEnabled(checked)

    const result = await persistSettings(
      { messages_enabled: checked },
      {
        onStart: () => setMessagesStatus("saving"),
        onSuccess: () => setMessagesStatus("saved"),
        onError: (message) => {
          setMessagesStatus("error")
          setMessagesEnabled(!checked)
          toast({
            title: "No se pudo actualizar el envio de mensajes",
            description: message,
            variant: "destructive",
          })
        },
      }
    )

    if (result.success) {
      toast({
        title: checked ? "Mensajes automaticos activados" : "Mensajes automaticos desactivados",
        description: checked
          ? "El torneo volvera a enviar emails automaticos."
          : "No se enviaran emails automaticos para este torneo.",
      })
    }
  }

  const handleTransferToggle = async (checked: boolean) => {
    setEnableTransferProof(checked)

    const result = await persistSettings(
      { enable_transfer_proof: checked },
      {
        onStart: () => setTransferToggleStatus("saving"),
        onSuccess: () => setTransferToggleStatus("saved"),
        onError: (message) => {
          setTransferToggleStatus("error")
          setEnableTransferProof((current) => !current)
          toast({
            title: "No se pudo actualizar la transferencia",
            description: message,
            variant: "destructive",
          })
        },
      }
    )

    if (result.success) {
      toast({
        title: checked ? "Transferencia con comprobante activada" : "Transferencia con comprobante desactivada",
        description: checked
          ? "Ahora debes completar alias e importe a transferir por pareja."
          : "Los jugadores ya no veran alias, importe a transferir ni carga de comprobante.",
      })
    }
  }

  const handleTrustPolicyToggle = async (checked: boolean) => {
    setEnableTrustBasedPaymentPolicy(checked)

    const result = await persistSettings(
      {
        enable_trust_based_payment_policy: checked,
        trust_policy_min_played_tournaments: Number(trustPolicyMinPlayedTournaments || 2),
        transfer_alias: transferAlias.trim() || null,
        transfer_amount_per_player: transferAmountPerPlayer ? Number(transferAmountPerPlayer) : null,
      },
      {
        onStart: () => setTrustPolicyStatus("saving"),
        onSuccess: () => setTrustPolicyStatus("saved"),
        onError: (message) => {
          setTrustPolicyStatus("error")
          setEnableTrustBasedPaymentPolicy((current) => !current)
          toast({
            title: "No se pudo actualizar la politica de pago",
            description: message,
            variant: "destructive",
          })
        },
      }
    )

    if (result.success) {
      toast({
        title: checked ? "Politica de pago activada" : "Politica de pago desactivada",
        description: checked
          ? "El flujo publico ahora usa efectivo o transferencia segun confianza del jugador."
          : "El torneo vuelve a usar las reglas generales de inscripcion.",
      })
    }
  }

  const handleTrustPolicyFieldsBlur = async () => {
    const result = await persistSettings(
      {
        trust_policy_min_played_tournaments: Number(trustPolicyMinPlayedTournaments || 2),
        transfer_alias: transferAlias.trim() || null,
        transfer_amount_per_player: transferAmountPerPlayer ? Number(transferAmountPerPlayer) : null,
      },
      {
        onStart: () => setTrustPolicyStatus("saving"),
        onSuccess: () => setTrustPolicyStatus("saved"),
        onError: (message) => {
          setTrustPolicyStatus("error")
          toast({
            title: "No se pudo guardar la politica de pago",
            description: message,
            variant: "destructive",
          })
        },
      }
    )

    return result
  }

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true
      return
    }

    const aliasChanged = transferAlias !== lastSavedTransferRef.current.alias
    const amountChanged = transferAmount !== lastSavedTransferRef.current.amount

    if (!aliasChanged && !amountChanged) {
      return
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (enableTransferProof) {
      if (!transferAlias.trim()) {
        setTransferFieldsStatus("error")
        setTransferFieldsError("Completa el alias para usar esta funcionalidad.")
        return
      }

      if (parsedTransferAmount === null || parsedTransferAmount <= 0) {
        setTransferFieldsStatus("error")
        setTransferFieldsError("Indica un importe a transferir por pareja mayor a 0.")
        return
      }
    }

    setTransferFieldsError(null)
    setTransferFieldsStatus("saving")

    debounceRef.current = setTimeout(async () => {
      const result = await persistSettings(
        {
          transfer_alias: transferAlias.trim() || null,
          transfer_amount: transferAmount ? Number(transferAmount) : null,
        },
        {
          onStart: () => setTransferFieldsStatus("saving"),
          onSuccess: () => setTransferFieldsStatus("saved"),
          onError: (message) => {
            setTransferFieldsStatus("error")
            setTransferFieldsError(message)
          },
        }
      )

      if (result.success) {
        lastSavedTransferRef.current = {
          alias: transferAlias,
          amount: transferAmount,
        }
      }
    }, 650)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [enableTransferProof, parsedTransferAmount, transferAlias, transferAmount, tournamentId])

  return (
    <div className="space-y-5">
      <SettingCard
        icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
        title="Validar inscripciones"
        description="Decide si las inscripciones realizadas por jugadores requieren aprobacion del organizador."
        status={validationStatus}
      >
        <div className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge
                variant={validateInscriptions ? "default" : "secondary"}
                className={validateInscriptions ? "bg-emerald-600 hover:bg-emerald-600" : ""}
              >
                {validateInscriptions ? "Requiere aprobacion" : "Inscripcion directa"}
              </Badge>
              <span className="text-sm font-medium text-slate-900">
                {validateInscriptions
                  ? "El organizador valida cada nueva inscripcion"
                  : "Los jugadores quedan inscriptos automaticamente"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Al desactivarla, las inscripciones pendientes actuales se aprueban automaticamente.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="validate-inscriptions" className="text-sm font-medium">
              Validar inscripciones
            </Label>
            <Switch
              id="validate-inscriptions"
              checked={validateInscriptions}
              onCheckedChange={handleValidationToggle}
              disabled={validationStatus === "saving"}
            />
          </div>
        </div>
      </SettingCard>

      <SettingCard
        icon={<Mail className="h-4 w-4 text-sky-600" />}
        title="Mensajes automaticos"
        description="Controla si este torneo envia avisos por inscripcion, aprobacion, cancelacion y partidos programados."
        status={messagesStatus}
      >
        <div className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge
                variant={messagesEnabled ? "default" : "secondary"}
                className={messagesEnabled ? "bg-sky-600 hover:bg-sky-600" : ""}
              >
                {messagesEnabled ? "Activos" : "Apagados"}
              </Badge>
              <span className="text-sm font-medium text-slate-900">
                {messagesEnabled ? "El torneo envia mensajes automaticos" : "El torneo no envia mensajes automaticos"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Por ahora se envian por email. La configuracion queda preparada para sumar WhatsApp mas adelante.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="messages-enabled" className="text-sm font-medium">
              Enviar mensajes automaticos
            </Label>
            <Switch
              id="messages-enabled"
              checked={messagesEnabled}
              onCheckedChange={handleMessagesToggle}
              disabled={messagesStatus === "saving"}
            />
          </div>
        </div>
      </SettingCard>

      <SettingCard
        icon={<Eye className="h-4 w-4 text-blue-600" />}
        title="Vista publica de inscripciones"
        description="Controla si la pagina /inscriptions se muestra a jugadores y visitantes."
        status={publicStatus}
      >
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={enablePublicInscriptions ? "default" : "secondary"} className={enablePublicInscriptions ? "bg-blue-600 hover:bg-blue-600" : ""}>
                {enablePublicInscriptions ? "Publica" : "Privada"}
              </Badge>
              <span className="text-sm font-medium text-slate-900">
                {enablePublicInscriptions ? "La vista esta visible" : "La vista queda oculta al publico"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Si la apagas, el organizador sigue pudiendo gestionar inscripciones desde su panel.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="public-inscriptions" className="text-sm font-medium">
              Permitir acceso publico
            </Label>
            <Switch
              id="public-inscriptions"
              checked={enablePublicInscriptions}
              onCheckedChange={handlePublicToggle}
              disabled={publicStatus === "saving"}
            />
          </div>
        </div>
      </SettingCard>

      <SettingCard
        icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
        title="Aviso de pocos cupos"
        description="Muestra una alerta roja cuando quedan dos lugares o menos, sin revelar el total de inscriptos."
        status={fewSlotsStatus}
      >
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge
                variant={showFewSlotsAlert ? "default" : "secondary"}
                className={showFewSlotsAlert ? "bg-red-600 hover:bg-red-600" : ""}
              >
                {showFewSlotsAlert ? "Visible" : "Oculto"}
              </Badge>
              <span className="text-sm font-medium text-slate-900">
                {showFewSlotsAlert ? "Los jugadores veran la alerta" : "No se mostrara la alerta"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Este ajuste es independiente de la vista publica y viene activado por defecto.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="few-slots-alert" className="text-sm font-medium">
              Mostrar pocos cupos
            </Label>
            <Switch
              id="few-slots-alert"
              checked={showFewSlotsAlert}
              onCheckedChange={handleFewSlotsToggle}
              disabled={fewSlotsStatus === "saving"}
            />
          </div>
        </div>
      </SettingCard>

      <SettingCard
        icon={<Receipt className="h-4 w-4 text-emerald-600" />}
        title="Organizacion del cobro"
        description="Herramientas internas para que el organizador siga pagos dentro del panel."
        status={checkboxStatus}
      >
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge
                variant={enablePaymentCheckboxes ? "default" : "outline"}
                className={enablePaymentCheckboxes ? "bg-emerald-600 hover:bg-emerald-600" : ""}
              >
                {enablePaymentCheckboxes ? "Activos" : "Ocultos"}
              </Badge>
              <span className="text-sm font-medium text-slate-900">Checkboxes manuales por jugador</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Sirven para organizarte internamente. No cambian el flujo publico del jugador.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="payment-checkboxes" className="text-sm font-medium">
              Habilitar seguimiento manual
            </Label>
            <Switch
              id="payment-checkboxes"
              checked={enablePaymentCheckboxes}
              onCheckedChange={handleCheckboxToggle}
              disabled={checkboxStatus === "saving"}
            />
          </div>
        </div>
      </SettingCard>

      <SettingCard
        icon={<ShieldCheck className="h-4 w-4 text-violet-600" />}
        title="Politica de pago por confianza"
        description="Para torneos americanos: efectivo puede quedar pendiente segun historial; transferencia confirma con comprobante."
        status={trustPolicyStatus}
      >
        <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={enableTrustBasedPaymentPolicy ? "default" : "secondary"}
                  className={enableTrustBasedPaymentPolicy ? "bg-violet-600 hover:bg-violet-600" : ""}
                >
                  {enableTrustBasedPaymentPolicy ? "Activa" : "Inactiva"}
                </Badge>
                <span className="text-sm font-medium text-slate-900">Efectivo o transferencia</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Si esta activa, reemplaza validacion general y comprobante obligatorio en la inscripcion publica.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor="trust-payment-policy" className="text-sm font-medium">
                Activar politica
              </Label>
              <Switch
                id="trust-payment-policy"
                checked={enableTrustBasedPaymentPolicy}
                onCheckedChange={handleTrustPolicyToggle}
                disabled={trustPolicyStatus === "saving"}
              />
            </div>
          </div>

          <div className="grid gap-4 rounded-xl border bg-white p-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="trust-transfer-alias">Alias para transferencia</Label>
              <Input
                id="trust-transfer-alias"
                value={transferAlias}
                onChange={(event) => setTransferAlias(event.target.value)}
                onBlur={handleTrustPolicyFieldsBlur}
                placeholder="alias.del.club"
              />
              <p className="text-xs text-muted-foreground">
                Se muestra cuando el jugador elige transferencia.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trust-min-tournaments">Inscripciones confirmadas para confiar</Label>
              <Input
                id="trust-min-tournaments"
                type="number"
                min="0"
                step="1"
                value={trustPolicyMinPlayedTournaments}
                onChange={(event) => setTrustPolicyMinPlayedTournaments(event.target.value)}
                onBlur={handleTrustPolicyFieldsBlur}
              />
              <p className="text-xs text-muted-foreground">
                Con menos de este numero de inscripciones confirmadas previas, efectivo queda pendiente.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-amount-per-player">Seña por jugador</Label>
              <Input
                id="transfer-amount-per-player"
                type="number"
                min="0"
                step="0.01"
                value={transferAmountPerPlayer}
                onChange={(event) => setTransferAmountPerPlayer(event.target.value)}
                onBlur={handleTrustPolicyFieldsBlur}
                placeholder="7500"
              />
              <p className="text-xs text-muted-foreground">
                En transferencia se muestra la seña total de la pareja.
              </p>
            </div>
          </div>

          <Alert className="border-violet-200 bg-white">
            <AlertDescription className="text-violet-950">
              La seña total de la pareja es la seña por jugador multiplicada por 2.
            </AlertDescription>
          </Alert>
        </div>
      </SettingCard>

      <SettingCard
        icon={<Landmark className="h-4 w-4 text-amber-600" />}
        title="Transferencia con comprobante"
        description="Los jugadores veran alias, importe a transferir y podran adjuntar comprobante desde el popup de inscripcion."
        status={transferToggleStatus === "saving" ? "saving" : transferFieldsStatus === "error" ? "error" : transferToggleStatus === "saved" || transferFieldsStatus === "saved" ? "saved" : "idle"}
      >
        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={enableTransferProof ? "default" : "secondary"}
                  className={enableTransferProof ? "bg-amber-600 hover:bg-amber-600" : ""}
                >
                  {enableTransferProof ? "Activa" : "Inactiva"}
                </Badge>
                <span className="text-sm font-medium text-slate-900">Alias, importe a transferir y carga de comprobante</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Al activarla, la inscripcion queda registrada cuando el jugador adjunta el comprobante.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor="transfer-proof" className="text-sm font-medium">
                Activar transferencia
              </Label>
              <Switch
                id="transfer-proof"
                checked={enableTransferProof}
                onCheckedChange={handleTransferToggle}
                disabled={transferToggleStatus === "saving"}
              />
            </div>
          </div>

          <div className="grid gap-4 rounded-xl border bg-white p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="transfer-alias">Alias</Label>
              <Input
                id="transfer-alias"
                value={transferAlias}
                onChange={(event) => setTransferAlias(event.target.value)}
                placeholder="alias.del.club"
                disabled={transferFieldsStatus === "saving"}
              />
              <p className="text-xs text-muted-foreground">
                Se muestra al jugador exactamente como lo escribas aqui.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-amount">Importe a transferir por pareja</Label>
              <Input
                id="transfer-amount"
                type="number"
                min="0"
                step="0.01"
                value={transferAmount}
                onChange={(event) => setTransferAmount(event.target.value)}
                placeholder="15000"
                disabled={transferFieldsStatus === "saving"}
              />
              <p className="text-xs text-muted-foreground">
                Se guarda automaticamente al dejar de escribir.
              </p>
            </div>
          </div>

          {enableTransferProof && (
            <Alert className="border-amber-200 bg-white">
              <AlertDescription className="text-amber-950">
                Flujo del jugador: primero elige companero, despues ve alias e importe a transferir por pareja, sube el comprobante y la inscripcion queda registrada.
              </AlertDescription>
            </Alert>
          )}

          {transferFieldsError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-700">{transferFieldsError}</AlertDescription>
            </Alert>
          )}
        </div>
      </SettingCard>
    </div>
  )
}
