jest.mock('server-only', () => ({}))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/services/tenant-organization.service', () => ({ getTenantOrganization: jest.fn() }))

import { createClient } from '@/utils/supabase/server'
import { getTenantOrganization } from '@/lib/services/tenant-organization.service'
import { getPublicTournamentById, getPublicTournamentBySlug } from '../public-tournament.service'

describe('tournament route resolution', () => {
  const draft = { id: 'draft-tournament', seo_slug: 'draft-slug', organization_id: 'tenant', is_draft: true }
  const query = {
    select: jest.fn(), eq: jest.fn(), neq: jest.fn(), maybeSingle: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    for (const method of [query.select, query.eq, query.neq]) method.mockReturnValue(query)
    query.maybeSingle.mockResolvedValue({ data: draft, error: null })
    jest.mocked(createClient).mockResolvedValue({ from: jest.fn(() => query) } as unknown as Awaited<ReturnType<typeof createClient>>)
    jest.mocked(getTenantOrganization).mockResolvedValue({ id: 'tenant', slug: 'tenant', name: 'Tenant', description: null, logo_url: null })
  })

  it('resolves a draft by ID for canonical redirects', async () => {
    expect(await getPublicTournamentById(draft.id)).toMatchObject({ id: draft.id, seo_slug: draft.seo_slug, isAlias: false })
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'tenant')
    expect(query.neq).not.toHaveBeenCalled()
  })

  it('opens a draft by its current slug', async () => {
    expect(await getPublicTournamentBySlug(draft.seo_slug)).toMatchObject({ id: draft.id, isAlias: false })
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'tenant')
    expect(query.neq).not.toHaveBeenCalled()
  })

  it('resolves a draft through an old slug', async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { tournament: draft }, error: null })
    expect(await getPublicTournamentBySlug('old-slug')).toEqual({ id: draft.id, seo_slug: draft.seo_slug, isAlias: true })
  })

  it('rejects an alias belonging to another tenant', async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { tournament: { ...draft, organization_id: 'other-tenant' } }, error: null })
    expect(await getPublicTournamentBySlug('other-slug')).toBeNull()
  })
})
