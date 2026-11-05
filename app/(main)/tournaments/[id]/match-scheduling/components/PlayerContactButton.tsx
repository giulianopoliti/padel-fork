'use client'

import React, { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getPlayerContact } from '../utils/playerContact'

interface PlayerContactButtonProps {
  player: { name: string; last_name: string; phone?: string | null }
}

const PlayerContactButton = ({ player }: PlayerContactButtonProps): React.JSX.Element => {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const name = `${player.name} ${player.last_name}`.trim() || 'Jugador sin nombre'
  const contact = getPlayerContact(player.phone)

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(contact.phone)
      setCopied(true)
      setCopyError(false)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <Popover onOpenChange={() => { setCopied(false); setCopyError(false) }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline rounded text-left text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={`Ver contacto de ${name}`}
          draggable={false}
          onClick={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
        >
          {name}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] space-y-3 bg-white text-slate-900"
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
      >
        <p className="font-semibold">{name}</p>
        {contact.phone ? (
          <>
            <p className="select-all break-all text-sm">{contact.phone}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar número'}
              </Button>
              {contact.whatsappUrl && (
                <Button asChild size="sm" className="bg-emerald-700 hover:bg-emerald-800">
                  <a href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Abrir WhatsApp
                  </a>
                </Button>
              )}
            </div>
            {!contact.whatsappUrl && <p className="text-xs text-amber-800">Revisá el número y su código de país para abrir WhatsApp.</p>}
            {contact.whatsappUrl && <p className="text-xs text-slate-600">Se abrirá el chat con el recordatorio para cargar los horarios del finde.</p>}
            <p role="status" className="text-xs text-slate-600">
              {copyError ? 'No se pudo copiar. Podés seleccionar el número y copiarlo manualmente.' : copied ? 'Número copiado al portapapeles.' : ''}
            </p>
          </>
        ) : <p className="text-sm text-slate-600">Este jugador no tiene un teléfono cargado.</p>}
      </PopoverContent>
    </Popover>
  )
}

export default PlayerContactButton
