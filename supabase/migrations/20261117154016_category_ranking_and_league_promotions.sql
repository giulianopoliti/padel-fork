-- The shared migration installs the feature. The database owner activates the
-- appropriate policy in each project after the application is ready.
alter table public.categories
  add column level smallint check (level > 0),
  add column initial_score integer not null default 0 check (initial_score = 0);

update public.categories set level = substring(name from '^([1-9][0-9]?)([[:alpha:]]*)$')::smallint
where name ~ '^[1-9][0-9]?[[:alpha:]]*$';

alter table public.players add column category_revision bigint not null default 0;

alter table public.player_tournament_history
  add column ranking_category text,
  add column ranking_category_revision bigint,
  add column ranking_wins integer,
  add column ranking_bonus integer,
  add column ranking_champion boolean,
  add column ranking_title_match_id uuid;

create index player_tournament_history_ranking_titles
  on public.player_tournament_history (ranking_category, player_id, tournament_id)
  where ranking_champion is true and es_prueba is false;

alter table public.player_recategorizations
  add column ranking_movement text check (ranking_movement in ('LEAGUE_PROMOTION', 'REVERSAL')),
  add column ranking_title_match_id uuid,
  add column ranking_category_revision bigint,
  add column ranking_reverts_id uuid references public.player_recategorizations(id),
  add column ranking_bonus integer;

create unique index player_recategorizations_league_promotion_once
  on public.player_recategorizations (tournament_id, player_id) where ranking_movement = 'LEAGUE_PROMOTION';
create unique index player_recategorizations_league_reversal_once
  on public.player_recategorizations (ranking_reverts_id) where ranking_reverts_id is not null;
create index player_recategorizations_league_promotion_recent
  on public.player_recategorizations (created_at desc, id) where ranking_movement = 'LEAGUE_PROMOTION' and es_prueba is false;

create table public.ranking_settings (
  singleton boolean primary key default true check (singleton),
  policy text not null check (policy in ('FV_LEAGUE', 'ELITE_AMERICAN')),
  started_at timestamptz not null
);

create table tournament_points_private.ranking_before_reset (
  player_id uuid primary key references public.players(id) on delete cascade,
  score numeric,
  category_name text
);

alter table public.ranking_settings enable row level security;
revoke all on public.ranking_settings from public, anon, authenticated;
grant select on public.ranking_settings to anon, authenticated, service_role;
create policy ranking_settings_public_read on public.ranking_settings for select to anon, authenticated using (true);

create function tournament_points_private.activate_ranking(p_policy text) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare started timestamptz;
begin
  perform pg_advisory_xact_lock(41703, 1);
  select started_at into started from public.ranking_settings;
  if found then raise exception 'El ranking de esta base ya fue reiniciado'; end if;
  if p_policy is null or p_policy not in ('FV_LEAGUE', 'ELITE_AMERICAN') then
    raise exception 'Elegí la política de ranking del proyecto';
  end if;
  lock table public.players in share row exclusive mode;
  insert into tournament_points_private.ranking_before_reset(player_id, score, category_name)
    select id, score, category_name from public.players;
  started := clock_timestamp();
  insert into public.ranking_settings(policy, started_at) values (p_policy, started);
  update public.players set score=0 where score is distinct from 0;
  return started;
end $$;

-- All category writers participate in the revision check, including edits made
-- outside the tournament screens. Initialization uses zero after activation.
create function tournament_points_private.apply_ranking_to_player() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    new.category_revision := old.category_revision + (new.category_name is distinct from old.category_name)::integer;
  end if;
  if exists(select 1 from public.ranking_settings) then
    if TG_OP = 'INSERT' then
      new.score := 0;
    elsif new.is_categorized is true and (old.is_categorized is not true or old.category_name is null) then
      new.score := 0;
    end if;
  end if;
  return new;
end $$;

create trigger players_apply_category_ranking before insert or update of category_name, is_categorized
on public.players for each row execute function tournament_points_private.apply_ranking_to_player();

