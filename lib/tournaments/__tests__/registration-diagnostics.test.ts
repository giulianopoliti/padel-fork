import { NextRequest } from 'next/server'
import { POST } from '@/app/api/inscriptions/diagnostics/route'
import { createRegistrationTrace, registrationErrorDetails } from '../registration-log'
import { createRegistrationAttemptId, fetchRegistrationJson, isAttemptId, reportRegistrationClientError } from '../registration-diagnostics'

const attemptId = '11111111-1111-4111-8111-111111111111'
const tournamentId = '22222222-2222-4222-8222-222222222222'
const event = { attemptId, tournamentId, stage: 'prepare-proof', code: 'preparation_failed' }
let sequence = 0
const request = (body: unknown, headers: Record<string, string> = {}) => new NextRequest('https://tpepadel.com/api/inscriptions/diagnostics', {
  method: 'POST', body: JSON.stringify(body), headers: {
    origin: 'https://tpepadel.com', 'content-type': 'application/json',
    'x-forwarded-for': `test-${++sequence}`, ...headers,
  },
})

describe('registration diagnostics privacy and bounds', () => {
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('supports browsers without randomUUID', () => {
    expect(isAttemptId(createRegistrationAttemptId())).toBe(true)
  })

  it('stops waiting for a stalled response body without retrying the write', async () => {
    jest.useFakeTimers()
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => ({
      status: 200,
      json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    } as Response))
    try {
      const pending = fetchRegistrationJson('/test', { method: 'POST' }, 100)
      const assertion = expect(pending).rejects.toThrow('consultar si quedó guardado')
      await jest.advanceTimersByTimeAsync(100)
      await assertion
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally { jest.useRealTimers() }
  })

  it('keeps correlation while excluding private error fields and raw user agents', async () => {
    const trace = createRegistrationTrace(new Headers({ 'x-registration-attempt': attemptId, 'user-agent': 'Android secret-device Chrome' }), 'proof')
    trace.tournament(tournamentId)
    trace.step('storage-upload')
    const response = trace.reply({ success: false }, 500, 'storage_failed', {
      code: 'AccessDenied', statusCode: '403', message: 'bank-alias secret', details: 'phone', hint: 'token',
    })
    expect(response.headers.get('x-registration-attempt')).toBe(attemptId)
    expect(await response.json()).toMatchObject({ attemptId })
    const logged = JSON.stringify(jest.mocked(console.error).mock.calls)
    expect(logged).toContain('AccessDenied')
    expect(logged).toContain('android')
    expect(logged).not.toMatch(/bank-alias|secret-device|phone|token/)
  })

  it('replaces invalid correlation headers instead of logging them', () => {
    const trace = createRegistrationTrace(new Headers({ 'x-registration-attempt': 'private-bank-alias' }), 'proof')
    expect(isAttemptId(trace.attemptId)).toBe(true)
    expect(JSON.stringify(jest.mocked(console.info).mock.calls)).not.toContain('private-bank-alias')
    expect(registrationErrorDetails({ code: 'bad code with data', status: 'private', name: 'secret/name' })).toEqual({ errorCode: undefined, errorName: undefined, errorStatus: undefined })
  })

  it('accepts a bounded client observation with its correlation code', async () => {
    expect((await POST(request(event))).status).toBe(204)
    expect(JSON.stringify(jest.mocked(console.warn).mock.calls)).toContain(attemptId)
  })

  it.each([
    { ...event, message: 'private error text' },
    { ...event, stage: 'bank-alias' },
    { ...event, code: 'arbitrary code' },
    { ...event, tournamentId: 'not-a-uuid' },
  ])('rejects unapproved diagnostic fields', async payload => {
    expect((await POST(request(payload))).status).toBe(400)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('rejects oversized reports even without Content-Length', async () => {
    expect((await POST(request({ ...event, extra: 'x'.repeat(3000) }))).status).toBe(413)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('rejects cross-origin reports', async () => {
    expect((await POST(request(event, { origin: 'https://elsewhere.test' }))).status).toBe(403)
  })

  it('limits repeated reports per instance', async () => {
    for (let i = 0; i < 20; i++) expect((await POST(request(event, { 'x-forwarded-for': 'limit-test' }))).status).toBe(204)
    expect((await POST(request(event, { 'x-forwarded-for': 'limit-test' }))).status).toBe(429)
  })

  it('does not let failed telemetry reject the browser operation', async () => {
    const originalWindow = global.window
    const originalFetch = global.fetch
    global.window = {} as Window & typeof globalThis
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'))
    try {
      expect(() => reportRegistrationClientError({ attemptId, tournamentId, stage: 'prepare-proof', code: 'preparation_failed' })).not.toThrow()
      await Promise.resolve()
      expect(global.fetch).toHaveBeenCalledTimes(1)
    } finally { global.window = originalWindow; global.fetch = originalFetch }
  })
})
