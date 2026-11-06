import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { requireScheduleSharing } from '@/lib/services/schedule-sharing/rpc'
import { getScheduleWorkspaceScope } from '@/lib/services/schedule-sharing/scope'
import { getScheduleCreationSource } from '@/lib/services/schedule-sharing/destinations'
import { getScheduleGroupDetail } from '@/lib/services/schedule-sharing/reader'
import { getArgentinaToday } from '@/lib/services/schedule-sharing/validation'
import { safeWorkspaceBack, tournamentSchedulePath } from '../display'
import { ScheduleWizard } from './wizard'

type Search = Record<string, string | string[] | undefined>
const uuid = z.string().uuid()

const NewSchedulePage = async ({ searchParams }: { searchParams: Promise<Search> }) => {
  await requireScheduleSharing()
  const [params, scope] = await Promise.all([searchParams, getScheduleWorkspaceScope()])
  const requestedSource = uuid.safeParse(params.source)
  const requestedGroup = uuid.safeParse(params.group)
  const requestedMember = uuid.safeParse(params.member)
  if ((params.group && (!requestedGroup.success || params.source)) || (params.member && (!requestedMember.success || !requestedGroup.success))) notFound()
  const detail = requestedGroup.success ? await getScheduleGroupDetail(requestedGroup.data) : null
  if (params.group && !detail) notFound()
  const member = requestedMember.success ? detail?.copies.find(copy => copy.id === requestedMember.data && copy.status === 'active' && copy.fecha && copy.tournament.eligible) : undefined
  if (params.member && !member) notFound()
  const sourceId = member?.fecha?.id ?? (requestedSource.success ? requestedSource.data : null)
  const source = sourceId ? await getScheduleCreationSource(sourceId, scope) : null
  if (params.source && !source) notFound()
  if (member && source?.groupId !== detail?.group.id) notFound()
  const context = source ? scope.tournaments.find(tournament => tournament.id === source.fecha.tournament_id)
    : scope.tournaments.find(tournament => tournament.id === params.tournament && tournament.eligible)
  if (params.tournament && !context) notFound()
  const contextualBack = context ? tournamentSchedulePath(context.id, source?.fecha.id) : '/schedules'
  const groupBack = detail?.copies.some(copy => copy.fecha && params.back === tournamentSchedulePath(copy.tournament.id, copy.fecha.id))
    ? String(params.back) : safeWorkspaceBack(params.back)
  const back = detail ? `/schedules/${detail.group.id}?back=${encodeURIComponent(groupBack)}`
    : typeof params.back === 'string' ? safeWorkspaceBack(params.back) : contextualBack
  if (!member && source?.groupId) redirect(`/schedules/${source.groupId}?back=${encodeURIComponent(back)}`)
  const initialClub = context?.club_id ?? (scope.clubs.some(club => club.id === params.club) ? String(params.club) : null)
  const active = new Set(detail?.copies.filter(copy => copy.status === 'active').map(copy => copy.tournament.id))
  const missing = new Set(member?.differences.items.filter(item => item.can_complete_missing).map(item => item.item_id))
  const items = detail?.items.filter(item => !item.deleted && (!member || missing.has(item.id))) ?? []
  const today = getArgentinaToday()
  const tournaments = scope.tournaments.filter(tournament => member ? tournament.id === member.tournament.id : !active.has(tournament.id))
  const template = detail ? {
    id: detail.group.id,
    completeMemberId: member?.id,
    metadata: {
      name: detail.group.name, description: detail.group.description, start_date: detail.group.start_date, end_date: detail.group.end_date,
    },
    pastCount: items.filter(item => item.content.date < today).length,
    slots: items.filter(item => item.content.date >= today).map(item => ({ ...item.content, key: item.item_key })),
    detached: detail.copies.filter(copy => copy.status !== 'active').map(copy => copy.tournament.id),
  } : undefined
  return (
    <ScheduleWizard
      tournaments={tournaments.map(({ id, name, club_id, category_name, eligible, status }) => ({ id, name, club_id, category_name, eligible, status }))}
      clubs={scope.clubs} source={source} initialTournament={tournaments.some(tournament => tournament.id === context?.id) ? context?.id : undefined} initialClub={initialClub} back={back} template={template}
    />
  )
}

export default NewSchedulePage
