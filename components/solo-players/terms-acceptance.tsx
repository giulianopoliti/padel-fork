"use client"

import { useId } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { getTenantBranding } from "@/config/tenant"
import { TPE_TERMS_PATH } from "@/lib/tpe/terms"

interface SoloTermsAcceptanceProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export const SoloTermsAcceptance = ({ checked, onCheckedChange, disabled = false }: SoloTermsAcceptanceProps) => {
  const id = useId()
  const branding = getTenantBranding()
  return <div className="flex items-start gap-3 text-sm leading-6">
    <Checkbox id={id} aria-labelledby={`${id}-label`} checked={checked} onCheckedChange={value => onCheckedChange(value === true)} disabled={disabled} />
    <div id={`${id}-label`}>
      <label htmlFor={id}>Acepto las </label>
      <Dialog>
        <DialogTrigger asChild><button type="button" disabled={disabled} className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">condiciones de búsqueda e inscripción</button></DialogTrigger>
        <DialogContent className={`${branding.tournaments.theme.className} max-h-[85dvh] overflow-y-auto sm:max-w-xl`} onClick={event => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Condiciones de búsqueda e inscripción</DialogTitle>
            <DialogDescription>Cómo funciona la búsqueda de pareja y cuándo se confirma tu participación.</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-4 pl-5 text-sm leading-6">
            <li><strong>Buscar pareja.</strong> Publicar una búsqueda o enviar una solicitud no reserva cupo ni garantiza conseguir pareja. Podés pausar o retirar tu búsqueda.</li>
            <li><strong>Formar pareja.</strong> Al aceptar una solicitud para un torneo, se validan el cupo disponible y los requisitos de los jugadores. Si se cumplen, se forma la pareja y se registra la inscripción.</li>
            <li><strong>Confirmar la inscripción.</strong> La inscripción puede quedar pendiente de aprobación del organizador o del comprobante de pago, según el torneo. Revisá su estado y completá los requisitos que correspondan para confirmar la participación.</li>
            <li><strong>Datos de juego.</strong> La categoría, el lado y la mano declarados en la búsqueda o solicitud describen tu disponibilidad. No modifican tu categoría de ranking.</li>
            <li><strong>Compartir el contacto.</strong> Al aceptar una solicitud, ambos jugadores podrán consultar el teléfono del otro. Si elegís hacerlo público, también podrán verlo los usuarios que iniciaron sesión.</li>
            <li><strong>Recibir avisos.</strong> Podés consultar las novedades en Notificaciones y elegir si recibís correos desde Editar perfil.</li>
          </ul>
          {branding.key === "padel-elite" && <p className="text-sm leading-6">También se aplican los <Link href={TPE_TERMS_PATH} target="_blank" rel="noreferrer" className="font-medium underline">Términos y Condiciones de TPE</Link>.</p>}
          <DialogClose asChild><Button type="button" variant="outline">Cerrar</Button></DialogClose>
        </DialogContent>
      </Dialog>
      {branding.key === "padel-elite" && <> y los <Link href={TPE_TERMS_PATH} target="_blank" rel="noreferrer" className="underline">Términos y Condiciones de TPE</Link></>}.
    </div>
  </div>
}
