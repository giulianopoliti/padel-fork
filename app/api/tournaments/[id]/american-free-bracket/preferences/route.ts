import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { isAmericanLibreTournament } from '@/lib/services/americano-libre-format'

const preferencesSchema = z.object({ showZoneReferences: z.boolean() }).strict()

export const PATCH = async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params
    z.string().uuid().parse(id)
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ success: false, message: 'Iniciá sesión' }, { status: 401 })
    if (!(await checkTournamentPermissions(user.id, id)).hasPermission) {
      return NextResponse.json({ success: false, message: 'Sin permisos sobre el torneo' }, { status: 403 })
    }
    const input = preferencesSchema.parse(await request.json().catch(() => null))
    // Trusted management permission is checked before acquiring the privileged client.
    const service = await createClientServiceRole()
    const { data: tournament, error: readError } = await service.from('tournaments')
      .select('type,format_type,format_config').eq('id', id).single()
    if (readError || !tournament) return NextResponse.json({ success: false, message: 'No se encontró el torneo' }, { status: 404 })
    if (!isAmericanLibreTournament(tournament)) return NextResponse.json({ success: false, message: 'El torneo no es Americano libre' }, { status: 400 })
    const { data, error } = await service.from('tournaments')
      .update({ show_bracket_zone_references: input.showZoneReferences }).eq('id', id)
      .select('show_bracket_zone_references').single()
    if (error || !data) throw new Error('No se pudo guardar la visibilidad de las referencias. Intentá nuevamente.')
    return NextResponse.json({ success: true, showZoneReferences: data.show_bracket_zone_references })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof z.ZodError ? 'Preferencia inválida' : error instanceof Error ? error.message : 'No se pudo guardar la preferencia' },
      { status: error instanceof z.ZodError ? 400 : 500 })
  }
}
