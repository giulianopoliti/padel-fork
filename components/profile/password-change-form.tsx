"use client"

import { useState } from "react"
import { Eye, EyeOff, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-password-errors"

type PasswordField = "confirm" | "current" | "new"

export const PasswordChangeForm = () => {
  const { toast } = useToast()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [visibleFields, setVisibleFields] = useState<Set<PasswordField>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const toggleVisibility = (field: PasswordField) => {
    setVisibleFields((currentFields) => {
      const nextFields = new Set(currentFields)
      if (nextFields.has(field)) nextFields.delete(field)
      else nextFields.add(field)
      return nextFields
    })
  }

  const handleChangePassword = async () => {
    setError(null)

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Completa todos los campos.")
      return
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Las nuevas contraseñas no coinciden.")
      return
    }

    if (newPassword === currentPassword) {
      setError("La nueva contraseña debe ser diferente de la contraseña anterior.")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPassword, currentPassword, newPassword }),
      })
      const result = (await response.json()) as { error?: string; success?: boolean }

      if (!response.ok || !result.success) {
        const message = result.error || "No se pudo cambiar la contraseña. Intenta nuevamente."
        setError(message)
        toast({ title: "No se pudo cambiar la contraseña", description: message, variant: "destructive" })
        return
      }

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast({ title: "Contraseña actualizada", description: "Tu contraseña se cambió correctamente." })
    } catch (requestError) {
      console.error("[PasswordChangeForm] Request failed:", requestError)
      const message = "No pudimos conectarnos para cambiar la contraseña. Intenta nuevamente."
      setError(message)
      toast({ title: "Error de conexión", description: message, variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const fields: Array<{
    autoComplete: string
    field: PasswordField
    id: string
    label: string
    onChange: (value: string) => void
    placeholder: string
    value: string
  }> = [
    {
      autoComplete: "current-password",
      field: "current",
      id: "currentPassword",
      label: "Contraseña actual",
      onChange: setCurrentPassword,
      placeholder: "Ingresa tu contraseña actual",
      value: currentPassword,
    },
    {
      autoComplete: "new-password",
      field: "new",
      id: "newPassword",
      label: "Nueva contraseña",
      onChange: setNewPassword,
      placeholder: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`,
      value: newPassword,
    },
    {
      autoComplete: "new-password",
      field: "confirm",
      id: "confirmNewPassword",
      label: "Confirmar nueva contraseña",
      onChange: setConfirmPassword,
      placeholder: "Repite la nueva contraseña",
      value: confirmPassword,
    },
  ]

  return (
    <div
      className="space-y-4"
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          void handleChangePassword()
        }
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-surface bg-blue-100">
          <KeyRound className="h-4 w-4 text-blue-600" />
        </div>
        <h4 className="text-lg font-medium text-gray-900">Cambiar contraseña</h4>
      </div>

      {fields.map(({ autoComplete, field, id, label, onChange, placeholder, value }) => (
        <div className="space-y-2" key={field}>
          <Label htmlFor={id} className="text-sm font-medium text-gray-700">{label}</Label>
          <div className="relative">
            <Input
              id={id}
              type={visibleFields.has(field) ? "text" : "password"}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              autoComplete={autoComplete}
              disabled={isSubmitting}
              className="border-gray-300 pr-10 focus:border-blue-500 focus:ring-blue-500"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => toggleVisibility(field)}
              aria-label={visibleFields.has(field) ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
            >
              {visibleFields.has(field) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ))}

      {error && (
        <div role="alert" className="rounded-surface border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Button
        type="button"
        onClick={() => void handleChangePassword()}
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white hover:bg-blue-700"
      >
        {isSubmitting ? "Actualizando..." : "Cambiar contraseña"}
      </Button>
    </div>
  )
}
