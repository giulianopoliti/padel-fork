import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getTenantBranding } from '@/config/tenant'
import { createClient, createClientServiceRole } from '@/utils/supabase/server'

type Promotion = {
  id: string
  player_name: string
  tournament_id: string
  tournament_name: string
  old_category_name: string
  new_category_name: string
  old_score: number
  created_at: string
  reversed_at: string | null
  reversal_reason: string | null
  has_later_change: boolean
}

const allowedRoles = ['ORGANIZADOR', 'ADMIN', 'CLUB']
const formSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(500) })
const pageNumber = (value: unknown): number => Math.trunc(Math.min(10000, Math.max(1, Number(value) || 1)))
const panelHref = (period: string, page: number, outcome?: string): string => `/panel/ascensos?${new URLSearchParams({ period, page: String(page), ...(outcome ? { outcome } : {}) })}`

const getPromotionActor = async (): Promise<string> => {
  if (getTenantBranding().key !== 'padel-fv') notFound()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !allowedRoles.includes(profile.role)) notFound()
  return user.id
}

const reversePromotion = async (form: FormData): Promise<void> => {
  'use server'
  const actorId = await getPromotionActor()
  const period = form.get('period') === 'all' ? 'all' : 'recent'
  const page = pageNumber(form.get('page'))
  const values = formSchema.safeParse({ id: form.get('id'), reason: form.get('reason') })
  if (!values.success) redirect(panelHref(period, page, 'reason'))

  const service = await createClientServiceRole()
  const { error } = await service.rpc('revert_league_promotion', {
    p_promotion_id: values.data.id, p_actor_id: actorId, p_reason: values.data.reason,
  })
  if (error) redirect(panelHref(period, page, error.code === '40001' ? 'changed' : 'error'))
  for (const route of ['/panel/ascensos', '/panel', '/ranking', '/profile', '/my-players', '/']) revalidatePath(route)
  redirect(panelHref(period, page, 'reversed'))
}

const outcomes: Record<string, string> = {
  reversed: 'Ascenso revertido. Se restauró la categoría y se acreditó el bono de 300 puntos.',
  changed: 'El jugador tiene un cambio de categoría posterior. Revisá su ficha.',
  reason: 'Ingresá el motivo de la reversión.',
  error: 'No se pudo revertir el ascenso. Revisá tus permisos y volvé a intentarlo.',
}

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actorId = await getPromotionActor()
  const filters = await searchParams
  const period = filters.period === 'all' ? 'all' : 'recent'
  const page = Math.trunc(pageNumber(filters.page))
  const outcome = typeof filters.outcome === 'string' ? outcomes[filters.outcome] : null
  const service = await createClientServiceRole()
  const since = period === 'all' ? null : new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await service.rpc('get_league_promotions', { p_actor_id: actorId, p_since: since, p_offset: (page - 1) * 50 })
  const promotions = (data ?? []) as Promotion[]

  return <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold">Ascensos de Liga</h1>
      <Button asChild variant="outline"><Link href="/panel">Volver al panel</Link></Button>
    </div>
    <nav aria-label="Período de ascensos" className="flex flex-wrap gap-2">
      <Button asChild variant={period === 'recent' ? 'default' : 'outline'}><Link href={panelHref('recent', 1)}>Últimos 30 días</Link></Button>
      <Button asChild variant={period === 'all' ? 'default' : 'outline'}><Link href={panelHref('all', 1)}>Historial completo</Link></Button>
    </nav>
    {outcome && <p role="status" className="rounded-lg border p-3 text-sm">{outcome}</p>}
    {error ? <p role="alert">No se pudo cargar el historial de ascensos.</p> : promotions.length === 0 ?
      <p className="text-muted-foreground">Todavía no hay ascensos en este período.</p> :
      <ul className="divide-y rounded-lg border">
        {promotions.slice(0, 50).map(promotion => <li key={promotion.id} className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="font-semibold">{promotion.player_name}</p>
            <p className="text-sm">{promotion.old_category_name} → {promotion.new_category_name} · {promotion.old_score} puntos de origen</p>
            <p className="text-sm text-muted-foreground"><Link className="underline" href={`/tournaments/${promotion.tournament_id}`}>{promotion.tournament_name}</Link> · {new Date(promotion.created_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</p>
          </div>
          {promotion.reversed_at ? <p className="text-sm">Revertido · {promotion.reversal_reason}</p> : promotion.has_later_change ?
            <p className="text-sm text-muted-foreground">Tiene un cambio de categoría posterior.</p> :
            <form action={reversePromotion} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={promotion.id} />
              <input type="hidden" name="period" value={period} />
              <input type="hidden" name="page" value={page} />
              <label className="min-w-44 flex-1 text-sm">Motivo de reversión<Input name="reason" required maxLength={500} /></label>
              <Button type="submit" variant="outline">Revertir ascenso</Button>
            </form>}
        </li>)}
      </ul>}
    {(page > 1 || promotions.length > 50) && <nav aria-label="Paginación de ascensos" className="flex gap-2">
      {page > 1 && <Button asChild variant="outline"><Link href={panelHref(period, page - 1)}>Anterior</Link></Button>}
      {promotions.length > 50 && <Button asChild variant="outline"><Link href={panelHref(period, page + 1)}>Siguiente</Link></Button>}
    </nav>}
  </main>
}
