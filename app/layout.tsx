import "./globals.css"
import { Barlow_Condensed, Space_Grotesk } from "next/font/google"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { getTenantBranding, getTenantCanonicalSiteUrl } from "@/config/tenant"

const eliteDisplay = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-elite-display", display: "swap" })
const eliteBody = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-elite-body", display: "swap" })

const branding = getTenantBranding()

export const metadata: Metadata = {
  metadataBase: new URL(getTenantCanonicalSiteUrl()),
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
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black",
    "apple-mobile-web-app-title": branding.shortName,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`bg-slate-50 ${branding.key === "padel-elite" ? `${eliteDisplay.variable} ${eliteBody.variable}` : ""}`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
