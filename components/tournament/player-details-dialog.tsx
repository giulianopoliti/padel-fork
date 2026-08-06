"use client"

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Loader2, User, Mail, Hash, Award, Lock, Pencil, Eye, Phone, History, ExternalLink } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import {
  getPlayerDetailsAction,
  getPlayerOrganizationTournamentHistoryAction,
  updatePlayerAction,
  type PlayerOrganizationTournamentHistoryItem
} from '@/lib/services/players/players.actions'
import { PlayerDetails } from '@/lib/services/players/get-player-details'
import PlayerDniDisplay from '@/components/players/player-dni-display'

interface PlayerDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playerId: string
  tournamentId: string
  isOwner: boolean
  onPlayerUpdate?: (player: any) => void
}

export default function PlayerDetailsDialog({
  open,
  onOpenChange,
  playerId,
  tournamentId,
  isOwner,
  onPlayerUpdate
}: PlayerDetailsDialogProps) {
  const [player, setPlayer] = useState<PlayerDetails | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [canView, setCanView] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [historyItems, setHistoryItems] = useState<PlayerOrganizationTournamentHistoryItem[]>([])
  const [isHistoryVisible, setIsHistoryVisible] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dni, setDni] = useState('')
  const [phone, setPhone] = useState('')

  const { toast } = useToast()

  // Cargar datos del jugador cuando se abre el dialog
  useEffect(() => {
    if (open && playerId && isOwner) {
      loadPlayerDetails()
    }
  }, [open, playerId, isOwner])

  // Auto-enable editing mode when dialog opens and user can edit
  useEffect(() => {
    if (open && canEdit) {
      setIsEditing(true)
    }
  }, [open, canEdit])

  const loadPlayerDetails = async () => {
    setIsLoading(true)
    try {
      const result = await getPlayerDetailsAction(playerId, tournamentId)

      if (result.success && result.player) {
        setPlayer(result.player)
        setCanEdit(result.canEdit || false)
        setCanView(result.canView || false)
        setHistoryItems([])
        setIsHistoryVisible(false)
        setHistoryLoaded(false)

        // Inicializar form con datos del jugador
        setFirstName(result.player.first_name)
        setLastName(result.player.last_name)
        setDni(result.player.dni || '')
        setPhone(result.player.phone || '')
      } else {
        toast({
          title: 'Error',
          description: result.error || 'No se pudieron cargar los datos del jugador',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error loading player details:', error)
      toast({
        title: 'Error',
        description: 'Ocurrió un error al cargar los datos',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!canEdit || !player) {
      toast({
        title: 'Sin permisos',
        description: 'No tienes permisos para editar este jugador',
        variant: 'destructive'
      })
      return
    }

    startTransition(async () => {
      const result = await updatePlayerAction(player.id, {
        first_name: firstName,
        last_name: lastName,
        dni,
        phone: phone || undefined
      })

      if (result.success && 'player' in result) {
        toast({
          title: 'Jugador actualizado',
          description: 'Los datos se guardaron correctamente'
        })

        // Actualizar el player local
        setPlayer(prev => prev ? { ...prev, ...result.player } : null)
        setIsEditing(false)

        // Notificar al componente padre
        if (onPlayerUpdate) {
          onPlayerUpdate(result.player)
        }
      } else {
        toast({
          title: 'Error',
          description: result.error || 'No se pudo actualizar el jugador',
          variant: 'destructive'
        })
      }
    })
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!isPending) {
      if (!newOpen) {
        // Reset al cerrar
        setIsEditing(false)
        setPlayer(null)
        setCanEdit(false)
        setCanView(false)
        setIsLoading(true)
        setHistoryItems([])
        setIsHistoryVisible(false)
        setIsHistoryLoading(false)
        setHistoryLoaded(false)
      }
      onOpenChange(newOpen)
    }
  }

  const handleCancelEdit = () => {
    if (player) {
      setFirstName(player.first_name)
      setLastName(player.last_name)
      setDni(player.dni || '')
      setPhone(player.phone || '')
    }
    setIsEditing(false)
  }

  const getInitials = () => {
    if (!player) return '?'
    return `${player.first_name.charAt(0)}${player.last_name.charAt(0)}`.toUpperCase()
  }

  const formatTournamentDate = (date: string | null) => {
    if (!date) return 'Sin fecha'

    try {
      return new Date(date).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Argentina/Buenos_Aires'
      })
    } catch {
      return 'Sin fecha'
    }
  }

  const getTournamentTypeLabel = (type: string | null) => {
    if (type === 'LONG') return 'Largo'
    if (type === 'AMERICAN') return 'Americano'
    return type || 'Torneo'
  }

  const handleToggleHistory = async () => {
    if (isHistoryVisible) {
      setIsHistoryVisible(false)
      return
    }

    setIsHistoryVisible(true)

    if (historyLoaded) return

    setIsHistoryLoading(true)
    try {
      const result = await getPlayerOrganizationTournamentHistoryAction(playerId, tournamentId)

      if (result.success) {
        setHistoryItems(result.history)
        setHistoryLoaded(true)
      } else {
        toast({
          title: 'Error',
          description: result.error || 'No se pudo cargar el historial del jugador',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error loading player tournament history:', error)
      toast({
        title: 'Error',
        description: 'Ocurrio un error al cargar el historial',
        variant: 'destructive'
      })
    } finally {
      setIsHistoryLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {canEdit ? (
              <>
                <Pencil className="h-5 w-5 text-blue-600" />
                {isEditing ? 'Editar Jugador' : 'Detalles del Jugador'}
              </>
            ) : (
              <>
                <Eye className="h-5 w-5 text-slate-600" />
                Detalles del Jugador
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {canEdit && isEditing
              ? 'Modifica los datos del jugador de tu organización'
              : canEdit
              ? 'Información del jugador. Puedes editar los datos porque pertenece a tu organización.'
              : 'Información del jugador (solo lectura)'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
            <p className="text-sm text-muted-foreground">Cargando información...</p>
          </div>
        ) : player ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar y categoría */}
            <div className="flex items-center gap-4 pb-4 border-b">
              <Avatar className="h-16 w-16 border-2 border-border">
                <AvatarImage src={player.profile_image_url || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold text-lg">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">
                  {player.first_name} {player.last_name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  {player.category_name ? (
                    <Badge variant="secondary" className="text-xs">
                      {player.category_name}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin categoría</span>
                  )}
                  {player.score !== null && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Award className="h-3 w-3" />
                      <span>{player.score} pts</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Campos del formulario */}
            <div className="space-y-4">
              {/* Nombre */}
              <div className="space-y-2">
                <Label htmlFor="first_name" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Nombre
                </Label>
                {canEdit && isEditing ? (
                  <Input
                    id="first_name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isPending}
                    required
                  />
                ) : (
                  <Input
                    value={player.first_name}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                )}
              </div>

              {/* Apellido */}
              <div className="space-y-2">
                <Label htmlFor="last_name" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Apellido
                </Label>
                {canEdit && isEditing ? (
                  <Input
                    id="last_name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isPending}
                    required
                  />
                ) : (
                  <Input
                    value={player.last_name}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                )}
              </div>

              {/* DNI */}
              <div className="space-y-2">
                <Label htmlFor="dni" className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  DNI
                </Label>
                {canEdit && isEditing ? (
                  <div className="space-y-2">
                    <Input
                      id="dni"
                      value={dni}
                      onChange={(e) => setDni(e.target.value)}
                      placeholder="Puedes dejarlo vacío y cargarlo después"
                      disabled={isPending}
                    />
                    <p className="text-xs text-muted-foreground">
                      Si lo dejas vacío, el jugador quedará con DNI pendiente.
                    </p>
                  </div>
                ) : (
                  <div className="min-h-10 rounded-md border bg-muted px-3 py-2 text-sm flex items-center">
                    <PlayerDniDisplay dni={player.dni} dniIsTemporary={player.dni_is_temporary} />
                  </div>
                )}
              </div>

              {/* Telefono */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Telefono
                </Label>
                {canEdit && isEditing ? (
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+54 11 1234-5678"
                    disabled={isPending}
                  />
                ) : (
                  <Input
                    value={player.phone || 'Sin telefono'}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                )}
              </div>

              {/* Email - Solo visible si puede editar */}
              {canEdit && (
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  </Label>
                  <Input
                    id="email"
                    value={player.user_email || 'Sin email registrado'}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">
                    El email no puede modificarse desde aquí
                  </p>
                </div>
              )}

              {/* Mensaje de solo lectura si no puede editar */}
              {canView && !canEdit && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                  <p className="text-xs text-amber-800 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Este jugador no pertenece a tu club/organización. Solo puedes ver datos básicos.
                  </p>
                </div>
              )}
            </div>

              {canView && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <History className="h-4 w-4 text-blue-600" />
                        Historial con la organizacion
                      </h4>
                      <p className="mt-1 text-xs text-slate-600">
                        Torneos jugados por este jugador en parejas de la organizacion.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleToggleHistory}
                      disabled={isHistoryLoading}
                      className="shrink-0"
                    >
                      {isHistoryLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <History className="mr-2 h-4 w-4" />
                      )}
                      {isHistoryVisible ? 'Ocultar historial' : 'Ver historial de jugador'}
                    </Button>
                  </div>

                  {isHistoryVisible && (
                    <div className="space-y-2">
                      {isHistoryLoading ? (
                        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Cargando historial...
                        </div>
                      ) : historyItems.length > 0 ? (
                        historyItems.map((item) => (
                          <Button
                            key={`${item.tournamentId}-${item.inscriptionId}`}
                            asChild
                            variant="outline"
                            className="h-auto w-full justify-between gap-3 bg-white px-3 py-3 text-left"
                          >
                            <Link href={`/tournaments/${item.tournamentId}`}>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-slate-900">
                                  {item.tournamentName}
                                </span>
                                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                  <span>{formatTournamentDate(item.startDate)}</span>
                                  <span>-</span>
                                  <span>{getTournamentTypeLabel(item.tournamentType)}</span>
                                  {item.categoryName && (
                                    <>
                                      <span>-</span>
                                      <span>{item.categoryName}</span>
                                    </>
                                  )}
                                </span>
                              </span>
                              <ExternalLink className="h-4 w-4 shrink-0 text-slate-500" />
                            </Link>
                          </Button>
                        ))
                      ) : (
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                          Este jugador no tiene torneos previos registrados con esta organizacion.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            <DialogFooter className="gap-2">
              {canEdit && isEditing ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={isPending}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar cambios
                  </Button>
                </>
              ) : canEdit ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                  >
                    Cerrar
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Cerrar
                </Button>
              )}
            </DialogFooter>
          </form>
        ) : (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No se pudieron cargar los datos del jugador</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
