import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export type RoundType = 'ZONE' | '32VOS' | '16VOS' | '8VOS' | '4TOS' | 'SEMIFINAL' | 'FINAL'

export interface RoundOption {
  value: RoundType
  label: string
  description: string
}

// Mapeo de rounds a UI amigable
const ROUND_LABELS: Record<RoundType, string> = {
  'ZONE': 'Qually',
  '32VOS': '32vos de Final',
  '16VOS': '16vos de Final',
  '8VOS': 'Octavos de Final',
  '4TOS': 'Cuartos de Final',
  'SEMIFINAL': 'Semifinal',
  'FINAL': 'Final'
}

const ROUND_DESCRIPTIONS: Record<RoundType, string> = {
  'ZONE': 'Fase clasificatoria por zonas',
  '32VOS': 'Ronda de 32vos de final',
  '16VOS': 'Ronda de 16vos de final',
  '8VOS': 'Ronda de octavos de final',
  '4TOS': 'Ronda de cuartos de final',
  'SEMIFINAL': 'Ronda de semifinales',
  'FINAL': 'Ronda final'
}

// Orden jerárquico de las rondas (de menor a mayor)
const ROUND_HIERARCHY: RoundType[] = ['ZONE', '32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<{ success: boolean; rounds: RoundOption[]; defaultRound: RoundType; error?: string }>> {
  try {
    const tournamentId = params.id

    // Crear cliente de Supabase
    const supabase = await createClient()

    // Verificar autenticación
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({
        success: false,
        rounds: [],
        defaultRound: 'ZONE',
        error: 'Usuario no autenticado'
      }, { status: 401 })
    }

    // Obtener todas las rondas distintas que tienen matches generados
    const { data: existingRounds, error } = await supabase
      .from('matches')
      .select('round')
      .eq('tournament_id', tournamentId)
      .eq('bracket_is_active', true)
      .not('round', 'is', null)

    if (error) {
      console.error('Error fetching existing rounds:', error)
      // Si hay error, por defecto mostrar solo ZONE
      const fallbackRounds = [{
        value: 'ZONE' as RoundType,
        label: ROUND_LABELS.ZONE,
        description: ROUND_DESCRIPTIONS.ZONE
      }]

      return NextResponse.json({
        success: true,
        rounds: fallbackRounds,
        defaultRound: 'ZONE'
      })
    }

    // Extraer rounds únicos
    const generatedRounds = new Set(
      existingRounds?.map(r => r.round as RoundType).filter(Boolean) || []
    )

    // Si no hay matches generados, solo permitir ZONE
    if (generatedRounds.size === 0) {
      const onlyZone = [{
        value: 'ZONE' as RoundType,
        label: ROUND_LABELS.ZONE,
        description: ROUND_DESCRIPTIONS.ZONE
      }]

      return NextResponse.json({
        success: true,
        rounds: onlyZone,
        defaultRound: 'ZONE'
      })
    }

    // Determinar qué rondas están disponibles
    const availableRounds: RoundType[] = []

    // Siempre incluir ZONE si no hay matches de eliminación
    const hasEliminationRounds = Array.from(generatedRounds).some(round => round !== 'ZONE')
    if (!hasEliminationRounds || generatedRounds.has('ZONE')) {
      availableRounds.push('ZONE')
    }

    // Si hay matches de eliminación, incluir todas las rondas desde la primera generada hacia arriba
    if (hasEliminationRounds) {
      // Encontrar la ronda más baja generada (excluyendo ZONE)
      const eliminationRounds = Array.from(generatedRounds).filter(round => round !== 'ZONE')

      if (eliminationRounds.length > 0) {
        // Encontrar el índice de la ronda más baja en la jerarquía
        const lowestRoundIndex = Math.min(
          ...eliminationRounds.map(round => ROUND_HIERARCHY.indexOf(round))
        )

        // Incluir todas las rondas desde esa posición hacia arriba
        for (let i = lowestRoundIndex; i < ROUND_HIERARCHY.length; i++) {
          const round = ROUND_HIERARCHY[i]
          if (round !== 'ZONE' && !availableRounds.includes(round)) {
            availableRounds.push(round)
          }
        }
      }
    }

    // Convertir a opciones con labels
    const roundOptions = availableRounds.map(round => ({
      value: round,
      label: ROUND_LABELS[round],
      description: ROUND_DESCRIPTIONS[round]
    }))

    // Determinar ronda por defecto
    let defaultRound: RoundType = 'ZONE'
    if (availableRounds.includes('ZONE')) {
      defaultRound = 'ZONE'
    } else if (availableRounds.length > 0) {
      defaultRound = availableRounds[0]
    }

    return NextResponse.json({
      success: true,
      rounds: roundOptions,
      defaultRound
    })

  } catch (error) {
    console.error('Error in available-rounds endpoint:', error)

    // Fallback a solo ZONE en caso de error
    return NextResponse.json({
      success: true,
      rounds: [{
        value: 'ZONE' as RoundType,
        label: ROUND_LABELS.ZONE,
        description: ROUND_DESCRIPTIONS.ZONE
      }],
      defaultRound: 'ZONE'
    })
  }
}