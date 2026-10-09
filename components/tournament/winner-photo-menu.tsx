'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import UploadWinnerImage from './upload-winner-image'
import { useWinnerPhoto } from './winner-photo-provider'
import { canUploadWinnerPhotoForCouple } from '@/lib/tournaments/winner-photo'
import { getBracketLabelByKey } from '@/lib/services/bracket-key-policy'

interface WinnerPhotoMenuProps {
  matchId: string
  round: string
  matchStatus: string
  matchWinnerId: string | null | undefined
  coupleId: string | null | undefined
}

export const WinnerPhotoMenu = ({ matchId, round, matchStatus, matchWinnerId, coupleId }: WinnerPhotoMenuProps) => {
  const [open, setOpen] = useState(false)
  const { access, refresh } = useWinnerPhoto()
  const router = useRouter()
  if (!access || !canUploadWinnerPhotoForCouple(access, { id: matchId, round, status: matchStatus, winnerId: matchWinnerId }, coupleId)) return null
  const champion = access.winners.find((winner) => winner.matchId === matchId && winner.winnerId === coupleId)!
  const cupLabel = champion.bracketKey === 'MAIN' ? '' : ` · ${getBracketLabelByKey(champion.bracketKey)}`

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 bg-white/90 text-slate-600" aria-label="Acciones de los ganadores" onClick={(event) => event.stopPropagation()}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen(true)}><Camera className="mr-2 h-4 w-4" />Cargar foto de ganadores</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Foto de los ganadores{cupLabel}</DialogTitle>
            <DialogDescription>Cargá la foto de la pareja campeona de {access.tournamentName}.</DialogDescription>
          </DialogHeader>
          <UploadWinnerImage
            tournamentId={access.tournamentId}
            tournamentName={access.tournamentName}
            existingImageUrl={champion.imageUrl}
            winnerMatch={{ matchId, winnerId: champion.winnerId }}
            onImageUploaded={() => { setOpen(false); refresh(); router.refresh() }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
