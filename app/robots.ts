import type { MetadataRoute } from "next"
import { getTenantCanonicalSiteUrl } from "@/config/tenant"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/admin-login",
        "/auth/",
        "/complete-google-profile",
        "/edit-profile",
        "/forgot-password",
        "/login",
        "/my-players",
        "/my-tournaments",
        "/panel/",
        "/panel-cpa/",
        "/pending-approval",
        "/profile/",
        "/register",
        "/registro-organizador",
        "/reset-password",
        "/super-panel",
        "/tournaments/",
      ],
    },
    sitemap: new URL("/sitemap.xml", getTenantCanonicalSiteUrl()).toString(),
  }
}
