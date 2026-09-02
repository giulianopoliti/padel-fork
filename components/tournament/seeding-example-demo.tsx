"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronUp, PlayCircle } from "lucide-react"

interface SeedingExampleDemoProps {
  totalCouples?: number
}

export default function SeedingExampleDemo({ totalCouples = 21 }: SeedingExampleDemoProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAnimation, setShowAnimation] = useState(false)

  // Datos de ejemplo simulados
  const exampleZones = [
    { name: "A", couples: [
      { name: "Pareja A1", position: 1, points: 9 },
      { name: "Pareja A2", position: 2, points: 7 },
      { name: "Pareja A3", position: 3, points: 4 },
      { name: "Pareja A4", position: 4, points: 3 }
    ]},
    { name: "B", couples: [
      { name: "Pareja B1", position: 1, points: 9 },
      { name: "Pareja B2", position: 2, points: 6 },
      { name: "Pareja B3", position: 3, points: 5 },
      { name: "Pareja B4", position: 4, points: 1 }
    ]},
    { name: "C", couples: [
      { name: "Pareja C1", position: 1, points: 8 },
      { name: "Pareja C2", position: 2, points: 7 },
      { name: "Pareja C3", position: 3, points: 4 }
    ]}
  ]

  const globalSeeds = [
    { seed: 1, name: "Pareja A1", zone: "A", position: 1, points: 9 },
    { seed: 2, name: "Pareja B1", zone: "B", position: 1, points: 9 },
    { seed: 3, name: "Pareja C1", zone: "C", position: 1, points: 8 },
    { seed: 4, name: "Pareja A2", zone: "A", position: 2, points: 7 },
    { seed: 5, name: "Pareja B2", zone: "B", position: 2, points: 6 },
    { seed: 6, name: "Pareja C2", zone: "C", position: 2, points: 7 },
  ]

  const sampleMatches = [
    { match: 1, p1: "Seed 1", p2: "BYE", result: "Seed 1 avanza" },
    { match: 2, p1: "Seed 6", p2: "Seed 11", result: "Por jugar" },
    { match: 3, p1: "Seed 2", p2: "BYE", result: "Seed 2 avanza" },
  ]

  const handleToggleExpanded = () => {
    setIsExpanded(!isExpanded)
    if (!isExpanded) {
      setShowAnimation(true)
      setTimeout(() => setShowAnimation(false), 3000)
    }
  }

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggleExpanded}
        className="text-blue-600 border-blue-200 hover:bg-blue-50"
      >
        <PlayCircle className="h-4 w-4 mr-2" />
        Ver ejemplo del algoritmo
        <ChevronDown className="h-4 w-4 ml-2" />
      </Button>
    )
  }

  return (
    <Card className="border-blue-200">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-blue-800">Ejemplo del Algoritmo de Seeding</CardTitle>
            <CardDescription>
              Simulación con {totalCouples} parejas en 3 zonas
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleExpanded}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Paso 1: Datos por zona */}
        <div className={`transition-all duration-1000 ${showAnimation ? 'scale-105 bg-blue-50' : ''}`}>
          <h4 className="font-medium text-gray-900 mb-3">📋 Paso 1: Datos por Zona</h4>
          <div className="grid grid-cols-3 gap-4">
            {exampleZones.map(zone => (
              <div key={zone.name} className="border rounded-surface p-3">
                <h5 className="font-medium mb-2">Zona {zone.name}</h5>
                <div className="space-y-1">
                  {zone.couples.map(couple => (
                    <div key={couple.name} className="text-xs bg-gray-50 p-2 rounded">
                      <div className="font-medium">{couple.position}° - {couple.name}</div>
                      <div className="text-gray-600">{couple.points} puntos</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Paso 2: Agrupamiento */}
        <div className={`transition-all duration-1000 delay-500 ${showAnimation ? 'scale-105 bg-green-50' : ''}`}>
          <h4 className="font-medium text-gray-900 mb-3">🎯 Paso 2: Agrupamiento por Posición</h4>
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="default">1° de Zona</Badge>
                <span className="text-sm text-gray-600">Se ordenan A→B→C por puntos</span>
              </div>
              <div className="flex gap-2">
                <div className="text-xs bg-blue-100 p-2 rounded">Seed 1: A1 (9pts)</div>
                <div className="text-xs bg-blue-100 p-2 rounded">Seed 2: B1 (9pts)</div>
                <div className="text-xs bg-blue-100 p-2 rounded">Seed 3: C1 (8pts)</div>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">2° de Zona</Badge>
                <span className="text-sm text-gray-600">Continúa la secuencia</span>
              </div>
              <div className="flex gap-2">
                <div className="text-xs bg-green-100 p-2 rounded">Seed 4: A2 (7pts)</div>
                <div className="text-xs bg-green-100 p-2 rounded">Seed 5: C2 (7pts)</div>
                <div className="text-xs bg-green-100 p-2 rounded">Seed 6: B2 (6pts)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Paso 3: Emparejamiento */}
        <div className={`transition-all duration-1000 delay-1000 ${showAnimation ? 'scale-105 bg-purple-50' : ''}`}>
          <h4 className="font-medium text-gray-900 mb-3">⚔️ Paso 3: Emparejamiento del Bracket</h4>
          <div className="space-y-2">
            {sampleMatches.map(match => (
              <div key={match.match} className="flex items-center justify-between p-3 bg-gray-50 rounded-surface">
                <div className="text-sm">
                  <span className="font-medium">Match {match.match}:</span> {match.p1} vs {match.p2}
                </div>
                <Badge variant={match.result.includes("BYE") ? "default" : "outline"}>
                  {match.result}
                </Badge>
              </div>
            ))}
            <div className="text-xs text-gray-500 mt-2">
              ...y así continúa hasta completar {Math.pow(2, Math.ceil(Math.log2(totalCouples)))} posiciones
            </div>
          </div>
        </div>

        {/* Resumen */}
        <div className="bg-blue-50 border border-blue-200 rounded-surface p-4">
          <h4 className="font-medium text-blue-800 mb-2">✅ Resultado Final</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Los mejores clasificados enfrentan BYEs o rivales débiles</li>
            <li>• Se garantiza que los mejores no se eliminen temprano</li>
            <li>• El bracket es justo y balanceado según el rendimiento en zonas</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
} 