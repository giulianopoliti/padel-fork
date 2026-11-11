create schema long_substitution_private;
revoke all on schema long_substitution_private from public, anon, authenticated;

-- A competition position is independent of the scheduled day and time.
create type long_substitution_private.match_position as (
  phase integer,
  fecha_number integer,
  fecha_created_at timestamptz,
  fecha_id uuid,
  match_order integer,
  match_created_at timestamptz,
  match_id uuid
);

create table long_substitution_private.long_substitutions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  slot integer not null check (slot in (1, 2)),
  substitute_player_id uuid not null references public.players(id),
  scope text not null check (scope in ('ONLY_MATCH', 'FROM_MATCH')),
  match_id uuid references public.matches(id) on delete set null,
  cut_position long_substitution_private.match_position,
  anchor_label text not null,
  updated_at timestamptz not null default now(),
  check (scope <> 'ONLY_MATCH' or cut_position is null)
);
create unique index long_substitutions_one_per_match
  on long_substitution_private.long_substitutions(tournament_id, couple_id, match_id)
  where scope = 'ONLY_MATCH';
create unique index long_substitutions_one_per_cut
  on long_substitution_private.long_substitutions(tournament_id, couple_id, cut_position) nulls not distinct
  where scope = 'FROM_MATCH';
create index long_substitutions_couple_idx on long_substitution_private.long_substitutions(couple_id);
create index long_substitutions_tournament_couple_idx on long_substitution_private.long_substitutions(tournament_id, couple_id);
create index long_substitutions_match_idx on long_substitution_private.long_substitutions(match_id);
create index long_substitutions_player_idx on long_substitution_private.long_substitutions(substitute_player_id);

create table long_substitution_private.match_lineups (
  match_id uuid not null references public.matches(id) on delete cascade,
  couple_id uuid not null references public.couples(id),
  player1_id uuid not null references public.players(id),
  player2_id uuid not null references public.players(id),
  substitute_slot integer check (substitute_slot in (1, 2)),
  primary key (match_id, couple_id),
  check (player1_id <> player2_id)
);
create index long_lineups_couple_idx on long_substitution_private.match_lineups(couple_id);
create index long_lineups_player1_idx on long_substitution_private.match_lineups(player1_id);
create index long_lineups_player2_idx on long_substitution_private.match_lineups(player2_id);

create table long_substitution_private.player_baselines (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  score integer not null,
  category text,
  primary key (tournament_id, player_id)
);
create index long_player_baselines_player_idx on long_substitution_private.player_baselines(player_id);

alter table long_substitution_private.long_substitutions enable row level security;
alter table long_substitution_private.match_lineups enable row level security;
alter table long_substitution_private.player_baselines enable row level security;

create function long_substitution_private.position(m public.matches)
returns long_substitution_private.match_position
language sql stable set search_path = '' as $$
  select row(
    case when m.type = 'ELIMINATION' then 10 + coalesce(array_position(
      array['32VOS','16VOS','8VOS','4TOS','SEMIFINAL','FINAL'], m.round::text), 0) else 0 end,
    case when m.type = 'ELIMINATION' then null else coalesce(f.fecha_number, 2147483647) end,
    case when m.type <> 'ELIMINATION' then f.created_at end,
    case when m.type <> 'ELIMINATION' then f.id end,
    case when m.type <> 'ELIMINATION' then coalesce(fm.match_order, m."order"::integer) end,
    case when m.type <> 'ELIMINATION' then m.created_at end,
    case when m.type <> 'ELIMINATION' then m.id end
  )::long_substitution_private.match_position
  from (values (m.id)) anchor(id)
  left join public.fecha_matches fm on fm.match_id = anchor.id
  left join public.tournament_fechas f on f.id = fm.fecha_id
$$;

create function long_substitution_private.started(m public.matches) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(m.status::text in ('IN_PROGRESS','COMPLETED','FINISHED'), false)
    or m.winner_id is not null or m.result_couple1 is not null or m.result_couple2 is not null
    or exists (select 1 from public.set_matches s where s.match_id = m.id
      and s.status in ('IN_PROGRESS','COMPLETED','WALKOVER'))
$$;

