alter table long_substitution_private.long_substitutions
  add column fecha_id uuid references public.tournament_fechas(id) on delete set null,
  drop constraint long_substitutions_scope_check,
  add constraint long_substitutions_scope_check check (scope in ('ONLY_MATCH','FROM_MATCH','ONLY_FECHA','FROM_FECHA'));

create unique index long_substitutions_one_per_fecha on long_substitution_private.long_substitutions
  (tournament_id, couple_id, scope, fecha_id) where fecha_id is not null;
create index long_substitutions_fecha_idx on long_substitution_private.long_substitutions(fecha_id);

create function long_substitution_private.fecha_position(f public.tournament_fechas)
returns long_substitution_private.match_position language sql immutable set search_path = '' as $$
  select row(
    case when f.round_type = 'ZONE' then 0 else 10 + coalesce(array_position(
      array['32VOS','16VOS','8VOS','4TOS','SEMIFINAL','FINAL'], f.round_type::text), 0) end,
    f.fecha_number, f.created_at, f.id,
    '-2147483648'::integer, '-infinity'::timestamptz, '00000000-0000-0000-0000-000000000000'::uuid
  )::long_substitution_private.match_position
$$;

create function long_substitution_private.couple_in_fecha(f public.tournament_fechas, p_couple_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select f.round_type = 'ZONE' or exists (
    select 1 from public.matches m where m.tournament_id = f.tournament_id and m.type = 'ELIMINATION'
      and m.round = f.round_type and coalesce(m.bracket_key,'MAIN') = f.bracket_key
      and m.bracket_is_active is not false and m.status not in ('CANCELED','BYE')
      and p_couple_id in (m.couple1_id, m.couple2_id)
  ) or (f.bracket_key in ('GOLD','SILVER') and exists (
    select 1 from public.tournament_couple_seeds s where s.tournament_id = f.tournament_id
      and s.couple_id = p_couple_id and s.bracket_key = f.bracket_key
  ))
$$;

-- An unlinked knockout match can inherit a round's fecha when that round and cup identify it uniquely.
create function long_substitution_private.match_fecha(m public.matches)
returns uuid language sql stable set search_path = '' as $$
  select coalesce((select fm.fecha_id from public.fecha_matches fm where fm.match_id = m.id),
    (select (array_agg(f.id))[1] from public.tournament_fechas f where m.type = 'ELIMINATION'
      and f.tournament_id = m.tournament_id and f.round_type = m.round
      and f.bracket_key = coalesce(m.bracket_key,'MAIN') and f.status <> 'CANCELED' having count(*) = 1))
$$;

create function long_substitution_private.fecha_rule(f public.tournament_fechas, p_couple_id uuid)
returns long_substitution_private.long_substitutions language sql stable set search_path = '' as $$
  select s.* from long_substitution_private.long_substitutions s
  where s.tournament_id = f.tournament_id and s.couple_id = p_couple_id and f.status <> 'CANCELED'
    and ((s.scope = 'ONLY_FECHA' and s.fecha_id = f.id)
      or (s.scope = 'FROM_FECHA' and (s.fecha_id = f.id
        or (s.cut_position).phase < (long_substitution_private.fecha_position(f)).phase
        or s.cut_position <= long_substitution_private.fecha_position(f)
          and ((s.cut_position).phase = 0 or f.bracket_key = (
            select start_fecha.bracket_key from public.tournament_fechas start_fecha where start_fecha.id = s.fecha_id))))
      or (s.scope = 'FROM_MATCH' and (s.cut_position is null
        or (s.cut_position).phase < (long_substitution_private.fecha_position(f)).phase
        or (s.cut_position).phase = 0 and s.cut_position < long_substitution_private.fecha_position(f)
        or (s.cut_position).phase = (long_substitution_private.fecha_position(f)).phase and s.match_id is not null
          and exists (select 1 from public.matches m join public.fecha_matches fm on fm.match_id = m.id
            join public.tournament_fechas anchor on anchor.id = fm.fecha_id
            where m.id = s.match_id and anchor.bracket_key = f.bracket_key
              and long_substitution_private.fecha_position(anchor) < long_substitution_private.fecha_position(f)))))
  order by (s.scope = 'ONLY_FECHA') desc, s.cut_position desc nulls last, s.updated_at desc, s.id
  limit 1
$$;

create or replace function long_substitution_private.lineups(m public.matches, use_pending_rules boolean default false, permanent_only boolean default false)
returns table (match_id uuid, couple_id uuid, player1_id uuid, player2_id uuid, substitute_slot integer)
language sql stable set search_path = '' as $$
  with fixture as (
    select anchor.fecha_id, long_substitution_private.position(m) match_position,
      long_substitution_private.fecha_position(f) fecha_position
    from (select long_substitution_private.match_fecha(m) fecha_id) anchor
    left join public.tournament_fechas f on f.id = anchor.fecha_id
  )
  select m.id, c.id,
    coalesce(saved.player1_id, case when rule.slot = 1 then rule.substitute_player_id else c.player1_id end),
    coalesce(saved.player2_id, case when rule.slot = 2 then rule.substitute_player_id else c.player2_id end),
    coalesce(saved.substitute_slot, rule.slot)
  from public.couples c cross join fixture f
  left join long_substitution_private.match_lineups saved on not permanent_only and saved.match_id = m.id and saved.couple_id = c.id
  left join lateral (
    select s.slot, s.substitute_player_id
    from long_substitution_private.long_substitutions s
    where s.tournament_id = m.tournament_id and s.couple_id = c.id and saved.match_id is null
      and (use_pending_rules or not long_substitution_private.started(m))
      and ((not permanent_only and s.scope = 'ONLY_MATCH' and s.match_id = m.id)
        or (s.scope = 'ONLY_FECHA' and s.fecha_id = f.fecha_id)
        or (s.scope = 'FROM_FECHA' and (s.fecha_id = f.fecha_id
          or (s.cut_position).phase < (f.match_position).phase
          or f.fecha_id is not null and s.cut_position <= f.fecha_position
            and ((s.cut_position).phase = 0 or coalesce(m.bracket_key,'MAIN') = (
              select start_fecha.bracket_key from public.tournament_fechas start_fecha where start_fecha.id = s.fecha_id))))
        or (s.scope = 'FROM_MATCH' and (s.match_id = m.id or s.cut_position is null or s.cut_position <= f.match_position)))
    order by case s.scope when 'ONLY_MATCH' then 2 when 'ONLY_FECHA' then 1 else 0 end desc,
      (s.cut_position).phase desc nulls last,
      ((s.cut_position).phase > 0 and s.scope = 'FROM_MATCH') desc nulls last,
      s.cut_position desc nulls last, s.updated_at desc, s.id
    limit 1
  ) rule on true
  where c.id in (m.couple1_id, m.couple2_id)
$$;

create function long_substitution_private.reset_changed_fecha_votes(p_tournament_id uuid, p_couple_id uuid, previous jsonb)
returns void language sql volatile set search_path = '' as $$
  delete from public.couple_time_availability a using public.tournament_time_slots ts,
    public.tournament_fechas f cross join lateral long_substitution_private.fecha_rule(f,p_couple_id) r
  where a.couple_id = p_couple_id and a.time_slot_id = ts.id and ts.fecha_id = f.id
    and f.tournament_id = p_tournament_id and f.status not in ('CANCELED','COMPLETED')
    and long_substitution_private.couple_in_fecha(f,p_couple_id)
    and previous->>f.id::text is distinct from coalesce(r.substitute_player_id::text || ':' || r.slot::text, 'titulares');
$$;

-- The same fecha lineup determines the voting rights of the substitute and remaining starter.
create function long_substitution_private.fecha_voters(f public.tournament_fechas, c public.couples)
returns table (player1_id uuid, player2_id uuid, substitute_player_id uuid)
language sql stable set search_path = '' as $$
  select case when s.slot = 1 then s.substitute_player_id else c.player1_id end,
    case when s.slot = 2 then s.substitute_player_id else c.player2_id end, s.substitute_player_id
  from long_substitution_private.fecha_rule(f, c.id) s
$$;

create function long_substitution_private.my_fecha_assignments(p_tournament_id uuid)
returns table (fecha_id uuid, couple_id uuid, player1_name text, player2_name text, is_substitute boolean)
language sql stable security definer set search_path = '' as $$
  select f.id, c.id, concat_ws(' ', p1.first_name,p1.last_name), concat_ws(' ',p2.first_name,p2.last_name),
    me.id = v.substitute_player_id
  from public.tournaments t
  join public.tournament_fechas f on f.tournament_id = t.id
  join (select distinct i.tournament_id,i.couple_id from public.inscriptions i
    where i.occupies_slot and i.is_eliminated is not true and i.es_prueba is not true) i on i.tournament_id = t.id
  join public.couples c on c.id = i.couple_id
  cross join lateral long_substitution_private.fecha_voters(f,c) v
  join public.players me on me.user_id = (select auth.uid()) and me.id in (c.player1_id,c.player2_id,v.substitute_player_id)
  join public.players p1 on p1.id = v.player1_id
  join public.players p2 on p2.id = v.player2_id
  where t.id = p_tournament_id and t.type = 'LONG' and t.is_draft is not true
    and t.status not in ('CANCELED','FINISHED','FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED')
    and f.status not in ('CANCELED','COMPLETED') and v.substitute_player_id is not null
    and long_substitution_private.couple_in_fecha(f,c.id)
$$;

create function long_substitution_private.can_vote_fecha(p_fecha_id uuid, p_couple_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tournament_fechas f
    join public.tournaments t on t.id = f.tournament_id
    join public.couples c on c.id = p_couple_id
    cross join lateral long_substitution_private.fecha_voters(f,c) v
    join public.players me on me.user_id = (select auth.uid()) and me.id in (v.player1_id,v.player2_id)
    where f.id = p_fecha_id and f.status not in ('CANCELED','COMPLETED')
      and t.type = 'LONG' and t.is_draft is not true
      and t.status not in ('CANCELED','FINISHED','FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED')
      and long_substitution_private.couple_in_fecha(f,c.id)
      and exists (select 1 from public.inscriptions i where i.tournament_id = t.id and i.couple_id = c.id
        and i.occupies_slot and i.is_eliminated is not true and i.es_prueba is not true)
  )
$$;

create function long_substitution_private.availability_write_allowed(p_slot_id uuid, p_couple_id uuid, p_require_substitution boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select case
    when t.type <> 'LONG' then not p_require_substitution
    when f.status in ('CANCELED','COMPLETED') then not p_require_substitution and schedule_private.can_manage(t.id)
    when (long_substitution_private.fecha_rule(f,p_couple_id)).id is null then not p_require_substitution
    when not p_require_substitution and schedule_private.can_manage(t.id) then true
    else s.is_available and long_substitution_private.can_vote_fecha(f.id,p_couple_id)
      and (not p_require_substitution or (s.slot_type = 'TIME_RANGE' and s.is_system is not true))
    end
  from public.tournament_time_slots s join public.tournament_fechas f on f.id = s.fecha_id
  join public.tournaments t on t.id = f.tournament_id where s.id = p_slot_id),false)
