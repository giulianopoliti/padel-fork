import { getTenantBranding } from "./tenant"

/** Local QA remains opt-in and never selects a remote project implicitly. */
export const isSoloPlayersLocalBackend = (): boolean => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    return ["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  } catch {
    return false
  }
}

/** Each production site can use only its own Supabase project. */
export const isSoloPlayersProductionBackend = (): boolean => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    const project = getTenantBranding().key === "padel-elite" ? "lzowflvgnspjdbvdxliy" : "bfmaqrythlwbfjuqumom"
    return url.origin === `https://${project}.supabase.co` && url.pathname === "/" && !url.username && !url.password
  } catch {
    return false
  }
}

/** The release is enabled on its production backend, with an explicit off switch. */
export const isSoloPlayersEnabled = (): boolean => {
  if (process.env.NEXT_PUBLIC_SOLO_PLAYERS_ENABLED === "false") return false
  if (isSoloPlayersProductionBackend()) return true
  return process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW === "true" && isSoloPlayersLocalBackend()
}
