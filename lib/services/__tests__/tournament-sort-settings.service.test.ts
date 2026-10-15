jest.mock('server-only', () => ({}))
jest.mock('@/config/tenant', () => ({ getTenantBranding: () => ({ key: 'padel-fv' }) }))

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTournamentSortSettings } from '../tournament-sort-settings.service'

const prepare = (rules: unknown, role: string | null, error: unknown = null) => {
  const filters: Record<string, Record<string, unknown>> = {}
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'viewer' } }, error: null }) },
    from: (table: string) => {
      filters[table] = {}
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[table][key] = value; return query },
        maybeSingle: async () => table === 'organization_members'
          ? { data: role ? { member_role: role } : null, error: null }
          : { data: rules == null ? null : { rules }, error },
      }
      return query
    },
  } as unknown as SupabaseClient
  return { supabase, filters }
}

it('reads persisted priority by screen from the connected tenant database', async () => {
  const rules = [{ field: 'category', direction: 'desc' }, { field: 'created_at', direction: 'asc' }]
  const { supabase, filters } = prepare(rules, 'admin')
  expect(await getTournamentSortSettings(supabase, 'my-tournaments')).toEqual({ rules, configured: true, canEdit: true })
  expect(filters.tenant_tournament_list_settings).toEqual({ surface: 'my-tournaments' })
  expect(filters.organization_members).toEqual({ user_id: 'viewer', is_active: true })
})
it('uses defaults only when no configuration exists, without giving members edit permission', async () => {
  const { supabase } = prepare(null, 'member')
  expect(await getTournamentSortSettings(supabase, 'panel')).toEqual({ rules: [{ field: 'start_date', direction: 'asc' }], configured: false, canEdit: false })
})
it('does not disguise storage errors or malformed saved settings as defaults', async () => {
  await expect(getTournamentSortSettings(prepare(null, 'admin', new Error('Unavailable')).supabase, 'panel')).rejects.toThrow('Unavailable')
  await expect(getTournamentSortSettings(prepare([{ field: 'status', direction: 'asc' }], 'admin').supabase, 'my-tournaments')).rejects.toThrow('no es válido')
})
