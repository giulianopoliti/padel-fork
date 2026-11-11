"use client"

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { updatePlayerAction } from '@/lib/services/players/players.actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import PlayerDniDisplay from '@/components/players/player-dni-display'
import type { PlayerData } from '@/lib/services/players/players.service'
import { isPlayerGender, PLAYER_GENDERS, PLAYER_GENDER_LABELS, type PlayerGender } from '@/lib/utils/player-gender'

interface Category {
  name: string
  lower_range: number
  upper_range: number | null
}

interface EditPlayerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  player: PlayerData
  categories: Category[]
  onPlayerUpdate: (player: PlayerData) => void
}

export default function EditPlayerDialog({
  open,
  onOpenChange,
  player,
  categories,
  onPlayerUpdate
}: EditPlayerDialogProps) {
  const [firstName, setFirstName] = useState(player.first_name)
  const [lastName, setLastName] = useState(player.last_name)
  const [dni, setDni] = useState(player.dni || '')
  const [categoryName, setCategoryName] = useState(player.category_name || '')
  const [genderChange, setGenderChange] = useState<PlayerGender>()
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  const categoryChanged = categoryName !== player.category_name && categoryName
  const newCategory = categoryChanged ? categories.find(c => c.name === categoryName) : null
  const email = Array.isArray(player.users) ? player.users[0]?.email : player.users?.email
  const currentGender = isPlayerGender(player.gender) ? player.gender : ''

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    startTransition(async () => {
      const result = await updatePlayerAction(player.id, {
        first_name: firstName,
        last_name: lastName,
        dni,
        gender: genderChange,
        category_name: categoryName || undefined
      })

      if (result.success && 'player' in result) {
        toast({
          title: 'Jugador actualizado',
          description: result.scoreChanged
            ? `${firstName} ${lastName} fue recategorizado a ${categoryName}`
            : 'Los datos se guardaron correctamente',
        })
        onPlayerUpdate(result.player as PlayerData)
        setGenderChange(undefined)
        onOpenChange(false)
      } else {
        toast({
          title: 'Error',
          description: result.error || 'No se pudo actualizar el jugador',
          variant: 'destructive'
        })
      }
    })
  }

  const handleOpenChange = (open: boolean) => {
    if (!isPending) {
      if (!open) {
        // Reset al cerrar
        setFirstName(player.first_name)
        setLastName(player.last_name)
        setDni(player.dni || '')
        setCategoryName(player.category_name || '')
        setGenderChange(undefined)
      }
      onOpenChange(open)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Jugador</DialogTitle>
          <DialogDescription>
            Modifica los datos del jugador. Si cambias la categoría, se ajustará automáticamente su puntuación.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">Nombre</Label>
              <Input
                id="first_name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="last_name">Apellido</Label>
              <Input
                id="last_name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isPending}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dni">DNI</Label>
            <Input
              id="dni"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="Puedes dejarlo vacío y cargarlo después"
              disabled={isPending}
            />
            <div className="text-xs text-muted-foreground">
              <PlayerDniDisplay dni={player.dni} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={email || player.email || 'Sin email'}
              disabled
              className="bg-muted cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              El email no puede modificarse desde aquí
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-player-gender">Sexo</Label>
            <Select
              value={genderChange ?? currentGender}
              onValueChange={(value) => {
                if (isPlayerGender(value)) setGenderChange(value === currentGender ? undefined : value)
              }}
              disabled={isPending}
            >
              <SelectTrigger id="edit-player-gender">
                <SelectValue placeholder="Seleccionar sexo" />
              </SelectTrigger>
              <SelectContent>
                {PLAYER_GENDERS.map((gender) => (
                  <SelectItem key={gender} value={gender}>{PLAYER_GENDER_LABELS[gender]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Categoría</Label>
            <Select
              value={categoryName}
              onValueChange={setCategoryName}
              disabled={isPending}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.name} value={cat.name}>
                    {cat.name} ({cat.lower_range}
                    {cat.upper_range ? ` - ${cat.upper_range}` : '+'} pts)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {categoryChanged && newCategory && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center gap-2">
                <span>Puntos cambiarán:</span>
                <span className="font-semibold">{player.score || 0}</span>
                <ArrowRight className="h-4 w-4" />
                <span className="font-semibold">{newCategory.lower_range}</span>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
