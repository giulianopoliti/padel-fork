import { createHash } from "node:crypto"
import { readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"

const DEFAULT_SOURCE_ENV = ""
const DEFAULT_LOCAL_DEST_ORG_ID = "1ee10ee3-8895-4279-8cdb-38a974b88d29"
const DEFAULT_REMOTE_DEST_ORG_ID = "202b95d4-1b99-4d04-b089-58ea63f9218f"
const DEFAULT_DEST_CONTAINER = "supabase_db_padel-base"

const argv = process.argv.slice(2)
const argSet = new Set(argv)
const getArg = (name, fallback = "") => {
  const prefix = `${name}=`
  const match = argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}
const getArgs = (name) => {
  const prefix = `${name}=`
  return argv.filter((arg) => arg.startsWith(prefix)).map((arg) => arg.slice(prefix.length))
}

const APPLY = argSet.has("--apply")
const SOURCE_ENV = getArg("--source-env", DEFAULT_SOURCE_ENV)
const DEST_DB_URL = getArg("--dest-db-url", process.env.DEST_DATABASE_URL || "")
const DEST_KIND = getArg("--dest-kind", DEST_DB_URL ? "remote" : "local")
const DEST_CONTAINER = getArg("--dest-container", DEFAULT_DEST_CONTAINER)
const DEST_ORG_ID = getArg(
  "--dest-org-id",
  DEST_KIND === "remote" ? DEFAULT_REMOTE_DEST_ORG_ID : DEFAULT_LOCAL_DEST_ORG_ID
)
const EMAIL_FILTERS = getArgs("--email").map((email) => email.trim().toLowerCase()).filter(Boolean)

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

if (DEST_KIND === "remote" && !DEST_DB_URL) {
  throw new Error("DEST_DATABASE_URL is required for remote destination")
}

const source = createClient(sourceUrl, sourceServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const sqlString = (value) => {
  if (value === null || value === undefined) {
    return "null"
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-")

const runDockerPsql = (sql) => {
  const psqlArgs =
    DEST_KIND === "remote"
      ? ["exec", DEST_CONTAINER, "psql", DEST_DB_URL, "-At", "-c", sql]
      : ["exec", DEST_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql]

  const result = spawnSync("docker", psqlArgs, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout)
  }
  return result.stdout.trim()
}

const destRows = (sql) => {
  const json = runDockerPsql(`select coalesce(json_agg(row_to_json(t)), '[]'::json) from (${sql}) t`)
  return JSON.parse(json || "[]")
}

const getDestColumns = () => {
  const rows = destRows(`
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema in ('auth', 'public')
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

const hydrateAuthUsers = async (userIds) => {
  const users = []
  const missing = []
  for (const idChunk of chunk(unique(userIds), 10)) {
    const results = await Promise.all(
      idChunk.map(async (id) => {
        const { data, error } = await source.auth.admin.getUserById(id)
        if (error) {
          if (error.status === 404) {
            missing.push(id)
            return null
          }
          throw new Error(`source auth getUserById(${id}): ${error.message}`)
        }
        return data.user ?? null
      })
    )
    users.push(...results.filter(Boolean))
  }
  return { users, missing }
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

const jsonDollar = (rows) => {
  const json = JSON.stringify(rows)
  const hash = createHash("sha1").update(json).digest("hex").slice(0, 12)
  const tag = `$repair_${hash}$`
  if (json.includes(tag)) {
    throw new Error("Unexpected JSON dollar-quote collision")
  }
  return `${tag}${json}${tag}`
}

const tableRef = (schema, table) => `"${schema}"."${table}"`

const insertStatement = (columnsByTable, schema, table, rows, conflictColumns) => {
  if (rows.length === 0) {
    return `-- ${schema}.${table}: 0 rows\n`
  }
  const destColumns = columnsByTable.get(`${schema}.${table}`) ?? []
  const rowKeys = new Set(rows.flatMap((row) => Object.keys(row)))
  const columns = destColumns.filter((column) => rowKeys.has(column))
  const quotedColumns = columns.map((column) => `"${column}"`).join(", ")
  const assignments = columns
    .filter((column) => !conflictColumns.includes(column))
    .map((column) => `"${column}" = excluded."${column}"`)
    .join(", ")
  const conflict = conflictColumns.map((column) => `"${column}"`).join(", ")

  return `
with input_rows as (
  select ${quotedColumns}
  from jsonb_populate_recordset(null::${tableRef(schema, table)}, ${jsonDollar(rows)}::jsonb)
)
insert into ${tableRef(schema, table)} (${quotedColumns})
select ${quotedColumns} from input_rows
on conflict (${conflict}) ${assignments ? `do update set ${assignments}` : "do nothing"};
`
}

const executeSql = (sql) => {
  const localSqlPath = `scripts/.repair_missing_auth_${timestamp()}.sql`
  const containerSqlPath = `/tmp/repair_missing_auth_${timestamp()}.sql`
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
        ? ["exec", DEST_CONTAINER, "psql", DEST_DB_URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", containerSqlPath]
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
  } finally {
    spawnSync("docker", ["exec", DEST_CONTAINER, "rm", "-f", containerSqlPath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
    try {
      unlinkSync(localSqlPath)
    } catch {}
  }
}

const main = async () => {
  console.log(`[auth-repair] Destination: ${DEST_KIND === "remote" ? "remote" : DEST_CONTAINER}`)
  console.log(`[auth-repair] Destination org: ${DEST_ORG_ID}`)
  console.log(`[auth-repair] Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`)

  const emailFilterSql = EMAIL_FILTERS.length
    ? `and lower(u.email) in (${EMAIL_FILTERS.map(sqlString).join(",")})`
    : ""

  const missingDestUsers = destRows(`
    select distinct
      u.id,
      lower(u.email) as email,
      u.role,
      p.id as player_id,
      p.dni,
      p.first_name,
      p.last_name
    from public.users u
    join public.players p on p.user_id = u.id
    where u.role = 'PLAYER'
      and not exists (select 1 from auth.users au where au.id = u.id)
      ${emailFilterSql}
    order by lower(u.email)
  `)

  const { users: sourceAuthUsers, missing: missingInSourceAuth } = await hydrateAuthUsers(
    missingDestUsers.map((row) => row.id)
  )
  const sourceAuthById = new Map(sourceAuthUsers.map((user) => [user.id, user]))
  const usersToRepair = missingDestUsers.filter((row) => sourceAuthById.has(row.id))

  const destAuthEmails = destRows("select id, lower(email) as email from auth.users where email is not null")
  const destAuthByEmail = new Map(destAuthEmails.map((row) => [row.email, row.id]))
  const emailConflicts = usersToRepair.filter((row) => {
    const existingAuthId = destAuthByEmail.get(row.email)
    return existingAuthId && existingAuthId !== row.id
  })

  if (emailConflicts.length > 0) {
    console.log("[auth-repair] Email conflicts found; these will not be inserted:")
    console.log(JSON.stringify(emailConflicts, null, 2))
  }

  const finalUsersToRepair = usersToRepair.filter(
    (row) => !emailConflicts.some((conflict) => conflict.id === row.id)
  )
  const authUsers = finalUsersToRepair.map((row) => normalizeAuthUser(sourceAuthById.get(row.id)))
  const authIdentities = finalUsersToRepair.flatMap((row) =>
    (sourceAuthById.get(row.id).identities ?? []).map((identity) =>
      normalizeIdentity(identity, sourceAuthById.get(row.id))
    )
  )

  const existingIdentityConflicts = []
  for (const identityChunk of chunk(authIdentities, 100)) {
    if (identityChunk.length === 0) {
      continue
    }
    existingIdentityConflicts.push(
      ...destRows(`
        select id, user_id, provider, provider_id
        from auth.identities
        where (provider, provider_id) in (${identityChunk
          .map((identity) => `(${sqlString(identity.provider)}, ${sqlString(identity.provider_id)})`)
          .join(",")})
      `)
    )
  }
  const blockingIdentityConflicts = existingIdentityConflicts.filter(
    (row) => !authIdentities.some((identity) => identity.id === row.id)
  )
  if (blockingIdentityConflicts.length > 0) {
    throw new Error(
      `Found ${blockingIdentityConflicts.length} auth.identity conflicts; aborting before write.`
    )
  }

  const report = {
    missing_auth_users_in_dest: missingDestUsers.length,
    found_in_source_auth: usersToRepair.length,
    missing_in_source_auth: missingInSourceAuth.length,
    email_conflicts: emailConflicts.length,
    auth_users_to_insert: authUsers.length,
    auth_identities_to_insert: authIdentities.length,
    sample_to_insert: finalUsersToRepair.slice(0, 20),
    missing_source_ids: missingInSourceAuth.slice(0, 20),
  }

  console.log("[auth-repair] Prepared rows:")
  console.log(JSON.stringify(report, null, 2))

  if (!APPLY) {
    console.log("[auth-repair] Dry-run complete. Re-run with --apply to write auth rows.")
    return
  }

  const columnsByTable = getDestColumns()
  const sql = [
    "begin;",
    insertStatement(columnsByTable, "auth", "users", authUsers, ["id"]),
    insertStatement(columnsByTable, "auth", "identities", authIdentities, ["id"]),
    "commit;",
  ].join("\n")

  executeSql(sql)

  const repairedCount = destRows(`
    select count(*)::int as count
    from auth.users
    where id in (${finalUsersToRepair.map((row) => sqlString(row.id)).join(",") || "null"})
  `)[0]?.count ?? 0

  console.log("[auth-repair] Post-write:")
  console.log(JSON.stringify({ repaired_auth_users_present: repairedCount }, null, 2))
}

main().catch((error) => {
  console.error(`[auth-repair] ERROR: ${error?.stack || error?.message || String(error)}`)
  process.exitCode = 1
})
