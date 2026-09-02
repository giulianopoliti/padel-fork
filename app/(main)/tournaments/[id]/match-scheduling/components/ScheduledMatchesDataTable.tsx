'use client'

import React, { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { ExistingMatch, SetResult } from '../actions'
import { createColumns } from './match-table/columns'
import MatchFilters, { MatchFiltersState } from './MatchFilters'
import { format } from 'date-fns'

interface Club {
  id: string
  name: string
}

interface ScheduledMatchesDataTableProps {
  createdMatches: ExistingMatch[]
  loading?: boolean
  onMatchDelete: (matchId: string) => Promise<void>
  onMatchResultSaved?: () => void
  onUpdateMatchResult?: (matchId: string, sets: SetResult[], winnerId: string, resultCouple1: string, resultCouple2: string) => Promise<{success: boolean, error?: string}>
  onModifyMatchResult?: (matchId: string, sets: SetResult[], winnerId: string, resultCouple1: string, resultCouple2: string) => Promise<{success: boolean, error?: string}>
  onModifySchedule?: (scheduleData: {matchId: string, date: string | null, startTime: string | null, endTime: string | null, court: string | null, notes?: string, clubId?: string}) => Promise<{success: boolean, error?: string}>
  onScheduleModified?: () => void
  clubes?: Club[]
}

const ScheduledMatchesDataTable: React.FC<ScheduledMatchesDataTableProps> = ({
  createdMatches,
  loading,
  onMatchDelete,
  onMatchResultSaved,
  onUpdateMatchResult,
  onModifyMatchResult,
  onModifySchedule,
  onScheduleModified,
  clubes = []
}) => {
  const isMobile = useIsMobile()
  
  // Filters state
  const [filters, setFilters] = useState<MatchFiltersState>({
    selectedDate: undefined,
    selectedStatus: 'all',
    startTime: '',
    endTime: '',
    selectedClubId: 'all'
  })

  // Filter matches based on current filters
  const filteredMatches = useMemo(() => {
    return createdMatches.filter((match) => {
      // Filter by date
      if (filters.selectedDate) {
        const matchDate = match.scheduled_date
        if (!matchDate) return false
        
        const filterDateStr = format(filters.selectedDate, 'yyyy-MM-dd')
        if (matchDate !== filterDateStr) return false
      }

      // Filter by status
      if (filters.selectedStatus !== 'all') {
        if (match.status !== filters.selectedStatus) return false
      }

      // Filter by club
      if (filters.selectedClubId !== 'all') {
        if (match.club_id !== filters.selectedClubId) return false
      }

      // Filter by start time (desde - hora de inicio del partido)
      if (filters.startTime && match.scheduled_start_time) {
        if (match.scheduled_start_time < filters.startTime) return false
      }

      // Filter by end time (hasta - hora de inicio del partido)
      if (filters.endTime && match.scheduled_start_time) {
        if (match.scheduled_start_time > filters.endTime) return false
      }

      // Validation: if both times are set, startTime must be < endTime
      if (filters.startTime && filters.endTime && filters.startTime >= filters.endTime) {
        return false
      }

      return true
    })
  }, [createdMatches, filters])

  const columns = createColumns(onMatchDelete, onMatchResultSaved, onUpdateMatchResult, onModifyMatchResult, onModifySchedule, onScheduleModified, loading, isMobile, clubes)
  
  const table = useReactTable({
    data: filteredMatches,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <Card className="bg-white border-gray-200 shadow-lg">
      <CardHeader className="pb-4 border-b border-gray-200">
        <CardTitle className="text-gray-900 flex items-center gap-2">
          <div className="bg-blue-100 p-2 rounded-surface">
            <MapPin className="w-5 h-5 text-blue-600" />
          </div>
          <span>Partidos Programados</span>
          <span className="text-base font-normal text-gray-600">
            ({filteredMatches.length}{filteredMatches.length !== createdMatches.length && ` de ${createdMatches.length}`})
          </span>
        </CardTitle>
      </CardHeader>

      {/* Filters Section */}
      <div className="p-4 border-b border-gray-200">
        <MatchFilters
          filters={filters}
          onFiltersChange={setFilters}
          matchCount={filteredMatches.length}
          clubes={clubes}
        />
      </div>
      
      <CardContent className="p-0">
        {filteredMatches.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-sm">
              {createdMatches.length === 0 
                ? 'No hay partidos programados'
                : 'No se encontraron partidos con los filtros seleccionados'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-b-surface">
            <Table>
              <TableHeader className="bg-gray-50 border-b border-gray-200">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="border-gray-200 hover:bg-gray-100">
                    {headerGroup.headers.map((header) => (
                      <TableHead 
                        key={header.id} 
                        className="text-gray-700 font-semibold border-gray-200"
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                      className="border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell 
                          key={cell.id} 
                          className="text-gray-700 border-gray-200 py-4"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center text-gray-500"
                    >
                      No hay partidos programados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default ScheduledMatchesDataTable
