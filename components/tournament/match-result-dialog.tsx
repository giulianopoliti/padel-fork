"use client"

import type React from "react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Trophy, X, Users, Zap, AlertCircle, CheckCircle } from "lucide-react"
import { updateMatchResult } from "@/app/api/tournaments/actions"
import { validatePadelScoreInput } from "@/utils/padel-score-validation"

interface Match {
  id: string
  round: string
  status: "PENDING" | "IN_PROGRESS" | "FINISHED" | "CANCELED"
  couple1_id?: string | null
  couple2_id?: string | null
  couple1_player1_name?: string
  couple1_player2_name?: string
  couple2_player1_name?: string
  couple2_player2_name?: string
  result_couple1?: string | null
  result_couple2?: string | null
  winner_id?: string | null
  zone_name?: string | null
  order?: number
}

interface MatchResultDialogProps {
  isOpen: boolean
  onClose: () => void
  match: Match | null
  onSave: () => void
}

export default function MatchResultDialog({ isOpen, onClose, match, onSave }: MatchResultDialogProps) {
  if (!match) {
    return null
  }
  const [result_couple1, setResult_couple1] = useState<string>(match.result_couple1?.toString() || "")
  const [result_couple2, setResult_couple2] = useState<string>(match.result_couple2?.toString() || "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  
  // Validación de pádel en tiempo real
  const validation = validatePadelScoreInput(result_couple1, result_couple2)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Usar la validación de pádel
    if (!validation.canSubmit) {
      toast({
        title: "Resultado inválido",
        description: validation.errorMessage || "Por favor ingresa un resultado válido de pádel.",
        variant: "destructive",
      })
      return
    }

    const score1Num = Number.parseInt(result_couple1, 10)
    const score2Num = Number.parseInt(result_couple2, 10)

    setIsSubmitting(true)
    try {
      const result = await updateMatchResult({
        matchId: match.id,
        result_couple1: result_couple1,
        result_couple2: result_couple2,
        winner_id: score1Num > score2Num ? match.couple1_id! : match.couple2_id!,
      })

      if (result.success) {
        toast({
          title: "¡Resultado guardado!",
          description: "El resultado del partido se ha actualizado correctamente.",
        })
        onSave()
        onClose()
      } else {
        toast({
          title: "Error al guardar",
          description: "No se pudo guardar el resultado. Intenta nuevamente.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error al guardar resultado:", error)
      toast({
        title: "Error inesperado",
        description: "Ocurrió un problema al procesar la solicitud.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const couple1Name = `${match.couple1_player1_name} / ${match.couple1_player2_name}`
  const couple2Name = `${match.couple2_player1_name} / ${match.couple2_player2_name}`

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-50">
        {/* Header moderno */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-6 relative">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-3 rounded-full">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-white mb-1">
                Cargar Resultado
              </DialogTitle>
              <p className="text-emerald-100 text-sm">
                Ingresa el resultado del partido de eliminación directa
              </p>
            </div>
          </div>
        </div>

        {/* Contenido principal */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Información del partido */}
            <div className="bg-white rounded-surface p-4 border border-emerald-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-5 w-5 text-emerald-600" />
                <span className="font-medium text-emerald-700">Enfrentamiento</span>
              </div>
              <div className="text-center text-slate-600 text-sm">
                Partido de {match.round?.toLowerCase() || 'eliminación'}
              </div>
            </div>

            {/* Inputs de resultado con diseño mejorado */}
            <div className="space-y-4">
              {/* Pareja 1 */}
              <div className="bg-white rounded-surface border-2 border-slate-200 p-4 transition-all hover:border-emerald-300 focus-within:border-emerald-400">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-700 mb-2">Pareja 1</div>
                    <div className="text-lg font-semibold text-slate-900 truncate">
                      {couple1Name}
                    </div>
                  </div>
                  <div className="ml-4">
                    <Input
                      type="number"
                      min="0"
                      max="7"
                      value={result_couple1}
                      onChange={(e) => setResult_couple1(e.target.value)}
                      className={`w-20 h-14 text-2xl font-bold text-center bg-white text-slate-900 border-2 rounded-control shadow-sm ${
                        validation.isValid 
                          ? 'border-green-400 focus:border-green-500 focus:ring-green-500' 
                          : validation.errorMessage 
                            ? 'border-red-400 focus:border-red-500 focus:ring-red-500' 
                            : 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500'
                      }`}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* VS Divider */}
              <div className="flex items-center justify-center py-2">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2 rounded-full font-bold text-sm">
                  VS
                </div>
              </div>

              {/* Pareja 2 */}
              <div className="bg-white rounded-surface border-2 border-slate-200 p-4 transition-all hover:border-emerald-300 focus-within:border-emerald-400">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-700 mb-2">Pareja 2</div>
                    <div className="text-lg font-semibold text-slate-900 truncate">
                      {couple2Name}
                    </div>
                  </div>
                  <div className="ml-4">
                    <Input
                      type="number"
                      min="0"
                      max="7"
                      value={result_couple2}
                      onChange={(e) => setResult_couple2(e.target.value)}
                      className={`w-20 h-14 text-2xl font-bold text-center bg-white text-slate-900 border-2 rounded-control shadow-sm ${
                        validation.isValid 
                          ? 'border-green-400 focus:border-green-500 focus:ring-green-500' 
                          : validation.errorMessage 
                            ? 'border-red-400 focus:border-red-500 focus:ring-red-500' 
                            : 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500'
                      }`}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Preview del ganador */}
            {validation.isValid && validation.winner && (
              <div className="bg-emerald-50 rounded-surface p-4 border border-emerald-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium text-emerald-700">Ganador</span>
                </div>
                <div className="text-emerald-800 font-semibold">
                  {validation.winner === 'couple1' ? couple1Name : couple2Name}
                </div>
                <div className="text-emerald-600 text-sm mt-1">
                  Resultado: {result_couple1} - {result_couple2}
                </div>
              </div>
            )}

            {/* Error de validación */}
            {validation.errorMessage && (
              <div className="bg-red-50 rounded-surface p-4 border border-red-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="font-medium text-red-700">Resultado inválido</span>
                </div>
                <div className="text-red-800 text-sm">
                  {validation.errorMessage}
                </div>
                <div className="text-red-600 text-xs mt-2">
                  Resultados válidos: 6-0, 6-1, 6-2, 6-3, 6-4, 6-5, 7-5, 7-6 (y sus inversos)
                </div>
              </div>
            )}

            {/* Botones de acción */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 bg-slate-50 text-slate-700 border border-slate-300 hover:bg-slate-100 hover:border-slate-400 hover:text-slate-800"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !validation.canSubmit}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Trophy className="mr-2 h-4 w-4" />
                    Guardar Resultado
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
