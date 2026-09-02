"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordChangeForm } from "@/components/profile/password-change-form"
import { Shield, Mail, Info } from "lucide-react"

interface SecuritySectionProps {
  userEmail?: string
}

export function SecuritySection({ userEmail = "usuario@ejemplo.com" }: SecuritySectionProps) {
  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader className="border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-2 rounded-surface">
            <Shield className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold text-gray-900">Seguridad</CardTitle>
            <p className="text-sm text-gray-600">Configuración de seguridad de tu cuenta</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-gray-700">
            <div className="flex items-center">
              <Mail className="h-4 w-4 mr-2 text-blue-600" />
              Correo Electrónico
            </div>
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={userEmail}
            readOnly
            className="bg-gray-50 border-gray-200 text-gray-600"
          />
          <p className="text-sm text-gray-500">Tu correo electrónico no se puede cambiar desde aquí.</p>
        </div>

        <PasswordChangeForm />

        <div className="rounded-surface border border-blue-200 bg-blue-50 p-4 mt-6">
          <h3 className="text-blue-800 font-medium flex items-center">
            <Info className="h-4 w-4 mr-2" />
            Información de Seguridad
          </h3>
          <p className="text-blue-700 text-sm mt-2">
            Mantén tu cuenta segura utilizando una contraseña fuerte y cambiándola periódicamente. Nunca compartas tus
            credenciales de acceso con otros usuarios.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
