export type PublicTournamentTenantKey = "padel-fv" | "padel-elite"
export type PublicTournamentListStatus = "active" | "upcoming" | "in-progress" | "past"

export const getDefaultPublicTournamentListStatus = (
  tenantKey: PublicTournamentTenantKey,
): PublicTournamentListStatus => (tenantKey === "padel-elite" ? "upcoming" : "active")

export const getPublicTournamentListPath = (
  tenantKey: PublicTournamentTenantKey,
  status: PublicTournamentListStatus,
) => {
  if (status === "active" || (tenantKey === "padel-elite" && status === "upcoming")) {
    return "/torneos"
  }

  return {
    upcoming: "/torneos/proximos",
    "in-progress": "/torneos/en-curso",
    past: "/torneos/finalizados",
  }[status]
}

export const getPublicTournamentListTabs = (tenantKey: PublicTournamentTenantKey) =>
  tenantKey === "padel-elite"
    ? (["upcoming", "in-progress", "past"] as const)
    : (["active", "past"] as const)
