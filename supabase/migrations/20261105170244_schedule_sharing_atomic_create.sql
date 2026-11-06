-- LOCAL CANDIDATE. Remote FV schema/RLS comparison is still required before approval.
-- Never apply this migration remotely from an agent session.
begin;

create schema schedule_private;
revoke all on schema schedule_private from public, anon;
grant usage on schema schedule_private to authenticated;
alter default privileges in schema schedule_private revoke execute on functions from public;

create function schedule_private.text_value(value text) returns text
language sql immutable security invoker set search_path = '' as $$
  select nullif(trim(regexp_replace(value, '\s+', ' ', 'g')), '');
$$;

create function schedule_private.fingerprint(value jsonb) returns text
language sql immutable security invoker set search_path = '' as $$
  select encode(sha256(convert_to(value::text, 'UTF8')), 'hex');
$$;

create function schedule_private.normalize_slot(value jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare d date; s time; e time; capacity integer;
begin
  if jsonb_typeof(value) is distinct from 'object'
    or coalesce(value->>'slot_type', 'TIME_RANGE') <> 'TIME_RANGE'
    or coalesce(value->>'is_system', 'false') <> 'false'
    or coalesce(value->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(value->>'start_time', '') !~ '^\d{1,2}:\d{2}(:\d{2})?$'
    or coalesce(value->>'end_time', '') !~ '^\d{1,2}:\d{2}(:\d{2})?$'
    or (value ? 'max_matches' and jsonb_typeof(value->'max_matches') <> 'number')
    or (value ? 'is_available' and jsonb_typeof(value->'is_available') <> 'boolean') then
    raise exception 'Franja inválida o de sistema.' using errcode = '22023';
  end if;
  d := (value->>'date')::date;
  s := (value->>'start_time')::time;
  e := (value->>'end_time')::time;
  capacity := coalesce((value->>'max_matches')::integer, 1);
  if d::text <> value->>'date' or s >= e or e >= time '24:00'
    or capacity < 1 or coalesce((value->>'max_matches')::numeric, 1) <> capacity then
    raise exception 'Día, rango o capacidad inválidos; 24:00 no está habilitado.' using errcode = '22023';
  end if;
  return jsonb_build_object('date', d, 'start_time', s::text,
    'end_time', e::text, 'court_name', schedule_private.text_value(value->>'court_name'),
    'max_matches', capacity, 'description', nullif(trim(value->>'description'), ''),
    'is_available', coalesce((value->>'is_available')::boolean, true));
end;
$$;

-- Privileged helpers live outside the exposed schema. They read authority tables
-- without recursive RLS and always derive the actor from auth.uid(), never payloads.
create function schedule_private.can_manage(tournament_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.users u cross join public.tournaments t
    where u.id = auth.uid() and t.id = tournament_id and (
      u.role::text = 'ADMIN'
      or (u.role::text = 'CLUB' and exists (
        select 1 from public.clubes c where c.id = t.club_id and c.user_id = u.id))
      or (u.role::text = 'ORGANIZADOR' and t.organization_id is not null and exists (
        select 1 from public.organization_members om where om.user_id = u.id
          and om.organizacion_id = t.organization_id and om.is_active))
    )
  );
$$;

create function schedule_private.slot_signature(value jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select schedule_private.normalize_slot(value) || jsonb_build_object('court_name',
    lower(coalesce(schedule_private.text_value(value->>'court_name'),'')));
$$;

create table public.schedule_share_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  description text, start_date date, end_date date,
  source_fecha_id uuid references public.tournament_fechas(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or start_date <= end_date)
);
create index schedule_share_groups_source_idx on public.schedule_share_groups(source_fecha_id);
create index schedule_share_groups_author_idx on public.schedule_share_groups(created_by);
create index schedule_share_groups_period_idx on public.schedule_share_groups(start_date, end_date, id);

create table public.schedule_share_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.schedule_share_groups(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete set null,
  fecha_id uuid references public.tournament_fechas(id) on delete set null,
  status text not null default 'active' check (status in ('active','unlinked','deleted')),
  applied_metadata jsonb not null check (jsonb_typeof(applied_metadata) = 'object'),
  applied_version bigint not null default 1 check (applied_version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (group_id, id), unique (group_id, tournament_id)
);
create unique index schedule_share_members_active_fecha_idx on public.schedule_share_members(fecha_id)
  where status = 'active' and fecha_id is not null;
create index schedule_share_members_tournament_idx on public.schedule_share_members(tournament_id, group_id);
create index schedule_share_members_fecha_idx on public.schedule_share_members(fecha_id);

create table public.schedule_share_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.schedule_share_groups(id) on delete cascade,
  item_key text not null check (length(item_key) between 1 and 100),
  content jsonb not null check (content = schedule_private.normalize_slot(content)),
  version bigint not null default 1 check (version > 0), deleted boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (group_id, id), unique (group_id, item_key)
);

create table public.schedule_share_item_targets (
  id uuid primary key default gen_random_uuid(), group_id uuid not null,
  member_id uuid not null, item_id uuid not null,
  slot_id uuid references public.tournament_time_slots(id) on delete set null,
  status text not null default 'active' check (status in ('active','unlinked','deleted')),
  applied_content jsonb not null check (jsonb_typeof(applied_content) = 'object'),
  applied_item_content jsonb not null check (jsonb_typeof(applied_item_content) = 'object'),
  applied_version bigint not null default 1 check (applied_version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (group_id, member_id) references public.schedule_share_members(group_id, id) on delete cascade,
  foreign key (group_id, item_id) references public.schedule_share_items(group_id, id) on delete cascade,
  unique (member_id, item_id)
);
create index schedule_share_item_targets_item_idx on public.schedule_share_item_targets(group_id, item_id);
create index schedule_share_item_targets_member_idx on public.schedule_share_item_targets(group_id, member_id);
create index schedule_share_item_targets_slot_idx on public.schedule_share_item_targets(slot_id);
create unique index schedule_share_item_targets_active_slot_idx on public.schedule_share_item_targets(slot_id)
  where status = 'active' and slot_id is not null;

create table public.schedule_share_operations (
  actor_id uuid not null references public.users(id) on delete cascade,
  operation_key uuid not null, payload_hash text not null,
  group_id uuid references public.schedule_share_groups(id) on delete set null,
  result jsonb not null, created_at timestamptz not null default now(),
  primary key (actor_id, operation_key)
);
create index schedule_share_operations_group_idx on public.schedule_share_operations(group_id);

create function schedule_private.can_read_group(group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.schedule_share_members m
    where m.group_id = can_read_group.group_id and schedule_private.can_manage(m.tournament_id));
$$;

alter table public.schedule_share_groups enable row level security;
alter table public.schedule_share_members enable row level security;
alter table public.schedule_share_items enable row level security;
alter table public.schedule_share_item_targets enable row level security;
alter table public.schedule_share_operations enable row level security;
revoke all on public.schedule_share_groups, public.schedule_share_members, public.schedule_share_items,
  public.schedule_share_item_targets, public.schedule_share_operations from public, anon, authenticated;
-- The optional origin/author can refer to a destination no longer visible to the
-- caller. Column grants keep those IDs private even for direct Data API queries.
grant select (id, name, description, start_date, end_date, version, created_at, updated_at)
  on public.schedule_share_groups to authenticated;
grant select on public.schedule_share_members, public.schedule_share_items, public.schedule_share_item_targets to authenticated;
create policy schedule_groups_read on public.schedule_share_groups for select to authenticated
  using (schedule_private.can_read_group(id));
create policy schedule_members_read on public.schedule_share_members for select to authenticated
  using (schedule_private.can_manage(tournament_id));
create policy schedule_items_read on public.schedule_share_items for select to authenticated
  using (schedule_private.can_read_group(group_id));
create policy schedule_targets_read on public.schedule_share_item_targets for select to authenticated
  using (exists (select 1 from public.schedule_share_members m
    where m.id = member_id and schedule_private.can_manage(m.tournament_id)));
-- No direct write grants or ledger read grants: only the checked transaction can
-- create links or forge an applied snapshot/idempotency result.

create function schedule_private.check_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'schedule_share_members' then
    if new.fecha_id is null or new.tournament_id is null then
      new.status := 'deleted';
    elsif not exists (select 1 from public.tournament_fechas f where f.id = new.fecha_id and f.tournament_id = new.tournament_id) then
      raise exception 'La fecha no pertenece al torneo del vínculo.' using errcode = '23514';
    end if;
  else
    if new.slot_id is null then new.status := 'deleted';
    elsif not exists (select 1 from public.schedule_share_members m join public.tournament_time_slots s on s.fecha_id = m.fecha_id
      where m.id = new.member_id and m.group_id = new.group_id and s.id = new.slot_id
        and s.slot_type = 'TIME_RANGE' and not s.is_system) then
      raise exception 'El horario no pertenece a la fecha del vínculo.' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger schedule_member_check before insert or update on public.schedule_share_members
  for each row execute function schedule_private.check_link();
create trigger schedule_target_check before insert or update on public.schedule_share_item_targets
  for each row execute function schedule_private.check_link();

-- Serialize legacy and new range writes on the fecha. No global unique index is
-- imposed on historical data; unchanged metadata edits keep historical options.
create function schedule_private.has_programmed_matches(v_slot uuid,v_fecha uuid,v_date date,v_start time,v_end time,v_court text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.fecha_matches m where m.scheduled_time_slot_id=v_slot
    or (m.fecha_id=v_fecha and m.scheduled_date=v_date
      and (nullif(trim(m.court_assignment),'') is null or nullif(trim(v_court),'') is null
        or lower(schedule_private.text_value(m.court_assignment))=lower(schedule_private.text_value(v_court)))
      and (m.scheduled_start_time is null or (m.scheduled_start_time<v_end
        and (m.scheduled_end_time is null or m.scheduled_end_time<=m.scheduled_start_time or m.scheduled_end_time>v_start)))));
$$;
create function schedule_private.guard_range() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f uuid;
begin
  f := case when tg_op = 'DELETE' then old.fecha_id else new.fecha_id end;
  perform 1 from public.tournament_fechas where id = f for update;
  if tg_op <> 'INSERT' and (old.slot_type = 'FREE_DATE' or old.is_system) and auth.uid() is not null
    and exists(select 1 from public.tournament_fechas where id = old.fecha_id) then
    raise exception 'Los horarios de sistema no se pueden modificar ni eliminar.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.fecha_id <> old.fecha_id and exists(
    select 1 from public.schedule_share_item_targets x where x.slot_id = old.id and x.status = 'active') then
    raise exception 'No se puede trasladar una franja vinculada a otra fecha.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and (new.slot_type,new.is_system) is distinct from (old.slot_type,old.is_system) then
    raise exception 'No se puede convertir una franja en un horario de sistema.' using errcode = '23514';
  end if;
  if tg_op <> 'INSERT' and old.slot_type = 'TIME_RANGE' and not old.is_system then
    if tg_op = 'DELETE' or (old.date, old.start_time, old.end_time, lower(coalesce(schedule_private.text_value(old.court_name), '')))
      is distinct from (new.date, new.start_time, new.end_time, lower(coalesce(schedule_private.text_value(new.court_name), ''))) then
      if exists(select 1 from public.couple_time_availability a where a.time_slot_id = old.id)
        or schedule_private.has_programmed_matches(old.id,old.fecha_id,old.date,old.start_time,old.end_time,old.court_name) then
        raise exception 'El horario tiene respuestas o partidos; revisá la programación antes de cambiarlo.' using errcode = '23514';
      end if;
    end if;
    if tg_op='UPDATE' and (new.max_matches<old.max_matches or (old.is_available and not new.is_available))
      and schedule_private.has_programmed_matches(old.id,old.fecha_id,old.date,old.start_time,old.end_time,old.court_name) then
      raise exception 'No se puede reducir capacidad ni deshabilitar un horario con partidos programados.' using errcode='23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.slot_type <> 'TIME_RANGE' or new.is_system then return new; end if;
  if tg_op = 'UPDATE' and (new.fecha_id, new.date, new.start_time, new.end_time, new.court_name, new.max_matches, new.is_available)
    is not distinct from (old.fecha_id, old.date, old.start_time, old.end_time, old.court_name, old.max_matches, old.is_available) then return new; end if;
  if new.start_time >= new.end_time or new.end_time >= time '24:00' or new.max_matches < 1 then
    raise exception 'Rango o capacidad inválidos.' using errcode = '23514';
  end if;
  if exists(select 1 from public.tournament_time_slots s where s.fecha_id = new.fecha_id and s.id <> new.id
    and s.slot_type = 'TIME_RANGE' and not s.is_system and s.date = new.date
    and lower(coalesce(schedule_private.text_value(s.court_name),'')) = lower(coalesce(schedule_private.text_value(new.court_name),''))
    and s.start_time < new.end_time and new.start_time < s.end_time) then
    raise exception 'Hay solapamiento en el mismo día y cancha.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger schedule_range_guard before insert or update or delete on public.tournament_time_slots
  for each row execute function schedule_private.guard_range();

create function schedule_private.lock_dependency() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parent_fecha uuid;
begin
  if tg_table_name = 'fecha_matches' then
    if new.fecha_id is not null then perform 1 from public.tournament_fechas where id = new.fecha_id for share; end if;
    if new.scheduled_time_slot_id is not null then perform 1 from public.tournament_time_slots where id = new.scheduled_time_slot_id for share; end if;
  else
    select s.fecha_id into parent_fecha from public.tournament_time_slots s where s.id=new.time_slot_id;
    perform 1 from public.tournament_fechas where id=parent_fecha for share;
    perform 1 from public.tournament_time_slots where id = new.time_slot_id for share;
    if parent_fecha is distinct from (select s.fecha_id from public.tournament_time_slots s where s.id=new.time_slot_id) then
      raise exception 'El horario cambió; volvé a cargar la disponibilidad.' using errcode='40001';
    end if;
  end if;
  return new;
end;
$$;
create trigger schedule_answer_lock before insert or update on public.couple_time_availability
  for each row execute function schedule_private.lock_dependency();
create trigger schedule_match_lock before insert or update on public.fecha_matches
  for each row execute function schedule_private.lock_dependency();

create function schedule_private.guard_fecha() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and (
    exists(select 1 from public.tournament_time_slots s join public.couple_time_availability a on a.time_slot_id=s.id where s.fecha_id=old.id)
    or exists(select 1 from public.fecha_matches m where m.fecha_id=old.id and (m.scheduled_date is not null or m.scheduled_time_slot_id is not null))) then
    raise exception 'La fecha tiene respuestas o partidos programados. Revisalos antes de eliminarla.' using errcode='23514';
  end if;
  if tg_op = 'UPDATE' and new.tournament_id <> old.tournament_id
    and exists(select 1 from public.schedule_share_members m where m.fecha_id=old.id and m.status='active') then
    raise exception 'No se puede trasladar una fecha vinculada a otro torneo.' using errcode='23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger schedule_fecha_guard before update or delete on public.tournament_fechas
  for each row execute function schedule_private.guard_fecha();

create function schedule_private.can_manage_fecha(fecha_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.tournament_fechas f
    where f.id=fecha_id and schedule_private.can_manage(f.tournament_id));
$$;
-- Restrictive mutation policies intersect existing permissive policies. They
-- preserve player SELECT/availability access and close inactive-membership writes.
-- The explicit management policies also cover ADMIN, absent from legacy policy
-- predicates, and provide the SELECT permission required by UPDATE/RETURNING.
create policy schedule_fecha_management on public.tournament_fechas for all to authenticated
  using (schedule_private.can_manage(tournament_id)) with check (schedule_private.can_manage(tournament_id));
create policy schedule_slot_management on public.tournament_time_slots for all to authenticated
  using (schedule_private.can_manage_fecha(fecha_id)) with check (schedule_private.can_manage_fecha(fecha_id));
create policy schedule_fecha_insert_guard on public.tournament_fechas as restrictive for insert to authenticated
  with check (schedule_private.can_manage(tournament_id));
create policy schedule_fecha_update_guard on public.tournament_fechas as restrictive for update to authenticated
  using (schedule_private.can_manage(tournament_id)) with check (schedule_private.can_manage(tournament_id));
create policy schedule_fecha_delete_guard on public.tournament_fechas as restrictive for delete to authenticated
  using (schedule_private.can_manage(tournament_id));
create policy schedule_slot_insert_guard on public.tournament_time_slots as restrictive for insert to authenticated
  with check (schedule_private.can_manage_fecha(fecha_id) and slot_type='TIME_RANGE' and not is_system);
create policy schedule_slot_update_guard on public.tournament_time_slots as restrictive for update to authenticated
  using (schedule_private.can_manage_fecha(fecha_id)) with check (schedule_private.can_manage_fecha(fecha_id));
create policy schedule_slot_delete_guard on public.tournament_time_slots as restrictive for delete to authenticated
  using (schedule_private.can_manage_fecha(fecha_id));

-- Batch RPCs: public entry points are invokers. The private implementation is
-- privileged so callers cannot write tracking rows/ledger directly. All resource
-- checks are repeated here, including direct RPC calls and replayed operations.
create function schedule_private.build_plan(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  metadata jsonb; slots jsonb := '[]'; destinations jsonb := '[]'; state jsonb := '[]';
  d jsonb; raw_slot jsonb; slot jsonb; mapped jsonb; planned jsonb; existing_slot jsonb;
  additions jsonb; reused jsonb; conflicts jsonb; desired jsonb;
  t public.tournaments%rowtype; f public.tournament_fechas%rowtype;
  existing_group public.schedule_share_groups%rowtype;
  completion public.schedule_share_members%rowtype;
  equivalent_ids uuid[]; selected_id uuid; candidate public.tournament_time_slots%rowtype;
  adoption_id uuid; source_id uuid; n integer; item_key text; court text;
  period_start date; period_end date; slot_day date; metadata_changed boolean;
  today date := timezone('America/Argentina/Buenos_Aires', now())::date;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado.' using errcode = '42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k
    where k not in ('operation_key','source_fecha_id','metadata','slots','destinations','group_id','complete_member_id')) then
    raise exception 'Contrato de operación inválido.' using errcode = '22023';
  end if;
  if nullif(payload->>'operation_key','') is null then raise exception 'Falta la clave de operación.' using errcode = '22023'; end if;
  perform (payload->>'operation_key')::uuid;
  if jsonb_typeof(payload->'slots') is distinct from 'array'
    or jsonb_typeof(payload->'destinations') is distinct from 'array'
    or jsonb_typeof(payload->'metadata') is distinct from 'object' then
    raise exception 'Contrato de operación inválido.' using errcode = '22023';
  end if;
  if jsonb_array_length(payload->'destinations') not between 1 and 30
    or jsonb_array_length(payload->'slots') * jsonb_array_length(payload->'destinations') > 840
    or (select count(distinct x->>'tournament_id') from jsonb_array_elements(payload->'destinations') x)
      <> jsonb_array_length(payload->'destinations') then
    raise exception 'Alcance inválido o demasiado grande.' using errcode = '22023';
  end if;
  -- Authorize the entire scope before fetching names or returning plan details.
  for d in select value from jsonb_array_elements(payload->'destinations') loop
    if not schedule_private.can_manage((d->>'tournament_id')::uuid) then
      raise exception 'No tenés permisos sobre todos los destinos.' using errcode = '42501';
    end if;
  end loop;
  source_id := (payload->>'source_fecha_id')::uuid;
  if payload->>'group_id' is not null then
    select * into existing_group from public.schedule_share_groups g
      where g.id=(payload->>'group_id')::uuid and schedule_private.can_read_group(g.id);
    if not found then raise exception 'El grupo no es administrable.' using errcode='42501'; end if;
    if source_id is not null then raise exception 'Un grupo existente ya tiene su propia configuración.' using errcode='22023'; end if;
    state := state || jsonb_build_array(to_jsonb(existing_group));
  end if;
  if payload->>'complete_member_id' is not null then
    select * into completion from public.schedule_share_members m
      where m.id=(payload->>'complete_member_id')::uuid and m.group_id=existing_group.id
        and m.status='active' and m.fecha_id is not null and schedule_private.can_manage(m.tournament_id);
    if not found or jsonb_array_length(payload->'destinations')<>1
      or (payload#>>'{destinations,0,tournament_id}')::uuid is distinct from completion.tournament_id
      or payload#>>'{destinations,0,fecha,kind}' is distinct from 'adopt'
      or (payload#>>'{destinations,0,fecha,fecha_id}')::uuid is distinct from completion.fecha_id then
      raise exception 'La copia seleccionada no es administrable.' using errcode='42501';
    end if;
    if jsonb_array_length(payload->'slots')=0 then raise exception 'No hay horarios faltantes vigentes.' using errcode='22023'; end if;
  end if;
  if source_id is not null and not exists(select 1 from public.tournament_fechas sf where sf.id = source_id and schedule_private.can_manage(sf.tournament_id)) then
    raise exception 'La fecha de origen no existe o no es administrable.' using errcode = '42501';
  end if;
  if source_id is not null then
    state := state || jsonb_build_array(jsonb_build_object('source',
      (select to_jsonb(sf) from public.tournament_fechas sf where sf.id=source_id),
      'source_slots',(select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') from public.tournament_time_slots s where s.fecha_id=source_id)));
  end if;
  metadata := payload->'metadata';
  if length(trim(coalesce(metadata->>'name',''))) not between 1 and 200
    or (metadata->>'start_date' is not null and metadata->>'start_date' !~ '^\d{4}-\d{2}-\d{2}$')
    or (metadata->>'end_date' is not null and metadata->>'end_date' !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'Nombre o período inválidos.' using errcode = '22023';
  end if;
  period_start := (metadata->>'start_date')::date; period_end := (metadata->>'end_date')::date;
  if period_start > period_end then raise exception 'Período inválido.' using errcode = '22023'; end if;
  metadata := jsonb_build_object('name', trim(metadata->>'name'), 'description', nullif(trim(metadata->>'description'),''),
    'start_date', period_start, 'end_date', period_end);
  for raw_slot in select value from jsonb_array_elements(payload->'slots') loop
    item_key := raw_slot->>'key';
    if item_key is null or length(item_key) not between 1 and 100
      or exists(select 1 from jsonb_array_elements(slots) x where x->>'key' = item_key) then
      raise exception 'La identidad de cada franja debe ser única.' using errcode = '22023';
    end if;
    slot := schedule_private.normalize_slot(raw_slot);
    slot_day := (slot->>'date')::date;
    if slot_day < today or slot_day < period_start or slot_day > period_end then
      raise exception 'El día está en el pasado o fuera del período.' using errcode = '22023';
    end if;
    if exists(select 1 from jsonb_array_elements(slots) x where x->>'date' = slot->>'date'
      and lower(coalesce(x->>'court_name','')) = lower(coalesce(slot->>'court_name',''))
      and (x->>'start_time')::time < (slot->>'end_time')::time and (slot->>'start_time')::time < (x->>'end_time')::time) then
      raise exception 'El borrador contiene franjas duplicadas o solapadas.' using errcode = '22023';
    end if;
    slots := slots || jsonb_build_array(slot || jsonb_build_object('key', item_key));
  end loop;
  if existing_group.id is not null and (
    metadata is distinct from jsonb_build_object('name',existing_group.name,'description',existing_group.description,
      'start_date',existing_group.start_date,'end_date',existing_group.end_date)
    or (select coalesce(jsonb_agg(x order by x->>'key'),'[]') from jsonb_array_elements(slots) x)
      is distinct from (select coalesce(jsonb_agg(i.content || jsonb_build_object('key',i.item_key) order by i.item_key),'[]')
        from public.schedule_share_items i where i.group_id=existing_group.id and not i.deleted and (i.content->>'date')::date>=today
          and not exists (select 1 from public.schedule_share_item_targets x where x.member_id=completion.id and x.item_id=i.id))
  ) then
    raise exception 'La configuración compartida cambió. Volvé a abrir el grupo.' using errcode='40001';
  end if;
  for d in select value from jsonb_array_elements(payload->'destinations') loop
    select * into strict t from public.tournaments where id = (d->>'tournament_id')::uuid;
    conflicts := '[]'; additions := '[]'; reused := '[]'; desired := '[]'; f := null;
    if completion.id is null and exists(select 1 from public.schedule_share_members m
      where m.group_id=existing_group.id and m.tournament_id=t.id and m.status='active') then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','ALREADY_SHARED','message','El torneo ya está vinculado a esta fecha.'));
    end if;
    if t.type::text <> 'LONG' or t.status::text in ('FINISHED','FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED','CANCELED') then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','INELIGIBLE','message','El torneo no admite nuevas aplicaciones.'));
    end if;
    if d->>'round_type' not in ('ZONE','32VOS','16VOS','8VOS','4TOS','SEMIFINAL','FINAL')
      or d->>'bracket_key' not in ('MAIN','GOLD','SILVER')
      or d->>'round_type' is null or d->>'bracket_key' is null
      or coalesce((d->>'estimated_match_duration_minutes')::integer,0) not in (60,75,90)
      or (d->>'max_matches_per_couple' is not null and (d->>'max_matches_per_couple')::integer < 1) then
      raise exception 'Configuración local inválida.' using errcode = '22023';
    end if;
    if (d->>'round_type' = 'ZONE' and d->>'bracket_key' <> 'MAIN')
      or (d->>'round_type' <> 'ZONE' and (
        not exists(select 1 from public.matches m where m.tournament_id = t.id and m.type::text = 'ELIMINATION'
          and m.bracket_is_active and m.round::text = d->>'round_type' and coalesce(m.bracket_key,'MAIN') = d->>'bracket_key')
        or ((t.format_config->>'version' = '2' and t.format_config->>'presetId' = 'LONG_SINGLE_ZONE_GOLD_SILVER')
          is true and d->>'bracket_key' = 'MAIN')
        or ((t.format_config->>'version' = '2' and t.format_config->>'presetId' = 'LONG_SINGLE_ZONE_GOLD_SILVER')
          is not true and d->>'bracket_key' <> 'MAIN'))) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','INCOMPATIBLE_ROUND','message','Ronda o copa incompatible con el bracket.'));
    end if;
    if d->'fecha'->>'kind' not in ('create','adopt') or d->'fecha'->>'kind' is null then
      raise exception 'Destino de fecha inválido.' using errcode = '22023';
    end if;
    adoption_id := case when d->'fecha'->>'kind' = 'adopt' then (d->'fecha'->>'fecha_id')::uuid else null end;
    if d->'fecha'->>'kind' = 'adopt' then
      select * into f from public.tournament_fechas where id = adoption_id and tournament_id = t.id;
      if f.id is null or f.round_type::text <> d->>'round_type' or f.bracket_key <> d->>'bracket_key'
        or (completion.id is null and (f.start_date is distinct from period_start or f.end_date is distinct from period_end))
        or f.estimated_match_duration_minutes <> (d->>'estimated_match_duration_minutes')::integer
        or f.max_matches_per_couple is distinct from (d->>'max_matches_per_couple')::integer then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','INCOMPATIBLE_FECHA','message','La fecha elegida no es compatible con este destino.'));
      end if;
      if completion.id is null and exists(select 1 from public.schedule_share_members m where m.fecha_id = adoption_id and m.status = 'active') then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','ALREADY_SHARED','message','La fecha ya pertenece a un grupo.'));
      end if;
    end if;
    select coalesce(max(fecha_number),0)+1 into n from public.tournament_fechas where tournament_id = t.id;
    for slot in select value from jsonb_array_elements(slots) loop
      item_key := slot->>'key';
      if completion.id is not null and (
        (slot->>'date')::date < f.start_date or (slot->>'date')::date > f.end_date
      ) then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','SLOT_CONFLICT','slot_key',item_key,
          'message','La franja queda fuera del período local del torneo.'));
      end if;
      if d->'court_choice' = '"clear"'::jsonb then court := null;
      elsif d->'court_choice' = '"preserve"'::jsonb then court := slot->>'court_name';
      elsif jsonb_typeof(d->'court_choice'->'rename') = 'object' and d->'court_choice'->'rename' ? item_key then
        court := d->'court_choice'->'rename'->>item_key;
      else
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','SLOT_CONFLICT','slot_key',item_key,'message','Falta revisar la cancha.'));
        continue;
      end if;
      mapped := schedule_private.normalize_slot(slot || jsonb_build_object('court_name',court));
      if exists(select 1 from jsonb_array_elements(desired) x where x->>'date' = mapped->>'date'
        and lower(coalesce(x->>'court_name','')) = lower(coalesce(mapped->>'court_name',''))
        and (x->>'start_time')::time < (mapped->>'end_time')::time and (mapped->>'start_time')::time < (x->>'end_time')::time) then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','SLOT_CONFLICT','slot_key',item_key,'message','La revisión de canchas provoca un solapamiento.'));
      end if;
      desired := desired || jsonb_build_array(mapped);
      select array_agg(s.id order by s.id) into equivalent_ids from public.tournament_time_slots s
        where s.fecha_id = f.id and s.slot_type = 'TIME_RANGE' and not s.is_system
          and s.date = (mapped->>'date')::date and s.start_time = (mapped->>'start_time')::time and s.end_time = (mapped->>'end_time')::time
          and lower(coalesce(schedule_private.text_value(s.court_name),'')) = lower(coalesce(mapped->>'court_name',''));
      selected_id := (d->'slot_adoptions'->>item_key)::uuid;
      if selected_id is not null and (equivalent_ids is null or not selected_id = any(equivalent_ids)) then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','INVALID_SLOT_ADOPTION','slot_key',item_key,'message','La coincidencia seleccionada ya no es válida.'));
      elsif cardinality(equivalent_ids) > 1 and selected_id is null then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','AMBIGUOUS_SLOT','slot_key',item_key,'candidate_ids',to_jsonb(equivalent_ids),'message','Elegí una coincidencia explícita.'));
      elsif cardinality(equivalent_ids) > 0 then
        selected_id := coalesce(selected_id,equivalent_ids[1]);
        select * into strict candidate from public.tournament_time_slots where id = selected_id;
        existing_slot := schedule_private.normalize_slot(to_jsonb(candidate));
        if exists(select 1 from public.schedule_share_item_targets x where x.slot_id=selected_id and x.status='active') then
          conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','SLOT_CONFLICT','slot_key',item_key,'message','Ese horario ya está vinculado a otra franja.'));
        elsif schedule_private.slot_signature(existing_slot) <> schedule_private.slot_signature(mapped) then
          conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','LOCAL_SLOT_DIFFERENCE','slot_key',item_key,'message','La coincidencia contiene diferencias locales.'));
        else reused := reused || jsonb_build_array(jsonb_build_object('key',item_key,'slot_id',selected_id)); end if;
      elsif exists(select 1 from public.tournament_time_slots s where s.fecha_id = f.id and s.slot_type = 'TIME_RANGE' and not s.is_system
        and s.date = (mapped->>'date')::date and lower(coalesce(schedule_private.text_value(s.court_name),'')) = lower(coalesce(mapped->>'court_name',''))
        and s.start_time < (mapped->>'end_time')::time and (mapped->>'start_time')::time < s.end_time) then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object('code','SLOT_CONFLICT','slot_key',item_key,'message','Hay solapamiento con un horario existente.'));
      else additions := additions || jsonb_build_array(mapped || jsonb_build_object('key',item_key)); end if;
    end loop;
    metadata_changed := f.id is not null and (f.name is distinct from metadata->>'name' or f.description is distinct from metadata->>'description');
    planned := jsonb_build_object('tournament_id',t.id,'tournament_name',t.name,'fecha_id',f.id,
      'fecha_number',coalesce(f.fecha_number,n),'transition_to_zone_phase',f.id is null and d->>'round_type' = 'ZONE' and t.status::text = 'NOT_STARTED',
      'new_slots',additions,'reused_slots',reused,'preserves_local_metadata',metadata_changed,'conflicts',conflicts);
    destinations := destinations || jsonb_build_array(planned);
    -- Hashes include current rows, not just updated_at, because legacy forms may
    -- not bump version/timestamps. All state is authorized; only its hash escapes.
    state := state || jsonb_build_array(jsonb_build_object('tournament',to_jsonb(t),
      'fechas',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.tournament_fechas x where x.tournament_id = t.id),
      'slots',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.tournament_time_slots x where x.fecha_id = f.id),
      'links',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.schedule_share_members x
        where x.fecha_id = f.id or (x.group_id=existing_group.id and x.tournament_id=t.id)),
      'targets',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.schedule_share_item_targets x where x.member_id=completion.id)));
  end loop;
  return jsonb_build_object('revision',schedule_private.fingerprint(jsonb_build_object('payload',payload,'state',state)),
    'preview',jsonb_build_object('operation_key',payload->>'operation_key',
      'can_commit',not exists(select 1 from jsonb_array_elements(destinations) x where jsonb_array_length(x->'conflicts') > 0),
      'destinations',destinations,
      'physical_slots_to_create',(select coalesce(sum(jsonb_array_length(x->'new_slots')),0) from jsonb_array_elements(destinations) x),
      'physical_slots_to_reuse',(select coalesce(sum(jsonb_array_length(x->'reused_slots')),0) from jsonb_array_elements(destinations) x)),
    'metadata',metadata,'slots',slots);
end;
$$;

create function schedule_private.preview_batch(payload jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select schedule_private.build_plan(payload) - 'metadata' - 'slots';
$$;

create function schedule_private.commit_batch(payload jsonb, expected_revision text) returns jsonb
language plpgsql security definer set search_path = '' as $$
<<schedule_commit>>
declare actor uuid := auth.uid(); key uuid; payload_hash text; previous public.schedule_share_operations%rowtype;
  plan jsonb; p jsonb; d jsonb; slot jsonb; reused jsonb; common_content jsonb; scope_ids uuid[];
  group_id uuid; member_id uuid; fecha_id uuid; item_id uuid; slot_id uuid;
  group_version bigint := 1; item_version bigint;
  result jsonb; results jsonb := '[]'; metadata jsonb;
begin
  if actor is null then raise exception 'Usuario no autenticado.' using errcode = '42501'; end if;
  key := (payload->>'operation_key')::uuid;
  if key is null then raise exception 'Falta la clave de operación.' using errcode = '22023'; end if;
  payload_hash := schedule_private.fingerprint(payload);
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || key::text,0));
  select * into previous from public.schedule_share_operations o where o.actor_id = actor and o.operation_key = key;
  if found then
    if previous.payload_hash <> payload_hash then raise exception 'La clave ya se usó con otro contenido.' using errcode = '22023'; end if;
    for d in select value from jsonb_array_elements(previous.result->'destinations') loop
      if not schedule_private.can_manage((d->>'tournament_id')::uuid) then
        raise exception 'Los permisos cambiaron; no se puede recuperar esta operación.' using errcode = '42501';
      end if;
    end loop;
    if (payload->>'source_fecha_id') is not null and not exists(select 1 from public.tournament_fechas f
      where f.id = (payload->>'source_fecha_id')::uuid and schedule_private.can_manage(f.tournament_id)) then
      raise exception 'El origen ya no es administrable.' using errcode = '42501';
    end if;
    return previous.result;
  end if;
  -- An initial authorization pass prevents locking arbitrary foreign resources.
  perform schedule_private.build_plan(payload);
  group_id := (payload->>'group_id')::uuid;
  if group_id is not null then
    select g.version into group_version from public.schedule_share_groups g where g.id=schedule_commit.group_id for update;
  end if;
  select array_agg(id order by id) into scope_ids from (
    select (x->>'tournament_id')::uuid id from jsonb_array_elements(payload->'destinations') x
    union select f.tournament_id from public.tournament_fechas f where f.id = (payload->>'source_fecha_id')::uuid
  ) ids;
  -- Lock authorities and tournament parents in a stable order. Revocation and
  -- legacy fecha inserts cannot race the checked transaction.
  perform 1 from public.users where id = actor for share;
  perform 1 from public.clubes c where c.id in (select t.club_id from public.tournaments t where t.id = any(scope_ids)) order by c.id for share;
  perform 1 from public.organization_members om where om.user_id = actor order by om.organizacion_id, om.id for share;
  perform 1 from public.tournaments where id = any(scope_ids) order by id for update;
  perform 1 from public.tournament_fechas where tournament_id = any(scope_ids) order by id for update;
  perform 1 from public.tournament_time_slots s where s.fecha_id in (
    select (x->'fecha'->>'fecha_id')::uuid from jsonb_array_elements(payload->'destinations') x where x->'fecha'->>'kind' = 'adopt'
  ) order by s.id for share;
  plan := schedule_private.build_plan(payload);
  if expected_revision is null or plan->>'revision' <> expected_revision then
    raise exception 'La vista previa quedó desactualizada. Revisá los cambios antes de guardar.' using errcode = '40001';
  end if;
  if not (plan->'preview'->>'can_commit')::boolean then
    raise exception 'Hay conflictos pendientes en la vista previa.' using errcode = '23514';
  end if;
  metadata := plan->'metadata';
  if group_id is null then
    insert into public.schedule_share_groups(name,description,start_date,end_date,source_fecha_id,created_by)
      values(metadata->>'name',metadata->>'description',(metadata->>'start_date')::date,(metadata->>'end_date')::date,
        (payload->>'source_fecha_id')::uuid,actor) returning id into group_id;
    insert into public.schedule_share_items(group_id,item_key,content)
      select group_id,x->>'key',x-'key' from jsonb_array_elements(plan->'slots') x;
  end if;
  for p in select value from jsonb_array_elements(plan->'preview'->'destinations') loop
    select value into strict d from jsonb_array_elements(payload->'destinations') where value->>'tournament_id' = p->>'tournament_id';
    fecha_id := (p->>'fecha_id')::uuid;
    if fecha_id is null then
      insert into public.tournament_fechas(tournament_id,fecha_number,name,description,start_date,end_date,round_type,bracket_key,
        estimated_match_duration_minutes,max_matches_per_couple)
      values((p->>'tournament_id')::uuid,(p->>'fecha_number')::integer,metadata->>'name',metadata->>'description',
        (metadata->>'start_date')::date,(metadata->>'end_date')::date,(d->>'round_type')::public."ROUND",d->>'bracket_key',
        (d->>'estimated_match_duration_minutes')::integer,(d->>'max_matches_per_couple')::integer) returning id into fecha_id;
      if (p->>'transition_to_zone_phase')::boolean then
        update public.tournaments set status = 'ZONE_PHASE', status_sort_value = 2 where id = (p->>'tournament_id')::uuid;
      end if;
    end if;
    if payload->>'complete_member_id' is not null then
      member_id := (payload->>'complete_member_id')::uuid;
    else
      insert into public.schedule_share_members(group_id,tournament_id,fecha_id,applied_metadata,applied_version)
        values(group_id,(p->>'tournament_id')::uuid,fecha_id,metadata,group_version)
        on conflict on constraint schedule_share_members_group_id_tournament_id_key
        do update set fecha_id=excluded.fecha_id,status='active',applied_metadata=excluded.applied_metadata,applied_version=excluded.applied_version
        returning id into member_id;
    end if;
    for slot in select value from jsonb_array_elements(p->'new_slots') loop
      insert into public.tournament_time_slots(fecha_id,date,start_time,end_time,court_name,max_matches,description,is_available)
        values(fecha_id,(slot->>'date')::date,(slot->>'start_time')::time,(slot->>'end_time')::time,slot->>'court_name',
          (slot->>'max_matches')::integer,slot->>'description',(slot->>'is_available')::boolean) returning id into slot_id;
      select i.id,i.content,i.version into strict item_id,common_content,item_version from public.schedule_share_items i where i.group_id = schedule_commit.group_id and i.item_key = slot->>'key';
      insert into public.schedule_share_item_targets(group_id,member_id,item_id,slot_id,applied_content,applied_item_content,applied_version)
        values(group_id,member_id,item_id,slot_id,slot-'key',common_content,item_version)
        on conflict on constraint schedule_share_item_targets_member_id_item_id_key
        do update set slot_id=excluded.slot_id,status='active',applied_content=excluded.applied_content,
          applied_item_content=excluded.applied_item_content,applied_version=excluded.applied_version;
    end loop;
    for reused in select value from jsonb_array_elements(p->'reused_slots') loop
      slot_id := (reused->>'slot_id')::uuid;
      select i.id,i.content,i.version into strict item_id,common_content,item_version from public.schedule_share_items i where i.group_id = schedule_commit.group_id and i.item_key = reused->>'key';
      select schedule_private.normalize_slot(to_jsonb(s)) into strict slot from public.tournament_time_slots s where s.id = slot_id;
      insert into public.schedule_share_item_targets(group_id,member_id,item_id,slot_id,applied_content,applied_item_content,applied_version)
        values(group_id,member_id,item_id,slot_id,slot,common_content,item_version)
        on conflict on constraint schedule_share_item_targets_member_id_item_id_key
        do update set slot_id=excluded.slot_id,status='active',applied_content=excluded.applied_content,
          applied_item_content=excluded.applied_item_content,applied_version=excluded.applied_version;
    end loop;
    results := results || jsonb_build_array(jsonb_build_object('tournament_id',p->>'tournament_id','fecha_id',fecha_id,
      'new_slots',jsonb_array_length(p->'new_slots'),'reused_slots',jsonb_array_length(p->'reused_slots')));
  end loop;
  result := jsonb_build_object('group_id',group_id,'operation_key',key,'destinations',results);
  insert into public.schedule_share_operations(actor_id,operation_key,payload_hash,group_id,result)
    values(actor,key,payload_hash,group_id,result);
  return result;
