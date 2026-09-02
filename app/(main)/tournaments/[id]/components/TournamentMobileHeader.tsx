"use client"

import { Menu, Trophy } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface TournamentMobileHeaderProps {
  tournament: {
    name: string
    category?: string
  }
  onSidebarToggle: () => void
}

export default function TournamentMobileHeader({ tournament, onSidebarToggle }: TournamentMobileHeaderProps) {
  return (
    <div className="flex h-14 items-center gap-3 border-b border-border/70 bg-card px-4 lg:hidden">
      <div className="rounded-surface bg-primary/10 p-2 text-primary"><Trophy className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{tournament.name}</p>
        {tournament.category ? <p className="truncate text-xs text-muted-foreground">{tournament.category}</p> : null}
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onSidebarToggle} aria-label="Abrir menu del torneo">
        <Menu className="h-5 w-5" />
      </Button>
    </div>
  )
}
