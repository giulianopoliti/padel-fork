import { shouldRequireInscriptionValidation } from './inscription-validation'

export type InscriptionPaymentMethod = 'CASH' | 'TRANSFER'

export type PaymentPolicyTournament = {
  id: string
  type?: string | null
  organization_id?: string | null
  validate_inscriptions?: boolean | null
  enable_transfer_proof?: boolean | null
  transfer_alias?: string | null
  transfer_amount?: number | string | null
  enable_trust_based_payment_policy?: boolean | null
  trust_policy_min_played_tournaments?: number | null
  transfer_amount_per_player?: number | string | null
}

export type ResolvedRegistrationPaymentPolicy = {
  policyApplied: boolean
  paymentMethod: InscriptionPaymentMethod | null
  isPending: boolean
  proofRequired: boolean
  proofAutoApproved: boolean
  minPlayedTournaments: number | null
  playedTournaments: number | null
  amountPerPlayer: number | null
  totalAmount: number | null
}

const MANAGEMENT_ROLES = new Set(['ADMIN', 'CLUB', 'ORGANIZADOR'])

const toNumberOrNull = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const isTrustBasedPaymentPolicyEnabled = (tournament: PaymentPolicyTournament) =>
  tournament.type === 'AMERICAN' && tournament.enable_trust_based_payment_policy === true

export async function countPlayerConfirmedAmericanInscriptionsForOrganization({
  supabase,
  playerId,
  organizationId,
  excludeTournamentId,
}: {
  supabase: any
  playerId: string
  organizationId: string | null | undefined
  excludeTournamentId?: string
}): Promise<number> {
  if (!playerId || !organizationId) return 0

  const tournamentIds = new Set<string>()

  const { data: individualInscriptions, error: individualError } = await supabase
    .from('inscriptions')
    .select(`
      tournament_id,
      tournaments!inner (
        id,
        type,
        status,
        organization_id
      )
    `)
    .eq('player_id', playerId)
    .eq('is_pending', false)
    .eq('tournaments.organization_id', organizationId)
    .eq('tournaments.type', 'AMERICAN')
    .neq('tournaments.status', 'CANCELED')

  if (individualError) {
    console.error('[payment-policy] Error counting individual history:', individualError)
  }

  for (const inscription of individualInscriptions || []) {
    const tournament = Array.isArray(inscription.tournaments)
      ? inscription.tournaments[0]
      : inscription.tournaments

    if (!tournament || tournament.id === excludeTournamentId) {
      continue
    }

    tournamentIds.add(tournament.id)
  }

  const { data: coupleInscriptions, error: coupleError } = await supabase
    .from('inscriptions')
    .select(`
      tournament_id,
      couples!inner (
        id,
        player1_id,
        player2_id
      ),
      tournaments!inner (
        id,
        type,
        status,
        organization_id
      )
    `)
    .not('couple_id', 'is', null)
    .eq('is_pending', false)
    .eq('tournaments.organization_id', organizationId)
    .eq('tournaments.type', 'AMERICAN')
    .neq('tournaments.status', 'CANCELED')

  if (coupleError) {
    console.error('[payment-policy] Error counting couple history:', coupleError)
  }

  for (const inscription of coupleInscriptions || []) {
    const couple = Array.isArray(inscription.couples)
      ? inscription.couples[0]
      : inscription.couples
    const tournament = Array.isArray(inscription.tournaments)
      ? inscription.tournaments[0]
      : inscription.tournaments

    if (!couple || !tournament || tournament.id === excludeTournamentId) {
      continue
    }

    if (couple.player1_id === playerId || couple.player2_id === playerId) {
      tournamentIds.add(tournament.id)
    }
  }

  return tournamentIds.size
}

export async function resolveRegistrationPaymentPolicy({
  supabase,
  tournament,
  actorRole,
  isOrganizerRegistration = false,
  registeringPlayerId,
  paymentMethod,
}: {
  supabase: any
  tournament: PaymentPolicyTournament
  actorRole?: string | null
  isOrganizerRegistration?: boolean
  registeringPlayerId?: string | null
  paymentMethod?: InscriptionPaymentMethod | null
}): Promise<ResolvedRegistrationPaymentPolicy> {
  if (isOrganizerRegistration || (actorRole && MANAGEMENT_ROLES.has(actorRole))) {
    return {
      policyApplied: false,
      paymentMethod: null,
      isPending: false,
      proofRequired: false,
      proofAutoApproved: false,
      minPlayedTournaments: null,
      playedTournaments: null,
      amountPerPlayer: null,
      totalAmount: null,
    }
  }

  if (!isTrustBasedPaymentPolicyEnabled(tournament)) {
    return {
      policyApplied: false,
      paymentMethod: null,
      isPending: shouldRequireInscriptionValidation({
        validateInscriptions: tournament.validate_inscriptions,
        actorRole,
        isOrganizerRegistration,
      }),
      proofRequired: Boolean(tournament.enable_transfer_proof),
      proofAutoApproved: false,
      minPlayedTournaments: null,
      playedTournaments: null,
      amountPerPlayer: null,
      totalAmount: null,
    }
  }

  if (!paymentMethod) {
    throw new Error('Debes elegir metodo de pago: efectivo o transferencia.')
  }

  if (paymentMethod === 'TRANSFER') {
    const amountPerPlayer =
      toNumberOrNull(tournament.transfer_amount_per_player) ??
      (() => {
        const legacyCoupleAmount = toNumberOrNull(tournament.transfer_amount)
        return legacyCoupleAmount === null ? null : legacyCoupleAmount / 2
      })()

    if (!tournament.transfer_alias?.trim()) {
      throw new Error('El torneo no tiene alias configurado para transferencia.')
    }

    if (amountPerPlayer === null || amountPerPlayer <= 0) {
      throw new Error('El torneo no tiene seña por jugador configurada para transferencia.')
    }

    return {
      policyApplied: true,
      paymentMethod,
      isPending: false,
      proofRequired: true,
      proofAutoApproved: true,
      minPlayedTournaments: tournament.trust_policy_min_played_tournaments ?? 2,
      playedTournaments: null,
      amountPerPlayer,
      totalAmount: amountPerPlayer * 2,
    }
  }

  const minPlayedTournaments = tournament.trust_policy_min_played_tournaments ?? 2
  const playedTournaments = registeringPlayerId
    ? await countPlayerConfirmedAmericanInscriptionsForOrganization({
        supabase,
        playerId: registeringPlayerId,
        organizationId: tournament.organization_id,
        excludeTournamentId: tournament.id,
      })
    : 0
  const isPending = playedTournaments < minPlayedTournaments

  if (isPending && registeringPlayerId) {
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('phone')
      .eq('id', registeringPlayerId)
      .maybeSingle()

    if (playerError) {
      console.error('[payment-policy] Error validating player phone:', playerError)
    }

    if (!player?.phone?.trim()) {
      throw new Error('Para pagar en efectivo sin historial suficiente, debes cargar un telefono de WhatsApp.')
    }
  }

  return {
    policyApplied: true,
    paymentMethod,
    isPending,
    proofRequired: false,
    proofAutoApproved: false,
    minPlayedTournaments,
    playedTournaments,
    amountPerPlayer: null,
    totalAmount: null,
  }
}
