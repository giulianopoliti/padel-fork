"use client"

import { useState, useEffect, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { registerCoupleForTournament } from "@/app/api/tournaments/actions"
import { useUser } from "@/contexts/user-context"
import { Search, UserPlus, AlertCircle, Users, User, Phone, CreditCard, Loader2, Upload, CheckCircle2 } from "lucide-react"
import { Gender } from "@/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import PlayerDniDisplay from "@/components/players/player-dni-display"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"
import { TPE_TERMS_PATH } from "@/lib/tpe/terms"

// Define the PlayerInfo interface locally
interface PlayerInfo {
  id: string
  first_name: string | null
  last_name: string | null
  score?: number | null
  dni?: string | null
  phone?: string | null
  category_name?: string | null
}

// Interface para datos de verificacion de telefono
interface PhoneCheckData {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  needsPhone: boolean
}

interface CreatePlayerForCoupleResponse {
  success: boolean
  playerId?: string
  message?: string
}

interface CheckPhonesResponse {
  success: boolean
  player1: PhoneCheckData | null
  player2: PhoneCheckData | null
  bothHavePhone: boolean
  atLeastOneHasPhone: boolean
  noneHasPhone: boolean
  error?: string
}

interface UpdatePhoneResponse {
  success: boolean
  error?: string
}

const parseJsonResponse = async <T,>(response: Response, fallbackMessage: string): Promise<T> => {
  const responseText = await response.text()

  if (!responseText) {
    return {} as T
  }

  try {
    return JSON.parse(responseText) as T
  } catch (error) {
    console.error("[RegisterCoupleForm] Invalid JSON response", {
      url: response.url,
      status: response.status,
      bodyPreview: responseText.slice(0, 250),
      error,
    })
    throw new Error(fallbackMessage)
  }
}

const postJson = async <T,>(url: string, body: unknown, fallbackMessage: string) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const payload = await parseJsonResponse<T>(response, fallbackMessage)
  return { response, payload }
}

const requestCreatePlayerForCouple = async (body: {
  tournamentId: string
  playerData: {
    first_name: string
    last_name: string
    gender: string
    dni?: string | null
    phone?: string | null
    forceCreateNew?: boolean
  }
}): Promise<CreatePlayerForCoupleResponse> => {
  const { response, payload } = await postJson<CreatePlayerForCoupleResponse>(
    "/api/players/create-for-couple",
    body,
    "El servidor devolvió una respuesta inválida al crear el compañero.",
  )

  if (!response.ok && !payload.success) {
    return {
      success: false,
      message: payload.message || "No se pudo crear el compañero.",
    }
  }

  return payload
}

const requestCheckPlayersPhones = async (body: {
  player1Id: string
  player2Id: string
}): Promise<CheckPhonesResponse> => {
  const { payload } = await postJson<CheckPhonesResponse>(
    "/api/players/check-phones",
    body,
    "El servidor devolvió una respuesta inválida al verificar los teléfonos.",
  )

  return payload
}

const requestUpdatePlayerPhone = async (body: {
  playerId: string
  phone: string
}): Promise<UpdatePhoneResponse> => {
  const { payload } = await postJson<UpdatePhoneResponse>(
    "/api/players/update-phone",
    body,
    "El servidor devolvió una respuesta inválida al actualizar el teléfono.",
  )

  return payload
}

// Esquema de validación para jugador
const playerFormSchema = z.object({
  firstName: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  lastName: z.string().min(2, "El apellido debe tener al menos 2 caracteres"),
  phone: z
    .string()
    .optional()
    .refine((value) => !value || value.trim().length === 0 || value.trim().length >= 6, {
      message: "El teléfono debe tener al menos 6 caracteres",
    }),
  dni: z.string().optional(),
  gender: z.nativeEnum(Gender),
})

// Esquema de validación para búsqueda
const searchFormSchema = z.object({
  searchTerm: z.string().min(3, "Ingrese al menos 3 caracteres para buscar"),
})

