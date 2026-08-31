import dotenv from "dotenv"
import { existsSync } from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import { buildTournamentSlugBase, makeUniqueTournamentSlug } from "../lib/tournaments/seo-slug"
import { parseTournamentCategoryConfig } from "../lib/services/tournament-category-config"

type TenantKey = "padel-elite" | "padel-fv"

interface TournamentRow {
  id: string
  name: string | null
  type: "AMERICAN" | "LONG" | null
  gender: "MALE" | "FEMALE" | "MIXED" | null
  category_name: string | null
  category_config: unknown
  start_date: string | null
  seo_slug: string | null
  clubes: { name: string | null } | Array<{ name: string | null }> | null
}

const getOption = (name: string) => process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1)
const hasFlag = (name: string) => process.argv.includes(name)

const printUsage = () => {
  console.log(`
Uso:
  npx tsx scripts/backfill-tournament-seo-slugs.ts --tenant=padel-elite --env-file=.env.padel-elite.production.local
  npx tsx scripts/backfill-tournament-seo-slugs.ts --tenant=padel-fv --env-file=.env.padel-fv.production.local --apply --confirm=BACKFILL_SEO_SLUGS

Sin --apply sólo genera la previsualización. --apply exige la confirmación exacta.
Opcional: --limit=25 para aplicar una primera tanda acotada.
Por defecto carga .env.<tenant>.local. Para producción, usa --env-file con un archivo que contenga la URL cloud de Supabase.
`)
}

if (hasFlag("--help") || hasFlag("-h")) {
  printUsage()
  process.exit(0)
}

const tenant = getOption("--tenant") as TenantKey | undefined
if (tenant !== "padel-elite" && tenant !== "padel-fv") {
  console.error("Debes indicar --tenant=padel-elite o --tenant=padel-fv.")
  process.exit(1)
}

const apply = hasFlag("--apply")
if (apply && getOption("--confirm") !== "BACKFILL_SEO_SLUGS") {
  console.error("Para escribir debes indicar --apply --confirm=BACKFILL_SEO_SLUGS.")
  process.exit(1)
}

const limitValue = getOption("--limit")
const limit = limitValue ? Number(limitValue) : undefined
if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
  console.error("--limit debe ser un entero positivo.")
  process.exit(1)
}

const requestedEnvFile = getOption("--env-file")
const envPath = path.resolve(process.cwd(), requestedEnvFile || `.env.${tenant}.local`)
if (!existsSync(envPath)) {
  console.error(`No existe ${envPath}.`)
  process.exit(1)
}

dotenv.config({ path: envPath, override: true, quiet: true })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const organizationId = process.env.TENANT_ORGANIZATION_ID?.trim()
const organizationSlug = process.env.TENANT_ORGANIZATION_SLUG?.trim() || tenant

if (!supabaseUrl || !serviceRoleKey) {
  console.error(`${envPath} debe contener NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.`)
  process.exit(1)
}

let supabaseHost: string
try {
  supabaseHost = new URL(supabaseUrl).hostname
} catch {
  console.error(`${envPath} contiene una NEXT_PUBLIC_SUPABASE_URL inválida.`)
  process.exit(1)
}

if (["localhost", "127.0.0.1", "::1"].includes(supabaseHost)) {
  console.error(
    `${envPath} apunta a ${supabaseHost}, que es una instancia local. ` +
    `Para el backfill de producción usa --env-file=.env.${tenant}.production.local con las credenciales cloud del tenant.`,
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const fetchAll = async <T,>(table: "tournaments", select: string, organizationUuid: string): Promise<T[]> => {
  const records: T[] = []
  const pageSize = 500

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq("organization_id", organizationUuid)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw new Error(error.message)
    records.push(...((data || []) as T[]))
    if (!data || data.length < pageSize) return records
  }
}

const resolveClubName = (clubes: TournamentRow["clubes"]) => Array.isArray(clubes) ? clubes[0]?.name ?? null : clubes?.name ?? null

const main = async () => {
  const organizationQuery = supabase
    .from("organizaciones")
    .select("id, name, slug")
    .eq("is_active", true)

  const { data: organization, error: organizationError } = organizationId
    ? await organizationQuery.eq("id", organizationId).maybeSingle()
    : await organizationQuery.eq("slug", organizationSlug).maybeSingle()

  if (organizationError) throw new Error(`No se pudo resolver organización: ${organizationError.message}`)
  if (!organization) throw new Error(`No existe una organización activa para el tenant ${tenant}.`)

  const tournaments = await fetchAll<TournamentRow>(
    "tournaments",
    "id, name, type, gender, category_name, category_config, start_date, seo_slug, clubes(name)",
    organization.id,
  )
  const taken = new Set(tournaments.map((tournament) => tournament.seo_slug).filter((slug): slug is string => Boolean(slug)))
  const candidates = tournaments
    .filter((tournament) => !tournament.seo_slug)
    .sort((first, second) => (first.start_date || "").localeCompare(second.start_date || "") || first.id.localeCompare(second.id))
    .map((tournament) => {
      const baseSlug = buildTournamentSlugBase({
        name: tournament.name,
        type: tournament.type,
        gender: tournament.gender,
        categoryName: tournament.category_name,
        categoryConfig: parseTournamentCategoryConfig(tournament.category_config),
        clubName: resolveClubName(tournament.clubes),
        startDate: tournament.start_date,
      })
      const seoSlug = baseSlug ? makeUniqueTournamentSlug(baseSlug, (slug) => taken.has(slug)) : null
      if (seoSlug) taken.add(seoSlug)

      return {
        id: tournament.id,
        name: tournament.name || "(sin nombre)",
        club: resolveClubName(tournament.clubes) || "(sin club)",
        startDate: tournament.start_date || "(sin fecha)",
        category: tournament.category_name || "(sin categoría)",
        seoSlug,
      }
    })

  console.table(candidates)
  const validCandidates = candidates.filter((candidate): candidate is typeof candidate & { seoSlug: string } => Boolean(candidate.seoSlug))
  const skipped = candidates.length - validCandidates.length
  console.log(`Tenant: ${organization.name} (${organization.id})`)
  console.log(`Torneos sin slug: ${candidates.length}; listos: ${validCandidates.length}; omitidos por datos incompletos: ${skipped}.`)

  if (!apply) {
    console.log("Previsualización finalizada. No se escribió ningún dato.")
    return
  }

  const toApply = limit ? validCandidates.slice(0, limit) : validCandidates
  for (const candidate of toApply) {
    const { error } = await supabase
      .from("tournaments")
      .update({ seo_slug: candidate.seoSlug })
      .eq("id", candidate.id)
      .eq("organization_id", organization.id)
      .is("seo_slug", null)

    if (error) throw new Error(`No se pudo actualizar ${candidate.id}: ${error.message}`)
  }

  console.log(`Backfill aplicado: ${toApply.length} slugs en ${organization.name}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
