'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Calendar, Edit, Trash2 } from 'lucide-react'
import { TournamentFecha } from '../../types'
import CreateFechaDialog from './CreateFechaDialog'
import EditFechaDialog from './EditFechaDialog'
import DeleteFechaAlert from './DeleteFechaAlert'
import { getBracketLabel } from '../../utils'
import { formatPeriod } from '@/app/(main)/schedules/display'

interface FechaManagerProps {
  fechas: TournamentFecha[]
  selectedFechaId: string | null
  onFechaSelect: (fechaId: string) => void
  onFechaCreated: (fecha: TournamentFecha) => void
  onFechaUpdated: (fecha: TournamentFecha) => void
  onFechaDeleted: (fechaId: string) => void
  tournamentId: string
  sharedCreateHref?: string
}

export default function FechaManager({
  fechas,
  selectedFechaId,
  onFechaSelect,
  onFechaCreated,
  onFechaUpdated,
  onFechaDeleted,
  tournamentId,
  sharedCreateHref
}: FechaManagerProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingFecha, setEditingFecha] = useState<TournamentFecha | null>(null)
  const [deletingFecha, setDeletingFecha] = useState<TournamentFecha | null>(null)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="default">Activa</Badge>
      case 'COMPLETED':
        return <Badge variant="secondary">Completada</Badge>
      case 'CANCELED':
        return <Badge variant="destructive">Cancelada</Badge>
      default:
        return <Badge variant="outline">Pendiente</Badge>
    }
  }

  return (
    <>
      <Card className="h-full min-w-0">
        <CardHeader className="gap-3 space-y-0 p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Calendar className="size-5 shrink-0" aria-hidden />
            Fechas
          </CardTitle>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button type="button" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal text-left" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus aria-hidden /> Nueva fecha
            </Button>
            {sharedCreateHref && (
              <Button asChild size="sm" variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal text-left">
                <Link href={sharedCreateHref}>Crear fecha compartida</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
            <div className="p-4 space-y-3">
              {fechas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No hay fechas creadas</p>
                  <p className="text-sm">Crea tu primera fecha para comenzar</p>
                </div>
              ) : (
                fechas.map((fecha) => (
                  <Card
                    key={fecha.id}
                    className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                      selectedFechaId === fecha.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => onFechaSelect(fecha.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate">{fecha.name}</h3>
                          {fecha.name.trim() !== `Fecha ${fecha.fecha_number}` && (
                            <p className="text-sm text-muted-foreground">Fecha {fecha.fecha_number}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <Button
                            variant="ghost"
                              size="icon"
                              className="size-8"
                            aria-label={`Editar ${fecha.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingFecha(fecha)
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                              size="icon"
                              className="size-8"
                            aria-label={`Eliminar ${fecha.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeletingFecha(fecha)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {getStatusBadge(fecha.status)}

                        {(fecha.start_date || fecha.end_date) && (
                          <p className="text-sm text-muted-foreground">
                            {formatPeriod(fecha.start_date ?? null, fecha.end_date ?? null)}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm text-muted-foreground">
                            {fecha._count_time_slots?.[0]?.count ?? 0} {fecha._count_time_slots?.[0]?.count === 1 ? 'horario' : 'horarios'}
                          </span>
                          <div className="flex items-center gap-1">
                            {fecha.round_type === 'ZONE' && (
                              <Badge variant="outline" className="text-xs">
                                Tabla de posiciones
                              </Badge>
                            )}
                            {fecha.round_type !== 'ZONE' && (
                              <Badge variant="outline" className="text-xs">
                                {getBracketLabel(fecha.bracket_key)}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {fecha.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {fecha.description}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateFechaDialog
        tournamentId={tournamentId}
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onFechaCreated={onFechaCreated}
        nextFechaNumber={fechas.length + 1}
      />

      {editingFecha && (
        <EditFechaDialog
          fecha={editingFecha}
          isOpen={!!editingFecha}
          onClose={() => setEditingFecha(null)}
          onFechaUpdated={onFechaUpdated}
        />
      )}

      {deletingFecha && (
        <DeleteFechaAlert
          fecha={deletingFecha}
          isOpen={!!deletingFecha}
          onClose={() => setDeletingFecha(null)}
          onFechaDeleted={onFechaDeleted}
        />
      )}
    </>
  )
}
