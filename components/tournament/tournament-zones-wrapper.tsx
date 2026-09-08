"use client"

import { useState, useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Loader2 } from 'lucide-react'

// Componentes existentes
import TournamentZonesTab from './tournament-zones-tab'           // Legacy read-only
import TournamentZonesMatrix from './zones/TournamentZonesMatrix'  // New system

interface TournamentZonesWrapperProps {
  tournamentId: string
  isOwner?: boolean
  tournamentStatus?: string
  isSingleZone?: boolean
}

interface SystemTypeResponse {
  isLegacy: boolean
  metadata?: {
    tournamentId: string
    hasZonePositionsTable: boolean
    hasZonePositionsData: boolean
    detectionTime: string
  }
  error?: string
  details?: string
}

/**
 * Wrapper que decide qué componente de zonas mostrar basándose en el tipo de sistema:
 * 
 * - Legacy: Usa TournamentZonesTab (solo lectura, compatible con torneos existentes)
 * - Nuevo: Usa TournamentZonesMatrix (funcionalidad completa con drag-drop)
 * 
 * Este wrapper es CRÍTICO para mantener compatibilidad con los 16 torneos
 * existentes en producción sin romper funcionalidad.
 */
export default function TournamentZonesWrapper({
  tournamentId,
  isOwner = false,
  tournamentStatus,
  isSingleZone = false
}: TournamentZonesWrapperProps) {
  const [systemType, setSystemType] = useState<'legacy' | 'new' | 'loading' | 'error'>('loading')
  const [errorDetails, setErrorDetails] = useState<string>('')
  const [metadata, setMetadata] = useState<SystemTypeResponse['metadata']>()

  useEffect(() => {
    const detectSystemType = async () => {
      if (!tournamentId) {
        setSystemType('error')
        setErrorDetails('No tournament ID provided')
        return
      }

      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/system-type`)
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data: SystemTypeResponse = await response.json()
        
        // Si hay error en la respuesta pero viene isLegacy, usar legacy (fallback seguro)
        if (data.error) {
          console.warn(`[TournamentZonesWrapper] Detection warning:`, data.error, data.details)
        }
        
        setSystemType(data.isLegacy ? 'legacy' : 'new')
        setMetadata(data.metadata)
        
        // Log para debugging en desarrollo
        if (process.env.NODE_ENV === 'development') {
          console.log(`[TournamentZonesWrapper] Tournament ${tournamentId} detected as:`, 
            data.isLegacy ? 'LEGACY' : 'NEW', data.metadata)
        }
        
      } catch (error: any) {
        console.error('[TournamentZonesWrapper] Detection failed:', error)
        
        // Fallback crítico: Si hay cualquier error, usar legacy (más seguro)
        setSystemType('legacy')
        setErrorDetails(`Detection failed: ${error.message}. Defaulting to legacy system.`)
        
        // En desarrollo, mostrar el error claramente
        if (process.env.NODE_ENV === 'development') {
          console.warn('[TournamentZonesWrapper] Falling back to legacy system due to error')
        }
      }
    }

    detectSystemType()
  }, [tournamentId])

  // Estado de carga
  if (systemType === 'loading') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-600 mr-3" />
          <span className="text-slate-600">Detectando tipo de sistema...</span>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  // Estado de error (muy raro, debería fallar a legacy)
  if (systemType === 'error') {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Error al cargar zonas:</strong> {errorDetails}
          <br />
          <span className="text-sm mt-2 block">
            Por favor, recarga la página o contacta al administrador.
          </span>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <>

      {/* Error de detección pero funcionando con legacy */}
      {errorDetails && systemType === 'legacy' && (
        <Alert className="mb-4 border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <strong>Aviso:</strong> Se detectó un problema menor pero el sistema funciona normalmente.
          </AlertDescription>
        </Alert>
      )}

      {/* Renderizar componente según el tipo de sistema */}
      {systemType === 'legacy' ? (
        // Sistema Legacy: Solo lectura para todos los usuarios
        // Esto garantiza compatibilidad total con los 16 torneos existentes
        <TournamentZonesTab tournamentId={tournamentId} />
      ) : (
        // Sistema Nuevo: Funcionalidad completa para owners, lectura para otros
        <TournamentZonesMatrix
          tournamentId={tournamentId}
          isOwner={isOwner}
          tournamentStatus={tournamentStatus}
          isSingleZone={isSingleZone}
        />
      )}
    </>
  )
}
