'use client'

/**
 * DeleteCoupleDialog Component
 *
 * AlertDialog for confirming couple deletion from tournament.
 * Uses shadcn/ui AlertDialog for better UX than window.confirm().
 *
 * Shows:
 * - Couple name being deleted
 * - Warning about what will be removed (inscriptions, zones, positions)
 * - Cancel/Confirm buttons
 */

import React from 'react'
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
import { AlertTriangle } from 'lucide-react'

interface DeleteCoupleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  coupleName: string
  onConfirm: () => void
}

export function DeleteCoupleDialog({
  open,
  onOpenChange,
  coupleName,
  onConfirm
}: DeleteCoupleDialogProps) {
  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <AlertDialogTitle className="text-xl">
              ¿Eliminar pareja del torneo?
            </AlertDialogTitle>
          </div>

          <AlertDialogDescription className="space-y-4 pt-2">
            <p className="text-base">
              Estás por eliminar la pareja:{' '}
              <span className="font-semibold text-slate-900">{coupleName}</span>
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-surface p-4">
              <p className="text-sm font-medium text-amber-900 mb-2">
                Esta acción eliminará:
              </p>
              <ul className="text-sm text-amber-800 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">•</span>
                  <span>Su inscripción al torneo</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">•</span>
                  <span>Su asignación en zonas (si aplica)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">•</span>
                  <span>Sus posiciones y estadísticas en zonas</span>
                </li>
              </ul>
            </div>

            <p className="text-sm text-slate-500 font-medium">
              ⚠️ Esta acción no se puede deshacer
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            Sí, eliminar pareja
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
