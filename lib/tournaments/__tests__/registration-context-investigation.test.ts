// Regression coverage: concurrent requests must retain their own authenticated client.
import { createClient } from '@/utils/supabase/server'
import { getRegistrationService, resetRegistrationService } from '@/lib/services/registration/registration.service'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/services/registration/registration-strategy.factory', () => ({}))
jest.mock('@/lib/services/tournament-category-config', () => ({}))
jest.mock('@/lib/services/messages', () => ({}))
jest.mock('@/lib/services/tournament-capacity.service', () => ({}))
jest.mock('@/lib/services/tpe-registration-restrictions', () => ({}))
jest.mock('@/config/tenant', () => ({}))

it('keeps each request user and Supabase client together when auth awaits overlap', async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
  resetRegistrationService()
  let releaseAuthA!: () => void
  let authAStarted!: () => void
  const started = new Promise<void>(resolve => { authAStarted = resolve })
  const authA = new Promise<void>(resolve => { releaseAuthA = resolve })
  const makeClient = (id: string) => ({
    auth: { getUser: jest.fn(async () => {
      if (id === 'A') { authAStarted(); await authA }
      return { data: { user: { id, email: `${id}@example.test` } }, error: null }
    }) },
    from: jest.fn((table: string) => ({ select: () => ({ eq: () => ({ single: async () => ({
      data: table === 'users' ? { role: 'PLAYER' } : { id: 'tournament', type: 'AMERICAN' },
      error: null,
    }) }) }) })),
  })
  const clientA = makeClient('A')
  const clientB = makeClient('B')
  jest.mocked(createClient).mockResolvedValueOnce(clientA as never).mockResolvedValueOnce(clientB as never)
  const service = getRegistrationService() as unknown as {
    prepareContext: (id: string) => Promise<{ success: boolean; context: { user: { id: string }; supabase: unknown } }>
  }
  try {
    const pendingA = service.prepareContext('tournament')
    await started
    const resultB = await service.prepareContext('tournament')
    releaseAuthA()
    const resultA = await pendingA
    expect(resultA.success).toBe(true)
    expect(resultB.success).toBe(true)
    expect(resultB.context.user.id).toBe('B')
    expect(resultA.context.user.id).toBe('A')
    expect(resultA.context.supabase).toBe(clientA)
    expect(resultB.context.supabase).toBe(clientB)
    expect(clientA.from.mock.calls).toEqual([['users'], ['tournaments']])
    expect(clientB.from.mock.calls).toEqual([['users'], ['tournaments']])
  } finally {
    releaseAuthA()
    resetRegistrationService()
    jest.restoreAllMocks()
  }
})