$$;

create function long_substitution_private.lock_fecha_vote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tournament_id uuid;
begin
  select t.id into tournament_id from public.tournament_time_slots s
  join public.tournament_fechas f on f.id = s.fecha_id join public.tournaments t on t.id = f.tournament_id
  where s.id = new.time_slot_id and t.type = 'LONG' for share of t;
  if tournament_id is not null and auth.uid() is not null and (select auth.role()) = 'authenticated'
    and not long_substitution_private.availability_write_allowed(new.time_slot_id, new.couple_id, false) then
    raise exception 'La alineación de esta fecha cambió. Volvé a cargar los horarios.' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function long_substitution_private.lock_fecha_vote() from public, anon, authenticated;
create trigger long_fecha_vote_lock before insert on public.couple_time_availability
  for each row execute function long_substitution_private.lock_fecha_vote();

create function public.get_my_long_fecha_substitutions(p_tournament_id uuid)
returns table (fecha_id uuid, couple_id uuid, player1_name text, player2_name text, is_substitute boolean, can_vote boolean)
language sql stable security invoker set search_path = '' as $$
  select a.*, long_substitution_private.can_vote_fecha(f.id, a.couple_id)
  from long_substitution_private.my_fecha_assignments(p_tournament_id) a
  join public.tournament_fechas f on f.id = a.fecha_id and f.tournament_id = p_tournament_id
