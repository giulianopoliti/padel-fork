"use client"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Info } from "lucide-react"

export interface Service {
  id: string
  name: string
}

interface ClubServicesSectionProps {
  allServices: Service[]
  clubServices: string[]
  defaultValues?: {}
}

export function ClubServicesSection({ allServices, clubServices, defaultValues }: ClubServicesSectionProps) {
  return (
    <div className="space-y-6">
      {allServices.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {allServices.map((service) => (
            <div
              key={service.id}
              className={`flex items-center space-x-3 p-3 md:p-4 rounded-surface border transition-all duration-200 ${
                clubServices.includes(service.id)
                  ? "bg-blue-50 border-blue-200"
                  : "bg-white border-gray-200 hover:bg-gray-50"
              }`}
            >
              <Checkbox
                id={`service-${service.id}`}
                name="services"
                value={service.id}
                defaultChecked={clubServices.includes(service.id)}
                className={`h-4 w-4 flex-shrink-0 rounded ${
                  clubServices.includes(service.id)
                    ? "border-blue-400 data-[state=checked]:bg-blue-600"
                    : "border-gray-300"
                }`}
              />
              <Label
                htmlFor={`service-${service.id}`}
                className={`text-sm font-medium cursor-pointer flex-1 ${
                  clubServices.includes(service.id) ? "text-blue-800" : "text-gray-700"
                }`}
              >
                {service.name}
              </Label>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-surface p-6 text-center">
          <p className="text-gray-500">No hay servicios disponibles para seleccionar. Contacta al administrador.</p>
        </div>
      )}

      <div className="p-4 rounded-surface bg-blue-50 border border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm text-blue-800 font-medium">Consejo</p>
            <p className="text-sm text-blue-700 mt-1">
              Los servicios ayudan a los usuarios a encontrar clubes que se adapten a sus necesidades específicas.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
