"use client"

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Loader2, User, UserCheck } from 'lucide-react'
import PlayerDniDisplay from '@/components/players/player-dni-display'

import { PlayerInfo } from '../types'
import { searchPlayers } from '@/utils/fuzzy-search'

const searchSchema = z.object({
  searchTerm: z.string().min(3, 'Ingrese al menos 3 caracteres para buscar')
})

interface PlayerSearchFormProps {
  availablePlayers: PlayerInfo[]
  onPlayerSelect: (player: PlayerInfo) => void
  isClubMode: boolean
  userPlayerId?: string | null
  playerNumber: 1 | 2
  tournamentId?: string // Optional: si se provee, usa Edge Function en lugar de fuzzy search local
}

export default function PlayerSearchForm({
  availablePlayers,
  onPlayerSelect,
  isClubMode,
  userPlayerId,
  playerNumber,
  tournamentId
}: PlayerSearchFormProps) {
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<PlayerInfo[]>([])
  const [hasSearched, setHasSearched] = useState(false)

  const form = useForm<z.infer<typeof searchSchema>>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      searchTerm: ''
    }
  })

  const handleSearch = async (values: z.infer<typeof searchSchema>) => {
    setIsSearching(true)
    setHasSearched(true)

    try {
      // ✅ Si tenemos tournamentId, usar Edge Function (búsqueda optimizada)
      if (tournamentId) {
        console.log('[PlayerSearchForm] Using Edge Function search')
        const { searchTournamentPlayers } = await import('@/lib/api/supabase-edge')
        const result = await searchTournamentPlayers({
          searchTerm: values.searchTerm,
          tournamentId,
          page: 1,
          pageSize: 50
        })

        if (result.success && result.players) {
          console.log('[PlayerSearchForm] Edge Function found:', result.players.length, 'players')
          setSearchResults(result.players)
        } else {
          console.warn('[PlayerSearchForm] No players found:', result.error)
          setSearchResults([])
        }
      }
      // ⚠️ Fallback: Fuzzy search client-side (deprecated, solo si no hay tournamentId)
      else {
        console.log('[PlayerSearchForm] Using fallback fuzzy search (deprecated)')
        await new Promise(resolve => setTimeout(resolve, 300))

        // 🎯 FUZZY SEARCH: Usa búsqueda por aproximación con threshold 0.8
        // Threshold 0.8 = más estricto, evita matches muy lejanos
        const filteredResults = searchPlayers(
          values.searchTerm,
          availablePlayers,
          0.8 // threshold: 0.8 = 80% similitud mínima (más estricto)
        )

        setSearchResults(filteredResults)
      }
    } catch (error) {
      console.error('Error searching players:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handlePlayerSelect = (player: PlayerInfo) => {
    onPlayerSelect(player)
    // Reset search
    form.reset()
    setSearchResults([])
    setHasSearched(false)
  }

  // For player mode, show current user option
  const showCurrentUserOption = !isClubMode && userPlayerId && playerNumber === 1

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Busque un jugador existente para la posición {playerNumber}
      </div>

      {/* Current user option for player mode */}
      {showCurrentUserOption && (
        <div className="p-3 bg-violet-50 border border-violet-200 rounded-surface">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-violet-600" />
            <span className="text-sm font-medium text-violet-800">Registrarme a mí mismo</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-violet-300 text-violet-700 hover:bg-violet-100"
            onClick={() => {
              const currentUser = availablePlayers.find(p => p.id === userPlayerId)
              if (currentUser) {
                handlePlayerSelect(currentUser)
              }
            }}
          >
            Seleccionarme como Jugador 1
          </Button>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSearch)} className="space-y-4">
          <FormField
            control={form.control}
            name="searchTerm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Buscar jugador (nombre, apellido o DNI)</FormLabel>
                <FormControl>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nombre, apellido o DNI..."
                      {...field}
                      onChange={(e) => {
                        // 🆕 Si empieza con número, limpiar caracteres no numéricos (reutilizado de NewPlayerForm)
                        const value = e.target.value
                        if (/^\d/.test(value)) {
                          // Es un DNI, limpiar puntos/espacios
                          const cleanedValue = value.replace(/\D/g, '')
                          field.onChange(cleanedValue)
                        } else {
                          // Es nombre/apellido, dejar como está
                          field.onChange(value)
                        }
                      }}
                      onPaste={(e) => {
                        // 🆕 Manejar paste: limpiar si es DNI (reutilizado de NewPlayerForm)
                        const pastedText = e.clipboardData.getData('text')
                        if (/^\d/.test(pastedText)) {
                          e.preventDefault()
                          const cleanedValue = pastedText.replace(/\D/g, '')
                          field.onChange(cleanedValue)
                        }
                        // Si no empieza con número, dejar paste normal
                      }}
                    />
                    <Button type="submit" disabled={isSearching} className="bg-green-600 hover:bg-green-700">
                      {isSearching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>

      {/* Search Results */}
      {hasSearched && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">
            Resultados de búsqueda ({searchResults.length})
          </h4>

          {searchResults.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <User className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>No se encontraron jugadores</p>
              <p className="text-sm">Intente con otro término de búsqueda</p>
            </div>
          ) : (
            <div className="border rounded-control divide-y divide-gray-200 max-h-60 overflow-y-auto">
              {searchResults.map((player) => (
                <div
                  key={player.id}
                  className="p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handlePlayerSelect(player)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <h5 className="font-medium text-gray-900">
                          {player.first_name} {player.last_name}
                        </h5>
                        <div className="text-sm text-gray-500">
                          <PlayerDniDisplay dni={player.dni} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {player.score && (
                        <Badge variant="outline" className="text-xs">
                          Score: {player.score}
                        </Badge>
                      )}
                      <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50">
                        Seleccionar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
