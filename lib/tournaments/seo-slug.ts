import type { TournamentCategoryConfig } from "@/lib/services/tournament-category-config"

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires"

export interface TournamentSlugSource {
  name: string | null
  type: "AMERICAN" | "LONG" | string | null
  gender: "MALE" | "FEMALE" | "MIXED" | string | null
  categoryName: string | null
  categoryConfig?: TournamentCategoryConfig | null
  clubName: string | null
  startDate: string | Date | null
}

const spanishMonths = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

export const slugify = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")

const getArgentinaDateParts = (value: string | Date): { day: string; month: number; year: string } | null => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARGENTINA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date)
  const read = (type: "day" | "month" | "year") => parts.find((part) => part.type === type)?.value
  const day = read("day")
  const month = Number(read("month"))
  const year = read("year")

  return day && Number.isInteger(month) && month >= 1 && month <= 12 && year
    ? { day, month, year }
    : null
}

export const getCompactCategorySlug = ({
  gender,
  categoryName,
  categoryConfig,
}: Pick<TournamentSlugSource, "gender" | "categoryName" | "categoryConfig">): string | null => {
  const genderPrefix = gender === "FEMALE" ? "d" : gender === "MIXED" ? "m" : gender === "MALE" ? "c" : null
  if (!genderPrefix) return null

  if (categoryConfig?.mode === "MIXED_SUM") return `m${categoryConfig.targetSum}`

  const rawCategory = categoryConfig?.mode === "SINGLE"
    ? categoryConfig.category
    : categoryConfig?.mode === "RANGE"
      ? `${categoryConfig.categoryA}-${categoryConfig.categoryB}`
      : categoryName
  const numbers = rawCategory?.match(/\d+/g)
  if (!numbers?.length) return null

  return `${genderPrefix}${numbers.join("-")}`
}

/**
 * Public URL convention:
 * - TPE American: americano-c6-nova-padel-02-septiembre
 * - Long: lasaigues-caballito-almagro-agosto-c7
 *
 * No year is included in American slugs by product decision. Callers must use
 * makeUniqueTournamentSlug before persisting one.
 */
export const buildTournamentSlugBase = (source: TournamentSlugSource): string | null => {
  if (source.type === "AMERICAN") {
    const date = source.startDate ? getArgentinaDateParts(source.startDate) : null
    const category = getCompactCategorySlug(source)
    const club = source.clubName ? slugify(source.clubName) : ""
    if (!date || !category || !club) return null

    return ["americano", category, club, date.day, spanishMonths[date.month - 1]].join("-")
  }

  const name = source.name ? slugify(source.name) : ""
  return name || null
}

export const makeUniqueTournamentSlug = (baseSlug: string, isTaken: (slug: string) => boolean): string => {
  if (!isTaken(baseSlug)) return baseSlug

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${baseSlug}-${suffix}`
    if (!isTaken(candidate)) return candidate
  }
}
