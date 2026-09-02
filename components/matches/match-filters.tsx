'use client'

import React, { useState } from 'react'
import { Calendar as CalendarIcon, X, Filter, Clock, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface MatchFiltersState {
  selectedDate: Date | undefined
  selectedStatus: string
  startTime: string
  endTime: string
  selectedClubId: string
}

interface Club {
  id: string
  name: string
}

interface MatchFiltersProps {
  filters: MatchFiltersState
  onFiltersChange: (filters: MatchFiltersState) => void
  matchCount: number
  clubes?: Club[]
}

const MatchFilters: React.FC<MatchFiltersProps> = ({
  filters,
  onFiltersChange,
  matchCount,
  clubes = []
}) => {
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const hasActiveFilters =
    filters.selectedDate !== undefined ||
    filters.selectedStatus !== 'all' ||
    filters.startTime !== '' ||
    filters.endTime !== '' ||
    filters.selectedClubId !== 'all'

  const handleClearFilters = () => {
    onFiltersChange({
      selectedDate: undefined,
      selectedStatus: 'all',
      startTime: '',
      endTime: '',
      selectedClubId: 'all'
    })
  }

  const handleDateSelect = (date: Date | undefined) => {
    onFiltersChange({ ...filters, selectedDate: date })
    setDatePickerOpen(false)
  }

  const handleStatusChange = (value: string) => {
    onFiltersChange({ ...filters, selectedStatus: value })
  }

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, startTime: e.target.value })
  }

  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, endTime: e.target.value })
  }

  const handleClubChange = (value: string) => {
    onFiltersChange({ ...filters, selectedClubId: value })
  }

  return (
    <div className="space-y-4 rounded-surface border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">
            Filtros de Partidos
          </h3>
          {matchCount > 0 && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">
              {matchCount} {matchCount === 1 ? 'partido' : 'partidos'}
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
            Limpiar filtros
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-2">
          <Label className="text-xs text-slate-700">Fecha</Label>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !filters.selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.selectedDate ? (
                  format(filters.selectedDate, "dd/MM/yyyy", { locale: es })
                ) : (
                  <span>Seleccionar fecha</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.selectedDate}
                onSelect={handleDateSelect}
                initialFocus
                locale={es}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
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

        <div className="space-y-2">
          <Label className="text-xs text-slate-700">Desde (hora)</Label>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-slate-400" />
            <Input
              type="time"
              value={filters.startTime}
              onChange={handleStartTimeChange}
              className="pl-10"
              placeholder="HH:MM"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-slate-700">Hasta (hora)</Label>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-slate-400" />
            <Input
              type="time"
              value={filters.endTime}
              onChange={handleEndTimeChange}
              className="pl-10"
              placeholder="HH:MM"
            />
          </div>
        </div>

        <div className="space-y-2">
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

      {filters.startTime && filters.endTime && filters.startTime >= filters.endTime && (
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
          <span>La hora "Desde" debe ser menor que la hora "Hasta"</span>
        </div>
      )}
    </div>
  )
}

export default MatchFilters
