export interface CategoryRange {
  name: string
  level: number | null
  initial_score: number
}

export type TournamentCategoryConfig =
  | {
      mode: "SINGLE"
      category: string
      validationEnabled?: boolean
    }
  | {
      mode: "RANGE"
      categoryA: string
      categoryB: string
      validationEnabled?: boolean
    }
  | {
      mode: "MIXED_SUM"
      targetSum: number
      mixedPairRequired?: boolean
      validationEnabled?: boolean
    }

interface TournamentCategorySource {
  category_name?: string | null
  category_config?: unknown
}

interface CategorizePlayerForTournamentParams {
  playerId: string
  supabase: any
  tournament: TournamentCategorySource
}

interface CreateInitialPlayerProfileParams {
  supabase: any
  tournament: TournamentCategorySource
}

export const isTournamentCategoryConfig = (value: unknown): value is TournamentCategoryConfig => {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Record<string, unknown>

  if (candidate.mode === "SINGLE") {
    return typeof candidate.category === "string" && candidate.category.trim().length > 0
  }

  if (candidate.mode === "RANGE") {
    return (
      typeof candidate.categoryA === "string" &&
      candidate.categoryA.trim().length > 0 &&
      typeof candidate.categoryB === "string" &&
      candidate.categoryB.trim().length > 0
    )
  }

  if (candidate.mode === "MIXED_SUM") {
    return typeof candidate.targetSum === "number" && Number.isFinite(candidate.targetSum)
  }

  return false
}

export const parseTournamentCategoryConfig = (value: unknown): TournamentCategoryConfig | null => {
  if (!isTournamentCategoryConfig(value)) {
    return null
  }

  if (value.mode === "SINGLE") {
    return {
      mode: "SINGLE",
      category: value.category.trim(),
      validationEnabled: value.validationEnabled ?? false,
    }
  }

  if (value.mode === "RANGE") {
    return {
      mode: "RANGE",
      categoryA: value.categoryA.trim(),
      categoryB: value.categoryB.trim(),
      validationEnabled: value.validationEnabled ?? false,
    }
  }

  return {
    mode: "MIXED_SUM",
    targetSum: value.targetSum,
    mixedPairRequired: value.mixedPairRequired ?? true,
    validationEnabled: value.validationEnabled ?? false,
  }
}

export const buildLegacyTournamentCategoryConfig = (
  categoryName?: string | null,
): TournamentCategoryConfig | null => {
  if (!categoryName?.trim()) {
    return null
  }

  return {
    mode: "SINGLE",
    category: categoryName.trim(),
    validationEnabled: false,
  }
}

export const resolveTournamentCategoryConfig = (
  tournament: TournamentCategorySource,
): TournamentCategoryConfig | null => {
  const parsedConfig = parseTournamentCategoryConfig(tournament.category_config)
  if (parsedConfig) {
    return parsedConfig
  }

  return buildLegacyTournamentCategoryConfig(tournament.category_name)
}

export const buildTournamentCategoryLabel = (config: TournamentCategoryConfig): string => {
  if (config.mode === "SINGLE") {
    return config.category
  }

  if (config.mode === "RANGE") {
    return `${config.categoryA}-${config.categoryB}`
  }

  return `Suma ${config.targetSum}`
}

export const parseCategoryNumber = (categoryName: string): number | null => {
  const match = categoryName.trim().match(/^(\d+)/)
  if (!match) {
    return null
  }

  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

export const getCategoryByName = (
  categories: CategoryRange[],
  categoryName: string,
): CategoryRange | null => {
  return categories.find((category) => category.name === categoryName) ?? null
}

export const areCategoriesConsecutive = (
  categories: CategoryRange[],
  categoryAName: string,
  categoryBName: string,
): boolean => {
  const sortedNames = categories.map((category) => category.name)
  const firstIndex = sortedNames.indexOf(categoryAName)
  const secondIndex = sortedNames.indexOf(categoryBName)

  if (firstIndex === -1 || secondIndex === -1) {
    return false
  }

  return Math.abs(firstIndex - secondIndex) === 1
}

export const getAvailableMixedSumTargets = (categories: CategoryRange[]): number[] => {
  const categoryNumbers = categories
    .map((category) => parseCategoryNumber(category.name))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)

  const uniqueTargets = new Set<number>()

  for (let index = 0; index < categoryNumbers.length; index += 1) {
    for (let secondIndex = index; secondIndex < categoryNumbers.length; secondIndex += 1) {
      uniqueTargets.add(categoryNumbers[index] + categoryNumbers[secondIndex])
    }
  }

  return Array.from(uniqueTargets).sort((a, b) => a - b)
}

