import { createHash } from "node:crypto"
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"

// Copies one tournament's operational graph from a remote Supabase project to the
// local Docker database. UUIDs are intentionally preserved: bracket references are
// then identical to production and are useful for reproducing defects.
const args = process.argv.slice(2)
const has = (name) => args.includes(name)
const arg = (name, fallback = "") => args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback
const tournamentId = arg("--tournament-id")
const sourceEnv = arg("--source-env")
const container = arg("--dest-container", "supabase_db_padel-base-main-test")
const apply = has("--apply")

if (has("--help") || !tournamentId || !sourceEnv) {
  console.log(`Uso:
  npx tsx scripts/clone_tournament_to_local.mjs --tournament-id=<uuid> --source-env=<archivo.env> [--apply] [--dest-container=<docker>]

Por defecto solo analiza. --apply escribe exclusivamente en el Postgres local del contenedor Docker.
No migra auth.users ni secretos de login. Las referencias de auditoría a usuarios se anonimizan.`)
  process.exitCode = tournamentId && sourceEnv ? 0 : 1
  if (!tournamentId || !sourceEnv) process.exit()
}
if (!existsSync(sourceEnv)) throw new Error(`No existe --source-env: ${sourceEnv}`)

const envValues = (name) => readFileSync(sourceEnv, "utf8").split(/\r?\n/).flatMap((line) => {
  const found = line.replace(/^#\s*/, "").match(new RegExp(`^\\s*${name}=(.*)$`))
  return found ? [found[1].trim().replace(/^['"]|['"]$/g, "")] : []
})
const sourceUrl = arg("--source-url") || envValues("NEXT_PUBLIC_SUPABASE_URL").find((value) => {
  const host = new URL(value).hostname
  return host !== "localhost" && host !== "127.0.0.1" && host !== "::1"
})
const sourceKey = arg("--source-service-key") || envValues("SUPABASE_SERVICE_ROLE_KEY")[0] || envValues("SERVICE_ROLE_KEY")[0]
if (!sourceUrl || !sourceKey) throw new Error("El archivo fuente debe tener NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY")
if (new URL(sourceUrl).hostname === "localhost" || new URL(sourceUrl).hostname === "127.0.0.1") throw new Error("La fuente no puede ser localhost")

const source = createClient(sourceUrl, sourceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const unique = (values) => [...new Set(values.filter(Boolean))]
const chunks = (values, size = 150) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size))

const all = async (table, queryBuilder = (query) => query) => {
  const rows = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await queryBuilder(source.from(table).select("*").range(start, start + 999))
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}
const whereIn = async (table, column, ids) => {
  const values = unique(ids)
  if (!values.length) return []
  return (await Promise.all(chunks(values).map((part) => all(table, (query) => query.in(column, part))))).flat()
}
const optionalWhereIn = async (table, column, ids) => {
  try { return await whereIn(table, column, ids) }
  catch (error) {
    if (String(error.message).includes("Could not find the table")) {
      console.warn(`[clone] Tabla opcional ausente en el origen: ${table}`)
      return []
    }
    throw error
  }
}
const getOne = async (table, id) => {
  const { data, error } = await source.from(table).select("*").eq("id", id).maybeSingle()
  if (error) throw new Error(`${table}: ${error.message}`)
  if (!data) throw new Error(`No existe ${table} ${id} en el origen`)
  return data
}

const psql = (sql) => {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `psql failed (${result.status})`)
  return result.stdout.trim()
}
const localRows = (sql) => JSON.parse(psql(`select coalesce(json_agg(row_to_json(x)), '[]'::json) from (${sql}) x`) || "[]")
const columns = () => {
  const out = new Map()
  for (const row of localRows("select table_schema, table_name, column_name from information_schema.columns where table_schema = 'public' and is_generated = 'NEVER' order by ordinal_position")) {
    const key = `${row.table_schema}.${row.table_name}`
    out.set(key, [...(out.get(key) ?? []), row.column_name])
  }
  return out
}
const quoteJson = (rows) => {
  const json = JSON.stringify(rows)
  const tag = `$clone_${createHash("sha1").update(json).digest("hex").slice(0, 12)}$`
  if (json.includes(tag)) throw new Error("Colisión inesperada al serializar JSON")
  return `${tag}${json}${tag}`
}
const insert = (schemaColumns, table, rows, conflict) => {
  if (!rows.length) return `-- ${table}: 0 rows`
  const present = new Set(rows.flatMap(Object.keys))
  const fields = (schemaColumns.get(`public.${table}`) ?? []).filter((field) => present.has(field))
  if (!fields.length) return `-- ${table}: no existe localmente`
  const f = fields.map((field) => `"${field}"`).join(", ")
  const c = conflict.map((field) => `"${field}"`).join(", ")
  const updates = fields.filter((field) => !conflict.includes(field)).map((field) => `"${field}" = excluded."${field}"`).join(", ")
  return `with input_rows as (select ${f} from jsonb_populate_recordset(null::public."${table}", ${quoteJson(rows)}::jsonb)) insert into public."${table}" (${f}) select ${f} from input_rows on conflict (${c}) ${updates ? `do update set ${updates}` : "do nothing"};`
}
const sanitized = (rows, fields) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, fields.has(key) ? null : value])))