create function long_substitution_private.lineups(m public.matches, use_pending_rules boolean default false, permanent_only boolean default false)
returns table (match_id uuid, couple_id uuid, player1_id uuid, player2_id uuid, substitute_slot integer)
language sql stable set search_path = '' as $$
  select m.id, c.id,
    coalesce(saved.player1_id, case when rule.slot = 1 then rule.substitute_player_id else c.player1_id end),
    coalesce(saved.player2_id, case when rule.slot = 2 then rule.substitute_player_id else c.player2_id end),
    coalesce(saved.substitute_slot, rule.slot)
  from public.couples c
  left join long_substitution_private.match_lineups saved on not permanent_only and saved.match_id = m.id and saved.couple_id = c.id
  left join lateral (
    select s.slot, s.substitute_player_id
    from long_substitution_private.long_substitutions s
    where s.tournament_id = m.tournament_id and s.couple_id = c.id
      and saved.match_id is null
      and (use_pending_rules or not long_substitution_private.started(m))
      and ((not permanent_only and s.scope = 'ONLY_MATCH' and s.match_id = m.id)
        or (s.scope = 'FROM_MATCH' and (s.match_id = m.id or s.cut_position is null
          or s.cut_position <= long_substitution_private.position(m))))
    order by (s.scope = 'ONLY_MATCH') desc, s.cut_position desc nulls last
    limit 1
  ) rule on true
  where c.id in (m.couple1_id, m.couple2_id)
$$;

create function long_substitution_private.has_duplicate_player(m public.matches, apply_rules boolean) returns boolean
language sql stable set search_path = '' as $$
  select count(distinct player.id) < count(*) and bool_or(l.substitute_slot is not null)
  from long_substitution_private.lineups(m, apply_rules) l
  cross join lateral (values (l.player1_id), (l.player2_id)) player(id)
  where player.id is not null
$$;

create function long_substitution_private.capture_lineups(m public.matches, apply_rules boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if m.couple1_id is null or m.couple2_id is null or m.couple1_id = m.couple2_id
    or not exists (select 1 from public.tournaments t where t.id = m.tournament_id and t.type::text = 'LONG') then
    return;
  end if;

  if apply_rules and long_substitution_private.has_duplicate_player(m, true) then
    raise exception 'Un jugador figura en ambos lados del partido. Revisá las suplencias.' using errcode = '22023';
  end if;

  insert into long_substitution_private.match_lineups(match_id, couple_id, player1_id, player2_id, substitute_slot)
    select l.match_id, l.couple_id, l.player1_id, l.player2_id, l.substitute_slot
    from long_substitution_private.lineups(m, apply_rules) l
    where l.player1_id is not null and l.player2_id is not null and l.player1_id <> l.player2_id
  on conflict (match_id, couple_id) do nothing;
end $$;

create function long_substitution_private.capture_from_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Keep the original lineup when correcting a match that predates this feature.
  if long_substitution_private.started(old) then
    perform long_substitution_private.capture_lineups(old, false);
  elsif long_substitution_private.started(new) then
    perform long_substitution_private.capture_lineups(new, true);
  end if;
  return new;
end $$;

create trigger long_capture_match_lineups
after update of status, winner_id, result_couple1, result_couple2 on public.matches
for each row when (old.status is distinct from new.status or old.winner_id is distinct from new.winner_id
  or old.result_couple1 is distinct from new.result_couple1 or old.result_couple2 is distinct from new.result_couple2)
execute function long_substitution_private.capture_from_match();

create function long_substitution_private.capture_from_set() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  if new.status in ('IN_PROGRESS','COMPLETED','WALKOVER') then
    select * into m from public.matches where id = new.match_id for update;
    if found then
      perform long_substitution_private.capture_lineups(m, not long_substitution_private.started(m));
    end if;
  end if;
  return new;
end $$;

create trigger long_capture_set_lineups before insert or update of status on public.set_matches
for each row execute function long_substitution_private.capture_from_set();

-- The invoker function first selects matches through the caller's existing RLS.
-- Only the match lineup projection crosses the private-schema boundary.
create function long_substitution_private.match_changes(p_match_id uuid, own_only boolean default false)
returns table (match_id uuid, couple_id uuid, slot integer, player jsonb)
language sql stable security definer set search_path = '' as $$
  select l.match_id, l.couple_id, l.substitute_slot,
    jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
      'profile_image_url', p.profile_image_url)
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id and t.type::text = 'LONG'
  cross join lateral long_substitution_private.lineups(m) l
  join public.players p on p.id = case l.substitute_slot when 1 then l.player1_id when 2 then l.player2_id end
  where m.id = p_match_id and (not own_only or p.user_id = (select auth.uid()))
