/**
 * BRACKET VISUALIZATION V2 - COMPONENTE PRINCIPAL
 * 
 * Nuevo sistema de visualización de brackets con arquitectura modular.
 * 
 * @author Claude Code Assistant
 * @version 2.0.0
 * @created 2025-01-17
 */

'use client'

import React from 'react'
import type { 
  BracketVisualizationV2Props, 
  BracketConfig,
  BracketState,
  CoupleData,
  BracketMatchV2
} from './types/bracket-types'
import type {
  DragDropConfig,
  SlotPosition
} from './types/drag-drop-types'
import { 
  DEFAULT_BRACKET_CONFIG,
  getBracketConfigForAlgorithm,
  getFeaturesForUserRole
} from './constants/bracket-constants'
import { useBracketData } from './hooks/useBracketData'
import { BracketRenderer } from './components/BracketRenderer'
import { ImprovedBracketRenderer } from './components/ImprovedBracketRenderer'
import { BracketDragDropProvider, useBracketDragDrop } from './context/bracket-drag-context'
import { useBracketDragOperations } from './hooks/useBracketDragOperations'
import { useTournamentFinalization } from './hooks/useTournamentFinalization'
import { PointsCalculationBanner } from './components/PointsCalculationBanner'
import ReadOnlyBracketTab from '../read-only-bracket-tab'
import { Trophy } from 'lucide-react'
import BackFromBracketButton from '@/app/(main)/tournaments/[id]/settings/components/BackFromBracketButton'

// REMOVIDO: generatePlaceholderBracketAction import (causaba error de serialización)
// Ahora usamos API Route en su lugar

/**
 * Componente interno que usa el drag drop context
 */
