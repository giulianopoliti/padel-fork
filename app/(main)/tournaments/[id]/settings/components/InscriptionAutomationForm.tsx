"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { AlertTriangle, Eye, Landmark, Loader2, Mail, Receipt } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useSWRConfig } from "swr"
import { RegistrationPolicyFields, type RegistrationPolicyValues } from '@/components/tournament/registration-policy-fields'
import { reserveOnSignupRequired, validateTournamentPaymentSettings } from '@/lib/tournaments/inscription-state'

interface InscriptionAutomationFormProps {
  tournamentId: string
  initialShowPublicInscriptions: boolean
  initialShowFewSlotsAlert: boolean
  initialEnablePaymentCheckboxes: boolean
  initialEnableTransferProof: boolean
  initialAllowCashPayment?: boolean
  initialReserveSlotWithoutProof?: boolean
  initialMessagesEnabled: boolean
  initialTransferAlias: string | null
  initialTransferAmount: number | null
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error"

interface PersistPatch {
  validate_inscriptions?: boolean
  show_public_inscriptions?: boolean
  show_few_slots_alert?: boolean
  enable_payment_checkboxes?: boolean
  enable_transfer_proof?: boolean
  allow_cash_payment?: boolean
  reserve_slot_without_proof?: boolean
  messages_enabled?: boolean
  transfer_alias?: string | null
  transfer_amount?: number | null
}

function StatusBadge({ state }: { state: SaveState }) {
  if (state === "dirty") {
    return <Badge variant="outline" className="border-amber-300 text-amber-800">Cambios sin guardar</Badge>
  }
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
    <div className="space-y-4 rounded-display border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-elevated bg-slate-100 p-2 text-slate-700">{icon}</div>
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

function SettingGroup({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4" aria-label={title}>
      <div className="border-b border-slate-200 pb-3">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  )
}

export default function InscriptionAutomationForm({
  tournamentId,
  initialShowPublicInscriptions,
  initialShowFewSlotsAlert,
  initialEnablePaymentCheckboxes,
  initialEnableTransferProof,
  initialAllowCashPayment = false,
  initialReserveSlotWithoutProof = true,
  initialMessagesEnabled,
  initialTransferAlias,
  initialTransferAmount,
}: InscriptionAutomationFormProps) {
  const [showPublicInscriptions, setShowPublicInscriptions] = useState(initialShowPublicInscriptions)
  const [showFewSlotsAlert, setShowFewSlotsAlert] = useState(initialShowFewSlotsAlert)
  const [enablePaymentCheckboxes, setEnablePaymentCheckboxes] = useState(initialEnablePaymentCheckboxes)
  const [messagesEnabled, setMessagesEnabled] = useState(initialMessagesEnabled)
  const [policy, setPolicy] = useState<RegistrationPolicyValues>({
    requestDeposit: initialEnableTransferProof,
    reserveOnSignup: initialReserveSlotWithoutProof || reserveOnSignupRequired(initialEnableTransferProof),
    allowCash: initialAllowCashPayment, alias: initialTransferAlias || '',
    amount: initialTransferAmount == null ? '' : String(initialTransferAmount),
  })
  const [savedPolicy, setSavedPolicy] = useState(policy)
  const [policyStatus, setPolicyStatus] = useState<SaveState>('idle')
  const [policyError, setPolicyError] = useState<string | null>(null)
  const policySaveInFlight = useRef(false)
  const [publicStatus, setPublicStatus] = useState<SaveState>("idle")
  const [fewSlotsStatus, setFewSlotsStatus] = useState<SaveState>("idle")
  const [checkboxStatus, setCheckboxStatus] = useState<SaveState>("idle")
  const [messagesStatus, setMessagesStatus] = useState<SaveState>("idle")
  const { toast } = useToast()
  const { mutate } = useSWRConfig()
  const parsedAmount = useMemo(() => {
    if (!policy.amount.trim()) return null
    const amount = Number(policy.amount)
    return Number.isFinite(amount) ? amount : null
  }, [policy.amount])
  const policyChanged = (Object.keys(policy) as (keyof RegistrationPolicyValues)[]).some(key => policy[key] !== savedPolicy[key])
  const displayedPolicyStatus = policyStatus === 'saving' || policyStatus === 'error' ? policyStatus : policyChanged ? 'dirty' : policyStatus

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
      // A committed settings change must not leave stale "proof missing" cards around.
      void mutate(key => Array.isArray(key) && (key[0] === 'own-payments' || (typeof key[0] === 'string' && (key[0].startsWith('/api/solo-players') || key[0].includes(`/tournaments/${tournamentId}/`))))).catch(() => {})
      return { success: true as const, data: result.data as PersistPatch }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo guardar la configuracion."
      handlers?.onError?.(message)
      return { success: false as const, message }
    }
  }

