import { getTenantBranding } from "@/config/tenant"
import { sendTransactionalEmail } from "./resend-client"

export type SupabaseLike = {
  from: (table: string) => any
}

export type Player = {
  id: string
  first_name: string | null
  last_name: string | null
  phone?: string | null
  user_id?: string | null
  users?: { email?: string | null } | Array<{ email?: string | null }> | null
}

export type TournamentEmailContext = {
  id: string
  name: string
  type: string | null
  category_name: string | null
  price?: number | null
  start_date?: string | null
  end_date?: string | null
  club_id?: string | null
  organization_id?: string | null
  organizador_id?: string | null
}

export const getNotificationSupabase = async (fallbackSupabase: SupabaseLike): Promise<SupabaseLike> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fallbackSupabase
  }

  const { supabaseAdmin } = await import("@/lib/supabase-admin")
  return supabaseAdmin
}

export const normalizeEmail = (email: string | null | undefined) => {
  const normalized = email?.trim().toLowerCase()
  return normalized && normalized.includes("@") ? normalized : null
}

export const uniqueEmails = (emails: Array<string | null | undefined>) =>
  Array.from(new Set(emails.map(normalizeEmail).filter(Boolean))) as string[]

export const getRelatedEmail = (player: Player | null) => {
  const users = Array.isArray(player?.users) ? player?.users[0] : player?.users
  return normalizeEmail(users?.email)
}

export const fetchPlayersWithEmails = async (supabase: SupabaseLike, playerIds: string[]) => {
  const ids = Array.from(new Set(playerIds.filter(Boolean)))
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from("players")
    .select("id, first_name, last_name, phone, user_id, users!players_user_id_fkey(email)")
    .in("id", ids)

  if (error) {
    console.error("[email] Error fetching players for notification:", error)
    return []
  }

  return (data || []) as Player[]
}

export const sendSafely = async (args: Parameters<typeof sendTransactionalEmail>[0], label: string) => {
  const result = await sendTransactionalEmail(args)

  if (result.success === false) {
    console.error(`[email] ${label} failed:`, result.error)
  } else if (result.skipped) {
    console.log(`[email] ${label} skipped: ${result.reason}`)
  }

  return result
}

const fetchUserEmails = async (supabase: SupabaseLike, userIds: Array<string | null | undefined>) => {
  const ids = Array.from(new Set(userIds.filter(Boolean))) as string[]
  if (ids.length === 0) return []

  const { data, error } = await supabase.from("users").select("id, email").in("id", ids)

  if (error) {
    console.error("[email] Error fetching user emails:", error)
    return []
  }

  return uniqueEmails((data || []).map((user: any) => user.email))
}

export const resolveTournamentNotificationRecipients = async (
  supabase: SupabaseLike,
  tournament: TournamentEmailContext,
) => {
  const organizerEmails: string[] = []

  if (tournament.organizador_id) {
    organizerEmails.push(...(await fetchUserEmails(supabase, [tournament.organizador_id])))
  }

  if (tournament.organization_id) {
    const { data: organization, error: organizationError } = await supabase
      .from("organizaciones")
      .select("email")
      .eq("id", tournament.organization_id)
      .maybeSingle()

    if (organizationError) {
      console.error("[email] Error fetching organization email:", organizationError)
    }

    organizerEmails.push(organization?.email || null)

    const { data: members, error: membersError } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organizacion_id", tournament.organization_id)
      .eq("is_active", true)

    if (membersError) {
      console.error("[email] Error fetching organization members:", membersError)
    }

    organizerEmails.push(...(await fetchUserEmails(supabase, (members || []).map((member: any) => member.user_id))))
  }

  if (tournament.club_id) {
    const { data: club, error: clubError } = await supabase
      .from("clubes")
      .select("email, user_id")
      .eq("id", tournament.club_id)
      .maybeSingle()

    if (clubError) {
      console.error("[email] Error fetching club email:", clubError)
    }

    organizerEmails.push(club?.email || null)
    organizerEmails.push(...(await fetchUserEmails(supabase, [club?.user_id])))
  }

  const branding = getTenantBranding()
  const tenantEmails = uniqueEmails([branding.supportEmail, process.env.EMAIL_REPLY_TO])

  return {
    organizerEmails: uniqueEmails(organizerEmails),
    tenantEmails,
    adminEmails: uniqueEmails([...organizerEmails, ...tenantEmails]),
  }
}