const main = async () => {
  // First fetch the roots. Every later fetch derives exclusively from these IDs.
  const tournament = await getOne("tournaments", tournamentId)
  const inscriptions = await all("inscriptions", (q) => q.eq("tournament_id", tournamentId))
  const zones = await all("zones", (q) => q.eq("tournament_id", tournamentId))
  const matches = await all("matches", (q) => q.eq("tournament_id", tournamentId))
  const seeds = await all("tournament_couple_seeds", (q) => q.eq("tournament_id", tournamentId))
  const fechas = await all("tournament_fechas", (q) => q.eq("tournament_id", tournamentId))
  const zoneIds = zones.map((x) => x.id), matchIds = matches.map((x) => x.id), fechaIds = fechas.map((x) => x.id)
  const [zoneCouples, positions, hierarchy, setMatches, matchPoints, matchHistory, placeholders, rankingConfig, playerHistory, rankingSnapshots, disqualifications, payments, clubsTournament] = await Promise.all([
    whereIn("zone_couples", "zone_id", zoneIds), whereIn("zone_positions", "tournament_id", [tournamentId]), whereIn("match_hierarchy", "tournament_id", [tournamentId]), whereIn("set_matches", "match_id", matchIds), whereIn("match_points_couples", "match_id", matchIds), optionalWhereIn("match_results_history", "tournament_id", [tournamentId]), optionalWhereIn("placeholder_resolutions", "tournament_id", [tournamentId]), optionalWhereIn("tournament_ranking_config", "tournament_id", [tournamentId]), whereIn("player_tournament_history", "tournament_id", [tournamentId]), whereIn("ranking_snapshots", "tournament_id", [tournamentId]), optionalWhereIn("tournament_couple_disqualifications", "tournament_id", [tournamentId]), optionalWhereIn("inscription_payments", "inscription_id", inscriptions.map((x) => x.id)), whereIn("clubes_tournament", "tournament_id", [tournamentId]),
  ])
  const slots = await whereIn("tournament_time_slots", "fecha_id", fechaIds)
  const [fechaMatches, availability] = await Promise.all([whereIn("fecha_matches", "match_id", matchIds), whereIn("couple_time_availability", "time_slot_id", slots.map((x) => x.id))])
  const coupleIds = unique([...inscriptions.map((x) => x.couple_id), ...zoneCouples.map((x) => x.couple_id), ...positions.map((x) => x.couple_id), ...seeds.map((x) => x.couple_id), ...matches.flatMap((x) => [x.couple1_id, x.couple2_id, x.winner_id]), ...setMatches.map((x) => x.winner_couple_id), ...matchPoints.flatMap((x) => [x.winner_couple_id, x.loser_couple_id]), tournament.winner_id])
  const couples = await whereIn("couples", "id", coupleIds)
  const players = await whereIn("players", "id", unique([...inscriptions.map((x) => x.player_id), ...couples.flatMap((x) => [x.player1_id, x.player2_id]), ...playerHistory.map((x) => x.player_id)]))
  const clubIds = unique([tournament.club_id, ...clubsTournament.map((x) => x.club_id), ...matches.map((x) => x.club_id), ...players.map((x) => x.club_id)])
  const clubs = await whereIn("clubes", "id", clubIds)
  const categories = await whereIn("categories", "name", unique([tournament.category_name, ...players.map((x) => x.category_name), ...rankingSnapshots.map((x) => x.category)]))
  const organization = tournament.organization_id ? await getOne("organizaciones", tournament.organization_id) : null
  const servicesClubes = await whereIn("services_clubes", "club_id", clubs.map((x) => x.id))
  const services = await whereIn("services", "id", servicesClubes.map((x) => x.service_id))

  const graph = { tournaments: 1, players: players.length, couples: couples.length, inscriptions: inscriptions.length, zones: zones.length, zone_couples: zoneCouples.length, zone_positions: positions.length, tournament_couple_seeds: seeds.length, matches: matches.length, set_matches: setMatches.length, match_hierarchy: hierarchy.length, tournament_fechas: fechas.length, tournament_time_slots: slots.length, fecha_matches: fechaMatches.length, couple_time_availability: availability.length, match_points_couples: matchPoints.length, match_results_history: matchHistory.length, placeholder_resolutions: placeholders.length, inscription_payments: payments.length, tournament_couple_disqualifications: disqualifications.length, player_tournament_history: playerHistory.length, ranking_snapshots: rankingSnapshots.length }
  console.log("[clone] Grafo preparado:\n" + JSON.stringify(graph, null, 2))
  const existing = localRows(`select id from public.tournaments where id = '${tournamentId.replace(/'/g, "''")}'`)
  if (existing.length) throw new Error(`El torneo ${tournamentId} ya existe localmente. No se modifica un clon previo: reseteá la DB local o elegí otro destino.`)
  if (!apply) return console.log("[clone] Dry-run terminado. Agregá --apply para escribir en Docker local.")
  if (!container.startsWith("supabase_db_")) throw new Error("Guard de seguridad: --dest-container debe ser un contenedor local de Supabase (supabase_db_*)")

  const schemaColumns = columns()
  // Auth is intentionally excluded. It is neither needed to reproduce the tournament
  // graph nor available safely through the Auth Admin API (password hashes are absent).
  const authFields = new Set(["user_id", "organizador_id", "payment_reviewed_by", "reviewed_by", "resolved_by", "reverted_by", "disqualified_by", "cancelled_by_user_id", "authorized_by_user_id"])
  const statements = ["begin;", insert(schemaColumns, "categories", categories, ["name"]), insert(schemaColumns, "services", services, ["id"]), insert(schemaColumns, "organizaciones", organization ? [sanitized([organization], new Set(["featured_club_id"]))[0]] : [], ["id"]), insert(schemaColumns, "clubes", sanitized(clubs, new Set(["user_id"])), ["id"]), insert(schemaColumns, "services_clubes", servicesClubes, ["service_id", "club_id"]), insert(schemaColumns, "players", sanitized(players, new Set(["user_id", "organizador_id"])), ["id"]), insert(schemaColumns, "couples", couples, ["id"]), insert(schemaColumns, "tournaments", sanitized([tournament], new Set(["organizador_id"])), ["id"]), insert(schemaColumns, "clubes_tournament", clubsTournament, ["id"]), insert(schemaColumns, "inscriptions", sanitized(inscriptions, authFields), ["id"]), insert(schemaColumns, "zones", zones, ["id"]), insert(schemaColumns, "zone_couples", zoneCouples, ["zone_id", "couple_id"]), insert(schemaColumns, "zone_positions", positions, ["id"]), insert(schemaColumns, "tournament_fechas", fechas, ["id"]), insert(schemaColumns, "tournament_time_slots", slots, ["id"]), insert(schemaColumns, "couple_time_availability", sanitized(availability, authFields), ["id"]), insert(schemaColumns, "tournament_couple_seeds", seeds, ["id"]), insert(schemaColumns, "matches", matches, ["id"]), insert(schemaColumns, "match_hierarchy", hierarchy, ["id"]), insert(schemaColumns, "fecha_matches", fechaMatches, ["id"]), insert(schemaColumns, "set_matches", setMatches, ["id"]), insert(schemaColumns, "match_points_couples", matchPoints, ["id"]), insert(schemaColumns, "match_results_history", sanitized(matchHistory, authFields), ["id"]), insert(schemaColumns, "placeholder_resolutions", sanitized(placeholders, authFields), ["id"]), insert(schemaColumns, "inscription_payments", payments, ["id"]), insert(schemaColumns, "tournament_ranking_config", rankingConfig, ["id"]), insert(schemaColumns, "tournament_couple_disqualifications", sanitized(disqualifications, authFields), ["id"]), insert(schemaColumns, "player_tournament_history", playerHistory, ["id"]), insert(schemaColumns, "ranking_snapshots", rankingSnapshots, ["id"]), "commit;"]
  const path = `scripts/.clone_tournament_${Date.now()}.sql`, inContainer = `/tmp/clone_tournament_${Date.now()}.sql`
  writeFileSync(path, statements.join("\n"), "utf8")
  try {
    const copy = spawnSync("docker", ["cp", path, `${container}:${inContainer}`], { encoding: "utf8" })
    if (copy.status !== 0) throw new Error(copy.stderr || copy.stdout)
    const run = spawnSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", inContainer], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    if (run.status !== 0) throw new Error(run.stderr || run.stdout)
  } finally { unlinkSync(path); spawnSync("docker", ["exec", container, "rm", "-f", inContainer], { encoding: "utf8" }) }
  const checks = localRows(`select (select count(*) from public.tournaments where id = '${tournamentId}')::int as tournaments, (select count(*) from public.matches where tournament_id = '${tournamentId}')::int as matches, (select count(*) from public.inscriptions where tournament_id = '${tournamentId}')::int as inscriptions, (select count(*) from public.zones where tournament_id = '${tournamentId}')::int as zones`)[0]
  console.log("[clone] Importación transaccional verificada:\n" + JSON.stringify(checks, null, 2))
}
main().catch((error) => { console.error(`[clone] ERROR: ${error.stack || error.message}`); process.exitCode = 1 })
