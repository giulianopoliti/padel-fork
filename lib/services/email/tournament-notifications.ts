import { scheduleRegistrationNotifications } from '@/lib/services/messages/registration-delivery'
import type { SupabaseLike } from "./notification-utils"

export const sendTournamentInscriptionNotification = async ({
  supabase,
  inscriptionId,
}: {
  supabase: SupabaseLike
  inscriptionId: string
}) => {
  scheduleRegistrationNotifications()
  return [{success:true,skipped:true,reason:'queued transactionally'}]
}
