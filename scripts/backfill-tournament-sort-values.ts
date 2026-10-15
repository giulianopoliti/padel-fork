import dotenv from 'dotenv'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { calculateTournamentSortValues, type TournamentSortSource } from '../lib/tournaments/tournament-sort-values'

const option = (name: string): string | undefined => process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
const tenant = option('--tenant')
const projects: Record<string, string> = { 'padel-fv': 'bfmaqrythlwbfjuqumom', 'padel-elite': 'lzowflvgnspjdbvdxliy' }
if (!tenant || !projects[tenant]) throw new Error('Indicá --tenant=padel-fv o --tenant=padel-elite.')
const apply = process.argv.includes('--apply')
dotenv.config({ path: path.resolve(option('--env-file') ?? `.env.${tenant}.local`), override: true, quiet: true })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Faltan las credenciales del tenant.')
if (new URL(url).hostname !== `${projects[tenant]}.supabase.co`) throw new Error('La conexión no corresponde al proyecto remoto del tenant seleccionado.')
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

interface Row extends TournamentSortSource {
  id: string
  category_name: string | null
  category_config: unknown
  status: string | null
  category_sort_value?: number | null
  status_sort_value?: number | null
}

const run = async (): Promise<void> => {
  let cursor: string | undefined
  let scanned = 0, changed = 0, unknown = 0
  const categoryValues: Record<string, number> = {}
  for (;;) {
    const columns = apply ? 'id,category_name,category_config,status,category_sort_value,status_sort_value' : 'id,category_name,category_config,status'
    let query = supabase.from('tournaments').select(columns).order('id').limit(200)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query.returns<Row[]>()
    if (error) throw error
    const rows = data ?? []
    if (!rows.length) break
    for (const row of rows) {
      scanned += 1
      const values = calculateTournamentSortValues(row)
      const categoryKey = String(values.category_sort_value)
      categoryValues[categoryKey] = (categoryValues[categoryKey] ?? 0) + 1
      if (values.category_sort_value === null) unknown += 1
      if (values.category_sort_value === row.category_sort_value && values.status_sort_value === row.status_sort_value) continue
      changed += 1
      if (!apply) continue
      // Optimistic guard: do not replace a value calculated for newer source data.
      let update = supabase.from('tournaments').update(values).eq('id', row.id)
      update = row.category_name === null ? update.is('category_name', null) : update.eq('category_name', row.category_name)
      update = row.category_config === null ? update.is('category_config', null) : update.eq('category_config', JSON.stringify(row.category_config))
      update = row.status === null ? update.is('status', null) : update.eq('status', row.status)
      const result = await update.select('id').single()
      if (result.error) throw new Error(`No se actualizó ${row.id}; revisá cambios concurrentes y volvé a ejecutar. ${result.error.message}`)
    }
    cursor = rows[rows.length - 1].id
  }
  console.log(JSON.stringify({ tenant, project: projects[tenant], mode: apply ? 'apply' : 'preview', scanned, changed, unknownCategories: unknown, categoryValues }))
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
