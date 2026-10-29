import { advanceWinnerUsingHierarchy } from '@/app/api/tournaments/actions'
import { assertRegistrationExclusionsReviewed } from '@/lib/services/registration/registration-readiness'

/**
 * Genera bracket basado en seeding existente
 * Función utilitaria extraída para evitar llamadas fetch internas
 */
export async function generateBracketFromSeeding(tournamentId: string, supabase: any) {
  await assertRegistrationExclusionsReviewed(tournamentId)
  console.log(`[generateBracketFromSeeding] 🏗️ Generating bracket for tournament: ${tournamentId}`)

  // 1. Obtener seeding existente
  const { data: seeds, error: seedsError } = await supabase
    .from('tournament_couple_seeds')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('seed', { ascending: true })

  if (seedsError) {
    throw new Error(`Error fetching seeds: ${seedsError.message}`)
  }

  if (!seeds || seeds.length === 0) {
    throw new Error('No seeding found. Generate seeding first.')
  }

  // 2. Calcular bracket size (potencia de 2)
  const N = seeds.length
  let P = 1
  while (P < N) {
    P *= 2
  }

  console.log(`[generateBracketFromSeeding] Creating bracket: ${N} couples, ${P} positions, ${P - N} BYEs`)

  /**
   * Crea las relaciones padre-hijo para el avance automático de ganadores
   */
  function createMatchHierarchy(
    matches: any[],
    rounds: string[],
    tournamentId: string
  ): any[] {
    console.log(`[createMatchHierarchy] 🔗 Creating hierarchy for ${matches.length} matches across ${rounds.length} rounds`)

    const hierarchy: any[] = []

    // Agrupar matches por round
    const matchesByRound: { [round: string]: any[] } = {}
    matches.forEach(match => {
      if (!matchesByRound[match.round]) {
        matchesByRound[match.round] = []
      }
      matchesByRound[match.round].push(match)
    })

    // Log matches por round
    console.log(`[createMatchHierarchy] 📊 Matches by round:`)
    Object.keys(matchesByRound).forEach(round => {
      console.log(`  ${round}: ${matchesByRound[round].length} matches`)
    })

    // Crear relaciones para cada par de rounds consecutivos
    for (let i = 0; i < rounds.length - 1; i++) {
      const childRound = rounds[i]      // ej: '4TOS'
      const parentRound = rounds[i + 1] // ej: 'SEMIFINAL'

      const childMatches = matchesByRound[childRound] || []
      const parentMatches = matchesByRound[parentRound] || []

      console.log(`[createMatchHierarchy] 🔄 Mapping ${childRound} (${childMatches.length}) → ${parentRound} (${parentMatches.length})`)

      // Mapear child matches a parent matches
      childMatches.forEach((childMatch, childIndex) => {
        const parentIndex = Math.floor(childIndex / 2)
        const parentSlot = (childIndex % 2) + 1 // 1 o 2

        if (parentMatches[parentIndex]) {
          const relation = {
            parent_match_id: parentMatches[parentIndex].id,
            child_match_id: childMatch.id,
            parent_slot: parentSlot,
            tournament_id: tournamentId,
            parent_round: parentRound,
            child_round: childRound
          }

          hierarchy.push(relation)
          console.log(`[createMatchHierarchy]   Child ${childIndex + 1} → Parent ${parentIndex + 1} (slot ${parentSlot})`)
        } else {
          console.warn(`[createMatchHierarchy] ⚠️ No parent match found for child ${childIndex} in round ${childRound}`)
        }
      })
    }

    console.log(`[createMatchHierarchy] ✅ Created ${hierarchy.length} hierarchy relations`)
    return hierarchy
  }

  // 3. Crear estructura de bracket por rounds
  const rounds = ['32VOS', '16VOS', '8VOS', '4TOS', 'SEMIFINAL', 'FINAL']
  const roundsNeeded = Math.ceil(Math.log2(P))
  const activeRounds = rounds.slice(-roundsNeeded)

  console.log(`[generateBracketFromSeeding] Rounds needed: ${roundsNeeded}, Active rounds:`, activeRounds)

  // 4. Limpiar jerarquia y matches existentes
  const { error: hierarchyDeleteError } = await supabase
    .from('match_hierarchy')
    .delete()
    .eq('tournament_id', tournamentId)

  if (hierarchyDeleteError) {
    throw new Error(`Error deleting existing match hierarchy: ${hierarchyDeleteError.message}`)
  }

  const { error: deleteError } = await supabase
    .from('matches')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('type', 'ELIMINATION')

  if (deleteError) {
    throw new Error(`Error deleting existing matches: ${deleteError.message}`)
  }

  // 5. Generar matches de primera ronda
  const firstRoundMatches = []
  const firstRound = activeRounds[0]

  // Crear array de posiciones con BYEs
  const positions = Array(P).fill(null)
  seeds.forEach((seed: any) => {
    positions[seed.bracket_position - 1] = seed.couple_id
  })

  // Generar pares de primera ronda
  for (let i = 0; i < P; i += 2) {
    const couple1_id = positions[i] || null
    const couple2_id = positions[i + 1] || null

    // Si ambos son null, saltar
    if (!couple1_id && !couple2_id) continue

    // Si uno es null, es BYE - el otro avanza automáticamente
    let winner_id = null
    let status = 'PENDING'

    if (!couple1_id && couple2_id) {
      winner_id = couple2_id
      status = 'FINISHED'
    } else if (couple1_id && !couple2_id) {
      winner_id = couple1_id
      status = 'FINISHED'
    }

    firstRoundMatches.push({
      tournament_id: tournamentId,
      couple1_id: couple1_id,
      couple2_id: couple2_id,
      round: firstRound,
      type: 'ELIMINATION',
      status: status,
      winner_id: winner_id,
      order_in_round: Math.floor(i / 2) + 1,
      created_at: new Date().toISOString()
    })
  }

  // 6. Generar matches de rounds siguientes (placeholders)
  const allMatches = [...firstRoundMatches]
  let currentRoundMatches = firstRoundMatches.length

  for (let roundIndex = 1; roundIndex < activeRounds.length; roundIndex++) {
    const round = activeRounds[roundIndex]
    const nextRoundMatches = Math.ceil(currentRoundMatches / 2)

    for (let i = 0; i < nextRoundMatches; i++) {
      allMatches.push({
        tournament_id: tournamentId,
        couple1_id: null,
        couple2_id: null,
        round: round,
        type: 'ELIMINATION',
        status: 'PENDING',
        winner_id: null,
        order_in_round: i + 1,
        created_at: new Date().toISOString()
      })
    }

    currentRoundMatches = nextRoundMatches
  }

  // 7. Insertar matches en base de datos
  const { data: insertedMatches, error: insertError } = await supabase
    .from('matches')
    .insert(allMatches)
    .select()

  if (insertError) {
    throw new Error(`Error inserting matches: ${insertError.message}`)
  }

  console.log(`[generateBracketFromSeeding] ✅ Created ${insertedMatches?.length || 0} matches`)

  // 8. Crear jerarquía de matches para avance automático
  console.log(`[generateBracketFromSeeding] 🔗 Starting match hierarchy creation...`)
  const hierarchyData = createMatchHierarchy(insertedMatches || [], activeRounds, tournamentId)

  if (hierarchyData.length > 0) {
    const { error: hierarchyError } = await supabase
      .from('match_hierarchy')
      .insert(hierarchyData)

    if (hierarchyError) {
      throw new Error(`Error creating match hierarchy: ${hierarchyError.message}`)
    }

    console.log(`[generateBracketFromSeeding] ✅ Created ${hierarchyData.length} hierarchy relations`)
    console.log(`[generateBracketFromSeeding] 🎯 Automatic advancement enabled: BYEs and winners will advance automatically`)

    // 9. Procesar BYEs automáticamente después de crear jerarquía
    console.log(`[generateBracketFromSeeding] 🚀 Processing initial BYE advancement...`)
    const byeResults = await processInitialByeMatches(supabase, tournamentId, insertedMatches || [])
    console.log(`[generateBracketFromSeeding] ✅ Processed ${byeResults.processedCount}/${byeResults.totalByes} BYEs automatically`)

  } else {
    console.log(`[generateBracketFromSeeding] ⚠️ No hierarchy relations needed (single round tournament)`)
  }

  // 10. Actualizar estado del torneo
  const { error: updateError } = await supabase
    .from('tournaments')
    .update({
      bracket_status: 'BRACKET_GENERATED',
      status: 'BRACKET_PHASE',
      bracket_generated_at: new Date().toISOString()
    })
    .eq('id', tournamentId)

  if (updateError) {
    throw new Error(`Error updating tournament bracket status: ${updateError.message}`)
  }

  console.log(`[generateBracketFromSeeding] 🎉 Success: Hybrid-Serpentino bracket completed`)
  console.log(`[generateBracketFromSeeding] 📊 Summary:`)
  console.log(`  - Matches created: ${insertedMatches?.length || 0}`)
  console.log(`  - Hierarchy relations: ${hierarchyData.length}`)
  console.log(`  - Bracket size: ${P} (${N} couples + ${P - N} BYEs)`)
  console.log(`  - Active rounds: ${activeRounds.join(' → ')}`)
  console.log(`  - Auto-advance: ${hierarchyData.length > 0 ? 'ENABLED ✅' : 'DISABLED ❌'}`)

  return {
    success: true,
    message: `Hybrid-Serpentino bracket generated successfully with automatic advancement`,
    matchesCreated: insertedMatches?.length || 0,
    hierarchyRelations: hierarchyData.length,
    rounds: activeRounds,
    firstRoundPairs: firstRoundMatches.length,
    totalPairs: allMatches.length,
    algorithm: 'hybrid-serpentino',
    bracket_size: P,
    byes: P - N,
    autoAdvanceEnabled: hierarchyData.length > 0,
    guarantees: [
      '1A and 1B can only meet in finals',
      'Seed 1 position 1, perfect balance',
      'Automatic BYE and winner advancement',
      'Complete database population'
    ]
  }
}

