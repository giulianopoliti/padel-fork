import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { presentPayment, type PaymentInscription } from '@/lib/tournaments/payment-types'

export const GET = async (request: NextRequest) => {
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
  try {
    const ids = [...new Set((request.nextUrl.searchParams.get('ids') || '').split(',').filter(Boolean))]
    if (!ids.length || ids.length > 100 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return reply({ success: false }, 400)
    const client = await createClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (!user || authError) return reply({ success: false }, 401)
    const { data: player, error: playerError } = await supabaseAdmin.from('players').select('id').eq('user_id', user.id).maybeSingle()
    if (playerError) throw playerError
    if (!player) return reply({ success: true, inscriptions: {} })
    const { data: couples, error: couplesError } = await supabaseAdmin.from('couples').select('id')
      .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
    if (couplesError) throw couplesError
    const coupleIds = (couples || []).map(couple => couple.id)
    const { data: rows, error } = await supabaseAdmin.from('inscriptions')
      .select('id, tournament_id, couple_id, occupies_slot, proof_waived_at, payment_method, payment_proof_path, payment_proof_status, is_pending, payment_revision,tournaments(enable_transfer_proof)')
      .in('tournament_id', ids)
      .or(`and(couple_id.is.null,player_id.eq.${player.id})${coupleIds.length ? `,couple_id.in.(${coupleIds.join(',')})` : ''}`)
    if (error) throw error
    const inscriptions: Record<string, PaymentInscription> = {}
    for (const row of rows || []) inscriptions[row.tournament_id] = {
      ...presentPayment(row, (Array.isArray(row.tournaments) ? row.tournaments[0] : row.tournaments)?.enable_transfer_proof === true),
      individual: !row.couple_id,
    }
    return reply({ success: true, inscriptions })
  } catch { return reply({ success: false, message: 'No se pudieron consultar tus inscripciones.' }, 500) }
}
