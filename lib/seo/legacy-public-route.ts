export type PublicTournamentListSearchParams = Record<string, string | string[] | undefined>

const publicTournamentListDestinations = {
  "/tournaments": "/torneos",
  "/tournaments/upcoming": "/torneos/proximos",
  "/tournaments/in-progress": "/torneos/en-curso",
  "/tournaments/past": "/torneos/finalizados",
} as const

export type LegacyPublicTournamentListPath = keyof typeof publicTournamentListDestinations

export const appendPublicTournamentListSearchParams = (
  destination: string,
  searchParams: PublicTournamentListSearchParams,
) => {
  const query = new URLSearchParams()

  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item))
      return
    }

    if (value) query.set(key, value)
  })

  return query.size ? `${destination}?${query.toString()}` : destination
}

export const getPublicTournamentListRedirect = (
  legacyPath: LegacyPublicTournamentListPath,
  searchParams: PublicTournamentListSearchParams,
) => appendPublicTournamentListSearchParams(publicTournamentListDestinations[legacyPath], searchParams)
