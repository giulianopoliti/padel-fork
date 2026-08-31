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

interface Player {
  id: string
  first_name: string
  last_name: string
  dni: string | null
  phone: string | null
  date_of_birth: string | null
  address: string | null
  gender: string | null
  instagram_handle: string | null
  score: number
  category_name: string | null
  preferred_hand: string | null
  preferred_side: string | null
  racket: string | null
  user_id: string | null
  club_id: string | null
  status: string
  description: string | null
}

interface EditPlayerFormProps {
  player: Player
  onDataChange: (data: Partial<Player>) => void
  categories?: Array<{ name: string; lower_range: number; upper_range: number }>
}

export const EditPlayerForm = ({ player, onDataChange, categories = [] }: EditPlayerFormProps) => {
  const [formData, setFormData] = useState({
    first_name: player.first_name || "",
    last_name: player.last_name || "",
    dni: player.dni || "",
    phone: player.phone || "",
    date_of_birth: player.date_of_birth || "",
    address: player.address || "",
    gender: player.gender || "",
    instagram_handle: player.instagram_handle || "",
    score: player.score || 0,
    category_name: player.category_name || "",
    preferred_hand: player.preferred_hand || "",
    preferred_side: player.preferred_side || "",
    racket: player.racket || "",
    status: player.status || "active",
    description: player.description || ""
  })

  const handleChange = (field: string, value: string | number) => {
    const newData = { ...formData, [field]: value }
    setFormData(newData)

    // Solo enviar campos que realmente cambiaron y convertir strings vacíos a null
    const changedData: any = {}
    Object.keys(newData).forEach((key) => {
      const newValue = newData[key as keyof typeof newData]
      const originalValue = player[key as keyof Player]

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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="first_name">Nombre *</Label>
            <Input
              id="first_name"
              value={formData.first_name}
              onChange={(e) => handleChange("first_name", e.target.value)}
              placeholder="Nombre"
            />
          </div>

          <div>
            <Label htmlFor="last_name">Apellido *</Label>
            <Input
              id="last_name"
              value={formData.last_name}
              onChange={(e) => handleChange("last_name", e.target.value)}
              placeholder="Apellido"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="dni">DNI</Label>
            <Input
              id="dni"
              value={formData.dni}
              onChange={(e) => handleChange("dni", e.target.value)}
              placeholder="12345678"
            />
          </div>

          <div>
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="+54 11 1234-5678"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="date_of_birth">Fecha de Nacimiento</Label>
            <Input
              id="date_of_birth"
              type="date"
              value={formData.date_of_birth}
              onChange={(e) => handleChange("date_of_birth", e.target.value)}
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
                <SelectItem value="male">Caballeros</SelectItem>
                <SelectItem value="female">Damas</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="address">Dirección</Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => handleChange("address", e.target.value)}
            placeholder="Calle 123, Ciudad"
          />
        </div>
      </div>

      {/* Datos Deportivos */}
      <div className="space-y-3 pt-4 border-t">
        <h3 className="font-semibold text-sm text-slate-700">Datos Deportivos</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="score">Puntaje</Label>
            <Input
              id="score"
              type="number"
              min="0"
              value={formData.score}
              onChange={(e) => handleChange("score", parseInt(e.target.value) || 0)}
              placeholder="0"
            />
          </div>

          <div>
            <Label htmlFor="category_name">Categoría</Label>
            {categories.length > 0 ? (
              <Select
                value={formData.category_name}
                onValueChange={(value) => handleChange("category_name", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.name} value={cat.name}>
                      {cat.name} ({cat.lower_range} - {cat.upper_range})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="category_name"
                value={formData.category_name}
                onChange={(e) => handleChange("category_name", e.target.value)}
                placeholder="Categoría"
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="preferred_hand">Mano Preferida</Label>
            <Select
              value={formData.preferred_hand}
              onValueChange={(value) => handleChange("preferred_hand", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar mano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="right">Derecha</SelectItem>
                <SelectItem value="left">Izquierda</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="preferred_side">Lado Preferido</Label>
            <Select
              value={formData.preferred_side}
              onValueChange={(value) => handleChange("preferred_side", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar lado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="drive">Drive</SelectItem>
                <SelectItem value="backhand">Revés</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="racket">Pala</Label>
          <Input
            id="racket"
            value={formData.racket}
            onChange={(e) => handleChange("racket", e.target.value)}
            placeholder="Marca y modelo de la pala"
          />
        </div>
      </div>

      {/* Redes y Estado */}
      <div className="space-y-3 pt-4 border-t">
        <h3 className="font-semibold text-sm text-slate-700">Redes y Estado</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="instagram_handle">Instagram</Label>
            <Input
              id="instagram_handle"
              value={formData.instagram_handle}
              onChange={(e) => handleChange("instagram_handle", e.target.value)}
              placeholder="@usuario"
            />
          </div>

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
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
                <SelectItem value="suspended">Suspendido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Descripción */}
      <div className="pt-4 border-t">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Información adicional del jugador..."
          rows={3}
        />
      </div>
    </div>
  )
}
