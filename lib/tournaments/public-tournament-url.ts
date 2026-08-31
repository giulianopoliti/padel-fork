export interface PublicTournamentLinkTarget {
  id: string
  seoSlug?: string | null
}

export const getPublicTournamentHref = ({ id, seoSlug }: PublicTournamentLinkTarget) => {
  const normalizedSlug = seoSlug?.trim()

  if (normalizedSlug) {
    return `/torneos/${encodeURIComponent(normalizedSlug)}`
  }

  return `/tournaments/${encodeURIComponent(id)}`
}