end;
$$;

create function public.preview_schedule_batch(payload jsonb) returns jsonb
language sql stable security invoker set search_path = '' as $$ select schedule_private.preview_batch(payload); $$;
create function public.commit_schedule_batch(payload jsonb, expected_revision text) returns jsonb
language sql security invoker set search_path = '' as $$ select schedule_private.commit_batch(payload, expected_revision); $$;
revoke all on function public.preview_schedule_batch(jsonb), public.commit_schedule_batch(jsonb,text) from public, anon;
grant execute on function public.preview_schedule_batch(jsonb), public.commit_schedule_batch(jsonb,text) to authenticated;

revoke all on all functions in schema schedule_private from public, anon, authenticated;
grant execute on function schedule_private.can_manage(uuid), schedule_private.can_manage_fecha(uuid), schedule_private.can_read_group(uuid) to authenticated;
grant execute on function schedule_private.preview_batch(jsonb), schedule_private.commit_batch(jsonb,text) to authenticated;

create function public.schedule_sharing_schema_version() returns integer
language sql immutable security invoker set search_path = '' as $$ select 1; $$;
revoke all on function public.schedule_sharing_schema_version() from public, anon;
grant execute on function public.schedule_sharing_schema_version() to authenticated;

-- Set-based coverage: underlying RLS limits every member, count and array to
-- currently authorized resources. Legacy independent fechas are never grouped
-- by names or dates. Existing rows require no backfill.
create view public.schedule_workspace_entries with (security_invoker = true) as
with members as (
  select m.id, m.group_id, m.fecha_id, m.tournament_id, m.status, t.club_id, f.round_type::text, f.bracket_key,
    (m.status='active' and f.id is not null and jsonb_build_object('name',trim(f.name),'description',nullif(trim(f.description),''),
      'start_date',f.start_date,'end_date',f.end_date) <> m.applied_metadata) as metadata_local,
    g.version > m.applied_version as metadata_shared
  from public.schedule_share_members m join public.schedule_share_groups g on g.id=m.group_id
  left join public.tournament_fechas f on f.id=m.fecha_id join public.tournaments t on t.id=m.tournament_id
  where schedule_private.can_manage(t.id)
), target_diffs as (
  select m.id,
    coalesce(bool_or(case when x.id is null or x.status <> 'active' then false when s.id is null then true
      else schedule_private.slot_signature(to_jsonb(s)) <> schedule_private.slot_signature(x.applied_content) end),false) as local_change,
    coalesce(bool_or(case when x.id is null or x.status<>'active' then false else i.deleted or i.version > x.applied_version
      or schedule_private.slot_signature(i.content) <> schedule_private.slot_signature(x.applied_item_content) end),false) as shared_change,
    coalesce(bool_or(x.status in ('deleted','unlinked')),false) as intentional_removal
  from members m left join public.schedule_share_item_targets x on x.member_id=m.id
  left join public.schedule_share_items i on i.id=x.item_id
  left join public.tournament_time_slots s on s.id=x.slot_id group by m.id
), missing as (
  select m.id, count(i.id) filter (where x.id is null) > 0 as has_missing
  from members m join public.schedule_share_items i on i.group_id=m.group_id and not i.deleted
  left join public.schedule_share_item_targets x on x.member_id=m.id and x.item_id=i.id where m.status='active' group by m.id
), grouped as (
  select m.group_id, array_agg(distinct m.tournament_id) as tournament_ids,
    array_remove(array_agg(distinct m.club_id),null) as club_ids,
    array_remove(array_agg(distinct m.round_type),null) as round_types, array_remove(array_agg(distinct m.bracket_key),null) as bracket_keys,
    (count(*) filter (where m.status='active' and m.fecha_id is not null))::integer as tournament_count,
    case when bool_or(m.metadata_local or d.local_change) then 'LOCAL_CHANGES'
      when bool_or(m.metadata_shared or d.shared_change) then 'SHARED_CHANGES'
      when bool_or(coalesce(p.has_missing,false)) then 'MISSING_SLOTS'
      when bool_or(d.intentional_removal or m.status<>'active' or m.fecha_id is null) then 'UNLINKED' else 'COMPLETE' end as distribution_state
  from members m join target_diffs d on d.id=m.id left join missing p on p.id=m.id group by m.group_id
), group_slot_counts as (
  select group_id, count(*)::integer slot_count from public.schedule_share_items where not deleted group by group_id
), individual_slot_counts as (
  select fecha_id,count(*)::integer slot_count from public.tournament_time_slots where slot_type='TIME_RANGE' and not is_system group by fecha_id
)
select g.id, 'GROUP'::text as kind, g.name,g.description,g.start_date,g.end_date,g.created_at,
  x.tournament_ids,x.club_ids,x.round_types,x.bracket_keys,x.tournament_count,
  coalesce(c.slot_count,0) as slot_count,x.distribution_state