$$;

revoke all on function long_substitution_private.my_fecha_assignments(uuid),
  long_substitution_private.can_vote_fecha(uuid,uuid), long_substitution_private.availability_write_allowed(uuid,uuid,boolean),
  public.get_my_long_fecha_substitutions(uuid) from public, anon, authenticated;
grant execute on function long_substitution_private.my_fecha_assignments(uuid),
  long_substitution_private.can_vote_fecha(uuid,uuid), long_substitution_private.availability_write_allowed(uuid,uuid,boolean),
  public.get_my_long_fecha_substitutions(uuid) to authenticated;

create policy long_fecha_substitute_insert on public.couple_time_availability for insert to authenticated
  with check (long_substitution_private.availability_write_allowed(time_slot_id,couple_id,true));
create policy long_fecha_substitute_update on public.couple_time_availability for update to authenticated
  using (long_substitution_private.availability_write_allowed(time_slot_id,couple_id,true))
  with check (long_substitution_private.availability_write_allowed(time_slot_id,couple_id,true));
create policy long_fecha_voter_insert on public.couple_time_availability as restrictive for insert to authenticated
  with check (long_substitution_private.availability_write_allowed(time_slot_id,couple_id,false));
create policy long_fecha_voter_update on public.couple_time_availability as restrictive for update to authenticated
  using (long_substitution_private.availability_write_allowed(time_slot_id,couple_id,false))
  with check (long_substitution_private.availability_write_allowed(time_slot_id,couple_id,false));
