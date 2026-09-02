"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { Search, UserPlus, Loader2, AlertCircle, Trophy } from "lucide-react"
import { checkPlayerIdentity } from "@/app/api/players/actions"
import { Gender } from "@/types"
import { searchPlayers } from "@/utils/fuzzy-search"
import PlayerDniDisplay from "@/components/players/player-dni-display"

const searchSchema = z.object({
  searchTerm: z.string().min(3, "Ingrese al menos 3 caracteres para buscar"),
})

const newPlayerSchema = z.object({
  firstName: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  lastName: z.string().min(2, "El apellido debe tener al menos 2 caracteres"),
  dni: z.string().optional(),
  phone: z
    .string()
    .optional()
    .refine((val) => !val || val.length >= 8, {
      message: "El telefono debe tener al menos 8 caracteres",
    }),
  gender: z.nativeEnum(Gender),
})

type NewPlayerFormValues = z.infer<typeof newPlayerSchema>
type IdentityMatchType = "dni" | "name"

interface PlayerInfo {
  id: string
  first_name?: string | null
  last_name?: string | null
  score?: number | null
  dni?: string | null
  phone?: string | null
  gender?: string | null
  category_name?: string | null
}

interface RegisterPlayerFormProps {
  tournamentId: string
  onSuccess: () => void
  existingPlayers: PlayerInfo[]
  tournamentGender: Gender
}