/** Resolves the sporting category directly from the format, independently of points. */
export const resolveCategoryFromConfig = (
  config: TournamentCategoryConfig,
  categories: CategoryRange[],
): CategoryRange => {
  if (config.mode === 'SINGLE') {
    const category = getCategoryByName(categories, config.category)
    if (!category) throw new Error('La categoría elegida no existe.')
    return category
  }
  if (config.mode === 'RANGE') {
    const first = getCategoryByName(categories, config.categoryA)
    const second = getCategoryByName(categories, config.categoryB)
    if (!first || !second) throw new Error('Revisá las categorías combinadas.')
    return (first.level ?? 0) >= (second.level ?? 0) ? first : second
  }
  const ordered = categories.filter(category => category.level !== null)
    .sort((a, b) => Math.abs(a.level! - config.targetSum / 2) - Math.abs(b.level! - config.targetSum / 2) || b.level! - a.level!)
  const category = ordered.find(candidate => ordered.some(partner => candidate.level! + partner.level! === config.targetSum))
  if (!category) throw new Error('No hay categorías que cumplan la suma del torneo.')
  return category
}

export const resolveInitialScoreFromCategories = (
  config: TournamentCategoryConfig,
  categories: CategoryRange[],
): number => resolveCategoryFromConfig(config, categories).initial_score

export const validateMixedPairGender = (
  tournamentGender: string | null | undefined,
  player1Gender: string | null | undefined,
  player2Gender: string | null | undefined,
): { success: boolean; error?: string } => {
  const normalizedTournamentGender = (tournamentGender ?? "").toUpperCase()
  const normalizedPlayer1Gender = (player1Gender ?? "").toUpperCase()
  const normalizedPlayer2Gender = (player2Gender ?? "").toUpperCase()

  if (normalizedTournamentGender === "FEMALE") {
    if (normalizedPlayer1Gender !== "FEMALE" || normalizedPlayer2Gender !== "FEMALE") {
      return { success: false, error: "Es un torneo femenino, ambas jugadoras deben ser femeninas." }
    }
  }

  if (normalizedTournamentGender === "MIXED") {
    const isStrictMixedPair =
      (normalizedPlayer1Gender === "MALE" && normalizedPlayer2Gender === "FEMALE") ||
      (normalizedPlayer1Gender === "FEMALE" && normalizedPlayer2Gender === "MALE")

    if (!isStrictMixedPair) {
      return { success: false, error: "Es un torneo mixto, la pareja debe ser 1 hombre y 1 mujer." }
    }
  }

  return { success: true }
}

export const validateCategoryCombination = (
  config: TournamentCategoryConfig | null,
  player1CategoryName: string | null | undefined,
  player2CategoryName: string | null | undefined,
): { success: boolean; error?: string; skipped?: boolean } => {
  if (!config || !config.validationEnabled) {
    return { success: true, skipped: true }
  }

  if (!player1CategoryName || !player2CategoryName) {
    return { success: false, error: "Falta categoría de uno de los jugadores para validar la inscripción." }
  }

  if (config.mode === "SINGLE") {
    if (player1CategoryName !== config.category || player2CategoryName !== config.category) {
      return { success: false, error: `Ambos jugadores deben pertenecer a ${config.category}.` }
    }

    return { success: true }
  }

  if (config.mode === "RANGE") {
    const allowedCategories = new Set([config.categoryA, config.categoryB])

    if (!allowedCategories.has(player1CategoryName) || !allowedCategories.has(player2CategoryName)) {
      return {
        success: false,
        error: `La pareja debe estar compuesta por jugadores de ${config.categoryA} o ${config.categoryB}.`,
      }
    }

    return { success: true }
  }

  const player1CategoryNumber = parseCategoryNumber(player1CategoryName)
  const player2CategoryNumber = parseCategoryNumber(player2CategoryName)

  if (player1CategoryNumber === null || player2CategoryNumber === null) {
    return {
      success: false,
      error: "No se pudo interpretar una de las categorías de la pareja para validar la suma.",
    }
  }

  if (player1CategoryNumber + player2CategoryNumber !== config.targetSum) {
    return { success: false, error: `La pareja no cumple la regla de Suma ${config.targetSum}.` }
  }

  return { success: true }
}

