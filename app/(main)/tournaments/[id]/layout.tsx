import React from 'react'
import TournamentLongLayout from './components/TournamentLongLayout'
import { WinnerPhotoProvider } from '@/components/tournament/winner-photo-provider'

interface TournamentLayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export default async function TournamentLayout({ children, params }: TournamentLayoutProps) {
  const { id } = await params
  return (
    <WinnerPhotoProvider tournamentId={id}>
      <TournamentLongLayout>
        {children}
      </TournamentLongLayout>
    </WinnerPhotoProvider>
  )
}