create policy long_fecha_voter_delete on public.couple_time_availability as restrictive for delete to authenticated
  using (long_substitution_private.availability_write_allowed(time_slot_id,couple_id,false));

create function public.manage_long_substitution_with_fecha(p_tournament_id uuid, p_actor_id uuid, p_rule_id uuid,
  p_couple_id uuid, p_slot integer, p_substitute_id uuid, p_scope text, p_match_id uuid, p_fecha_id uuid, p_remove boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare t public.tournaments; c public.couples; m public.matches; player public.players;
  saved long_substitution_private.long_substitutions; cut long_substitution_private.match_position;
  label text; fecha public.tournament_fechas; previous_voters jsonb;
begin
  perform tournament_points_private.assert_actor(p_tournament_id, p_actor_id);
  select * into t from public.tournaments where id = p_tournament_id for update;
  if not found or t.type::text is distinct from 'LONG' or t.status::text in ('CANCELED','FINISHED','FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED') then
    raise exception 'El torneo no admite cambios de suplencia.' using errcode = '22023';
  end if;

  select * into c from public.couples where id = p_couple_id;
  if not found or c.player1_id is null or c.player2_id is null or not exists (
    select 1 from public.inscriptions i where i.tournament_id = t.id and i.couple_id = c.id and i.occupies_slot is not false
  ) then raise exception 'Elegí una pareja inscripta en este torneo.' using errcode = '22023'; end if;

  -- A score write and a substitution for the same match must see each other.
  perform 1 from public.matches where tournament_id = t.id and c.id in (couple1_id, couple2_id) order by id for update;
  if p_rule_id is not null then
    select * into saved from long_substitution_private.long_substitutions
      where id = p_rule_id and tournament_id = t.id and couple_id = c.id;
    if not found then raise exception 'La suplencia ya no existe.' using errcode = '22023'; end if;
    if saved.scope = 'ONLY_MATCH' and exists (select 1 from public.matches old_match where old_match.id = saved.match_id
      and long_substitution_private.started(old_match)) then
      raise exception 'El partido de esta suplencia ya comenzó.' using errcode = '22023';
    end if;
    if saved.scope = 'ONLY_FECHA' and exists (select 1 from public.tournament_fechas f
      where f.id = saved.fecha_id and f.status in ('CANCELED','COMPLETED')) then
      raise exception 'La fecha de esta suplencia está cerrada.' using errcode = '22023';
    end if;
  end if;
  select coalesce(jsonb_object_agg(f.id, coalesce(r.substitute_player_id::text || ':' || r.slot::text, 'titulares')), '{}'::jsonb)
    into previous_voters from public.tournament_fechas f
    cross join lateral long_substitution_private.fecha_rule(f,c.id) r where f.tournament_id = t.id;
  if p_remove then
    delete from long_substitution_private.long_substitutions where id = saved.id;
    perform long_substitution_private.reset_changed_fecha_votes(t.id, c.id, previous_voters);
    return;
  end if;

  if p_slot is null or p_slot not in (1, 2) or p_scope is null or p_scope not in ('ONLY_MATCH','FROM_MATCH','ONLY_FECHA','FROM_FECHA')
    or (p_scope = 'ONLY_MATCH' and p_match_id is null)
    or ((p_scope in ('ONLY_FECHA','FROM_FECHA')) is distinct from (p_fecha_id is not null))
    or (p_fecha_id is not null and p_match_id is not null) then
    raise exception 'Elegí el jugador a reemplazar y el alcance de la suplencia.' using errcode = '22023';
  end if;
  select * into player from public.players where id = p_substitute_id;
  if not found or p_substitute_id in (c.player1_id, c.player2_id) then
    raise exception 'Elegí a otro jugador como suplente.' using errcode = '22023';
  end if;
  if player.score is null then
    raise exception 'El suplente necesita un puntaje de ranking para jugar este torneo.' using errcode = '22023';
  end if;
  if p_fecha_id is not null then
    select * into fecha from public.tournament_fechas f where f.id = p_fecha_id and f.tournament_id = t.id;
    if not found or (fecha.status in ('CANCELED','COMPLETED')
      and not coalesce(saved.scope = 'FROM_FECHA' and p_scope = 'FROM_FECHA' and saved.fecha_id = fecha.id, false)) then
      raise exception 'Elegí una fecha activa de este torneo.' using errcode = '22023';
    end if;
    if fecha.round_type <> 'ZONE' and not long_substitution_private.couple_in_fecha(fecha, c.id) then
      raise exception 'La fecha no corresponde a la llave de esta pareja.' using errcode = '22023';
    end if;
    if p_scope = 'FROM_FECHA' then
      cut := case when saved.scope = 'FROM_FECHA' and saved.fecha_id = fecha.id then saved.cut_position
        else long_substitution_private.fecha_position(fecha) end;
    end if;
    label := fecha.name || case fecha.bracket_key when 'GOLD' then ' · Oro' when 'SILVER' then ' · Plata' else '' end;
  elsif p_match_id is not null then
    select * into m from public.matches where id = p_match_id and tournament_id = t.id
      and c.id in (couple1_id, couple2_id)
      and bracket_is_active is not false;
    if not found then raise exception 'El partido ya no está disponible para esta pareja.' using errcode = '22023'; end if;
    if (m.status::text not in ('DRAFT','PENDING','WAITING_OPONENT','WAITING_OPPONENT') or long_substitution_private.started(m))
      and not coalesce(saved.scope = 'FROM_MATCH' and p_scope = 'FROM_MATCH' and saved.match_id = m.id, false) then
      raise exception 'Elegí un partido que todavía no haya comenzado.' using errcode = '22023';
    end if;
    if p_scope = 'FROM_MATCH' then
      cut := case when saved.scope = 'FROM_MATCH' and saved.match_id = m.id then saved.cut_position
        else long_substitution_private.position(m) end;
    end if;
    label := long_substitution_private.match_label(m);
  elsif saved.scope = 'FROM_MATCH' and saved.match_id is null and saved.cut_position is distinct from null then
    cut := saved.cut_position;
    label := saved.anchor_label;
  else
    label := 'Primer partido';
  end if;

  if p_rule_id is null then
    insert into long_substitution_private.long_substitutions(tournament_id, couple_id, slot, substitute_player_id,
      scope, match_id, fecha_id, cut_position, anchor_label) values (t.id, c.id, p_slot, player.id, p_scope, p_match_id, p_fecha_id, cut, label);
  else
    update long_substitution_private.long_substitutions set slot = p_slot, substitute_player_id = player.id,
      scope = p_scope, match_id = p_match_id, fecha_id = p_fecha_id, cut_position = cut, anchor_label = label, updated_at = now()
    where id = saved.id;
  end if;
  if exists (select 1 from public.matches candidate where candidate.tournament_id = t.id
    and c.id in (candidate.couple1_id, candidate.couple2_id) and candidate.bracket_is_active is not false
    and candidate.status::text in ('DRAFT','PENDING') and not long_substitution_private.started(candidate)
    and (p_scope in ('FROM_MATCH','FROM_FECHA') or candidate.id = p_match_id or long_substitution_private.match_fecha(candidate) = p_fecha_id)
    and long_substitution_private.has_duplicate_player(candidate, true)) then
    raise exception 'El suplente ya figura en el otro lado de un mismo partido.' using errcode = '22023';
  end if;
  perform long_substitution_private.reset_changed_fecha_votes(t.id, c.id, previous_voters);
  insert into long_substitution_private.player_baselines(tournament_id, player_id, score, category)
    values (t.id, player.id, player.score, player.category_name)
  on conflict (tournament_id, player_id) do nothing;
end $$;

create or replace function public.get_long_substitution_editor(p_tournament_id uuid, p_actor_id uuid, p_couple_id uuid, p_match_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare couple_ids uuid[];
begin
  perform tournament_points_private.assert_actor(p_tournament_id, p_actor_id);
  if not exists (select 1 from public.tournaments where id = p_tournament_id and type::text = 'LONG') then
    raise exception 'La suplencia está disponible en torneos LONG.' using errcode = '22023';
  end if;
  if p_match_id is not null then
    select array[m.couple1_id, m.couple2_id] into couple_ids from public.matches m
    where m.id = p_match_id and m.tournament_id = p_tournament_id;
    if not found then raise exception 'Partido inválido.' using errcode = '22023'; end if;
  else
    couple_ids := array[p_couple_id];
  end if;

  return jsonb_build_object(
    'fechas', coalesce((select jsonb_agg(jsonb_build_object('id', f.id,
      'label', f.name || case f.bracket_key when 'GOLD' then ' · Oro' when 'SILVER' then ' · Plata' else '' end,
      'coupleIds', array(select c from unnest(couple_ids) c where long_substitution_private.couple_in_fecha(f,c)))
      order by long_substitution_private.fecha_position(f), f.fecha_number, f.id)
      from public.tournament_fechas f where f.tournament_id = p_tournament_id and f.status not in ('CANCELED','COMPLETED')), '[]'::jsonb),
    'couples', coalesce((select jsonb_agg(jsonb_build_object('id', c.id,
      'player1', jsonb_build_object('id', p1.id, 'name', concat_ws(' ', p1.first_name, p1.last_name)),
      'player2', jsonb_build_object('id', p2.id, 'name', concat_ws(' ', p2.first_name, p2.last_name))) order by c.id)
      from public.couples c join public.players p1 on p1.id = c.player1_id join public.players p2 on p2.id = c.player2_id
      where c.id = any(couple_ids) and exists (select 1 from public.inscriptions i
        where i.tournament_id = p_tournament_id and i.couple_id = c.id and i.occupies_slot is not false)), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'coupleIds', array[m.couple1_id, m.couple2_id],
      'label', long_substitution_private.match_label(m), 'scheduledDate', fm.scheduled_date, 'scheduledTime', fm.scheduled_start_time,
      'fechaNumber', (long_substitution_private.position(m)).fecha_number,
      'couple1Name', concat_ws(' / ', concat_ws(' ', a1.first_name, a1.last_name), concat_ws(' ', a2.first_name, a2.last_name)),
      'couple2Name', concat_ws(' / ', concat_ws(' ', b1.first_name, b1.last_name), concat_ws(' ', b2.first_name, b2.last_name)))
      order by long_substitution_private.position(m))
      from public.matches m
      left join public.fecha_matches fm on fm.match_id = m.id
      left join public.couples a on a.id = m.couple1_id left join public.couples b on b.id = m.couple2_id
      left join public.players a1 on a1.id = a.player1_id left join public.players a2 on a2.id = a.player2_id
      left join public.players b1 on b1.id = b.player1_id left join public.players b2 on b2.id = b.player2_id
      where m.tournament_id = p_tournament_id and m.bracket_is_active is not false
        and m.status::text in ('DRAFT','PENDING','WAITING_OPONENT','WAITING_OPPONENT')
        and (m.couple1_id = any(couple_ids) or m.couple2_id = any(couple_ids))
        and not long_substitution_private.started(m)), '[]'::jsonb),
    'substitutions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'coupleId', s.couple_id,
      'slot', s.slot, 'player', jsonb_build_object('id', p.id, 'name', concat_ws(' ', p.first_name, p.last_name)),
      'scope', s.scope, 'matchId', s.match_id, 'fechaId', s.fecha_id, 'label', s.anchor_label,
      'editable', case when s.scope = 'ONLY_FECHA' then exists (
        select 1 from public.tournament_fechas f where f.id = s.fecha_id and f.status not in ('CANCELED','COMPLETED'))
        else s.scope in ('FROM_MATCH','FROM_FECHA') or m.id is null or not long_substitution_private.started(m) end)
      order by s.cut_position nulls first, s.updated_at)
      from long_substitution_private.long_substitutions s join public.players p on p.id = s.substitute_player_id
      left join public.matches m on m.id = s.match_id
      where s.tournament_id = p_tournament_id and s.couple_id = any(couple_ids)), '[]'::jsonb));