export const fetchOrderedCategories = async (supabase: any): Promise<CategoryRange[]> => {
  const { data, error } = await supabase
    .from("categories")
    .select("name, level, initial_score")
    .order("level", { ascending: false })

  if (error) {
    throw new Error(`No se pudieron obtener las categorías: ${error.message}`)
  }

  return (data ?? []) as CategoryRange[]
}

export const resolveInitialPlayerProfile = async ({
  supabase,
  tournament,
}: CreateInitialPlayerProfileParams): Promise<{
  score: number
  categoryName: string
  config: TournamentCategoryConfig
  displayLabel: string
}> => {
  const config = resolveTournamentCategoryConfig(tournament)

  if (!config) {
    throw new Error("El torneo no tiene configuración de categoría disponible")
  }

  const categories = await fetchOrderedCategories(supabase)
  const initialScore = resolveInitialScoreFromCategories(config, categories)
  const resolvedCategory = resolveCategoryFromConfig(config, categories)

  if (!resolvedCategory) {
    throw new Error(`No existe una categoría válida para ${initialScore} puntos iniciales`)
  }

  return {
    score: initialScore,
    categoryName: resolvedCategory.name,
    config,
    displayLabel: buildTournamentCategoryLabel(config),
  }
}

export const resolvePersistedTournamentCategoryName = (
  config: TournamentCategoryConfig,
  categories: CategoryRange[],
): string => {
  return resolveCategoryFromConfig(config, categories).name
}

export const getTournamentCategoryDisplay = (tournament: TournamentCategorySource): string | null => {
  const config = resolveTournamentCategoryConfig(tournament)

  if (config) {
    return buildTournamentCategoryLabel(config)
  }

  return tournament.category_name?.trim() || null
}

export const categorizePlayerForTournament = async ({
  playerId,
  supabase,
  tournament,
}: CategorizePlayerForTournamentParams): Promise<{
  success: boolean
  message: string
  alreadyCategorized?: boolean
  wasCategorized?: boolean
  newScore?: number
  categoryName?: string
  tournamentCategoryLabel?: string
}> => {
  try {
    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .select("id, first_name, last_name, score, is_categorized, category_name")
      .eq("id", playerId)
      .single()

    if (playerError) {
      console.error("[categorizePlayerForTournament] Error fetching player:", playerError)
      return { success: false, message: "Error al obtener información del jugador" }
    }

    if (!playerData) {
      return { success: false, message: "Jugador no encontrado" }
    }

    const hasAssignedScore = playerData.score !== null && playerData.score !== undefined
    const hasAssignedCategory = typeof playerData.category_name === "string" && playerData.category_name.trim().length > 0
    const isAlreadyCategorized = playerData.is_categorized === true && hasAssignedScore && hasAssignedCategory

    if (isAlreadyCategorized) {
      return { success: true, message: "Jugador ya categorizado", alreadyCategorized: true }
    }

    const initialProfile = await resolveInitialPlayerProfile({ supabase, tournament })

    const { error: updateError } = await supabase
      .from("players")
      .update({
        score: initialProfile.score,
        category_name: initialProfile.categoryName,
        is_categorized: true,
      })
      .eq("id", playerId)

    if (updateError) {
      console.error("[categorizePlayerForTournament] Error updating player:", updateError)
      return { success: false, message: "Error al actualizar el jugador" }
    }

    return {
      success: true,
      message: "Jugador categorizado exitosamente",
      wasCategorized: true,
      newScore: initialProfile.score,
      categoryName: initialProfile.categoryName,
      tournamentCategoryLabel: initialProfile.displayLabel,
    }
  } catch (error) {
    console.error("[categorizePlayerForTournament] Unexpected error:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Error inesperado al categorizar jugador",
    }
  }
}
