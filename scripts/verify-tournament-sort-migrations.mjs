import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import assert from 'node:assert/strict'
import { calculateTournamentSortValues } from '../lib/tournaments/tournament-sort-values.ts'

// Optional, isolated local validation runtime. No remote connection or app dependency.
const runtimeDirectory = process.argv.find((arg) => arg.startsWith('--runtime-dir='))?.slice('--runtime-dir='.length)
if (!runtimeDirectory) throw new Error('Pass --runtime-dir=<directory containing @electric-sql/pglite@0.5.10>')
const require = createRequire(path.join(path.resolve(runtimeDirectory), 'package.json'))
const { PGlite } = require('@electric-sql/pglite')
const db = new PGlite()
const sql = (name) => readFileSync(path.join(process.cwd(), name), 'utf8')
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth,public TO authenticated;
    CREATE TABLE public.users(id uuid PRIMARY KEY,role text);
    CREATE TABLE public.organizaciones(id uuid PRIMARY KEY,slug text);
    CREATE TABLE public.organization_members(user_id uuid,organizacion_id uuid,member_role text,is_active boolean);
    CREATE TABLE public.clubes(id uuid,user_id uuid);
    CREATE TABLE public.organization_clubs(organizacion_id uuid,club_id uuid);
    CREATE TABLE public.tournaments(id uuid PRIMARY KEY,category_name text,category_config jsonb,status text);
    GRANT SELECT ON public.users,public.organization_members,public.clubes,public.organization_clubs TO authenticated;
    INSERT INTO public.users VALUES('00000000-0000-0000-0000-000000000001','ORGANIZADOR'),('00000000-0000-0000-0000-000000000002','PLAYER'),('00000000-0000-0000-0000-000000000003','ORGANIZADOR');
    INSERT INTO public.organizaciones VALUES('00000000-0000-0000-0000-000000000010','tenant'),('00000000-0000-0000-0000-000000000020','other');
    INSERT INTO public.organization_members VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','owner',true),('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000010','member',true);
  `)
  await db.exec(sql('supabase/migrations/20261014171040_add_tenant_tournament_list_settings.sql'))
  await db.exec(`INSERT INTO public.tenant_tournament_list_settings(organization_id,surface,rules,updated_at) VALUES
    ('00000000-0000-0000-0000-000000000010','panel','[{"field":"start_date","direction":"asc"}]','2026-01-01'),
    ('00000000-0000-0000-0000-000000000020','panel','[{"field":"category","direction":"desc"}]','2026-02-01');`)
  if (process.argv.includes('--partial')) {
    // Reproduce the first ALTER having committed before the failed LOCK.
    await db.exec('ALTER TABLE public.tournaments ADD COLUMN category_sort_value numeric(3,1), ADD COLUMN status_sort_value smallint;')
  }
  // This migration contains plain SQL only (no function bodies or semicolons in
  // string literals). Execute statements separately, without an outer transaction,
  // so the test cannot hide a missing BEGIN as the old verification did.
  const preparation = sql('supabase/migrations/20261014225421_prepare_typescript_tournament_sort.sql')
  const preparationStatements = preparation.replace(/--[^\r\n]*/g, '').split(';').map((item) => item.trim()).filter(Boolean)
  for (const statement of preparationStatements) {
    await db.exec(statement + ';')
  }
  const preserved = await db.query('SELECT surface,rules FROM public.tenant_tournament_list_settings')
  assert.equal(preserved.rows.length, 1)
  assert.equal(preserved.rows[0].rules[0].field, 'category')
  const rows = [{ label: '6ta' }, { label: 'SUMA13' }, { label: '7ma' }, { label: 'SUMA14' }, { label: 'SUMA15' }]
  for (let index = 0; index < rows.length; index += 1) {
    const values = calculateTournamentSortValues({ category_name: rows[index].label, status: 'ZONE_PHASE' })
    await db.query('INSERT INTO public.tournaments(id,category_name,status,category_sort_value,status_sort_value) VALUES($1,$2,$3,$4,$5)',
      [`00000000-0000-0000-0000-${String(index + 100).padStart(12, '0')}`, rows[index].label, 'ZONE_PHASE', values.category_sort_value, values.status_sort_value])
  }
  await db.exec(sql('supabase/migrations/20261014225423_remove_database_tournament_sort_logic.sql'))
  const ordered = await db.query('SELECT category_name,category_sort_value FROM public.tournaments ORDER BY category_sort_value,id')
  assert.deepEqual(ordered.rows.map((row) => Number(row.category_sort_value)), [6, 6.5, 7, 7, 7.5])
  const functions = await db.query("SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('tournament_category_sort_rank','valid_tournament_sort_rules')")
  assert.equal(functions.rows.length, 0)
  const columns = await db.query("SELECT column_name,is_generated FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('tournaments','tenant_tournament_list_settings')")
  assert.equal(columns.rows.some((row) => ['list_category_rank','list_status_rank','organization_id'].includes(row.column_name)), false)
  assert.equal(columns.rows.every((row) => row.is_generated === 'NEVER'), true)
  await db.exec(sql('supabase/tests/tenant_tournament_sort.sql'))
  await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);`)
  const memberRead = await db.query('SELECT surface FROM public.tenant_tournament_list_settings')
  assert.equal(memberRead.rows.length, 1)
  const memberWrite = await db.query("UPDATE public.tenant_tournament_list_settings SET rules='[]' WHERE surface='panel' RETURNING surface")
  assert.equal(memberWrite.rows.length, 0)
  await db.exec('ROLLBACK;')
  console.log('PASS: migrations, preserved settings, TypeScript values, removed functions/generated columns, administrator/member/non-member RLS.')
} finally {
  await db.close()
}
