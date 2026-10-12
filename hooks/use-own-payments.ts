'use client'

import useSWR from 'swr'
import { useUser } from '@/contexts/user-context'
import type { PaymentInscription } from '@/lib/tournaments/payment-types'

export const useOwnPayments = (tournamentIds: string[]) => {
  const { user, authState } = useUser()
  const ids = [...new Set(tournamentIds)].sort().join(',')
  const { data, error, mutate } = useSWR(user && ids ? ['own-payments', user.id, ids] : null, async () => {
    const response = await fetch(`/api/inscriptions/payments?ids=${encodeURIComponent(ids)}`, { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok || !result.success) throw new Error('No se pudieron consultar tus inscripciones.')
    return result.inscriptions as Record<string, PaymentInscription>
  })
  return { inscriptions: data, error, retry: mutate, loading: authState !== 'guest' && !error && (!user || !data) }
}