function BracketVisualizationV2Internal({
  tournamentId,
  algorithm = 'serpentine',
  config,
  isOwner = false,
  tournamentStatus,
  onMatchUpdate,
  onDataRefresh,
  onBracketStateChange
}: BracketVisualizationV2Props) {

  /**
   * Configuración final del bracket
   */
  // ✅ FIXED: Estabilizar config sin JSON.stringify para mejor performance
  const finalConfig: BracketConfig = React.useMemo(() => {
    const baseConfig = getBracketConfigForAlgorithm(algorithm)
    const userFeatures = getFeaturesForUserRole(isOwner, !isOwner)
    
    return {
      ...baseConfig,
      features: {
        ...baseConfig.features,
        ...userFeatures,
        enableDragDrop: baseConfig.features.enableDragDrop && isOwner
      },
      ...config
    }
  }, [algorithm, isOwner, config]) // ✅ Remove JSON.stringify - let React handle object comparison

  /**
   * Hook para obtener datos del bracket
   */
  const {
    data: bracketData,
    loading,
    error,
    isRefetching,
    refetch,
    config: hookConfig
  } = useBracketData(tournamentId, {
    algorithm,
    config: finalConfig,
    enableRealtime: false,  // ✅ DESHABILITAR REALTIME para debugging
    enabled: true
  })

  /**
   * Hook de drag & drop operations
   */
  const dragOperations = useBracketDragOperations({
    tournamentId,
    isOwner,
    config: {
      enabled: finalConfig.features.enableDragDrop,
      sameRoundOnly: true,
      pendingMatchesOnly: true,
      maxPendingOperations: 10
    }
  })

  /**
   * Hook de finalización de torneo
   */
  const finalization = useTournamentFinalization(tournamentId)
  const [missingCoupleRepairLoading, setMissingCoupleRepairLoading] = React.useState(false)
  const [missingCoupleRepairError, setMissingCoupleRepairError] = React.useState<string | null>(null)

  const handleFillMissingCouple = React.useCallback(async () => {
    setMissingCoupleRepairLoading(true)
    setMissingCoupleRepairError(null)
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bracket-qualification-repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bracketKey: 'MAIN', mode: 'fill_single_missing' }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || result.error || 'No se pudo insertar la pareja faltante')
      }

      await refetch()
      onDataRefresh?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo insertar la pareja faltante'
      console.warn('[BracketVisualizationV2] Missing couple repair failed:', error)
      setMissingCoupleRepairError(message)
    } finally {
      setMissingCoupleRepairLoading(false)
    }
  }, [onDataRefresh, refetch, tournamentId])


  // Notificar cambios de estado al parent
  React.useEffect(() => {
    if (bracketData?.state && onBracketStateChange) {
      onBracketStateChange(bracketData.state)
    }
  }, [bracketData?.state, onBracketStateChange])

  // Handlers conectados con refetch del hook
  const handleSwapPositions = React.useCallback(async (operation: any) => {
    console.log('Swapping positions:', operation)
    await refetch()
    onDataRefresh?.()
    
    // Si el torneo se finalizó, refrescar estado de finalización
    if (operation?.tournamentFinalized) {
      console.log('🏆 Tournament finalized, refreshing finalization status')
      finalization.refetch()
    }
  }, [refetch, onDataRefresh, finalization])
  
  // Drag & drop handlers
  const handleDragStart = React.useCallback((couple: CoupleData, match: BracketMatchV2, slot: SlotPosition) => {
    console.log('Drag started:', { couple: couple.id, match: match.id, slot })
  }, [])
  
  const handleDataRefresh = React.useCallback(() => {
    refetch()
    onDataRefresh?.()
  }, [refetch, onDataRefresh])
  
  // Configuración de drag & drop
  const dragDropConfig: Partial<DragDropConfig> = React.useMemo(() => ({
    enabled: finalConfig.features.enableDragDrop,
    ownerOnly: true,
    visual: {
      showDropZones: true,
      animations: true,
      hapticFeedback: false,
      theme: 'default'
    },
    validation: {
      realTimeValidation: true,
      validationTimeout: 1000,
      revalidateBeforeSubmit: true
    },
    performance: {
      validationDebounce: 100,
      cacheValidations: true,
      maxConcurrentOps: 3
    }
  }), [finalConfig.features.enableDragDrop])

  const handleProcessBYEs = React.useCallback(async () => {
    console.log('Processing BYEs for tournament:', tournamentId)
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/process-bracket-byes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dryRun: false // Aplicar cambios reales
        })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      
      if (result.success) {
        console.log(`✅ Processed ${result.processedCount} BYE matches`)
        if (result.details?.processedMatches?.length > 0) {
          console.log('Processed matches:', result.details.processedMatches)
        }
      } else {
        console.error('❌ BYE processing failed:', result.error)
      }
    } catch (error) {
      console.error('❌ Error processing BYEs:', error)
    }
    
    // Actualizar datos independientemente del resultado
    await refetch()
    onDataRefresh?.()
  }, [tournamentId, refetch, onDataRefresh])

  const handleRegeneratePlaceholders = React.useCallback(async () => {
    console.log('Regenerating placeholders for tournament:', tournamentId)
    await refetch()
  }, [tournamentId, refetch])

  // 🐍 ALGORITMO HYBRID-SERPENTINO: Función principal para generar bracket completo
  const handleGenerateHybridSerpentineBracket = React.useCallback(async () => {
    console.log(`🐍 [HYBRID-SERPENTINO] Generating complete bracket for tournament:`, tournamentId)
    
    try {
      // PASO 1: Generar seeds serpentinos (1A, 1B, 1C, 2A, 2B, 2C...)
      console.log(`🐍 [HYBRID-SERPENTINO] PASO 1: Generating serpentine seeds...`)
      const seedResponse = await fetch(`/api/tournaments/${tournamentId}/generate-seeding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          strategy: 'by-zones', // ✅ CLAVE: Esta estrategia implementa el patrón serpentino
          options: {
            description: 'Hybrid-Serpentino: 1A, 1B, 1C, 2A, 2B, 2C... garantiza 1A≠1B hasta final'
          }
        })
      })
      
      if (!seedResponse.ok) {
        const errorData = await seedResponse.json().catch(() => ({}))
        throw new Error(`Error generando seeds: ${errorData.error || seedResponse.statusText}`)
      }
      
      const seedResult = await seedResponse.json()
      console.log(`🐍 [HYBRID-SERPENTINO] ✅ PASO 1 COMPLETADO: ${seedResult.totalSeeds} seeds generados`)
      
      // PASO 2: Generar bracket completo con jerarquía y avance automático
      console.log(`🐍 [HYBRID-SERPENTINO] PASO 2: Generating complete bracket structure...`)
      const bracketResponse = await fetch(`/api/tournaments/${tournamentId}/generate-bracket-from-seeding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          useExistingSeeds: true,
          forceRegenerate: false,
          algorithm: 'hybrid-serpentino'
        })
      })
      
      if (!bracketResponse.ok) {
        const errorData = await bracketResponse.json().catch(() => ({}))
        throw new Error(`Error generando bracket: ${errorData.error || bracketResponse.statusText}`)
      }
      
      const bracketResult = await bracketResponse.json()
      console.log(`🐍 [HYBRID-SERPENTINO] ✅ PASO 2 COMPLETADO: ${bracketResult.matchesCreated} matches creados`)
      
      // PASO 3: Verificar que se poblaron todas las tablas
      console.log(`🐍 [HYBRID-SERPENTINO] PASO 3: Verifying database population...`)
      
      // Refrescar datos para mostrar el nuevo bracket
      await refetch()
      onDataRefresh?.()
      
      console.log(`🐍 [HYBRID-SERPENTINO] ✅ BRACKET HYBRID-SERPENTINO GENERADO EXITOSAMENTE`)
      console.log(`🐍 [HYBRID-SERPENTINO] Garantías cumplidas:`)
      console.log(`  - 1A y 1B solo se ven en final ✅`)
      console.log(`  - Seed 1 posición 1, distribución equilibrada ✅`)
      console.log(`  - tournament_couple_seeds poblado ✅`)
      console.log(`  - match_hierarchy poblado ✅`)
      console.log(`  - Avance automático funcional ✅`)
      
    } catch (error) {
      console.error(`🐍 [HYBRID-SERPENTINO] ❌ Error generating bracket:`, error)
      throw error
    }
  }, [tournamentId, refetch, onDataRefresh])

  // 🔄 NUEVO: ALGORITMO CON PLACEHOLDERS - Generar bracket antes de terminar zonas
  const handleGeneratePlaceholderBracket = React.useCallback(async () => {
    console.log(`🔄 [PLACEHOLDER-BRACKET] Starting placeholder bracket generation for tournament:`, tournamentId)
    
    try {
      // Llamar al API Route que maneja Server Actions
      const response = await fetch(`/api/tournaments/${tournamentId}/generate-placeholder-bracket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.message || 'Error generating placeholder bracket')
      }
      
      console.log(`🔄 [PLACEHOLDER-BRACKET] ✅ GENERACIÓN EXITOSA:`, {
        definitiveSeeds: result.data?.definitiveSeeds,
        placeholderSeeds: result.data?.placeholderSeeds,
        totalMatches: result.data?.totalMatches,
        byeMatches: result.data?.byeMatches
      })
      
      // Refrescar datos para mostrar el nuevo bracket
      await refetch()
      onDataRefresh?.()
      
      console.log(`🔄 [PLACEHOLDER-BRACKET] ✅ BRACKET CON PLACEHOLDERS GENERADO EXITOSAMENTE`)
      console.log(`🔄 [PLACEHOLDER-BRACKET] Características:`)
      console.log(`  - ${result.data?.definitiveSeeds || 0} posiciones definitivas ✅`)
      console.log(`  - ${result.data?.placeholderSeeds || 0} placeholders dinámicos ✅`)
      console.log(`  - ${result.data?.totalMatches || 0} matches creados ✅`)
      console.log(`  - Algoritmo hybrid-serpentino preservado ✅`)
      console.log(`  - Resolución automática habilitada ✅`)
      
    } catch (error) {
      console.error(`🔄 [PLACEHOLDER-BRACKET] ❌ Error generating placeholder bracket:`, error)
      throw error
    }
  }, [tournamentId, refetch, onDataRefresh])

  // Estados de renderizado basados en datos reales
  if (loading) {
    return <BracketLoadingSkeleton />
  }

  if (error) {
    return (
      <BracketErrorState 
        error={error.message}
        onRetry={refetch}
      />
    )
  }

  if (!bracketData || bracketData.matches.length === 0) {
    return (
      <BracketEmptyState 
        tournamentId={tournamentId}
        algorithm={algorithm}
        onGenerateBracket={handleGeneratePlaceholderBracket}
      />
    )
  }

  // ✅ NUEVA FUNCIONALIDAD: Si los puntos ya están calculados, mostrar vista read-only
  if (tournamentStatus === 'FINISHED_POINTS_CALCULATED') {
    return (
      <div className="space-y-6">
        {/* Vista read-only del bracket */}
        <ReadOnlyBracketTab tournamentId={tournamentId} />
      </div>
    )
  }

  return (
    <div className="bracket-v2-container">
      
      {/* ✨ NUEVO: Banner de cálculo de puntos */}
      {finalization.canShowPointsCalculation && isOwner && (
        <PointsCalculationBanner 
          tournamentId={tournamentId}
          winnerId={finalization.winner_id}
          onPointsCalculated={() => {
            onDataRefresh?.()
            finalization.refetch()
          }}
        />
      )}

      {isOwner && (
        <BracketControlsPlaceholder
          onProcessBYEs={handleProcessBYEs}
          onRegeneratePlaceholders={handleRegeneratePlaceholders}
          onFillMissingCouple={handleFillMissingCouple}
          config={finalConfig}
          isRefetching={isRefetching}
          missingCoupleRepairLoading={missingCoupleRepairLoading}
          missingCoupleRepairError={missingCoupleRepairError}
          dragOperations={dragOperations}
          tournamentId={tournamentId}
          tournamentStatus={tournamentStatus}
        />
      )}
      
      {/* Renderer del bracket */}
      <ImprovedBracketRenderer
        bracketData={bracketData}
        tournamentId={tournamentId}
        isOwner={isOwner}
        enableDragDrop={finalConfig.features.enableDragDrop}
        onMatchUpdate={handleSwapPositions}
        onDataRefresh={handleDataRefresh}
      />
      

    </div>
  )
}

// Componentes temporales (placeholders para desarrollo incremental)

function BracketLoadingSkeleton() {
  return (
    <div className="bracket-v2-loading">
      <div className="animate-pulse space-y-4">
        <div className="h-16 bg-slate-200 rounded-surface"></div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 bg-slate-200 rounded-surface"></div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BracketErrorState({ 
  error, 
  onRetry 
}: { 
  error: string
  onRetry: () => void 
}) {
  return (
    <div className="bracket-v2-error p-8 text-center">
      <div className="text-red-600 mb-4">
        Error cargando bracket: {error}
      </div>
      <button 
        onClick={onRetry}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Reintentar
      </button>
    </div>
  )
}

function BracketEmptyState({ 
  tournamentId, 
  algorithm,
  onGenerateBracket 
}: { 
  tournamentId: string
  algorithm: string
  onGenerateBracket: () => Promise<void>
}) {
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [requiredMatchesPerCoupleValues, setRequiredMatchesPerCoupleValues] = React.useState<number[]>([])
  const [longBracketMatchRequirementEnabled, setLongBracketMatchRequirementEnabled] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    const fetchBracketRequirements = async () => {
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/generate-placeholder-bracket`)
        if (!response.ok) return

        const validation = await response.json()
        const values = Array.isArray(validation.requiredMatchesPerCoupleValues)
          ? validation.requiredMatchesPerCoupleValues.filter((value: unknown): value is number => (
            typeof value === 'number' && Number.isFinite(value) && value > 0
          ))
          : []

        if (!cancelled) {
          setRequiredMatchesPerCoupleValues(values)
          setLongBracketMatchRequirementEnabled(validation.longBracketMatchRequirementEnabled !== false)
        }
      } catch (requirementError) {
        console.warn('[BracketEmptyState] Could not load bracket requirements:', requirementError)
      }
    }

    fetchBracketRequirements()

    return () => {
      cancelled = true
    }
  }, [tournamentId])

  const requirementText = React.useMemo(() => {
    if (!longBracketMatchRequirementEnabled) {
      return 'La llave se generara con la tabla de posiciones actual, aunque no todas las parejas tengan los partidos completos.'
    }

    if (requiredMatchesPerCoupleValues.length === 1) {
      const matches = requiredMatchesPerCoupleValues[0]
      const noun = matches === 1 ? 'partido creado' : 'partidos creados'
      return `Podés iniciar la llave únicamente si cada pareja tiene ${matches} ${noun}.`
    }

    if (requiredMatchesPerCoupleValues.length > 1) {
      const formattedValues = requiredMatchesPerCoupleValues.join(' o ')
      return `Podés iniciar la llave únicamente si cada pareja tiene los partidos creados que exige su zona (${formattedValues}).`
    }

    return 'Podés iniciar la llave únicamente si cada pareja tiene los partidos creados que exige el formato.'
  }, [longBracketMatchRequirementEnabled, requiredMatchesPerCoupleValues])

  const handleGenerate = React.useCallback(async () => {
    if (isGenerating) return
    
    setIsGenerating(true)
    setError(null)
    
    try {
      await onGenerateBracket()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error inesperado'
      setError(errorMessage)
      console.error('Error generating bracket:', err)
    } finally {
      setIsGenerating(false)
    }
  }, [onGenerateBracket, isGenerating])

  return (
    <div className="bracket-v2-empty p-8 text-center max-w-2xl mx-auto">
      {/* Icono principal */}
      <div className="mb-6">
        <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
      </div>

      {/* Mensaje principal */}
      <div className="text-slate-700 mb-6 text-lg font-medium">
        No hay llave generada aún
      </div>

      {/* Alerta sutil */}
      <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6 text-left rounded-r-surface">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-amber-700">
              <span className="font-medium">¡Importante!</span> Podés generarla sin haber terminado las zonas, pero una vez que la generes, no vas a poder agregar más parejas.
            </p>
          </div>
        </div>
      </div>

      <div className="text-sm text-slate-500 mb-6">
        {requirementText}
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-surface p-4 mb-4">
          <div className="text-red-800 text-sm">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}
      
      <button 
        onClick={handleGenerate}
        disabled={isGenerating}
        className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
      >
        {isGenerating ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
Generando llave...
          </>
        ) : (
          <>
            Generar llave
          </>
        )}
      </button>
    </div>
  )
}



