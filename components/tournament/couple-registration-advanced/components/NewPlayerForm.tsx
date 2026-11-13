"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { UserPlus, Loader2, AlertCircle, Trophy } from "lucide-react"
import { checkPlayerIdentity } from "@/app/api/players/actions"
import PlayerDniDisplay from "@/components/players/player-dni-display"

import type { NewPlayerData, PlayerInfo } from "../types"

const newPlayerSchema = z.object({
  first_name: z.string().trim().min(1, "El nombre es requerido"),
  last_name: z.string().trim().min(1, "El apellido es requerido"),
  dni: z.string().optional(),
  phone: z.string().optional(),
  gender: z.string().min(1, "El genero es requerido"),
})

type NewPlayerFormValues = z.infer<typeof newPlayerSchema>

type IdentityMatchType = "dni" | "name"

type ExistingPlayerIdentity = PlayerInfo & {
  category_name?: string | null
}

export type ResolveNewPlayer = (data: NewPlayerData) => Promise<{
  player: ExistingPlayerIdentity
  matchedBy: IdentityMatchType | null
}>

interface NewPlayerFormProps {
  onSubmit: (data: NewPlayerData) => void
  onExistingPlayerSelect: (player: PlayerInfo) => void
  resolveNewPlayer?: ResolveNewPlayer
  playerNumber?: 1 | 2
  tournamentGender?: string
}

export default function NewPlayerForm({ onSubmit, onExistingPlayerSelect, resolveNewPlayer, playerNumber, tournamentGender }: NewPlayerFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const [showIdentityModal, setShowIdentityModal] = useState(false)
  const [existingPlayerFound, setExistingPlayerFound] = useState<ExistingPlayerIdentity | null>(null)
  const [identityMatchedBy, setIdentityMatchedBy] = useState<IdentityMatchType>("name")
  const [pendingValues, setPendingValues] = useState<NewPlayerFormValues | null>(null)

  const form = useForm<NewPlayerFormValues>({
    resolver: zodResolver(newPlayerSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      dni: "",
      phone: "",
      gender: tournamentGender === "FEMALE" ? "FEMALE" : "MALE",
    },
  })

  const handleSubmit = async (values: NewPlayerFormValues) => {
    setIsSubmitting(true)
    setSubmitError(undefined)

    try {
      const newPlayer = { ...values, dni: values.dni?.trim() || null }
      const result = resolveNewPlayer
        ? await resolveNewPlayer(newPlayer)
        : await checkPlayerIdentity({ firstName: values.first_name, lastName: values.last_name, dni: newPlayer.dni, gender: values.gender })
      if ('success' in result && !result.success) {
        throw new Error(result.error || "No se pudo verificar la identidad del jugador")
      }

      if (result.player && result.matchedBy) {
        setExistingPlayerFound(result.player)
        setIdentityMatchedBy(result.matchedBy)
        setPendingValues(values)
        setShowIdentityModal(true)
        return
      }

      if (resolveNewPlayer && result.player) onExistingPlayerSelect(result.player)
      else onSubmit({ ...newPlayer, phone: values.phone || undefined })
      form.reset()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'No se pudo cargar el jugador.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUseExistingPlayer = () => {
    if (!existingPlayerFound) return

    onExistingPlayerSelect(existingPlayerFound)

    form.reset()
    setShowIdentityModal(false)
    setExistingPlayerFound(null)
    setPendingValues(null)
    setIdentityMatchedBy("name")
  }

  const handleRejectExistingPlayer = () => {
    if (!pendingValues) {
      setShowIdentityModal(false)
      setExistingPlayerFound(null)
      return
    }

    const normalizedDni = pendingValues.dni?.trim() || ""

    onSubmit({
      first_name: pendingValues.first_name,
      last_name: pendingValues.last_name,
      dni: normalizedDni || null,
      phone: pendingValues.phone || undefined,
      gender: pendingValues.gender,
      forceCreateNew: true,
    })

    form.reset()
    setShowIdentityModal(false)
    setExistingPlayerFound(null)
    setPendingValues(null)
    setIdentityMatchedBy("name")
  }

  const modalDescription =
    identityMatchedBy === "dni"
      ? `Coincide por DNI (${existingPlayerFound?.dni || "informado"}).`
      : "Coincide por nombre y apellido."

  return (
    <div className="space-y-4">
      {playerNumber && <div className="text-sm text-muted-foreground">Complete los datos del nuevo jugador {playerNumber}</div>}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="first_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input placeholder="Ingrese el nombre" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="last_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Apellido</FormLabel>
                <FormControl>
                  <Input placeholder="Ingrese el apellido" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dni"
            render={({ field }) => (
              <FormItem>
                <FormLabel>DNI opcional</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Puede dejarlo vacio y cargarlo despues"
                    {...field}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "")
                      field.onChange(value)
                    }}
                    onPaste={(e) => {
                      e.preventDefault()
                      const pastedText = e.clipboardData.getData("text")
                      const cleanedValue = pastedText.replace(/\D/g, "").slice(0, 8)
                      field.onChange(cleanedValue)
                    }}
                    maxLength={8}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">Si lo dejas vacio, el jugador quedara con DNI pendiente.</p>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefono (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="Ingrese el telefono" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Genero</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar genero" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="MALE" disabled={tournamentGender === "FEMALE"}>
                      Caballeros
                    </SelectItem>
                    <SelectItem value="FEMALE">Damas</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verificando jugador…
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                {playerNumber ? `Crear Jugador ${playerNumber}` : 'Crear jugador'}
              </>
            )}
          </Button>
        </form>
      </Form>

      {showIdentityModal && existingPlayerFound && (
        <Dialog open={showIdentityModal} onOpenChange={setShowIdentityModal}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                ¿Es el mismo jugador?
              </DialogTitle>
              <DialogDescription>{modalDescription}</DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <div className="bg-blue-50 border border-blue-200 rounded-surface p-4 space-y-3">
                <h4 className="font-semibold text-blue-900">Datos del jugador encontrado:</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-600">Nombre:</span>
                    <span className="font-semibold text-slate-800">
                      {existingPlayerFound.first_name} {existingPlayerFound.last_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-600">DNI:</span>
                    <PlayerDniDisplay dni={existingPlayerFound.dni} className="font-semibold text-slate-800" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-600">Puntaje:</span>
                    <div className="flex items-center gap-1">
                      <Trophy className="h-4 w-4 text-yellow-500" />
                      <span className="font-semibold text-slate-800">{existingPlayerFound.score || "No disponible"}</span>
                    </div>
                  </div>
                  {existingPlayerFound.category_name && (
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-600">Categoria:</span>
                      <span className="font-semibold text-slate-800">{existingPlayerFound.category_name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              {resolveNewPlayer ? (
                <Button type="button" variant="outline" onClick={() => setShowIdentityModal(false)} className="w-full sm:w-auto">
                  Volver al formulario
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={handleRejectExistingPlayer} className="w-full sm:w-auto">
                  No usar, crear nuevo
                </Button>
              )}
              <Button type="button" onClick={handleUseExistingPlayer} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
                Usar este jugador
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
