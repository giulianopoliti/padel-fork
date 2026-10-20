"use client"

import { useId, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { SoloTermsAcceptance } from "./terms-acceptance"
import type { SoloDirectoryData, SoloOwnPost, SoloPostInput } from "@/types/solo-player-ui"
import type { SoloPlayerDuration, SoloPlayerSide, SoloPlayerHand } from "@/types/solo-players"

interface SoloPostFormProps {
  data: SoloDirectoryData
  post?: SoloOwnPost
  tournamentId?: string
  onSaved: () => void
  onCancel: () => void
}

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"

export const SoloPostForm = ({ data, post, tournamentId, onSaved, onCancel }: SoloPostFormProps) => {
  const id = useId()
  const [scope, setScope] = useState(post?.tournament_id || tournamentId || "general")
  const [category, setCategory] = useState(post?.category_name || data.profile?.category || "")
  const [side, setSide] = useState<SoloPlayerSide | "">(post?.preferred_side || data.profile?.preferred_side || "")
  const [hand, setHand] = useState<SoloPlayerHand | "">(post?.preferred_hand || data.profile?.preferred_hand || "")
  const [duration, setDuration] = useState<SoloPlayerDuration>("1_WEEK")
  const [phone, setPhone] = useState(data.profile?.phone || "")
  const [publicPhone, setPublicPhone] = useState(post?.public_phone || false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const isTournament = scope !== "general"

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy || !side || !hand) return
    setBusy(true)
    setError("")
    const input: SoloPostInput = { postId: post?.id, tournamentId: isTournament ? scope : null, category, side, hand, duration, phone, publicPhone, contactAccepted: true, termsAccepted }
    try {
      const response = await fetch("/api/solo-players", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "No se pudo guardar la búsqueda.")
      onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la búsqueda.") }
    finally { setBusy(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm leading-6 text-muted-foreground">Publicá tu búsqueda para encontrar pareja. {isTournament ? "El cupo se confirma al formar la pareja y completar la inscripción." : "Otros jugadores podrán proponerte jugar juntos."}</p>
      <fieldset disabled={busy} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor={`${id}-scope`} className="text-sm font-medium">Torneo para el que buscás pareja</label>
          <select id={`${id}-scope`} className={selectClass} value={scope} onChange={event => setScope(event.target.value)} disabled={!!post || !!tournamentId}>
            <option value="general">Sin torneo definido</option>
            {data.tournaments.filter(t => t.acceptsInterest || t.id === scope).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {!tournamentId && <p className="text-xs text-muted-foreground">Elegí un torneo o publicá una búsqueda sin torneo definido.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={`${id}-category`} className="text-sm font-medium">Categoría declarada</label>
            <select required id={`${id}-category`} className={selectClass} value={category} onChange={event => setCategory(event.target.value)}>
              <option value="">Elegí tu categoría</option>
              {data.categories.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          {!isTournament && <div className="space-y-2">
            <label htmlFor={`${id}-duration`} className="text-sm font-medium">Duración de la publicación</label>
            <select id={`${id}-duration`} className={selectClass} value={duration} onChange={event => setDuration(event.target.value as SoloPlayerDuration)}>
              <option value="1_DAY">1 día</option><option value="1_WEEK">1 semana</option><option value="2_WEEKS">2 semanas</option><option value="1_MONTH">1 mes</option>
            </select>
            {post && <p className="text-xs text-muted-foreground">La duración comienza nuevamente al guardar.</p>}
          </div>}
          <div className="space-y-2">
            <label htmlFor={`${id}-side`} className="text-sm font-medium">Lado de juego</label>
            <select required id={`${id}-side`} className={selectClass} value={side} onChange={event => setSide(event.target.value as SoloPlayerSide)}>
              <option value="">Elegí un lado</option><option value="DRIVE">Drive</option><option value="REVES">Revés</option>
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor={`${id}-hand`} className="text-sm font-medium">Mano hábil</label>
            <select required id={`${id}-hand`} className={selectClass} value={hand} onChange={event => setHand(event.target.value as SoloPlayerHand)}>
              <option value="">Elegí una mano</option><option value="RIGHT">Diestro</option><option value="LEFT">Zurdo</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor={`${id}-phone`} className="text-sm font-medium">Teléfono de contacto</label>
          <Input required type="tel" autoComplete="tel" id={`${id}-phone`} placeholder="+54 9 11 2345 6789" value={phone} onChange={event => setPhone(event.target.value)} aria-describedby={`${id}-phone-help`} />
          <p id={`${id}-phone-help`} className="text-xs leading-5 text-muted-foreground">Precargado desde tu perfil. Podés cambiarlo para esta búsqueda. Se comparte al aceptar una solicitud.</p>
        </div>
        <label className="flex items-start gap-3 text-sm leading-5">
          <Checkbox checked={publicPhone} onCheckedChange={value => setPublicPhone(value === true)} />
          Mostrar mi teléfono a los usuarios que iniciaron sesión. Es opcional.
        </label>
        {isTournament && <SoloTermsAcceptance checked={termsAccepted} onCheckedChange={setTermsAccepted} disabled={busy} />}
        {data.support.whatsappUrl ? <a href={data.support.whatsappUrl} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium underline underline-offset-4">Consultar por WhatsApp a {data.support.name}</a> : <p className="text-xs text-muted-foreground">El WhatsApp de {data.support.name} todavía no está disponible.</p>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={busy || (isTournament && !termsAccepted)}>{busy ? "Guardando…" : post ? "Guardar cambios" : "Buscar pareja"}</Button>
      </div>
    </form>
  )
}
