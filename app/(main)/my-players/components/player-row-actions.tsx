"use client"

import { useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import EditPlayerDialog from './edit-player-dialog'
import DeleteConfirmationDialog from './delete-confirmation-dialog'

interface PlayerData {
  id: string
  first_name: string
  last_name: string
  dni: string | null
  phone: string | null
  score: number | null
  profile_image_url: string | null
  category_name: string | null
  email?: string | null
  users?: { email: string | null } | Array<{ email: string | null }>
}

interface Category {
  name: string
  level: number | null
  initial_score: number
}

interface PlayerRowActionsProps {
  player: PlayerData
  categories: Category[]
  onPlayerUpdate: (player: PlayerData) => void
  onPlayerDelete: (playerId: string) => void
}

export default function PlayerRowActions({
  player,
  categories,
  onPlayerUpdate,
  onPlayerDelete
}: PlayerRowActionsProps) {
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

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
    </>
  )
}