$$;

create function public.get_long_match_lineups(p_match_ids uuid[])
returns table (match_id uuid, couple_id uuid, slot integer, player jsonb)
language sql stable security invoker set search_path = '' as $$
  select l.* from public.matches m
  cross join lateral long_substitution_private.match_changes(m.id) l
  where m.id = any(p_match_ids)
$$;

create function public.get_my_long_substitute_matches(p_tournament_id uuid)
returns table (match_id uuid, couple_id uuid)
language sql stable security invoker set search_path = '' as $$
  select l.match_id, l.couple_id
  from public.matches m
  cross join lateral long_substitution_private.match_changes(m.id, true) l
  where m.tournament_id = p_tournament_id and m.status::text not in ('DRAFT','CANCELED','BYE')
    and m.bracket_is_active is not false
$$;

create function long_substitution_private.match_label(m public.matches) returns text
language sql stable set search_path = '' as $$
  select case when m.type = 'ELIMINATION' then
    concat_ws(' · ', case m.bracket_key::text when 'GOLD' then 'Oro' when 'SILVER' then 'Plata' else 'Llave' end,
      case m.round::text when '4TOS' then 'Cuartos' when '8VOS' then 'Octavos' when '16VOS' then 'Dieciseisavos'
        when 'SEMIFINAL' then 'Semifinal' when 'FINAL' then 'Final' else m.round::text end)
  else coalesce((select f.name from public.fecha_matches fm join public.tournament_fechas f on f.id = fm.fecha_id
    where fm.match_id = m.id), 'Fase de grupos') end
$$;

create function public.get_long_substitution_editor(p_tournament_id uuid, p_actor_id uuid, p_couple_id uuid, p_match_id uuid)
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
    'couples', coalesce((select jsonb_agg(jsonb_build_object('id', c.id,
      'player1', jsonb_build_object('id', p1.id, 'name', concat_ws(' ', p1.first_name, p1.last_name)),
      'player2', jsonb_build_object('id', p2.id, 'name', concat_ws(' ', p2.first_name, p2.last_name))) order by c.id)
      from public.couples c join public.players p1 on p1.id = c.player1_id join public.players p2 on p2.id = c.player2_id
      where c.id = any(couple_ids) and exists (select 1 from public.inscriptions i
        where i.tournament_id = p_tournament_id and i.couple_id = c.id and i.occupies_slot is not false)), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'coupleIds', array[m.couple1_id, m.couple2_id],
      'label', long_substitution_private.match_label(m),
      'fechaNumber', (long_substitution_private.position(m)).fecha_number,
      'players', (select jsonb_object_agg(l.couple_id, jsonb_build_array(
        concat_ws(' ', lp1.first_name, lp1.last_name), concat_ws(' ', lp2.first_name, lp2.last_name)))
        from long_substitution_private.lineups(m) l
        join public.players lp1 on lp1.id = l.player1_id join public.players lp2 on lp2.id = l.player2_id),
      'couple1Name', concat_ws(' / ', concat_ws(' ', a1.first_name, a1.last_name), concat_ws(' ', a2.first_name, a2.last_name)),
      'couple2Name', concat_ws(' / ', concat_ws(' ', b1.first_name, b1.last_name), concat_ws(' ', b2.first_name, b2.last_name)))
      order by long_substitution_private.position(m))
      from public.matches m
      left join public.couples a on a.id = m.couple1_id left join public.couples b on b.id = m.couple2_id
      left join public.players a1 on a1.id = a.player1_id left join public.players a2 on a2.id = a.player2_id
      left join public.players b1 on b1.id = b.player1_id left join public.players b2 on b2.id = b.player2_id
      where m.tournament_id = p_tournament_id and m.bracket_is_active is not false
        and m.status::text in ('DRAFT','PENDING','WAITING_OPONENT','WAITING_OPPONENT')
        and (m.couple1_id = any(couple_ids) or m.couple2_id = any(couple_ids))
        and not long_substitution_private.started(m)), '[]'::jsonb),
    'substitutions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'coupleId', s.couple_id,
      'slot', s.slot, 'player', jsonb_build_object('id', p.id, 'name', concat_ws(' ', p.first_name, p.last_name)),
      'scope', s.scope, 'matchId', s.match_id, 'label', s.anchor_label,
      'editable', s.scope = 'FROM_MATCH' or m.id is null or not long_substitution_private.started(m))
      order by s.cut_position nulls first, s.updated_at)
      from long_substitution_private.long_substitutions s join public.players p on p.id = s.substitute_player_id
      left join public.matches m on m.id = s.match_id
      where s.tournament_id = p_tournament_id and s.couple_id = any(couple_ids)), '[]'::jsonb));
