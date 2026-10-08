"use client"

import { PasswordChangeForm } from "@/components/profile/password-change-form"

type OrganizationSecuritySectionProps = {
  userEmail?: string
}

export const OrganizationSecuritySection = ({ userEmail }: OrganizationSecuritySectionProps) => (
  <div className="space-y-6">
    <div className="rounded-surface border border-blue-200 bg-blue-50 p-4 text-sm">
      <p className="font-medium text-gray-900">Cuenta del organizador</p>
      {userEmail && <p className="mt-1 break-all text-gray-700">{userEmail}</p>}
      <p className="mt-2 text-gray-600">
        Cambia la contraseña de tu cuenta de acceso. Los demás miembros de la organización conservan sus propias contraseñas.
      </p>
    </div>
    <PasswordChangeForm />
  </div>
)