from public.schedule_share_groups g join grouped x on x.group_id=g.id left join group_slot_counts c on c.group_id=g.id
union all
select f.id,'INDIVIDUAL'::text,f.name,f.description,f.start_date,f.end_date,f.created_at,
  array[f.tournament_id],array_remove(array[t.club_id],null),array[f.round_type::text],array[f.bracket_key],
  1,coalesce(c.slot_count,0),'INDIVIDUAL'::text
from public.tournament_fechas f join public.tournaments t on t.id=f.tournament_id
left join individual_slot_counts c on c.fecha_id=f.id
where t.type::text='LONG' and schedule_private.can_manage(t.id)
  and not exists(select 1 from public.schedule_share_members m where m.fecha_id=f.id and m.status='active');
revoke all on public.schedule_workspace_entries from public, anon, authenticated;
grant select on public.schedule_workspace_entries to authenticated;
grant execute on function schedule_private.normalize_slot(jsonb), schedule_private.slot_signature(jsonb), schedule_private.text_value(text) to authenticated;

-- Management can inspect round/cup pairs even while its bracket is a draft.
create function schedule_private.available_rounds(tournament_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(cardinality(tournament_ids),0) not between 1 and 30
    or exists(select 1 from unnest(tournament_ids) id where not schedule_private.can_manage(id)) then
    raise exception 'No tenés permisos sobre todos los torneos.' using errcode='42501';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.tournament_id,r.round_type,r.bracket_key),'[]')
    from (
      select distinct m.tournament_id,m.round::text as round_type,coalesce(m.bracket_key,'MAIN') as bracket_key
      from public.matches m
      where m.tournament_id=any(tournament_ids) and m.type='ELIMINATION' and m.bracket_is_active
        and m.round::text in ('32VOS','16VOS','8VOS','4TOS','SEMIFINAL','FINAL')
    ) r
  );