end $$;

create function public.list_long_substitution_rules(p_tournament_id uuid, p_actor_id uuid)
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
    where s.tournament_id = p_tournament_id and (s.scope = 'FROM_MATCH' or
      (m.id is not null and m.bracket_is_active is not false and m.status::text in ('PENDING','DRAFT','WAITING_OPONENT','WAITING_OPPONENT')
        and not long_substitution_private.started(m)))
      and (s.scope = 'ONLY_MATCH' or not exists (
        select 1 from long_substitution_private.long_substitutions newer
        join public.matches anchor on anchor.id = newer.match_id
        where newer.tournament_id = s.tournament_id and newer.couple_id = s.couple_id and newer.scope = 'FROM_MATCH'
          and (s.cut_position is null or newer.cut_position > s.cut_position) and long_substitution_private.started(anchor)))
    order by s.cut_position nulls first, s.updated_at;
end $$;

create function public.manage_long_substitution(p_tournament_id uuid, p_actor_id uuid, p_rule_id uuid,
  p_couple_id uuid, p_slot integer, p_substitute_id uuid, p_scope text, p_match_id uuid, p_remove boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare t public.tournaments; c public.couples; m public.matches; player public.players;
  saved long_substitution_private.long_substitutions; cut long_substitution_private.match_position;
  label text;
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
  end if;
  if p_remove then
    delete from long_substitution_private.long_substitutions where id = saved.id;
    return;
  end if;

  if p_slot is null or p_slot not in (1, 2) or p_scope is null or p_scope not in ('ONLY_MATCH','FROM_MATCH')
    or (p_scope = 'ONLY_MATCH' and p_match_id is null) then
    raise exception 'Elegí el jugador a reemplazar y el alcance de la suplencia.' using errcode = '22023';
  end if;
  select * into player from public.players where id = p_substitute_id;
  if not found or p_substitute_id in (c.player1_id, c.player2_id) then
    raise exception 'Elegí a otro jugador como suplente.' using errcode = '22023';
  end if;
  if player.score is null then
    raise exception 'El suplente necesita un puntaje de ranking para jugar este torneo.' using errcode = '22023';
  end if;
  if p_match_id is not null then
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
      scope, match_id, cut_position, anchor_label) values (t.id, c.id, p_slot, player.id, p_scope, p_match_id, cut, label);
  else
    update long_substitution_private.long_substitutions set slot = p_slot, substitute_player_id = player.id,
      scope = p_scope, match_id = p_match_id, cut_position = cut, anchor_label = label, updated_at = now()
    where id = saved.id;
  end if;
  if exists (select 1 from public.matches candidate where candidate.tournament_id = t.id
    and c.id in (candidate.couple1_id, candidate.couple2_id) and candidate.bracket_is_active is not false
    and candidate.status::text in ('DRAFT','PENDING') and not long_substitution_private.started(candidate)
    and (p_scope = 'FROM_MATCH' or candidate.id = p_match_id)
    and long_substitution_private.has_duplicate_player(candidate, true)) then
    raise exception 'El suplente ya figura en el otro lado de un mismo partido.' using errcode = '22023';
  end if;
  insert into long_substitution_private.player_baselines(tournament_id, player_id, score, category)
    values (t.id, player.id, player.score, player.category_name)
  on conflict (tournament_id, player_id) do nothing;
