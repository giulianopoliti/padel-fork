import "./globals.css"
import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { getTenantBranding } from "@/config/tenant"

const branding = getTenantBranding()

export const metadata: Metadata = {
  applicationName: branding.siteName,
  title: {
    default: branding.seo.title,
    template: `%s | ${branding.shortName}`,
  },
  description: branding.seo.description,
  icons: {
    icon: [
      { url: branding.assets.favicon },
      { url: branding.assets.favicon16, sizes: "16x16", type: "image/png" },
      { url: branding.assets.favicon32, sizes: "32x32", type: "image/png" },
    ],
    apple: { url: branding.assets.appleTouchIcon, sizes: "180x180", type: "image/png" },
  },
  manifest: branding.assets.manifest,
  appleWebApp: {
    capable: true,
    title: branding.shortName,
    statusBarStyle: "black-translucent",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": branding.shortName,
  },
}

export const viewport: Viewport = {
  themeColor: branding.tournaments.theme.primary,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="bg-slate-50">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
