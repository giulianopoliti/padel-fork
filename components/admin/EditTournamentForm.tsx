"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
}

interface EditTournamentFormProps {
  tournament: Tournament
  onDataChange: (data: Partial<Tournament>) => void
}

export const EditTournamentForm = ({ tournament, onDataChange }: EditTournamentFormProps) => {
  const [formData, setFormData] = useState({
    name: tournament.name || "",
    description: tournament.description || "",
    price: tournament.price || 0,
    award: tournament.award || "",
    max_participants: tournament.max_participants || 0,
    category_name: tournament.category_name || "",
    gender: tournament.gender || "",
    type: tournament.type || "",
    start_date: tournament.start_date ? tournament.start_date.split("T")[0] : "",
    end_date: tournament.end_date ? tournament.end_date.split("T")[0] : "",
    status: tournament.status || "NOT_STARTED"
  })

  const handleChange = (field: string, value: string | number) => {
    const newData = { ...formData, [field]: value }
    setFormData(newData)

    // Solo enviar campos que realmente cambiaron y convertir strings vacíos a null
    const changedData: any = {}
    Object.keys(newData).forEach((key) => {
      const newValue = newData[key as keyof typeof newData]
      const originalValue = tournament[key as keyof Tournament]

      if (newValue !== originalValue) {
        // Si es string vacío, enviar null en lugar de ""
        if (typeof newValue === "string" && newValue === "") {
          changedData[key] = null
        } else {
          changedData[key] = newValue
        }
      }
    })

    onDataChange(changedData)
  }

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
      {/* Datos Básicos */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-slate-700">Datos Básicos</h3>

        <div>
          <Label htmlFor="name">Nombre del Torneo *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Nombre del torneo"
          />
        </div>

        <div>
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange("description", e.target.value)}
            placeholder="Descripción del torneo..."
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="price">Precio</Label>
            <Input
              id="price"
              type="number"
              min="0"
              value={formData.price}
              onChange={(e) => handleChange("price", parseInt(e.target.value) || 0)}
              placeholder="0"
            />
          </div>

          <div>
            <Label htmlFor="award">Premio</Label>
            <Input
              id="award"
              value={formData.award}
              onChange={(e) => handleChange("award", e.target.value)}
              placeholder="Premio del torneo"
            />
          </div>
        </div>
      </div>

      {/* Configuración del Torneo */}
      <div className="space-y-3 pt-4 border-t">
        <h3 className="font-semibold text-sm text-slate-700">Configuración del Torneo</h3>

        <div>
          <Label htmlFor="max_participants">Máximo de Participantes</Label>
          <Input
            id="max_participants"
            type="number"
            min="2"
            value={formData.max_participants}
            onChange={(e) => handleChange("max_participants", parseInt(e.target.value) || 0)}
            placeholder="32"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="category_name">Categoría</Label>
            <Input
              id="category_name"
              value={formData.category_name}
              onChange={(e) => handleChange("category_name", e.target.value)}
              placeholder="Primera"
            />
          </div>

          <div>
            <Label htmlFor="gender">Género</Label>
            <Select
              value={formData.gender}
              onValueChange={(value) => handleChange("gender", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar género" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Caballeros</SelectItem>
                <SelectItem value="FEMALE">Damas</SelectItem>
                <SelectItem value="MIXED">Mixto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="type">Tipo de Torneo</Label>
          <Select
            value={formData.type}
            onValueChange={(value) => handleChange("type", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AMERICAN_2">Americano 2</SelectItem>
              <SelectItem value="AMERICAN_4">Americano 4</SelectItem>
              <SelectItem value="KNOCKOUT">Eliminación Directa</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Fechas */}
      <div className="space-y-3 pt-4 border-t">
        <h3 className="font-semibold text-sm text-slate-700">Fechas</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="start_date">Fecha de Inicio</Label>
            <Input
              id="start_date"
              type="date"
              value={formData.start_date}
              onChange={(e) => handleChange("start_date", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="end_date">Fecha de Finalización</Label>
            <Input
              id="end_date"
              type="date"
              value={formData.end_date}
              onChange={(e) => handleChange("end_date", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Estado */}
      <div className="space-y-3 pt-4 border-t">
        <h3 className="font-semibold text-sm text-slate-700">Estado del Torneo</h3>

        <div>
          <Label htmlFor="status">Estado</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => handleChange("status", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NOT_STARTED">No Iniciado</SelectItem>
              <SelectItem value="ZONE_PHASE">Fase de Zonas</SelectItem>
              <SelectItem value="BRACKET_PHASE">Fase de Bracket</SelectItem>
              <SelectItem value="FINISHED">Finalizado</SelectItem>
              <SelectItem value="CANCELED">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500 mt-1">
            ⚠️ Cambiar el estado manualmente puede causar inconsistencias. Usa las acciones especiales cuando sea posible.
          </p>
        </div>
      </div>
    </div>
  )
}