create function tournament_points_private.ranking_context(p_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select context || jsonb_build_object(
    'tournament', context->'tournament' || jsonb_build_object(
      'category_name', t.category_name, 'category_config', t.category_config, 'es_prueba', t.es_prueba
    ),
    'rankingPolicy', settings.policy, 'rankingStartedAt', settings.started_at,
    'players', (select coalesce(jsonb_agg(player || jsonb_build_object('category_revision', p.category_revision)
      order by player->>'id'), '[]'::jsonb)
      from jsonb_array_elements(context->'players') player join public.players p on p.id=(player->>'id')::uuid),
    'categories', (select coalesce(jsonb_agg(to_jsonb(c) order by c.lower_range, c.name), '[]'::jsonb)
      from (select name, lower_range, upper_range, level from public.categories) c),
    'roundRobinChampion', (select (array_agg(zp.couple_id))[1] from public.zone_positions zp
      where zp.tournament_id=p_id and zp.is_definitive is true and zp.position=1 and zp.couple_id is not null
      having count(*)=1),
    'matches', (select coalesce(jsonb_agg(m || jsonb_build_object('administrative_result',
      upper(coalesce(m->>'result_couple1', '')) in ('W', 'WO', 'W.O.', 'BYE', 'WALKOVER') or
      upper(coalesce(m->>'result_couple2', '')) in ('W', 'WO', 'W.O.', 'BYE', 'WALKOVER')) order by m->>'id'), '[]'::jsonb)
      from jsonb_array_elements(context->'matches') m)
  )
  from public.tournaments t
  cross join lateral (select long_substitution_private.points_context(p_id) as context) input
  left join public.ranking_settings settings on true
  where t.id=p_id
$$;

create or replace function public.get_tournament_points_context_with_lineups(p_tournament_id uuid,p_actor_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare source jsonb; saved jsonb;
begin
  perform tournament_points_private.assert_actor(p_tournament_id,p_actor_id);
  source:=tournament_points_private.ranking_context(p_tournament_id);
  select summary into saved from public.tournament_points_settlements where tournament_id=p_tournament_id;
  return jsonb_build_object('context',source,'fingerprint',md5(source::text),'settlement',saved);
end $$;

create or replace function public.commit_tournament_points_with_lineups(p_tournament_id uuid,p_actor_id uuid,p_fingerprint text,p_calculation jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t public.tournaments%rowtype; source jsonb; saved jsonb; review jsonb; row_data jsonb;
  p public.players%rowtype; target_category text; expected_ids uuid[]; submitted_ids uuid[]; fixed boolean; policy text;
  ranking_category text; tournament_points integer; match_points integer; bonus integer; balance integer;
  automatic_promotion boolean; champion boolean; title_match uuid;
begin
  perform pg_advisory_xact_lock_shared(41703, 1);
  select * into t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Torneo no encontrado' using errcode='22023'; end if;
  perform tournament_points_private.assert_actor(p_tournament_id,p_actor_id);
  select summary into saved from public.tournament_points_settlements where tournament_id=p_tournament_id;
  if found then return jsonb_build_object('review',saved,'alreadyApplied',true); end if;
  select settings.policy into policy from public.ranking_settings settings;
  fixed := coalesce((policy = 'FV_LEAGUE' and t.type::text = 'LONG')
    or (policy = 'ELITE_AMERICAN' and t.type::text in ('AMERICAN','AMERICAN_OTP','AMERICANO')), false);
  if t.status::text <> 'FINISHED_POINTS_PENDING'
    or (not fixed and t.type::text not in ('AMERICAN','LONG')) then
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
  source:=tournament_points_private.ranking_context(p_tournament_id);
  perform 1 from public.players where id in (select (value->>'id')::uuid from jsonb_array_elements(source->'players')) order by id for update;
  perform 1 from public.categories order by name for share;
  perform 1 from public.ranking_snapshots where tournament_id=p_tournament_id order by id for share;
  perform 1 from public.tournament_couple_disqualifications where tournament_id=p_tournament_id order by id for share;
  perform 1 from public.zone_positions where tournament_id=p_tournament_id order by id for share;
  source:=tournament_points_private.ranking_context(p_tournament_id);
  if md5(source::text) is distinct from p_fingerprint then
    raise exception 'Los datos cambiaron. Actualizá la revisión de puntos.' using errcode='40001'; end if;
  if exists(select 1 from public.matches where tournament_id=p_tournament_id and bracket_is_active and (status::text<>'FINISHED' or winner_id is null)) then
    raise exception 'Quedan partidos activos sin finalizar' using errcode='22023'; end if;
  if exists(select 1 from public.player_tournament_history where tournament_id=p_tournament_id)
    or exists(select 1 from public.match_points_couples mp join public.matches m on m.id=mp.match_id where m.tournament_id=p_tournament_id) then
    raise exception 'Hay movimientos previos. Revis el historial para evitar una doble acreditación.' using errcode='22023'; end if;

  review:=p_calculation->'review';
  if review->>'rulesVersion' is distinct from
    (case when fixed then 'fixed-ranking-v1' else 'manual-categories-v1' end) or review->>'tournamentId' is distinct from p_tournament_id::text
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
    match_points := (row_data->>'matchPoints')::integer;
    bonus := (row_data->>'bonus')::integer;
    tournament_points := (row_data->>'pointsEarned')::integer;
    ranking_category := case when fixed then row_data->>'rankingCategory' end;
    automatic_promotion := fixed and coalesce((row_data->>'automaticPromotion')::boolean, false);
    champion := fixed and coalesce((row_data->>'champion')::boolean, false);
    title_match := case when champion then (row_data->>'titleMatchId')::uuid end;
    balance := p.score + case when not fixed or ranking_category is not distinct from p.category_name
      then tournament_points else 0 end;

    if match_points is null or bonus is null or bonus < 0
      or (fixed and (match_points < 0 or tournament_points < 0))
      or tournament_points is distinct from match_points + bonus then
      raise exception 'El desglose del jugador es inválido' using errcode='22023';
    end if;
    if automatic_promotion and (policy is distinct from 'FV_LEAGUE' or not champion or bonus <> 0
      or ranking_category is distinct from p.category_name
      or not exists (select 1 from public.categories from_category join public.categories to_category
        on to_category.level=from_category.level-1 where from_category.name=p.category_name
        and from_category.level between 4 and 8 and to_category.name=target_category)
      or not exists (select 1 from public.matches m join public.couples c on c.id=m.winner_id
        where m.id=title_match and m.tournament_id=p_tournament_id and m.bracket_is_active
        and m.round::text='FINAL' and coalesce(m.bracket_key::text, 'MAIN') in ('MAIN','GOLD')
        and p.id in (c.player1_id, c.player2_id))) then
      raise exception 'Ascenso automático inválido' using errcode='22023';
    end if;
    if (row_data->>'pointsAfter')::integer is distinct from
      (case when fixed and target_category is distinct from p.category_name then 0 else balance end) then
      raise exception 'El saldo final es inválido' using errcode='22023';
    end if;
    if target_category is distinct from p.category_name then
      if p.category_name is null or not exists(select 1 from public.categories where name=target_category) then
        raise exception 'El cambio requiere categorías válidas' using errcode='22023';
      end if;
      insert into public.player_recategorizations(player_id,tournament_id,old_category_name,new_category_name,
        old_score,new_score,recategorized_by,reason,tournament_context,es_prueba,ranking_movement,
        ranking_title_match_id,ranking_category_revision)
      values(p.id,p_tournament_id,p.category_name,target_category,balance,(row_data->>'pointsAfter')::integer,
        p_actor_id,case when automatic_promotion then 'Campeón de Liga' else 'Decisión manual en revisión de puntos' end,
        true,t.es_prueba,case when automatic_promotion then 'LEAGUE_PROMOTION' end,title_match,p.category_revision+1);
    end if;
    if not fixed or t.es_prueba is not true then
      update public.players set score=(row_data->>'pointsAfter')::integer,category_name=target_category where id=p.id;
    end if;
    insert into public.player_tournament_history(player_id,tournament_id,points_before,points_after,points_earned,
      es_prueba,ranking_category,ranking_category_revision,ranking_wins,ranking_bonus,ranking_champion,ranking_title_match_id)
    values(p.id,p_tournament_id,(row_data->>'pointsBefore')::integer,balance,tournament_points,t.es_prueba,
      ranking_category,case when fixed then p.category_revision end,
      case when fixed then match_points / (case when policy='FV_LEAGUE' then 12 else 6 end) end,
      case when fixed then bonus end,case when fixed then champion end,title_match);
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
    values(p_tournament_id,p_actor_id,review->>'rulesVersion',p_fingerprint,source,saved);
  update public.tournaments set status='FINISHED_POINTS_CALCULATED',status_sort_value=null where id=p_tournament_id;
  return jsonb_build_object('review',saved,'alreadyApplied',false);
end $$;

create function public.get_league_promotions(p_actor_id uuid, p_since timestamptz, p_offset integer)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(promotion) order by promotion.created_at desc, promotion.id), '[]'::jsonb)
  from (
    select movement.id, movement.tournament_id, t.name as tournament_name, movement.player_id,
      concat_ws(' ', p.first_name, p.last_name) as player_name, movement.created_at,
      movement.old_category_name, movement.new_category_name, movement.old_score,
      reversal.created_at as reversed_at, reversal.reason as reversal_reason,
      p.category_revision is distinct from movement.ranking_category_revision as has_later_change
    from public.player_recategorizations movement
    join public.tournaments t on t.id=movement.tournament_id
    join public.players p on p.id=movement.player_id
    join public.users u on u.id=p_actor_id
    left join public.player_recategorizations reversal on reversal.ranking_reverts_id=movement.id
    where movement.ranking_movement='LEAGUE_PROMOTION' and movement.es_prueba is false
      and (p_since is null or movement.created_at >= p_since)
      and (u.role::text='ADMIN'
        or (u.role::text='CLUB' and exists(select 1 from public.clubes c where c.id=t.club_id and c.user_id=u.id))
        or (u.role::text='ORGANIZADOR' and exists(select 1 from public.organization_members m
          where m.organizacion_id=t.organization_id and m.user_id=u.id and m.is_active)))
    order by movement.created_at desc, movement.id
    limit 51 offset greatest(coalesce(p_offset, 0), 0)
  ) promotion
$$;

create function public.revert_league_promotion(p_promotion_id uuid, p_actor_id uuid, p_reason text)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare movement public.player_recategorizations%rowtype; reversal public.player_recategorizations%rowtype;
  p public.players%rowtype; restored_score integer;
begin
  select * into movement from public.player_recategorizations
    where id=p_promotion_id and ranking_movement='LEAGUE_PROMOTION' and es_prueba is false;
  if not found then raise exception 'Ascenso no encontrado' using errcode='22023'; end if;
  perform tournament_points_private.assert_actor(movement.tournament_id,p_actor_id);
  perform 1 from public.tournaments where id=movement.tournament_id for update;
  select * into p from public.players where id=movement.player_id for update;
  select * into reversal from public.player_recategorizations where ranking_reverts_id=movement.id;
  if found then return jsonb_build_object('category',reversal.new_category_name,'score',reversal.new_score); end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then
    raise exception 'Ingresá el motivo de la reversión' using errcode='22023';
  end if;
  if p.category_name is distinct from movement.new_category_name
    or p.category_revision is distinct from movement.ranking_category_revision then
    raise exception 'El jugador tiene otro cambio de categoría posterior' using errcode='40001';
  end if;

  select movement.old_score + 300 + coalesce(sum(h.points_earned), 0)
    into restored_score from public.player_tournament_history h
    where h.player_id=p.id and h.ranking_category=movement.old_category_name
      and h.ranking_category_revision=movement.ranking_category_revision
      and h.created_at >= movement.created_at and h.es_prueba is false;
  update public.players set category_name=movement.old_category_name,score=restored_score where id=p.id;
  insert into public.player_recategorizations(player_id,tournament_id,old_category_name,new_category_name,
    old_score,new_score,recategorized_by,reason,tournament_context,es_prueba,ranking_movement,
    ranking_title_match_id,ranking_category_revision,ranking_reverts_id,ranking_bonus)
  values (p.id,movement.tournament_id,p.category_name,movement.old_category_name,p.score,restored_score,p_actor_id,
    trim(p_reason),true,false,'REVERSAL',movement.ranking_title_match_id,p.category_revision+1,movement.id,300);
  return jsonb_build_object('category',movement.old_category_name,'score',restored_score);
end $$;

create function public.get_ranking_weekly_points(p_players uuid[], p_since timestamptz)
returns table(player_id uuid, points integer)
language sql stable security invoker set search_path = '' as $$
  select p.id, (coalesce((select sum(h.points_earned) from public.player_tournament_history h
    where h.player_id=p.id and h.ranking_category=p.category_name
      and h.ranking_category_revision=p.category_revision and h.es_prueba is false
      and h.created_at>=greatest(p_since,s.started_at)),0)
    + coalesce((select sum(r.ranking_bonus) from public.player_recategorizations r
      where r.player_id=p.id and r.ranking_movement='REVERSAL'
        and r.ranking_category_revision=p.category_revision and r.created_at>=greatest(p_since,s.started_at)),0))::integer
  from public.players p cross join public.ranking_settings s
  where p.id=any(p_players) and p.es_prueba is false
$$;
revoke all on function public.get_ranking_weekly_points(uuid[],timestamptz) from public;
grant execute on function public.get_ranking_weekly_points(uuid[],timestamptz) to anon,authenticated,service_role;

revoke all on function tournament_points_private.activate_ranking(text) from public, anon, authenticated, service_role;
revoke all on function tournament_points_private.ranking_context(uuid),
  public.get_league_promotions(uuid,timestamptz,integer), public.revert_league_promotion(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function tournament_points_private.ranking_context(uuid),
  public.get_league_promotions(uuid,timestamptz,integer), public.revert_league_promotion(uuid,uuid,text)
  to service_role;
