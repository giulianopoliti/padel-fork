import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { processInscriptionProofCleanup } from '@/lib/services/inscription-proofs'

export const GET = async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET
  const actual = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ success: false }, { status: 401 })
  }
  try {
    return NextResponse.json({ success: true, ...await processInscriptionProofCleanup(50) })
  } catch {
    return NextResponse.json({ success: false, message: 'No se pudo procesar la limpieza.' }, { status: 503 })
  }
}