function BracketControlsPlaceholder({ 
  onProcessBYEs,
  onRegeneratePlaceholders,
  onFillMissingCouple,
  config,
  isRefetching,
  missingCoupleRepairLoading,
  missingCoupleRepairError,
  dragOperations,
  tournamentId,
  tournamentStatus,
}: {
  onProcessBYEs: () => void
  onRegeneratePlaceholders: () => void
  onFillMissingCouple: () => void
  config: BracketConfig
  isRefetching?: boolean
  missingCoupleRepairLoading?: boolean
  missingCoupleRepairError?: string | null
  dragOperations?: any
  tournamentId: string
  tournamentStatus?: string
}) {
  
  return (
    <div className="bracket-v2-controls bg-white border border-slate-200 rounded-surface p-4 mb-6">
      <div className="flex gap-3 items-center flex-wrap">
        {tournamentStatus === 'BRACKET_PHASE' && (
          <BackFromBracketButton
            tournamentId={tournamentId}
            mode="inline"
            buttonLabel="Volver a zonas"
            tooltipMessage="Si tuviste algun problema con la llave y queres borrarla, usa este boton para volver el torneo a fase de zonas."
          />
        )}

        {tournamentStatus === 'BRACKET_PHASE' && (
          <button
            type="button"
            onClick={onFillMissingCouple}
            disabled={missingCoupleRepairLoading || isRefetching}
            className="text-xs text-slate-400 underline-offset-4 hover:text-slate-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            title="Inserta la unica pareja faltante en el unico placeholder libre, si existe."
          >
            {missingCoupleRepairLoading ? 'Buscando pareja faltante...' : 'Me falta una pareja'}
          </button>
        )}
        
        {/* Controles de drag & drop */}
        {dragOperations && config.features.enableDragDrop && (
          <div className="border-l border-slate-300 pl-3 ml-2 flex gap-2 items-center">
            <button
              onClick={dragOperations.saveAllOperations}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm font-semibold disabled:opacity-50"
              disabled={!dragOperations.hasPendingOperations || isRefetching}
            >
              💾 Guardar Cambios ({dragOperations.pendingOperations.length})
            </button>
            
            {dragOperations.hasPendingOperations && (
              <button
                onClick={dragOperations.clearPendingOperations}
                className="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700 text-sm"
              >
                ✕ Cancelar Todo
              </button>
            )}
          </div>
        )}
        
      </div>

      {missingCoupleRepairError && (
        <div className="mt-3 text-xs text-slate-500">
          {missingCoupleRepairError}
        </div>
      )}
      
      {/* Lista de operaciones pendientes */}
      {dragOperations && dragOperations.hasPendingOperations && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
          <div className="font-medium text-yellow-800 mb-2">
            Intercambios Pendientes ({dragOperations.pendingOperations.length}):
          </div>
          <div className="space-y-1">
            {dragOperations.pendingOperations.map((operation: any) => (
              <div key={operation.operationId} className="flex items-center justify-between bg-white p-2 rounded border text-xs">
                <span className="text-yellow-700">
                  {operation.sourceItem.coupleName} → {operation.targetSlot.round} {operation.targetSlot.slot.toUpperCase()}
                  {operation.targetCouple && ` (↔ ${operation.targetCouple.coupleName})`}
                </span>
                <div className="text-xs text-slate-500">
                  {operation.targetCouple ? 'Intercambio' : 'Mover'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Advertencia de cambios irreversibles */}
      {dragOperations && dragOperations.hasPendingOperations && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm">
          <div className="flex items-center gap-2 text-red-800">
            <span>⚠️</span>
            <span className="font-medium">¡Atención!</span>
          </div>
          <div className="text-red-700 mt-1">
            Los cambios en el bracket son <strong>irreversibles</strong>. 
            Asegúrate de que los intercambios sean correctos antes de guardar.
          </div>
        </div>
      )}
    </div>
  )
}

function BracketContentPlaceholder({ 
  tournamentId,
  config,
  state,
  bracketData
}: {
  tournamentId: string
  config: BracketConfig
  state: BracketState
  bracketData?: any
}) {
  return (
    <div className="bracket-v2-content bg-white border border-slate-200 rounded-surface p-8">
      <div className="text-center space-y-4">
        <div className="text-2xl">🏗️</div>
        <div className="text-lg font-medium text-slate-700">
          Contenido del Bracket V2
        </div>
        <div className="text-sm text-slate-500 space-y-2">
          <div>Torneo: {tournamentId}</div>
          <div>Estado: {state}</div>
          <div>Configuración: {config.algorithm}</div>
          {bracketData && (
            <>
              <div>Matches: {bracketData.matches?.length || 0}</div>
              <div>Seeds: {bracketData.seeds?.length || 0}</div>
              <div>Zonas: {bracketData.zones?.length || 0}</div>
            </>
          )}
        </div>
        <div className="bg-green-50 border border-green-200 rounded p-4 text-sm text-green-800">
          <strong>✅ Datos Conectados:</strong><br/>
          El hook useBracketData está funcionando y obteniendo datos reales del torneo.
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800">
          <strong>🚧 En Desarrollo:</strong><br/>
          Este contenido será reemplazado por los componentes reales en FASE 2.
        </div>
      </div>
    </div>
  )
}



/**
 * Componente principal con drag & drop provider
 */
export function BracketVisualizationV2(props: BracketVisualizationV2Props) {
  return (
    <BracketDragDropProvider>
      <BracketVisualizationV2Internal {...props} />
    </BracketDragDropProvider>
  )
}

export default BracketVisualizationV2
