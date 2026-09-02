"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Building2, Mail, Phone, User, FileText, Briefcase, IdCard, Info } from "lucide-react"

interface OrganizationDataSectionProps {
  defaultValues?: {
    name?: string | null
    description?: string | null
    phone?: string | null
    responsible_first_name?: string | null
    responsible_last_name?: string | null
    responsible_dni?: string | null
    responsible_position?: string | null
    email?: string | null
  }
}

export function OrganizationDataSection({ defaultValues }: OrganizationDataSectionProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="name" className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Building2 className="h-4 w-4 text-blue-600" /> Nombre de la Organización
          </Label>
          <Input
            id="name"
            name="name"
            defaultValue={defaultValues?.name ?? ""}
            placeholder="Nombre oficial de la organización"
            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description" className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <FileText className="h-4 w-4 text-blue-600" /> Descripción
          </Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={defaultValues?.description ?? ""}
            placeholder="Descripción de la organización y sus actividades"
            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 min-h-[100px]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone" className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Phone className="h-4 w-4 text-blue-600" /> Teléfono de Contacto
          </Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={defaultValues?.phone ?? ""}
            placeholder="+54 9 11 1234-5678"
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
            placeholder="contacto@organizacion.com"
            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            disabled
          />
          <p className="text-xs text-gray-500">El email no puede ser modificado desde aquí</p>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-blue-600" />
          Datos del Responsable
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="responsible_first_name" className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <User className="h-4 w-4 text-blue-600" /> Nombre del Responsable
            </Label>
            <Input
              id="responsible_first_name"
              name="responsible_first_name"
              defaultValue={defaultValues?.responsible_first_name ?? ""}
              placeholder="Nombre"
              className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="responsible_last_name" className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <User className="h-4 w-4 text-blue-600" /> Apellido del Responsable
            </Label>
            <Input
              id="responsible_last_name"
              name="responsible_last_name"
              defaultValue={defaultValues?.responsible_last_name ?? ""}
              placeholder="Apellido"
              className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="responsible_dni" className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <IdCard className="h-4 w-4 text-blue-600" /> DNI del Responsable
            </Label>
            <Input
              id="responsible_dni"
              name="responsible_dni"
              defaultValue={defaultValues?.responsible_dni ?? ""}
              placeholder="12345678"
              className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="responsible_position" className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Briefcase className="h-4 w-4 text-blue-600" /> Cargo del Responsable
            </Label>
            <Input
              id="responsible_position"
              name="responsible_position"
              defaultValue={defaultValues?.responsible_position ?? ""}
              placeholder="Director, Presidente, etc."
              className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-surface bg-blue-50 border border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm text-blue-800 font-medium">Información importante</p>
            <p className="text-sm text-blue-700 mt-1">
              Los datos del responsable son necesarios para la gestión legal y administrativa de la organización.
              Asegúrate de que la información proporcionada sea correcta y actualizada.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}