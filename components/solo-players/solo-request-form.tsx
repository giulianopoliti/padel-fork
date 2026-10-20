"use client"
import { useState, useId, type FormEvent } from "react"
import { useSWRConfig } from "swr"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SoloTermsAcceptance } from "./terms-acceptance"
import { isSoloCacheKey } from "./use-solo-inbox"
import type { SoloPlayerDirectoryEntry } from "@/types/solo-players"
import type { SoloDirectoryData } from "@/types/solo-player-ui"
import type { SoloPlayerSide, SoloPlayerHand } from "@/types/solo-players"

export const SoloRequestForm = ({ post, profile, onSent, onBusy }: { post: SoloPlayerDirectoryEntry; profile?: SoloDirectoryData["profile"]; onSent: () => void; onBusy: (busy: boolean) => void }) => {
  const id = useId()
  const { mutate } = useSWRConfig()
  const [phone, setPhone] = useState(profile?.phone || "")
  const [side, setSide] = useState<SoloPlayerSide | "">(profile?.preferred_side || "")
  const [hand, setHand] = useState<SoloPlayerHand | "">(profile?.preferred_hand || "")
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setBusy(true); onBusy(true); setError("")
    try {
      const response = await fetch("/api/solo-players/requests", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, phone, side, hand, contactAccepted: true, termsAccepted }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      void mutate(isSoloCacheKey)
      onSent()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos enviar la solicitud.") }
    finally { setBusy(false); onBusy(false) }
  }
  return <form onSubmit={handleSubmit} className="space-y-5">
    <p className="text-sm leading-6 text-muted-foreground">{post.tournament_id ? "Le proponés formar pareja para este torneo. El cupo se revisa recién al aceptar; después deben completar la inscripción y sus requisitos." : "Le solicitás compartir contacto para conversar y coordinar. Aceptar no crea una pareja competitiva ni una inscripción."}</p>
    <fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium"><span>Lado de juego</span><select required value={side} onChange={event => setSide(event.target.value as SoloPlayerSide)} className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="">Elegí un lado</option><option value="DRIVE">Drive</option><option value="REVES">Revés</option></select></label>
        <label className="space-y-2 text-sm font-medium"><span>Mano hábil</span><select required value={hand} onChange={event => setHand(event.target.value as SoloPlayerHand)} className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="">Elegí una mano</option><option value="RIGHT">Diestro</option><option value="LEFT">Zurdo</option></select></label>
      </div>
      <p className="text-xs text-muted-foreground">Datos precargados desde tu perfil. Podés modificarlos para esta solicitud.</p>
      <div className="space-y-2"><label htmlFor={`${id}-phone`} className="text-sm font-medium">Tu teléfono de contacto</label><Input required type="tel" id={`${id}-phone`} value={phone} onChange={event => setPhone(event.target.value)} placeholder="+54 9 11 2345 6789" autoComplete="tel" /></div>
      <p className="text-xs text-muted-foreground">Tu teléfono se comparte con este jugador al aceptar la solicitud. Podés modificar el número precargado para esta solicitud.</p>
      {post.tournament_id && <SoloTermsAcceptance checked={termsAccepted} onCheckedChange={setTermsAccepted} disabled={busy} />}
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" className="w-full" disabled={busy || (!!post.tournament_id && !termsAccepted)}>{busy ? "Enviando…" : "Enviar solicitud"}</Button>
  </form>
}
