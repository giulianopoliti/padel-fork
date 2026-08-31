"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { UserCircle, Edit, Link2, Search, ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp } from "lucide-react"
import { AdminEditModal } from "@/components/admin/AdminEditModal"
import { EditPlayerForm } from "@/components/admin/EditPlayerForm"
import { PlayerUserLinkComponent } from "@/components/admin/PlayerUserLinkComponent"
import { ExportPlayersModal } from "@/components/admin/ExportPlayersModal"
import { updatePlayer, getCategories, searchPlayersAdvanced, type ExportPlayersFilters } from "@/app/api/admin/players/actions"
import { useToast } from "@/components/ui/use-toast"
import { getCategoryColor } from "@/lib/utils/category-colors"

interface Player {
  id: string
  first_name: string
  last_name: string
  dni: string | null
  phone: string | null
  date_of_birth?: string | null
  address?: string | null
  gender: string | null
  instagram_handle?: string | null
  score: number
  category_name: string | null
  preferred_hand?: string | null
  preferred_side?: string | null
  racket?: string | null
  user_id: string | null
  club_id?: string | null
  status: string
  description?: string | null
  created_at: string
  users?: {
    email: string
  } | null
  clubes?: {
    name: string
  } | null
}

interface PlayersClientProps {
  initialPlayers: Player[]
  initialTotalCount: number
  initialTotalPages: number
  initialPage: number
}

interface Category {
  name: string
  lower_range: number
  upper_range: number
}

