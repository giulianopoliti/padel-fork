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
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  const categoryChanged = categoryName !== player.category_name && categoryName
  const newCategory = categoryChanged ? categories.find(c => c.name === categoryName) : null
  const email = Array.isArray(player.users) ? player.users[0]?.email : player.users?.email

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    startTransition(async () => {
      const result = await updatePlayerAction(player.id, {
        first_name: firstName,
        last_name: lastName,
        dni,
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
      }
      onOpenChange(open)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
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
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {categoryChanged && newCategory && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center gap-2">
                <span>La nueva categoría empieza con 0 puntos.</span>
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
