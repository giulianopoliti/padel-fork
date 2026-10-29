import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { processInscriptionProofCleanup } from '@/lib/services/inscription-proofs'
import { processRegistrationEvents } from '@/lib/services/messages/registration-delivery'

export const GET = async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET
  const actual = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ success: false }, { status: 401 })
  }
  try {
    const results = await Promise.allSettled([processInscriptionProofCleanup(50), processRegistrationEvents(50)])
    const cleanup = results[0].status === 'fulfilled' ? results[0].value : null
    const notifications = results[1].status === 'fulfilled' ? results[1].value : null
    return NextResponse.json({ success: Boolean(cleanup && notifications), cleanup, notifications }, { status: cleanup && notifications ? 200 : 503 })
  } catch {
    return NextResponse.json({ success: false, message: 'No se pudo procesar la limpieza.' }, { status: 503 })
  }
}
