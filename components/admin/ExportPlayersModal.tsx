"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
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
import { Download, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import {
  exportPlayersAction,
  type ExportPlayersFilters,
  getCategories
} from "@/app/api/admin/players/actions"
import { generatePlayerCSV, type PlayerExportData } from "@/lib/csv-export"
import { supabaseAdmin } from "@/lib/supabase-admin"

interface ExportPlayersModalProps {
  isOpen: boolean
  onClose: () => void
}

interface Club {
  id: string
  name: string
}

export const ExportPlayersModal = ({ isOpen, onClose }: ExportPlayersModalProps) => {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [playerCount, setPlayerCount] = useState<number | null>(null)

  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState("")
  const [onlyWithoutEmail, setOnlyWithoutEmail] = useState(false)
  const [onlyWithoutDNI, setOnlyWithoutDNI] = useState(false)
  const [onlyWithoutPhone, setOnlyWithoutPhone] = useState(false)
  const [onlyTestPlayers, setOnlyTestPlayers] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [selectedGender, setSelectedGender] = useState<string>("all")
  const [selectedClubId, setSelectedClubId] = useState<string>("all")
  const [minScore, setMinScore] = useState<string>("")
  const [maxScore, setMaxScore] = useState<string>("")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")

  // Listas para selects
  const [categories, setCategories] = useState<{ name: string }[]>([])
  const [clubs, setClubs] = useState<Club[]>([])

  // Cargar categorías y clubes al montar
  useEffect(() => {
    const loadData = async () => {
      const categoriesResult = await getCategories()
      if (categoriesResult.data) {
        setCategories(categoriesResult.data)
      }

      // Cargar clubes (necesitamos crear esta función o usar supabase directamente)
      // Por ahora lo dejamos vacío, podemos agregar después
    }
    loadData()
  }, [])

  const buildFilters = (): ExportPlayersFilters => {
    const filters: ExportPlayersFilters = {}

    if (searchTerm.trim()) filters.searchTerm = searchTerm
    if (onlyWithoutEmail) filters.onlyWithoutEmail = true
    if (onlyWithoutDNI) filters.onlyWithoutDNI = true
    if (onlyWithoutPhone) filters.onlyWithoutPhone = true
    if (onlyTestPlayers) filters.onlyTestPlayers = true
    if (selectedCategories.length > 0) filters.categories = selectedCategories
    if (selectedStatus !== "all") filters.status = selectedStatus
    if (selectedGender !== "all") filters.gender = selectedGender
    if (selectedClubId !== "all") filters.clubId = selectedClubId
    if (minScore) filters.minScore = parseInt(minScore)
    if (maxScore) filters.maxScore = parseInt(maxScore)
    if (dateFrom) filters.dateFrom = new Date(dateFrom).toISOString()
    if (dateTo) filters.dateTo = new Date(dateTo).toISOString()

    return filters
  }

  const handleApplyFilters = async () => {
    setIsLoading(true)
    try {
      const filters = buildFilters()
      const result = await exportPlayersAction(filters)

      if (result.success) {
        setPlayerCount(result.count)
      } else {
        toast({
          title: "Error",
          description: result.error || "Error al aplicar filtros",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al aplicar filtros",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExport = async () => {
    setIsLoading(true)
    try {
      const filters = buildFilters()
      const result = await exportPlayersAction(filters)

      if (result.success && result.data) {
        // Generar y descargar CSV
        generatePlayerCSV(result.data as PlayerExportData[])

        toast({
          title: "Éxito",
          description: `Se exportaron ${result.count} jugadores correctamente`
        })

        onClose()
      } else {
        toast({
          title: "Error",
          description: result.error || "Error al exportar jugadores",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al exportar jugadores",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setSearchTerm("")
    setOnlyWithoutEmail(false)
    setOnlyWithoutDNI(false)
    setOnlyWithoutPhone(false)
    setOnlyTestPlayers(false)
    setSelectedCategories([])
    setSelectedStatus("all")
    setSelectedGender("all")
    setSelectedClubId("all")
    setMinScore("")
    setMaxScore("")
    setDateFrom("")
    setDateTo("")
    setPlayerCount(null)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar Jugadores a CSV</DialogTitle>
          <DialogDescription>
            Aplica filtros para exportar jugadores específicos. Deja los filtros vacíos para
            exportar todos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Búsqueda por texto */}
          <div className="space-y-2">
            <Label htmlFor="search">Buscar por texto</Label>
            <Input
              id="search"
              placeholder="Nombre, apellido, DNI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filtros de datos faltantes */}
          <div className="space-y-3">
            <Label>Filtros de datos</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="no-email"
                  checked={onlyWithoutEmail}
                  onCheckedChange={(checked) => setOnlyWithoutEmail(checked === true)}
                />
                <label
                  htmlFor="no-email"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Solo sin email vinculado
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="no-dni"
                  checked={onlyWithoutDNI}
                  onCheckedChange={(checked) => setOnlyWithoutDNI(checked === true)}
                />
                <label
                  htmlFor="no-dni"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Solo sin DNI
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="no-phone"
                  checked={onlyWithoutPhone}
                  onCheckedChange={(checked) => setOnlyWithoutPhone(checked === true)}
                />
                <label
                  htmlFor="no-phone"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Solo sin teléfono
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="test-players"
                  checked={onlyTestPlayers}
                  onCheckedChange={(checked) => setOnlyTestPlayers(checked === true)}
                />
                <label
                  htmlFor="test-players"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Solo jugadores de prueba
                </label>
              </div>
            </div>
          </div>

          {/* Estado */}
          <div className="space-y-2">
            <Label htmlFor="status">Estado</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger id="status">
                <SelectValue placeholder="Seleccionar estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
                <SelectItem value="suspended">Suspendido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Género */}
          <div className="space-y-2">
            <Label htmlFor="gender">Género</Label>
            <Select value={selectedGender} onValueChange={setSelectedGender}>
              <SelectTrigger id="gender">
                <SelectValue placeholder="Seleccionar género" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="male">Caballeros</SelectItem>
                <SelectItem value="female">Damas</SelectItem>
              </SelectContent>
            </Select>
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
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Botón aplicar filtros */}
          <Button
            onClick={handleApplyFilters}
            disabled={isLoading}
            className="w-full"
            variant="outline"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Aplicando filtros...
              </>
            ) : (
              "Aplicar filtros"
            )}
          </Button>

          {/* Contador de jugadores */}
          {playerCount !== null && (
            <div className="bg-blue-50 border border-blue-200 rounded-surface p-4 text-center">
              <p className="text-sm text-blue-900">
                📊 Se exportarán <span className="font-bold">{playerCount}</span> jugador
                {playerCount !== 1 ? "es" : ""}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset} disabled={isLoading}>
            Limpiar filtros
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            disabled={isLoading || playerCount === null}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Descargar CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
