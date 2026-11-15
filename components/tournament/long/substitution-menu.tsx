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
  hasSubstitute?: boolean
  bracketSchedule?: boolean
  hasDateSubstitute?: boolean
  onSaved: (fechaId?: string) => void
}

export const SubstitutionMenu = ({
  tournamentId, coupleId, coupleName, fechaId, matchId, hasSubstitute, bracketSchedule, hasDateSubstitute, onSaved,
}: SubstitutionMenuProps) => {
  const [open, setOpen] = useState<'match' | 'fecha' | null>(null)
  return <span className="inline-flex align-middle" onClick={event => event.stopPropagation()}>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`Acciones de ${coupleName}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => setOpen(bracketSchedule || !fechaId ? 'match' : 'fecha')}><UserRoundPlus className="mr-2 size-4" />
          {bracketSchedule ? (hasSubstitute ? 'Gestionar suplencia del partido' : 'Suplente para este partido')
            : hasSubstitute ? 'Gestionar suplencia' : fechaId ? 'Asignar suplente para la fecha' : 'Asignar suplente'}
        </DropdownMenuItem>
        {bracketSchedule && <DropdownMenuItem onSelect={() => setOpen('fecha')}><UserRoundPlus className="mr-2 size-4" />
          {hasDateSubstitute ? 'Gestionar suplencia de fecha' : 'Suplente para esta fecha'}
        </DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    {open && <SubstitutionDialog tournamentId={tournamentId} coupleId={coupleId}
      fechaId={fechaId} matchId={open === 'match' ? matchId : undefined}
      bracketMatchId={bracketSchedule && open === 'fecha' ? matchId : undefined}
      onClose={() => setOpen(null)} onSaved={onSaved} />}
  </span>
}
