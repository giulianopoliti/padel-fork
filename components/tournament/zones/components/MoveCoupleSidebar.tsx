'use client'

/**
 * MoveCoupleSidebar Component
 *
 * Desktop sidebar (slides from right) for moving couples between zones.
 * Provides a click-to-move alternative to drag-and-drop for better UX.
 *
 * UX Flow:
 * 1. User clicks a couple
 * 2. This sidebar slides in from right
 * 3. Shows list of zones with availability status
 * 4. User clicks destination zone (or pool/delete options)
 * 5. Couple moves + sidebar closes
 *
 * Features:
 * - Visual capacity bars for each zone
 * - "Devolver a Pool" option (if from zone)
 * - "Eliminar del Torneo" option (always available)
 * - Search/filter (if >8 zones)
 * - Keyboard shortcuts ready
 */

import React, { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { MapPin, Users, ChevronRight, Trash2, AlertTriangle, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DeleteCoupleDialog } from './DeleteCoupleDialog'

interface ZoneOption {
  id: string
  name: string
  currentSize: number
  capacity: number
  canReceive: boolean
}

interface MoveCoupleSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCouple: {
    id: string
    name: string
    sourceZoneId: string | null
  } | null
  zones: ZoneOption[]
  onMoveToZone: (zoneId: string) => void
  onMoveToPool: () => void
  onDelete: () => void
  showPoolOption: boolean
  showDeleteOption: boolean
}

export function MoveCoupleSidebar({
  open,
  onOpenChange,
  selectedCouple,
  zones,
  onMoveToZone,
  onMoveToPool,
  onDelete,
  showPoolOption,
  showDeleteOption
}: MoveCoupleSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Handler para mover a zona
  const handleSelectZone = (zoneId: string) => {
    onMoveToZone(zoneId)
    onOpenChange(false)
  }

  // Handler para mover a pool
  const handleSelectPool = () => {
    onMoveToPool()
    onOpenChange(false)
  }

  // Handler para abrir dialog de confirmación
  const handleDeleteClick = () => {
    setShowDeleteDialog(true)
  }

  // Handler para confirmar eliminación
  const handleConfirmDelete = () => {
    onDelete()
    onOpenChange(false)
  }

  if (!selectedCouple) return null

  // Filtrar zonas por búsqueda
  const filteredZones = zones.filter(zone => {
    // Excluir zona origen
    if (selectedCouple.sourceZoneId === zone.id) return false

    // Filtrar por búsqueda
    if (searchQuery) {
      return zone.name.toLowerCase().includes(searchQuery.toLowerCase())
    }

    return true
  })

  // Mostrar búsqueda solo si hay más de 8 zonas
  const showSearch = zones.length > 8

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[400px] sm:w-[500px] flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>Mover Pareja</SheetTitle>
          <SheetDescription className="text-base font-medium text-slate-900">
            {selectedCouple.name}
          </SheetDescription>

          {/* Search/Filter (si hay >8 zonas) */}
          {showSearch && (
            <div className="mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar zona..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          )}

          <p className="text-sm text-slate-500 mt-2">
            {searchQuery
              ? `${filteredZones.length} zona${filteredZones.length !== 1 ? 's' : ''} encontrada${filteredZones.length !== 1 ? 's' : ''}`
              : 'Seleccioná la zona de destino:'
            }
          </p>
        </SheetHeader>

        {/* Lista de Zonas + Acciones - Todo scrolleable */}
        <div className="flex-1 overflow-y-auto mt-6 space-y-2 px-1">
          {/* Zonas disponibles */}
          {filteredZones.length > 0 ? (
            filteredZones.map((zone) => (
              <ZoneOptionCard
                key={zone.id}
                zone={zone}
                onSelect={() => handleSelectZone(zone.id)}
              />
            ))
          ) : (
            <div className="text-center py-8 text-slate-500">
              <p>No se encontraron zonas</p>
              {searchQuery && (
                <Button
                  variant="link"
                  onClick={() => setSearchQuery('')}
                  className="mt-2"
                >
                  Limpiar búsqueda
                </Button>
              )}
            </div>
          )}

          {/* Separator visual */}
          {(showPoolOption || showDeleteOption) && filteredZones.length > 0 && (
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-slate-500 font-medium">
                  O realizar otra acción
                </span>
              </div>
            </div>
          )}

          {/* Devolver a Pool - DENTRO del área scrolleable con color azul */}
          {showPoolOption && (
            <button
              onClick={handleSelectPool}
              className={cn(
                "w-full text-left p-3 rounded-surface border-2 transition-all",
                "border-blue-200 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 active:scale-[0.98]"
              )}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base text-blue-900">
                    Devolver a Pool Sin Asignar
                  </div>
                  <div className="text-xs text-blue-700">
                    Quitar de zona actual
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-blue-400 flex-shrink-0" />
              </div>
            </button>
          )}

          {/* Eliminar del Torneo - DENTRO del área scrolleable con color rojo */}
          {showDeleteOption && (
            <button
              onClick={handleDeleteClick}
              className={cn(
                "w-full text-left p-3 rounded-surface border-2 transition-all",
                "border-red-200 bg-red-50 hover:border-red-400 hover:bg-red-100 active:scale-[0.98]"
              )}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base text-red-900">
                    Eliminar del Torneo
                  </div>
                  <div className="text-xs text-red-700">
                    Se borrará de inscripciones y zonas
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-red-400 flex-shrink-0" />
              </div>
            </button>
          )}
        </div>

        {/* Footer: Solo Cancelar con color gris */}
        <SheetFooter className="flex-shrink-0 mt-4 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full bg-slate-50 hover:bg-slate-100 border-slate-300"
          >
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>

      {/* Delete Confirmation Dialog */}
      <DeleteCoupleDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        coupleName={selectedCouple.name}
        onConfirm={handleConfirmDelete}
      />
    </Sheet>
  )
}

/**
 * ZoneOptionCard Component
 *
 * Individual zone card showing capacity and availability
 */
function ZoneOptionCard({
  zone,
  onSelect
}: {
  zone: ZoneOption
  onSelect: () => void
}) {
  const capacityPercentage = (zone.currentSize / zone.capacity) * 100
  const isDisabled = !zone.canReceive

  return (
    <button
      onClick={onSelect}
      disabled={isDisabled}
      className={cn(
        'w-full text-left p-3 rounded-surface border-2 transition-all',
        isDisabled
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
          : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50 active:scale-[0.98]'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* Icon */}
          <div
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
              isDisabled
                ? 'bg-gray-100 text-gray-400'
                : 'bg-green-100 text-green-700'
            )}
          >
            <MapPin className="h-4 w-4" />
          </div>

          {/* Zone Name */}
          <div className="font-semibold text-base truncate">
            {zone.name}
          </div>
        </div>

        {/* Status Indicator */}
        {isDisabled ? (
          <Badge variant="destructive" className="flex-shrink-0 text-xs">
            Llena
          </Badge>
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
        )}
      </div>

      {/* Visual capacity bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-600">
          <span>{zone.currentSize} de {zone.capacity} parejas</span>
          <span className="font-medium">{Math.round(capacityPercentage)}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-300',
              capacityPercentage >= 100 ? 'bg-red-500' :
              capacityPercentage >= 75 ? 'bg-yellow-500' :
              'bg-green-500'
            )}
            style={{ width: `${Math.min(capacityPercentage, 100)}%` }}
          />
        </div>
      </div>
    </button>
  )
}
