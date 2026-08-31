"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Trophy,
  Users,
  Calendar,
  MapPin,
  Phone,
  UserPlus,
  UserCog,
  ChevronLeft,
  Clock,
  Award,
  Mail,
  UserX,
  AlertTriangle
} from "lucide-react"
import RegisterPlayerForm from "./register-player-form"
import RegisterCoupleForm from "./register-couple-form"
import { useUser } from "@/contexts/user-context"
import { removePlayerFromTournament } from "@/app/api/tournaments/actions"
import { toast } from "@/components/ui/use-toast"
import { getTenantBranding } from "@/config/tenant"
import { Gender } from "@/types"

// Tipos (mismos que guest-tournament-client)
interface Tournament {
  id: string
  name: string
  startDate: string
  endDate: string
  status: string
  category: string
  type?: string
  maxParticipants?: number
  currentParticipants?: number
  address?: string
  time?: string
  prize?: string
  description?: string
  price?: number | null
  club?: {
    id: string
    name: string
    image?: string
  }
  gender?: Gender // Added gender to Tournament interface
}

interface Category {
  name: string
  lower_range: number
  upper_range: number
}

interface PlayerDTO {
  id: string
  first_name: string
  last_name: string
  score: number
  dni?: string | null
}

interface Club {
  id: string
  name: string
  address?: string | null
  phone?: string | null
  email?: string | null
}

interface PlayerInfo {
  id: string
  first_name: string | null
  last_name: string | null
  score: number | null
}

interface ProcessedCouple {
  id: string
  player1_id: string
  player2_id: string
  created_at: string
  player_1_info: PlayerInfo | null
  player_2_info: PlayerInfo | null
}

interface PlayerTournamentClientProps {
  tournament: Tournament
  category: Category | null
  club: Club | null
  players: PlayerInfo[]
  couples: ProcessedCouple[]
  allPlayersForSearch: PlayerDTO[]
}

