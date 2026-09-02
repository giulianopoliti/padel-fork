"use client"

import { useState } from "react"
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
  exportUsersAction,
  type SearchUsersFilters
} from "@/app/api/admin/users/actions"
import { generateUserCSV, type UserExportData } from "@/lib/csv-export-users"

interface ExportUsersModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ExportUsersModal = ({ isOpen, onClose }: ExportUsersModalProps) => {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [userCount, setUserCount] = useState<number | null>(null)

  // Estados de filtros
  const [searchEmail, setSearchEmail] = useState("")
  const [selectedRole, setSelectedRole] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")

  const buildFilters = (): SearchUsersFilters => {
    const filters: SearchUsersFilters = {}

    if (searchEmail.trim()) filters.searchEmail = searchEmail
    if (selectedRole !== "all") filters.role = selectedRole
    if (dateFrom) filters.dateFrom = new Date(dateFrom).toISOString()
    if (dateTo) filters.dateTo = new Date(dateTo).toISOString()

    return filters
  }

  const handleApplyFilters = async () => {
    setIsLoading(true)
    try {
      const filters = buildFilters()
      const result = await exportUsersAction(filters)

      if (result.success) {
        setUserCount(result.count)
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
      const result = await exportUsersAction(filters)

      if (result.success && result.data) {
        // Generar y descargar CSV
        generateUserCSV(result.data as UserExportData[])

        toast({
          title: "Éxito",
          description: `Se exportaron ${result.count} usuarios correctamente`
        })

        onClose()
      } else {
        toast({
          title: "Error",
          description: result.error || "Error al exportar usuarios",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al exportar usuarios",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setSearchEmail("")
    setSelectedRole("all")
    setDateFrom("")
    setDateTo("")
    setUserCount(null)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar Usuarios a CSV</DialogTitle>
          <DialogDescription>
            Aplica filtros para exportar usuarios específicos. Deja los filtros vacíos para
            exportar todos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Búsqueda por email */}
          <div className="space-y-2">
            <Label htmlFor="search-email">Buscar por email</Label>
            <Input
              id="search-email"
              placeholder="Ej: usuario@example.com"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
            />
          </div>

          {/* Filtro por rol */}
          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger id="role">
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ADMIN">Administrador</SelectItem>
                <SelectItem value="CLUB">Club</SelectItem>
                <SelectItem value="COACH">Entrenador</SelectItem>
                <SelectItem value="PLAYER">Jugador</SelectItem>
                <SelectItem value="ORGANIZADOR">Organizador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Rango de fechas de creación */}
          <div className="space-y-2">
            <Label>Fecha de creación</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="date-from" className="text-xs text-slate-600">
                  Desde
                </Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="date-to" className="text-xs text-slate-600">
                  Hasta
                </Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
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

          {/* Contador de usuarios */}
          {userCount !== null && (
            <div className="bg-blue-50 border border-blue-200 rounded-surface p-4 text-center">
              <p className="text-sm text-blue-900">
                📊 Se exportarán <span className="font-bold">{userCount}</span> usuario
                {userCount !== 1 ? "s" : ""}
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
            disabled={isLoading || userCount === null}
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
