'use client'

import { useState } from 'react'
import { MoreHorizontal, UserRoundPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SubstitutionDialog } from './substitution-dialog'

interface SubstitutionMenuProps {
  tournamentId: string
  coupleId: string
  coupleName: string
  fechaId?: string
  matchId?: string
  onSaved: () => void
}

export const SubstitutionMenu = ({ tournamentId, coupleId, coupleName, fechaId, matchId, onSaved }: SubstitutionMenuProps) => {
  const [open, setOpen] = useState(false)
  return <span className="inline-flex align-middle" onClick={event => event.stopPropagation()}>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`Acciones de ${coupleName}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => setOpen(true)}><UserRoundPlus className="mr-2 size-4" />Asignar suplente{fechaId ? ' para la fecha' : ''}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {open && <SubstitutionDialog tournamentId={tournamentId} coupleId={coupleId} fechaId={fechaId} matchId={matchId}
      onClose={() => setOpen(false)} onSaved={onSaved} />}
  </span>
}