end $$;

create or replace function public.list_long_substitution_rules(p_tournament_id uuid, p_actor_id uuid)
returns table (id uuid, couple_id uuid, slot integer, player_name text, replaced_name text, scope text, label text)
language plpgsql security invoker set search_path = '' as $$
begin
  perform tournament_points_private.assert_actor(p_tournament_id, p_actor_id);
  return query select s.id, s.couple_id, s.slot, concat_ws(' ', p.first_name, p.last_name),
    concat_ws(' ', replaced.first_name, replaced.last_name), s.scope, s.anchor_label
    from long_substitution_private.long_substitutions s join public.players p on p.id = s.substitute_player_id
    join public.couples c on c.id = s.couple_id
    left join public.matches m on m.id = s.match_id
    left join lateral long_substitution_private.lineups(m, true, true) active
      on s.scope = 'ONLY_MATCH' and active.couple_id = s.couple_id
    left join public.players replaced on replaced.id = case s.slot
      when 1 then coalesce(active.player1_id, c.player1_id) else coalesce(active.player2_id, c.player2_id) end
    where s.tournament_id = p_tournament_id and (s.scope in ('FROM_MATCH','FROM_FECHA') or (s.scope = 'ONLY_FECHA' and exists (
        select 1 from public.tournament_fechas f where f.id = s.fecha_id and f.status not in ('CANCELED','COMPLETED'))) or
      (m.id is not null and m.bracket_is_active is not false and m.status::text in ('PENDING','DRAFT','WAITING_OPONENT','WAITING_OPPONENT')
        and not long_substitution_private.started(m)))
      and (s.scope <> 'FROM_MATCH' or not exists (
        select 1 from long_substitution_private.long_substitutions newer
        join public.matches anchor on anchor.id = newer.match_id
        where newer.tournament_id = s.tournament_id and newer.couple_id = s.couple_id and newer.scope = 'FROM_MATCH'
          and (s.cut_position is null or newer.cut_position > s.cut_position) and long_substitution_private.started(anchor)))
    order by s.cut_position nulls first, s.updated_at;