end;
$$;
create function public.schedule_available_rounds(tournament_ids uuid[]) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select schedule_private.available_rounds(tournament_ids);
$$;
revoke all on function schedule_private.available_rounds(uuid[]), public.schedule_available_rounds(uuid[]) from public, anon, authenticated;
grant execute on function schedule_private.available_rounds(uuid[]), public.schedule_available_rounds(uuid[]) to authenticated;

create function schedule_private.unlink_member(p_group uuid,p_member uuid,p_fecha uuid,p_updated_at timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare member public.schedule_share_members%rowtype;
begin
  select * into member from public.schedule_share_members m where m.id=p_member and m.group_id=p_group;
  if auth.uid() is null or member.id is null or not schedule_private.can_manage(member.tournament_id) then
    raise exception 'La copia no es administrable.' using errcode='42501';
  end if;
  perform 1 from public.schedule_share_groups where id=p_group for update;
  perform 1 from public.users where id=auth.uid() for share;
  perform 1 from public.clubes c where c.id=(select club_id from public.tournaments where id=member.tournament_id) for share;
  perform 1 from public.organization_members om where om.user_id=auth.uid() order by om.organizacion_id,om.id for share;
  perform 1 from public.tournaments where id=member.tournament_id for share;
  select * into member from public.schedule_share_members m where m.id=p_member and m.group_id=p_group for update;
  if member.id is null or not schedule_private.can_manage(member.tournament_id) then
    raise exception 'La copia no es administrable.' using errcode='42501';
  end if;
  if p_fecha is null or member.fecha_id is distinct from p_fecha or member.status='deleted' then
    raise exception 'La copia cambió. Volvé a cargar la configuración.' using errcode='40001';
  end if;
  if member.status='unlinked' then return member.tournament_id; end if;
  if member.updated_at is distinct from p_updated_at then
    raise exception 'La copia cambió. Volvé a cargar la configuración.' using errcode='40001';
  end if;
  update public.schedule_share_item_targets set status='unlinked' where member_id=p_member and status='active';
  update public.schedule_share_members set status='unlinked' where id=p_member;
  return member.tournament_id;
end;
$$;
create function public.unlink_schedule_member(p_group uuid,p_member uuid,p_fecha uuid,p_updated_at timestamptz) returns uuid
language sql security invoker set search_path = '' as $$
  select schedule_private.unlink_member(p_group,p_member,p_fecha,p_updated_at);
$$;
revoke all on function schedule_private.unlink_member(uuid,uuid,uuid,timestamptz), public.unlink_schedule_member(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function schedule_private.unlink_member(uuid,uuid,uuid,timestamptz), public.unlink_schedule_member(uuid,uuid,uuid,timestamptz) to authenticated;

commit;
