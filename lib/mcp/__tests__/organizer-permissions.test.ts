import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { organizerCanReadLeague } from '../organizer-fixture'

jest.mock('server-only', () => ({}))
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))

const database = () => {
  const rows: Record<string, Record<string, unknown>[]> = {
    users: [{ id: 'owner', role: 'ORGANIZADOR' }, { id: 'club-owner', role: 'CLUB' }],
    tournaments: [
      { id: 'managed', organization_id: 'organization', club_id: 'club', type: 'LONG' },
      { id: 'other', organization_id: 'another-organization', club_id: 'another-club', type: 'LONG' },
      { id: 'short', organization_id: 'organization', club_id: 'club', type: 'SHORT' },
    ],
    organization_members: [{ user_id: 'owner', organizacion_id: 'organization', is_active: true }],
    clubes: [{ id: 'club', user_id: 'club-owner' }],
  }
  const from = (table: string) => {
    const predicates: Array<(row: Record<string, unknown>) => boolean> = []
    const read = async () => ({ data: rows[table]?.find(row => predicates.every(match => match(row))) ?? null, error: null })
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return query },
      single: read, maybeSingle: read,
    }
    return query
  }
  return { client: { from } as unknown as SupabaseClient, rows }
}

it('uses current management membership, rejects unrelated leagues and immediately honors removed access', async () => {
  const { client, rows } = database()
  expect(await organizerCanReadLeague(client, 'owner', 'managed')).toBe(true)
  expect(await organizerCanReadLeague(client, 'owner', 'other')).toBe(false)
  expect(await organizerCanReadLeague(client, 'owner', 'short')).toBe(false)
  rows.organization_members[0].is_active = false
  expect(await organizerCanReadLeague(client, 'owner', 'managed')).toBe(false)
  rows.organization_members[0].is_active = true
  rows.users[0].role = 'PLAYER'
  expect(await organizerCanReadLeague(client, 'owner', 'managed')).toBe(false)
  expect(createClient).not.toHaveBeenCalled()
})

it('enforces club ownership with the explicitly supplied database client', async () => {
  const { client } = database()
  expect(await organizerCanReadLeague(client, 'club-owner', 'managed')).toBe(true)
  expect(await organizerCanReadLeague(client, 'club-owner', 'other')).toBe(false)
  expect(createClient).not.toHaveBeenCalled()
})
