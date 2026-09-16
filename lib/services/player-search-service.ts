import { supabaseAdmin } from "@/lib/supabase-admin"
import { normalizePlayerDni } from "@/lib/utils/player-dni"
import { levenshteinDistance } from "@/utils/player-dni-utils"

export interface PlayerSearchRecord {
  id: string
  first_name: string | null
  last_name: string | null
  dni: string | null
  phone: string | null
  score: number | null
  category_name: string | null
  gender?: string | null
  profile_image_url?: string | null
  user_id?: string | null
  users?: { email?: string | null } | null
  clubes?: { name?: string | null } | null
}

interface SearchScoredPlayer {
  player: PlayerSearchRecord
  score: number
}

export interface SearchPlayersOptions {
  searchTerm?: string
  page?: number
  pageSize?: number
}

interface SearchOptionsWithPlayers extends SearchPlayersOptions {
  players: PlayerSearchRecord[]
  excludePlayerIds?: string[]
}

const PLAYER_DIRECTORY_SELECT = `
  id,
  first_name,
  last_name,
  dni,
  phone,
  score,
  category_name,
  gender,
  profile_image_url,
  user_id,
  users!players_user_id_fkey(email),
  clubes:club_id(name)
`

const DATABASE_PAGE_SIZE = 1000

function chunkValues<T>(values: T[], size = 500): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function normalizePlayerRelations(player: any): PlayerSearchRecord {
  return {
    ...player,
    users: Array.isArray(player.users) ? player.users[0] : player.users,
    clubes: Array.isArray(player.clubes) ? player.clubes[0] : player.clubes,
  }
}

async function fetchPlayersByIds(playerIds: string[]): Promise<PlayerSearchRecord[]> {
  if (playerIds.length === 0) return []

  const players: PlayerSearchRecord[] = []
  for (const playerIdChunk of chunkValues(playerIds)) {
    const { data, error } = await supabaseAdmin
      .from("players")
      .select(PLAYER_DIRECTORY_SELECT)
      .in("id", playerIdChunk)
      .eq("es_prueba", false)

    if (error) throw error
    players.push(...(data || []).map(normalizePlayerRelations))
  }

  return players
}

async function fetchTournamentDirectoryPlayers(gender?: string | null): Promise<PlayerSearchRecord[]> {
  const players: PlayerSearchRecord[] = []
  let from = 0

  while (true) {
    let query = supabaseAdmin
      .from("players")
      .select(PLAYER_DIRECTORY_SELECT)
      .eq("es_prueba", false)
      .order("id", { ascending: true })
      .range(from, from + DATABASE_PAGE_SIZE - 1)

    if (gender) query = query.eq("gender", gender)

    const { data, error } = await query
    if (error) throw error

    const page = (data || []).map(normalizePlayerRelations)
    players.push(...page)
    if (page.length < DATABASE_PAGE_SIZE) break
    from += DATABASE_PAGE_SIZE
  }

  return players
}

async function getOrganizationParticipantIds(organizationId: string): Promise<string[]> {
  const { data: tournaments, error: tournamentsError } = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .eq("organization_id", organizationId)

  if (tournamentsError) throw tournamentsError

  const tournamentIds = (tournaments || []).map((tournament: any) => tournament.id)
  if (tournamentIds.length === 0) return []

  const playerIds = new Set<string>()
  const coupleIds = new Set<string>()

  for (const tournamentIdChunk of chunkValues(tournamentIds)) {
    const { data: inscriptions, error: inscriptionsError } = await supabaseAdmin
      .from("inscriptions")
      .select("player_id, couple_id")
      .in("tournament_id", tournamentIdChunk)

    if (inscriptionsError) throw inscriptionsError

    for (const inscription of inscriptions || []) {
      if (inscription.player_id) playerIds.add(inscription.player_id)
      if (inscription.couple_id) coupleIds.add(inscription.couple_id)
    }
  }

  for (const coupleIdChunk of chunkValues(Array.from(coupleIds))) {
    const { data: couples, error: couplesError } = await supabaseAdmin
      .from("couples")
      .select("player1_id, player2_id")
      .in("id", coupleIdChunk)

    if (couplesError) throw couplesError

    for (const couple of couples || []) {
      if (couple.player1_id) playerIds.add(couple.player1_id)
      if (couple.player2_id) playerIds.add(couple.player2_id)
    }
  }

  return Array.from(playerIds)
}

function removeAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function normalizeName(value?: string | null): string {
  if (!value) return ""
  return removeAccents(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeSearchTerm(value?: string): string {
  if (!value) return ""
  return normalizeName(value)
}

function tokenize(value: string): string[] {
  return value.split(" ").map((token) => token.trim()).filter(Boolean)
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  const distance = levenshteinDistance(left, right)
  const maxLen = Math.max(left.length, right.length)
  if (!maxLen) return 0
  return (maxLen - distance) / maxLen
}

function isAdjacentTransposition(left: string, right: string): boolean {
  if (left.length !== right.length || left.length < 2) return false

  const differentIndexes: number[] = []
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) differentIndexes.push(index)
    if (differentIndexes.length > 2) return false
  }

  if (differentIndexes.length !== 2) return false
  const [first, second] = differentIndexes
  return second === first + 1
    && left[first] === right[second]
    && left[second] === right[first]
}

function tokenMatches(token: string, textTokens: string[]): boolean {
  if (!token || textTokens.length === 0) return false

  for (const textToken of textTokens) {
    if (!textToken) continue
    if (textToken.includes(token) || token.includes(textToken)) return true
    if (isAdjacentTransposition(token, textToken)) return true
    if (token.length >= 4 && textToken.length >= 4 && similarity(token, textToken) >= 0.84) return true
    if (Math.min(token.length, textToken.length) >= 3 && levenshteinDistance(token, textToken) <= 1) return true
  }

  return false
}

function normalizeDniLoose(value?: string | null): string {
  return (value || "").replace(/\D/g, "")
}

function isLikelyDniSearch(normalizedSearch: string): boolean {
  return /^[0-9]{3,}$/.test(normalizedSearch.replace(/\s+/g, ""))
}

function scorePlayerMatch(player: PlayerSearchRecord, normalizedSearch: string, searchTokens: string[]): number {
  if (!normalizedSearch) return 0

  const firstName = normalizeName(player.first_name)
  const lastName = normalizeName(player.last_name)
  const fullName = `${firstName} ${lastName}`.trim()
  const reverseName = `${lastName} ${firstName}`.trim()
  const dniDigits = normalizeDniLoose(player.dni)
  const normalizedDniSearch = normalizeDniLoose(normalizedSearch)
  const nameTokens = tokenize(fullName)

  let score = 0

  if (normalizedDniSearch && dniDigits) {
    if (dniDigits === normalizedDniSearch) score = Math.max(score, 1.2)
    else if (dniDigits.startsWith(normalizedDniSearch)) score = Math.max(score, 1.05)
    else if (dniDigits.includes(normalizedDniSearch)) score = Math.max(score, 0.9)
  }

  if (firstName.includes(normalizedSearch)) score = Math.max(score, 0.95)
  if (lastName.includes(normalizedSearch)) score = Math.max(score, 0.95)
  if (fullName.includes(normalizedSearch) || reverseName.includes(normalizedSearch)) score = Math.max(score, 1.0)

  const exactWordMatches = searchTokens.filter((token) => nameTokens.includes(token)).length
  if (searchTokens.length > 0) {
    const coverage = exactWordMatches / searchTokens.length
    score = Math.max(score, coverage * 0.95)
  }

  const allTokensMatch = searchTokens.length > 0 && searchTokens.every((token) => tokenMatches(token, nameTokens))
  if (allTokensMatch) {
    score = Math.max(score, 0.9 + Math.min(0.08, searchTokens.length * 0.02))
  }

  const fullSimilarity = similarity(normalizedSearch, fullName)
  const reverseSimilarity = similarity(normalizedSearch, reverseName)
  score = Math.max(score, fullSimilarity * 0.92, reverseSimilarity * 0.9)

  return Math.min(score, 1.25)
}