end $$;

revoke all on all functions in schema long_substitution_private from public, anon, authenticated;
grant usage on schema long_substitution_private to anon, authenticated, service_role;
grant execute on function long_substitution_private.match_changes(uuid,boolean) to anon, authenticated, service_role;
grant execute on all functions in schema long_substitution_private to service_role;
grant select, insert, update, delete on all tables in schema long_substitution_private to service_role;
revoke all on function public.get_long_match_lineups(uuid[]) from public, anon, authenticated;
grant execute on function public.get_long_match_lineups(uuid[]) to anon, authenticated, service_role;
revoke all on function public.get_my_long_substitute_matches(uuid) from public, anon, authenticated;
grant execute on function public.get_my_long_substitute_matches(uuid) to authenticated;
revoke all on function public.get_long_substitution_editor(uuid,uuid,uuid,uuid), public.list_long_substitution_rules(uuid,uuid),
  public.manage_long_substitution(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.get_long_substitution_editor(uuid,uuid,uuid,uuid), public.list_long_substitution_rules(uuid,uuid),
  public.manage_long_substitution(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,boolean) to service_role;

-- Points review and confirmation use the same frozen lineups and fingerprint.
create or replace function tournament_points_private.context(p_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  with registrations as (
    select id,player_id,couple_id,is_pending from public.inscriptions where tournament_id=p_id
  ), tournament_matches as (
    select id,type,round,bracket_key,status,winner_id,couple1_id,couple2_id,bracket_is_active,
      result_couple1,result_couple2 from public.matches where tournament_id=p_id
  ), tournament_couples as (
    select id,player1_id,player2_id from public.couples where id in (
      select couple_id from registrations union select couple1_id from tournament_matches union select couple2_id from tournament_matches
    )
  ), lineups as (
    select l.match_id,l.couple_id,l.player1_id,l.player2_id,l.substitute_slot
    from long_substitution_private.match_lineups l
    join tournament_matches m on m.id=l.match_id and m.status::text='FINISHED' and m.bracket_is_active is not false
      and l.couple_id in (m.couple1_id,m.couple2_id) and m.couple1_id is not null and m.couple2_id is not null
    where l.substitute_slot is not null
      and exists(select 1 from public.tournaments t where t.id=p_id and t.type::text='LONG')
  ), substitutes as (
    select distinct case substitute_slot when 1 then player1_id else player2_id end as player_id from lineups
  ), player_ids as (
    select player_id id from registrations union select player1_id from tournament_couples
    union select player2_id from tournament_couples union select player_id from public.player_tournament_history where tournament_id=p_id
    union select player_id from substitutes
  )
  select jsonb_build_object(
    'tournament',(select to_jsonb(r) from (select id,type,status,format_type,format_config from public.tournaments where id=p_id) r),
    'matches',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from tournament_matches m),'[]'::jsonb),
    'lineups',coalesce((select jsonb_agg(to_jsonb(l) order by l.match_id,l.couple_id) from lineups l),'[]'::jsonb),
    'couples',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from tournament_couples c),'[]'::jsonb),
    'inscriptions',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from registrations i),'[]'::jsonb),
    'players',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (
      select id,first_name,last_name,score,category_name from public.players where id in (select id from player_ids)
    ) r),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(r) order by r.lower_range,r.name) from (
      select name,lower_range,upper_range from public.categories
    ) r),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(to_jsonb(r) order by r.player_id,r.id) from (
      select id,player_id,score,category,'START'::text as basis
      from public.ranking_snapshots where tournament_id=p_id and snapshot_type='tournament_start'
      union all
      select null,b.player_id,b.score,b.category,'SUBSTITUTION'
      from long_substitution_private.player_baselines b join substitutes s on s.player_id=b.player_id
      where b.tournament_id=p_id and not exists(select 1 from public.ranking_snapshots initial
        where initial.tournament_id=p_id and initial.player_id=b.player_id and initial.snapshot_type='tournament_start')
    ) r),'[]'::jsonb),
    'disqualifications',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (
      select id,match_id,couple_id from public.tournament_couple_disqualifications where tournament_id=p_id and status='ACTIVE'
    ) r),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(r) order by r.player_id) from (
      select player_id,points_before,points_after,points_earned from public.player_tournament_history where tournament_id=p_id
    ) r),'[]'::jsonb),
    'freeRevision',(select revision from public.american_free_brackets where tournament_id=p_id)
  )
