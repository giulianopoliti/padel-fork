'use client'

import { useState } from 'react'
import { MoreHorizontal, Trash2, Camera, BarChart3, Edit, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ExistingMatch, SetResult } from '../../actions'
import LoadMatchResultDialog from '../LoadMatchResultDialog'
import ModifyScheduleDialog from '../ModifyScheduleDialog'

interface Club {
  id: string
  name: string
}

interface MatchActionsDropdownProps {
  match: ExistingMatch
  onMatchDelete: (matchId: string) => Promise<void>
  onMatchResultSaved?: () => void
  onUpdateMatchResult?: (matchId: string, sets: SetResult[], winnerId: string, resultCouple1: string, resultCouple2: string) => Promise<{success: boolean, error?: string}>
  onModifyMatchResult?: (matchId: string, sets: SetResult[], winnerId: string, resultCouple1: string, resultCouple2: string) => Promise<{success: boolean, error?: string}>
  onModifySchedule?: (scheduleData: {matchId: string, date: string | null, startTime: string | null, endTime: string | null, court: string | null, notes?: string, clubId?: string}) => Promise<{success: boolean, error?: string}>
  onScheduleModified?: () => void
  loading?: boolean
  clubes?: Club[]
}

const MatchActionsDropdown: React.FC<MatchActionsDropdownProps> = ({
  match,
  onMatchDelete,
  onMatchResultSaved,
  onUpdateMatchResult,
  onModifyMatchResult,
  onModifySchedule,
  onScheduleModified,
  loading,
  clubes = []
}) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [showModifyResultDialog, setShowModifyResultDialog] = useState(false)
  const [showModifyScheduleDialog, setShowModifyScheduleDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      await onMatchDelete(match.id)
      setShowDeleteDialog(false)
      setDropdownOpen(false)
    } catch (error) {
      console.error('Error deleting match:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteClick = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowDeleteDialog(true)
    }, 100)
  }

  const handleUploadPhoto = () => {
    console.log('Upload photo for match:', match.id)
  }

  const handleLoadResult = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowResultDialog(true)
    }, 100)
  }

  const handleModifyResult = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowModifyResultDialog(true)
    }, 100)
  }

  const handleModifySchedule = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowModifyScheduleDialog(true)
    }, 100)
  }

  const handleResultSaved = () => {
    if (onMatchResultSaved) {
      onMatchResultSaved()
    }
  }

  const handleScheduleModified = () => {
    if (onScheduleModified) {
      onScheduleModified()
    }
  }

  // Check if match has results (is FINISHED or COMPLETED)
  const hasResults = match.status === 'FINISHED' || match.status === 'COMPLETED'

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            disabled={loading}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Abrir menú de acciones</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="end" 
          className="w-56 bg-white border-gray-200"
        >
          {/* Show "Cargar Resultado" only if match doesn't have results */}
          {!hasResults && (
            <DropdownMenuItem 
              onClick={handleLoadResult}
              className="flex items-center gap-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-50 focus:text-blue-700"
            >
              <BarChart3 className="h-4 w-4" />
              Cargar Resultado
            </DropdownMenuItem>
          )}

          {/* Show "Modificar Resultado" only if match has results */}
          {hasResults && (
            <DropdownMenuItem 
              onClick={handleModifyResult}
              className="flex items-center gap-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-50 focus:text-blue-700"
            >
              <Edit className="h-4 w-4" />
              Modificar Resultado
            </DropdownMenuItem>
          )}

          {/* Always show "Modificar Datos" */}
          <DropdownMenuItem
            onClick={handleModifySchedule}
            className="flex items-center gap-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-50 focus:text-blue-700"
          >
            <Clock className="h-4 w-4" />
            Modificar Datos
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={handleUploadPhoto}
            className="flex items-center gap-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-50 focus:text-blue-700"
          >
            <Camera className="h-4 w-4" />
            Cargar Foto
          </DropdownMenuItem>
          
          <DropdownMenuSeparator className="bg-gray-200" />
          
          <DropdownMenuItem 
            onClick={handleDeleteClick}
            className="flex items-center gap-2 text-red-600 hover:bg-red-50 hover:text-red-700 focus:bg-red-50 focus:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar Partido
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>


      <AlertDialog 
        open={showDeleteDialog} 
        onOpenChange={(open) => {
          setShowDeleteDialog(open)
          if (!open) {
            setDropdownOpen(false)
          }
        }}
      >
        <AlertDialogContent className="bg-white border-gray-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900">
              ¿Eliminar partido?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600">
              Esta acción no se puede deshacer. El partido será eliminado permanentemente
              del sistema de programación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300"
              disabled={isDeleting}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LoadMatchResultDialog
        match={match}
        open={showResultDialog}
        onOpenChange={setShowResultDialog}
        onResultSaved={handleResultSaved}
        onUpdateMatchResult={onUpdateMatchResult}
      />

      <LoadMatchResultDialog
        match={match}
        open={showModifyResultDialog}
        onOpenChange={setShowModifyResultDialog}
        onResultSaved={handleResultSaved}
        onUpdateMatchResult={onModifyMatchResult}
        isModifyMode={true}
      />

      <ModifyScheduleDialog
        match={match}
        open={showModifyScheduleDialog}
        onOpenChange={setShowModifyScheduleDialog}
        onScheduleModified={handleScheduleModified}
        onModifySchedule={onModifySchedule}
        clubes={clubes}
      />
    </>
  )
}

export default MatchActionsDropdown
