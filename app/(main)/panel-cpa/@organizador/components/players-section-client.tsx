"use client"

import { useState, useCallback, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Loader2, UserRoundCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PlayerIdentityTransferDialog } from '@/components/players/player-identity-transfer-dialog'
import { searchPlayersOrganization } from '@/lib/api/supabase-edge'
import PlayersTableWithActions from '@/components/players/players-table-with-actions'
import { useDebounce } from '@/hooks/use-debounce'
import { useToast } from '@/components/ui/use-toast'

interface PlayerData {
  id: string
  first_name: string
  last_name: string
  dni: string | null
  phone: string | null
  score: number | null
  profile_image_url: string | null
  category_name: string | null
  user_id?: string | null
  email?: string | null
  users?: { email: string | null } | Array<{ email: string | null }> | null
}

interface Category {
  name: string
  lower_range: number
  upper_range: number | null
}

interface PlayersSectionClientProps {
  initialPlayers: PlayerData[]
  categories: Category[]
  organizationId: string
  totalPlayers: number
  canResolvePlayerIdentity: boolean
}

export default function PlayersSectionClient({
  initialPlayers,
  categories,
  organizationId,
  totalPlayers,
  canResolvePlayerIdentity
}: PlayersSectionClientProps) {
  const [players, setPlayers] = useState(initialPlayers)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [isSearching, setIsSearching] = useState(false)
  const [showIdentityTransfer, setShowIdentityTransfer] = useState(false)
  const { toast } = useToast()

  // Referencia para mantener el foco en el input
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Debounce del searchTerm (300ms)
  const debouncedSearch = useDebounce(searchTerm, 300)

  // Función de búsqueda via Edge Function
  const performSearch = useCallback(async (
    search: string,
    category: string
  ) => {
    try {
      setIsSearching(true)

      const result = await searchPlayersOrganization({
        searchTerm: search,
        page: 1,
        pageSize: 10, // Solo mostramos top 10
        categoryFilter: category,
        organizationId
      })

      if (result.success) {
        setPlayers(result.players || [])
      } else {
        toast({
          title: 'Error',
          description: result.error || 'No se pudieron cargar los jugadores',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error searching players:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los jugadores',
        variant: 'destructive'
      })
    } finally {
      setIsSearching(false)
    }
  }, [organizationId, toast])

  // Effect para búsqueda en tiempo real
  useEffect(() => {
    if (debouncedSearch || categoryFilter !== 'all') {
      performSearch(debouncedSearch, categoryFilter)
    }
  }, [debouncedSearch, categoryFilter, performSearch])

  const handlePlayerUpdate = (updatedPlayer: PlayerData) => {
    setPlayers(prev => prev.map(p => p.id === updatedPlayer.id ? updatedPlayer : p))
  }

  const handlePlayerAccountReset = (playerId: string) => {
    setPlayers(prev => prev.map((player) => (
      player.id === playerId
        ? { ...player, user_id: null, email: null, users: null }
        : player
    )))
  }

  return (
    <div className="space-y-4">
      {canResolvePlayerIdentity && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => setShowIdentityTransfer(true)}>
            <UserRoundCheck className="mr-2 h-4 w-4" />
            Resolver jugador duplicado
          </Button>
        </div>
      )}
      {/* Búsqueda y Filtros */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar por nombre, apellido o DNI..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <Select
          value={categoryFilter}
          onValueChange={setCategoryFilter}
        >
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.name} value={cat.name}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabla con loading overlay */}
      <div className="relative">
        {isSearching && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-surface">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        <PlayersTableWithActions
          players={players}
          categories={categories}
          onPlayerUpdate={handlePlayerUpdate}
          onPlayerDelete={() => {}}
          onPlayerAccountReset={handlePlayerAccountReset}
        />
      </div>
      {canResolvePlayerIdentity && (
        <PlayerIdentityTransferDialog
          open={showIdentityTransfer}
          onOpenChange={setShowIdentityTransfer}
          onTransferred={() => performSearch(debouncedSearch, categoryFilter)}
        />
      )}
    </div>
  )
}
