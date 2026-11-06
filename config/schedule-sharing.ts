import { getTenantBranding } from './tenant'

export const SCHEDULE_SHARING_SCHEMA_VERSION = 2

/** Deployment opt-in only. The configured database already determines the tenant. */
export const isScheduleSharingEnabled = (): boolean => {
  if (process.env.NEXT_PUBLIC_SCHEDULE_SHARING_ENABLED !== 'true') return false
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return true
    const ref = getTenantBranding().key === 'padel-elite' ? 'lzowflvgnspjdbvdxliy' : 'bfmaqrythlwbfjuqumom'
    return url.origin === `https://${ref}.supabase.co` && url.pathname === '/'
  } catch { return false }
}
