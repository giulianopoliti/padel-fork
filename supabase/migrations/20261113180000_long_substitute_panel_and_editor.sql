create function public.get_my_long_substitute_panel_fechas()
returns table (tournament_id uuid, tournament_name text, fecha_id uuid, fecha_name text,
  couple_id uuid, player1_name text, player2_name text, has_slots boolean)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.name, f.id,
    f.name || case f.bracket_key when 'GOLD' then ' · Oro' when 'SILVER' then ' · Plata' else '' end,
    a.couple_id, a.player1_name, a.player2_name,
    exists (select 1 from public.tournament_time_slots s where s.fecha_id = f.id and s.is_available
      and s.slot_type = 'TIME_RANGE' and s.is_system is not true)
  from (select distinct c.tournament_id from long_substitution_private.my_substitute_couples() c) assigned
  join public.tournaments t on t.id = assigned.tournament_id
  cross join lateral long_substitution_private.my_fecha_assignments(t.id) a
  join public.tournament_fechas f on f.id = a.fecha_id
  where a.is_substitute
  order by t.name, f.fecha_number, f.created_at, f.id, a.couple_id
$$;

revoke all on function public.get_my_long_substitute_panel_fechas() from public, anon, authenticated;
grant execute on function public.get_my_long_substitute_panel_fechas() to authenticated;

-- Reuse the same rule selection in lineups and in the organizer's editor.
create function long_substitution_private.match_rule(m public.matches, p_couple_id uuid, permanent_only boolean default false)
returns long_substitution_private.long_substitutions
language sql stable set search_path = '' as $$
  with fixture as (
    select anchor.fecha_id, long_substitution_private.position(m) match_position,
      long_substitution_private.fecha_position(f) fecha_position
    from (select long_substitution_private.match_fecha(m) fecha_id) anchor
    left join public.tournament_fechas f on f.id = anchor.fecha_id
  )
  select s.*
  from long_substitution_private.long_substitutions s cross join fixture f
  where s.tournament_id = m.tournament_id and s.couple_id = p_couple_id
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
$$;

create or replace function long_substitution_private.lineups(m public.matches, use_pending_rules boolean default false, permanent_only boolean default false)
returns table (match_id uuid, couple_id uuid, player1_id uuid, player2_id uuid, substitute_slot integer)
language sql stable set search_path = '' as $$
  select m.id, c.id,
    coalesce(saved.player1_id, case when rule.slot = 1 then rule.substitute_player_id else c.player1_id end),
    coalesce(saved.player2_id, case when rule.slot = 2 then rule.substitute_player_id else c.player2_id end),
    coalesce(saved.substitute_slot, rule.slot)
  from public.couples c
  left join long_substitution_private.match_lineups saved on not permanent_only and saved.match_id = m.id and saved.couple_id = c.id
  left join lateral long_substitution_private.match_rule(m,c.id,permanent_only) rule
    on saved.match_id is null and (use_pending_rules or not long_substitution_private.started(m))
  where c.id in (m.couple1_id, m.couple2_id)
$$;

create function public.get_long_substitution_editor_context(p_tournament_id uuid, p_actor_id uuid, p_match_id uuid, p_fecha_id uuid)
returns table (couple_id uuid, match_rule_id uuid, fecha_rule_id uuid, fecha_label text)
language plpgsql stable security invoker set search_path = '' as $$
declare fixture public.matches; jornada public.tournament_fechas;
begin
  perform tournament_points_private.assert_actor(p_tournament_id,p_actor_id);
  if p_match_id is not null then
    select * into fixture from public.matches m where m.id = p_match_id and m.tournament_id = p_tournament_id;
    if not found then return; end if;
    p_fecha_id := long_substitution_private.match_fecha(fixture);
  end if;
  select * into jornada from public.tournament_fechas f where f.id = p_fecha_id and f.tournament_id = p_tournament_id;
  return query
    select i.couple_id,
      case when fixture.id is not null and not long_substitution_private.started(fixture)
        then (long_substitution_private.match_rule(fixture,i.couple_id)).id end,
      (long_substitution_private.fecha_rule(jornada,i.couple_id)).id, jornada.name
    from (select distinct r.couple_id from public.inscriptions r where r.tournament_id = p_tournament_id
      and r.occupies_slot and (p_match_id is null or r.couple_id in (fixture.couple1_id,fixture.couple2_id))) i;
end $$;

revoke all on function long_substitution_private.match_rule(public.matches,uuid,boolean),
  public.get_long_substitution_editor_context(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function long_substitution_private.match_rule(public.matches,uuid,boolean),
  public.get_long_substitution_editor_context(uuid,uuid,uuid,uuid) to service_role;
