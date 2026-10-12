import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getTenantBranding } from '@/config/tenant'
import { isAttemptId } from './registration-diagnostics'

// Deliberately exclude message/details/hint/stack: they can contain personal data.
export const registrationErrorDetails = (error: unknown) => {
  if (!error || typeof error !== 'object') return {}
  const source = error as Record<string, unknown>
  const safe = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_]{1,64}$/.test(value) ? value : undefined
  return {
    errorCode: safe(source.code),
    errorName: safe(source.name),
    errorStatus: /^\d{3}$/.test(String(source.statusCode ?? source.status ?? ''))
      ? Number(source.statusCode ?? source.status) : undefined,
  }
}

export const createRegistrationTrace = (headers: Headers, operation: string) => {
  const requestId = randomUUID()
  const supplied = headers.get('x-registration-attempt')
  const attemptId = isAttemptId(supplied) ? supplied : requestId
  const startedAt = Date.now()
  const agent = headers.get('user-agent') || ''
  const context = {
    attemptId, requestId, operation, tenant: getTenantBranding().key,
    device: /Android/i.test(agent) ? 'android' : /iPhone|iPad/i.test(agent) ? 'ios' : 'other',
    browser: /Instagram|FBAN|FBAV|; wv\)/i.test(agent) ? 'embedded' : /Chrome/i.test(agent) ? 'chrome' : /Safari/i.test(agent) ? 'safari' : 'other',
  }
  let tournamentId: string | undefined
  let step = 'received'
  const log = (code: string, level: 'info' | 'warn' | 'error' = 'info', error?: unknown) => {
    console[level]('[registration]', JSON.stringify({
      ...context, tournamentId, step, code, elapsedMs: Date.now() - startedAt,
      ...registrationErrorDetails(error),
    }))
  }
  log('received')
  return {
    attemptId,
    tournament: (id: unknown) => { if (isAttemptId(id)) tournamentId = id },
    step: (next: string) => { step = next; log('started') },
    log,
    reply: (body: Record<string, unknown>, status: number, code: string, error?: unknown) => {
      log(code, status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', error)
      return NextResponse.json({ ...body, attemptId }, {
        status, headers: { 'x-registration-attempt': attemptId, 'Cache-Control': 'no-store' },
      })
    },
  }
}
