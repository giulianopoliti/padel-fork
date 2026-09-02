'use client';

import { useState } from 'react';
import { processHistoricalTournaments } from '@/app/api/tournaments/actions';

export default function ProcessHistoryPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; processed?: number } | null>(null);

  const handleProcessHistory = async () => {
    setIsProcessing(true);
    setResult(null);
    
    try {
      const response = await processHistoricalTournaments();
      setResult(response);
    } catch (error: any) {
      setResult({
        success: false,
        message: `Error inesperado: ${error.message}`
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="bg-white rounded-surface shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Procesar Historial de Torneos
        </h1>
        
        <div className="mb-6">
          <p className="text-gray-600 mb-4">
            Esta función procesará retroactivamente todos los torneos finalizados para crear:
          </p>
          <ul className="list-disc list-inside text-gray-600 space-y-1 mb-4">
            <li>Snapshots semanales del ranking</li>
            <li>Historial de puntos por torneo para cada jugador</li>
            <li>Cambios en el ranking por torneo</li>
          </ul>
          <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded">
            ⚠️ Esta operación puede tomar varios minutos dependiendo del número de torneos.
          </p>
        </div>

        <button
          onClick={handleProcessHistory}
          disabled={isProcessing}
          className={`w-full py-3 px-4 rounded-surface font-medium transition-colors ${
            isProcessing
              ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isProcessing ? 'Procesando...' : 'Procesar Historial'}
        </button>

        {result && (
          <div className={`mt-6 p-4 rounded-surface ${
            result.success 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className={`font-medium ${
              result.success ? 'text-green-800' : 'text-red-800'
            }`}>
              {result.success ? '✅ Éxito' : '❌ Error'}
            </div>
            <p className={`mt-1 ${
              result.success ? 'text-green-700' : 'text-red-700'
            }`}>
              {result.message}
            </p>
            {result.processed !== undefined && (
              <p className="text-green-600 text-sm mt-2">
                Torneos procesados: {result.processed}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 