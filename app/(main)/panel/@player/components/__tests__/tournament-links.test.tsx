jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: (initial: unknown) => [initial, jest.fn()],
  useMemo: (factory: () => unknown) => factory(),
  useEffect: jest.fn(),
  useRef: (initial: unknown) => ({ current: initial }),
}))
jest.mock('next/navigation', () => ({
  usePathname: () => '/panel',
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('@/components/tournament/inscription-payment-panel', () => ({ PaymentCompact: jest.fn() }))
jest.mock('@/components/tournament/public-registration-launcher', () => ({ __esModule: true, default: jest.fn() }))

import React from 'react'
import Link from 'next/link'
import type { InscribedTournament, UpcomingTournament } from '@/app/api/panel/actions'
import PlayerFvUpcomingTournamentsSection from '../player-fv-upcoming-tournaments-section'
import PlayerUpcomingTournamentsSection from '../player-upcoming-tournaments-section'
import PlayerFvInscribedTournamentsSection from '../player-fv-inscribed-tournaments-section'
import PlayerInscribedTournamentsSection from '../player-inscribed-tournaments-section'

const findHrefs = (node: React.ReactNode): string[] => {
  if (Array.isArray(node)) return node.flatMap(findHrefs)
  if (!React.isValidElement<{ href?: string; children?: React.ReactNode }>(node)) return []
  return [
    ...(node.type === Link && node.props.href ? [node.props.href] : []),
    ...findHrefs(node.props.children),
  ]
}

describe('player panel tournament details links', () => {
  it.each([
    ['largo', '/torneos/largo'],
    [null, '/tournaments/tournament-id'],
  ])('uses the public URL for upcoming and inscribed tournaments (slug %s)', (seoSlug, expectedHref) => {
    const tournament: UpcomingTournament = {
      id: 'tournament-id', seoSlug, name: 'Largo', type: 'LONG',
      start_date: '2026-10-19', end_date: '2026-10-20', status: 'NOT_STARTED',
      category_name: '9na', gender: 'MALE', max_participants: 16,
      current_inscriptions: 0, remaining_slots: 16, description: '', price: null,
      is_inscribed: false, is_full: false, has_few_slots: false,
      show_few_slots_alert: true, enable_public_inscriptions: true,
      show_public_inscriptions: true, club: { name: 'Club', address: null },
    }
    const player = { id: 'player', first_name: 'Test', last_name: 'Player', profile_image_url: null }
    const inscription: InscribedTournament = {
      inscription_id: 'inscription', couple_id: 'couple', tournament,
      partner: player, current_player: player,
      agenda: { state: 'DEFAULT', scheduled_matches: [], availability: null },
    }
    const views = [
      PlayerFvUpcomingTournamentsSection({ tournaments: [tournament], tournamentType: 'LONG' }),
      PlayerUpcomingTournamentsSection({ tournaments: [tournament] }),
      PlayerFvInscribedTournamentsSection({ tournaments: [inscription] }),
      PlayerInscribedTournamentsSection({ tournaments: [inscription] }),
    ]

    for (const view of views) {
      const hrefs = findHrefs(view)
      expect(hrefs).toContain(expectedHref)
      if (seoSlug) expect(hrefs).not.toContain('/tournaments/tournament-id')
    }
  })
})
