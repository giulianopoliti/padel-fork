"use client"

import { useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MoreVertical, Pencil, Trash2, UserX } from 'lucide-react'
import EditPlayerDialog from '@/components/players/edit-player-dialog'
import DeleteConfirmationDialog from '@/components/players/delete-confirmation-dialog'
import PlayerAccountResetDialog from '@/components/players/player-account-reset-dialog'
import type { PlayerData } from '@/lib/services/players/players.service'

interface Category {
  name: string
  lower_range: number
  upper_range: number | null
}

interface PlayerRowActionsProps {
  player: PlayerData
  categories: Category[]
  onPlayerUpdate: (player: PlayerData) => void
  onPlayerDelete: (playerId: string) => void
  onPlayerAccountReset: (playerId: string) => void
}

export default function PlayerRowActions({
  player,
  categories,
  onPlayerUpdate,
  onPlayerDelete,
  onPlayerAccountReset
}: PlayerRowActionsProps) {
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showAccountResetDialog, setShowAccountResetDialog] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Abrir menú</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </DropdownMenuItem>
          {player.user_id && (
            <DropdownMenuItem
              onClick={() => setShowAccountResetDialog(true)}
              className="text-amber-700 focus:text-amber-700"
            >
              <UserX className="mr-2 h-4 w-4" />
              Blanquear cuenta
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditPlayerDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        player={player}
        categories={categories}
        onPlayerUpdate={onPlayerUpdate}
      />

      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        player={player}
        onPlayerDelete={onPlayerDelete}
      />

      <PlayerAccountResetDialog
        open={showAccountResetDialog}
        onOpenChange={setShowAccountResetDialog}
        player={player}
        onPlayerAccountReset={onPlayerAccountReset}
      />
    </>
  )
}
