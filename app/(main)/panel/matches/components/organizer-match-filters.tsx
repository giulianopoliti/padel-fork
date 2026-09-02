'use client'

import type React from "react"
import { Filter, Clock, MapPin, X, CalendarRange } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface OrganizerMatchFiltersState {
  fromDate: string
  fromTime: string
  toDate: string
  toTime: string
  selectedStatus: string
  selectedClubId: string
}

interface Club {
  id: string
  name: string
}

interface OrganizerMatchFiltersProps {
  filters: OrganizerMatchFiltersState
  defaultFilters: OrganizerMatchFiltersState
  onFiltersChange: (filters: OrganizerMatchFiltersState) => void
  matchCount: number
  clubes?: Club[]
}

const OrganizerMatchFilters: React.FC<OrganizerMatchFiltersProps> = ({
  filters,
  defaultFilters,
  onFiltersChange,
  matchCount,
  clubes = [],
}) => {
  const hasActiveFilters =
    filters.fromDate !== defaultFilters.fromDate ||
    filters.fromTime !== defaultFilters.fromTime ||
    filters.toDate !== defaultFilters.toDate ||
    filters.toTime !== defaultFilters.toTime ||
    filters.selectedStatus !== "all" ||
    filters.selectedClubId !== "all"

  const isInvalidRange =
    `${filters.fromDate}T${filters.fromTime}` > `${filters.toDate}T${filters.toTime}`

  const handleClearFilters = () => {
    onFiltersChange(defaultFilters)
  }

  const handleFromDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, fromDate: e.target.value })
  }

  const handleFromTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, fromTime: e.target.value || defaultFilters.fromTime })
  }

  const handleToDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, toDate: e.target.value })
  }

  const handleToTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, toTime: e.target.value || defaultFilters.toTime })
  }

  const handleStatusChange = (value: string) => {
    onFiltersChange({ ...filters, selectedStatus: value })
  }

  const handleClubChange = (value: string) => {
    onFiltersChange({ ...filters, selectedClubId: value })
  }

  return (
    <div className="space-y-4 rounded-surface border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">Filtros de Partidos</h3>
          {matchCount > 0 && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">
              {matchCount} {matchCount === 1 ? "partido" : "partidos"}
            </span>
          )}
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-8 text-xs text-slate-600 hover:bg-slate-200 hover:text-slate-900"
          >
            <X className="mr-1 h-3 w-3" />
            Volver a hoy
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="space-y-3 rounded-surface border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CalendarRange className="h-4 w-4 text-slate-500" />
            Desde
          </div>
          <div className="space-y-2">
            <Label htmlFor="organizer-from-date" className="text-xs text-slate-700">
              Fecha
            </Label>
            <Input
              id="organizer-from-date"
              type="date"
              value={filters.fromDate}
              onChange={handleFromDateChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organizer-from-time" className="text-xs text-slate-700">
              Hora
            </Label>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="organizer-from-time"
                type="time"
                value={filters.fromTime}
                onChange={handleFromTimeChange}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-surface border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CalendarRange className="h-4 w-4 text-slate-500" />
            Hasta
          </div>
          <div className="space-y-2">
            <Label htmlFor="organizer-to-date" className="text-xs text-slate-700">
              Fecha
            </Label>
            <Input
              id="organizer-to-date"
              type="date"
              value={filters.toDate}
              onChange={handleToDateChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organizer-to-time" className="text-xs text-slate-700">
              Hora
            </Label>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="organizer-to-time"
                type="time"
                value={filters.toTime}
                onChange={handleToTimeChange}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-surface border border-slate-200 bg-white p-4">
          <Label className="text-xs text-slate-700">Estado</Label>
          <Select value={filters.selectedStatus} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="PENDING">Programados</SelectItem>
              <SelectItem value="IN_PROGRESS">En curso</SelectItem>
              <SelectItem value="FINISHED">Finalizados</SelectItem>
              <SelectItem value="COMPLETED">Completados</SelectItem>
              <SelectItem value="DRAFT">Borrador</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 rounded-surface border border-slate-200 bg-white p-4">
          <Label className="text-xs text-slate-700">Club</Label>
          <Select value={filters.selectedClubId} onValueChange={handleClubChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos los clubes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clubes</SelectItem>
              {clubes.map((club) => (
                <SelectItem key={club.id} value={club.id}>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-slate-500" />
                    {club.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-surface border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        El rango nace en el dia completo de hoy y podes ajustarlo libremente por fecha y horario.
      </div>

      {isInvalidRange && (
        <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>La fecha y hora "Desde" debe ser anterior o igual a "Hasta"</span>
        </div>
      )}
    </div>
  )
}

export default OrganizerMatchFilters