export const PlayersClient = ({
  initialPlayers,
  initialTotalCount,
  initialTotalPages,
  initialPage
}: PlayersClientProps) => {
  const { toast } = useToast()
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [searchTerm, setSearchTerm] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  // Estados de filtros avanzados
  const [onlyWithoutEmail, setOnlyWithoutEmail] = useState(false)
  const [onlyWithoutDNI, setOnlyWithoutDNI] = useState(false)
  const [onlyWithoutPhone, setOnlyWithoutPhone] = useState(false)
  const [onlyTestPlayers, setOnlyTestPlayers] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [selectedGender, setSelectedGender] = useState<string>("all")
  const [minScore, setMinScore] = useState<string>("")
  const [maxScore, setMaxScore] = useState<string>("")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [linkingPlayer, setLinkingPlayer] = useState<Player | null>(null)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [editData, setEditData] = useState<Partial<Player>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])

  // Cargar categorías al montar
  useEffect(() => {
    const loadCategories = async () => {
      const result = await getCategories()
      if (result.data) {
        setCategories(result.data)
      }
    }
    loadCategories()
  }, [])

  const buildFilters = (): ExportPlayersFilters => {
    const filters: ExportPlayersFilters = {}

    if (searchTerm.trim()) filters.searchTerm = searchTerm
    if (onlyWithoutEmail) filters.onlyWithoutEmail = true
    if (onlyWithoutDNI) filters.onlyWithoutDNI = true
    if (onlyWithoutPhone) filters.onlyWithoutPhone = true
    if (onlyTestPlayers) filters.onlyTestPlayers = true
    if (selectedStatus !== "all") filters.status = selectedStatus
    if (selectedGender !== "all") filters.gender = selectedGender
    if (minScore) filters.minScore = parseInt(minScore)
    if (maxScore) filters.maxScore = parseInt(maxScore)
    if (dateFrom) filters.dateFrom = new Date(dateFrom).toISOString()
    if (dateTo) filters.dateTo = new Date(dateTo).toISOString()

    return filters
  }

  const handleSearch = async () => {
    setIsSearching(true)
    try {
      const filters = buildFilters()
      const result = await searchPlayersAdvanced(filters, 1, 50)
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        })
      } else {
        setPlayers(result.data)
        setTotalCount(result.totalCount)
        setTotalPages(result.totalPages)
        setCurrentPage(1)
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al buscar jugadores",
        variant: "destructive"
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  const handlePageChange = async (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return

    setIsSearching(true)
    try {
      const filters = buildFilters()
      const result = await searchPlayersAdvanced(filters, newPage, 50)
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        })
      } else {
        setPlayers(result.data)
        setCurrentPage(newPage)
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al cambiar de página",
        variant: "destructive"
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleEdit = (player: Player) => {
    setEditingPlayer(player)
    setEditData({})
  }

  const handleLinkModal = (player: Player) => {
    setLinkingPlayer(player)
  }

  const handleSave = async () => {
    if (!editingPlayer) return

    setIsSaving(true)
    try {
      const result = await updatePlayer(editingPlayer.id, editData)
      if (result.success) {
        toast({
          title: "Éxito",
          description: "Jugador actualizado correctamente"
        })
        setEditingPlayer(null)
        setEditData({})
        await handlePageChange(currentPage)
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
        description: "Error al actualizar el jugador",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleLinkChange = async () => {
    setLinkingPlayer(null)
    await handlePageChange(currentPage)
  }

  const handleClearFilters = () => {
    setSearchTerm("")
    setOnlyWithoutEmail(false)
    setOnlyWithoutDNI(false)
    setOnlyWithoutPhone(false)
    setOnlyTestPlayers(false)
    setSelectedStatus("all")
    setSelectedGender("all")
    setMinScore("")
    setMaxScore("")
    setDateFrom("")
    setDateTo("")
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <UserCircle className="h-8 w-8" />
            Jugadores
          </h1>
          <p className="text-slate-600 mt-2">
            Gestión de jugadores de la plataforma
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setExportModalOpen(true)}
            variant="outline"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Exportar a CSV
          </Button>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {totalCount} jugadores
          </Badge>
        </div>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nombre, apellido, DNI o email... (presiona Enter)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-10"
                disabled={isSearching}
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? "Buscando..." : "Buscar"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              {showAdvancedFilters ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Ocultar Filtros
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Filtros Avanzados
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Filters (Collapsible) */}
      {showAdvancedFilters && (
        <Card>
          <CardHeader>
            <CardTitle>Filtros Avanzados</CardTitle>
            <CardDescription>
              Aplica filtros específicos para refinar tu búsqueda
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Filtros de datos faltantes */}
            <div className="space-y-3">
              <Label>Filtros de datos</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="no-email"
                    checked={onlyWithoutEmail}
                    onCheckedChange={(checked) => setOnlyWithoutEmail(checked === true)}
                  />
                  <label htmlFor="no-email" className="text-sm font-medium leading-none">
                    Solo sin email vinculado
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="no-dni"
                    checked={onlyWithoutDNI}
                    onCheckedChange={(checked) => setOnlyWithoutDNI(checked === true)}
                  />
                  <label htmlFor="no-dni" className="text-sm font-medium leading-none">
                    Solo sin DNI
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="no-phone"
                    checked={onlyWithoutPhone}
                    onCheckedChange={(checked) => setOnlyWithoutPhone(checked === true)}
                  />
                  <label htmlFor="no-phone" className="text-sm font-medium leading-none">
                    Solo sin teléfono
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="test-players"
                    checked={onlyTestPlayers}
                    onCheckedChange={(checked) => setOnlyTestPlayers(checked === true)}
                  />
                  <label htmlFor="test-players" className="text-sm font-medium leading-none">
                    Solo jugadores de prueba
                  </label>
                </div>
              </div>
            </div>

            {/* Estado y Género */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Estado</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                    <SelectItem value="suspended">Suspendido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Género</Label>
                <Select value={selectedGender} onValueChange={setSelectedGender}>
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="male">Caballeros</SelectItem>
                    <SelectItem value="female">Damas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Rango de puntaje */}
            <div className="space-y-2">
              <Label>Rango de puntaje</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input
                    type="number"
                    placeholder="Mínimo"
                    value={minScore}
                    onChange={(e) => setMinScore(e.target.value)}
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    placeholder="Máximo"
                    value={maxScore}
                    onChange={(e) => setMaxScore(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Rango de fechas */}
            <div className="space-y-2">
              <Label>Fecha de registro</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-3">
              <Button onClick={handleSearch} disabled={isSearching} className="flex-1">
                {isSearching ? "Aplicando filtros..." : "Aplicar filtros"}
              </Button>
              <Button variant="outline" onClick={handleClearFilters}>
                Limpiar filtros
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Desktop Table View */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Listado de Jugadores</CardTitle>
          <CardDescription>
            Página {currentPage} de {totalPages} ({totalCount} jugadores totales)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Nombre</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">DNI</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Teléfono</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Puntaje</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Categoría</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Estado</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Usuario</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {players.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500">
                      {searchTerm ? "No se encontraron jugadores" : "No hay jugadores registrados"}
                    </td>
                  </tr>
                ) : (
                  players.map((player) => (
                    <tr key={player.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium">
                        {player.first_name} {player.last_name}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        {player.dni || "-"}
                      </td>
                      <td className="py-3 px-4">{player.phone || "-"}</td>
                      <td className="py-3 px-4 font-semibold">{player.score}</td>
                      <td className="py-3 px-4">
                        {player.category_name ? (
                          <Badge variant="outline">{player.category_name}</Badge>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {player.status === "active" ? (
                          <Badge className="bg-green-100 text-green-800">Activo</Badge>
                        ) : player.status === "inactive" ? (
                          <Badge variant="outline" className="text-slate-500">Inactivo</Badge>
                        ) : (
                          <Badge variant="destructive">Suspendido</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {player.user_id ? (
                          <div className="flex flex-col gap-1">
                            <Badge className="bg-blue-100 text-blue-800 text-xs">
                              Vinculado
                            </Badge>
                            <span className="text-xs text-slate-600">
                              {player.users?.email || "Sin email"}
                            </span>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-slate-500">
                            Sin vincular
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(player)}
                            title="Editar jugador"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLinkModal(player)}
                            title="Vincular/Desvincular usuario"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                        </div>
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
        <div className="text-sm text-slate-600 px-1">
          Página {currentPage} de {totalPages} ({totalCount} jugadores totales)
        </div>
        {players.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-500">
              {searchTerm ? "No se encontraron jugadores" : "No hay jugadores registrados"}
            </CardContent>
          </Card>
        ) : (
          players.map((player) => (
            <Card key={player.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {player.first_name} {player.last_name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {player.dni ? `DNI: ${player.dni}` : "Sin DNI"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(player)}
                      title="Editar jugador"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleLinkModal(player)}
                      title="Vincular/Desvincular usuario"
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Teléfono:</span>
                  <span>{player.phone || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Puntaje:</span>
                  <span className="font-semibold">{player.score}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Categoria:</span>
                  {player.category_name ? (
                    <Badge variant="outline" className={getCategoryColor(player.category_name)}>{player.category_name}</Badge>
                  ) : (
                    <span>-</span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Estado:</span>
                  {player.status === "active" ? (
                    <Badge className="bg-green-100 text-green-800">Activo</Badge>
                  ) : player.status === "inactive" ? (
                    <Badge variant="outline" className="text-slate-500">Inactivo</Badge>
                  ) : (
                    <Badge variant="destructive">Suspendido</Badge>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Usuario:</span>
                  {player.user_id ? (
                    <div className="flex flex-col items-end gap-1">
                      <Badge className="bg-blue-100 text-blue-800 text-xs">
                        Vinculado
                      </Badge>
                      <span className="text-xs text-slate-600">
                        {player.users?.email || "Sin email"}
                      </span>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-slate-500">
                      Sin vincular
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isSearching}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Anterior
              </Button>
              <span className="text-sm text-slate-600">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || isSearching}
              >
                Siguiente
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Modal */}
      {editingPlayer && (
        <AdminEditModal
          isOpen={true}
          onClose={() => {
            setEditingPlayer(null)
            setEditData({})
          }}
          onSave={handleSave}
          title={`Editar Jugador: ${editingPlayer.first_name} ${editingPlayer.last_name}`}
          isSaving={isSaving}
        >
          <EditPlayerForm
            player={editingPlayer}
            onDataChange={setEditData}
            categories={categories}
          />
        </AdminEditModal>
      )}

      {/* Link Modal */}
      {linkingPlayer && (
        <AdminEditModal
          isOpen={true}
          onClose={() => setLinkingPlayer(null)}
          onSave={() => setLinkingPlayer(null)}
          title={`Vincular Usuario: ${linkingPlayer.first_name} ${linkingPlayer.last_name}`}
          isSaving={false}
          saveButtonText="Cerrar"
        >
          <PlayerUserLinkComponent
            playerId={linkingPlayer.id}
            currentUserId={linkingPlayer.user_id}
            currentUserEmail={linkingPlayer.users?.email || null}
            onLinkChange={handleLinkChange}
          />
        </AdminEditModal>
      )}

      {/* Export Modal */}
      <ExportPlayersModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  )
}
