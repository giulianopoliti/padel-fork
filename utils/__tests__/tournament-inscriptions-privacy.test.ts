import { NextRequest } from 'next/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { GET } from '@/app/api/tournaments/[id]/inscriptions/route'
import InscriptionsPage from '@/app/(main)/tournaments/[id]/inscriptions/page'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentAccess } from '@/utils/tournament-permissions'
import { getTournamentDetailsWithInscriptions } from '@/app/api/tournaments/actions'
import { getAllPlayersDTO } from '@/app/api/players/actions'
import { getTpeLateWithdrawalCounts } from '@/lib/services/tpe-registration-restrictions'

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/services/registration/reconcile-complete-inscriptions', () => ({ reconcileCompleteInscriptions: jest.fn() }))
jest.mock('@/utils/tournament-permissions', () => ({ checkTournamentAccess: jest.fn() }))
jest.mock('@/app/api/tournaments/actions', () => ({ getTournamentDetailsWithInscriptions: jest.fn() }))
jest.mock('@/app/api/players/actions', () => ({ getAllPlayersDTO: jest.fn() }))
jest.mock('@/lib/services/tpe-registration-restrictions', () => ({
  getTpeLateWithdrawalCounts: jest.fn(async () => new Map()),
}))
jest.mock('@/app/(main)/tournaments/[id]/inscriptions/components/InscriptionsClient', () => ({
  __esModule: true, default: () => null,
}))

const player = {
  id: 'p1', first_name: 'Ana', last_name: 'Pérez', score: 800,
  dni: 'private-dni', phone: 'private-phone', email: 'private-email',
  date_of_birth: 'private-birth', private_future_field: 'private-future',
}
const tournament = { id: 't1', name: 'Test', type: 'LONG', show_public_inscriptions: true }
const couple = {
  id: 'c1', player1_id: 'p1', player2_id: 'p2',
  players_player1: player, players_player2: { ...player, id: 'p2' },
}
const inscriptions = [
  { id: 'i1', couple_id: 'c1', player_id: null, couples: couple, is_pending: false },
  { id: 'i2', couple_id: null, player_id: 'p1', player, is_pending: true },
]

describe('inscriptions privacy at the HTTP and SSR boundaries', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getTpeLateWithdrawalCounts).mockResolvedValue(new Map())
    const query = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      single: jest.fn(async () => ({ data: tournament, error: null })),
      order: jest.fn(async () => ({ data: inscriptions, error: null })),
    }
    jest.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) },
      from: () => query,
    } as never)
    jest.mocked(getAllPlayersDTO).mockResolvedValue([player] as never)
    jest.mocked(getTournamentDetailsWithInscriptions).mockResolvedValue({
      tournament,
      inscriptions: [
        { ...inscriptions[0], couple: [{ ...couple, player1: [player], player2: [player] }] },
        { ...inscriptions[1], player: [player] },
      ],
    } as never)
  })

  it.each(['PUBLIC_VIEW', 'PLAYER_ACTIVE', 'PLAYER_ELIMINATED'])(
    'does not send private player fields to %s via HTTP or hydration', async (accessLevel) => {
      jest.mocked(checkTournamentAccess).mockResolvedValue({ accessLevel } as never)
      const response = await GET(new NextRequest('http://localhost/api/tournaments/t1/inscriptions'), {
        params: { id: 't1' },
      })
      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.individualInscriptions[0]).toMatchObject({ id: 'p1', first_name: 'Ana' })
      const html = await InscriptionsPage({ params: Promise.resolve({ id: 't1' }) })
      const props = (html.props.children as React.ReactElement<Record<string, unknown>>).props
      expect(props.allPlayers).toMatchObject([{ id: 'p1', first_name: 'Ana', last_name: 'Pérez', score: 800 }])
      for (const payload of [json, props]) {
        expect(JSON.stringify(payload)).not.toMatch(/private-/)
      }
    },
  )

  it('retains management contact data in both paths', async () => {
    jest.mocked(checkTournamentAccess).mockResolvedValue({ accessLevel: 'FULL_MANAGEMENT' } as never)
    const response = await GET(new NextRequest('http://localhost/api/tournaments/t1/inscriptions'), {
      params: { id: 't1' },
    })
    const json = await response.json()
    expect(json.individualInscriptions[0].phone).toBe('private-phone')
    expect(json.coupleInscriptions[0].player_1_info.dni).toBe('private-dni')
    const html = await InscriptionsPage({ params: Promise.resolve({ id: 't1' }) })
    const props = (html.props.children as React.ReactElement<Record<string, unknown>>).props
    expect(props.allPlayers).toEqual([player])
  })

  it('renders a safe return link for a private roster without redirecting or hydrating player data', async () => {
    jest.mocked(checkTournamentAccess).mockResolvedValue({ accessLevel: 'PUBLIC_VIEW' } as never)
    jest.mocked(getTournamentDetailsWithInscriptions).mockResolvedValue({
      tournament: { ...tournament, show_public_inscriptions: false }, inscriptions,
    } as never)
    const html = await InscriptionsPage({ params: Promise.resolve({ id: 't1' }) })
    expect(html.type).toBe('main')
    const markup = renderToStaticMarkup(html)
    expect(markup).toContain('/tournaments/t1')
    expect(markup).not.toMatch(/private-/)
    expect(getAllPlayersDTO).not.toHaveBeenCalled()
    expect(getTpeLateWithdrawalCounts).not.toHaveBeenCalled()
  })

  it('normalizes array relations before filtering contact data', async () => {
    jest.mocked(checkTournamentAccess).mockResolvedValue({ accessLevel: 'PUBLIC_VIEW' } as never)
    jest.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: (table: string) => {
        const query = {
          select: () => query, eq: () => query,
          single: async () => ({ data: tournament, error: null }),
          order: async () => ({ data: table === 'inscriptions' ? [{
            ...inscriptions[0], couples: [{ ...couple,
              players_player1: [player], players_player2: [],
            }],
          }] : [], error: null }),
        }
        return query
      },
    } as never)
    const response = await GET(new NextRequest('http://localhost/api/tournaments/t1/inscriptions'), {
      params: { id: 't1' },
    })
    const json = await response.json()
    expect(json.coupleInscriptions[0].player_1_info.first_name).toBe('Ana')
    expect(json.coupleInscriptions[0].player_2_info).toBeNull()
    expect(JSON.stringify(json)).not.toMatch(/private-/)
  })
})
