"use client"

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { ActiveTournamentClub } from '@/lib/services/tournament-club-filter.service'

const TournamentClubSelector = ({ clubs, clubId, path, state }: {
  clubs: ActiveTournamentClub[]; clubId?: string; path: '/panel' | '/my-tournaments'; state?: string;
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const handleClubChange = (value: string) => {
    const params = new URLSearchParams()
    if (state) params.set('estado', state)
    if (value) params.set('club', value)
    params.set('page', '1')
    startTransition(() => router.push(`${path}?${params.toString()}`, { scroll: false }))
  }
  return <div className="flex flex-wrap items-center gap-3">
    <label className="text-sm font-medium" htmlFor={`club-filter-${path === '/panel' ? 'panel' : 'history'}`}>Club</label>
    <select id={`club-filter-${path === '/panel' ? 'panel' : 'history'}`} value={clubId || ''} disabled={pending}
      onChange={(event) => handleClubChange(event.target.value)}
      className="h-11 w-full rounded-control border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-72">
      <option value="">Todos los clubes</option>
      {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
    </select>
    {pending && <span role="status" className="text-sm text-muted-foreground">Cargando torneos…</span>}
  </div>
}
export default TournamentClubSelector
