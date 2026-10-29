import { NextRequest, NextResponse } from 'next/server'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'
import { checkTournamentAccess } from '@/utils/tournament-permissions'
import { getRegistrationReadiness } from '@/lib/services/registration/registration-readiness'
import { revalidatePath } from 'next/cache'
import { scheduleInscriptionProofCleanup } from '@/lib/services/inscription-proofs'

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

export const DELETE = async (request: NextRequest, context: Context) => {
  const { id } = await context.params
  if (!await authorize(id)) return reply({ message: 'Sin permisos para gestionar las inscripciones.' }, 403)
  let inscriptionId: unknown
  let revision: unknown
  try { ({ inscriptionId, revision } = await request.json()) }
  catch { return reply({ message: 'Actualizá la inscripción antes de descartarla.' }, 400) }
  if (typeof inscriptionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(inscriptionId)
    || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    return reply({ message: 'Actualizá la inscripción antes de descartarla.' }, 400)
  }
  try {
    const client = await createClientServiceRole()
    // The predicate is rechecked under the row lock: a receipt upload or an
    // acceptance in another tab must not turn a stale discard into a deletion.
    const { data, error } = await client.from('inscriptions').delete()
      .eq('id', inscriptionId).eq('tournament_id', id).eq('occupies_slot', false)
      .eq('payment_revision', revision).eq('es_prueba', false).not('couple_id', 'is', null)
      .select('id').maybeSingle()
    if (error) return reply({ message: 'No se pudo descartar la inscripción. Actualizá el listado antes de reintentar.' }, 500)
    if (!data) return reply({ message: 'La inscripción cambió o ya fue resuelta. Revisá el listado actualizado.' }, 409)
    scheduleInscriptionProofCleanup()
    revalidatePath(`/tournaments/${id}`)
    revalidatePath(`/tournaments/${id}/inscriptions`)
    revalidatePath('/panel')
    revalidatePath('/torneos', 'layout')
    return reply({ success: true })
  } catch { return reply({ message: 'No se pudo confirmar el resultado. Actualizá el listado antes de reintentar.' }, 500) }
}
