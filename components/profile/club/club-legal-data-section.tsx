"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Building, Mail, MapPin, Instagram, Info } from "lucide-react"

interface ClubLegalDataSectionProps {
  defaultValues?: {
    name?: string | null
    address?: string | null
    email?: string | null
    instagram?: string | null
  }
}

export function ClubLegalDataSection({ defaultValues }: ClubLegalDataSectionProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="name" className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Building className="h-4 w-4 text-blue-600" /> Nombre del Club
          </Label>
          <Input
            id="name"
            name="name"
            defaultValue={defaultValues?.name ?? ""}
            placeholder="Nombre oficial del club"
            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address" className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <MapPin className="h-4 w-4 text-blue-600" /> Dirección
          </Label>
          <Input
            id="address"
            name="address"
            defaultValue={defaultValues?.address ?? ""}
            placeholder="Calle, Número, Ciudad"
            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Mail className="h-4 w-4 text-blue-600" /> Email de Contacto
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={defaultValues?.email ?? ""}
            placeholder="contacto@tuclub.com"
            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="instagram" className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Instagram className="h-4 w-4 text-blue-600" /> Instagram (opcional)
          </Label>
          <Input
            id="instagram"
            name="instagram"
            defaultValue={defaultValues?.instagram ?? ""}
            placeholder="@tuclubdeportivo"
            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="mt-6 p-4 rounded-surface bg-blue-50 border border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm text-blue-800 font-medium">Información importante</p>
            <p className="text-sm text-blue-700 mt-1">
              Asegúrate de que la información proporcionada sea correcta y actualizada para una mejor experiencia de los
              usuarios.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
