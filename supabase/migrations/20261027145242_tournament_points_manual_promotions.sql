-- Local preparation only. The repository owner deploys this through CI/CD.
create schema tournament_points_private;
revoke all on schema tournament_points_private from public, anon, authenticated;
grant usage on schema tournament_points_private to service_role;

create table public.tournament_points_settlements (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  actor_id uuid not null,
  rules_version text not null check (rules_version = 'manual-categories-v1'),
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{32}$'),
  source_context jsonb not null check (jsonb_typeof(source_context) = 'object'),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.tournament_points_settlements enable row level security;
revoke all on public.tournament_points_settlements from public, anon, authenticated;
grant all on public.tournament_points_settlements to service_role;

create function tournament_points_private.assert_actor(p_id uuid, p_actor uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.tournaments t join public.users u on u.id=p_actor where t.id=p_id and (
    u.role::text='ADMIN'
    or (u.role::text='CLUB' and exists(select 1 from public.clubes c where c.id=t.club_id and c.user_id=u.id))
    or (u.role::text='ORGANIZADOR' and exists(select 1 from public.organization_members m
      where m.organizacion_id=t.organization_id and m.user_id=u.id and m.is_active))
  )) then raise exception 'Sin permisos sobre el torneo' using errcode='42501'; end if;
end $$;

-- One SELECT gives a consistent input. VOLATILE obtains a fresh snapshot when
-- called after acquiring locks (including when a concurrent request just won).
create function tournament_points_private.context(p_id uuid) returns jsonb
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
  ), player_ids as (
    select player_id id from registrations union select player1_id from tournament_couples
    union select player2_id from tournament_couples union select player_id from public.player_tournament_history where tournament_id=p_id
  )
  select jsonb_build_object(
    'tournament',(select to_jsonb(r) from (select id,type,status,format_type,format_config from public.tournaments where id=p_id) r),
    'matches',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from tournament_matches m),'[]'::jsonb),
    'couples',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from tournament_couples c),'[]'::jsonb),
    'inscriptions',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from registrations i),'[]'::jsonb),
    'players',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (
      select id,first_name,last_name,score,category_name from public.players where id in (select id from player_ids)
    ) r),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(r) order by r.lower_range,r.name) from (
      select name,lower_range,upper_range from public.categories
    ) r),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(to_jsonb(r) order by r.player_id,r.id) from (
      select id,player_id,score,category from public.ranking_snapshots where tournament_id=p_id and snapshot_type='tournament_start'
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

create function public.get_tournament_points_context(p_tournament_id uuid,p_actor_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare source jsonb; saved jsonb;
begin
  perform tournament_points_private.assert_actor(p_tournament_id,p_actor_id);
  source:=tournament_points_private.context(p_tournament_id);
  select summary into saved from public.tournament_points_settlements where tournament_id=p_tournament_id;
  return jsonb_build_object('context',source,'fingerprint',md5(source::text),'settlement',saved);
end $$;

create function public.commit_tournament_points(p_tournament_id uuid,p_actor_id uuid,p_fingerprint text,p_calculation jsonb) returns jsonb
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

-- Manual changes outside settlement also preserve score and commit their audit
-- together. This API is server-only; the actor is authenticated by Next.js and
-- independently authorized here. Browser clients cannot call it or write headers.
create function public.recategorize_tournament_players(p_tournament_id uuid,p_actor_id uuid,p_updates jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t public.tournaments%rowtype; item jsonb; p public.players%rowtype; seen uuid[]:='{}'; result jsonb:='[]';
begin
  select * into t from public.tournaments where id=p_tournament_id for update;
  perform tournament_points_private.assert_actor(p_tournament_id,p_actor_id);
  if jsonb_typeof(p_updates) is distinct from 'array' or jsonb_array_length(p_updates) not between 1 and 512 then
    raise exception 'Seleccioná los jugadores a recategorizar' using errcode='22023'; end if;
  perform 1 from public.players where id in (select (value->>'playerId')::uuid from jsonb_array_elements(p_updates)) order by id for update;
  for item in select value from jsonb_array_elements(p_updates) loop
    select * into p from public.players where id=(item->>'playerId')::uuid;
    if not found or p.id=any(seen) or not exists(
      select 1 from public.inscriptions i left join public.couples c on c.id=i.couple_id where i.tournament_id=p_tournament_id
      and i.is_pending is not true and p.id in (i.player_id,c.player1_id,c.player2_id)
    ) then raise exception 'Jugador ajeno, repetido o no habilitado en el torneo' using errcode='22023'; end if;
    seen:=array_append(seen,p.id);
    if p.score is distinct from (item->>'expectedScore')::numeric or p.category_name is distinct from item->>'expectedCategory' then
      raise exception 'La ficha cambió. Actualizá antes de guardar.' using errcode='40001'; end if;
    if p.category_name is null or not exists(select 1 from public.categories where name=item->>'newCategory') then
      raise exception 'El cambio manual requiere categorías válidas' using errcode='22023'; end if;
    if p.category_name=item->>'newCategory' then continue; end if;
    update public.players set category_name=item->>'newCategory' where id=p.id;
    insert into public.player_recategorizations(player_id,tournament_id,old_category_name,new_category_name,old_score,new_score,recategorized_by,reason,tournament_context,es_prueba)
      values(p.id,p_tournament_id,p.category_name,item->>'newCategory',p.score,p.score,p_actor_id,'Recategorización manual; conserva el puntaje',true,t.es_prueba);
    result:=result||jsonb_build_array(jsonb_build_object('playerId',p.id,'oldCategory',p.category_name,'newCategory',item->>'newCategory','oldScore',p.score,'newScore',p.score));
  end loop;
  return jsonb_build_object('success',true,'updated',jsonb_array_length(result),'updateDetails',result);
end $$;

-- Capture actual starting scores for future tournaments. Existing pending
-- tournaments are never backfilled and the preview labels its fallback clearly.
create function tournament_points_private.capture_start() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.ranking_snapshots(tournament_id,player_id,player_name,score,category,snapshot_type,es_prueba)
    select NEW.id,p.id,trim(concat(p.first_name,' ',p.last_name)),p.score,p.category_name,'tournament_start',NEW.es_prueba
    from public.players p where p.score is not null and p.id in (
      select i.player_id from public.inscriptions i where i.tournament_id=NEW.id and i.is_pending is not true
      union select c.player1_id from public.inscriptions i join public.couples c on c.id=i.couple_id where i.tournament_id=NEW.id and i.is_pending is not true
      union select c.player2_id from public.inscriptions i join public.couples c on c.id=i.couple_id where i.tournament_id=NEW.id and i.is_pending is not true
    ) and not exists(select 1 from public.ranking_snapshots s where s.tournament_id=NEW.id and s.player_id=p.id and s.snapshot_type='tournament_start');
  return NEW;
end $$;
create trigger tournament_points_capture_start after update of status on public.tournaments
  for each row when (OLD.status::text='NOT_STARTED' and NEW.status::text='ZONE_PHASE' and NEW.type::text in ('AMERICAN','LONG'))
  execute function tournament_points_private.capture_start();

revoke all on all functions in schema tournament_points_private from public,anon,authenticated;
grant execute on all functions in schema tournament_points_private to service_role;
revoke all on function public.get_tournament_points_context(uuid,uuid),public.commit_tournament_points(uuid,uuid,text,jsonb),
  public.recategorize_tournament_players(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_tournament_points_context(uuid,uuid),public.commit_tournament_points(uuid,uuid,text,jsonb),
  public.recategorize_tournament_players(uuid,uuid,jsonb) to service_role;