type PlayerFormValues = z.infer<typeof playerFormSchema>
type SearchFormValues = z.infer<typeof searchFormSchema>

interface RegisterCoupleFormProps {
  tournamentId: string
  onComplete: (success: boolean) => void
  players: PlayerInfo[]
  tournamentGender: Gender
  transferConfig?: {
    enabled: boolean
    alias: string | null
    amount: number | null
  }
  requireTermsAcceptance?: boolean
}

export default function RegisterCoupleForm({
  tournamentId,
  onComplete,
  players,
  tournamentGender,
  transferConfig,
  requireTermsAcceptance = false,
}: RegisterCoupleFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(null)
  const { user: contextUser, userDetails } = useUser()
  
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
  const phoneFormRef = useRef<HTMLDivElement | null>(null)
  const player1PhoneInputRef = useRef<HTMLInputElement | null>(null)
  const player2PhoneInputRef = useRef<HTMLInputElement | null>(null)
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null)
  const [paymentProofError, setPaymentProofError] = useState<string | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)

  const transferProofEnabled = !!transferConfig?.enabled
  const transferAlias = transferConfig?.alias?.trim() || null
  const transferAmount = transferConfig?.amount ?? null
  const transferConfigInvalid = transferProofEnabled && (!transferAlias || transferAmount === null || transferAmount <= 0)

  // Formulario para registrar nuevo jugador
  const playerForm = useForm<PlayerFormValues>({
    resolver: zodResolver(playerFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      dni: "",
      gender: tournamentGender === Gender.FEMALE ? Gender.FEMALE : Gender.MALE,
    },
  })

  // Formulario para buscar jugador existente
  const searchForm = useForm<SearchFormValues>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      searchTerm: "",
    },
  })

  useEffect(() => {
    if (!showPhoneForm) {
      return
    }

    const targetInput = phoneCheckResult?.player1?.needsPhone
      ? player1PhoneInputRef.current
      : player2PhoneInputRef.current

    phoneFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })

    window.setTimeout(() => {
      targetInput?.focus()
    }, 150)
  }, [phoneCheckResult, showPhoneForm])

  // Manejar búsqueda de jugadores
  const onSearch = async (data: SearchFormValues) => {
    setIsSearching(true)
    setSearchResults([])
    try {
      console.log('[RegisterCoupleForm] Searching with term:', data.searchTerm)

      // ✅ Llamar Edge Function para búsqueda optimizada
      const { searchTournamentPlayers } = await import('@/lib/api/supabase-edge')
      const result = await searchTournamentPlayers({
        searchTerm: data.searchTerm,
        tournamentId,
        page: 1,
        pageSize: 50
      })

      if (result.success && result.players) {
        // Excluir al jugador logueado de los resultados
        const filteredResults = result.players.filter(
          (player: any) => player.id !== userDetails?.player_id
        )
        console.log('[RegisterCoupleForm] Found:', filteredResults.length, 'players')
        setSearchResults(filteredResults)
      } else {
        console.warn('[RegisterCoupleForm] No players found or error:', result.error)
        setSearchResults([])
      }
    } catch (error) {
      console.error("Error al buscar jugadores:", error)
      setSearchResults([])
      toast({
        title: "Error en la búsqueda",
        description: "No se pudieron buscar jugadores. Intenta nuevamente.",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false)
    }
  }

  // Manejar selección de compañero
  const handleSelectCompanion = (playerId: string) => {
    setSelectedCompanionId(playerId)
    // Resetear estados de verificacion de telefono al cambiar de compañero
    setPhoneCheckResult(null)
    setShowPhoneForm(false)
    setPlayer1Phone("")
    setPlayer2Phone("")
  }

  // Verificar telefonos antes de registrar pareja
  const handleCheckPhonesAndRegister = async (companionId = selectedCompanionId) => {
    if (!userDetails?.player_id || !companionId) {
      toast({
        title: "Selección incompleta",
        description: "Debe seleccionar un compañero para formar la pareja",
        variant: "destructive",
      })
      return false
    }

    if (!validateTransferProofRequirements()) {
      return false
    }

    setIsCheckingPhones(true)

    try {
      console.log("[RegisterCoupleForm] Verificando telefonos de jugadores...")
      const result = await requestCheckPlayersPhones({
        player1Id: userDetails.player_id,
        player2Id: companionId,
      })

      if (!result.success) {
        toast({
          title: "Error de verificación",
          description: result.error || "No se pudo verificar los teléfonos",
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
      setSelectedCompanionId(companionId)
      setPlayer1Phone(result.player1?.needsPhone ? result.player1.phone || "" : "")
      setPlayer2Phone(result.player2?.needsPhone ? result.player2.phone || "" : "")

      // Si al menos uno tiene telefono, proceder con el registro directamente
      if (result.atLeastOneHasPhone) {
        console.log("[RegisterCoupleForm] Al menos un jugador tiene telefono, procediendo con registro...")
        return await registerCoupleWithCompanion(companionId)
      } else {
        // Ninguno tiene telefono, mostrar formulario para agregar al menos uno
        console.log("[RegisterCoupleForm] Ningun jugador tiene telefono, mostrando formulario...")
        setShowPhoneForm(true)
        return false
      }
    } catch (error) {
      console.error("[RegisterCoupleForm] Error al verificar telefonos:", error)
      toast({
        title: "Error inesperado",
        description: "Ocurrió un error al verificar los teléfonos",
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
    if (!phoneCheckResult) return

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
        console.log(`[RegisterCoupleForm] Actualizando telefono de player1: ${phoneCheckResult.player1.id}`)
        const updateResult = await requestUpdatePlayerPhone({
          playerId: phoneCheckResult.player1.id,
          phone: player1Phone,
        })
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
        console.log(`[RegisterCoupleForm] Actualizando telefono de player2: ${phoneCheckResult.player2.id}`)
        const updateResult = await requestUpdatePlayerPhone({
          playerId: phoneCheckResult.player2.id,
          phone: player2Phone,
        })
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
      await executeRegistration()
    } catch (error) {
      console.error("[RegisterCoupleForm] Error al actualizar telefonos:", error)
      toast({
        title: "Error inesperado",
        description: "Ocurrió un error al actualizar los teléfonos",
        variant: "destructive",
      })
    } finally {
      setIsUpdatingPhones(false)
    }
  }

  // Ejecutar el registro de la pareja
  const executeRegistration = async () => {
    if (!userDetails?.player_id) {
      toast({
        title: "Error de autenticación",
        description: "No se pudo obtener tu información de jugador",
        variant: "destructive",
      })
      return
    }

    if (!selectedCompanionId) {
      toast({
        title: "Selección incompleta",
        description: "Debe seleccionar un compañero para formar la pareja",
        variant: "destructive",
      })
      return
    }

    if (!validateTransferProofRequirements()) {
      return
    }

    setIsSubmitting(true)

    try {
      const result = await submitCoupleRegistration(selectedCompanionId)

      if (result.success) {
        toast({
          title: transferProofEnabled ? "Inscripción registrada" : "Pareja registrada",
          description: transferProofEnabled
            ? "Tu pareja quedó registrada y pendiente de revisión del organizador"
            : "Te has registrado exitosamente en pareja para el torneo",
        })
        onComplete(true)
      } else {
        console.error('[RegisterCoupleForm] Registration error:', result.error)
        toast({
          title: "Error en el registro",
          description: result.error || "No se pudo registrar la pareja",
          variant: "destructive",
        })
        onComplete(false)
      }
    } catch (error) {
      console.error("Error al registrar pareja:", error)
      toast({
        title: "Error inesperado",
        description: error instanceof Error ? error.message : "Ocurrió un error al procesar la solicitud",
        variant: "destructive",
      })
      onComplete(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Manejar registro de pareja con compañero existente (mantener por compatibilidad)
  const onSubmitCouple = async () => {
    await handleCheckPhonesAndRegister()
  }

  const registerCoupleWithCompanion = async (companionId: string) => {
    if (!userDetails?.player_id) {
      toast({
        title: "Error de usuario",
        description: "No se pudo obtener tu ID de jugador. Verifica tu perfil.",
        variant: "destructive",
      })
      return false
    }

    const result = await submitCoupleRegistration(companionId)

    if (result.success) {
      toast({
        title: transferProofEnabled ? "Inscripción registrada" : "¡Pareja registrada!",
        description: transferProofEnabled
          ? "La pareja quedó registrada y pendiente de revisión del organizador"
          : "Se ha registrado la pareja exitosamente",
      })
      onComplete(true)
      return true
    }

    console.error("[RegisterCoupleForm] Couple registration error:", result.error)
    toast({
      title: "Error en el registro de pareja",
      description: result.error || "No se pudo registrar la pareja",
      variant: "destructive",
    })
    onComplete(false)
    return false
  }

  const createAndRegisterCompanion = async (
    data: PlayerFormValues,
    forceCreateNew = false,
  ) => {
    const newPlayerResult = await requestCreatePlayerForCouple({
      tournamentId,
      playerData: {
        first_name: data.firstName,
        last_name: data.lastName,
        gender: data.gender,
        dni: data.dni || null,
        phone: data.phone,
        forceCreateNew,
      },
    })

    if (!newPlayerResult.success || !newPlayerResult.playerId) {
      toast({
        title: "Error al crear jugador",
        description: newPlayerResult.message || "No se pudo crear el nuevo jugador",
        variant: "destructive",
      })
      onComplete(false)
      return false
    }

    return handleCheckPhonesAndRegister(newPlayerResult.playerId)
  }

  // Manejar registro de nuevo jugador como pareja
  const onSubmitNewPlayer = async (data: PlayerFormValues) => {
    if (!contextUser) {
      toast({
        title: "Error de autenticación",
        description: "Debe iniciar sesión para registrar una pareja",
        variant: "destructive",
      })
      return
    }

    if (!userDetails?.player_id) {
      toast({
        title: "Error de usuario",
        description: "No se pudo obtener tu ID de jugador. Verifica tu perfil.",
        variant: "destructive",
      })
      return
    }

    if (!validateTransferProofRequirements()) {
      return
    }

    setIsSubmitting(true)

    try {
      await createAndRegisterCompanion(data, false)
      return
    } catch (error) {
      console.error("Error al registrar pareja:", error)
      toast({
        title: "Error inesperado",
        description: error instanceof Error ? error.message : "Ocurrió un error al procesar la solicitud",
        variant: "destructive",
      })
      onComplete(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitCoupleRegistration = async (companionId: string) => {
    if (!userDetails?.player_id) {
      return {
        success: false,
        error: "No se pudo obtener tu ID de jugador. Verifica tu perfil.",
      }
    }

    if (requireTermsAcceptance && !termsAccepted) {
      return { success: false, error: "Debes aceptar los Términos y Condiciones para inscribirte." }
    }

    if (transferProofEnabled) {
      const validationError = getTransferProofValidationError()

      if (validationError) {
        setPaymentProofError(validationError)
        return {
          success: false,
          error: validationError,
        }
      }

      const proofFile = paymentProofFile
      if (!proofFile) {
        return {
          success: false,
          error: "Debes adjuntar un comprobante para registrar tu pareja.",
        }
      }

      const formData = new FormData()
      formData.append("player1Id", userDetails.player_id)
      formData.append("player2Id", companionId)
      formData.append("termsAccepted", String(termsAccepted))
      formData.append("proof", proofFile)

      const response = await fetch(`/api/tournaments/${tournamentId}/inscriptions/couple-with-proof`, {
        method: "POST",
        body: formData,
      })

      const result = await parseJsonResponse<{ message?: string }>(
        response,
        "El servidor devolvió una respuesta inválida al registrar la pareja.",
      )

      if (!response.ok) {
        return {
          success: false,
          error: result.message || "No se pudo registrar la pareja con comprobante.",
        }
      }

      return { success: true }
    }

    console.log("[RegisterCoupleForm] Llamando registerCoupleForTournament")
    console.log("Player IDs:", { player1Id: userDetails.player_id, player2Id: companionId })

    return await registerCoupleForTournament(tournamentId, userDetails.player_id, companionId, false, termsAccepted)
  }

  const formatTransferAmount = (amount: number | null) => {
    if (amount === null || Number.isNaN(Number(amount))) return "Monto no disponible"
    return `$${Number(amount).toLocaleString("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`
  }

  const getTransferProofValidationError = () => {
    if (!transferProofEnabled) return null

    if (transferConfigInvalid) {
      return "El organizador no configuró correctamente alias y monto para esta inscripción."
    }

    if (!paymentProofFile) {
      return "Debes adjuntar un comprobante para registrar tu pareja."
    }

    return null
  }

  const validateTransferProofRequirements = () => {
    const validationError = getTransferProofValidationError()
    setPaymentProofError(validationError)

    if (!validationError) {
      return true
    }

    toast({
      title: "Faltan datos para inscribirte",
      description: validationError,
      variant: "destructive",
    })

    return false
  }

  const selectedCompanion =
    (selectedCompanionId && searchResults.find((player) => player.id === selectedCompanionId)) ||
    (selectedCompanionId && players.find((player) => player.id === selectedCompanionId)) ||
    null

  const isTransferStepReady = !transferProofEnabled || (!!paymentProofFile && !transferConfigInvalid)

  const renderTransferProofStep = (stepLabel: string, inputId: string, companionName?: string | null) => (
    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{stepLabel}</p>
          <h3 className="text-base font-semibold text-slate-900">Transferi y subi el comprobante</h3>
          <p className="text-sm text-slate-700">
            Cuando adjuntas el comprobante, la inscripcion queda registrada.
          </p>
        </div>
      </div>

      {companionName && (
        <div className="rounded-xl border border-emerald-200 bg-white/90 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Pareja seleccionada</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{companionName}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Alias</p>
          <p className="mt-1 break-all text-base font-semibold text-slate-900">
            {transferAlias || "No disponible"}
          </p>
        </div>
        <div className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Importe</p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {formatTransferAmount(transferAmount)}
          </p>
        </div>
      </div>

      {transferConfigInvalid && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Configuracion incompleta</AlertTitle>
          <AlertDescription className="text-red-700">
            El organizador todavia no configuro correctamente el alias y el monto de esta inscripcion.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        <input
          id={inputId}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] || null
            setPaymentProofFile(file)
            if (transferConfigInvalid) {
              setPaymentProofError("El organizador no configuró correctamente alias y monto para esta inscripción.")
            } else if (file) {
              setPaymentProofError(null)
            } else {
              setPaymentProofError("Debes adjuntar un comprobante para registrar tu pareja.")
            }
          }}
        />

        <label
          htmlFor={inputId}
          className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed bg-white px-4 py-4 text-left transition-colors ${
            paymentProofError
              ? "border-red-400 bg-red-50"
              : "border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50"
          }`}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            {paymentProofFile ? <CheckCircle2 className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {paymentProofFile ? "Comprobante cargado" : "Subir comprobante"}
            </p>
            <p className="text-xs text-slate-600">JPG, PNG, WEBP o PDF</p>
            {paymentProofFile && (
              <p className="mt-1 max-w-full break-all text-xs font-medium text-emerald-700">
                {paymentProofFile.name}
              </p>
            )}
          </div>
        </label>

        {paymentProofError && (
          <p className="text-sm font-medium text-red-600">
            {paymentProofError}
          </p>
        )}
      </div>
    </div>
  )

  const renderPhoneRequirementForm = () => {
    if (!showPhoneForm || !phoneCheckResult) {
      return null
    }

    return (
      <div
        ref={phoneFormRef}
        className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-4"
      >
        <Alert className="border-amber-300 bg-amber-100">
          <Phone className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Telefono requerido</AlertTitle>
          <AlertDescription className="text-amber-700">
            Para completar la inscripción necesitamos al menos un teléfono de contacto de la pareja. Con que uno de los dos lo cargue aquí, alcanza.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          {phoneCheckResult.player1?.needsPhone && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Tu teléfono ({phoneCheckResult.player1.firstName} {phoneCheckResult.player1.lastName})
              </label>
              <Input
                ref={player1PhoneInputRef}
                type="tel"
                placeholder="Ingresa tu numero de telefono"
                value={player1Phone}
                onChange={(e) => setPlayer1Phone(e.target.value)}
                className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                aria-label={`Telefono de ${phoneCheckResult.player1.firstName}`}
              />
              <p className="text-xs text-gray-500">Minimo 6 caracteres</p>
            </div>
          )}

          {phoneCheckResult.player2?.needsPhone && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Teléfono de tu compañero ({phoneCheckResult.player2.firstName} {phoneCheckResult.player2.lastName})
              </label>
              <Input
                ref={player2PhoneInputRef}
                type="tel"
                placeholder="Ingresa el numero de telefono del companero"
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
            onClick={() => {
              setShowPhoneForm(false)
              setPhoneCheckResult(null)
              setPlayer1Phone("")
              setPlayer2Phone("")
            }}
            disabled={isUpdatingPhones || isSubmitting}
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleUpdatePhonesAndRegister}
            disabled={isUpdatingPhones || isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isUpdatingPhones || isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              "Guardar y registrar pareja"
            )}
          </Button>
        </div>
      </div>
    )
  }

  if (!userDetails?.player_id) {
    return (
      <Card className="w-full bg-white border border-gray-200 shadow-sm">
        <CardContent className="p-6">
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800">Error de autenticación</AlertTitle>
            <AlertDescription className="text-red-700">
              Debes estar logueado como jugador para inscribir una pareja.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full border-0 bg-transparent shadow-none">
      <CardContent className="space-y-4 p-0">
        <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Inscripción en pareja</h2>
            <p className="mt-1 text-sm text-gray-600">
              Carga a tu compañero: puedes buscarlo si ya existe o crearle un perfil básico.
            </p>
          </div>
        </div>

        {requireTermsAcceptance && (
          <label className="flex cursor-pointer items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-slate-700">
            <Checkbox checked={termsAccepted} onCheckedChange={(checked) => setTermsAccepted(checked === true)} />
            <span>
              Leí y acepto los <Link href={TPE_TERMS_PATH} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">Términos y Condiciones</Link>.
            </span>
          </label>
        )}

        <Tabs defaultValue="new" className="w-full">
          <TabsList className="grid h-11 w-full grid-cols-2 bg-gray-100">
            <TabsTrigger value="new" className="data-[state=active]:bg-white data-[state=active]:text-blue-600">
              <UserPlus className="mr-2 h-4 w-4" />
              Nuevo compañero
            </TabsTrigger>
            <TabsTrigger value="search" className="data-[state=active]:bg-white data-[state=active]:text-blue-600">
              <Search className="mr-2 h-4 w-4" />
              Ya está cargado
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4 pt-4">
            <Form {...searchForm}>
              <form onSubmit={searchForm.handleSubmit(onSearch)} className="space-y-4">
                <FormField
                  control={searchForm.control}
                  name="searchTerm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">
                        Buscar compañero ya cargado
                      </FormLabel>
                      <FormControl>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            placeholder="Nombre, apellido o DNI del compañero"
                            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                            {...field}
                          />
                          <Button
                            type="submit"
                            disabled={isSearching}
                            className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>

            {isSearching ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-gray-600">Buscando jugadores...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {searchResults.length > 0 ? (
                  searchResults.map((player) => (
                    <div 
                      key={player.id} 
                      className={`rounded-2xl border p-3 cursor-pointer transition-colors ${
                        selectedCompanionId === player.id 
                          ? 'border-blue-500 bg-blue-50 shadow-sm' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-slate-50'
                      }`}
                      onClick={() => handleSelectCompanion(player.id)}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-base font-semibold text-gray-900">
                            {player.first_name} {player.last_name}
                          </p>
                          {player.score !== null && (
                            <p className="mt-1 text-sm text-gray-600">
                              Puntaje: {player.score}
                            </p>
                          )}
                          <div className="mt-1 text-sm text-gray-600">
                            <PlayerDniDisplay dni={player.dni} />
                          </div>
                        </div>
                        {selectedCompanionId === player.id && (
                          <div className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
                            Seleccionado
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : searchForm.watch('searchTerm') && !isSearching ? (
                  <p className="text-gray-500 text-center py-4">
                    No se encontraron jugadores con ese criterio
                  </p>
                ) : null}
              </div>
            )}

            {selectedCompanionId && !showPhoneForm && (
              <div className="space-y-4 pt-4">
                {transferProofEnabled && renderTransferProofStep(
                  "Paso 3",
                  "payment-proof-search",
                  selectedCompanion
                    ? `${selectedCompanion.first_name || ""} ${selectedCompanion.last_name || ""}`.trim()
                    : "Compañero seleccionado"
                )}

                {!transferProofEnabled && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-medium text-emerald-800">
                      La pareja ya está lista para registrarse.
                    </p>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={onSubmitCouple}
                    disabled={isSubmitting || isCheckingPhones || !isTransferStepReady}
                    className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
                  >
                    {isCheckingPhones ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verificando...
                      </>
                    ) : isSubmitting ? (
                      "Procesando..."
                    ) : (
                      transferProofEnabled ? "Registrar con comprobante" : "Registrar pareja"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {renderPhoneRequirementForm()}
          </TabsContent>

          <TabsContent value="new" className="pt-4">
            <Form {...playerForm}>
              <form onSubmit={playerForm.handleSubmit(onSubmitNewPlayer)} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    control={playerForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-700">
                          <User className="h-4 w-4 inline mr-1" />
                          Nombre
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Nombre del compañero"
                            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={playerForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-gray-700">Apellido</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Apellido del compañero"
                            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                  <FormField
                    control={playerForm.control}
                    name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">
                        <Phone className="h-4 w-4 inline mr-1" />
                        Teléfono
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Teléfono del compañero"
                          className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-gray-500">
                        Opcional si al menos uno de los dos ya tiene teléfono cargado.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={playerForm.control}
                  name="dni"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">
                        <CreditCard className="h-4 w-4 inline mr-1" />
                        DNI opcional
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Puedes dejarlo vacío y cargarlo después"
                          className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={playerForm.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">Género</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione el género" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem 
                            value={Gender.MALE}
                            disabled={tournamentGender === Gender.FEMALE}
                          >
                            Masculino
                          </SelectItem>
                          <SelectItem value={Gender.FEMALE}>Femenino</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {transferProofEnabled && renderTransferProofStep("Paso 3", "payment-proof-new")}

                <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onComplete(false)}
                    disabled={isSubmitting}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !isTransferStepReady}
                    className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
                  >
                    {isSubmitting ? "Procesando..." : "Crear y registrar pareja"}
                  </Button>
                </div>
              </form>
            </Form>

            {renderPhoneRequirementForm()}
          </TabsContent>
        </Tabs>
      </CardContent>

    </Card>
  )
}
