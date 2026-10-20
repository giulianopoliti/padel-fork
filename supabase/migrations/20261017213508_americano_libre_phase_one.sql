-- Local preparation only. The repository owner deploys through CI/CD.
-- Phase 1 provides persistence; quantity generation and sports writers follow.
create schema american_free_private;
revoke all on schema american_free_private from public, anon, authenticated;
grant usage on schema american_free_private to service_role;

alter table public.matches
  add column bracket_is_active boolean not null default true,
  add column free_slot1_origin text check (free_slot1_origin in ('ENTRY','WINNER','BYE')),
  add column free_slot2_origin text check (free_slot2_origin in ('ENTRY','WINNER','BYE')),
  add column free_bye_processed boolean not null default false;
create index matches_active_bracket_idx on public.matches(tournament_id, bracket_key, round)
  where type = 'ELIMINATION' and bracket_is_active;

create table public.american_free_brackets (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  bracket_key text not null default 'MAIN' check (bracket_key = 'MAIN'),
  contract_version integer not null default 1 check (contract_version = 1),
  revision bigint not null default 0 check (revision >= 0),
  requested_count integer not null check (requested_count between 2 and 64),
  base_size integer not null check (base_size in (2,4,8,16,32,64)),
  original_slots jsonb not null check (jsonb_typeof(original_slots) = 'object'),
  effective_capacity integer not null check (effective_capacity between 2 and 64),
  assigned_count integer not null default 0 check (assigned_count between 0 and effective_capacity),
  created_at timestamptz not null default now(),
  check (requested_count <= base_size and requested_count > base_size / 2)
);
alter table public.american_free_brackets enable row level security;
revoke all on public.american_free_brackets from public, anon, authenticated;
grant select on public.american_free_brackets to anon, authenticated;
grant all on public.american_free_brackets to service_role;
create policy american_free_public_read on public.american_free_brackets
  for select to anon, authenticated using (true);

-- Invoker helpers, not public APIs. Only the trusted server can supply an actor.
create function american_free_private.is_free(p_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.tournaments t where t.id=p_id and t.type::text='AMERICAN'
    and t.format_config->>'version'='2'
    and t.format_config->>'presetId' in ('AMERICAN_MULTI_ZONE_FREE','AMERICAN_SINGLE_ZONE_FREE'))
