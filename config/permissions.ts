import { getTenantBranding } from "@/config/tenant"

type Role = "PLAYER" | "CLUB" | "COACH" | "ADMIN" | "ORGANIZADOR"

export type IconName =
  | "Home"
  | "Trophy"
  | "Users"
  | "Layers"
  | "MapPin"
  | "Settings"
  | "BarChart"
  | "User"
  | "LayoutDashboard"
  | "BookOpen"

interface RouteConfig {
  path: string
  label: string
  icon: IconName
  roles: Role[]
}

const routePermissions: RouteConfig[] = [
  {
    path: "/",
    label: "Inicio",
    icon: "Home",
    roles: [],
  },
  {
    path: "/panel",
    label: "Mi Panel",
    icon: "LayoutDashboard",
    roles: ["PLAYER", "CLUB", "COACH", "ADMIN", "ORGANIZADOR"],
  },
  {
    path: "/ranking",
    label: "Ranking",
    icon: "BarChart",
    roles: ["PLAYER", "CLUB", "COACH", "ADMIN", "ORGANIZADOR"],
  },
  {
    path: "/tournaments",
    label: "Torneos",
    icon: "Trophy",
    roles: ["PLAYER", "CLUB", "COACH", "ADMIN", "ORGANIZADOR"],
  },
  {
    path: "/clubes",
    label: "Clubes",
    icon: "MapPin",
    roles: ["PLAYER", "CLUB", "COACH", "ADMIN", "ORGANIZADOR"],
  },
  {
    path: "/admin",
    label: "Panel Admin",
    icon: "Settings",
    roles: ["ADMIN"],
  },
  {
    path: "/edit-profile",
    label: "Editar perfil",
    icon: "User",
    roles: ["PLAYER", "CLUB", "COACH", "ADMIN", "ORGANIZADOR"],
  },
]

export function getLinksForRole(role: Role) {
  return routePermissions
    .filter((permission) => permission.roles.includes(role))
    .map((permission) => ({
      label: permission.label,
      icon: permission.icon,
      path: permission.path,
    }))
}

export function checkRoutePermission(path: string, role?: Role | null): boolean {
  if (path === "/admin-login") {
    return true
  }

  if (path.startsWith("/admin")) {
    return role === "ADMIN"
  }

  const branding = getTenantBranding()
  const publicPaths = [
    "/",
    "/login",
    "/auth/callback",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/clubes",
    "/coaches",
    "/players",
    "/info",
    "/complete-google-profile",
    ...(branding.features.publicRanking ? ["/ranking"] : []),
  ]

  if (
    (path.startsWith("/tournaments") && !path.startsWith("/tournaments/create")) ||
    path.startsWith("/torneos")
  ) {
    return true
  }

  if (path.startsWith("/my-tournaments")) {
    return role === "CLUB" || role === "ORGANIZADOR"
  }

  // Legacy compatibility while /panel becomes the canonical route.
  if (path === "/panel-cpa" || path.startsWith("/panel-cpa/")) {
    return !!role
  }

  if (publicPaths.some((publicPath) => path === publicPath || path.startsWith(`${publicPath}/`))) {
    return true
  }

  if (path === "/pending-approval") {
    return role === "CLUB"
  }

  if (!role) {
    return false
  }

  if (path === "/tournaments/create") {
    return role === "CLUB" || role === "ORGANIZADOR"
  }

  return routePermissions.some(
    (route) => route.roles.includes(role) && (path === route.path || path.startsWith(`${route.path}/`)),
  )
}

export function getRedirectPath(path: string, isAuthenticated: boolean, hasPermission: boolean): string {
  if (!isAuthenticated) {
    return "/login"
  }
  if (!hasPermission) {
    console.warn(`Redirecting user from ${path} due to lack of permissions.`)
    return "/"
  }
  return "/"
}
