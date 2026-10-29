import { NextRequest, NextResponse } from 'next/server'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentAccess } from '@/utils/tournament-permissions'
import { getRegistrationReadiness } from '@/lib/services/registration/registration-readiness'

type Context = { params: Promise<{ id: string }> }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const authorize = async (tournamentId: string): Promise<string | null> => {
  const client = await createClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return null
  const access = await checkTournamentAccess(user.id, tournamentId)
  return access.permissions.includes('manage_inscriptions') ? user.id : null
}
export const GET = async (_request: NextRequest, context: Context) => {
  const { id } = await context.params
  if (!await authorize(id)) return reply({ message: 'Sin permisos para gestionar las inscripciones.' }, 403)
  try { return reply(await getRegistrationReadiness(id)) }
  catch { return reply({ message: 'No se pudo consultar la preparación del torneo. Reintentá.' }, 500) }
}
export const POST = async (request: NextRequest, context: Context) => {
  const { id } = await context.params
  const actor = await authorize(id)
  if (!actor) return reply({ message: 'Sin permisos para gestionar las inscripciones.' }, 403)
  try {
    const { signature } = await request.json() as { signature?: unknown }
    if (typeof signature !== 'string' || !/^[a-f0-9]{32}$/.test(signature)) return reply({ message: 'Actualizá el listado de pendientes.' }, 400)
    const client = await createClientServiceRole()
    const { error } = await client.rpc('acknowledge_registration_exclusions', { p_tournament_id: id, p_actor: actor, p_signature: signature })
    if (error) return reply({ message: ['PT409','40001'].includes(error.code) ? 'Las inscripciones cambiaron. Revisá el listado actualizado.' : 'No se pudo confirmar la revisión.' }, error.code === '42501' ? 403 : 409)
    return reply(await getRegistrationReadiness(id))
  } catch { return reply({ message: 'No se pudo confirmar la revisión. Actualizá antes de reintentar.' }, 500) }
}
