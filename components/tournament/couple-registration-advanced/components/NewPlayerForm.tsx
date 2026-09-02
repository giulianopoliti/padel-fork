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

import { NewPlayerData } from "../types"

const newPlayerSchema = z.object({
  first_name: z.string().min(1, "El nombre es requerido"),
  last_name: z.string().min(1, "El apellido es requerido"),
  dni: z.string().optional(),
  phone: z.string().optional(),
  gender: z.string().min(1, "El genero es requerido"),
})

type NewPlayerFormValues = z.infer<typeof newPlayerSchema>

type IdentityMatchType = "dni" | "name"

interface ExistingPlayerIdentity {
  id: string
  first_name?: string | null
  last_name?: string | null
  dni?: string | null
  score?: number | null
  category_name?: string | null
}

interface NewPlayerFormProps {
  onSubmit: (data: NewPlayerData) => void
  playerNumber: 1 | 2
  tournamentGender?: string
}

export default function NewPlayerForm({ onSubmit, playerNumber, tournamentGender }: NewPlayerFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
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

    try {
      const normalizedDni = values.dni?.trim() || ""

      const identityData = await checkPlayerIdentity({
        firstName: values.first_name,
        lastName: values.last_name,
        dni: normalizedDni || null,
        gender: values.gender,
      })

      if (!identityData.success) {
        throw new Error(identityData.error || "No se pudo verificar la identidad del jugador")
      }

      if (identityData.exists && identityData.player) {
        setExistingPlayerFound(identityData.player)
        setIdentityMatchedBy(identityData.matchedBy || "name")
        setPendingValues(values)
        setShowIdentityModal(true)
        return
      }

      onSubmit({
        first_name: values.first_name,
        last_name: values.last_name,
        dni: normalizedDni || null,
        phone: values.phone || undefined,
        gender: values.gender,
      })

      form.reset()
    } catch (error) {
      console.error("Error creating player:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUseExistingPlayer = () => {
    if (!existingPlayerFound) return

    onSubmit({
      ...(existingPlayerFound as any),
      isExisting: true,
    } as any)

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

  const modalTitle =
    identityMatchedBy === "dni"
      ? "El jugador es este?"
      : "El jugador es este?"

  const modalDescription =
    identityMatchedBy === "dni"
      ? `Coincide por DNI (${existingPlayerFound?.dni || "informado"}).`
      : "Coincide por nombre y apellido."

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">Complete los datos del nuevo jugador {playerNumber}</div>

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

          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creando jugador...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Crear Jugador {playerNumber}
              </>
            )}
          </Button>
        </form>
      </Form>

      {showIdentityModal && existingPlayerFound && (
        <Dialog open={showIdentityModal} onOpenChange={setShowIdentityModal}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                {modalTitle}
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
              <Button variant="outline" onClick={handleRejectExistingPlayer} className="w-full sm:w-auto">
                No usar, crear nuevo
              </Button>
              <Button onClick={handleUseExistingPlayer} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
                Usar este jugador
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
