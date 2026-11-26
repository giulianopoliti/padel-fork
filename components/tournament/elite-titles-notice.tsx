'use client'

import Link from 'next/link'
import type { EliteTitle } from '@/lib/services/points/services/elite-title-history'

export const EliteTitlesNotice = ({ titles }: { titles?: EliteTitle[] }) => {
  if (!titles?.length) return null
  return <details onClick={event => event.stopPropagation()} className="w-fit rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-950">
    <summary className="cursor-pointer font-medium">Ganó {titles.length} {titles.length === 1 ? 'Americano' : 'Americanos'} en {titles[0].category}</summary>
    <ul className="mt-1 space-y-1 pl-3">
      {titles.map(title => <li key={title.tournamentId}><Link className="underline" href={`/tournaments/${title.tournamentId}`}>{title.tournamentName}</Link></li>)}
    </ul>
  </details>
}
