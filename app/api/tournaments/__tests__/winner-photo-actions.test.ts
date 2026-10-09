jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { revalidatePath } from 'next/cache'
import { uploadWinnerPhoto } from '../winner-photo-actions'

const createClientMock = createClient as jest.Mock
const permissionsMock = checkTournamentPermissions as jest.Mock

interface MockQuery {
  select: jest.Mock
  eq: jest.Mock
  in: jest.Mock
  update: jest.Mock
  upsert: jest.Mock
  not: jest.Mock
  maybeSingle: jest.Mock
  limit: jest.Mock
  then: (resolve: (result: unknown) => unknown) => Promise<unknown>
}

describe('winner photo server authorization and persistence', () => {
  let tournament: Record<string, unknown>
  let finalMatches: Array<{ id: string; winner_id: string; bracket_key: string }>
  let saved: { data: { id: string } | null; error: unknown }
  let bucket: { upload: jest.Mock; remove: jest.Mock; getPublicUrl: jest.Mock }
  let update: jest.Mock
  let client: { from: jest.Mock; storage: { from: jest.Mock }; auth: { getUser: jest.Mock } }
  const file = () => new File([new Uint8Array([255, 216, 255, 224])], 'champions.jpg', { type: 'image/jpeg' })

  beforeEach(() => {
    jest.clearAllMocks()
    tournament = { id: 'tournament', name: 'Torneo', status: 'FINISHED_POINTS_PENDING', winner_id: 'champions', winner_image_url: null }
    finalMatches = [{ id: 'final', winner_id: 'champions', bracket_key: 'MAIN' }]
    saved = { data: { id: 'tournament' }, error: null }
    bucket = { upload: jest.fn().mockResolvedValue({ error: null }), remove: jest.fn().mockResolvedValue({ error: null }), getPublicUrl: jest.fn((path: string) => ({ data: { publicUrl: `https://fv.supabase.co/storage/v1/object/public/tournaments/${path}` } })) }
    update = jest.fn()
    client = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'organizer' } } }) },
      storage: { from: jest.fn(() => bucket) },
      from: jest.fn((table: string) => {
        let updating = false
        const query: MockQuery = {
          select: jest.fn(() => query), eq: jest.fn(() => query), in: jest.fn(() => query),
          update: jest.fn((value: unknown) => { update(value); updating = true; return query }),
          upsert: jest.fn((value: unknown) => { update(value); updating = true; return query }),
          not: jest.fn(() => query),
          then: (resolve: (result: unknown) => unknown) => Promise.resolve(resolve({ data: table === 'matches' ? finalMatches : [], error: null })),
          maybeSingle: jest.fn(async () => updating ? saved : { data: tournament, error: null }),
          limit: jest.fn(async () => ({ data: table === 'matches' ? finalMatches : [], error: null })),
        }
        return query
      }),
    }
    createClientMock.mockResolvedValue(client)
    permissionsMock.mockResolvedValue({ hasPermission: true, userRole: 'ORGANIZADOR' })
  })

  it.each(['PLAYER', 'COACH', 'CLUB', 'ADMIN'])('rejects role %s even with general management permission', async (userRole) => {
    permissionsMock.mockResolvedValue({ hasPermission: true, userRole })
    expect((await uploadWinnerPhoto('tournament', file())).success).toBe(false)
    expect(bucket.upload).not.toHaveBeenCalled()
  })
  it('rejects an organizer of another organization', async () => {
    permissionsMock.mockResolvedValue({ hasPermission: false, userRole: 'ORGANIZADOR' })
    expect((await uploadWinnerPhoto('tournament', file())).success).toBe(false)
    expect(bucket.upload).not.toHaveBeenCalled()
  })
  it('rejects unauthenticated requests before accessing storage', async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: null } })
    expect((await uploadWinnerPhoto('tournament', file())).success).toBe(false)
    expect(bucket.upload).not.toHaveBeenCalled()
  })
  it('rejects unfinished tournaments, stale winners and missing champion finals', async () => {
    tournament.status = 'BRACKET_PHASE'
    expect((await uploadWinnerPhoto('tournament', file())).success).toBe(false)
    tournament.status = 'FINISHED_POINTS_PENDING'
    expect((await uploadWinnerPhoto('tournament', file(), { matchId: 'final', winnerId: 'losers' })).success).toBe(false)
    finalMatches = []
    expect((await uploadWinnerPhoto('tournament', file())).success).toBe(false)
    expect(bucket.upload).not.toHaveBeenCalled()
  })
  it('checks actual image contents and size before uploading', async () => {
    expect((await uploadWinnerPhoto('tournament', new File(['not an image'], 'x.jpg', { type: 'image/jpeg' }))).success).toBe(false)
    expect((await uploadWinnerPhoto('tournament', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'x.jpg', { type: 'image/jpeg' }))).success).toBe(false)
    expect(bucket.upload).not.toHaveBeenCalled()
  })
  it.each(['FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED'])('persists a fresh public bucket URL and refreshes home in %s', async (status) => {
    tournament.status = status
    const result = await uploadWinnerPhoto('tournament', file(), { matchId: 'final', winnerId: 'champions' })
    expect(result.success).toBe(true)
    expect(client.storage.from).toHaveBeenCalledWith('tournaments')
    expect(bucket.upload).toHaveBeenCalledWith(expect.stringMatching(/^tournament\/winner-main-[\w-]+\.jpg$/), expect.any(File), { contentType: 'image/jpeg', upsert: false })
    expect(update).toHaveBeenCalledWith({ tournament_id: 'tournament', bracket_key: 'MAIN', match_id: 'final', winner_id: 'champions', image_url: result.url })
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })
  it('does not report success if the database update affects no row', async () => {
    saved = { data: null, error: null }
    expect((await uploadWinnerPhoto('tournament', file())).success).toBe(false)
    expect(bucket.remove).toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('saves Gold and Silver independently with their own champions and paths', async () => {
    finalMatches = [
      { id: 'gold-final', bracket_key: 'GOLD', winner_id: 'champions' },
      { id: 'silver-final', bracket_key: 'SILVER', winner_id: 'silver-champions' },
    ]
    const gold = await uploadWinnerPhoto('tournament', file(), { matchId: 'gold-final', winnerId: 'champions' })
    const silver = await uploadWinnerPhoto('tournament', file(), { matchId: 'silver-final', winnerId: 'silver-champions' })
    expect(gold.success).toBe(true)
    expect(silver.success).toBe(true)
    expect(gold.url).toContain('/winner-gold-')
    expect(silver.url).toContain('/winner-silver-')
    expect(update).toHaveBeenNthCalledWith(1, expect.objectContaining({ bracket_key: 'GOLD', winner_id: 'champions' }))
    expect(update).toHaveBeenNthCalledWith(2, expect.objectContaining({ bracket_key: 'SILVER', winner_id: 'silver-champions' }))
    expect((await uploadWinnerPhoto('tournament', file(), { matchId: 'gold-final', winnerId: 'silver-champions' })).success).toBe(false)
  })
})
