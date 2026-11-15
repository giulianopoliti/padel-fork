-- A cup seed only identifies the bracket. The couple has to be in a match for this jornada.
create or replace function long_substitution_private.couple_in_fecha(f public.tournament_fechas, p_couple_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select f.round_type = 'ZONE' or exists (
    select 1 from public.matches m
    where m.tournament_id = f.tournament_id and m.type = 'ELIMINATION'
      and m.round = f.round_type and coalesce(m.bracket_key,'MAIN') = f.bracket_key
      and m.bracket_is_active is not false and m.status not in ('CANCELED','BYE')
      and p_couple_id in (m.couple1_id, m.couple2_id)
      and long_substitution_private.match_fecha(m) = f.id
  )
$$;

-- Return eligible starters for knockout voting even if they have no substitute.
create or replace function long_substitution_private.my_fecha_assignments(p_tournament_id uuid)
returns table (fecha_id uuid, couple_id uuid, player1_name text, player2_name text, is_substitute boolean)
language sql stable security definer set search_path = '' as $$
  select f.id, c.id, concat_ws(' ', p1.first_name,p1.last_name), concat_ws(' ',p2.first_name,p2.last_name),
    coalesce(me.id = v.substitute_player_id, false)
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
    and f.status not in ('CANCELED','COMPLETED')
    and (v.substitute_player_id is not null or f.round_type <> 'ZONE')
    and long_substitution_private.couple_in_fecha(f,c.id)
$$;

create or replace function long_substitution_private.availability_write_allowed(p_slot_id uuid, p_couple_id uuid, p_require_substitution boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select case
    when t.type <> 'LONG' then not p_require_substitution
    when not p_require_substitution and schedule_private.can_manage(t.id) then true
    when f.status in ('CANCELED','COMPLETED') then false
    when s.slot_type = 'TIME_RANGE' and (
      coalesce(f.end_date, f.start_date, 'infinity'::date) < local_clock.at::date
      or s.date + s.end_time <= local_clock.at
    ) then false
    when (long_substitution_private.fecha_rule(f,p_couple_id)).id is null then
      not p_require_substitution and (f.round_type = 'ZONE' or long_substitution_private.can_vote_fecha(f.id,p_couple_id))
    else s.is_available and long_substitution_private.can_vote_fecha(f.id,p_couple_id)
      and (not p_require_substitution or (s.slot_type = 'TIME_RANGE' and s.is_system is not true))
    end
  from public.tournament_time_slots s join public.tournament_fechas f on f.id = s.fecha_id
  join public.tournaments t on t.id = f.tournament_id
  cross join (select statement_timestamp() at time zone 'America/Argentina/Buenos_Aires' as at) local_clock
  where s.id = p_slot_id),false)
$$;

-- Keep choosing a jornada and saving its substitution in the same transaction.
create or replace function public.manage_long_bracket_fecha_substitution(
  p_tournament_id uuid, p_actor_id uuid, p_rule_id uuid, p_couple_id uuid, p_slot integer,
  p_substitute_id uuid, p_scope text, p_match_id uuid, p_fecha_id uuid
) returns void language plpgsql security invoker set search_path = '' as $$
declare fixture public.matches; jornada public.tournament_fechas; booking public.fecha_matches; saved_fecha uuid;
begin
  perform tournament_points_private.assert_actor(p_tournament_id, p_actor_id);
  perform 1 from public.tournaments where id = p_tournament_id for update;

  select * into fixture from public.matches m
  where m.id = p_match_id and m.tournament_id = p_tournament_id and m.type = 'ELIMINATION'
    and m.bracket_is_active is not false and m.status in ('DRAFT','PENDING','WAITING_OPONENT')
    and p_couple_id in (m.couple1_id,m.couple2_id)
  for update;
  if not found or long_substitution_private.started(fixture) then
    raise exception 'Elegí un cruce de llave que todavía no haya comenzado.' using errcode = '22023';
  end if;

  select * into jornada from public.tournament_fechas f
  where f.id = p_fecha_id and f.tournament_id = fixture.tournament_id
    and f.round_type = fixture.round and f.bracket_key = coalesce(fixture.bracket_key,'MAIN')
    and f.status not in ('CANCELED','COMPLETED')
    and coalesce(f.end_date,f.start_date,'infinity'::date) >= (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date
  for share;
  if not found or p_scope is null or p_scope not in ('ONLY_FECHA','FROM_FECHA') then
    raise exception 'Elegí una jornada activa de la misma ronda y copa.' using errcode = '22023';
  end if;

  select * into booking from public.fecha_matches fm where fm.match_id = p_match_id for update;
  if booking.fecha_id is not null and booking.fecha_id <> p_fecha_id then
    raise exception 'El cruce ya tiene otra jornada. Cambiala desde su programación.' using errcode = '22023';
  end if;
  if booking.fecha_id is null then
    if booking.scheduled_date < jornada.start_date or booking.scheduled_date > jornada.end_date then
      raise exception 'El día programado queda fuera de esta jornada. Cambialo desde la programación del cruce.' using errcode = '22023';
    end if;
    insert into public.fecha_matches as fm (match_id,fecha_id) values (p_match_id,p_fecha_id)
      on conflict (match_id) do update set fecha_id=excluded.fecha_id
      where fm.fecha_id is null or fm.fecha_id = excluded.fecha_id
      returning fm.fecha_id into saved_fecha;
    if saved_fecha is null then
      raise exception 'La jornada del cruce cambió. Volvé a abrir la suplencia.' using errcode = '22023';
    end if;
  end if;

  perform public.manage_long_substitution_with_fecha(p_tournament_id,p_actor_id,p_rule_id,p_couple_id,
    p_slot,p_substitute_id,p_scope,null,p_fecha_id,false);
end
$$;

revoke all on function public.manage_long_bracket_fecha_substitution(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.manage_long_bracket_fecha_substitution(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,uuid)
  to service_role;

create or replace function public.get_long_substitution_editor_context(p_tournament_id uuid, p_actor_id uuid, p_match_id uuid, p_fecha_id uuid)
returns table (couple_id uuid, match_rule_id uuid, fecha_rule_id uuid, fecha_label text)
language plpgsql stable security invoker set search_path = '' as $$
declare fixture public.matches; jornada public.tournament_fechas;
begin
  perform tournament_points_private.assert_actor(p_tournament_id,p_actor_id);
  if p_match_id is not null then
    select * into fixture from public.matches m where m.id = p_match_id and m.tournament_id = p_tournament_id;
    if not found then return; end if;
    p_fecha_id := coalesce(p_fecha_id, long_substitution_private.match_fecha(fixture));
  end if;
  select * into jornada from public.tournament_fechas f where f.id = p_fecha_id and f.tournament_id = p_tournament_id
    and (fixture.id is null or (f.round_type = fixture.round and f.bracket_key = coalesce(fixture.bracket_key,'MAIN')));
  return query
    select i.couple_id,
      case when fixture.id is not null and not long_substitution_private.started(fixture)
        then (long_substitution_private.match_rule(fixture,i.couple_id)).id end,
      (long_substitution_private.fecha_rule(jornada,i.couple_id)).id, jornada.name
    from (select distinct r.couple_id from public.inscriptions r where r.tournament_id = p_tournament_id
      and r.occupies_slot and (p_match_id is null or r.couple_id in (fixture.couple1_id,fixture.couple2_id))) i;
end
$$;
