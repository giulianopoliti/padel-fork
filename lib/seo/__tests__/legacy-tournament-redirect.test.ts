jest.mock('@/config/tenant', () => ({ getTenantBranding: () => ({ tenantOrganizationSlug: 'padel-fv' }) }))
jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }))

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextRequest } from 'next/server'
import { getLegacyTournamentRedirectPath } from '../legacy-tournament-redirect'

const tournamentId = 'a7efb3dc-2eb3-4e07-8fdd-0b76af737bd8'
const organizationId = '2b23fe8d-d8bf-4628-8162-f1c127aa47a7'
const originalOrganizationId = process.env.TENANT_ORGANIZATION_ID
const originalOrganizationSlug = process.env.TENANT_ORGANIZATION_SLUG
const originalPublicOrganizationSlug = process.env.NEXT_PUBLIC_TENANT_ORGANIZATION_SLUG

describe('legacy tournament canonical redirect', () => {
  const query = {
    select: jest.fn(), eq: jest.fn(), neq: jest.fn(), maybeSingle: jest.fn(),
  }
  const supabase = { from: jest.fn(() => query) } as unknown as SupabaseClient

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.TENANT_ORGANIZATION_ID = organizationId
    delete process.env.TENANT_ORGANIZATION_SLUG
    delete process.env.NEXT_PUBLIC_TENANT_ORGANIZATION_SLUG
    for (const method of [query.select, query.eq, query.neq]) method.mockReturnValue(query)
    query.maybeSingle.mockResolvedValue({ data: { seo_slug: 'largo' }, error: null })
  })

  afterAll(() => {
    for (const [key, value] of Object.entries({
      TENANT_ORGANIZATION_ID: originalOrganizationId,
      TENANT_ORGANIZATION_SLUG: originalOrganizationSlug,
      NEXT_PUBLIC_TENANT_ORGANIZATION_SLUG: originalPublicOrganizationSlug,
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('resolves tournaments within the configured active tenant regardless of draft status', async () => {
    expect(await getLegacyTournamentRedirectPath(supabase, `/tournaments/${tournamentId}`)).toBe('/torneos/largo')
    expect(query.eq).toHaveBeenCalledWith('organization.id', organizationId)
    expect(query.eq).toHaveBeenCalledWith('organization.is_active', true)
    expect(query.neq).not.toHaveBeenCalled()
  })

  it.each(['/tournaments/create', `/tournaments/${tournamentId}/inscriptions`, '/torneos/largo', '/panel'])(
    'does not query or redirect %s', async pathname => {
      expect(await getLegacyTournamentRedirectPath(supabase, pathname)).toBeNull()
      expect(supabase.from).not.toHaveBeenCalled()
    },
  )

  it('uses the tenant slug when no organization ID is configured', async () => {
    delete process.env.TENANT_ORGANIZATION_ID
    process.env.TENANT_ORGANIZATION_SLUG = 'padel-elite'
    await getLegacyTournamentRedirectPath(supabase, `/tournaments/${tournamentId}`)
    expect(query.eq).toHaveBeenCalledWith('organization.slug', 'padel-elite')
  })

  it.each([
    { data: null, error: null },
    { data: { seo_slug: null }, error: null },
    { data: { seo_slug: ' ' }, error: null },
    { data: null, error: { message: 'unavailable' } },
  ])('keeps the ID renderer when the public query returns %p', async result => {
    query.maybeSingle.mockResolvedValue(result)
    expect(await getLegacyTournamentRedirectPath(supabase, `/tournaments/${tournamentId}`)).toBeNull()
  })

  it('returns an HTTP redirect before rendering, preserving query parameters and refreshed cookies', async () => {
    jest.useFakeTimers()
    try {
      const { updateSession } = require('@/utils/supabase/middleware') as typeof import('@/utils/supabase/middleware')
      jest.mocked(createServerClient).mockImplementation((...args: unknown[]) => {
        const options = args[2] as { cookies: { setAll: (cookies: unknown[]) => void } }
        return {
          ...supabase,
          auth: {
            getUser: async () => {
              options.cookies.setAll([{ name: 'refreshed-session', value: 'test', options: { path: '/' } }])
              return { data: { user: null }, error: null }
            },
          },
        } as unknown as ReturnType<typeof createServerClient>
      })
      const response = await updateSession(new NextRequest(`http://localhost:3000/tournaments/${tournamentId}?tag=uno&tag=dos`))
      expect(response.status).toBe(308)
      expect(response.headers.get('location')).toBe('http://localhost:3000/torneos/largo?tag=uno&tag=dos')
      expect(response.cookies.get('refreshed-session')?.value).toBe('test')
    } finally {
      jest.clearAllTimers()
      jest.useRealTimers()
    }
  })
})
