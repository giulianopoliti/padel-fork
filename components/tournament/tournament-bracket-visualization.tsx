"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/use-toast"
import { fetchTournamentMatches } from "@/app/api/tournaments/actions"
import { getTournamentById } from "@/app/api/tournaments/actions"
import { advanceToNextStageAction } from "@/app/api/tournaments/actions"
import { updateMatchResult } from "@/app/api/tournaments/actions"
import { checkZonesReadyForElimination } from "@/app/api/tournaments/actions"

import { getPlayerProfile } from "@/app/api/users"
import { Loader2, GitFork, CheckCircle, Clock, Trophy, ArrowRight, Settings, Users, Eye } from "lucide-react"
import Link from "next/link"
import MatchResultDialog from "@/components/tournament/match-result-dialog"
import SeedingExampleDemo from "@/components/tournament/seeding-example-demo"
import MatchStatusBadge from "@/components/tournament/match-status-badge"
import MatchActionsMenu from "@/components/tournament/match-actions-menu"
import { Round } from "@/types"
import type { Database } from '@/database.types'
// 🚀 NUEVO: Importar funciones de placeholder
import { 
  PlaceholderInfo, 
  generateFirstRoundPlaceholders, 
  generateRoundPlaceholders,
  getPlaceholderText,
  getParentMatches
} from "@/utils/bracket-generator"
import { analyzeBracketState, BracketState, getBracketStateDescription } from "@/utils/bracket-state-manager"
// 🎯 NUEVO: Importar sistema de placeholders orientados a zonas

import { useTournamentZones } from "@/hooks/use-tournament-zones"

type MatchStatus = Database["public"]["Enums"]["match_status"]