export default function RegisterPlayerForm({
  tournamentId,
  onSuccess,
  existingPlayers,
  tournamentGender
}: RegisterPlayerFormProps) {
  const [activeTab, setActiveTab] = useState("search")
  const [searchResults, setSearchResults] = useState<PlayerInfo[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerInfo | null>(null)
  const [showIdentityModal, setShowIdentityModal] = useState(false)
  const [existingIdentityPlayer, setExistingIdentityPlayer] = useState<PlayerInfo | null>(null)
  const [identityMatchedBy, setIdentityMatchedBy] = useState<IdentityMatchType>("name")
  const [pendingNewPlayerValues, setPendingNewPlayerValues] = useState<NewPlayerFormValues | null>(null)

  const searchForm = useForm<z.infer<typeof searchSchema>>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      searchTerm: "",
    },
  })

  const newPlayerForm = useForm<NewPlayerFormValues>({
    resolver: zodResolver(newPlayerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      dni: "",
      gender: tournamentGender === Gender.FEMALE ? Gender.FEMALE : Gender.MALE,
    },
  })

  const handleSearch = async (values: z.infer<typeof searchSchema>) => {
    setIsSearching(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 300))

      const results = searchPlayers(
        values.searchTerm,
        existingPlayers,
        0.8,
      )

      setSearchResults(results)

      if (results.length === 0) {
        toast({
          title: "No se encontraron resultados",
          description: "No se encontraron jugadores con ese criterio de busqueda",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error al buscar jugadores:", error)
      toast({
        title: "Error",
        description: "Ocurrio un error al buscar jugadores",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectPlayer = (player: PlayerInfo) => {
    setSelectedPlayer(player)
  }

  const registerExistingPlayerById = async (playerId: string) => {
    setIsRegistering(true)
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/register-individual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerId,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: "Jugador inscrito",
          description: "El jugador ha sido inscrito exitosamente en el torneo",
        })
        onSuccess()
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else if (result.error?.includes("femenino")) {
        toast({
          title: "Error",
          description: "El torneo es unicamente para mujeres",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Error",
          description: result.error || "No se pudo inscribir al jugador, ya esta inscripto o es de otro genero",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error al inscribir jugador:", error)
      toast({
        title: "Error",
        description: "Ocurrio un error al inscribir al jugador",
        variant: "destructive",
      })
    } finally {
      setIsRegistering(false)
    }
  }

  const handleRegisterExistingPlayer = async () => {
    if (!selectedPlayer) return
    await registerExistingPlayerById(selectedPlayer.id)
  }

  const submitNewPlayer = async (
    values: NewPlayerFormValues,
    forceCreateNew = false,
  ) => {
    const response = await fetch(`/api/tournaments/${tournamentId}/register-individual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone || "",
        dni: values.dni || null,
        gender: values.gender,
        forceCreateNew,
      }),
    })

    const result = await response.json()

    if (result.success) {
      toast({
        title: "Jugador registrado",
        description: "El nuevo jugador ha sido registrado e inscrito exitosamente en el torneo con categorizacion automatica",
      })
      onSuccess()
      setTimeout(() => {
        window.location.reload()
      }, 1000)
      return true
    }

    toast({
      title: "Error",
      description: result.error || "No se pudo registrar al jugador",
      variant: "destructive",
    })
    return false
  }

  const handleRegisterNewPlayer = async (values: NewPlayerFormValues) => {
    setIsRegistering(true)
    try {
      const normalizedDni = values.dni?.trim() || ""
      const identityData = await checkPlayerIdentity({
        firstName: values.firstName,
        lastName: values.lastName,
        dni: normalizedDni || null,
        gender: values.gender,
      })

      if (!identityData.success) {
        throw new Error(identityData.error || "No se pudo verificar la identidad del jugador")
      }

      if (identityData.exists && identityData.player) {
        setExistingIdentityPlayer(identityData.player)
        setIdentityMatchedBy(identityData.matchedBy || "name")
        setPendingNewPlayerValues(values)
        setShowIdentityModal(true)
        return
      }

      await submitNewPlayer(values, false)
    } catch (error) {
      console.error("Error al registrar nuevo jugador:", error)
      toast({
        title: "Error",
        description: "Ocurrio un error al registrar al nuevo jugador",
        variant: "destructive",
      })
    } finally {
      setIsRegistering(false)
    }
  }

  const resetIdentityPrompt = () => {
    setShowIdentityModal(false)
    setExistingIdentityPlayer(null)
    setPendingNewPlayerValues(null)
    setIdentityMatchedBy("name")
  }

  const handleUseMatchedPlayer = async () => {
    if (!existingIdentityPlayer) return
    setShowIdentityModal(false)
    await registerExistingPlayerById(existingIdentityPlayer.id)
    resetIdentityPrompt()
  }

  const handleCreateNewAnyway = async () => {
    if (!pendingNewPlayerValues) return
    setShowIdentityModal(false)
    setIsRegistering(true)
    try {
      await submitNewPlayer(pendingNewPlayerValues, true)
    } finally {
      setIsRegistering(false)
      resetIdentityPrompt()
    }
  }

  const identityModalDescription =
    identityMatchedBy === "dni"
      ? `Coincide por DNI (${existingIdentityPlayer?.dni || "informado"}). El jugador es este?`
      : "Coincide por nombre y apellido. El jugador es este?"

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid grid-cols-2 mb-4">
        <TabsTrigger value="search" className="data-[state=active]:bg-violet-100 data-[state=active]:text-violet-700">
          <Search className="mr-2 h-4 w-4" />
          Buscar Jugador
        </TabsTrigger>
        <TabsTrigger value="new" className="data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700">
          <UserPlus className="mr-2 h-4 w-4" />
          Nuevo Jugador
        </TabsTrigger>
      </TabsList>

      <TabsContent value="search" className="space-y-4">
        <Form {...searchForm}>
          <form onSubmit={searchForm.handleSubmit(handleSearch)} className="space-y-4">
            <FormField
              control={searchForm.control}
              name="searchTerm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Buscar por nombre, apellido o DNI</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input placeholder="Ingrese al menos 3 caracteres..." {...field} className="flex-1" />
                      <Button type="submit" disabled={isSearching}>
                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        {searchResults.length > 0 && (
          <div className="border rounded-control overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b">
              <h3 className="font-medium text-slate-700">Resultados de busqueda</h3>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {searchResults.map((player) => (
                <div
                  key={player.id}
                  className={`px-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-slate-50 transition-colors ${
                    selectedPlayer?.id === player.id ? "bg-violet-50" : ""
                  }`}
                  onClick={() => handleSelectPlayer(player)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-slate-700">
                        {player.first_name} {player.last_name}
                      </p>
                      <div className="text-sm text-slate-500">
                        <PlayerDniDisplay dni={player.dni} />
                      </div>
                    </div>
                    {player.score !== undefined && player.score !== null && (
                      <div className="bg-violet-50 text-violet-700 font-medium rounded-full h-8 w-8 flex items-center justify-center border border-violet-200">
                        {player.score}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedPlayer && (
          <div className="mt-4 pt-4 border-t">
            <h3 className="font-medium text-slate-700 mb-2">Jugador seleccionado</h3>
            <div className="bg-violet-50 border border-violet-100 rounded-control p-4">
              <p className="font-medium text-violet-700">
                {selectedPlayer.first_name} {selectedPlayer.last_name}
              </p>
              <div className="text-sm text-slate-600">
                <PlayerDniDisplay dni={selectedPlayer.dni} />
              </div>
              <p className="text-sm text-slate-600">Telefono: {selectedPlayer.phone || "No disponible"}</p>
              {selectedPlayer.score !== undefined && selectedPlayer.score !== null && (
                <p className="text-sm text-slate-600">Puntaje: {selectedPlayer.score}</p>
              )}
            </div>
            <Button
              onClick={handleRegisterExistingPlayer}
              className="w-full mt-4 bg-gradient-to-r from-violet-600 to-violet-800"
              disabled={isRegistering}
            >
              {isRegistering ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Inscribir Jugador
            </Button>
          </div>
        )}
      </TabsContent>

      <TabsContent value="new">
        <Form {...newPlayerForm}>
          <form onSubmit={newPlayerForm.handleSubmit(handleRegisterNewPlayer)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={newPlayerForm.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del jugador" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newPlayerForm.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido</FormLabel>
                    <FormControl>
                      <Input placeholder="Apellido del jugador" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={newPlayerForm.control}
                name="dni"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>DNI opcional</FormLabel>
                    <FormControl>
                      <Input placeholder="Puedes dejarlo vacio y cargarlo despues" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newPlayerForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefono</FormLabel>
                    <FormControl>
                      <Input placeholder="Telefono del jugador" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={newPlayerForm.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Genero</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione el genero" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem
                          value={Gender.MALE}
                          disabled={tournamentGender === Gender.FEMALE}
                        >
                          Caballeros
                        </SelectItem>
                        <SelectItem value={Gender.FEMALE}>Damas</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-800"
              disabled={isRegistering}
            >
              {isRegistering ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Registrar e Inscribir Jugador
            </Button>
          </form>
        </Form>
      </TabsContent>

      {showIdentityModal && existingIdentityPlayer && (
        <Dialog open={showIdentityModal} onOpenChange={(open) => !open && resetIdentityPrompt()}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                El jugador es este?
              </DialogTitle>
              <DialogDescription>{identityModalDescription}</DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <div className="bg-blue-50 border border-blue-200 rounded-surface p-4 space-y-3">
                <h4 className="font-semibold text-blue-900">Datos del jugador encontrado:</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-600">Nombre:</span>
                    <span className="font-semibold text-slate-800">
                      {existingIdentityPlayer.first_name} {existingIdentityPlayer.last_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-600">DNI:</span>
                    <PlayerDniDisplay dni={existingIdentityPlayer.dni} className="font-semibold text-slate-800" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-600">Puntaje:</span>
                    <div className="flex items-center gap-1">
                      <Trophy className="h-4 w-4 text-yellow-500" />
                      <span className="font-semibold text-slate-800">{existingIdentityPlayer.score ?? "No disponible"}</span>
                    </div>
                  </div>
                  {existingIdentityPlayer.category_name && (
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-600">Categoria:</span>
                      <span className="font-semibold text-slate-800">{existingIdentityPlayer.category_name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleCreateNewAnyway} className="w-full sm:w-auto" disabled={isRegistering}>
                No usar, crear nuevo
              </Button>
              <Button onClick={handleUseMatchedPlayer} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700" disabled={isRegistering}>
                Usar este jugador
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Tabs>
  )
}
