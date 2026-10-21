-- Allow initial ENTRY/BYE slots to be reassigned without changing the original tree.
-- Sports locks, winner propagation, authorization and revision checks remain in force.
-- Only BYE history can be edited after undoing the processed pass.

create or replace function american_free_private.project(p_id uuid) returns void
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
        and case when s.slot=1 then m.free_slot1_origin else m.free_slot2_origin end not in ('ENTRY','BYE'))
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
      or exists(select 1 from public.tournament_couple_disqualifications d where d.tournament_id=p_id and d.couple_id=s.couple_id and d.status='ACTIVE' and not exists(select 1 from public.matches dm where dm.id=d.match_id and dm.tournament_id=p_id and dm.status::text='FINISHED' and dm.winner_id is not null and dm.winner_id<>d.couple_id))
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

create or replace function public.save_american_free_bracket(p_tournament_id uuid,p_actor_id uuid,p_expected_revision bigint,p_layout jsonb)
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
      or exists(select 1 from public.match_results_history r where r.match_id=m.id
        and coalesce(r.operation_metadata->>'free_operation','') not in ('PROCESS_BYE','UNDO_BYE'))
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
