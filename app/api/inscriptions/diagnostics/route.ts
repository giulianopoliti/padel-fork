import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRegistrationTrace } from '@/lib/tournaments/registration-log'
import { REGISTRATION_CLIENT_CODES, REGISTRATION_CLIENT_STAGES } from '@/lib/tournaments/registration-diagnostics'

const schema = z.object({
  attemptId: z.string().uuid(), tournamentId: z.string().uuid(),
  stage: z.enum(REGISTRATION_CLIENT_STAGES), code: z.enum(REGISTRATION_CLIENT_CODES),
  status: z.number().int().min(100).max(599).optional(),
}).strict()
// Bounded per-instance throttle; not a global abuse prevention service.
const limits = new Map<string, { count: number; until: number }>()

export const POST = async (request: NextRequest) => {
  if (request.headers.get('origin') !== request.nextUrl.origin) return new NextResponse(null, { status: 403 })
  const now = Date.now()
  for (const [key, entry] of limits) if (entry.until <= now) limits.delete(key)
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const entry = limits.get(key) || { count: 0, until: now + 60_000 }
  if (entry.count >= 20 || (!limits.has(key) && limits.size >= 1000)) return new NextResponse(null, { status: 429 })
  entry.count++
  limits.set(key, entry)
  try {
    const reader = request.body?.getReader()
    if (!reader) return new NextResponse(null, { status: 400 })
    const decoder = new TextDecoder()
    let text = ''
    let size = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 2048) {
          await reader.cancel()
          return new NextResponse(null, { status: 413 })
        }
        text += decoder.decode(part.value, { stream: true })
      }
      text += decoder.decode()
    } finally { reader.releaseLock() }
    const result = schema.safeParse(JSON.parse(text))
    if (!result.success) return new NextResponse(null, { status: 400 })
    const event = result.data
    const headers = new Headers(request.headers)
    headers.set('x-registration-attempt', event.attemptId)
    const trace = createRegistrationTrace(headers, 'browser-report')
    trace.tournament(event.tournamentId)
    trace.step(event.stage)
    // Client reports are observations, never confirmation of a database write.
    trace.log(event.code, 'warn', { status: event.status })
    return new NextResponse(null, { status: 204 })
  } catch { return new NextResponse(null, { status: 400 }) }
}