/**
 * Procesa matches con BYE automáticamente
 */
async function processInitialByeMatches(
  supabase: any,
  tournamentId: string,
  matches: any[]
): Promise<{ processedCount: number; totalByes: number; errors: string[] }> {

  // Filtrar SOLO matches que fueron creados como BYE (FINISHED desde origen)
  const originalByeMatches = matches.filter(m =>
    m.status === 'FINISHED' &&
    m.winner_id &&
    (!m.couple1_id || !m.couple2_id)  // Uno de los dos es NULL
  )

  console.log(`[processInitialByeMatches] Found ${originalByeMatches.length} BYE matches to process`)

  let processedCount = 0
  const errors: string[] = []

  // Procesar cada BYE original secuencialmente para evitar conflictos
  for (const byeMatch of originalByeMatches) {
    try {
      console.log(`[processInitialByeMatches] Processing BYE: ${byeMatch.id} winner: ${byeMatch.winner_id}`)

      const result = await advanceWinnerUsingHierarchy(
        supabase,
        tournamentId,
        byeMatch.id,
        byeMatch.winner_id,
        'initial_bye'  // Marcar como BYE original
      )

      if (result.success) {
        processedCount++
        console.log(`[processInitialByeMatches] ✅ BYE processed: ${result.message}`)
      } else {
        errors.push(`Match ${byeMatch.id}: ${result.error}`)
        console.warn(`[processInitialByeMatches] ⚠️ BYE failed: ${result.error}`)
      }

      // Pequeña pausa para evitar race conditions
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error: any) {
      errors.push(`Match ${byeMatch.id}: ${error.message}`)
      console.error(`[processInitialByeMatches] Error processing BYE:`, error)
    }
  }

  console.log(`[processInitialByeMatches] Summary: ${processedCount}/${originalByeMatches.length} BYEs processed`)
  if (errors.length > 0) {
    console.warn(`[processInitialByeMatches] Errors encountered:`, errors)
  }

  return {
    processedCount,
    totalByes: originalByeMatches.length,
    errors
  }
}
