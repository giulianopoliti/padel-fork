import { notFound, redirect } from 'next/navigation'
import { isScheduleSharingEnabled } from '@/config/schedule-sharing'
import { isScheduleManagementRole } from '@/lib/services/schedule-sharing/permissions'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

const ScheduleLayout = async ({ children }: { children: React.ReactNode }) => {
  if (!isScheduleSharingEnabled() || process.env.SCHEDULE_SHARING_ENABLED !== 'true') notFound()
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const { data } = await client.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!isScheduleManagementRole(data?.role)) notFound()
  return <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">{children}</main>
}

export default ScheduleLayout