  const handlePublicToggle = async (checked: boolean) => {
    setShowPublicInscriptions(checked)

    const result = await persistSettings(
      { show_public_inscriptions: checked },
      {
        onStart: () => setPublicStatus("saving"),
        onSuccess: () => setPublicStatus("saved"),
        onError: (message) => {
          setPublicStatus("error")
          setShowPublicInscriptions((current) => !current)
          toast({
            title: "No se pudo actualizar la visibilidad de inscriptos",
            description: message,
            variant: "destructive",
          })
        },
      }
    )

    if (result.success) {
      toast({
        title: checked ? "Lista pública habilitada" : "Lista de inscriptos privada",
        description: checked
          ? "Jugadores y visitantes pueden volver a ver el listado de inscriptos."
          : "Las parejas pueden seguir inscribiéndose, pero el listado queda reservado para gestión interna.",
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

  const handlePolicyChange = (patch: Partial<RegistrationPolicyValues>): void => {
    setPolicy(current => {
      const next = { ...current, ...patch }
      return { ...next, reserveOnSignup: reserveOnSignupRequired(next.requestDeposit) || next.reserveOnSignup }
    })
    setPolicyError(null)
    setPolicyStatus('idle')
  }

  const handleSavePolicy = async (): Promise<void> => {
    if (policySaveInFlight.current || !policyChanged) return
    const patch = { enable_transfer_proof: policy.requestDeposit, reserve_slot_without_proof: reserveOnSignupRequired(policy.requestDeposit) || policy.reserveOnSignup,
      allow_cash_payment: policy.allowCash, transfer_alias: policy.alias.trim() || null, transfer_amount: parsedAmount }
    const error = validateTournamentPaymentSettings(patch)
    if (error) { setPolicyError(error); setPolicyStatus('error'); return }
    policySaveInFlight.current = true
    setPolicyStatus('saving'); setPolicyError(null)
    try {
      const result = await persistSettings(patch)
      if (!result.success) { setPolicyError(result.message); setPolicyStatus('error'); return }
      const saved = { ...policy, reserveOnSignup: result.data.reserve_slot_without_proof ?? patch.reserve_slot_without_proof,
        alias: patch.transfer_alias || '', amount: parsedAmount == null ? '' : String(parsedAmount) }
      setPolicy(saved); setSavedPolicy(saved); setPolicyStatus('saved')
      toast({ title: 'Configuración guardada', description: 'La seña y la reserva de cupo se actualizaron juntas para las nuevas inscripciones.' })
    } finally { policySaveInFlight.current = false }
  }

  return (
    <div className="space-y-8">
      <SettingGroup
        title="Lo que ven los jugadores"
        description="Elegí si el listado es público y si se muestra el aviso de pocos cupos."
      >
        <Alert className="border-blue-200 bg-blue-50/70">
          <Eye className="h-4 w-4 text-blue-700" />
          <AlertDescription className="text-blue-950">
            <strong>La privacidad no cierra las inscripciones.</strong> Mientras estén abiertas y haya cupo, las parejas pueden seguir registrándose aunque el listado permanezca privado.
          </AlertDescription>
        </Alert>

        <div className="space-y-5">
          <SettingCard
            icon={<Eye className="h-4 w-4 text-blue-600" />}
            title="Visibilidad de inscriptos"
            description="Definí si jugadores y visitantes pueden ver la cantidad y el listado de parejas."
            status={publicStatus}
          >
            <div className="flex flex-col gap-4 rounded-elevated border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={showPublicInscriptions ? "default" : "secondary"} className={showPublicInscriptions ? "bg-blue-600 hover:bg-blue-600" : ""}>
                    {showPublicInscriptions ? "Visible para todos" : "Solo organizadores"}
                  </Badge>
                  <span className="text-sm font-medium text-slate-900">
                    {showPublicInscriptions
                      ? "Se muestran nombres y cantidad de parejas"
                      : "Los nombres y la cantidad quedan privados"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  El organizador siempre conserva el acceso completo para gestionar las inscripciones.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Label htmlFor="public-inscriptions" className="text-sm font-medium">
                  Mostrar lista públicamente
                </Label>
                <Switch
                  id="public-inscriptions"
                  checked={showPublicInscriptions}
                  onCheckedChange={handlePublicToggle}
                  disabled={publicStatus === "saving"}
                />
              </div>
            </div>
          </SettingCard>

          <SettingCard
            icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
            title="Aviso de pocos cupos"
            description="Mostrá una alerta cuando queden dos lugares o menos, sin revelar el total de inscriptos."
            status={fewSlotsStatus}
          >
            <div className="flex flex-col gap-4 rounded-elevated border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={showFewSlotsAlert ? "default" : "secondary"}
                    className={showFewSlotsAlert ? "bg-red-600 hover:bg-red-600" : ""}
                  >
                    {showFewSlotsAlert ? "Visible" : "Oculto"}
                  </Badge>
                  <span className="text-sm font-medium text-slate-900">
                    {showFewSlotsAlert ? "Los jugadores verán la alerta" : "No se mostrará la alerta"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Este aviso funciona aunque la lista de inscriptos sea privada.
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
        </div>
      </SettingGroup>

      <SettingGroup
        title="Gestión de inscripciones"
        description="Definí cómo se confirman las nuevas parejas y qué avisos recibe cada jugador."
      >
        <div className="space-y-5">
          <SettingCard
            icon={<Mail className="h-4 w-4 text-sky-600" />}
            title="Mensajes automaticos"
            description="Controla si este torneo envia avisos por inscripcion, aprobacion, cancelacion y partidos programados."
            status={messagesStatus}
          >
            <div className="flex flex-col gap-4 rounded-elevated border border-sky-200 bg-sky-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
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
        </div>
      </SettingGroup>

      <SettingGroup
        title="Cobros"
        description="Organizá el seguimiento interno y, si corresponde, el pago por transferencia."
      >
        <div className="space-y-5">
          <SettingCard
        icon={<Receipt className="h-4 w-4 text-emerald-600" />}
        title="Organizacion del cobro"
        description="Herramientas internas para que el organizador siga pagos dentro del panel."
        status={checkboxStatus}
      >
        <div className="flex flex-col gap-4 rounded-elevated border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
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

          <SettingCard icon={<Landmark className="h-4 w-4" />} title="Seña y reserva de cupo"
            description="Elegí si pedís una seña y cuándo obtiene lugar cada pareja." status={displayedPolicyStatus}>
            <form noValidate className="space-y-5" onSubmit={event => { event.preventDefault(); void handleSavePolicy() }}>
              <RegistrationPolicyFields id="settings-registration-policy" value={policy} onChange={handlePolicyChange}
                disabled={policyStatus === 'saving'} error={policyError} />
              <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">{policyChanged ? 'Tenés cambios sin guardar.' : 'Estas opciones se guardan juntas.'}</p>
                <Button type="submit" disabled={!policyChanged || policyStatus === 'saving'}>
                  {policyStatus === 'saving' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando…</> : 'Guardar configuración'}
                </Button>
              </div>
            </form>
          </SettingCard>
        </div>
      </SettingGroup>
    </div>
  )
}
