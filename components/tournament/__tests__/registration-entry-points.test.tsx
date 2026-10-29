jest.mock('@/hooks/use-own-payments', () => ({ useOwnPayments: jest.fn(() => ({ inscriptions: {}, loading: false })) }))
jest.mock('next/navigation', () => ({ usePathname: () => '/panel', useRouter: () => ({ push: jest.fn() }), useSearchParams: () => new URLSearchParams() }))
jest.mock('@/config/tenant', () => ({ getTenantBranding: () => ({ key: 'padel-fv' }) }))
jest.mock('@/components/tournament/public-registration-launcher', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <button data-registration={JSON.stringify({ id: props.tournamentId, proof: props.enableTransferProof, alias: props.transferAlias, amount: props.transferAmount })}>Inscribirme</button>,
}))

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicTournamentCards } from '@/components/tournaments/public-tournament-cards'
import PlayerFvUpcomingTournamentsSection from '@/app/(main)/panel/@player/components/player-fv-upcoming-tournaments-section'
import PlayerUpcomingTournamentsSection from '@/app/(main)/panel/@player/components/player-upcoming-tournaments-section'
import NotRegisteredView from '@/components/tournament/NotRegisteredView'
import { Gender } from '@/types'
import type { UpcomingTournament } from '@/app/api/panel/actions'
import { useOwnPayments } from '@/hooks/use-own-payments'

describe('registration configuration shared by /torneos, /panel and tournament detail', () => {
  it.each(['AMERICAN', 'LONG'] as const)('passes the same required proof configuration for %s', (type) => {
    const common = { id: 'test', name: 'Test', type, status: 'NOT_STARTED', gender: Gender.MALE, price: 1500 }
    const transfer = { enable_transfer_proof: true, transfer_alias: 'club.alias', transfer_amount: 1500 }
    const views = [
      <PublicTournamentCards tournaments={[{ ...common, club: null, enablePublicInscriptions: true, enableTransferProof: true, transferAlias: 'club.alias', transferAmount: 1500 }]} emptyTitle="Empty" emptyDescription="Empty" />,
      <PlayerFvUpcomingTournamentsSection tournamentType={type} tournaments={[{ ...common, ...transfer, enable_public_inscriptions: true, is_inscribed: false } as UpcomingTournament]} />,
      <PlayerUpcomingTournamentsSection tournaments={[{ ...common, ...transfer, enable_public_inscriptions: true, is_inscribed: false } as UpcomingTournament]} />,
      <NotRegisteredView tournamentId="test" tournament={{ ...common, ...transfer, enable_public_inscriptions: true }} />,
    ]
    for (const view of views) {
      const markup = renderToStaticMarkup(view)
      expect(markup).toContain('data-registration="{&quot;id&quot;:&quot;test&quot;,&quot;proof&quot;:true,&quot;alias&quot;:&quot;club.alias&quot;,&quot;amount&quot;:1500}"')
    }
  })

  it('offers payment for an existing inscription even when full and closed', () => {
    jest.mocked(useOwnPayments).mockReturnValue({ inscriptions: { test: { id: 'i', method: 'TRANSFER', hasProof: false, proofStatus: 'NOT_REQUIRED', isPending: false, revision: 0, occupiesSlot: true, proofRequired: true, confirmed: true, registrationLabel: 'Confirmada' } }, loading: false } as never)
    const html = renderToStaticMarkup(<PublicTournamentCards tournaments={[{ id: 'test', name: 'Test', status: 'IN_PROGRESS', club: null, isFull: true, enablePublicInscriptions: false }]} emptyTitle="Empty" emptyDescription="Empty" />)
    expect(html).toContain('Tu inscripción')
    expect(html).toContain('Subir comprobante')
    expect(html).toContain('Tu cupo está reservado')
    expect(html).not.toContain('espera aprobación')
    expect(html).not.toContain('data-registration=')
  })

  it.each(['loading', 'error'])('does not offer registration while the personal query is %s', state => {
    jest.mocked(useOwnPayments).mockReturnValue({ loading: state === 'loading', error: state === 'error' ? new Error('offline') : null } as never)
    const html = renderToStaticMarkup(<PublicTournamentCards tournaments={[{ id: 'test', name: 'Test', status: 'NOT_STARTED', club: null, enablePublicInscriptions: true }]} emptyTitle="Empty" emptyDescription="Empty" />)
    expect(html).not.toContain('data-registration=')
    expect(html).toContain(state === 'loading' ? 'Consultando inscripción' : 'Reintentar')
  })
})