$$;
create function american_free_private.lock_tournament(p_id uuid, p_actor uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare t public.tournaments%rowtype;
begin
  select * into t from public.tournaments where id=p_id for update;
  if not found then raise exception 'Torneo no encontrado' using errcode='22023'; end if;
  if not exists(select 1 from public.users u where u.id=p_actor and (
    u.role::text='ADMIN'
    or (u.role::text='CLUB' and exists(select 1 from public.clubes c where c.id=t.club_id and c.user_id=u.id))
    or (u.role::text='ORGANIZADOR' and exists(select 1 from public.organization_members m
      where m.organizacion_id=t.organization_id and m.user_id=u.id and m.is_active))
  )) then raise exception 'Sin permisos sobre el torneo' using errcode='42501'; end if;
  if not american_free_private.is_free(p_id) then
    raise exception 'El torneo no es Americano libre' using errcode='22023';
  end if;
  if t.status::text not in ('ZONE_PHASE','BRACKET_PHASE') then
    raise exception 'Fase incompatible con la edición de llave' using errcode='22023';
  end if;
end $$;

-- Guards also cover the old RPCs and service-role endpoints. Context is set
-- transaction-locally by the new RPCs, and reset before returning to the caller.
create function american_free_private.guard_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tid uuid; old_tid uuid; old_row jsonb; new_row jsonb; guarded boolean;
begin
  if TG_OP <> 'INSERT' then old_row:=to_jsonb(OLD); old_tid:=(old_row->>'tournament_id')::uuid; end if;
  if TG_OP <> 'DELETE' then new_row:=to_jsonb(NEW); end if;
  tid:=coalesce((new_row->>'tournament_id')::uuid,old_tid);
  if TG_TABLE_NAME in ('set_matches','match_results_history','fecha_matches') then
    select tournament_id into tid from public.matches where id=coalesce((new_row->>'match_id')::uuid,(old_row->>'match_id')::uuid);
    select tournament_id into old_tid from public.matches where id=(old_row->>'match_id')::uuid;
    if not exists(select 1 from public.matches where id in ((new_row->>'match_id')::uuid,(old_row->>'match_id')::uuid)
      and type='ELIMINATION') then return coalesce(NEW,OLD); end if;
  end if;
  -- Definer is needed here solely to see modality/state despite caller RLS.
  guarded:=american_free_private.is_free(tid) or american_free_private.is_free(old_tid)
    or exists(select 1 from public.american_free_brackets where tournament_id in (tid,old_tid));
  if TG_TABLE_NAME='matches' then
    guarded:=guarded or coalesce(new_row->>'free_slot1_origin',old_row->>'free_slot1_origin') is not null
      or coalesce(new_row->>'free_slot2_origin',old_row->>'free_slot2_origin') is not null
      or coalesce((new_row->>'bracket_is_active')::boolean,true)=false
      or coalesce((new_row->>'free_bye_processed')::boolean,false);
    if coalesce(new_row->>'type',old_row->>'type') <> 'ELIMINATION'
      and coalesce(old_row->>'type','') <> 'ELIMINATION' then
      if new_row->>'free_slot1_origin' is not null or new_row->>'free_slot2_origin' is not null
        or (new_row->>'bracket_is_active')::boolean=false or (new_row->>'free_bye_processed')::boolean then
        raise exception 'Metadatos LIBRE sólo en eliminación' using errcode='22023';
      end if;
      return coalesce(NEW,OLD);
    end if;
  end if;
  if not guarded then return coalesce(NEW,OLD); end if;
  if coalesce(current_setting('american_free.tournament_id',true),'') <> tid::text
    or current_setting('role',true) not in ('service_role','postgres','supabase_admin') then
    raise exception 'Americano libre requiere persistencia transaccional' using errcode='42501';
  end if;
  if old_tid is not null and old_tid is distinct from tid then
    raise exception 'No se puede trasladar una llave a otro torneo' using errcode='22023';
  end if;
  if TG_TABLE_NAME='match_hierarchy' and exists(select 1 from public.american_free_brackets where tournament_id=tid) then
    raise exception 'Las conexiones originales son inmutables' using errcode='22023';
  end if;
  if TG_TABLE_NAME='american_free_brackets' and TG_OP='UPDATE' and (
    new_row->'original_slots' is distinct from old_row->'original_slots' or new_row->'requested_count' is distinct from old_row->'requested_count'
    or new_row->'base_size' is distinct from old_row->'base_size' or new_row->'bracket_key' is distinct from old_row->'bracket_key'
    or new_row->'contract_version' is distinct from old_row->'contract_version'
  ) then raise exception 'La distribución original es inmutable' using errcode='22023'; end if;
  return coalesce(NEW,OLD);
end $$;
create trigger american_free_matches_guard before insert or update or delete on public.matches
  for each row execute function american_free_private.guard_write();
create trigger american_free_seeds_guard before insert or update or delete on public.tournament_couple_seeds
  for each row execute function american_free_private.guard_write();
create trigger american_free_hierarchy_guard before insert or update or delete on public.match_hierarchy
  for each row execute function american_free_private.guard_write();
create trigger american_free_state_guard before insert or update or delete on public.american_free_brackets
  for each row execute function american_free_private.guard_write();
create trigger american_free_sets_guard before insert or update or delete on public.set_matches
  for each row execute function american_free_private.guard_write();
create trigger american_free_history_guard before insert or update or delete on public.match_results_history
  for each row execute function american_free_private.guard_write();
create trigger american_free_schedule_guard before insert or update or delete on public.fecha_matches
  for each row execute function american_free_private.guard_write();

-- An existing bracket cannot escape the guards by changing its preset/type.
create function american_free_private.guard_format() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if NEW.format_config->>'presetId' in ('AMERICAN_MULTI_ZONE_FREE','AMERICAN_SINGLE_ZONE_FREE')
    and (NEW.type::text is distinct from 'AMERICAN' or NEW.format_config->>'version' is distinct from '2') then
    raise exception 'Configuración LIBRE inválida' using errcode='22023';
  end if;
  if TG_OP='UPDATE' and (OLD.format_config->>'presetId' in ('AMERICAN_MULTI_ZONE_FREE','AMERICAN_SINGLE_ZONE_FREE')
    or NEW.format_config->>'presetId' in ('AMERICAN_MULTI_ZONE_FREE','AMERICAN_SINGLE_ZONE_FREE'))
    and (OLD.type is distinct from NEW.type or OLD.format_config->>'presetId' is distinct from NEW.format_config->>'presetId') then
    raise exception 'No se admite convertir un torneo existente a otra modalidad LIBRE' using errcode='22023';
  end if;
  return NEW;
end $$;
create trigger american_free_format_guard before insert or update of type, format_config on public.tournaments
  for each row execute function american_free_private.guard_format();

-- Membership changes serialize with saves without taking membership row locks
-- in the save RPC. Removing an assigned entry is rejected, never silently lost.
create function american_free_private.guard_eligibility() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tid uuid; old_tid uuid; cid uuid; old_cid uuid; row_data jsonb;
begin
  row_data:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  if TG_TABLE_NAME='zone_positions' then
    select tournament_id into tid from public.zones where id=(row_data->>'zone_id')::uuid;
    if TG_OP<>'INSERT' then
      select tournament_id into old_tid from public.zones where id=OLD.zone_id;
      old_cid:=OLD.couple_id;
    end if;
  else tid:=(row_data->>'tournament_id')::uuid; end if;
  cid:=(row_data->>'couple_id')::uuid;
  if TG_TABLE_NAME='inscriptions' and TG_OP<>'INSERT' then
    old_tid:=OLD.tournament_id; old_cid:=OLD.couple_id;
  end if;
  perform 1 from public.tournaments where id in (tid,old_tid) and
    (format_config->>'presetId' in ('AMERICAN_MULTI_ZONE_FREE','AMERICAN_SINGLE_ZONE_FREE')) order by id for update;
  if TG_TABLE_NAME='zone_positions' and old_cid is not null
    and (TG_OP='DELETE' or old_tid is distinct from tid or old_cid is distinct from cid) then
    if exists(select 1 from public.matches m where m.tournament_id=old_tid and m.bracket_is_active and (
      (m.free_slot1_origin='ENTRY' and m.couple1_id=old_cid) or (m.free_slot2_origin='ENTRY' and m.couple2_id=old_cid))) then
      raise exception 'Quitá la entrada de la llave antes de retirar la pareja de la zona' using errcode='22023';
    end if;
  elsif TG_TABLE_NAME='inscriptions' and old_cid is not null
    and (TG_OP='DELETE' or old_tid is distinct from tid or old_cid is distinct from cid or coalesce((row_data->>'is_pending')::boolean,false)) then
    if exists(select 1 from public.matches m where m.tournament_id=old_tid and m.bracket_is_active and (
      (m.free_slot1_origin='ENTRY' and m.couple1_id=old_cid) or (m.free_slot2_origin='ENTRY' and m.couple2_id=old_cid))) then
      raise exception 'Quitá la entrada de la llave antes de cambiar su inscripción' using errcode='22023';
    end if;
  elsif TG_TABLE_NAME='tournament_couple_disqualifications' and american_free_private.is_free(tid)
    and row_data->>'status'='ACTIVE' and exists(select 1 from public.american_free_brackets where tournament_id=tid) then
    if coalesce(current_setting('american_free.tournament_id',true),'')<>tid::text then
      raise exception 'La descalificación LIBRE requiere integración deportiva transaccional' using errcode='42501';
    end if;
  end if;
  return coalesce(NEW,OLD);
end $$;
create trigger american_free_membership_guard before insert or update or delete on public.zone_positions
  for each row execute function american_free_private.guard_eligibility();
create trigger american_free_disqualification_guard before insert or update or delete on public.tournament_couple_disqualifications
  for each row execute function american_free_private.guard_eligibility();
create trigger american_free_inscription_guard before insert or update or delete on public.inscriptions
  for each row execute function american_free_private.guard_eligibility();

create function american_free_private.guard_zone_transfer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if OLD.tournament_id is distinct from NEW.tournament_id then
    perform 1 from public.tournaments where id in (OLD.tournament_id,NEW.tournament_id)
      and format_config->>'presetId' in ('AMERICAN_MULTI_ZONE_FREE','AMERICAN_SINGLE_ZONE_FREE') order by id for update;
    if exists(select 1 from public.zone_positions zp join public.matches m on m.tournament_id=OLD.tournament_id
      where zp.zone_id=OLD.id and m.bracket_is_active and (
        (m.free_slot1_origin='ENTRY' and m.couple1_id=zp.couple_id) or (m.free_slot2_origin='ENTRY' and m.couple2_id=zp.couple_id))) then
      raise exception 'No se puede trasladar una zona con entradas asignadas' using errcode='22023';
    end if;
  end if;
  return NEW;
end $$;
create trigger american_free_zone_transfer_guard before update of tournament_id on public.zones
  for each row execute function american_free_private.guard_zone_transfer();

create function american_free_private.project(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare b public.american_free_brackets%rowtype; capacity integer; assigned integer;
begin
  select * into strict b from public.american_free_brackets where tournament_id=p_id;
  if (select count(*) from public.matches where tournament_id=p_id and type::text='ELIMINATION')<>b.base_size-1
    or (select count(*) from public.matches where tournament_id=p_id and type::text='ELIMINATION' and round::text='FINAL')<>1
    or (select count(*) from public.match_hierarchy where tournament_id=p_id)<>b.base_size-2 then
    raise exception 'Estructura de llave incompleta' using errcode='22023';
  end if;
  if exists(select 1 from public.match_hierarchy h
    left join public.matches p on p.id=h.parent_match_id left join public.matches c on c.id=h.child_match_id
    where h.tournament_id=p_id and (p.tournament_id is distinct from p_id or c.tournament_id is distinct from p_id
      or p.bracket_key<>'MAIN' or c.bracket_key<>'MAIN' or h.bracket_key<>'MAIN'
      or p.type::text<>'ELIMINATION' or c.type::text<>'ELIMINATION' or h.parent_slot not in (1,2)
      or array_position(array['32VOS','16VOS','8VOS','4TOS','SEMIFINAL','FINAL'],p.round::text)
        is distinct from 1+array_position(array['32VOS','16VOS','8VOS','4TOS','SEMIFINAL','FINAL'],c.round::text)
      or p.order_in_round is distinct from (c.order_in_round+1)/2
      or h.parent_slot is distinct from case when c.order_in_round%2=1 then 1 else 2 end))
    or exists(select 1 from public.match_hierarchy where tournament_id=p_id group by child_match_id having count(*)>1)
    or exists(select 1 from public.match_hierarchy where tournament_id=p_id group by parent_match_id,parent_slot having count(*)>1) then
    raise exception 'Conexiones inválidas' using errcode='22023';
  end if;
  if exists(select 1 from public.matches where tournament_id=p_id and type::text='ELIMINATION'
    group by round,order_in_round having count(*)>1) or exists(select 1 from public.matches m
    where m.tournament_id=p_id and m.type::text='ELIMINATION' and (m.bracket_key<>'MAIN' or m.order_in_round is null or m.order_in_round<1
      or array_position(array['32VOS','16VOS','8VOS','4TOS','SEMIFINAL','FINAL'],m.round::text) is null)) then
    raise exception 'Orden o ronda inválida' using errcode='22023';
  end if;
  if exists(select 1 from public.matches m where m.tournament_id=p_id and m.type::text='ELIMINATION'
      and m.free_slot1_origin='BYE' and m.free_slot2_origin='BYE')
    or exists(select 1 from public.matches m where m.tournament_id=p_id and m.type::text='ELIMINATION'
      group by m.round having count(*)<>power(2,6-array_position(array['32VOS','16VOS','8VOS','4TOS','SEMIFINAL','FINAL'],m.round::text))) then
    raise exception 'Distribución de rondas o pases inválida' using errcode='22023';
  end if;
  -- Original origins must describe the full original binary tree, not a layout
  -- invented by a later client. Cycles/disconnected subtrees fail reachability.
  if exists(select 1 from public.matches m cross join (values(1),(2)) s(slot)
    where m.tournament_id=p_id and m.type::text='ELIMINATION' and (
      not b.original_slots ? m.id::text
      or (b.original_slots->m.id::text->>(s.slot-1)) not in ('ENTRY','WINNER','BYE')
      or ((b.original_slots->m.id::text->>(s.slot-1))='WINNER') is distinct from
        exists(select 1 from public.match_hierarchy h where h.tournament_id=p_id and h.parent_match_id=m.id and h.parent_slot=s.slot)
      or case when s.slot=1 then m.free_slot1_origin else m.free_slot2_origin end is null
      or ((b.original_slots->m.id::text->>(s.slot-1))<>'WINNER'
        and (b.original_slots->m.id::text->>(s.slot-1)) is distinct from case when s.slot=1 then m.free_slot1_origin else m.free_slot2_origin end)
      or ((b.original_slots->m.id::text->>(s.slot-1))='WINNER'
        and case when s.slot=1 then m.free_slot1_origin else m.free_slot2_origin end not in ('ENTRY','WINNER'))
      or ((b.original_slots->m.id::text->>(s.slot-1))='WINNER'
        and case when s.slot=1 then m.free_slot1_origin else m.free_slot2_origin end='ENTRY'
        and case when s.slot=1 then m.couple1_id else m.couple2_id end is null)
    )) then raise exception 'Orígenes incompatibles con la distribución original' using errcode='22023'; end if;
  if (with recursive tree as (
    select id,array[id] path from public.matches where tournament_id=p_id and type::text='ELIMINATION' and round::text='FINAL'
    union all select h.child_match_id,t.path||h.child_match_id from tree t join public.match_hierarchy h
      on h.parent_match_id=t.id and h.tournament_id=p_id where not h.child_match_id=any(t.path)
  ) select count(distinct id) from tree)<>b.base_size-1 then
    raise exception 'Árbol desconectado o cíclico' using errcode='22023';
  end if;
  with recursive active as (
    select id from public.matches where tournament_id=p_id and type::text='ELIMINATION' and round::text='FINAL'
    union select h.child_match_id from active a join public.matches m on m.id=a.id
      join public.match_hierarchy h on h.parent_match_id=a.id and h.tournament_id=p_id
      where case when h.parent_slot=1 then m.free_slot1_origin else m.free_slot2_origin end='WINNER'
  ) update public.matches m set bracket_is_active=exists(select 1 from active a where a.id=m.id)
    where m.tournament_id=p_id and m.type::text='ELIMINATION';
  if exists(select 1 from public.matches m where m.tournament_id=p_id and m.type::text='ELIMINATION' and not m.bracket_is_active and (
    m.couple1_id is not null or m.couple2_id is not null or m.winner_id is not null or m.free_bye_processed
    or m.status::text in ('IN_PROGRESS','FINISHED') or m.result_couple1 is not null or m.result_couple2 is not null
    or nullif(m.court,'') is not null or exists(select 1 from public.set_matches s where s.match_id=m.id)
    or exists(select 1 from public.match_results_history r where r.match_id=m.id)
    or exists(select 1 from public.fecha_matches f where f.match_id=m.id)
  )) then raise exception 'Una rama con participantes, agenda o actividad no se puede inactivar' using errcode='22023'; end if;
  if exists(select 1 from public.matches m cross join lateral (values
    (1,m.free_slot1_origin,m.couple1_id,m.tournament_couple_seed1_id),
    (2,m.free_slot2_origin,m.couple2_id,m.tournament_couple_seed2_id)
  ) s(slot,origin,couple_id,seed_id) where m.tournament_id=p_id and m.type::text='ELIMINATION' and (
    (s.origin='BYE' and (s.couple_id is not null or s.seed_id is not null))
    or (s.couple_id is null) is distinct from (s.seed_id is null)
    or (s.couple_id is not null and not exists(select 1 from public.tournament_couple_seeds cs
      where cs.id=s.seed_id and cs.tournament_id=p_id and cs.bracket_key='MAIN' and cs.couple_id=s.couple_id
      and not coalesce(cs.is_placeholder,false) and cs.placeholder_zone_id is null and cs.placeholder_label is null))
    or (s.origin='WINNER' and m.bracket_is_active and s.couple_id is distinct from (
      select c.winner_id from public.match_hierarchy h join public.matches c on c.id=h.child_match_id
      where h.parent_match_id=m.id and h.parent_slot=s.slot and h.tournament_id=p_id and c.status::text='FINISHED'))
    or (s.origin='ENTRY' and s.couple_id is not null and (
      not exists(select 1 from public.zone_positions zp join public.zones z on z.id=zp.zone_id where z.tournament_id=p_id and zp.couple_id=s.couple_id)
      or not exists(select 1 from public.couples c where c.id=s.couple_id and c.player1_id is not null and c.player2_id is not null and c.player1_id<>c.player2_id)
      or not exists(select 1 from public.inscriptions i where i.tournament_id=p_id and i.couple_id=s.couple_id and not coalesce(i.is_pending,false))
      or exists(select 1 from public.tournament_couple_disqualifications d where d.tournament_id=p_id and d.couple_id=s.couple_id and d.status='ACTIVE')
    ))
  )) then raise exception 'Participante, seed u origen no habilitado' using errcode='22023'; end if;
  if exists(select 1 from public.matches m cross join lateral (values(m.free_slot1_origin,m.couple1_id),(m.free_slot2_origin,m.couple2_id)) s(origin,couple_id)
    where m.tournament_id=p_id and m.type::text='ELIMINATION' and m.bracket_is_active and s.origin='ENTRY' and s.couple_id is not null
    group by s.couple_id having count(*)>1) then
    raise exception 'La pareja tiene dos entradas independientes' using errcode='22023';
  end if;
  select count(*) filter(where s.origin='ENTRY'),count(*) filter(where s.origin='ENTRY' and s.couple_id is not null)
    into capacity,assigned from public.matches m cross join lateral (values(m.free_slot1_origin,m.couple1_id),(m.free_slot2_origin,m.couple2_id)) s(origin,couple_id)
    where m.tournament_id=p_id and m.type::text='ELIMINATION' and m.bracket_is_active;
  update public.american_free_brackets set effective_capacity=capacity,assigned_count=assigned where tournament_id=p_id;
end $$;

create function american_free_private.snapshot(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(b)||jsonb_build_object(
    'matches',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'round',m.round,'order_in_round',m.order_in_round,'bracket_is_active',m.bracket_is_active,
      'slot1_origin',m.free_slot1_origin,'slot2_origin',m.free_slot2_origin,
      'couple1_id',m.couple1_id,'couple2_id',m.couple2_id,
      'seed1_id',m.tournament_couple_seed1_id,'seed2_id',m.tournament_couple_seed2_id,
      'status',m.status,'winner_id',m.winner_id,'bye_processed',m.free_bye_processed) order by m.id),'[]'::jsonb)
      from public.matches m where m.tournament_id=p_id and m.type='ELIMINATION'),
    'hierarchy',(select coalesce(jsonb_agg(jsonb_build_object('parent_match_id',h.parent_match_id,
      'child_match_id',h.child_match_id,'parent_slot',h.parent_slot) order by h.id),'[]'::jsonb)
      from public.match_hierarchy h where h.tournament_id=p_id))
  from public.american_free_brackets b where b.tournament_id=p_id
