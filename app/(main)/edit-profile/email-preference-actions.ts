"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export const saveSoloEmailPreference = async (enabled: boolean): Promise<{ success: boolean; error?: string }> => {
  if (typeof enabled !== "boolean") return { success: false, error: "Preferencia inválida." }
  const client = await createClient()
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) return { success: false, error: "Iniciá sesión para guardar tu preferencia." }
  // User-editable metadata is appropriate for preferences, never for permissions.
  const { error } = await client.auth.updateUser({ data: { solo_player_emails: enabled } })
  if (error) return { success: false, error: "No pudimos guardar tu preferencia de correos." }
  revalidatePath("/edit-profile")
  return { success: true }
}
