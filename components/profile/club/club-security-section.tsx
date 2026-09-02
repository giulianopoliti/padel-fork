"use client"
import { Label } from "@/components/ui/label"
import { PasswordChangeForm } from "@/components/profile/password-change-form"
import { Mail, AlertCircle } from "lucide-react"

interface ClubSecuritySectionProps {
  userEmail?: string | null
}

export function ClubSecuritySection({ userEmail }: ClubSecuritySectionProps) {
  return (
    <div className="space-y-6">
      {userEmail && (
        <div className="p-4 bg-blue-50 rounded-surface border border-blue-200">
          <div className="flex gap-3">
            <div className="shrink-0 mt-0.5">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">Email Registrado</Label>
              <p className="text-sm text-gray-900 font-medium mt-1">{userEmail}</p>
              <p className="text-xs text-gray-600 mt-1">
                Este es el email asociado a la cuenta de tu club. Para cambiarlo, contacta con soporte.
              </p>
            </div>
          </div>
        </div>
      )}

      <PasswordChangeForm />

      <div className="bg-amber-50 rounded-surface border border-amber-200 p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h4 className="font-medium text-amber-800 mb-1">Recomendaciones de seguridad</h4>
            <ul className="text-sm text-amber-700 space-y-1">
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2"></span>
                Usa contraseñas de al menos 8 caracteres
              </li>
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2"></span>
                Incluye letras, números y símbolos
              </li>
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2"></span>
                No uses información personal fácilmente identificable
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
