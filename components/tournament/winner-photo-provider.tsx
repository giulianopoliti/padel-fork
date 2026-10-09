'use client'

import { createContext, useContext, type ReactNode } from 'react'
import useSWR from 'swr'
import { getTournamentWinnerPhotoAccess } from '@/app/api/tournaments/winner-photo-actions'
import type { WinnerPhotoAccess } from '@/lib/tournaments/winner-photo'

const WinnerPhotoContext = createContext<{ access: WinnerPhotoAccess | null; refresh: () => void }>({ access: null, refresh: () => {} })

export const WinnerPhotoProvider = ({ tournamentId, children }: { tournamentId: string; children: ReactNode }) => {
  const { data, mutate } = useSWR(`tournament-winner-photo-${tournamentId}`, () => getTournamentWinnerPhotoAccess(tournamentId))
  return <WinnerPhotoContext.Provider value={{ access: data || null, refresh: () => { void mutate() } }}>{children}</WinnerPhotoContext.Provider>
}

export const useWinnerPhoto = () => useContext(WinnerPhotoContext)
