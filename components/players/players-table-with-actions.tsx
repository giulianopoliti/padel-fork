import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import PlayerRowActions from '@/components/players/player-row-actions'
import PlayerDniDisplay from '@/components/players/player-dni-display'
import type { PlayerData } from '@/lib/services/players/players.service'

interface Category {
  name: string
  lower_range: number
  upper_range: number | null
}

interface PlayersTableWithActionsProps {
  players: PlayerData[]
  categories: Category[]
  onPlayerUpdate: (player: PlayerData) => void
  onPlayerDelete: (playerId: string) => void
  onPlayerAccountReset: (playerId: string) => void
}

export default function PlayersTableWithActions({
  players,
  categories,
  onPlayerUpdate,
  onPlayerDelete,
  onPlayerAccountReset
}: PlayersTableWithActionsProps) {
  if (players.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">No se encontraron jugadores</p>
        </CardContent>
      </Card>
    )
  }

  const getEmail = (player: PlayerData) => {
    const userEmail = Array.isArray(player.users) ? player.users[0]?.email : player.users?.email
    return userEmail || player.email || '-'
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Jugador</TableHead>
                <TableHead>DNI</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Puntos</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="w-16">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((player, idx) => (
                <TableRow key={player.id}>
                  <TableCell className="font-medium text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={player.profile_image_url || undefined} />
                        <AvatarFallback>
                          {player.first_name[0]}{player.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">
                        {player.first_name} {player.last_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <PlayerDniDisplay dni={player.dni} dniIsTemporary={player.dni_is_temporary} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {getEmail(player)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {player.phone || '-'}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold tabular-nums">
                      {player.score || 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    {player.category_name ? (
                      <Badge variant="secondary">
                        {player.category_name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <PlayerRowActions
                      player={player}
                      categories={categories}
                      onPlayerUpdate={onPlayerUpdate}
                      onPlayerDelete={onPlayerDelete}
                      onPlayerAccountReset={onPlayerAccountReset}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