export function applyRobustPlayerSearch({
  players,
  searchTerm,
  page = 1,
  pageSize = 20,
  excludePlayerIds = [],
}: SearchOptionsWithPlayers) {
  const safePage = Math.max(1, page)
  const safePageSize = Math.max(1, Math.min(200, pageSize))
  const normalizedSearch = normalizeSearchTerm(searchTerm)
  const searchTokens = tokenize(normalizedSearch)
  const likelyDni = isLikelyDniSearch(normalizedSearch)

  const excludedIds = new Set(excludePlayerIds)
  let scored: SearchScoredPlayer[] = players
    .filter((player) => !excludedIds.has(player.id))
    .map((player) => ({ player, score: 0 }))

  if (normalizedSearch) {
    scored = scored
      .map((entry) => ({
        ...entry,
        score: scorePlayerMatch(entry.player, normalizedSearch, searchTokens),
      }))
      .filter((entry) => {
        if (entry.score <= 0) return false
        if (likelyDni) return entry.score >= 0.85
        return entry.score >= 0.75
      })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aScore = a.player.score ?? -1
    const bScore = b.player.score ?? -1
    if (bScore !== aScore) return bScore - aScore
    const aName = `${a.player.first_name || ""} ${a.player.last_name || ""}`.trim()
    const bName = `${b.player.first_name || ""} ${b.player.last_name || ""}`.trim()
    return aName.localeCompare(bName, "es")
  })

  const total = scored.length
  const from = (safePage - 1) * safePageSize
  const paginated = scored.slice(from, from + safePageSize).map((entry) => entry.player)

  return {
    players: paginated,
    total,
    totalPages: Math.ceil(total / safePageSize),
    currentPage: safePage,
  }
}

export async function searchPlayersByOrganization({
  organizationId,
  searchTerm,
  page = 1,
  pageSize = 20,
  categoryFilter = "all",
}: {
  organizationId: string
  categoryFilter?: string
} & SearchPlayersOptions) {
  const organizationPlayerIds = await getOrganizationParticipantIds(organizationId)
  const data = await fetchPlayersByIds(organizationPlayerIds)

  const filteredByCategory = (data || []).filter((player: any) =>
    categoryFilter === "all" ? true : player.category_name === categoryFilter
  )

  return applyRobustPlayerSearch({
    players: filteredByCategory as PlayerSearchRecord[],
    searchTerm,
    page,
    pageSize,
  })
}

export async function searchPlayersForTournament({
  tournamentId,
  searchTerm,
  page = 1,
  pageSize = 50,
  excludePlayerIds = [],
}: {
  tournamentId: string
  excludePlayerIds?: string[]
} & SearchPlayersOptions) {
  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from("tournaments")
    .select("gender, type")
    .eq("id", tournamentId)
    .single()

  if (tournamentError || !tournament) {
    throw new Error("Torneo no encontrado")
  }

  const allowsAllGenders = tournament.gender === "MIXED" || tournament.gender === "MALE"
  const players = await fetchTournamentDirectoryPlayers(
    allowsAllGenders ? null : tournament.gender,
  )

  return applyRobustPlayerSearch({
    players: players as PlayerSearchRecord[],
    searchTerm,
    page,
    pageSize,
    excludePlayerIds,
  })
}

export async function searchAdminPlayers({
  searchTerm,
  page = 1,
  pageSize = 50,
}: SearchPlayersOptions) {
  const normalizedSearch = normalizeSearchTerm(searchTerm)
  const tokens = tokenize(normalizedSearch)
  const normalizedDni = normalizePlayerDni(searchTerm || "")

  let query = supabaseAdmin
    .from("players")
    .select(`
      id,
      first_name,
      last_name,
      dni,
      phone,
      score,
      category_name,
      gender,
      status,
      created_at,
      user_id,
      users!players_user_id_fkey(email)
    `)
    .limit(6000)

  if (normalizedSearch) {
    const orSegments = [
      `first_name.ilike.%${normalizedSearch}%`,
      `last_name.ilike.%${normalizedSearch}%`,
      `dni.ilike.%${normalizedSearch}%`,
    ]

    for (const token of tokens) {
      orSegments.push(`first_name.ilike.%${token}%`)
      orSegments.push(`last_name.ilike.%${token}%`)
      orSegments.push(`dni.ilike.%${token}%`)
    }

    if (normalizedDni.dni) {
      orSegments.push(`dni.ilike.${normalizedDni.dni}%`)
    }

    query = query.or(orSegments.join(","))
  }

  const { data, error } = await query
  if (error) throw error

  const result = applyRobustPlayerSearch({
    players: (data || []) as PlayerSearchRecord[],
    searchTerm,
    page,
    pageSize,
  })

  return result
}
