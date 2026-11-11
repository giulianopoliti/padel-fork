import { completeUserProfile, type FormState } from '@/app/(main)/edit-profile/actions'
import { checkRoutePermission } from '@/config/permissions'
import { createClient } from '@/utils/supabase/server'
import { updatePlayerAction } from '../players.actions'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const actorId = 'authenticated-user'
const playerId = 'player-record'
const initialState: FormState = { success: false, message: '' }

const mockSupabase = (role: string, isMember = false) => {
  const savedPlayer = { id: playerId, gender: 'FEMALE' }
  const savedPlayerQuery = {
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: savedPlayer, error: null }),
  }
  const playerQuery = {
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { category_name: '6ta', score: 100 }, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: { id: playerId }, error: null }),
    update: jest.fn().mockReturnValue(savedPlayerQuery),
  }
  const userQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { role }, error: null }),
  }
  const membershipQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: isMember ? { organizacion_id: 'org' } : null, error: null }),
  }
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: actorId } }, error: null }) },
    from: (table: string) => {
      if (table === 'users') return userQuery
      if (table === 'organization_members') return membershipQuery
      if (table === 'players') return playerQuery
      throw new Error(`Unexpected table: ${table}`)
    },
  })
  return { savedPlayerQuery, playerQuery }
}

const makeProfileForm = (gender?: string) => {
  const form = new FormData()
  form.set('first_name', 'Ana')
  form.set('last_name', 'García')
  form.set('user_id', 'other-user')
  if (gender !== undefined) form.set('gender', gender)
  return form
}

describe('changing a player’s sex', () => {
  it('makes the full player directory accessible to organizers only', () => {
    expect(checkRoutePermission('/my-players', 'ORGANIZADOR')).toBe(true)
    expect(checkRoutePermission('/my-players', 'PLAYER')).toBe(false)
    expect(checkRoutePermission('/my-players', null)).toBe(false)
  })

  it('saves the change from the organizer directory and returns the new value', async () => {
    const { playerQuery, savedPlayerQuery } = mockSupabase('ORGANIZADOR', true)

    expect(await updatePlayerAction(playerId, { gender: 'FEMALE' })).toMatchObject({
      success: true,
      player: { id: playerId, gender: 'FEMALE' },
    })
    expect(playerQuery.update).toHaveBeenCalledWith(expect.objectContaining({ gender: 'FEMALE' }))
    expect(savedPlayerQuery.eq).toHaveBeenCalledWith('id', playerId)
    expect(savedPlayerQuery.select).toHaveBeenCalledWith(expect.stringContaining('gender'))
  })

  it('requires an active organization membership to edit a player from the directory', async () => {
    const { playerQuery } = mockSupabase('ORGANIZADOR')

    expect(await updatePlayerAction(playerId, { gender: 'FEMALE' })).toMatchObject({ success: false })
    expect(playerQuery.update).not.toHaveBeenCalled()
  })

  it('rejects a tournament-only value from the organizer directory', async () => {
    const { playerQuery } = mockSupabase('ORGANIZADOR', true)

    const invalidInput = { gender: 'MIXED' } as unknown as Parameters<typeof updatePlayerAction>[1]
    expect(await updatePlayerAction(playerId, invalidInput)).toMatchObject({ success: false })
    expect(playerQuery.update).not.toHaveBeenCalled()
  })

  it('lets a player edit their own sex using their verified session', async () => {
    const { playerQuery, savedPlayerQuery } = mockSupabase('PLAYER')

    expect(await completeUserProfile(initialState, makeProfileForm('FEMALE'))).toMatchObject({ success: true })
    expect(playerQuery.update).toHaveBeenCalledWith(expect.objectContaining({ user_id: actorId, gender: 'FEMALE' }))
    expect(savedPlayerQuery.eq).toHaveBeenCalledWith('user_id', actorId)
  })

  it.each([undefined, ''])('preserves sex when the profile supplies no new value (%s)', async (gender) => {
    const { playerQuery } = mockSupabase('PLAYER')

    expect(await completeUserProfile(initialState, makeProfileForm(gender))).toMatchObject({ success: true })
    expect(playerQuery.update.mock.calls[0][0]).not.toHaveProperty('gender')
  })

  it('rejects a tournament-only value from Editar perfil', async () => {
    const { playerQuery } = mockSupabase('PLAYER')
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    try {
      expect(await completeUserProfile(initialState, makeProfileForm('MIXED'))).toMatchObject({
        success: false,
        errors: { gender: expect.any(Array) },
      })
      expect(playerQuery.update).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('does not let another role submit the player’s profile form', async () => {
    const { playerQuery } = mockSupabase('ORGANIZADOR', true)

    expect(await completeUserProfile(initialState, makeProfileForm('FEMALE'))).toMatchObject({ success: false })
    expect(playerQuery.update).not.toHaveBeenCalled()
  })
})
