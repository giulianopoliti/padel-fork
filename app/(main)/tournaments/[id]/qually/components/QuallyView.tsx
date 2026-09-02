"use client"

import { useState } from 'react'
import { BarChart3, Table, Trophy, Users } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Database } from '@/database.types'
import PositionsTable from './PositionsTable'
import ResultsMatrix from './ResultsMatrix'

type Tournament = Database['public']['Tables']['tournaments']['Row']
type CoupleInscription = {
  id: string
  couple_id: string | null
  created_at: string | null
  couples?: any
}

interface QuallyViewProps {
  tournament: Tournament
  coupleInscriptions: CoupleInscription[]
  canManageTournament?: boolean
  playerCoupleId?: string | null
}

export default function QuallyView({ tournament, coupleInscriptions, canManageTournament = false, playerCoupleId = null }: QuallyViewProps) {
  const [activeTab, setActiveTab] = useState('standings')
  const isSingleSetFormat = tournament.format_type === 'AMERICAN_2' || tournament.format_type === 'AMERICAN_3'

  const standings = (
    <PositionsTable
      tournament={tournament}
      coupleInscriptions={coupleInscriptions}
      isSingleSetFormat={isSingleSetFormat}
      canManageTournament={canManageTournament}
      playerCoupleId={playerCoupleId}
    />
  )

  return (
    <div className="min-h-screen bg-background/70">
      <header className="border-b border-border/70 bg-card/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="rounded-elevated bg-primary/10 p-2.5 text-primary"><BarChart3 className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold sm:text-2xl">Tablas de posiciones</h1>
            <p className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm"><Trophy className="h-3.5 w-3.5" />{tournament.name}<span>·</span><Users className="h-3.5 w-3.5" />{coupleInscriptions.length} parejas</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        {!canManageTournament ? standings : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="standings" className="gap-2"><BarChart3 className="h-4 w-4" />Tabla de posiciones</TabsTrigger>
              <TabsTrigger value="results" className="gap-2"><Table className="h-4 w-4" />Matriz de resultados</TabsTrigger>
            </TabsList>
            <TabsContent value="standings"><Card><CardContent className="pt-6">{standings}</CardContent></Card></TabsContent>
            <TabsContent value="results">
              <Card><CardHeader><CardTitle>Matriz de resultados</CardTitle></CardHeader><CardContent><ResultsMatrix tournament={tournament} coupleInscriptions={coupleInscriptions as any} isSingleSetFormat={isSingleSetFormat} /></CardContent></Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  )
}
