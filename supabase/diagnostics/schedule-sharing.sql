-- Read-only preflight. This is NOT a migration.
-- Remote destination, if/when the named connection is available:
-- supabase-fv / bfmaqrythlwbfjuqumom. Never run against the historical project.
-- No row names, player identities, or availability responses are returned.
begin transaction read only;

select current_setting('server_version') as postgres_version;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in (
  'tournaments', 'tournament_fechas', 'tournament_time_slots',
  'couple_time_availability', 'fecha_matches', 'organization_members', 'organization_clubs'
) and column_name in (
  'id', 'tournament_id', 'fecha_id', 'club_id', 'organization_id', 'organizacion_id',
  'user_id', 'role', 'is_active', 'fecha_number', 'name', 'description', 'start_date', 'end_date',
  'date', 'start_time', 'end_time', 'court_name', 'max_matches', 'is_available',
  'slot_type', 'is_system', 'round_type', 'bracket_key', 'status', 'format_config',
  'estimated_match_duration_minutes', 'max_matches_per_couple', 'updated_at',
  'time_slot_id', 'scheduled_time_slot_id', 'scheduled_date', 'scheduled_start_time',
  'scheduled_end_time', 'court_assignment', 'status_sort_value'
) order by table_name, ordinal_position;

select c.relname as table_name, c.relrowsecurity as rls_enabled,
  p.policyname, p.roles, p.cmd, p.qual, p.with_check
from pg_class c join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public' and c.relname in (
  'tournaments', 'tournament_fechas', 'tournament_time_slots', 'couple_time_availability',
  'fecha_matches', 'users', 'clubes', 'organization_members', 'organization_clubs'
) order by c.relname, p.policyname;

select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name in (
  'tournament_fechas', 'tournament_time_slots', 'couple_time_availability', 'fecha_matches'
) order by table_name, grantee, privilege_type;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in (
  'public.tournament_fechas'::regclass, 'public.tournament_time_slots'::regclass,
  'public.fecha_matches'::regclass, 'public.couple_time_availability'::regclass
) order by conrelid::regclass::text, conname;

select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in (
  'tournament_fechas', 'tournament_time_slots', 'couple_time_availability', 'fecha_matches'
) order by tablename, indexname;

select tgrelid::regclass as table_name, tgname, pg_get_triggerdef(oid) as definition
from pg_trigger where tgrelid in ('public.tournament_fechas'::regclass, 'public.tournament_time_slots'::regclass)
and not tgisinternal order by tgrelid::regclass::text, tgname;

select count(*) as duplicate_physical_options, coalesce(sum(duplicates - 1), 0) as extra_rows
from (
  select count(*) as duplicates from public.tournament_time_slots
  where slot_type = 'TIME_RANGE' and not is_system
  group by fecha_id, date, start_time, end_time,
    lower(trim(regexp_replace(coalesce(court_name, ''), '\s+', ' ', 'g')))
  having count(*) > 1
) duplicates;

select count(*) filter (where end_time = time '24:00') as end_of_day_slots,
  count(*) filter (where start_time >= end_time) as invalid_ranges,
  count(*) filter (where max_matches < 1) as invalid_capacities
from public.tournament_time_slots where slot_type = 'TIME_RANGE' and not is_system;

select type, status, count(*) as tournaments from public.tournaments group by type, status order by type, status;
rollback;
