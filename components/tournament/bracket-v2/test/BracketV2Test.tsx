/**
 * BRACKET V2 TEST - COMPONENTE DE PRUEBA
 * 
 * Componente simple para testear la implementación del sistema
 * BracketVisualizationV2 con datos reales del torneo.
 * 
 * USO:
 * - Importar en cualquier página de torneo
 * - Reemplazar el TournamentBracketVisualization existente
 * - Verificar que los datos se cargan correctamente
 * 
 * @author Claude Code Assistant
 * @version 2.0.0
 * @created 2025-01-17
 */

'use client'

import React from 'react'
import { BracketVisualizationV2 } from '../BracketVisualizationV2'

/**
 * Props del componente de prueba
 */
interface BracketV2TestProps {
  /** ID del torneo a testear */
  tournamentId: string
  /** Si mostrar controles de debugging */
  showDebug?: boolean
  /** Si el usuario es propietario */
  isOwner?: boolean
}

/**
 * Componente de prueba para BracketVisualizationV2
 */
export function BracketV2Test({
  tournamentId,
  showDebug = true,
  isOwner = false
}: BracketV2TestProps) {
  
  const [testState, setTestState] = React.useState({
    startTime: new Date().toISOString(),
    refreshCount: 0,
    lastStateChange: null as string | null
  })

  const handleDataRefresh = React.useCallback(() => {
    setTestState(prev => ({
      ...prev,
      refreshCount: prev.refreshCount + 1
    }))
    console.log('[BracketV2Test] Data refresh triggered')
  }, [])

  const handleMatchUpdate = React.useCallback((matchId: string, result: any) => {
    console.log('[BracketV2Test] Match update:', { matchId, result })
  }, [])

  const handleBracketStateChange = React.useCallback((state: any) => {
    setTestState(prev => ({
      ...prev,
      lastStateChange: state
    }))
    console.log('[BracketV2Test] Bracket state changed to:', state)
  }, [])

  return (
    <div className="bracket-v2-test">
      {showDebug && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-surface p-4 mb-6">
          <h3 className="font-semibold text-yellow-900 mb-2">
            🧪 BracketVisualizationV2 Test Mode
          </h3>
          <div className="text-sm text-yellow-800 space-y-1">
            <div>Tournament ID: {tournamentId}</div>
            <div>Test Started: {new Date(testState.startTime).toLocaleTimeString()}</div>
            <div>Refreshes: {testState.refreshCount}</div>
            <div>Last State: {testState.lastStateChange || 'None'}</div>
            <div>Owner Mode: {isOwner ? 'Yes' : 'No'}</div>
          </div>
          <div className="mt-3">
            <button
              onClick={() => window.location.reload()}
              className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700"
            >
              Reload Page
            </button>
          </div>
        </div>
      )}
      
      <BracketVisualizationV2
        tournamentId={tournamentId}
        algorithm="serpentine"
        isOwner={isOwner}
        onDataRefresh={handleDataRefresh}
        onMatchUpdate={handleMatchUpdate}
        onBracketStateChange={handleBracketStateChange}
      />
    </div>
  )
}

export default BracketV2Test