$$;

create or replace function public.commit_tournament_points(p_tournament_id uuid,p_actor_id uuid,p_fingerprint text,p_calculation jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t public.tournaments%rowtype; source jsonb; saved jsonb; review jsonb; row_data jsonb;
  p public.players%rowtype; target_category text; expected_ids uuid[]; submitted_ids uuid[]; changed integer;
begin
  select * into t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Torneo no encontrado' using errcode='22023'; end if;
  perform tournament_points_private.assert_actor(p_tournament_id,p_actor_id);
  select summary into saved from public.tournament_points_settlements where tournament_id=p_tournament_id;
  if found then return jsonb_build_object('review',saved,'alreadyApplied',true); end if;
  if t.status::text <> 'FINISHED_POINTS_PENDING' or t.type::text not in ('AMERICAN','LONG') then
    raise exception 'El torneo no está pendiente de acreditar puntos' using errcode='22023'; end if;

  -- Lock the tournament first, then child rows, couples, and players in a stable
  -- order. Shared players across tournaments serialize without overwriting scores.
  perform 1 from public.matches where tournament_id=p_tournament_id order by id for update;
  perform 1 from public.inscriptions where tournament_id=p_tournament_id order by id for share;
  perform 1 from public.couples c where c.id in (
    select couple_id from public.inscriptions where tournament_id=p_tournament_id
    union select couple1_id from public.matches where tournament_id=p_tournament_id
    union select couple2_id from public.matches where tournament_id=p_tournament_id
  ) order by c.id for share;
  source:=tournament_points_private.context(p_tournament_id);
  perform 1 from public.players where id in (select (value->>'id')::uuid from jsonb_array_elements(source->'players')) order by id for update;
  perform 1 from public.categories order by name for share;
  perform 1 from public.ranking_snapshots where tournament_id=p_tournament_id order by id for share;
  perform 1 from public.tournament_couple_disqualifications where tournament_id=p_tournament_id order by id for share;
  source:=tournament_points_private.context(p_tournament_id);
  if md5(source::text) is distinct from p_fingerprint then
    raise exception 'Los datos cambiaron. Actualizá la revisión de puntos.' using errcode='40001'; end if;
  if exists(select 1 from public.matches where tournament_id=p_tournament_id and bracket_is_active and (status::text<>'FINISHED' or winner_id is null)) then
    raise exception 'Quedan partidos activos sin finalizar' using errcode='22023'; end if;
  if exists(select 1 from public.player_tournament_history where tournament_id=p_tournament_id)
    or exists(select 1 from public.match_points_couples mp join public.matches m on m.id=mp.match_id where m.tournament_id=p_tournament_id) then
    raise exception 'Hay movimientos previos. Revisá el historial para evitar una doble acreditación.' using errcode='22023'; end if;

  review:=p_calculation->'review';
  if review->>'rulesVersion' is distinct from 'manual-categories-v1' or review->>'tournamentId' is distinct from p_tournament_id::text
    or review->>'fingerprint' is distinct from p_fingerprint or review->>'state' is distinct from 'PREVIEW'
    or jsonb_typeof(review->'playerScores') is distinct from 'array'
    or jsonb_typeof(p_calculation->'matchPoints') is distinct from 'array' then
    raise exception 'Liquidación inválida' using errcode='22023'; end if;
  select array_agg(id order by id) into expected_ids from (
    select i.player_id id from public.inscriptions i where i.tournament_id=p_tournament_id and i.player_id is not null and i.is_pending is not true
    union select c.player1_id from public.inscriptions i join public.couples c on c.id=i.couple_id where i.tournament_id=p_tournament_id and i.is_pending is not true
    union select c.player2_id from public.inscriptions i join public.couples c on c.id=i.couple_id where i.tournament_id=p_tournament_id and i.is_pending is not true
    union select case (l->>'substitute_slot')::integer when 1 then (l->>'player1_id')::uuid else (l->>'player2_id')::uuid end
    from jsonb_array_elements(source->'lineups') l
  ) r where id is not null;
  select array_agg((value->>'playerId')::uuid order by (value->>'playerId')::uuid) into submitted_ids from jsonb_array_elements(review->'playerScores');
  if expected_ids is null or expected_ids is distinct from submitted_ids then
    raise exception 'La liquidación debe incluir exactamente a los jugadores inscriptos y habilitados' using errcode='22023'; end if;

  for row_data in select value from jsonb_array_elements(review->'playerScores') loop
    select * into strict p from public.players where id=(row_data->>'playerId')::uuid;
    target_category:=row_data->>'categoryAfter';
    if p.score is distinct from (row_data->>'pointsBefore')::numeric or p.category_name is distinct from row_data->>'categoryBefore' then
      raise exception 'El jugador cambió desde la revisión' using errcode='40001'; end if;
    if (row_data->>'matchPoints')::integer is null or (row_data->>'bonus')::integer is null or (row_data->>'bonus')::integer<0
      or (row_data->>'pointsEarned')::integer is distinct from (row_data->>'matchPoints')::integer+(row_data->>'bonus')::integer
      or (row_data->>'pointsAfter')::numeric is distinct from p.score+(row_data->>'pointsEarned')::integer then
      raise exception 'El desglose del jugador es inválido' using errcode='22023'; end if;
    if target_category is distinct from p.category_name then
      if p.category_name is null or not exists(select 1 from public.categories where name=target_category) then
        raise exception 'El cambio manual requiere categorías válidas' using errcode='22023'; end if;
      insert into public.player_recategorizations(player_id,tournament_id,old_category_name,new_category_name,old_score,new_score,recategorized_by,reason,tournament_context,es_prueba)
      values(p.id,p_tournament_id,p.category_name,target_category,(row_data->>'pointsAfter')::integer,(row_data->>'pointsAfter')::integer,p_actor_id,
        'Decisión manual en revisión de puntos; conserva el puntaje deportivo',true,t.es_prueba);
    end if;
    update public.players set score=(row_data->>'pointsAfter')::integer,category_name=target_category where id=p.id;
    insert into public.player_tournament_history(player_id,tournament_id,points_before,points_after,points_earned,es_prueba)
      values(p.id,p_tournament_id,(row_data->>'pointsBefore')::integer,(row_data->>'pointsAfter')::integer,(row_data->>'pointsEarned')::integer,t.es_prueba);
  end loop;
  for row_data in select value from jsonb_array_elements(p_calculation->'matchPoints') loop
    if not exists(select 1 from public.matches m where m.id=(row_data->>'match_id')::uuid and m.tournament_id=p_tournament_id
      and m.bracket_is_active and m.status::text='FINISHED' and m.winner_id=(row_data->>'winner_couple_id')::uuid
      and (row_data->>'loser_couple_id')::uuid in (m.couple1_id,m.couple2_id)
      and (row_data->>'loser_couple_id')::uuid<>m.winner_id) then
      raise exception 'Partido ajeno o resultado inválido' using errcode='22023'; end if;
    insert into public.match_points_couples(match_id,winner_couple_id,loser_couple_id,points_winner,points_loser)
      values((row_data->>'match_id')::uuid,(row_data->>'winner_couple_id')::uuid,(row_data->>'loser_couple_id')::uuid,
        (row_data->>'points_winner')::integer,(row_data->>'points_loser')::integer);
  end loop;
  saved:=review||jsonb_build_object('state','APPLIED','appliedAt',now());
  insert into public.tournament_points_settlements(tournament_id,actor_id,rules_version,source_fingerprint,source_context,summary)
    values(p_tournament_id,p_actor_id,'manual-categories-v1',p_fingerprint,source,saved);
  update public.tournaments set status='FINISHED_POINTS_CALCULATED',status_sort_value=null where id=p_tournament_id;
  return jsonb_build_object('review',saved,'alreadyApplied',false);
end $$;