export default function PlayerTournamentClient({
  tournament,
  category,
  club,
  players,
  couples,
  allPlayersForSearch,
}: PlayerTournamentClientProps) {
  const [coupleDialogOpen, setCoupleDialogOpen] = useState(false)
  const [soloDialogOpen, setSoloDialogOpen] = useState(false)
  const [isUnregistering, setIsUnregistering] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, userDetails } = useUser()

  const isTournamentActive = tournament.status !== "NOT_STARTED"
  const millisecondsUntilStart = tournament.startDate
    ? new Date(tournament.startDate).getTime() - Date.now()
    : null
  const isTpeLateCancellation = getTenantBranding().key === "padel-elite"
    && tournament.type === "AMERICAN"
    && millisecondsUntilStart !== null
    && millisecondsUntilStart >= 0
    && millisecondsUntilStart < 3 * 60 * 60 * 1000
  const registerBaseHref = `/register?role=PLAYER&redirectTo=${encodeURIComponent(pathname)}`

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
  }

  const getCategoryName = () => {
    return category ? category.name : "No especificada"
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "NOT_STARTED":
        return "Próximamente"
      case "IN_PROGRESS":
        return "En curso"
      case "FINISHED":
        return "Finalizado"
      case "PAIRING":
        return "En fase de emparejamiento"
      default:
        return status
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "NOT_STARTED":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "IN_PROGRESS":
        return "bg-green-100 text-green-800 border-green-200"
      case "FINISHED":
        return "bg-gray-100 text-gray-800 border-gray-200"
      case "PAIRING":
        return "bg-purple-100 text-purple-800 border-purple-200"
      default:
        return "bg-gray-100 text-gray-700 border-gray-200"
    }
  }

  const handleRegistrationComplete = (success: boolean) => {
    if (success) {
      setCoupleDialogOpen(false)
      setSoloDialogOpen(false)
      router.refresh() // Recargar la página para mostrar los datos actualizados
    }
  }

  const isUserRegistered =
    !!userDetails?.player_id &&
    (
      players.some((player) => player.id === userDetails.player_id) ||
      couples.some(
        (couple) => couple.player_1_info?.id === userDetails.player_id || couple.player_2_info?.id === userDetails.player_id,
      )
    )

  useEffect(() => {
    const intent = searchParams.get("intent")

    if (isTournamentActive || !user || isUserRegistered) {
      return
    }

    if (intent === "individual") {
      setSoloDialogOpen(true)
    }

    if (intent === "couple") {
      setCoupleDialogOpen(true)
    }

    if (intent === "individual" || intent === "couple") {
      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.delete("intent")
      const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname
      router.replace(nextUrl, { scroll: false })
    }
  }, [isTournamentActive, isUserRegistered, pathname, router, searchParams, user])

  const handleUnregister = async () => {
    if (!userDetails?.player_id) {
      toast({
        title: "Error",
        description: "No se pudo obtener tu información de jugador",
        variant: "destructive",
      })
      return
    }

    setIsUnregistering(true)

    try {
      const result = await removePlayerFromTournament(tournament.id)
      
      if (result.success) {
        toast({
          title: "Inscripción eliminada",
          description: result.message,
        })
        
        // Recargar la página para actualizar el estado
        router.refresh()
      } else {
        toast({
          title: "Error al eliminar inscripción",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error al eliminar inscripción:", error)
      toast({
        title: "Error inesperado",
        description: "Ocurrió un error al eliminar la inscripción",
        variant: "destructive",
      })
    } finally {
      setIsUnregistering(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Navegación */}
      <div className="mb-6">
        <Link
          href="/torneos"
          className="inline-flex items-center text-gray-600 hover:text-blue-600 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver a torneos
        </Link>
      </div>

      {/* Cabecera del torneo */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">{tournament.name}</h1>
        <p className="text-gray-600 text-lg">{tournament.club?.name || "Club no especificado"}</p>
      </div>

      {/* Imagen y información principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Imagen del torneo */}
        <div className="lg:col-span-1">
          <div className="relative h-64 lg:h-80 rounded-lg overflow-hidden shadow-sm border border-gray-200">
            <img
              src={tournament.club?.image || "/placeholder.svg?height=300&width=400"}
              alt={tournament.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 right-4">
              <Badge className={`${getStatusColor(tournament.status)} px-3 py-1`}>
                {getStatusText(tournament.status)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Información del torneo */}
        <div className="lg:col-span-2">
          <Card className="bg-white border-gray-200 shadow-sm h-full">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-gray-800">Información del Torneo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center">
                    <Calendar className="h-5 w-5 mr-3 text-blue-600" />
                    <div>
                      <span className="text-gray-700 font-medium">Fechas:</span>
                      <div className="text-gray-600">
                        {formatDate(tournament.startDate)} - {formatDate(tournament.endDate)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Clock className="h-5 w-5 mr-3 text-blue-600" />
                    <div>
                      <span className="text-gray-700 font-medium">Horario:</span>
                      <div className="text-gray-600">{tournament.time || "No especificado"}</div>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Users className="h-5 w-5 mr-3 text-blue-600" />
                    <div>
                      <span className="text-gray-700 font-medium">Categoría:</span>
                      <div className="mt-1">
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200 px-3 py-1">
                          {getCategoryName()}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center">
                    <Trophy className="h-5 w-5 mr-3 text-blue-600" />
                    <div>
                      <span className="text-gray-700 font-medium">Tipo:</span>
                      <div className="text-gray-600">
                        {tournament.type === "AMERICAN" ? "Americano" : "Eliminación"}
                      </div>
                    </div>
                  </div>

                  {tournament.prize && (
                    <div className="flex items-center">
                      <Award className="h-5 w-5 mr-3 text-blue-600" />
                      <div>
                        <span className="text-gray-700 font-medium">Premio:</span>
                        <div className="text-gray-600 font-semibold">{tournament.prize}</div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center">
                    <Users className="h-5 w-5 mr-3 text-blue-600" />
                    <div>
                      <span className="text-gray-700 font-medium">Participantes:</span>
                      <div className="text-gray-600">
                        {tournament.currentParticipants || 0}/{tournament.maxParticipants || "∞"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {tournament.description && (
                <div className="pt-4 border-t border-gray-100">
                  <h4 className="font-medium text-gray-800 mb-2">Descripción</h4>
                  <p className="text-gray-600">{tournament.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Información del club */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-gray-800">Información del Club</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center">
                <MapPin className="h-5 w-5 mr-3 text-blue-600" />
                <div>
                  <span className="text-gray-700 font-medium">Dirección:</span>
                  <div className="text-gray-600">{club?.address || tournament.address || "No especificada"}</div>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {club?.phone && (
                <div className="flex items-center">
                  <Phone className="h-5 w-5 mr-3 text-blue-600" />
                  <div>
                    <span className="text-gray-700 font-medium">Teléfono:</span>
                    <div className="text-gray-600">{club.phone}</div>
                  </div>
                </div>
              )}
              {club?.email && (
                <div className="flex items-center">
                  <Mail className="h-5 w-5 mr-3 text-blue-600" />
                  <div>
                    <span className="text-gray-700 font-medium">Email:</span>
                    <div className="text-gray-600">{club.email}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botones de acción */}
      {!isTournamentActive && (
        <div className="flex flex-wrap gap-4 justify-center">
          {!isUserRegistered ? (
            <>
              {/* Dialog para registro individual */}
              <Dialog open={soloDialogOpen} onOpenChange={setSoloDialogOpen}>
                {user ? (
                  <DialogTrigger asChild>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Inscribirme solo
                    </Button>
                  </DialogTrigger>
                ) : (
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3"
                    onClick={() => router.push(`${registerBaseHref}&intent=individual`)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Inscribirme solo
                  </Button>
                )}
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Inscripción Individual</DialogTitle>
                    <DialogDescription>
                      Completa tu registro individual para el torneo {tournament.name}
                    </DialogDescription>
                  </DialogHeader>
                  <RegisterPlayerForm
                    tournamentId={tournament.id}
                    tournament={tournament}
                    onComplete={handleRegistrationComplete}
                  />
                </DialogContent>
              </Dialog>

              {/* Dialog para registro de pareja */}
              <Dialog open={coupleDialogOpen} onOpenChange={setCoupleDialogOpen}>
                {user ? (
                  <DialogTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3">
                      <Users className="mr-2 h-4 w-4" />
                      Inscribir pareja
                    </Button>
                  </DialogTrigger>
                ) : (
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3"
                    onClick={() => router.push(`${registerBaseHref}&intent=couple`)}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Inscribir pareja
                  </Button>
                )}
                <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Inscripción de Pareja</DialogTitle>
                    <DialogDescription>
                      Registra una pareja para el torneo {tournament.name}
                    </DialogDescription>
                  </DialogHeader>
                  <RegisterCoupleForm
                    tournamentId={tournament.id}
                    onComplete={handleRegistrationComplete}
                    players={allPlayersForSearch}
                    tournamentGender={tournament.gender as Gender}
                  />
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Mensaje de confirmación */}
              <div className="flex items-center bg-green-50 text-green-700 px-4 py-2 rounded-lg border border-green-200">
                <Trophy className="mr-2 h-5 w-5" />
                <span className="font-medium">Ya estás registrado en este torneo</span>
              </div>
              
              {/* Botón eliminar inscripción */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 px-6 py-3"
                    disabled={isUnregistering}
                  >
                    <UserX className="mr-2 h-4 w-4" />
                    Eliminar inscripción
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[400px]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center text-red-600">
                      <AlertTriangle className="mr-2 h-5 w-5" />
                      Confirmar eliminación
                    </DialogTitle>
                    <DialogDescription className="pt-2">
                      {isTpeLateCancellation
                        ? "Faltan menos de 3 horas para que comience el torneo. Si confirmás la baja, deberás abonar de igual forma el 50% de la inscripción. ¿Estás seguro de dar la baja?"
                        : <>¿Estás seguro de que quieres eliminar tu inscripción del torneo "{tournament.name}"? Esta acción no se puede deshacer.</>}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {}}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleUnregister}
                      disabled={isUnregistering}
                    >
                      {isUnregistering ? "Eliminando..." : "Eliminar"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      )}

      {/* Tabs para diferentes secciones */}
      <Tabs defaultValue="players" className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <TabsList className="w-full border-b border-gray-200 bg-gray-50 p-1">
          <TabsTrigger
            value="players"
            className="flex-1 py-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Jugadores Individuales
          </TabsTrigger>
          <TabsTrigger
            value="couples"
            className="flex-1 py-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            <Users className="mr-2 h-4 w-4" />
            Parejas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="players" className="p-6">
          {players.length > 0 ? (
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow className="border-b border-gray-200">
                  <TableHead className="font-medium text-gray-700">Nombre</TableHead>
                  <TableHead className="font-medium text-gray-700">Apellido</TableHead>
                  <TableHead className="font-medium text-gray-700 text-center">Puntaje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((player) => (
                  <TableRow key={player.id} className="hover:bg-gray-50 border-b border-gray-100">
                    <TableCell className="text-left font-medium text-gray-800">{player.first_name || "—"}</TableCell>
                    <TableCell className="text-left text-gray-700">{player.last_name || "—"}</TableCell>
                    <TableCell className="text-center">
                      {player.score !== null ? (
                        <div className="inline-flex items-center justify-center bg-blue-100 text-blue-700 font-medium rounded-full h-10 w-10 border border-blue-200">
                          {player.score}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserPlus className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-medium text-gray-700 mb-2">No hay jugadores inscritos</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                Aún no hay jugadores individuales inscritos en este torneo.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="couples" className="p-6">
          {couples.length > 0 ? (
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow className="border-b border-gray-200">
                  <TableHead className="font-medium text-gray-700">Jugador 1</TableHead>
                  <TableHead className="font-medium text-gray-700 text-center">Puntaje</TableHead>
                  <TableHead className="font-medium text-gray-700">Jugador 2</TableHead>
                  <TableHead className="font-medium text-gray-700 text-center">Puntaje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {couples.map((couple) => (
                  <TableRow key={couple.id} className="hover:bg-gray-50 border-b border-gray-100">
                    <TableCell className="text-left font-medium text-gray-800">
                      {couple.player_1_info
                        ? `${couple.player_1_info.first_name || ""} ${couple.player_1_info.last_name || ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {couple.player_1_info?.score !== null && couple.player_1_info?.score !== undefined ? (
                        <div className="inline-flex items-center justify-center bg-blue-100 text-blue-700 font-medium rounded-full h-9 w-9 border border-blue-200">
                          {couple.player_1_info.score}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-left font-medium text-gray-800">
                      {couple.player_2_info
                        ? `${couple.player_2_info.first_name || ""} ${couple.player_2_info.last_name || ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {couple.player_2_info?.score !== null && couple.player_2_info?.score !== undefined ? (
                        <div className="inline-flex items-center justify-center bg-blue-100 text-blue-700 font-medium rounded-full h-9 w-9 border border-blue-200">
                          {couple.player_2_info.score}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-medium text-gray-700 mb-2">No hay parejas inscritas</h3>
              <p className="text-gray-500 max-w-md mx-auto">Aún no hay parejas inscritas en este torneo.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
