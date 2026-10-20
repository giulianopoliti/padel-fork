jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentPermissions: jest.fn() }))
jest.mock('@/lib/services/messages', () => ({ sendTournamentMessage: jest.fn() }))
jest.mock('@/lib/services/registration/reconcile-complete-inscriptions', () => ({ reconcileCompleteInscriptions: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { approveInscription } from '../actions'
import { reconcileCompleteInscriptions } from '@/lib/services/registration/reconcile-complete-inscriptions'

describe('independent inscription approval', () => {
  it('approves an inscription without reviewing its pending proof', async () => {
    const update = jest.fn(() => ({ eq: async () => ({ error: null }) }))
    jest.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'organizer' } }, error: null }) },
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'inscription', tournament_id: 'tournament', couple_id: 'couple', is_pending: true, payment_proof_status: 'PENDING_REVIEW' }, error: null }) }) }),
        update,
      }),
    } as never)
    jest.mocked(checkTournamentPermissions).mockResolvedValue({ hasPermission: true })
    const result = await approveInscription('inscription')
    expect(result.success).toBe(true)
    expect(update).toHaveBeenCalledWith({ is_pending: false })

    jest.mocked(reconcileCompleteInscriptions).mockRejectedValueOnce(new Error('zone unavailable'))
    const deferred = await approveInscription('inscription')
    expect(deferred).toMatchObject({ success: true, message: expect.stringContaining('Pendiente de asignación') })
  })
})
