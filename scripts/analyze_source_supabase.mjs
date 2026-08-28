import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const envPath = process.argv[2]

if (!envPath) {
  throw new Error("Uso: node scripts/analyze_source_supabase.mjs .env.padel-fv.local")
}

const envText = readFileSync(envPath, "utf8")

const getEnvValues = (name) =>
  envText
    .split(/\r?\n/)
    .map((line) => line.replace(/^#\s*/, ""))
    .filter((line) => line.startsWith(`${name}=`))
    .map((line) => line.split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/g, ""))

const sourceUrl = getEnvValues("NEXT_PUBLIC_SUPABASE_URL").find((value) => {
  const host = new URL(value).hostname
  return host !== "localhost" && host !== "127.0.0.1" && host !== "::1"
})
const serviceRoleKey =
  getEnvValues("SUPABASE_SERVICE_ROLE_KEY")[0] || getEnvValues("SERVICE_ROLE_KEY")[0]

if (!sourceUrl || !serviceRoleKey) {
  throw new Error("Missing source Supabase URL or service role key")
}

const supabase = createClient(sourceUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const tables = [
  "organizaciones",
  "organization_members",
  "organization_clubs",
  "clubes",
  "players",
  "couples",
  "inscriptions",
  "tournaments",
  "clubes_tournament",
  "zones",
  "zone_couples",
  "zone_positions",
  "matches",
  "set_matches",
  "tournament_fechas",
  "fecha_matches",
  "tournament_time_slots",
  "couple_time_availability",
  "tournament_couple_seeds",
  "match_hierarchy",
  "match_points_couples",
  "player_tournament_history",
  "ranking_snapshots",
]

const targetOrgId = process.argv[3] || "10c62a15-2ee4-44b8-9a23-016ef2183205"

const countTable = async (table) => {
  const { count, error } = await supabase.from(table).select("*", {
    count: "exact",
    head: true,
  })

  return { table, count, error: error?.message ?? null }
}

const fetchAll = async (table, select, buildQuery) => {
  const pageSize = 1000
  const rows = []

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (buildQuery) {
      query = buildQuery(query)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(`${table}: ${error.message}`)
    }

    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) {
      return rows
    }
  }
}

const chunk = (items, size) => {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const fetchWhereIn = async (table, select, column, values) => {
  const uniqueValues = [...new Set(values.filter(Boolean))]
  const rows = []

  for (const valueChunk of chunk(uniqueValues, 150)) {
    rows.push(
      ...(await fetchAll(table, select, (query) => query.in(column, valueChunk)))
    )
  }

  return rows
}

const countWhereIn = async (table, column, values) => {
  const uniqueValues = [...new Set(values.filter(Boolean))]
  if (uniqueValues.length === 0) {
    return { table, count: 0, error: null }
  }

  let total = 0
  for (const valueChunk of chunk(uniqueValues, 150)) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(column, valueChunk)

    if (error) {
      return { table, count: null, error: error.message }
    }
    total += count ?? 0
  }

  return { table, count: total, error: null }
}

