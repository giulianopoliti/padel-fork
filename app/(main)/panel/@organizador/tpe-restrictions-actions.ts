"use server"

import { getTenantBranding } from "@/config/tenant"
import { createClient } from "@/utils/supabase/server"
import { setTpePlayerBlock } from "@/lib/services/tpe-registration-restrictions"

export const updateTpePlayerBlock = async (playerId: string, blocked: boolean) => {
  if (getTenantBranding().key !== "padel-elite") return { success: false, error: "Acción no disponible" }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Debes iniciar sesión" }

  const { data: userData } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle()
  if (userData?.role !== "ORGANIZADOR") return { success: false, error: "Solo los organizadores pueden gestionar restricciones" }

  try {
    await setTpePlayerBlock({ playerId, actorUserId: user.id, blocked })
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo actualizar la restricción" }
  }
}
