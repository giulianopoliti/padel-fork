import { createHash } from "node:crypto"
import { readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { spawn, spawnSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"

// The source must always be one of this repository's tenant env files, passed explicitly.
const DEFAULT_SOURCE_ENV = ""
const DEFAULT_SOURCE_ORG_ID = "10c62a15-2ee4-44b8-9a23-016ef2183205"
const DEFAULT_DEST_ORG_ID = "1ee10ee3-8895-4279-8cdb-38a974b88d29"
const DEFAULT_DEST_CONTAINER = "supabase_db_padel-base"

const argv = new Set(process.argv.slice(2))
const getArg = (name, fallback) => {
  const prefix = `${name}=`
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

const APPLY = argv.has("--apply")
const SKIP_BACKUP = argv.has("--skip-backup")
const SOURCE_ENV = getArg("--source-env", DEFAULT_SOURCE_ENV)
const SOURCE_ORG_ID = getArg("--source-org-id", DEFAULT_SOURCE_ORG_ID)
const DEST_ORG_ID = getArg("--dest-org-id", DEFAULT_DEST_ORG_ID)
const DEST_CONTAINER = getArg("--dest-container", DEFAULT_DEST_CONTAINER)
const DEST_DB_URL = getArg("--dest-db-url", process.env.DEST_DATABASE_URL || "")
const DEST_KIND = getArg("--dest-kind", DEST_DB_URL ? "remote" : "local")

const chunk = (items, size) => {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const unique = (values) => [...new Set(values.filter(Boolean))]
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const stableUuid = (value) => {
  const hash = createHash("sha1").update(String(value)).digest("hex")
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join("-")
}

const readEnvValues = (envPath, name) =>
  (envPath ? readFileSync(envPath, "utf8") : "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^#\s*/, ""))
    .filter((line) => line.startsWith(`${name}=`))
    .map((line) => line.split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/g, ""))

const sourceUrl = readEnvValues(SOURCE_ENV, "NEXT_PUBLIC_SUPABASE_URL").find((value) => {
  const host = new URL(value).hostname
  return host !== "localhost" && host !== "127.0.0.1" && host !== "::1"
})
const sourceServiceKey =
  readEnvValues(SOURCE_ENV, "SUPABASE_SERVICE_ROLE_KEY")[0] ||
  readEnvValues(SOURCE_ENV, "SERVICE_ROLE_KEY")[0]

if (!SOURCE_ENV || !sourceUrl || !sourceServiceKey) {
  throw new Error("Usá --source-env=.env.padel-fv.local o --source-env=.env.padel-elite.local con credenciales del tenant correcto")
}

const source = createClient(sourceUrl, sourceServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const runDockerPsql = (sql) => {
  const psqlArgs =
    DEST_KIND === "remote"
      ? ["exec", DEST_CONTAINER, "psql", DEST_DB_URL, "-At", "-c", sql]
      : ["exec", DEST_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql]

  const result = spawnSync(
    "docker",
    psqlArgs,
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
  if (result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout)
  }
  return result.stdout.trim()
}

const localRows = (sql) => {
  const json = runDockerPsql(
    `select coalesce(json_agg(row_to_json(t)), '[]'::json) from (${sql}) t`
  )
  return JSON.parse(json || "[]")
}

const localCountWhereIn = (table, column, values) => {
  let total = 0
  for (const valueChunk of chunk(unique(values), 150)) {
    if (valueChunk.length === 0) {
      continue
    }
    const [{ count }] = localRows(`
      select count(*)::int as count
      from ${table}
      where ${column} in (${valueChunk.map(sqlString).join(",")})
    `)
    total += count ?? 0
  }
  return total
}

const getDestColumns = () => {
  const rows = localRows(`
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema in ('public', 'auth')
      and is_generated = 'NEVER'
    order by table_schema, table_name, ordinal_position
  `)
  const columns = new Map()
  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}`
    if (!columns.has(key)) {
      columns.set(key, [])
    }
    columns.get(key).push(row.column_name)
  }
  return columns
}

const fetchAll = async (table, select = "*", buildQuery) => {
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    let query = source.from(table).select(select).range(from, from + pageSize - 1)
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

const fetchWhereIn = async (table, column, values, select = "*") => {
  const rows = []
  for (const valueChunk of chunk(unique(values), 150)) {
    rows.push(...(await fetchAll(table, select, (query) => query.in(column, valueChunk))))
  }
  return rows
}

const hydrateAuthUsers = async (userIds) => {
  const ids = unique(userIds)
  const users = []
  for (const idChunk of chunk(ids, 10)) {
    const results = await Promise.all(
      idChunk.map(async (id) => {
        const { data, error } = await source.auth.admin.getUserById(id)
        if (error) {
          if (error.status === 404) {
            return null
          }
          throw new Error(`auth.admin.getUserById(${id}): ${error.message}`)
        }
        return data.user ?? null
      })
    )
    users.push(...results.filter(Boolean))
  }
  return users
}

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-")

const sqlString = (value) => {
  if (value === null || value === undefined) {
    return "null"
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

const jsonDollar = (rows) => {
  const json = JSON.stringify(rows)
  const hash = createHash("sha1").update(json).digest("hex").slice(0, 12)
  const tag = `$mig_${hash}$`
  if (json.includes(tag)) {
    throw new Error("Unexpected JSON dollar-quote collision")
  }
  return `${tag}${json}${tag}`
}

const tableRef = (schema, table) => `"${schema}"."${table}"`

const insertStatement = (columnsByTable, schema, table, rows, conflictColumns, options = {}) => {
  if (rows.length === 0) {
    return `-- ${schema}.${table}: 0 rows\n`
  }
  const destColumns = columnsByTable.get(`${schema}.${table}`) ?? []
  const omit = new Set(options.omitColumns ?? [])
  const rowKeys = new Set(rows.flatMap((row) => Object.keys(row)))
  const columns = destColumns.filter((column) => rowKeys.has(column) && !omit.has(column))
  if (columns.length === 0) {
    return `-- ${schema}.${table}: no matching columns\n`
  }

  const quotedColumns = columns.map((column) => `"${column}"`).join(", ")
  const assignments = columns
    .filter((column) => !conflictColumns.includes(column))
    .map((column) => `"${column}" = excluded."${column}"`)
    .join(", ")
  const conflict = conflictColumns.map((column) => `"${column}"`).join(", ")
  const onConflict = assignments
    ? `do update set ${assignments}`
    : "do nothing"

  return `
with input_rows as (
  select ${quotedColumns}
  from jsonb_populate_recordset(null::${tableRef(schema, table)}, ${jsonDollar(rows)}::jsonb)
)
insert into ${tableRef(schema, table)} (${quotedColumns})
select ${quotedColumns} from input_rows
on conflict (${conflict}) ${onConflict};
`
}

const executeSql = async (sql) => {
  const localSqlPath = `scripts/.fv_migration_${timestamp()}.sql`
  const containerSqlPath = `/tmp/fv_migration_${timestamp()}.sql`
  writeFileSync(localSqlPath, sql, "utf8")

  try {
    const copy = spawnSync("docker", ["cp", localSqlPath, `${DEST_CONTAINER}:${containerSqlPath}`], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
    if (copy.status !== 0) {
      throw new Error(copy.error?.message || copy.stderr || copy.stdout)
    }

    const run = spawnSync(
      "docker",
      DEST_KIND === "remote"
        ? [
            "exec",
            DEST_CONTAINER,
            "psql",
            DEST_DB_URL,
            "-v",
            "ON_ERROR_STOP=1",
            "-q",
            "-f",
            containerSqlPath,
          ]
        : [
            "exec",
            DEST_CONTAINER,
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
            "-q",
            "-f",
            containerSqlPath,
          ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
    if (run.status !== 0) {
      throw new Error(run.error?.message || run.stderr || run.stdout)
    }

    spawnSync("docker", ["exec", DEST_CONTAINER, "rm", "-f", containerSqlPath], {
      encoding: "utf8",
    })

    return { stdout: run.stdout, stderr: run.stderr }
  } finally {
    try {
      unlinkSync(localSqlPath)
    } catch {
      // Best-effort cleanup for failed runs.
    }
  }
}

const normalizeAuthUser = (user) => ({
  instance_id: "00000000-0000-0000-0000-000000000000",
  id: user.id,
  aud: user.aud ?? "authenticated",
  role: user.role ?? "authenticated",
  email: user.email ?? null,
  encrypted_password: null,
  email_confirmed_at: user.email_confirmed_at ?? user.confirmed_at ?? null,
  invited_at: user.invited_at ?? null,
  confirmation_token: "",
  confirmation_sent_at: user.confirmation_sent_at ?? null,
  recovery_token: "",
  recovery_sent_at: user.recovery_sent_at ?? null,
  email_change_token_new: "",
  email_change: "",
  email_change_sent_at: user.email_change_sent_at ?? null,
  last_sign_in_at: user.last_sign_in_at ?? null,
  raw_app_meta_data: user.app_metadata ?? {},
  raw_user_meta_data: user.user_metadata ?? {},
  is_super_admin: false,
  created_at: user.created_at ?? null,
  updated_at: user.updated_at ?? null,
  phone: user.phone || null,
  phone_confirmed_at: user.phone_confirmed_at ?? null,
  phone_change: "",
  phone_change_token: "",
  phone_change_sent_at: null,
  confirmed_at: user.confirmed_at ?? user.email_confirmed_at ?? null,
  email_change_token_current: "",
  email_change_confirm_status: 0,
  banned_until: user.banned_until ?? null,
  reauthentication_token: "",
  reauthentication_sent_at: null,
  is_sso_user: Boolean(user.is_sso_user),
  deleted_at: null,
  is_anonymous: Boolean(user.is_anonymous),
})

const normalizeIdentity = (identity, user) => {
  const identityData = identity.identity_data ?? {}
  const providerId = String(
    identity.provider_id ?? identityData.sub ?? identityData.provider_id ?? identity.id
  )
  const identityId = UUID_RE.test(identity.id)
    ? identity.id
    : stableUuid(`${user.id}:${identity.provider}:${providerId}`)

  return {
    id: identityId,
    provider_id: providerId,
    user_id: user.id,
    identity_data: identityData,
    provider: identity.provider,
    last_sign_in_at: identity.last_sign_in_at ?? user.last_sign_in_at ?? null,
    created_at: identity.created_at ?? user.created_at ?? null,
    updated_at: identity.updated_at ?? user.updated_at ?? null,
    email: identity.email ?? identityData.email ?? user.email ?? null,
  }
}

const main = async () => {
  console.log(`[migration] Source org: ${SOURCE_ORG_ID}`)
  console.log(
    `[migration] Destination: ${
      DEST_KIND === "remote" ? "remote Postgres via DEST_DATABASE_URL" : DEST_CONTAINER
    }, org ${DEST_ORG_ID}`
  )
  console.log(`[migration] Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`)

  if (DEST_KIND === "remote" && !DEST_DB_URL) {
    throw new Error("DEST_DATABASE_URL is required for remote destination")
  }

  const columnsByTable = getDestColumns()
  const [destOrg] = localRows(
    `select id, name, slug from public.organizaciones where id = ${sqlString(DEST_ORG_ID)}`
  )
  if (!destOrg) {
    throw new Error(`Destination organization ${DEST_ORG_ID} does not exist`)
  }

  const [destOrganizer] = localRows(`
    select u.id, u.email
    from public.organization_members om
    join public.users u on u.id = om.user_id
    where om.organizacion_id = ${sqlString(DEST_ORG_ID)}
      and om.is_active = true
    order by case when om.member_role = 'admin' then 0 else 1 end, om.created_at
    limit 1
  `)
  if (!destOrganizer) {
    throw new Error(`Destination organization ${DEST_ORG_ID} has no active organization member`)
  }

  const orgClubs = await fetchAll("organization_clubs", "*", (query) =>
    query.eq("organizacion_id", SOURCE_ORG_ID)
  )
  const tournaments = await fetchAll("tournaments", "*", (query) =>
    query.eq("organization_id", SOURCE_ORG_ID)
  )
  const tournamentIds = tournaments.map((row) => row.id)

  const clubesTournament = await fetchWhereIn("clubes_tournament", "tournament_id", tournamentIds)
  const zones = await fetchWhereIn("zones", "tournament_id", tournamentIds)
  const zoneIds = zones.map((row) => row.id)
  const zoneCouples = await fetchWhereIn("zone_couples", "zone_id", zoneIds)
  const zonePositions = await fetchWhereIn("zone_positions", "tournament_id", tournamentIds)
  const inscriptions = await fetchWhereIn("inscriptions", "tournament_id", tournamentIds)
  const seeds = await fetchWhereIn("tournament_couple_seeds", "tournament_id", tournamentIds)
  const matches = await fetchWhereIn("matches", "tournament_id", tournamentIds)
  const matchIds = matches.map((row) => row.id)
  const matchHierarchy = await fetchWhereIn("match_hierarchy", "tournament_id", tournamentIds)
  const matchPoints = await fetchWhereIn("match_points_couples", "match_id", matchIds)
  const tournamentFechas = await fetchWhereIn("tournament_fechas", "tournament_id", tournamentIds)
  const fechaIds = tournamentFechas.map((row) => row.id)
  const timeSlots = await fetchWhereIn("tournament_time_slots", "fecha_id", fechaIds)
  const timeSlotIds = timeSlots.map((row) => row.id)
  const fechaMatches = await fetchWhereIn("fecha_matches", "match_id", matchIds)
  const setMatches = await fetchWhereIn("set_matches", "match_id", matchIds)
  const coupleAvailability = await fetchWhereIn(
    "couple_time_availability",
    "time_slot_id",
    timeSlotIds
  )
  const playerHistory = await fetchWhereIn("player_tournament_history", "tournament_id", tournamentIds)
  const rankingSnapshots = await fetchWhereIn("ranking_snapshots", "tournament_id", tournamentIds)

  const coupleIds = unique([
    ...inscriptions.map((row) => row.couple_id),
    ...zoneCouples.map((row) => row.couple_id),
    ...zonePositions.map((row) => row.couple_id),
    ...coupleAvailability.map((row) => row.couple_id),
    ...seeds.map((row) => row.couple_id),
    ...matches.flatMap((row) => [row.couple1_id, row.couple2_id, row.winner_id]),
    ...matchPoints.flatMap((row) => [row.winner_couple_id, row.loser_couple_id]),
    ...setMatches.map((row) => row.winner_couple_id),
    ...tournaments.map((row) => row.winner_id),
  ])
  const couples = await fetchWhereIn("couples", "id", coupleIds)

  const playerIds = unique([
    ...inscriptions.map((row) => row.player_id),
    ...couples.flatMap((row) => [row.player1_id, row.player2_id]),
    ...playerHistory.map((row) => row.player_id),
    ...rankingSnapshots.map((row) => row.player_id),
  ])
  const players = await fetchWhereIn("players", "id", playerIds)

  const clubIds = unique([
    ...orgClubs.map((row) => row.club_id),
    ...tournaments.map((row) => row.club_id),
    ...clubesTournament.map((row) => row.club_id),
    ...matches.map((row) => row.club_id),
    ...players.map((row) => row.club_id),
  ])
  const clubs = await fetchWhereIn("clubes", "id", clubIds)
  const servicesClubes = await fetchWhereIn("services_clubes", "club_id", clubs.map((row) => row.id))
  const services = await fetchWhereIn("services", "id", servicesClubes.map((row) => row.service_id))
  const categories = await fetchWhereIn(
    "categories",
    "name",
    unique([
      ...players.map((row) => row.category_name),
      ...tournaments.map((row) => row.category_name),
      ...rankingSnapshots.map((row) => row.category),
    ])
  )

  const requestedUserIds = unique([
    ...players.map((row) => row.user_id),
    ...clubs.map((row) => row.user_id),
    ...inscriptions.map((row) => row.payment_reviewed_by),
  ])
  const publicUsers = await fetchWhereIn("users", "id", requestedUserIds)
  const publicUserIds = new Set(publicUsers.map((row) => row.id))
  const authUsers = (await hydrateAuthUsers([...publicUserIds])).filter((user) =>
    publicUserIds.has(user.id)
  )
  const localAuthUsers = localRows("select id, lower(email) as email from auth.users where email is not null")
  const localAuthIds = new Set(localAuthUsers.map((row) => row.id))
  const localAuthByEmail = new Map(localAuthUsers.map((row) => [row.email, row.id]))
  const localPublicIds = new Set(localRows("select id from public.users").map((row) => row.id))

  const sourceToDestUserId = new Map()
  const emailMergedSourceUserIds = new Set()

  for (const user of authUsers) {
    const emailKey = user.email?.toLowerCase() ?? null
    if (localAuthIds.has(user.id)) {
      sourceToDestUserId.set(user.id, user.id)
      continue
    }

    if (emailKey && localAuthByEmail.has(emailKey)) {
      sourceToDestUserId.set(user.id, localAuthByEmail.get(emailKey))
      emailMergedSourceUserIds.add(user.id)
      continue
    }

    sourceToDestUserId.set(user.id, user.id)
  }

  const mapUserId = (userId) => sourceToDestUserId.get(userId) ?? userId ?? null
  const authUsersToInsert = authUsers.filter(
    (user) => !emailMergedSourceUserIds.has(user.id) && !localAuthIds.has(user.id)
  )
  const authUserIdsToInsert = new Set(authUsersToInsert.map((user) => user.id))
  const authIdentities = authUsersToInsert.flatMap((user) =>
    (user.identities ?? []).map((identity) => ({
      ...normalizeIdentity(identity, user),
      user_id: mapUserId(user.id),
    }))
  )

  const candidatePlayerUserIds = unique(players.map((row) => mapUserId(row.user_id)))
  const localPlayerUserConflicts = localRows(`
    select id, user_id
    from public.players
    where user_id in (${candidatePlayerUserIds.map(sqlString).join(",") || "null"})
  `).filter((row) => !players.some((player) => player.id === row.id))
  const localIdentityConflictRows = []
  for (const identityChunk of chunk(authIdentities, 100)) {
    if (identityChunk.length === 0) {
      continue
    }
    localIdentityConflictRows.push(
      ...localRows(`
        select i.id, i.user_id, i.provider, i.provider_id
        from auth.identities i
        where (i.provider, i.provider_id) in (${identityChunk
          .map((identity) => `(${sqlString(identity.provider)}, ${sqlString(identity.provider_id)})`)
          .join(",")})
      `)
    )
  }
  const localIdentityConflicts = localIdentityConflictRows.filter(
    (row) => !authIdentities.some((identity) => identity.id === row.id)
  )

  if (localIdentityConflicts.length > 0) {
    throw new Error(
      `Found ${localIdentityConflicts.length} local auth identity conflicts. Aborting before write.`
    )
  }

  const validUserIds = new Set(authUsersToInsert.map((user) => user.id))
  for (const id of localPublicIds) {
    validUserIds.add(id)
  }

  const playerUserConflicts = new Set(localPlayerUserConflicts.map((row) => row.user_id))
  const validClubIds = new Set(clubs.map((row) => row.id))
  const validPaymentReviewerIds = new Set([...validUserIds, destOrganizer.id])

  const migratedAuthUsers = authUsersToInsert.map(normalizeAuthUser)
  const migratedPublicUsers = publicUsers
    .filter((row) => authUserIdsToInsert.has(row.id) && !localPublicIds.has(row.id))
    .map((row) => ({
      ...row,
      id: mapUserId(row.id),
    }))
  const migratedClubs = clubs.map((row) => ({
    ...row,
    user_id: validUserIds.has(mapUserId(row.user_id)) ? mapUserId(row.user_id) : null,
  }))
  const migratedOrgClubs = orgClubs.map((row) => ({
    ...row,
    organizacion_id: DEST_ORG_ID,
  }))
  const migratedPlayers = players.map((row) => ({
    ...row,
    club_id: validClubIds.has(row.club_id) ? row.club_id : null,
    user_id:
      validUserIds.has(mapUserId(row.user_id)) && !playerUserConflicts.has(mapUserId(row.user_id))
        ? mapUserId(row.user_id)
        : null,
    organizador_id: DEST_ORG_ID,
  }))
  const migratedInscriptions = inscriptions.map((row) => ({
    ...row,
    payment_reviewed_by: validPaymentReviewerIds.has(mapUserId(row.payment_reviewed_by))
      ? mapUserId(row.payment_reviewed_by)
      : null,
  }))
  const migratedTournaments = tournaments.map((row) => ({
    ...row,
    organization_id: DEST_ORG_ID,
    organizador_id: destOrganizer.id,
    winner_id: null,
  }))

  const expected = {
    auth_users: migratedAuthUsers.length,
    auth_identities: authIdentities.length,
    public_users: migratedPublicUsers.length,
    categories: categories.length,
    services: services.length,
    clubs: migratedClubs.length,
    organization_clubs: migratedOrgClubs.length,
    players: migratedPlayers.length,
    couples: couples.length,
    tournaments: migratedTournaments.length,
    clubes_tournament: clubesTournament.length,
    zones: zones.length,
    zone_couples: zoneCouples.length,
    zone_positions: zonePositions.length,
    inscriptions: migratedInscriptions.length,
    tournament_fechas: tournamentFechas.length,
    tournament_time_slots: timeSlots.length,
    couple_time_availability: coupleAvailability.length,
    tournament_couple_seeds: seeds.length,
    matches: matches.length,
    match_hierarchy: matchHierarchy.length,
    fecha_matches: fechaMatches.length,
    set_matches: setMatches.length,
    match_points_couples: matchPoints.length,
    player_tournament_history: playerHistory.length,
    ranking_snapshots: rankingSnapshots.length,
    local_player_user_conflicts_nulled: localPlayerUserConflicts.length,
    auth_users_merged_by_email: emailMergedSourceUserIds.size,
  }

  console.log("[migration] Prepared rows:")
  console.log(JSON.stringify(expected, null, 2))

  if (!APPLY) {
    console.log("[migration] Dry-run complete. Re-run with --apply to write to local Docker.")
    return
  }

  let backupName = null
  if (SKIP_BACKUP) {
    console.log("[migration] Skipping backup because --skip-backup was provided")
  } else {
    backupName = `/tmp/pre_fv_migration_${timestamp()}.dump`
    console.log(`[migration] Creating backup inside container: ${backupName}`)
    const backup = spawnSync(
      "docker",
      DEST_KIND === "remote"
        ? [
            "exec",
            DEST_CONTAINER,
            "pg_dump",
            DEST_DB_URL,
            "--schema=public",
            "--schema=auth",
            "-Fc",
            "-f",
            backupName,
          ]
        : [
            "exec",
            DEST_CONTAINER,
            "pg_dump",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "--schema=public",
            "--schema=auth",
            "-Fc",
            "-f",
            backupName,
          ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
    if (backup.status !== 0) {
      throw new Error(
        `${backup.error?.message || backup.stderr || backup.stdout}\n` +
          (DEST_KIND === "remote"
            ? "Remote backup failed. Supabase may be running a newer Postgres version than the local pg_dump client. Create a backup from the Supabase Dashboard or rerun with --skip-backup if you accept proceeding without this script-created dump."
            : "")
      )
    }
  }

  const statements = [
    "begin;",
    insertStatement(columnsByTable, "public", "categories", categories, ["name"]),
    insertStatement(columnsByTable, "public", "services", services, ["id"]),
    insertStatement(columnsByTable, "auth", "users", migratedAuthUsers, ["id"]),
    insertStatement(columnsByTable, "auth", "identities", authIdentities, ["id"]),
    insertStatement(columnsByTable, "public", "users", migratedPublicUsers, ["id"]),
    insertStatement(columnsByTable, "public", "clubes", migratedClubs, ["id"]),
    insertStatement(columnsByTable, "public", "services_clubes", servicesClubes, [
      "service_id",
      "club_id",
    ]),
    insertStatement(columnsByTable, "public", "organization_clubs", migratedOrgClubs, ["id"]),
    insertStatement(columnsByTable, "public", "players", migratedPlayers, ["id"]),
    insertStatement(columnsByTable, "public", "couples", couples, ["id"]),
    insertStatement(columnsByTable, "public", "tournaments", migratedTournaments, ["id"]),
    insertStatement(columnsByTable, "public", "clubes_tournament", clubesTournament, ["id"]),
    insertStatement(columnsByTable, "public", "zones", zones, ["id"]),
    insertStatement(columnsByTable, "public", "zone_couples", zoneCouples, [
      "zone_id",
      "couple_id",
    ]),
    insertStatement(columnsByTable, "public", "zone_positions", zonePositions, ["id"]),
    insertStatement(columnsByTable, "public", "tournament_fechas", tournamentFechas, ["id"]),
    insertStatement(columnsByTable, "public", "tournament_time_slots", timeSlots, ["id"]),
    insertStatement(
      columnsByTable,
      "public",
      "couple_time_availability",
      coupleAvailability,
      ["id"]
    ),
    insertStatement(columnsByTable, "public", "tournament_couple_seeds", seeds, ["id"]),
    insertStatement(columnsByTable, "public", "matches", matches, ["id"]),
    insertStatement(columnsByTable, "public", "match_hierarchy", matchHierarchy, ["id"]),
    insertStatement(columnsByTable, "public", "fecha_matches", fechaMatches, ["id"]),
    insertStatement(columnsByTable, "public", "set_matches", setMatches, ["id"]),
    insertStatement(columnsByTable, "public", "match_points_couples", matchPoints, ["id"]),
    insertStatement(columnsByTable, "public", "player_tournament_history", playerHistory, [
      "id",
    ]),
    insertStatement(columnsByTable, "public", "ranking_snapshots", rankingSnapshots, ["id"]),
    `
update public.tournaments t
set winner_id = source_rows.winner_id
from jsonb_populate_recordset(null::public.tournaments, ${jsonDollar(tournaments)}::jsonb) as source_rows
where t.id = source_rows.id
  and source_rows.winner_id is not null
  and exists (select 1 from public.couples c where c.id = source_rows.winner_id);
`,
    "commit;",
  ]

  console.log("[migration] Writing rows to local Docker...")
  await executeSql(statements.join("\n"))

  const postCounts = [
    {
      table_name: "tournaments_by_source_ids",
      count: localCountWhereIn(
        "public.tournaments",
        "id",
        migratedTournaments.map((row) => row.id)
      ),
    },
    {
      table_name: "players_by_source_ids",
      count: localCountWhereIn(
        "public.players",
        "id",
        migratedPlayers.map((row) => row.id)
      ),
    },
    {
      table_name: "couples_by_source_ids",
      count: localCountWhereIn(
        "public.couples",
        "id",
        couples.map((row) => row.id)
      ),
    },
    {
      table_name: "matches_by_source_ids",
      count: localCountWhereIn(
        "public.matches",
        "id",
        matches.map((row) => row.id)
      ),
    },
    {
      table_name: "set_matches_by_source_ids",
      count: localCountWhereIn(
        "public.set_matches",
        "id",
        setMatches.map((row) => row.id)
      ),
    },
  ]
  console.log("[migration] Local post-write counts:")
  console.log(JSON.stringify(postCounts, null, 2))
  if (backupName) {
    console.log(`[migration] Backup created in container: ${backupName}`)
  }
}

main().catch((error) => {
  console.error(`[migration] ERROR: ${error?.stack || error?.message || String(error)}`)
  process.exitCode = 1
})