const main = async () => {
  console.log(JSON.stringify({ sourceHost: new URL(sourceUrl).hostname }))

  const { data: orgs, error: orgError } = await supabase
    .from("organizaciones")
    .select("id,name,slug,email,phone,is_active,created_at")
    .order("created_at", { ascending: false })
    .limit(20)

  console.log(JSON.stringify({ orgs: orgs ?? [], orgError: orgError?.message ?? null }))

  for (const table of tables) {
    console.log(JSON.stringify(await countTable(table)))
  }

  const { data: recentTournaments, error: tournamentsError } = await supabase
    .from("tournaments")
    .select(
      "id,name,organization_id,organizador_id,club_id,status,type,category_name,start_date,created_at"
    )
    .order("created_at", { ascending: false })
    .limit(20)

  console.log(
    JSON.stringify({
      recentTournaments: recentTournaments ?? [],
      tournamentsError: tournamentsError?.message ?? null,
    })
  )

  const orgClubs = await fetchAll(
    "organization_clubs",
    "id,organizacion_id,club_id,created_at",
    (query) => query.eq("organizacion_id", targetOrgId)
  )
  const tournaments = await fetchAll(
    "tournaments",
    "id,name,organization_id,club_id,status,type,category_name,start_date,created_at",
    (query) => query.eq("organization_id", targetOrgId)
  )
  const tournamentIds = tournaments.map((tournament) => tournament.id)
  const directClubIds = [
    ...orgClubs.map((row) => row.club_id),
    ...tournaments.map((tournament) => tournament.club_id),
  ].filter(Boolean)

  const clubesTournament = await fetchWhereIn(
    "clubes_tournament",
    "id,tournament_id,club_id,created_at,updated_at",
    "tournament_id",
    tournamentIds
  )
  const zones = await fetchWhereIn("zones", "id,tournament_id", "tournament_id", tournamentIds)
  const zoneIds = zones.map((zone) => zone.id)

  const inscriptions = await fetchWhereIn(
    "inscriptions",
    "id,tournament_id,player_id,couple_id",
    "tournament_id",
    tournamentIds
  )
  const matches = await fetchWhereIn(
    "matches",
    "id,tournament_id,couple1_id,couple2_id,winner_id,zone_id,club_id,tournament_couple_seed1_id,tournament_couple_seed2_id",
    "tournament_id",
    tournamentIds
  )
  const seeds = await fetchWhereIn(
    "tournament_couple_seeds",
    "id,tournament_id,couple_id,placeholder_zone_id",
    "tournament_id",
    tournamentIds
  )
  const zonePositions = await fetchWhereIn(
    "zone_positions",
    "id,tournament_id,zone_id,couple_id",
    "tournament_id",
    tournamentIds
  )
  const zoneCouples =
    zoneIds.length > 0
      ? await fetchWhereIn("zone_couples", "zone_id,couple_id", "zone_id", zoneIds)
      : []

  const coupleIds = [
    ...inscriptions.map((row) => row.couple_id),
    ...matches.flatMap((row) => [row.couple1_id, row.couple2_id, row.winner_id]),
    ...seeds.map((row) => row.couple_id),
    ...zonePositions.map((row) => row.couple_id),
    ...zoneCouples.map((row) => row.couple_id),
  ].filter(Boolean)

  const couples =
    coupleIds.length > 0
      ? await fetchWhereIn("couples", "id,player1_id,player2_id", "id", coupleIds)
      : []
  const playerIds = [
    ...inscriptions.map((row) => row.player_id),
    ...couples.flatMap((couple) => [couple.player1_id, couple.player2_id]),
  ].filter(Boolean)
  const players =
    playerIds.length > 0
      ? await fetchWhereIn("players", "id,user_id,club_id", "id", playerIds)
      : []
  const clubs = await fetchWhereIn(
    "clubes",
    "id,user_id",
    "id",
    [
      ...directClubIds,
      ...clubesTournament.map((row) => row.club_id),
      ...matches.map((row) => row.club_id),
    ].filter(Boolean)
  )

  const scopedCounts = {
    targetOrgId,
    organization_clubs: orgClubs.length,
    clubes_distinct: new Set([
      ...directClubIds,
      ...clubesTournament.map((row) => row.club_id),
      ...matches.map((row) => row.club_id),
    ].filter(Boolean)).size,
    tournaments: tournaments.length,
    clubes_tournament: clubesTournament.length,
    zones: zones.length,
    zone_couples: zoneCouples.length,
    zone_positions: zonePositions.length,
    inscriptions: inscriptions.length,
    couples_distinct: new Set(coupleIds).size,
    players_distinct: new Set(playerIds).size,
    players_with_user_id: players.filter((player) => player.user_id).length,
    clubes_with_user_id: clubs.filter((club) => club.user_id).length,
    matches: matches.length,
    tournament_couple_seeds: seeds.length,
  }

  const relatedCounts = []
  relatedCounts.push(await countWhereIn("set_matches", "match_id", matches.map((row) => row.id)))
  relatedCounts.push(await countWhereIn("fecha_matches", "match_id", matches.map((row) => row.id)))
  relatedCounts.push(
    await countWhereIn("match_hierarchy", "tournament_id", tournamentIds)
  )
  relatedCounts.push(
    await countWhereIn("match_points_couples", "match_id", matches.map((row) => row.id))
  )
  relatedCounts.push(
    await countWhereIn("tournament_fechas", "tournament_id", tournamentIds)
  )
  const tournamentFechas = await fetchWhereIn(
    "tournament_fechas",
    "id,tournament_id",
    "tournament_id",
    tournamentIds
  )
  relatedCounts.push(
    await countWhereIn("tournament_time_slots", "fecha_id", tournamentFechas.map((row) => row.id))
  )
  const timeSlots = await fetchWhereIn(
    "tournament_time_slots",
    "id,fecha_id",
    "fecha_id",
    tournamentFechas.map((row) => row.id)
  )
  relatedCounts.push(
    await countWhereIn("couple_time_availability", "time_slot_id", timeSlots.map((row) => row.id))
  )
  relatedCounts.push(
    await countWhereIn("player_tournament_history", "tournament_id", tournamentIds)
  )
  relatedCounts.push(
    await countWhereIn("ranking_snapshots", "tournament_id", tournamentIds)
  )

  const statusBreakdown = tournaments.reduce((acc, tournament) => {
    acc[tournament.status ?? "NULL"] = (acc[tournament.status ?? "NULL"] ?? 0) + 1
    return acc
  }, {})
  const typeBreakdown = tournaments.reduce((acc, tournament) => {
    acc[tournament.type ?? "NULL"] = (acc[tournament.type ?? "NULL"] ?? 0) + 1
    return acc
  }, {})

  console.log(JSON.stringify({ scopedCounts, relatedCounts, statusBreakdown, typeBreakdown }))
}

main().catch((error) => {
  console.error(`READ_ERROR:${error.message}`)
  process.exitCode = 1
})
