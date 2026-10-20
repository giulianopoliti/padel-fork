"use client"

import { useEffect, useId, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { saveSoloEmailPreference } from "@/app/(main)/edit-profile/email-preference-actions"

export const EmailPreferences = ({ enabled, onSaved }: { enabled: boolean; onSaved?: (enabled: boolean) => void }) => {
  const id = useId()
  const [checked, setChecked] = useState(enabled)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  useEffect(() => setChecked(enabled), [enabled])
  const handleChange = async (value: boolean): Promise<void> => {
    setBusy(true); setMessage(""); setError("")
    try {
      const result = await saveSoloEmailPreference(value)
      if (!result.success) throw new Error(result.error)
      setChecked(value)
      onSaved?.(value)
      setMessage("Preferencia guardada.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar tu preferencia.") }
    finally { setBusy(false) }
  }
  return <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 md:p-6" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="font-semibold text-gray-900">Correos y notificaciones</h3>
    <div className="flex items-start gap-3"><Checkbox id={id} checked={checked} disabled={busy} onCheckedChange={value => void handleChange(value === true)} /><label htmlFor={id} className="text-sm leading-6 text-gray-700">Acepto recibir por correo solicitudes de pareja y avisos de mis búsquedas.</label></div>
    <p className="text-xs text-gray-500">Se guarda automáticamente. Podés seguir consultando tus avisos en Notificaciones.</p>
    {(busy || message) && <p role="status" className="text-sm text-gray-600">{busy ? "Guardando…" : message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
