import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getScheduleGroupDetail } from '@/lib/services/schedule-sharing/reader'
import { getArgentinaToday } from '@/lib/services/schedule-sharing/validation'
import { cupLabels, distributionLabels, formatDay, formatPeriod, roundLabels, safeWorkspaceBack, tournamentSchedulePath } from '../display'
import { SlotEditor } from '../SlotEditor'
import { UnlinkButton } from './unlink-button'

const ScheduleDetail = async ({ params, searchParams }: {
  params: Promise<{ groupId: string }>
  searchParams: Promise<{ back?: string | string[] }>
}) => {
  const [{ groupId }, search] = await Promise.all([params, searchParams])
  if (!z.string().uuid().safeParse(groupId).success) notFound()
  const detail = await getScheduleGroupDetail(groupId)
  if (!detail) notFound()
  const { group, items, copies, appliedCount } = detail
  const context = copies.find(copy => copy.fecha && search.back === tournamentSchedulePath(copy.tournament.id, copy.fecha.id))
  const back = context?.fecha ? tournamentSchedulePath(context.tournament.id, context.fecha.id) : safeWorkspaceBack(search.back)
  const itemsById = new Map(items.map(item => [item.id, item]))
  const today = getArgentinaToday()
  const extension = `/schedules/new?group=${groupId}&back=${encodeURIComponent(back)}`
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href={back}><ArrowLeft aria-hidden /> {context ? 'Volver al torneo' : 'Volver a fechas y horarios'}</Link></Button>
      <header className="space-y-3 border-b pb-6">
        <p className="text-sm font-medium text-primary">Fecha compartida</p>
        <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{group.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{formatPeriod(group.start_date, group.end_date)}</span>
          <Badge variant="secondary">{appliedCount === 0 ? 'Sin fechas vinculadas' : `${appliedCount} ${appliedCount === 1 ? 'torneo vinculado' : 'torneos vinculados'}`}</Badge>
        </div>
        {group.description && <p className="max-w-3xl whitespace-pre-wrap break-words text-sm">{group.description}</p>}
        <Button asChild size="sm" variant="outline"><Link href={extension}><Plus aria-hidden /> Agregar torneos</Link></Button>
      </header>
      <Tabs defaultValue="days">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:w-fit" aria-label="Configuración compartida">
          <TabsTrigger value="days">Días y horarios</TabsTrigger>
          <TabsTrigger value="tournaments">Torneos ({copies.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="days" className="mt-5">
          <SlotEditor slots={items.filter(item => !item.deleted).map(item => ({ ...item.content, key: item.item_key }))} period={group} />
        </TabsContent>
        <TabsContent value="tournaments" className="mt-5 space-y-3">
          {copies.map(copy => (
            <section key={copy.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="break-words font-semibold">{copy.tournament.name}</h2>
                  {copy.fecha && <p className="text-sm text-muted-foreground">Fecha {copy.fecha.fecha_number} · {roundLabels[copy.fecha.round_type] ?? copy.fecha.round_type} · {cupLabels[copy.fecha.bracket_key] ?? copy.fecha.bracket_key}</p>}
                </div>
                <Badge variant={copy.differences.state === 'COMPLETE' ? 'secondary' : 'outline'}>{distributionLabels[copy.differences.state]}</Badge>
              </div>
              {copy.differences.metadata.locally_changed && <p className="text-sm">Los datos de la fecha se modificaron en este torneo.</p>}
              {copy.differences.metadata.shared_changed && <p className="text-sm">Hay datos comunes más recientes.</p>}
              {copy.differences.local_slot_ids.length > 0 && <p className="text-sm">{copy.differences.local_slot_ids.length} {copy.differences.local_slot_ids.length === 1 ? 'franja propia' : 'franjas propias'} del torneo.</p>}
              {copy.differences.items.some(item => item.state !== 'COMPLETE') && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">Ver diferencias de horarios</summary>
                  <ul className="mt-2 space-y-2">
                    {copy.differences.items.filter(item => item.state !== 'COMPLETE').map(item => {
                      const slot = itemsById.get(item.item_id)?.content
                      return <li key={item.item_id}>{slot && `${formatDay(slot.date)} · ${slot.start_time.slice(0, 5)} a ${slot.end_time.slice(0, 5)} · `}{distributionLabels[item.state]}</li>
                    })}
                  </ul>
                </details>
              )}
              <div className="flex flex-wrap gap-2">
                {copy.fecha && <Button asChild variant="outline" size="sm"><Link href={tournamentSchedulePath(copy.tournament.id, copy.fecha.id)}>Abrir fecha del torneo <ArrowRight aria-hidden /></Link></Button>}
                {copy.status === 'active' && copy.fecha && copy.tournament.eligible && copy.differences.items.some(item => {
                  const date = itemsById.get(item.item_id)?.content.date
                  return item.can_complete_missing && date && date >= today
                }) && <Button asChild size="sm"><Link href={`${extension}&member=${copy.id}`}>Completar horarios faltantes</Link></Button>}
                {copy.status === 'active' && copy.fecha && <UnlinkButton group={groupId} member={copy.id} fecha={copy.fecha.id} tournament={copy.tournament.name} updatedAt={copy.updated_at} />}
                {copy.status !== 'active' && copy.tournament.eligible && <Button asChild size="sm" variant="outline"><Link href={`${extension}&tournament=${copy.tournament.id}`}>Volver a vincular</Link></Button>}
              </div>
            </section>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default ScheduleDetail
