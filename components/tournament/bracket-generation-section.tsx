"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { 
  Trophy, 
  Loader2, 
  ArrowRight, 
  CheckCircle, 
  AlertTriangle,
  Target,
  Users,
  Zap
} from "lucide-react"
import { generatePlaceholderBracketAction } from "@/app/api/tournaments/[id]/actions"

interface BracketGenerationSectionProps {
  tournamentId: string
  tournamentStatus: string
  bracketStatus?: string
  canGenerateBracket?: boolean
  totalCouples: number
  totalZones: number
  onBracketGenerated?: () => void
  // NUEVO: Props para placeholders
  enablePlaceholders?: boolean
  allZoneMatchesCreated?: boolean
}

export default function BracketGenerationSection({
  tournamentId,
  tournamentStatus,
  bracketStatus = "NOT_STARTED",
  canGenerateBracket = false,
  totalCouples,
  totalZones,
  onBracketGenerated,
  // NUEVO: Props para placeholders
  enablePlaceholders = true,
  allZoneMatchesCreated = false
}: BracketGenerationSectionProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [placeholderInfo, setPlaceholderInfo] = useState<any>(null)
  const { toast } = useToast()

  // Determinar si mostrar el botón de generar bracket
  const shouldShowGenerateButton = () => {
    // Mostrar si el torneo está en fase de zonas y no se ha generado el bracket
    return (
      (tournamentStatus === 'ZONE_PHASE' || tournamentStatus === 'ZONES_READY') &&
      bracketStatus !== 'BRACKET_GENERATED' &&
      totalCouples >= 4
    )
  }

  // NUEVO: Validación específica para placeholders
  const canGeneratePlaceholderBracket = () => {
    return (
      tournamentStatus === 'ZONE_PHASE' &&
      bracketStatus !== 'BRACKET_GENERATED' &&
      totalCouples >= 4 &&
      allZoneMatchesCreated // NUEVA CONDICIÓN
    )
  }

  // Determinar el estado actual
  const getCurrentState = () => {
    if (bracketStatus === 'BRACKET_GENERATED') {
      return {
        title: "Bracket Generado",
        description: "El bracket eliminatorio ha sido generado exitosamente",
        icon: CheckCircle,
        color: "text-green-600",
        bgColor: "bg-green-50",
        borderColor: "border-green-200"
      }
    }

    if (totalCouples < 4) {
      return {
        title: "Parejas Insuficientes",
        description: `Se requieren al menos 4 parejas para generar el bracket. Actuales: ${totalCouples}`,
        icon: AlertTriangle,
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-200"
      }
    }

    if (shouldShowGenerateButton()) {
      return {
        title: "Listo para Bracket",
        description: "Las zonas han finalizado y el bracket está listo para generarse",
        icon: Target,
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200"
      }
    }

    return {
      title: "Fase de Zonas",
      description: "Complete los partidos de zona antes de generar el bracket",
      icon: Users,
      color: "text-slate-600",
      bgColor: "bg-slate-50",
      borderColor: "border-slate-200"
    }
  }

  // Handler de generación - solo placeholders
  const handleGenerateBracket = async () => {
    if (isGenerating) return
    setIsGenerating(true)
    
    try {
      console.log(`🔄 Generating placeholder bracket for tournament ${tournamentId}...`)
      const result = await generatePlaceholderBracketAction(tournamentId)
      
      if (result.success) {
        setPlaceholderInfo(result.data)
        toast({
          title: "¡Bracket con placeholders generado!",
          description: `${result.data?.definitiveSeeds} posiciones definitivas, ${result.data?.placeholderSeeds} placeholders`,
          duration: 5000,
        })
        // Llamar callback si existe
        onBracketGenerated?.()
        console.log('✅ Bracket generated successfully:', result)
      } else {
        toast({
          title: "Error al generar bracket",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error('❌ Error generating bracket:', error)
      toast({
        title: "Error inesperado",
        description: error.message,
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const currentState = getCurrentState()
  const StateIcon = currentState.icon

  return (
    <Card className={`${currentState.borderColor} ${currentState.bgColor} border-2`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className={`p-2 rounded-surface ${currentState.bgColor} ${currentState.borderColor} border`}>
            <StateIcon className={`h-5 w-5 ${currentState.color}`} />
          </div>
          <div className="flex-1">
            <div className={`text-lg font-semibold ${currentState.color}`}>
              {currentState.title}
            </div>
            <div className="text-sm text-slate-600 font-normal">
              {currentState.description}
            </div>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Información del torneo */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Parejas:</span>
            <Badge variant="secondary">{totalCouples}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Zonas:</span>
            <Badge variant="secondary">{totalZones}</Badge>
          </div>
        </div>

        {/* Información sobre brackets con placeholders */}
        {shouldShowGenerateButton() && enablePlaceholders && (
          <div className="text-xs text-slate-600 p-2 bg-slate-50 rounded">
            <strong>Bracket con Placeholders:</strong> Genera el bracket inmediatamente usando 
            posiciones definitivas conocidas y placeholders ("1A", "2B") para posiciones 
            que aún pueden cambiar. Se actualizará automáticamente.
          </div>
        )}

        {/* NUEVO: Información sobre placeholders generados */}
        {placeholderInfo && (
          <div className="bg-blue-50 rounded-surface p-4 border border-blue-200">
            <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
              🔄 Bracket con Placeholders Generado
            </h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-700">{placeholderInfo.definitiveSeeds}</div>
                <div className="text-slate-600">Definitivas</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-700">{placeholderInfo.placeholderSeeds}</div>
                <div className="text-slate-600">Placeholders</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-700">{placeholderInfo.totalMatches}</div>
                <div className="text-slate-600">Matches</div>
              </div>
            </div>
          </div>
        )}



        {/* Botón de generar bracket con placeholders */}
        {shouldShowGenerateButton() && (
          <Button
            onClick={handleGenerateBracket}
            disabled={isGenerating || !allZoneMatchesCreated}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando Bracket con Placeholders...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Generar Bracket con Placeholders
                <ArrowRight className="h-4 w-4" />
              </div>
            )}
          </Button>
        )}

        {/* Advertencia si faltan partidos para placeholders */}
        {shouldShowGenerateButton() && !allZoneMatchesCreated && (
          <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
            ⚠️ <strong>Partidos de zona incompletos:</strong> Para generar brackets con placeholders, 
            primero deben crearse todos los partidos de zona (no es necesario que estén jugados).
          </div>
        )}

        {/* Información sobre el algoritmo */}
        {shouldShowGenerateButton() && (
          <div className="text-xs text-slate-500 text-center space-y-1">
            <div>🔄 <strong>Algoritmo Híbrido-Serpentino:</strong> 1A vs 1B solo en final + placeholders dinámicos</div>
            <div>⚡ <strong>Resolución automática:</strong> Se actualiza cuando las posiciones se vuelven definitivas</div>
          </div>
        )}

        {/* Estado de bracket ya generado */}
        {bracketStatus === 'BRACKET_GENERATED' && (
          <div className="text-center">
            <Badge variant="outline" className="text-green-700 border-green-300">
              Bracket eliminatorio activo
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}