end $$;

revoke all on function long_substitution_private.fecha_position(public.tournament_fechas),
  long_substitution_private.match_fecha(public.matches),
  long_substitution_private.couple_in_fecha(public.tournament_fechas,uuid),
  long_substitution_private.fecha_rule(public.tournament_fechas,uuid),
  long_substitution_private.fecha_voters(public.tournament_fechas,public.couples),
  long_substitution_private.reset_changed_fecha_votes(uuid,uuid,jsonb),
  public.manage_long_substitution_with_fecha(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function long_substitution_private.fecha_position(public.tournament_fechas),
  long_substitution_private.match_fecha(public.matches),
  long_substitution_private.couple_in_fecha(public.tournament_fechas,uuid),
  long_substitution_private.fecha_rule(public.tournament_fechas,uuid),
  long_substitution_private.fecha_voters(public.tournament_fechas,public.couples),
  long_substitution_private.reset_changed_fecha_votes(uuid,uuid,jsonb),
  public.manage_long_substitution_with_fecha(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,uuid,boolean)
  to service_role;

create function public.get_long_fecha_substitution_lineups(p_fecha_id uuid, p_actor_id uuid)
returns table (couple_id uuid, slot integer, player_name text)
language plpgsql stable security invoker set search_path = '' as $$
declare fecha public.tournament_fechas;
begin
  select * into fecha from public.tournament_fechas f where f.id = p_fecha_id;
  if not found then return; end if;
  perform tournament_points_private.assert_actor(fecha.tournament_id, p_actor_id);
  return query select i.couple_id, s.slot, concat_ws(' ',p.first_name,p.last_name)
    from (select distinct r.couple_id from public.inscriptions r where r.tournament_id = fecha.tournament_id
      and r.occupies_slot and r.is_eliminated is not true and r.es_prueba is not true) i
    cross join lateral long_substitution_private.fecha_rule(fecha,i.couple_id) s
    join public.players p on p.id = s.substitute_player_id
    where long_substitution_private.couple_in_fecha(fecha,i.couple_id);
end $$;

revoke all on function public.get_long_fecha_substitution_lineups(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_long_fecha_substitution_lineups(uuid,uuid) to service_role;

create or replace function public.manage_long_substitution(p_tournament_id uuid, p_actor_id uuid, p_rule_id uuid,
  p_couple_id uuid, p_slot integer, p_substitute_id uuid, p_scope text, p_match_id uuid, p_remove boolean)
returns void language sql security invoker set search_path = '' as $$
  select public.manage_long_substitution_with_fecha(p_tournament_id,p_actor_id,p_rule_id,p_couple_id,p_slot,
    p_substitute_id,p_scope,p_match_id,null,p_remove)
$$;
