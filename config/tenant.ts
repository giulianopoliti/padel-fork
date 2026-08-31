export interface TenantBranding {
  key: "padel-fv" | "padel-elite"
  siteName: string
  shortName: string
  siteDomain: string
  supportEmail: string
  tenantOrganizationSlug: string
  logo: {
    navbar: string
    hero: string
    onLight: string
    onDark: string
    mark?: string
  }
  assets: {
    favicon: string
    favicon16: string
    favicon32: string
    appleTouchIcon: string
    manifest: string
    placeholderLogo: string
    placeholderUser: string
  }
  seo: {
    title: string
    description: string
  }
  home: {
    variant: "padel-fv" | "padel-elite"
    title: string
    subtitle: string
    ctaPrimary: string
    ctaSecondary: string
  }
  features: {
    publicRanking: boolean
    showRankingInNav: boolean
    showTransferProofHighlights: boolean
    playerPanelVariant: "default" | "padel-fv" | "padel-elite"
  }
  tournaments: {
    defaultPublicType: "LONG" | "AMERICAN"
    theme: {
      className: string
      primary: string
      accent: string
      highlightSurface: string
      onPrimary: string
      focusRing: string
    }
  }
}

const tenantBranding: Record<TenantBranding["key"], TenantBranding> = {
  "padel-fv": {
    key: "padel-fv",
    siteName: "Padel FV",
    shortName: "Padel FV",
    siteDomain: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    supportEmail: "eventosdeportivosfv@gmail.com",
    tenantOrganizationSlug: process.env.NEXT_PUBLIC_TENANT_ORGANIZATION_SLUG || "padel-fv",
    logo: {
      // These SVGs wrap embedded raster artwork, so we use them as fixed brand assets.
      navbar: "/tenants/padel-fv/FV%20-%20LOGO%20SIN%20FONDO%20-%20LETRA%20BLANCA.svg",
      hero: "/tenants/padel-fv/FV%20-%20LOGO%20SIN%20FONDO%20-%20LETRA%20AZUL.svg",
      onLight: "/tenants/padel-fv/FV%20-%20LOGO%20SIN%20FONDO%20-%20LETRA%20AZUL.svg",
      onDark: "/tenants/padel-fv/FV%20-%20LOGO%20SIN%20FONDO%20-%20LETRA%20BLANCA.svg",
    },
    assets: {
      favicon: "/tenants/padel-fv/favicon.ico",
      favicon16: "/tenants/padel-fv/favicon-16x16.png",
      favicon32: "/tenants/padel-fv/favicon-32x32.png",
      appleTouchIcon: "/tenants/padel-fv/apple-touch-icon.png",
      manifest: "/tenants/padel-fv/site.webmanifest",
      placeholderLogo: "/placeholder-logo.svg",
      placeholderUser: "/placeholder-user.jpg",
    },
    seo: {
      title: "Padel FV",
      description: "Proximos torneos, sedes y registro simple para el circuito de Padel FV.",
    },
    home: {
      variant: "padel-fv",
      title: "Padel FV",
      subtitle: "Todos los proximos torneos del circuito en una vista simple, clara y lista para inscribirte.",
      ctaPrimary: "Ver proximos torneos",
      ctaSecondary: "Ver clubes",
    },
    features: {
      publicRanking: false,
      showRankingInNav: false,
      showTransferProofHighlights: false,
      playerPanelVariant: "padel-fv",
    },
    tournaments: {
      defaultPublicType: "LONG",
      theme: {
        className: "tournament-theme-padel-fv",
        primary: "#20335d",
        accent: "#c6de06",
        highlightSurface: "#f8fde1",
        onPrimary: "#ffffff",
        focusRing: "#c6de06",
      },
    },
  },
  "padel-elite": {
    key: "padel-elite",
    siteName: "PadelElite",
    shortName: "TPE Padel",
    siteDomain: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    supportEmail: "tpepadel@gmail.com",
    tenantOrganizationSlug: process.env.NEXT_PUBLIC_TENANT_ORGANIZATION_SLUG || "padel-elite",
    logo: {
      navbar: "/tenants/padel-elite/tpe-logo-text.svg",
      hero: "/tenants/padel-elite/tpe-logo-text.svg",
      mark: "/tenants/padel-elite/tpe-logo-mark.svg",
      onLight: "/tenants/padel-elite/tpe-logo-text.svg",
      onDark: "/tenants/padel-elite/tpe-logo-text.svg",
    },
    assets: {
      favicon: "/tenants/padel-elite/favicon.ico",
      favicon16: "/tenants/padel-elite/favicon-16x16.png",
      favicon32: "/tenants/padel-elite/favicon-32x32.png",
      appleTouchIcon: "/tenants/padel-elite/apple-touch-icon.png",
      manifest: "/tenants/padel-elite/site.webmanifest",
      placeholderLogo: "/placeholder-logo.svg",
      placeholderUser: "/placeholder-user.jpg",
    },
    seo: {
      title: "PadelElite",
      description: "Torneos semanales de padel con inscripcion clara, rapida y centrada en la experiencia del jugador.",
    },
    home: {
      variant: "padel-elite",
      title: "Proximos torneos de PadelElite",
      subtitle: "Toda la agenda semanal en un formato claro: categoria, horario, sede e inscripcion desde el primer vistazo.",
      ctaPrimary: "Ver torneos",
      ctaSecondary: "Ver clubes",
    },
    features: {
      publicRanking: true,
      showRankingInNav: true,
      showTransferProofHighlights: true,
      playerPanelVariant: "padel-elite",
    },
    tournaments: {
      defaultPublicType: "AMERICAN",
      theme: {
        className: "tournament-theme-padel-elite",
        primary: "#19214f",
        accent: "#c7dc77",
        highlightSurface: "#f2f4a6",
        onPrimary: "#fdfdf8",
        focusRing: "#2ac8ff",
      },
    },
  },
}

export function getTenantBranding(): TenantBranding {
  const tenantKey = process.env.NEXT_PUBLIC_TENANT_KEY as TenantBranding["key"] | undefined

  if (tenantKey && tenantKey in tenantBranding) {
    return tenantBranding[tenantKey]
  }

  return tenantBranding["padel-fv"]
}

export function getDefaultPublicTournamentType(): "LONG" | "AMERICAN" {
  return getTenantBranding().tournaments.defaultPublicType
}

export const TENANT_CONFIG = getTenantBranding()
