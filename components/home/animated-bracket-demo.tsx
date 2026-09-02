"use client"

import { useState, useEffect } from "react"
import { Trophy, Users, CheckCircle, Clock } from "lucide-react"

interface DemoMatch {
  id: string
  round: string
  couple1: string
  couple2: string
  visible: boolean
}

interface BracketLine {
  id: string
  from: string
  to: string
  visible: boolean
}

export default function AnimatedBracketDemo() {
  const [animationStage, setAnimationStage] = useState(0)
  const [matches, setMatches] = useState<DemoMatch[]>([])
  const [lines, setLines] = useState<BracketLine[]>([])

  // Define the demo matches structure
  const initialMatches: DemoMatch[] = [
    // Cuartos de Final
    { id: "q1", round: "CUARTOS", couple1: "Ana / Luis", couple2: "Sara / Pablo", visible: false },
    { id: "q2", round: "CUARTOS", couple1: "Elena / Mario", couple2: "Rosa / Juan", visible: false },
    { id: "q3", round: "CUARTOS", couple1: "Clara / Diego", couple2: "Marta / Carlos", visible: false },
    { id: "q4", round: "CUARTOS", couple1: "Julia / Miguel", couple2: "Laura / Pedro", visible: false },
    // Semifinals
    { id: "s1", round: "SEMIS", couple1: "Por determinar", couple2: "Por determinar", visible: false },
    { id: "s2", round: "SEMIS", couple1: "Por determinar", couple2: "Por determinar", visible: false },
    // Final
    { id: "f1", round: "FINAL", couple1: "Por determinar", couple2: "Por determinar", visible: false }
  ]

  const bracketLines: BracketLine[] = [
    // Lines from cuartos to semis
    { id: "l1", from: "q1", to: "s1", visible: false },
    { id: "l2", from: "q2", to: "s1", visible: false },
    { id: "l3", from: "q3", to: "s2", visible: false },
    { id: "l4", from: "q4", to: "s2", visible: false },
    // Lines from semis to final
    { id: "l5", from: "s1", to: "f1", visible: false },
    { id: "l6", from: "s2", to: "f1", visible: false }
  ]

  useEffect(() => {
    const timer = setTimeout(() => {
      if (animationStage === 0) {
        // Mostrar partidos de cuartos de final
        setMatches(initialMatches.map(match => 
          match.round === "CUARTOS" ? { ...match, visible: true } : match
        ))
        setLines(bracketLines)
        setAnimationStage(1)
      } else if (animationStage === 1) {
        // Trazar líneas de cuartos a semis (primer par)
        setLines(prev => prev.map(line => 
          ["l1", "l2"].includes(line.id) ? { ...line, visible: true } : line
        ))
        setAnimationStage(2)
      } else if (animationStage === 2) {
        // Mostrar primer partido de semifinal
        setMatches(prev => prev.map(match => 
          match.id === "s1" ? { ...match, visible: true } : match
        ))
        setAnimationStage(3)
      } else if (animationStage === 3) {
        // Trazar líneas del segundo par de cuartos a semis
        setLines(prev => prev.map(line => 
          ["l3", "l4"].includes(line.id) ? { ...line, visible: true } : line
        ))
        setAnimationStage(4)
      } else if (animationStage === 4) {
        // Mostrar segundo partido de semifinal
        setMatches(prev => prev.map(match => 
          match.id === "s2" ? { ...match, visible: true } : match
        ))
        setAnimationStage(5)
      } else if (animationStage === 5) {
        // Trazar líneas de semis a final
        setLines(prev => prev.map(line => 
          ["l5", "l6"].includes(line.id) ? { ...line, visible: true } : line
        ))
        setAnimationStage(6)
      } else if (animationStage === 6) {
        // Mostrar partido final
        setMatches(prev => prev.map(match => 
          match.id === "f1" ? { ...match, visible: true } : match
        ))
        setAnimationStage(7)
      } else {
        // Reiniciar animación
        setAnimationStage(0)
        setMatches([])
        setLines([])
      }
    }, animationStage === 0 ? 1000 : 1500)

    return () => clearTimeout(timer)
  }, [animationStage])

  const MatchCard = ({ match, delay = 0 }: { match: DemoMatch; delay?: number }) => (
    <div 
      className={`bg-white rounded-surface shadow-md border-2 border-slate-200 overflow-hidden transform transition-all duration-1000 relative ${
        match.visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
      }`}
      style={{ 
        animationDelay: `${delay}ms`,
        height: '140px' // Fixed height for consistent positioning
      }}
      data-match-id={match.id}
    >
      {/* Header */}
      <div className="px-3 py-2 bg-gradient-to-r from-emerald-50 to-emerald-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Users className="h-3 w-3 text-slate-600 mr-1" />
            <span className="text-xs font-semibold text-slate-700">Partido</span>
          </div>
          <Clock className="h-3 w-3 text-emerald-600" />
        </div>
      </div>

      {/* Couple 1 */}
      <div className="px-3 py-2 bg-white">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-slate-800 truncate">
            {match.couple1}
          </span>
        </div>
      </div>

      <div className="border-t border-slate-100"></div>

      {/* Couple 2 */}
      <div className="px-3 py-2 bg-white">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-slate-800 truncate">
            {match.couple2}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-slate-50 border-t border-slate-100">
        <span className="text-xs font-semibold text-emerald-700">
          Programado
        </span>
      </div>
    </div>
  )

  const getStageText = () => {
    switch (animationStage) {
      case 0: return "Creando llave de torneo..."
      case 1: return "Añadiendo partidos de cuartos de final..."
      case 2: return "Conectando a semifinales..."
      case 3: return "Creando primer partido de semifinal..."
      case 4: return "Conectando segundo grupo..."
      case 5: return "Creando segundo partido de semifinal..."
      case 6: return "Conectando a la final..."
      case 7: return "¡Llave de torneo completada!"
      default: return "Creando llave..."
    }
  }

  // Calculate positions for connecting lines
  const getMatchPosition = (matchId: string, index: number) => {
    if (matchId.startsWith('q')) {
      // Quarters - each match is 140px + 24px gap, positioned vertically
      const quarterIndex = parseInt(matchId.charAt(1)) - 1
      return {
        x: 0,
        y: quarterIndex * 164 + 70, // 70 is half the card height (140/2)
        width: 200,
        height: 140
      }
    } else if (matchId.startsWith('s')) {
      // Semis - positioned between their quarter matches
      const semiIndex = parseInt(matchId.charAt(1)) - 1
      return {
        x: 300,
        y: semiIndex * 328 + 152, // Position between quarters
        width: 200,
        height: 140
      }
    } else {
      // Final - centered
      return {
        x: 600,
        y: 328, // Centered vertically
        width: 200,
        height: 140
      }
    }
  }

  return (
    <section className="py-12 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Trophy className="h-8 w-8 text-emerald-600 mr-3" />
            <h2 className="text-3xl font-bold text-slate-800">Creación de Llaves de Torneo</h2>
          </div>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            Observa cómo se construye automáticamente una llave de eliminación directa paso a paso
          </p>
        </div>

        <div className="max-w-6xl mx-auto relative">
          {/* Main bracket container with proper positioning */}
          <div className="relative" style={{ height: '700px', width: '100%' }}>
            {/* SVG for all connection lines */}
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none" 
              style={{ zIndex: 1 }}
            >
              {/* Lines from quarters to semis */}
              <path
                d={`M 200 ${getMatchPosition('q1', 0).y} L 250 ${getMatchPosition('q1', 0).y} L 250 ${getMatchPosition('s1', 0).y} L 300 ${getMatchPosition('s1', 0).y}`}
                stroke="#10b981"
                strokeWidth="2"
                fill="none"
                className={`transition-all duration-1000 ${
                  lines.find(l => l.id === "l1")?.visible ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  strokeDasharray: lines.find(l => l.id === "l1")?.visible ? 'none' : '5,5',
                  animation: lines.find(l => l.id === "l1")?.visible ? 'drawLine 1.5s ease-out' : 'none'
                }}
              />
              <path
                d={`M 200 ${getMatchPosition('q2', 0).y} L 250 ${getMatchPosition('q2', 0).y} L 250 ${getMatchPosition('s1', 0).y} L 300 ${getMatchPosition('s1', 0).y}`}
                stroke="#10b981"
                strokeWidth="2"
                fill="none"
                className={`transition-all duration-1000 ${
                  lines.find(l => l.id === "l2")?.visible ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  strokeDasharray: lines.find(l => l.id === "l2")?.visible ? 'none' : '5,5',
                  animation: lines.find(l => l.id === "l2")?.visible ? 'drawLine 1.5s ease-out' : 'none'
                }}
              />
              <path
                d={`M 200 ${getMatchPosition('q3', 0).y} L 250 ${getMatchPosition('q3', 0).y} L 250 ${getMatchPosition('s2', 0).y} L 300 ${getMatchPosition('s2', 0).y}`}
                stroke="#10b981"
                strokeWidth="2"
                fill="none"
                className={`transition-all duration-1000 ${
                  lines.find(l => l.id === "l3")?.visible ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  strokeDasharray: lines.find(l => l.id === "l3")?.visible ? 'none' : '5,5',
                  animation: lines.find(l => l.id === "l3")?.visible ? 'drawLine 1.5s ease-out' : 'none'
                }}
              />
              <path
                d={`M 200 ${getMatchPosition('q4', 0).y} L 250 ${getMatchPosition('q4', 0).y} L 250 ${getMatchPosition('s2', 0).y} L 300 ${getMatchPosition('s2', 0).y}`}
                stroke="#10b981"
                strokeWidth="2"
                fill="none"
                className={`transition-all duration-1000 ${
                  lines.find(l => l.id === "l4")?.visible ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  strokeDasharray: lines.find(l => l.id === "l4")?.visible ? 'none' : '5,5',
                  animation: lines.find(l => l.id === "l4")?.visible ? 'drawLine 1.5s ease-out' : 'none'
                }}
              />
              
              {/* Lines from semis to final */}
              <path
                d={`M 500 ${getMatchPosition('s1', 0).y} L 550 ${getMatchPosition('s1', 0).y} L 550 ${getMatchPosition('f1', 0).y} L 600 ${getMatchPosition('f1', 0).y}`}
                stroke="#10b981"
                strokeWidth="2"
                fill="none"
                className={`transition-all duration-1000 ${
                  lines.find(l => l.id === "l5")?.visible ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  strokeDasharray: lines.find(l => l.id === "l5")?.visible ? 'none' : '5,5',
                  animation: lines.find(l => l.id === "l5")?.visible ? 'drawLine 1.5s ease-out' : 'none'
                }}
              />
              <path
                d={`M 500 ${getMatchPosition('s2', 0).y} L 550 ${getMatchPosition('s2', 0).y} L 550 ${getMatchPosition('f1', 0).y} L 600 ${getMatchPosition('f1', 0).y}`}
                stroke="#10b981"
                strokeWidth="2"
                fill="none"
                className={`transition-all duration-1000 ${
                  lines.find(l => l.id === "l6")?.visible ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  strokeDasharray: lines.find(l => l.id === "l6")?.visible ? 'none' : '5,5',
                  animation: lines.find(l => l.id === "l6")?.visible ? 'drawLine 1.5s ease-out' : 'none'
                }}
              />
            </svg>

            {/* Round headers */}
            <div className="absolute top-0 left-0" style={{ width: '200px' }}>
              <h3 className="text-center text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-surface py-2 px-3 border border-emerald-200">
                Cuartos de Final
              </h3>
            </div>
            <div className="absolute top-0" style={{ left: '300px', width: '200px' }}>
              <h3 className="text-center text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-surface py-2 px-3 border border-emerald-200">
                Semifinales
              </h3>
            </div>
            <div className="absolute top-0" style={{ left: '600px', width: '200px' }}>
              <h3 className="text-center text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-surface py-2 px-3 border border-emerald-200">
                Final
              </h3>
            </div>

            {/* Match cards positioned absolutely */}
            {matches.map((match, index) => {
              const pos = getMatchPosition(match.id, index)
              return (
                <div
                  key={match.id}
                  className="absolute"
                  style={{
                    left: `${pos.x}px`,
                    top: `${pos.y - 70 + 40}px`, // Adjust for header space
                    width: `${pos.width}px`,
                    zIndex: 2
                  }}
                >
                  <MatchCard match={match} delay={index * 300} />
                </div>
              )
            })}
          </div>

          <div className="text-center mt-6">
            <div className="inline-flex items-center px-4 py-2 bg-white rounded-full shadow-sm border border-emerald-200">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse mr-2"></div>
              <span className="text-sm text-emerald-700 font-medium">
                {getStageText()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes drawLine {
          from {
            stroke-dasharray: 200;
            stroke-dashoffset: 200;
          }
          to {
            stroke-dasharray: 200;
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </section>
  )
}
