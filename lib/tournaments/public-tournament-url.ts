export interface PublicTournamentLinkTarget {
  id: string
  seoSlug?: string | null
  isDraft?: boolean | null
}

export const getPublicTournamentHref = ({ id, seoSlug, isDraft }: PublicTournamentLinkTarget) => {
  const normalizedSlug = seoSlug?.trim()

  if (normalizedSlug && isDraft !== true) {
    return `/torneos/${encodeURIComponent(normalizedSlug)}`
  }

  return `/tournaments/${encodeURIComponent(id)}`
}
