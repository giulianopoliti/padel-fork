jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: (initial: unknown) => [initial, jest.fn()],
  useMemo: (factory: () => unknown) => factory(),
  useEffect: jest.fn(),
  useRef: (initial: unknown) => ({ current: initial }),
}))
jest.mock('@/components/tournament/inscription-payment-dialog', () => ({ usePaymentDialog: () => jest.fn() }))
jest.mock('next/navigation', () => ({ usePathname: () => '/torneos', useRouter: () => ({ replace: jest.fn() }), useSearchParams: () => new URLSearchParams() }))
jest.mock('@/contexts/user-context', () => ({ useUser: () => ({ user: { id: 'user' }, userDetails: { id: 'user', role: 'PLAYER', player_id: 'player' }, authState: 'ready' }) }))
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }))
jest.mock('@/components/tournament/player/register-player-form', () => ({ __esModule: true, default: jest.fn(() => null) }))
jest.mock('@/components/tournament/player/register-couple-form', () => ({ __esModule: true, default: jest.fn(() => null) }))
jest.mock('@/components/tournament/auth-required-dialog', () => ({ __esModule: true, default: jest.fn(() => null) }))
jest.mock('@/components/solo-players/tournament-interest', () => ({ TournamentInterest: jest.fn(() => null) }))
jest.mock('@/components/solo-players/use-solo-directory', () => ({ useSoloDirectory: () => ({ data: undefined, reload: jest.fn() }) }))

import React from 'react'
import PublicRegistrationLauncher from '../public-registration-launcher'
import RegisterCoupleForm from '../player/register-couple-form'
import RegisterPlayerForm from '../player/register-player-form'
import { Gender } from '@/types'
import { TournamentInterest } from '@/components/solo-players/tournament-interest'
import { DialogContent } from '@/components/ui/dialog'

const findElements = (node: React.ReactNode, type: unknown): React.ReactElement<Record<string, unknown>>[] => {
  if (Array.isArray(node)) return node.flatMap(child => findElements(child, type))
  if (!React.isValidElement<Record<string, unknown>>(node)) return []
  return [...(node.type === type ? [node] : []), ...findElements(node.props.children as React.ReactNode, type)]
}

describe('shared registration window', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW = 'false' })
  it('requires couple registration and passes the alias and amount when proof is enabled', () => {
    const view = PublicRegistrationLauncher({ tournamentId: 'test', tournamentName: 'Test', tournamentGender: Gender.MALE, enableTransferProof: true, transferAlias: 'club.alias', transferAmount: 1500, requireTermsAcceptance: true })
    expect(findElements(view, RegisterPlayerForm)).toHaveLength(0)
    expect(findElements(view, RegisterCoupleForm)[0].props).toMatchObject({ transferConfig: { enabled: true, alias: 'club.alias', amount: 1500 }, requireTermsAcceptance: true })
  })

  it('offers both individual and couple registration when proof is disabled', () => {
    const view = PublicRegistrationLauncher({ tournamentId: 'test', tournamentName: 'Test', tournamentGender: Gender.MALE, enableTransferProof: false, requireTermsAcceptance: false })
    expect(findElements(view, RegisterPlayerForm)).toHaveLength(1)
    expect(findElements(view, RegisterCoupleForm)).toHaveLength(1)
    expect(findElements(view, RegisterCoupleForm)[0].props).toMatchObject({ transferConfig: { enabled: false }, requireTermsAcceptance: false })
  })

  it.each([false, true])('offers interest without individual inscription when preview is enabled (proof %s)', enableTransferProof => {
    process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW = 'true'
    const view = PublicRegistrationLauncher({ tournamentId: 'test', tournamentName: 'Test', tournamentGender: Gender.MALE, enableTransferProof })
    expect(findElements(view, RegisterPlayerForm)).toHaveLength(0)
    expect(findElements(view, TournamentInterest)).toHaveLength(1)
    expect(findElements(view, RegisterCoupleForm)).toHaveLength(1)
  })
  it('keeps clicks within the registration dialog from reaching the tournament card', () => {
    const view = PublicRegistrationLauncher({ tournamentId: 'test', tournamentName: 'Test', tournamentGender: Gender.MALE })
    const stopPropagation = jest.fn()
    const content = findElements(view, DialogContent)[0]
    ;(content.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation })
    expect(stopPropagation).toHaveBeenCalledTimes(1)
  })
})
