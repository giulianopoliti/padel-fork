import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/utils/supabase/server"
import { isSoloPlayersEnabled } from "@/config/solo-players"

export const dynamic = "force-dynamic"
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const reply = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
  if (!isSoloPlayersEnabled()) return reply({ error: "Esta función todavía no está disponible." }, 404)
  const input = z.object({ postId: z.string().uuid().nullable(), requestId: z.string().uuid().nullable() })
    .refine(value => !!value.postId !== !!value.requestId).safeParse({ postId: request.nextUrl.searchParams.get("postId"), requestId: request.nextUrl.searchParams.get("requestId") })
  if (!input.success) return reply({ error: "Elegí una publicación o solicitud válida." }, 400)
  try {
    const client = await createClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (!user || authError) return reply({ error: "Iniciá sesión para consultar el contacto." }, 401)
    const { data, error } = await client.rpc("get_solo_player_contact", input.data.requestId ? { p_request_id: input.data.requestId } : { p_post_id: input.data.postId })
    const contact = Array.isArray(data) ? input.data.requestId ? data.find(row => row.user_id !== user.id) : data[0] : null
    if (error || !contact?.phone) return reply({ error: "Este contacto no está disponible. El jugador debe autorizar compartirlo." }, 403)
    return reply({ phone: contact.phone }, 200)
  } catch { return reply({ error: "No pudimos consultar el contacto." }, 500) }
}
