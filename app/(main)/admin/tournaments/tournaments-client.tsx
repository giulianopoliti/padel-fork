"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trophy, Edit, Settings, Search } from "lucide-react"
import { AdminEditModal } from "@/components/admin/AdminEditModal"
import { EditTournamentForm } from "@/components/admin/EditTournamentForm"
import { TournamentActionsMenu } from "@/components/admin/TournamentActionsMenu"
import { updateTournament } from "@/app/api/admin/tournaments/actions"
import { useToast } from "@/components/ui/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Tournament {
  id: string
  name: string
  description: string | null
  price: number | null
  award: string | null
  max_participants: number | null
  category_name: string | null
  gender: string | null
  type: string | null
  start_date: string | null
  end_date: string | null
  status: string
  created_at: string
  clubes?: {
    name: string
  } | null
  organizaciones?: {
    name: string
  } | null
}

interface TournamentsClientProps {
  tournaments: Tournament[]
}

export const TournamentsClient = ({ tournaments: initialTournaments }: TournamentsClientProps) => {
  const { toast } = useToast()
  const [tournaments] = useState(initialTournaments)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null)
  const [actionsMenuOpen, setActionsMenuOpen] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Tournament>>({})
  const [isSaving, setIsSaving] = useState(false)

  // Filtrar torneos
  const filteredTournaments = tournaments.filter((tournament) => {
    const matchesSearch = tournament.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "ALL" || tournament.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleEdit = (tournament: Tournament) => {
    setEditingTournament(tournament)
    setEditData({})
  }

  const handleSave = async () => {
    if (!editingTournament) return

    setIsSaving(true)
    try {
      const result = await updateTournament(editingTournament.id, editData)
      if (result.success) {
        toast({
          title: "Éxito",
          description: "Torneo actualizado correctamente"
        })
        setEditingTournament(null)
        setEditData({})
        window.location.reload()
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al actualizar el torneo",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "NOT_STARTED":
        return <Badge variant="outline" className="text-slate-600">No Iniciado</Badge>
      case "ZONE_PHASE":
        return <Badge className="bg-blue-100 text-blue-800">Fase de Zonas</Badge>
      case "BRACKET_PHASE":
        return <Badge className="bg-yellow-100 text-yellow-800">Fase de Bracket</Badge>
      case "FINISHED":
        return <Badge className="bg-green-100 text-green-800">Finalizado</Badge>
      case "CANCELED":
        return <Badge variant="destructive">Cancelado</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Trophy className="h-8 w-8" />
            Torneos
          </h1>
          <p className="text-slate-600 mt-2">
            Gestión completa de torneos con acciones especiales
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {filteredTournaments.length} torneos
        </Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nombre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los estados</SelectItem>
                <SelectItem value="NOT_STARTED">No Iniciado</SelectItem>
                <SelectItem value="ZONE_PHASE">Fase de Zonas</SelectItem>
                <SelectItem value="BRACKET_PHASE">Fase de Bracket</SelectItem>
                <SelectItem value="FINISHED">Finalizado</SelectItem>
                <SelectItem value="CANCELED">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Desktop Table View */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Listado de Torneos</CardTitle>
          <CardDescription>
            Gestiona todos los torneos del sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Nombre</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Categoría</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Estado</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Tipo</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Club/Org</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Fechas</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Max</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Precio</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredTournaments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-500">
                      No se encontraron torneos
                    </td>
                  </tr>
                ) : (
                  filteredTournaments.map((tournament) => (
                    <tr key={tournament.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium">{tournament.name}</td>
                      <td className="py-3 px-4">{tournament.category_name || "-"}</td>
                      <td className="py-3 px-4">{getStatusBadge(tournament.status)}</td>
                      <td className="py-3 px-4 text-xs">
                        {tournament.type?.replace("AMERICAN_", "Americano ") || "-"}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {tournament.clubes?.name || tournament.organizaciones?.name || "-"}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {tournament.start_date
                          ? new Date(tournament.start_date).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {tournament.max_participants || "-"}
                      </td>
                      <td className="py-3 px-4">${tournament.price || 0}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(tournament)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setActionsMenuOpen(
                                actionsMenuOpen === tournament.id ? null : tournament.id
                              )
                            }
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                        {/* Actions Menu Dropdown */}
                        {actionsMenuOpen === tournament.id && (
                          <div className="absolute right-0 mt-2 w-64 bg-white border rounded-surface shadow-lg p-2 z-10">
                            <TournamentActionsMenu
                              tournamentId={tournament.id}
                              tournamentName={tournament.name}
                              tournamentStatus={tournament.status}
                              onActionComplete={() => {
                                setActionsMenuOpen(null)
                                window.location.reload()
                              }}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Cards View */}
      <div className="md:hidden space-y-4">
        {filteredTournaments.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-500">
              No se encontraron torneos
            </CardContent>
          </Card>
        ) : (
          filteredTournaments.map((tournament) => (
            <Card key={tournament.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <CardTitle className="text-base">{tournament.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {tournament.clubes?.name || tournament.organizaciones?.name || "Sin organizador"}
                    </CardDescription>
                  </div>
                  {getStatusBadge(tournament.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Categoría:</span>
                  <span>{tournament.category_name || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tipo:</span>
                  <span className="text-xs">{tournament.type?.replace("AMERICAN_", "Americano ") || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Fecha inicio:</span>
                  <span>
                    {tournament.start_date
                      ? new Date(tournament.start_date).toLocaleDateString("es-ES")
                      : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Max participantes:</span>
                  <span>{tournament.max_participants || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Precio:</span>
                  <span className="font-semibold">${tournament.price || 0}</span>
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(tournament)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() =>
                      setActionsMenuOpen(
                        actionsMenuOpen === tournament.id ? null : tournament.id
                      )
                    }
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Acciones
                  </Button>
                </div>
                {/* Actions Menu Dropdown for Mobile */}
                {actionsMenuOpen === tournament.id && (
                  <div className="mt-2 border rounded-surface p-2 bg-slate-50">
                    <TournamentActionsMenu
                      tournamentId={tournament.id}
                      tournamentName={tournament.name}
                      tournamentStatus={tournament.status}
                      onActionComplete={() => {
                        setActionsMenuOpen(null)
                        window.location.reload()
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Modal */}
      {editingTournament && (
        <AdminEditModal
          isOpen={true}
          onClose={() => {
            setEditingTournament(null)
            setEditData({})
          }}
          onSave={handleSave}
          title={`Editar Torneo: ${editingTournament.name}`}
          isSaving={isSaving}
        >
          <EditTournamentForm tournament={editingTournament} onDataChange={setEditData} />
        </AdminEditModal>
      )}
    </div>
  )
}