$$;

create function public.create_american_free_bracket(p_tournament_id uuid,p_actor_id uuid,p_requested_count integer,p_matches jsonb,p_hierarchy jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare base integer:=2; originals jsonb;
begin
  perform american_free_private.lock_tournament(p_tournament_id,p_actor_id);
  if (select status::text from public.tournaments where id=p_tournament_id)<>'ZONE_PHASE' then
    raise exception 'La generación requiere fase de zonas' using errcode='22023'; end if;
  if p_requested_count is null or p_requested_count not between 2 and 64
    or jsonb_typeof(p_matches) is distinct from 'array' or jsonb_typeof(p_hierarchy) is distinct from 'array' then
    raise exception 'Estructura inválida' using errcode='22023'; end if;
  while base<p_requested_count loop base:=base*2; end loop;
  if exists(select 1 from public.american_free_brackets where tournament_id=p_tournament_id)
    or exists(select 1 from public.matches where tournament_id=p_tournament_id and type::text='ELIMINATION')
    or exists(select 1 from public.tournament_couple_seeds where tournament_id=p_tournament_id)
    or exists(select 1 from public.match_hierarchy where tournament_id=p_tournament_id)
    or exists(select 1 from public.placeholder_resolutions where tournament_id=p_tournament_id) then
    raise exception 'Ya existe una llave o artefactos previos' using errcode='40001'; end if;
  if not exists(select 1 from public.zones where tournament_id=p_tournament_id) then
    raise exception 'Primero creá las zonas del torneo' using errcode='22023'; end if;
  perform set_config('american_free.tournament_id',p_tournament_id::text,true);
  insert into public.matches(id,tournament_id,bracket_key,type,round,order_in_round,status,couple1_id,couple2_id,free_slot1_origin,free_slot2_origin)
    select x.id,p_tournament_id,'MAIN','ELIMINATION',x.round::public."ROUND",x.order_in_round,'WAITING_OPONENT',null,null,x.slot1_origin,x.slot2_origin
    from jsonb_to_recordset(p_matches) x(id uuid,round text,order_in_round integer,slot1_origin text,slot2_origin text);
  insert into public.match_hierarchy(tournament_id,bracket_key,parent_match_id,child_match_id,parent_slot,parent_round,child_round)
    select p_tournament_id,'MAIN',p.id,c.id,x.parent_slot,p.round::text,c.round::text
    from jsonb_to_recordset(p_hierarchy) x(parent_match_id uuid,child_match_id uuid,parent_slot integer)
    join public.matches p on p.id=x.parent_match_id and p.tournament_id=p_tournament_id
    join public.matches c on c.id=x.child_match_id and c.tournament_id=p_tournament_id;
  select jsonb_object_agg(id::text,jsonb_build_array(free_slot1_origin,free_slot2_origin)) into originals
    from public.matches where tournament_id=p_tournament_id and type::text='ELIMINATION';
  insert into public.american_free_brackets(tournament_id,requested_count,base_size,original_slots,effective_capacity)
    values(p_tournament_id,p_requested_count,base,originals,p_requested_count);
  perform american_free_private.project(p_tournament_id);
  if (select effective_capacity from public.american_free_brackets where tournament_id=p_tournament_id)<>p_requested_count then
    raise exception 'La distribución no coincide con la cantidad solicitada' using errcode='22023'; end if;
  update public.tournaments set status='BRACKET_PHASE',bracket_status='BRACKET_GENERATED',bracket_generated_at=now() where id=p_tournament_id;
  perform set_config('american_free.tournament_id','',true);
  return american_free_private.snapshot(p_tournament_id);
end $$;

create function public.save_american_free_bracket(p_tournament_id uuid,p_actor_id uuid,p_expected_revision bigint,p_layout jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare b public.american_free_brackets%rowtype; moved record; seed_row record; next_seed integer;
begin
  perform american_free_private.lock_tournament(p_tournament_id,p_actor_id);
  select * into b from public.american_free_brackets where tournament_id=p_tournament_id for update;
  if not found or p_expected_revision is distinct from b.revision then
    raise exception 'La llave cambió. Recargá antes de guardar.' using errcode='40001'; end if;
  if jsonb_typeof(p_layout) is distinct from 'array' or jsonb_array_length(p_layout)<>b.base_size-1 then
    raise exception 'El guardado requiere la distribución completa' using errcode='22023'; end if;
  perform 1 from public.matches where tournament_id=p_tournament_id and type::text='ELIMINATION' order by id for update;
  perform 1 from public.match_hierarchy where tournament_id=p_tournament_id order by id for update;
  perform 1 from public.tournament_couple_seeds where tournament_id=p_tournament_id order by id for update;
  drop table if exists pg_temp.american_free_layout;
  create temporary table american_free_layout(
    id uuid primary key,slot1_origin text not null,slot2_origin text not null,couple1_id uuid,couple2_id uuid
  ) on commit drop;
  insert into pg_temp.american_free_layout select * from jsonb_to_recordset(p_layout)
    x(id uuid,slot1_origin text,slot2_origin text,couple1_id uuid,couple2_id uuid);
  if exists(select 1 from pg_temp.american_free_layout x left join public.matches m on m.id=x.id
    where m.tournament_id is distinct from p_tournament_id or m.type::text<>'ELIMINATION') then
    raise exception 'Partido ajeno a la llave' using errcode='22023'; end if;
  if exists(select 1 from pg_temp.american_free_layout x join public.matches m on m.id=x.id
    where (x.slot1_origin,x.slot2_origin,x.couple1_id,x.couple2_id) is distinct from
      (m.free_slot1_origin,m.free_slot2_origin,m.couple1_id,m.couple2_id) and (
      m.status::text in ('IN_PROGRESS','FINISHED') or m.winner_id is not null or m.free_bye_processed
      or m.result_couple1 is not null or m.result_couple2 is not null
      or exists(select 1 from public.set_matches s where s.match_id=m.id)
      or exists(select 1 from public.match_results_history r where r.match_id=m.id)
    )) then raise exception 'No se pueden reorganizar partidos con actividad deportiva' using errcode='22023'; end if;
  if exists(select 1 from pg_temp.american_free_layout x join public.matches m on m.id=x.id cross join lateral (values
    (m.free_slot1_origin,m.couple1_id,x.slot1_origin,x.couple1_id),
    (m.free_slot2_origin,m.couple2_id,x.slot2_origin,x.couple2_id)) s(old_origin,old_couple,origin,couple)
    where (s.old_origin='WINNER' and s.old_couple is not null and (s.origin<>'WINNER' or s.couple is distinct from s.old_couple))
      or (s.origin='WINNER' and s.couple is distinct from case when s.old_origin='WINNER' then s.old_couple else null end)) then
    raise exception 'Un avance deportivo no es una asignación manual' using errcode='22023'; end if;
  -- A move between rounds must follow the exact ancestor slot, in either
  -- direction. Same-round reorganization keeps the existing editor semantics.
  for moved in
    select oldm.id old_id,os.slot old_slot,newm.id new_id,ns.slot new_slot from public.matches oldm
    cross join lateral (values(1,oldm.free_slot1_origin,oldm.couple1_id),(2,oldm.free_slot2_origin,oldm.couple2_id)) os(slot,origin,couple)
    join pg_temp.american_free_layout x on true join public.matches newm on newm.id=x.id
    cross join lateral (values(1,x.slot1_origin,x.couple1_id),(2,x.slot2_origin,x.couple2_id)) ns(slot,origin,couple)
    where oldm.tournament_id=p_tournament_id and oldm.type::text='ELIMINATION' and os.origin='ENTRY' and os.couple is not null
      and ns.origin='ENTRY' and ns.couple=os.couple and oldm.round<>newm.round
  loop
    if not (with recursive descendants as (
      select h.child_match_id id,1 direction from public.match_hierarchy h where h.parent_match_id=moved.old_id and h.parent_slot=moved.old_slot
      union all select h.child_match_id,2 from public.match_hierarchy h where h.parent_match_id=moved.new_id and h.parent_slot=moved.new_slot
      union all select h.child_match_id,d.direction from descendants d join public.match_hierarchy h on h.parent_match_id=d.id
    ) select exists(select 1 from descendants where (direction=1 and id=moved.new_id) or (direction=2 and id=moved.old_id))) then
      raise exception 'El destino está fuera de la rama compatible' using errcode='22023';
    end if;
  end loop;
  perform set_config('american_free.tournament_id',p_tournament_id::text,true);
  -- One technical seed per couple, independent of rankings or entry location.
  -- Unassigned entries have no seed; retained unused seeds carry no assignment.
  select coalesce(max(seed),0) into next_seed from public.tournament_couple_seeds where tournament_id=p_tournament_id;
  for seed_row in select distinct s.cid from pg_temp.american_free_layout x cross join lateral
    (values(x.couple1_id),(x.couple2_id)) s(cid) where s.cid is not null order by s.cid
  loop
    if not exists(select 1 from public.tournament_couple_seeds where tournament_id=p_tournament_id and bracket_key='MAIN' and couple_id=seed_row.cid) then
      next_seed:=next_seed+1;
      insert into public.tournament_couple_seeds(tournament_id,bracket_key,seed,couple_id,is_placeholder,created_as_placeholder)
        values(p_tournament_id,'MAIN',next_seed,seed_row.cid,false,false);
    end if;
  end loop;
  update public.matches m set free_slot1_origin=x.slot1_origin,free_slot2_origin=x.slot2_origin,
    couple1_id=x.couple1_id,couple2_id=x.couple2_id,
    tournament_couple_seed1_id=(select id from public.tournament_couple_seeds where tournament_id=p_tournament_id and bracket_key='MAIN' and couple_id=x.couple1_id),
    tournament_couple_seed2_id=(select id from public.tournament_couple_seeds where tournament_id=p_tournament_id and bracket_key='MAIN' and couple_id=x.couple2_id)
    from pg_temp.american_free_layout x where m.id=x.id;
  perform american_free_private.project(p_tournament_id);
  update public.american_free_brackets set revision=revision+1 where tournament_id=p_tournament_id;
  perform set_config('american_free.tournament_id','',true);
  return american_free_private.snapshot(p_tournament_id);
end $$;

-- Trigger implementations live in a non-exposed schema; no client can call
-- helpers or spoof the trusted actor. Invoker RPCs run as service_role only.
revoke all on all functions in schema american_free_private from public,anon,authenticated;
grant execute on function american_free_private.is_free(uuid),american_free_private.lock_tournament(uuid,uuid),american_free_private.project(uuid) to service_role;
grant execute on function american_free_private.snapshot(uuid) to service_role;
revoke all on function public.create_american_free_bracket(uuid,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.save_american_free_bracket(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.create_american_free_bracket(uuid,uuid,integer,jsonb,jsonb),public.save_american_free_bracket(uuid,uuid,bigint,jsonb) to service_role;