// Import Match type from match-result-dialog.tsx
interface Match {
  id: string
  round: string
  status: "PENDING" | "IN_PROGRESS" | "FINISHED" | "CANCELED" | "BYE" | "WAITING_OPONENT"
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

// Extended match type for our visualization needs
interface BracketMatch extends Omit<Match, 'status'> {
  status: "PENDING" | "IN_PROGRESS" | "FINISHED" | "CANCELED" | "BYE" | "WAITING_OPONENT"
  court?: string | null
  type?: string
  // Additional detailed information from fetchTournamentMatches
  couple1?: {
    id: string
    player1_id: string
    player2_id: string
    player1_details?: {
      id: string
      first_name: string
      last_name: string
    }
    player2_details?: {
      id: string
      first_name: string
      last_name: string
    }
  }
  couple2?: {
    id: string
    player1_id: string
    player2_id: string
    player1_details?: {
      id: string
      first_name: string
      last_name: string
    }
    player2_details?: {
      id: string
      first_name: string
      last_name: string
    }
  }
}

interface MatchPosition {
  match: BracketMatch
  x: number
  y: number
  width: number
  height: number
}

interface ConnectorLine {
  x1: number
  y1: number
  x2: number
  y2: number
  roundIndex: number
}

interface TournamentBracketVisualizationProps {
  tournamentId: string
  isOwner?: boolean
  onDataRefresh?: () => void
}

export default function TournamentBracketVisualization({ tournamentId, isOwner = false, onDataRefresh }: TournamentBracketVisualizationProps) {
  // 🎯 NUEVO: Hook para obtener información de zonas
  const { zones, loading: zonesLoading, error: zonesError } = useTournamentZones(tournamentId)
  const [isLoading, setIsLoading] = useState(true)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [isGeneratingBracket, setIsGeneratingBracket] = useState(false)
  const [matches, setMatches] = useState<BracketMatch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<BracketMatch | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedMatchForDetails, setSelectedMatchForDetails] = useState<BracketMatch | null>(null)
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false)
  const [matchDetailsLoading, setMatchDetailsLoading] = useState(false)
  const [playerDetails, setPlayerDetails] = useState<Record<string, any>>({})
  const [isTournamentFinished, setIsTournamentFinished] = useState(false)
  const [currentTournamentRound, setCurrentTournamentRound] = useState<string>("")
  const [tournamentStatus, setTournamentStatus] = useState<string>("")
  const [matchPositions, setMatchPositions] = useState<MatchPosition[]>([])
  const [connectorLines, setConnectorLines] = useState<ConnectorLine[]>([])
  const [zonesReady, setZonesReady] = useState<{ready: boolean; message: string; totalCouples?: number} | null>(null)
  const [viewportWidth, setViewportWidth] = useState<number>(1200) // Default fallback
  // 🚀 NUEVO: Estado para placeholders
  const [placeholders, setPlaceholders] = useState<Map<string, PlaceholderInfo>>(new Map())
  const [seeds, setSeeds] = useState<any[]>([]) // Para almacenar información de seeds
  // 🎯 NUEVO: Estado para placeholders orientados a zonas
  const [zonePlaceholders, setZonePlaceholders] = useState<ZonePlaceholder[]>([])
  const [isGeneratingPlaceholders, setIsGeneratingPlaceholders] = useState(false)
  // 🔄 NUEVOS ESTADOS PARA FLEXIBLE BRACKET
  const [tournamentBracketStatus, setTournamentBracketStatus] = useState<string>('NOT_STARTED')
  const [registrationLocked, setRegistrationLocked] = useState<boolean>(false)
  const [isUpdatingBracket, setIsUpdatingBracket] = useState<boolean>(false)
  const [bracketState, setBracketState] = useState<BracketState>(BracketState.NOT_GENERATED)
  const [needsRegeneration, setNeedsRegeneration] = useState<boolean>(false)
  const bracketRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Update viewport width on mount and resize
  useEffect(() => {
    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth)
    }
    
    // Set initial width
    updateViewportWidth()
    
    // Add resize listener
    window.addEventListener('resize', updateViewportWidth)
    return () => window.removeEventListener('resize', updateViewportWidth)
  }, [])

  // Responsive sizing based on screen size - COMPACT for better bracket fit
  const isMobile = viewportWidth < 768
  // Dynamic dimensions based on viewport and role
  const columnWidth = isMobile ? 280 : 320
  const matchHeight = isMobile 
    ? (isOwner ? 120 : 95)   // Mobile: más alto para owner
    : (isOwner ? 135 : 110)  // Desktop: más alto para owner
  const matchSpacing = isMobile ? 15 : 20
  const matchWidth = columnWidth - 20

  // Calculate available width for bracket (accounting for sidebar and padding)
  const availableWidth = viewportWidth - (viewportWidth > 1024 ? 280 : 40)

  // 🚀 NUEVA FUNCIÓN: Formatear nombres de parejas con placeholders inteligentes
  const formatCoupleNamesWithPlaceholder = (
    match: BracketMatch, 
    isCouple1: boolean
  ): string => {
    const couple = isCouple1 ? match.couple1 : match.couple2
    const coupleId = isCouple1 ? match.couple1_id : match.couple2_id
    
    // Si hay una pareja real, mostrar sus nombres
    if (couple && coupleId && coupleId !== 'BYE_MARKER') {
      const player1Name = couple.player1_details ? 
        `${couple.player1_details.first_name} ${couple.player1_details.last_name}` : 
        match.couple1_player1_name || "Jugador 1"
      const player2Name = couple.player2_details ? 
        `${couple.player2_details.first_name} ${couple.player2_details.last_name}` : 
        match.couple1_player2_name || "Jugador 2"
      
      return formatPlayerName(player1Name) + " / " + formatPlayerName(player2Name)
    }
    
    // BYE case
    if (coupleId === 'BYE_MARKER' || coupleId === null) {
      return 'BYE'
    }
    
    // Generar placeholder inteligente basado en el estado del bracket
    return generateIntelligentPlaceholder(match, isCouple1)
  }

  // 🎯 NUEVA FUNCIÓN: Generar placeholders orientados a zonas
  const generateZoneAwarePlaceholdersFromZones = async () => {
    if (!zones || zones.length === 0) return
    
    try {
      setIsGeneratingPlaceholders(true)
      
      // Transformar zones data a ZoneInfo format
      const zoneInfos: ZoneInfo[] = zones.map((zone: any) => ({
        zoneId: zone.id,
        zoneName: zone.name || `Zone ${zone.id}`,
        isFinalized: zone.couples?.length > 0 && zone.couples.every((c: any) => c.final_position), // Verificar si todas las parejas tienen posición final
        finalPositions: zone.couples
          ?.filter((c: any) => c.final_position)
          ?.map((c: any) => ({
            position: c.final_position,
            coupleId: c.id,
            player1Name: c.player1_name || 'Jugador 1',
            player2Name: c.player2_name || 'Jugador 2',
            points: c.points || 0
          }))
      }))
      
      // Estimar total de parejas basado en las zonas
      const estimatedTotalCouples = zones.reduce((total: number, zone: any) => 
        total + (zone.couples?.length || 0), 0
      )
      
      // Generar zone match history (simplificado por ahora)
      const zoneMatchHistory: any[] = zones.map((zone: any) => ({
        zoneId: zone.id,
        zoneName: zone.name || `Zone ${zone.id}`,
        matches: [] // Por ahora vacío, se puede mejorar después
      }))
      
      // Generar placeholders usando el algoritmo zone-aware
      const result = generateZoneAwarePlaceholders(
        zoneInfos,
        zoneMatchHistory,
        Math.max(8, estimatedTotalCouples) // Mínimo 8 parejas para bracket
      )
      
      setZonePlaceholders(result.placeholders)
      console.log("🎯 Zone placeholders generated:", result.summary)
      
    } catch (error) {
      console.error("Error generating zone placeholders:", error)
    } finally {
      setIsGeneratingPlaceholders(false)
    }
  }

  // 🚀 NUEVA FUNCIÓN: Generar placeholder inteligente basado en el estado
  const generateIntelligentPlaceholder = (match: BracketMatch, isCouple1: boolean): string => {
    // 🎯 PRIORIDAD: Usar placeholders orientados a zonas si están disponibles
    if (zonePlaceholders.length > 0) {
      const zonePlaceholder = zonePlaceholders.find(zp => zp.matchId === match.id)
      if (zonePlaceholder) {
        const displayText = getPlaceholderDisplayText(zonePlaceholder, isCouple1 ? 'couple1' : 'couple2')
        return displayText.secondary ? 
          `${displayText.primary} (${displayText.secondary})` : 
          displayText.primary
      }
    }

    const roundOrder = ["32VOS", "16VOS", "8VOS", "4TOS", "SEMIFINAL", "FINAL"]
    const currentRoundIndex = roundOrder.indexOf(match.round)
    
    // Si es la primera ronda y las zonas no han terminado, mostrar placeholders de zona
    if (currentRoundIndex === 0 && bracketState === BracketState.NOT_GENERATED) {
      const matchOrder = match.order || 1
      const seedNumber = isCouple1 ? 
        (matchOrder - 1) * 2 + 1 : 
        (matchOrder - 1) * 2 + 2
      
      // Formato de placeholder para primera ronda: "1° A vs 4° B"
      return `${getPositionFromSeed(seedNumber)}° ${getZoneFromSeed(seedNumber)}`
    }
    
    // Si es primera ronda pero zonas terminadas, mostrar seeds
    if (currentRoundIndex === 0) {
      const matchOrder = match.order || 1
      const seedNumber = isCouple1 ? 
        (matchOrder - 1) * 2 + 1 : 
        (matchOrder - 1) * 2 + 2
      
      return `Seed ${seedNumber}`
    }
    
    // Rondas posteriores: mostrar de qué match viene
    const matchOrder = match.order || 1
    const parentMatch1Order = (matchOrder - 1) * 2 + 1
    const parentMatch2Order = (matchOrder - 1) * 2 + 2
    
    const parentMatchOrder = isCouple1 ? parentMatch1Order : parentMatch2Order
    return `Ganador M${parentMatchOrder}`
  }
  
  // Helper functions para placeholders
  const getPositionFromSeed = (seed: number): string => {
    // Assuming standard tournament seeding: 1st, 2nd, 3rd, 4th place from zones
    const positions = ['1', '2', '3', '4']
    return positions[Math.floor((seed - 1) / 6)] || '?'
  }
  
  const getZoneFromSeed = (seed: number): string => {
    // Assuming zones A, B, C, D, E, F...
    const zones = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    return zones[(seed - 1) % zones.length] || '?'
  }

  // Helper function to format player names with initials
  const formatPlayerName = (fullName: string | undefined) => {
    if (!fullName) return ""
    const nameParts = fullName.trim().split(" ")
    if (nameParts.length < 2) return fullName // Return as-is if not enough parts
    
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(" ") // Handle multiple last names
    const firstInitial = firstName.charAt(0).toUpperCase()
    return `${firstInitial}. ${lastName}`
  }

  // Helper function to format couple names
  const formatCoupleNames = (player1Name: string | undefined, player2Name: string | undefined) => {
    if (!player1Name || !player2Name) return ""
    const player1 = formatPlayerName(player1Name)
    const player2 = formatPlayerName(player2Name)
    return `${player1} / ${player2}`
  }

  // 🚀 NUEVA FUNCIÓN: Cargar información de seeds
  const loadSeedsInformation = async () => {
    try {
      // Esta función debería obtener información de seeds de la base de datos
      // Por ahora, usaremos un placeholder hasta que implementemos la consulta
      console.log("[loadSeedsInformation] Cargando información de seeds...")
      
      // TODO: Implementar consulta real a tournament_couple_seeds
      // const { data: seedsData } = await supabase
      //   .from('tournament_couple_seeds')
      //   .select('*, zones(name), couples(player1_details, player2_details)')
      //   .eq('tournament_id', tournamentId)
      //   .order('seed')
      
      setSeeds([]) // Placeholder
    } catch (error) {
      console.error("[loadSeedsInformation] Error cargando seeds:", error)
    }
  }

  const checkZonesStatus = async () => {
    try {
      const zonesStatus = await checkZonesReadyForElimination(tournamentId)
      setZonesReady(zonesStatus)
    } catch (error) {
      console.error("Error checking zones status:", error)
      setZonesReady({ ready: false, message: "Error al verificar el estado de las zonas" })
    }
  }

  const loadTournamentData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      setIsTournamentFinished(false)

      // Obtener detalles del torneo incluyendo estado del bracket
      const tournamentDetails = await getTournamentById(tournamentId)
      if (tournamentDetails) {
        setTournamentBracketStatus(tournamentDetails.bracket_status || 'NOT_STARTED')
        setRegistrationLocked(tournamentDetails.registration_locked || false)
        setTournamentStatus(tournamentDetails.status || '')
        
        if (tournamentDetails.status === "FINISHED") {
          setIsTournamentFinished(true)
        }
      }

      // Nota: Ya no llamamos directamente a generateOrUpdateBracketIfNeeded aquí
      // porque ahora se maneja a través del route.ts cuando el usuario hace clic en los botones
      console.log(`[loadTournamentData] Cargando datos del torneo`)

      // Cargar matches del bracket
      const result = await fetchTournamentMatches(tournamentId)
      if (result.success && result.matches) {
        const knockoutMatches = result.matches.filter(
          (match: any) => match.type === "ELIMINATION" || (match.round && match.round !== "ZONE"),
        )

        // Transform API response to BracketMatch type
        const transformedMatches: BracketMatch[] = knockoutMatches.map((match: any) => ({
          id: match.id,
          round: match.round,
          status: match.status,
          couple1_id: match.couple1_id,
          couple2_id: match.couple2_id,
          couple1_player1_name: match.couple1_player1_name,
          couple1_player2_name: match.couple1_player2_name,
          couple2_player1_name: match.couple2_player1_name,
          couple2_player2_name: match.couple2_player2_name,
          result_couple1: match.result_couple1,
          result_couple2: match.result_couple2,
          winner_id: match.winner_id,
          zone_name: match.zone_name,
          order: match.order,
          court: match.court,
          type: match.type,
          couple1: match.couple1 ? {
            id: match.couple1.id,
            player1_id: match.couple1.player1_id,
            player2_id: match.couple1.player2_id,
            player1_details: match.couple1.player1_details,
            player2_details: match.couple1.player2_details
          } : undefined,
          couple2: match.couple2 ? {
            id: match.couple2.id,
            player1_id: match.couple2.player1_id,
            player2_id: match.couple2.player2_id,
            player1_details: match.couple2.player1_details,
            player2_details: match.couple2.player2_details
          } : undefined
        }))

        const sortedMatches = [...transformedMatches].sort((a: BracketMatch, b: BracketMatch) => {
          const roundOrderMap: Record<string, number> = {
            "32VOS": 0,
            "16VOS": 1,
            "8VOS": 2,
            "4TOS": 3,
            SEMIFINAL: 4,
            FINAL: 5,
          }
          const roundAIndex = roundOrderMap[a.round] ?? 99
          const roundBIndex = roundOrderMap[b.round] ?? 99

          if (roundAIndex !== roundBIndex) return roundAIndex - roundBIndex

          const orderA = a.order ?? Number.POSITIVE_INFINITY
          const orderB = b.order ?? Number.POSITIVE_INFINITY
          return orderA - orderB
        })

        setMatches(sortedMatches)

        const currentRoundVal: string = getCurrentRound(sortedMatches)
        setCurrentTournamentRound(currentRoundVal)

        if (!isTournamentFinished && currentRoundVal === "FINAL") {
          const finalRoudMatches = sortedMatches.filter((match: BracketMatch) => match.round === "FINAL")
          if (finalRoudMatches.length > 0 && finalRoudMatches.every((match: BracketMatch) => match.status === "FINISHED")) {
            setIsTournamentFinished(true)
          }
        }

        // 🚀 NUEVO: Cargar información de seeds después de cargar matches
        await loadSeedsInformation()
        
        // 🎆 NUEVO: Verificar si necesita regeneración
        await checkBracketRegeneration()

        // Si no hay matches eliminatorios, verificar estado de las zonas y generar placeholders
        if (knockoutMatches.length === 0) {
          await checkZonesStatus()
          await generateZoneAwarePlaceholdersFromZones()
        }
      } else {
        setError(result.error || "Error al cargar los partidos de llaves")
        // También verificar zonas si hay error cargando matches
        await checkZonesStatus()
      }
    } catch (err) {
      console.error("Error al cargar datos del torneo:", err)
      setError("Ocurrió un error inesperado al cargar el bracket.")
    } finally {
      setIsLoading(false)
    }
  }

  // 🎆 NUEVA FUNCIÓN: Cargar estado del bracket flexible
  const loadBracketState = async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/flexible-bracket?action=state`)
      const result = await response.json()
      
      if (result.success) {
        setBracketState(result.state.state)
      }
    } catch (error) {
      console.error('[loadBracketState] Error:', error)
    }
  }

  // 🎆 NUEVA FUNCIÓN: Verificar si el bracket necesita regeneración
  const checkBracketRegeneration = async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/flexible-bracket?action=check-regeneration`)
      const result = await response.json()
      
      if (result.success) {
        setNeedsRegeneration(result.regenerationCheck.needsRegeneration)
      }
    } catch (error) {
      console.error('[checkBracketRegeneration] Error:', error)
    }
  }

  // 🔄 NUEVAS FUNCIONES PARA CONTROLES PROGRESIVOS
  const handleLockRegistration = async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bracket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      const result = await response.json()
      
      if (result.success) {
        toast({
          title: "Registro cerrado y bracket generado",
          description: result.message
        })
        
        setRegistrationLocked(true)
        
        // Recargar datos del bracket
        await loadTournamentData()
        
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message
        })
      }
      
    } catch (error: any) {
      toast({
        variant: "destructive", 
        title: "Error",
        description: error.message
      })
    }
  }

  const handleForceUpdateBracket = async () => {
    try {
      setIsUpdatingBracket(true)
      
      const response = await fetch(`/api/tournaments/${tournamentId}/bracket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      const result = await response.json()
      
      if (result.success) {
        toast({
          title: "Bracket actualizado",
          description: result.message
        })
        
        // Recargar datos del bracket
        await loadTournamentData()
        
      } else {
        toast({
          variant: "destructive",
          title: "Error actualizando bracket",
          description: result.message
        })
      }
      
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      })
    } finally {
      setIsUpdatingBracket(false)
    }
  }

  // 🎆 FUNCIÓN: Generar bracket tradicional
  const handleGenerateBracket = async () => {
    if (!zonesReady?.ready) {
      toast({
        variant: "destructive",
        title: "Error",
        description: zonesReady?.message || "Las zonas no están listas para generar el bracket"
      })
      return
    }

    try {
      setIsGeneratingBracket(true)
      
      console.log("Generando bracket tradicional...")
      const response = await fetch(`/api/tournaments/${tournamentId}/flexible-bracket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'generate',
          algorithm: 'traditional',
          useRealData: true
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        toast({
          title: "🏆 ¡Bracket tradicional generado exitosamente!",
          description: result.message
        })
        
        // Mostrar información sobre el algoritmo
        console.log("🎯 Traditional algorithm info:", result.systemInfo)
        console.log("📊 Impact analysis:", result.impactAnalysis)
        
        // Recargar los datos para mostrar el nuevo bracket
        await loadTournamentData()
      } else {
        toast({
          variant: "destructive",
          title: "Error generando bracket",
          description: result.error || "Error desconocido al generar el bracket"
        })
      }
    } catch (error) {
      console.error("Error generating bracket:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error inesperado al generar el bracket"
      })
    } finally {
      setIsGeneratingBracket(false)
    }
  }

  // 🎆 NUEVA FUNCIÓN: Regenerar bracket con confirmación
  const handleRegenerateBracket = async (force = false) => {
    try {
      setIsUpdatingBracket(true)
      
      const response = await fetch(`/api/tournaments/${tournamentId}/flexible-bracket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'regenerate',
          force,
          preservePlayedMatches: !force
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        toast({
          title: "Bracket regenerado exitosamente",
          description: result.message
        })
        
        await loadTournamentData()
      } else {
        if (result.requiresConfirmation && !force) {
          // Show confirmation dialog
          const confirmed = confirm(`${result.error}\n\n¿Estás seguro de continuar?`)
          if (confirmed) {
            return handleRegenerateBracket(true)
          }
        } else {
          toast({
            variant: "destructive",
            title: "Error regenerando bracket",
            description: result.error
          })
        }
      }
    } catch (error) {
      console.error("Error regenerating bracket:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error inesperado al regenerar el bracket"
      })
    } finally {
      setIsUpdatingBracket(false)
    }
  }

  // 🐍 NUEVA FUNCIÓN: Generar bracket serpentino usando el sistema integrado
  const handleGenerateSerpentineBracket = async () => {
    if (!zonesReady?.ready) {
      toast({
        variant: "destructive",
        title: "Error",
        description: zonesReady?.message || "Las zonas no están listas para generar el bracket"
      })
      return
    }

    try {
      setIsGeneratingBracket(true)
      
      console.log("Generando bracket serpentino con sistema integrado...")
      const response = await fetch(`/api/tournaments/${tournamentId}/flexible-bracket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'generate',
          algorithm: 'serpentine',
          useRealData: true
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        toast({
          title: "🐍 ¡Bracket serpentino generado exitosamente!",
          description: result.systemInfo?.guarantee || result.message
        })
        
        // Mostrar información adicional sobre el algoritmo
        console.log("🎯 Serpentine algorithm info:", result.systemInfo)
        console.log("📊 Impact analysis:", result.impactAnalysis)
        
        // Recargar los datos para mostrar el nuevo bracket
        await loadTournamentData()
      } else {
        toast({
          variant: "destructive",
          title: "Error generando bracket serpentino",
          description: result.error || "Error desconocido al generar el bracket serpentino"
        })
      }
    } catch (error) {
      console.error("Error generating serpentine bracket:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error inesperado al generar el bracket serpentino"
      })
    } finally {
      setIsGeneratingBracket(false)
    }
  }

  useEffect(() => {
    loadTournamentData()
  }, [tournamentId])

  useEffect(() => {
    if (matches.length > 0) {
      calculatePositionsAndLines()
    }
  }, [matches])

  const calculatePositionsAndLines = () => {
    const roundOrder = ["32VOS", "16VOS", "8VOS", "4TOS", "SEMIFINAL", "FINAL"]

    const matchesByRound: Record<string, BracketMatch[]> = {}
    matches.forEach((match) => {
      const round = match.round || "Unknown"
      if (!matchesByRound[round]) {
        matchesByRound[round] = []
      }
      matchesByRound[round].push(match)
    })

    const activeRounds = roundOrder.filter((round) => matchesByRound[round] && matchesByRound[round].length > 0)

    const positions: MatchPosition[] = []
    const lines: ConnectorLine[] = []

    // 🔄 NUEVO: Helper function to find parent match by order instead of winner_id
    const findParentMatchByOrder = (
      currentMatch: BracketMatch,
      previousRoundPositions: MatchPosition[],
      isCouple1: boolean
    ): MatchPosition | null => {
      const parentOrder = (currentMatch.order! - 1) * 2 + (isCouple1 ? 1 : 2)
      return previousRoundPositions.find(p => p.match.order === parentOrder) || null
    }

    // Helper function to calculate center Y between two parents
    const calculateCenterY = (parent1: MatchPosition | null, parent2: MatchPosition | null, fallbackIndex: number = 0): number => {
      if (parent1 && parent2) {
        const parent1CenterY = parent1.y + parent1.height / 2
        const parent2CenterY = parent2.y + parent2.height / 2
        return (parent1CenterY + parent2CenterY) / 2 - matchHeight / 2
      } else if (parent1) {
        return parent1.y + (parent1.height - matchHeight) / 2
      } else if (parent2) {
        return parent2.y + (parent2.height - matchHeight) / 2
      }
      // Fallback to default positioning if no parents found - use index to avoid overlapping
      return 60 + fallbackIndex * (matchHeight + matchSpacing)
    }

    activeRounds.forEach((round, roundIndex) => {
      const roundMatches = matchesByRound[round]
      const x = roundIndex * columnWidth

      if (roundIndex === 0) {
        // First round: position matches from top to bottom (backend now generates in correct order)
        const startY = 60

        roundMatches.forEach((match, matchIndex) => {
          const y = startY + matchIndex * (matchHeight + matchSpacing)
          positions.push({
            match,
            x,
            y,
            width: matchWidth,
            height: matchHeight,
          })
        })
      } else {
        // Subsequent rounds: find parent matches by winner_id
        const prevRoundPositions = positions.filter(pos => {
          const prevRound = activeRounds[roundIndex - 1]
          return matchesByRound[prevRound].some(m => m.id === pos.match.id)
        })

        roundMatches.forEach((match, matchIndex) => {
          // 🔄 NUEVO: Find parent matches by order instead of winner_id
          const parent1 = findParentMatchByOrder(match, prevRoundPositions, true)
          const parent2 = findParentMatchByOrder(match, prevRoundPositions, false)

          // DEBUG: Log para ver qué está pasando
          console.log(`Match ${match.id} (${round}):`, {
            order: match.order,
            parent1_found: !!parent1,
            parent2_found: !!parent2,
            parent1_order: parent1?.match.order,
            parent2_order: parent2?.match.order,
            prevRoundPositions_length: prevRoundPositions.length
          })

          // Calculate position based on actual parent positions
          const centerY = calculateCenterY(parent1, parent2, matchIndex)

          // Add current match position
          const currentMatchPos: MatchPosition = {
            match,
            x,
            y: centerY,
            width: matchWidth,
            height: matchHeight,
          }
          positions.push(currentMatchPos)

          // Create connector lines from actual parents
          if (parent1 && parent2) {
            // Two parents case: draw lines meeting at midpoint
            const parent1CenterY = parent1.y + parent1.height / 2
            const parent2CenterY = parent2.y + parent2.height / 2
            const currentMatchCenterY = currentMatchPos.y + currentMatchPos.height / 2
            // 📐 NUEVO: Simplificar connectionX
            const connectionX = x - 15   // 15 px antes de la columna actual
            const midPointY = (parent1CenterY + parent2CenterY) / 2

            // ➕ NUEVO: Añadir tramos verticales que faltan
            const vLineTop = { x1: connectionX, y1: parent1CenterY, x2: connectionX, y2: midPointY, roundIndex }
            const vLineBottom = { x1: connectionX, y1: midPointY, x2: connectionX, y2: parent2CenterY, roundIndex }

            // Create lines: verticales + horizontales + diagonal
            lines.push(
              vLineTop,
              vLineBottom,
              { x1: parent1.x + parent1.width, y1: parent1CenterY, x2: connectionX, y2: parent1CenterY, roundIndex },
              { x1: parent2.x + parent2.width, y1: parent2CenterY, x2: connectionX, y2: parent2CenterY, roundIndex },
              { x1: connectionX, y1: midPointY, x2: currentMatchPos.x, y2: currentMatchCenterY, roundIndex }
            )
          } else if (parent1) {
            // Single parent case
            const parent1CenterY = parent1.y + parent1.height / 2
            const currentMatchCenterY = currentMatchPos.y + currentMatchPos.height / 2
            lines.push(
              { x1: parent1.x + parent1.width, y1: parent1CenterY, x2: currentMatchPos.x, y2: currentMatchCenterY, roundIndex }
            )
          } else if (parent2) {
            // Single parent case (rare scenario)
            const parent2CenterY = parent2.y + parent2.height / 2
            const currentMatchCenterY = currentMatchPos.y + currentMatchPos.height / 2
            lines.push(
              { x1: parent2.x + parent2.width, y1: parent2CenterY, x2: currentMatchPos.x, y2: currentMatchCenterY, roundIndex }
            )
          }
          // If no parents found, no lines are drawn (which is correct for orphaned matches)
        })
      }
    })

    setMatchPositions(positions)
    setConnectorLines(lines)
    
    // DEBUG: Log para ver cuántas líneas se crearon
    console.log(`Created ${lines.length} connector lines:`, lines)
  }

  const handleOpenResultDialog = (match: BracketMatch) => {
    setSelectedMatch(match)
    setIsDialogOpen(true)
  }

  const handleOpenMatchDetails = async (match: BracketMatch) => {
    setSelectedMatchForDetails(match)
    setIsDetailsDialogOpen(true)
    setMatchDetailsLoading(true)
    
    // Obtener información detallada de todos los jugadores del partido
    const playerIds = []
    if (match.couple1?.player1_id) playerIds.push(match.couple1.player1_id)
    if (match.couple1?.player2_id) playerIds.push(match.couple1.player2_id)
    if (match.couple2?.player1_id) playerIds.push(match.couple2.player1_id)
    if (match.couple2?.player2_id) playerIds.push(match.couple2.player2_id)
    
    const newPlayerDetails: Record<string, any> = {}
    
    try {
      await Promise.all(
        playerIds.map(async (playerId) => {
          const profile = await getPlayerProfile(playerId)
          if (profile) {
            newPlayerDetails[playerId] = profile
          }
        })
      )
      setPlayerDetails(newPlayerDetails)
    } catch (error) {
      console.error("Error fetching player details:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los detalles de los jugadores"
      })
    } finally {
      setMatchDetailsLoading(false)
    }
  }

  const handleResultSaved = () => {
    setIsDialogOpen(false)
    loadTournamentData() // Recarga los datos del bracket
    if (onDataRefresh) {
      onDataRefresh() // Llama al refresco general
    }
  }

  const handleUpdateMatch = async (matchId: string, data: { status?: MatchStatus; court?: string }) => {
    try {
      // Importar dinámicamente la función updateMatch
      const { updateMatch } = await import("@/app/api/matches/actions")
      
      // Actualizar el partido
      await updateMatch(matchId, data)
      
      // Recargar datos del torneo después de cualquier actualización
      await loadTournamentData()
      
      toast({
        title: "Partido Actualizado",
        description: "Los cambios se han guardado correctamente.",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el partido.",
        variant: "destructive",
      })
    }
  }

  const handleAdvanceToNextStage = async () => {
    setIsAdvancing(true)
    try {
      const result = await advanceToNextStageAction(tournamentId)
      if (result.success) {
        const isFinal = 'isFinal' in result ? result.isFinal : false
        const message = 'message' in result ? result.message : undefined
        
        toast({
          title: isFinal ? "Torneo Finalizado" : "Avance Exitoso",
          description:
            message ||
            (isFinal ? "El torneo ha concluido." : "Se ha avanzado a la siguiente etapa del torneo."),
        })
        if (isFinal) {
          setIsTournamentFinished(true)
        }
        loadTournamentData()
      } else {
        const error = 'error' in result ? result.error : "No se pudo avanzar a la siguiente etapa."
        toast({
          title: "Error al Avanzar",
          description: error,
          variant: "destructive",
        })
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Ocurrió un error inesperado al avanzar.",
        variant: "destructive",
      })
    } finally {
      setIsAdvancing(false)
    }
  }

  const getCurrentRound = (matchesData: BracketMatch[]) => {
    const rounds = ["32VOS", "16VOS", "8VOS", "4TOS", "SEMIFINAL", "FINAL"]
    for (const round of rounds) {
      const roundMatches = matchesData.filter((match) => match.round === round)
      if (roundMatches.length > 0 && roundMatches.some((match) => match.status !== "FINISHED")) {
        return round
      }
    }
    for (const round of [...rounds].reverse()) {
      if (matchesData.some((match) => match.round === round)) {
        return round
      }
    }
    return ""
  }

  const allCurrentRoundMatchesCompleted = () => {
    if (!currentTournamentRound || matches.length === 0) return false
    const currentRoundMatches = matches.filter((match: BracketMatch) => match.round === currentTournamentRound)
    return currentRoundMatches.length > 0 && currentRoundMatches.every((match: BracketMatch) => match.status === "FINISHED")
  }

  // Helper function para obtener nombre de ronda
  const getRoundName = (bracketSize: number): string => {
    const roundMap: Record<number, string> = {
      2: "FINAL",
      4: "SEMIFINAL", 
      8: "4TOS",
      16: "8VOS",
      32: "16VOS",
      64: "32VOS"
    }
    return roundMap[bracketSize] || "32VOS"
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-8 w-8 text-slate-600 animate-spin" />
        <span className="ml-3 text-slate-500">Cargando llaves del torneo...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-surface border border-red-200 text-center">
        <div className="font-semibold mb-1">Error al cargar llaves</div>
        <div className="text-sm">{error}</div>
      </div>
    )
  }

  // 🎯 NUEVO: Si no hay matches pero sí placeholders de zona, mostrar preview
  if (matches.length === 0 && zonePlaceholders.length > 0) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center mb-8">
          <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Eye className="h-10 w-10 text-blue-600" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Preview del Bracket</h3>
          <p className="text-slate-500 max-w-md mx-auto mb-4">
            Este es el bracket previsto basado en el algoritmo zone-aware. Los emparejamientos se actualizarán automáticamente cuando las zonas finalicen.
          </p>
          <div className="flex justify-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>Pareja confirmada</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span>Pendiente de zona</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 max-w-4xl mx-auto">
          {zonePlaceholders
            .filter(p => p.round === getRoundName(zonePlaceholders.length * 2))
            .map((placeholder, index) => {
              const couple1Display = getPlaceholderDisplayText(placeholder, 'couple1')
              const couple2Display = getPlaceholderDisplayText(placeholder, 'couple2')
              
              return (
                <div 
                  key={placeholder.matchId} 
                  className="bg-white border border-slate-200 rounded-surface p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      {/* Couple 1 */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            couple1Display.status === 'confirmed' ? 'bg-green-500' :
                            couple1Display.status === 'partial' ? 'bg-yellow-500' : 'bg-gray-400'
                          }`}></div>
                          <div>
                            <div className="font-semibold text-slate-900">{couple1Display.primary}</div>
                            {couple1Display.secondary && (
                              <div className="text-sm text-slate-600">{couple1Display.secondary}</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* VS */}
                      <div className="text-slate-400 font-bold">VS</div>

                      {/* Couple 2 */}
                      <div className="flex-1 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <div>
                            <div className="font-semibold text-slate-900">{couple2Display.primary}</div>
                            {couple2Display.secondary && (
                              <div className="text-sm text-slate-600">{couple2Display.secondary}</div>
                            )}
                          </div>
                          <div className={`w-3 h-3 rounded-full ${
                            couple2Display.status === 'confirmed' ? 'bg-green-500' :
                            couple2Display.status === 'partial' ? 'bg-yellow-500' : 'bg-gray-400'
                          }`}></div>
                        </div>
                      </div>
                    </div>

                    {/* Indicators */}
                    <div className="ml-4 flex items-center gap-2">
                      {placeholder.anticipatedRematch && (
                        <Badge variant="outline" className="text-orange-600 border-orange-300">
                          ⚠️ Posible Rematch
                        </Badge>
                      )}
                      <div className="text-sm text-slate-500">
                        Match {placeholder.order}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>

        {isOwner && (
          <div className="text-center mt-8">
            <Button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2"
            >
              Actualizar Preview
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center py-16">
          
          {/* Estado: Registration Open */}
          {tournamentBracketStatus === 'NOT_STARTED' && !registrationLocked && (
            <>
              <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <GitFork className="h-10 w-10 text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Registro Abierto</h3>
              <p className="text-slate-500 max-w-md mx-auto mb-8">
                El bracket se generará cuando se cierre el registro de parejas.
              </p>
              
              {isOwner && (
                <Button
                  onClick={handleLockRegistration}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
                >
                  Cerrar Registro y Generar Bracket
                </Button>
              )}
            </>
          )}
          
          {/* Estado: Registration Locked */}
          {(tournamentBracketStatus === 'NOT_STARTED' && registrationLocked) && (
            <>
              <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Generando Bracket</h3>
              <p className="text-slate-500 max-w-md mx-auto mb-8">
                El registro está cerrado. Generando bracket eliminatorio...
              </p>
              
              {isOwner && (
                <Button
                  onClick={handleForceUpdateBracket}
                  disabled={isUpdatingBracket}
                  className="bg-green-600 hover:bg-green-700 text-white px-8 py-3"
                >
                  {isUpdatingBracket ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Generando...
                    </>
                  ) : (
                    'Generar Bracket Ahora'
                  )}
                </Button>
              )}
            </>
          )}

          {/* Estado: Bracket Generated/Active pero sin matches en UI */}
          {(tournamentBracketStatus === 'BRACKET_GENERATED' || tournamentBracketStatus === 'BRACKET_ACTIVE') && (
            <>
              <div className="bg-amber-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock className="h-10 w-10 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Bracket Generado</h3>
              <p className="text-slate-500 max-w-md mx-auto mb-8">
                El bracket fue generado pero hubo un problema cargando los partidos.
              </p>
              
              {isOwner && (
                <div className="flex gap-4 justify-center">
                  <Button
                    onClick={handleForceUpdateBracket}
                    disabled={isUpdatingBracket}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2"
                  >
                    {isUpdatingBracket ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Actualizando...
                      </>
                    ) : (
                      'Actualizar Bracket'
                    )}
                  </Button>
                  <Button
                    onClick={loadTournamentData}
                    variant="outline"
                    className="px-6 py-2"
                  >
                    Recargar Datos
                  </Button>
                </div>
              )}
            </>
          )}
          
          {/* 🎆 NUEVO: Información de estado flexible */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-8 p-4 bg-gray-100 rounded text-left text-sm">
              <strong>Flexible Bracket Debug:</strong><br />
              Bracket State: {getBracketStateDescription(bracketState)}<br />
              Needs Regeneration: {needsRegeneration ? 'Yes' : 'No'}<br />
              Bracket Status: {tournamentBracketStatus}<br />
              Registration Locked: {registrationLocked ? 'Yes' : 'No'}<br />
              Tournament Status: {tournamentStatus}
            </div>
          )}

          {/* 🎆 NUEVO: Indicador de regeneración necesaria */}
          {needsRegeneration && matches.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-surface p-4 mb-6 text-left">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-2 w-2 bg-amber-500 rounded-full animate-pulse"></div>
                <h4 className="font-medium text-amber-800">Bracket Desactualizado</h4>
              </div>
              <p className="text-sm text-amber-700 mb-3">
                Se detectaron cambios en las zonas. El bracket necesita regeneración.
              </p>
              {isOwner && (
                <button
                  onClick={() => handleRegenerateBracket()}
                  disabled={isUpdatingBracket}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                >
                  {isUpdatingBracket ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                      Regenerando...
                    </>
                  ) : (
                    'Regenerar Bracket'
                  )}
                </button>
              )}
            </div>
          )}

          {/* Estado de las zonas */}
          {zonesReady && (
            <div className="bg-white border border-gray-200 rounded-surface p-6 mb-6 text-left">
              <div className="flex items-center gap-3 mb-4">
                <Users className="h-5 w-5 text-blue-600" />
                <h4 className="font-medium text-gray-900">Estado de las Zonas</h4>
              </div>
              
              <div className="flex items-center gap-2 mb-4">
                {zonesReady.ready ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <Clock className="h-4 w-4 text-amber-500" />
                )}
                <span className={`text-sm ${zonesReady.ready ? 'text-green-700' : 'text-amber-600'}`}>
                  {zonesReady.message}
                </span>
              </div>

              {zonesReady.totalCouples && zonesReady.totalCouples > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-control p-4">
                  <div className="text-sm text-blue-800">
                    <strong>{zonesReady.totalCouples} parejas</strong> participarán en el bracket eliminatorio
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    Tamaño del bracket: <strong>{Math.pow(2, Math.ceil(Math.log2(Math.max(2, zonesReady.totalCouples))))}</strong> posiciones
                    {Math.pow(2, Math.ceil(Math.log2(Math.max(2, zonesReady.totalCouples)))) - zonesReady.totalCouples > 0 && (
                      <span className="ml-2">
                        ({Math.pow(2, Math.ceil(Math.log2(Math.max(2, zonesReady.totalCouples)))) - zonesReady.totalCouples} BYEs automáticos)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Algoritmos disponibles */}
          <div className="bg-gray-50 border border-gray-200 rounded-surface p-6 mb-8 text-left">
            <div className="flex items-center gap-3 mb-4">
              <Settings className="h-5 w-5 text-gray-600" />
              <h4 className="font-medium text-gray-900">Algoritmos de Bracket Disponibles</h4>
            </div>
            
            {/* Algoritmo Tradicional */}
            <div className="mb-6">
              <h5 className="font-semibold text-blue-700 mb-2">🏆 Algoritmo Tradicional</h5>
              <ul className="text-sm text-gray-700 space-y-1 ml-4">
                <li>• Agrupamiento por posición: Todos los primeros de zona juntos, luego segundos, etc.</li>
                <li>• Emparejamiento estándar: Seed 1 vs Seed N, Seed 2 vs Seed N-1</li>
                <li>• Sin garantías especiales de encuentros</li>
              </ul>
            </div>

            {/* Algoritmo Serpentino */}
            <div className="mb-4">
              <h5 className="font-semibold text-emerald-700 mb-2">🐍 Algoritmo Serpentino</h5>
              <ul className="text-sm text-gray-700 space-y-1 ml-4">
                <li>• <strong>Garantía especial:</strong> 1A y 1B solo se pueden encontrar en la final</li>
                <li>• Patrón serpentino: 1A→Izquierda, 1B→Derecha, 1C→Izquierda, 1D→Derecha...</li>
                <li>• Separación de mitades del bracket para máxima emoción</li>
                <li>• Ideal para maximizar el espectáculo en la final</li>
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
              <strong>💡 Recomendación:</strong> Use el algoritmo serpentino si quiere garantizar que los mejores de las primeras dos zonas (1A y 1B) solo se encuentren en la final.
            </div>
          </div>

          {/* Ejemplo del algoritmo */}
          <div className="flex justify-center">
            <SeedingExampleDemo totalCouples={zonesReady?.totalCouples || 21} />
          </div>

          {/* Botones de generación */}
          <div className="flex flex-col gap-4">
            <Button
              onClick={handleGenerateBracket}
              disabled={!zonesReady?.ready || isGeneratingBracket}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-surface shadow-sm"
              size="lg"
            >
              {isGeneratingBracket ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Generando Bracket...
                </>
              ) : (
                <>
                  <Trophy className="h-5 w-5 mr-2" />
                  Generar Bracket Tradicional
                </>
              )}
            </Button>

            <Button
              onClick={handleGenerateSerpentineBracket}
              disabled={!zonesReady?.ready || isGeneratingBracket}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-surface shadow-sm"
              size="lg"
            >
              {isGeneratingBracket ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Generando Bracket...
                </>
              ) : (
                <>
                  <GitFork className="h-5 w-5 mr-2" />
                  🐍 Generar Bracket Serpentino (1A vs 1B solo en Final)
                </>
              )}
            </Button>
          </div>

          {!zonesReady?.ready && zonesReady && (
            <p className="text-sm text-amber-600 mt-4">
              Complete todos los matches de zona antes de generar el bracket
            </p>
          )}
        </div>
      </div>
    )
  }

  const roundOrder = ["32VOS", "16VOS", "8VOS", "4TOS", "SEMIFINAL", "FINAL"]
  const roundTranslation: Record<string, string> = {
    "32VOS": "32vos de Final",
    "16VOS": "16vos de Final",
    "8VOS": "8vos de Final",
    "4TOS": "4tos de Final",
    SEMIFINAL: "Semifinales",
    FINAL: "Final",
  }

  const matchesByRound: Record<string, BracketMatch[]> = {}
  matches.forEach((match) => {
    const round = match.round || "Unknown"
    if (!matchesByRound[round]) {
      matchesByRound[round] = []
    }
    matchesByRound[round].push(match)
  })

  const activeRoundsForLayout = roundOrder.filter((round) => matchesByRound[round] && matchesByRound[round].length > 0)

  // Dynamic width calculation to fit viewport
  const baseWidth = activeRoundsForLayout.length * columnWidth
  const totalWidthForLayout = Math.min(baseWidth, availableWidth - 40) // Ensure it fits with some margin
  
  const allMatches = Object.values(matchesByRound).flat()
  const maxMatchesInRound = Math.max(...activeRoundsForLayout.map((round) => matchesByRound[round].length))
  const calculatedTotalHeightForLayout = Math.max(600, 60 + maxMatchesInRound * (matchHeight + matchSpacing) + 100)

  return (
    <div className="flex flex-col">
      <div
        ref={bracketRef}
        className="tournament-bracket overflow-x-auto overflow-y-auto bg-gray-50 p-2 lg:p-4"
        style={{ 
          height: 'calc(100vh - 280px)',
          minHeight: '400px',
          maxWidth: '100%',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div
          className="relative py-4 lg:py-6"
          style={{ 
            width: totalWidthForLayout, 
            minHeight: calculatedTotalHeightForLayout,
            minWidth: 'fit-content'
          }}
        >
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            width={totalWidthForLayout}
            height={calculatedTotalHeightForLayout}
            style={{ zIndex: 1 }}
          >
            {connectorLines.map((line, index) => (
              <g key={index}>
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#64748b"
                  strokeWidth="2"
                  fill="none"
                />
              </g>
            ))}
          </svg>

          {activeRoundsForLayout.map((round: string, roundIndex: number) => (
            <div
              key={`header-${round}`}
              className="absolute text-center"
              style={{
                left: roundIndex * columnWidth,
                top: 0,
                width: matchWidth,
                zIndex: 2,
              }}
            >
              <div className="bg-slate-900 text-white rounded-surface py-3 px-4 shadow-sm">
                <h3 className="text-sm font-semibold">{roundTranslation[round] || round}</h3>
              </div>
            </div>
          ))}

          {matchPositions.map((position, index) => {
            const match = position.match
            const isCompleted = match.status === "FINISHED"
            const isBye =
              match.couple1_id === "BYE_MARKER" || match.couple2_id === "BYE_MARKER" || match.couple2_id === null

            return (
              <div
                key={match.id}
                className="absolute transition-all duration-300"
                style={{
                  left: position.x,
                  top: position.y,
                  width: position.width,
                  height: position.height,
                  zIndex: 3,
                }}
              >
                <div
                  className={`bg-white rounded-surface shadow-md h-full transition-all hover:shadow-lg border-2 ${
                    isCompleted ? "border-slate-300" : "border-gray-200"
                  } overflow-visible`}
                >

                  {/* Pareja 1 */}
                  <div
                    className={`px-4 py-2 ${
                      isCompleted && match.winner_id === match.couple1_id
                        ? "bg-emerald-50 border-l-4 border-emerald-500"
                        : "bg-white"
                    }`}
                  >
                    <div className="flex justify-between items-center min-h-6">
                      <div className="font-medium text-slate-900 text-sm max-w-[180px] truncate">
                        {formatCoupleNamesWithPlaceholder(match, true)}
                      </div>
                      {isCompleted && (
                        <div className="bg-slate-900 text-white text-xs font-bold px-2 py-1 rounded shadow-sm">
                          {match.result_couple1}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Separador */}
                  <div className="border-t border-gray-200"></div>

                  {/* Pareja 2 */}
                  <div
                    className={`px-4 py-2 ${
                      isCompleted && match.winner_id === match.couple2_id
                        ? "bg-emerald-50 border-l-4 border-emerald-500"
                        : "bg-white"
                    }`}
                  >
                    <div className="flex justify-between items-center min-h-6">
                      <div className="font-medium text-slate-900 text-sm max-w-[180px] truncate">
                        {formatCoupleNamesWithPlaceholder(match, false)}
                      </div>
                      {isCompleted && (
                        <div className="bg-slate-900 text-white text-xs font-bold px-2 py-1 rounded shadow-sm">
                          {match.result_couple2}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex justify-between items-center min-h-[40px] flex-wrap gap-2">
                    <div className={`flex items-center gap-2 ${!isOwner ? 'flex-1 justify-center' : ''}`}>
                      <MatchStatusBadge 
                        status={match.status} 
                      />
                      {match.court && (
                        <Badge 
                          variant="outline"
                          className="bg-slate-50 text-slate-700 border-slate-300 text-xs font-medium"
                          title={`Cancha ${match.court}`}
                        >
                          C {match.court}
                        </Badge>
                      )}
                    </div>

                    {isOwner && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!isBye && (
                          <MatchActionsMenu
                            tournamentId={tournamentId}
                            matchId={match.id}
                            status={match.status}
                            court={match.court}
                            matchInfo={{
                              couple1: match.couple1 ? `${match.couple1.player1_details?.first_name} ${match.couple1.player1_details?.last_name} / ${match.couple1.player2_details?.first_name} ${match.couple1.player2_details?.last_name}` : undefined,
                              couple2: match.couple2 ? `${match.couple2.player1_details?.first_name} ${match.couple2.player1_details?.last_name} / ${match.couple2.player2_details?.first_name} ${match.couple2.player2_details?.last_name}` : undefined,
                              hasRealCouple1: !!match.couple1,
                              hasRealCouple2: !!match.couple2,
                              isPlaceholder1: false,
                              isPlaceholder2: false,
                            }}
                            onUpdateMatch={handleUpdateMatch}
                            isOwner={isOwner}
                            onOpenResultDialog={() => handleOpenResultDialog(match)}
                          />
                        )}
                        
                        {/* Botón del ojo para ver detalles */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 w-7 p-0 bg-white text-blue-600 border border-blue-300 hover:bg-blue-50 rounded flex-shrink-0"
                          onClick={() => handleOpenMatchDetails(match)}
                          title="Ver detalles del partido"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Botón de Avanzar Etapa (para rondas que no sean la final) */}
      {isOwner && allCurrentRoundMatchesCompleted() && !isAdvancing && !isTournamentFinished && currentTournamentRound !== 'FINAL' && (
        <div className="flex justify-center p-6 border-t border-gray-200 bg-white">
          <Button
            onClick={handleAdvanceToNextStage}
            className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-surface shadow-sm"
            disabled={isAdvancing || isTournamentFinished}
          >
            {isAdvancing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Trophy className="mr-2 h-5 w-5" />}
            {isAdvancing ? "Avanzando..." : "Avanzar a la siguiente etapa"}
            {!isAdvancing && <ArrowRight className="ml-2 h-5 w-5" />}
          </Button>
        </div>
      )}

      {selectedMatchForDetails && (
        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-center">
                Detalles del Partido - {selectedMatchForDetails.round}
              </DialogTitle>
            </DialogHeader>
            
            {matchDetailsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">Cargando detalles...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Header del resultado si está completado */}
                {selectedMatchForDetails.status === "FINISHED" && (
                  <div className="text-center">
                    <Badge variant="default" className="bg-emerald-600 text-white text-lg px-4 py-2">
                      Resultado: {selectedMatchForDetails.result_couple1} - {selectedMatchForDetails.result_couple2}
                    </Badge>
                  </div>
                )}
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                  {/* Pareja 1 */}
                  <div className={`space-y-4 p-6 rounded-surface border-2 ${
                    selectedMatchForDetails.status === "FINISHED" && selectedMatchForDetails.winner_id === selectedMatchForDetails.couple1_id
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-200 bg-white"
                  }`}>
                    <h3 className="text-lg font-semibold text-center text-gray-800">Pareja 1</h3>
                    
                    {/* Jugador 1 de la pareja 1 */}
                    {selectedMatchForDetails.couple1?.player1_id && playerDetails[selectedMatchForDetails.couple1.player1_id] && (
                      <Link 
                        href={`/ranking/${selectedMatchForDetails.couple1.player1_id}`}
                        className="block hover:bg-gray-50 p-3 rounded-surface transition-colors border border-gray-100"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage 
                              src={playerDetails[selectedMatchForDetails.couple1.player1_id].profileImage} 
                              alt={playerDetails[selectedMatchForDetails.couple1.player1_id].name}
                            />
                            <AvatarFallback>
                              {playerDetails[selectedMatchForDetails.couple1.player1_id].name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {playerDetails[selectedMatchForDetails.couple1.player1_id].name}
                            </p>
                            <p className="text-sm text-gray-600">
                              {playerDetails[selectedMatchForDetails.couple1.player1_id].club?.name || "Sin club"}
                            </p>
                            <p className="text-sm font-medium text-blue-600">
                              {playerDetails[selectedMatchForDetails.couple1.player1_id].score || 0} pts
                            </p>
                          </div>
                        </div>
                      </Link>
                    )}
                    
                    {/* Jugador 2 de la pareja 1 */}
                    {selectedMatchForDetails.couple1?.player2_id && playerDetails[selectedMatchForDetails.couple1.player2_id] && (
                      <Link 
                        href={`/ranking/${selectedMatchForDetails.couple1.player2_id}`}
                        className="block hover:bg-gray-50 p-3 rounded-surface transition-colors border border-gray-100"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage 
                              src={playerDetails[selectedMatchForDetails.couple1.player2_id].profileImage} 
                              alt={playerDetails[selectedMatchForDetails.couple1.player2_id].name}
                            />
                            <AvatarFallback>
                              {playerDetails[selectedMatchForDetails.couple1.player2_id].name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {playerDetails[selectedMatchForDetails.couple1.player2_id].name}
                            </p>
                            <p className="text-sm text-gray-600">
                              {playerDetails[selectedMatchForDetails.couple1.player2_id].club?.name || "Sin club"}
                            </p>
                            <p className="text-sm font-medium text-blue-600">
                              {playerDetails[selectedMatchForDetails.couple1.player2_id].score || 0} pts
                            </p>
                          </div>
                        </div>
                      </Link>
                    )}
                  </div>
                  
                  {/* VS */}
                  <div className="text-center">
                    <div className="bg-slate-900 text-white rounded-full w-16 h-16 flex items-center justify-center mx-auto text-xl font-bold">
                      VS
                    </div>
                  </div>
                  
                  {/* Pareja 2 */}
                  <div className={`space-y-4 p-6 rounded-surface border-2 ${
                    selectedMatchForDetails.status === "FINISHED" && selectedMatchForDetails.winner_id === selectedMatchForDetails.couple2_id
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-200 bg-white"
                  }`}>
                    <h3 className="text-lg font-semibold text-center text-gray-800">Pareja 2</h3>
                    
                    {/* Jugador 1 de la pareja 2 */}
                    {selectedMatchForDetails.couple2?.player1_id && playerDetails[selectedMatchForDetails.couple2.player1_id] && (
                      <Link 
                        href={`/ranking/${selectedMatchForDetails.couple2.player1_id}`}
                        className="block hover:bg-gray-50 p-3 rounded-surface transition-colors border border-gray-100"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage 
                              src={playerDetails[selectedMatchForDetails.couple2.player1_id].profileImage} 
                              alt={playerDetails[selectedMatchForDetails.couple2.player1_id].name}
                            />
                            <AvatarFallback>
                              {playerDetails[selectedMatchForDetails.couple2.player1_id].name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {playerDetails[selectedMatchForDetails.couple2.player1_id].name}
                            </p>
                            <p className="text-sm text-gray-600">
                              {playerDetails[selectedMatchForDetails.couple2.player1_id].club?.name || "Sin club"}
                            </p>
                            <p className="text-sm font-medium text-blue-600">
                              {playerDetails[selectedMatchForDetails.couple2.player1_id].score || 0} pts
                            </p>
                          </div>
                        </div>
                      </Link>
                    )}
                    
                    {/* Jugador 2 de la pareja 2 */}
                    {selectedMatchForDetails.couple2?.player2_id && playerDetails[selectedMatchForDetails.couple2.player2_id] && (
                      <Link 
                        href={`/ranking/${selectedMatchForDetails.couple2.player2_id}`}
                        className="block hover:bg-gray-50 p-3 rounded-surface transition-colors border border-gray-100"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage 
                              src={playerDetails[selectedMatchForDetails.couple2.player2_id].profileImage} 
                              alt={playerDetails[selectedMatchForDetails.couple2.player2_id].name}
                            />
                            <AvatarFallback>
                              {playerDetails[selectedMatchForDetails.couple2.player2_id].name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {playerDetails[selectedMatchForDetails.couple2.player2_id].name}
                            </p>
                            <p className="text-sm text-gray-600">
                              {playerDetails[selectedMatchForDetails.couple2.player2_id].club?.name || "Sin club"}
                            </p>
                            <p className="text-sm font-medium text-blue-600">
                              {playerDetails[selectedMatchForDetails.couple2.player2_id].score || 0} pts
                            </p>
                          </div>
                        </div>
                      </Link>
                    )}
                  </div>
                </div>
                
                {/* Información adicional del partido */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Ronda</p>
                    <p className="font-semibold">{selectedMatchForDetails.round}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Estado</p>
                    <Badge variant={selectedMatchForDetails.status === "FINISHED" ? "default" : "secondary"}>
                      {selectedMatchForDetails.status === "FINISHED" ? "Completado" : "Pendiente"}
                    </Badge>
                  </div>
                  {selectedMatchForDetails.zone_name && (
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Zona</p>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        {selectedMatchForDetails.zone_name}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {selectedMatch && (
        <MatchResultDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          match={selectedMatch as any}
          onSave={handleResultSaved}
        />
      )}

      <style>{`
        .tournament-bracket::-webkit-scrollbar {
          height: 8px;
        }
        .tournament-bracket::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        .tournament-bracket::-webkit-scrollbar-thumb {
          background: #64748b;
          border-radius: 4px;
        }
        .tournament-bracket::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>
    </div>
  )
}