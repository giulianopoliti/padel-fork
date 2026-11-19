-- Release after the application uses category levels and zero initial scores.
-- Historical migrations remain intact so a fresh database can replay them.
create function tournament_points_private.initial_category(p_config jsonb, p_fallback text)
returns text language plpgsql stable security invoker set search_path = '' as $$
declare selected_category text;
begin
  if p_config is null or p_config->>'mode'='SINGLE' then
    select name into selected_category from public.categories
      where name=coalesce(p_config->>'category', p_fallback);
  elsif p_config->>'mode'='RANGE' then
    if (select count(*) from public.categories where name in (p_config->>'categoryA',p_config->>'categoryB')) <> 2 then
      raise exception 'Revisá las categorías combinadas';
    end if;
    select name into selected_category from public.categories
      where name in (p_config->>'categoryA',p_config->>'categoryB') order by level desc nulls last, name limit 1;
  elsif p_config->>'mode'='MIXED_SUM' then
    select candidate.name into selected_category from public.categories candidate
      where exists(select 1 from public.categories partner where candidate.level+partner.level=(p_config->>'targetSum')::integer)
      order by abs(candidate.level-(p_config->>'targetSum')::numeric/2), candidate.level desc, candidate.name limit 1;
  end if;
  if selected_category is null then raise exception 'Asigná una categoría válida al jugador'; end if;
  return selected_category;
end $$;
revoke all on function tournament_points_private.initial_category(jsonb,text) from public,anon,authenticated;

create or replace function solo_player_private.confirm_tournament_pair(
  p_tournament_id uuid, p_player1_id uuid, p_player2_id uuid, p_actor_id uuid,
  p_tenant text, p_request_id uuid default null, p_payment_method text default null,
  p_terms_accepted boolean default false, p_allow_blocked_override boolean default false,
  p_organizer boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments%rowtype; r public.solo_player_requests%rowtype;
  post public.solo_player_posts%rowtype; a public.players%rowtype; b public.players%rowtype;
  saved public.inscriptions%rowtype; v_couple_id uuid; manages boolean; actor_role text;
  cfg jsonb; occupied integer; source text; terms text := '2026-08-28';
  initial_score numeric; initial_category text;
begin
  if p_actor_id is null or p_player1_id is null or p_player2_id is null or p_player1_id = p_player2_id
    or p_tenant is null or p_tenant not in ('padel-fv','padel-elite') then
    raise exception 'Datos de emparejamiento inválidos' using errcode = '22023';
  end if;
  select role::text into actor_role from public.users where id = p_actor_id;
  if not found then raise exception 'Usuario no autenticado' using errcode = '42501'; end if;

  -- Same ordering as phase 1: tournament row -> scope 702 -> payment/capacity 701.
  -- Do not update the tournament row while holding these locks: capacity UI sync
  -- runs after commit. Closure/config changes wait for this transaction's share.
  perform solo_player_private.lock_scope(p_tournament_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text, 701));
  select * into strict t from public.tournaments where id = p_tournament_id;
  select actor_role = 'ADMIN'
    or (actor_role = 'CLUB' and exists(select 1 from public.clubes c where c.id=t.club_id and c.user_id=p_actor_id))
    or (actor_role = 'ORGANIZADOR' and exists(select 1 from public.organization_members m
      where m.organizacion_id=t.organization_id and m.user_id=p_actor_id and m.is_active)) into manages;
  if p_organizer and not manages then raise exception 'Sin permisos sobre el torneo' using errcode = '42501'; end if;

  if p_request_id is not null then
    select * into r from public.solo_player_requests where id=p_request_id for update;
    if not found or r.tournament_id is distinct from p_tournament_id or r.recipient_user_id <> p_actor_id
      or r.sender_player_id <> p_player1_id or r.recipient_player_id <> p_player2_id or p_organizer then
      raise exception 'Sin permisos sobre la solicitud' using errcode = '42501';
    end if;
    if r.status = 'ACCEPTED' and r.inscription_id is not null then
      select * into strict saved from public.inscriptions where id=r.inscription_id;
      return jsonb_build_object('inscription',to_jsonb(saved),'request_status',r.status,'created',false);
    end if;
    if r.status <> 'PENDING' then raise exception 'Solicitud no disponible' using errcode = 'P0001'; end if;
    select * into strict post from public.solo_player_posts where id=r.post_id for update;
    if post.status <> 'ACTIVE' or (r.expires_at is not null and r.expires_at <= now()) then
      raise exception 'Solicitud vencida o publicación no disponible' using errcode = 'P0001';
    end if;
    source := 'REQUEST';
  else
    source := case when p_organizer then 'ORGANIZER' else 'LEGACY_CONVERSION' end;
  end if;

  if t.status::text not in ('NOT_STARTED','PAIRING','ZONE_REGISTRATION','ZONE_PHASE')
    or (coalesce(t.registration_locked,false) and not coalesce(t.registration_locked_by_capacity,false))
    or (t.created_at < '2025-07-01'::timestamptz and t.status::text <> 'ZONE_PHASE'
      and coalesce(t.bracket_status::text,'') in ('BRACKET_GENERATED','BRACKET_ACTIVE'))
    or (not p_organizer and (coalesce(t.is_draft,false) or not coalesce(t.enable_public_inscriptions,false))) then
    raise exception 'El torneo ya no admite inscripciones' using errcode = 'P0001';
  end if;

  perform 1 from public.players where id in (p_player1_id,p_player2_id) order by id for update;
  select * into strict a from public.players where id=p_player1_id;
  select * into strict b from public.players where id=p_player2_id;
  if not p_organizer and p_request_id is null and a.user_id is distinct from p_actor_id then
    raise exception 'Sin permisos sobre los jugadores' using errcode = '42501';
  end if;
  if p_request_id is not null and (a.user_id is distinct from r.sender_user_id or b.user_id is distinct from r.recipient_user_id) then
    raise exception 'El vínculo de los jugadores cambió' using errcode = '42501';
  end if;

  -- A repeated organizer submission returns the canonical inscription even after
  -- its historical individual rows have been consumed.
  select i.* into saved from public.inscriptions i join public.couples c on c.id=i.couple_id
    where i.tournament_id=p_tournament_id and least(c.player1_id,c.player2_id)=least(p_player1_id,p_player2_id)
      and greatest(c.player1_id,c.player2_id)=greatest(p_player1_id,p_player2_id);
  if found and p_organizer then
    return jsonb_build_object('inscription',to_jsonb(saved),'created',false);
  end if;
  if exists(select 1 from public.inscriptions i join public.couples c on c.id=i.couple_id
    where i.tournament_id=p_tournament_id and (c.player1_id in (p_player1_id,p_player2_id) or c.player2_id in (p_player1_id,p_player2_id))) then
    raise exception 'Uno de los jugadores ya está inscrito en una pareja' using errcode = '23505';
  end if;
  if p_request_id is null and not p_organizer and not exists(select 1 from public.inscriptions i where i.tournament_id=p_tournament_id
    and i.couple_id is null and i.player_id in (p_player1_id,p_player2_id)) then
    raise exception 'Ninguno de los jugadores tiene inscripción individual en este torneo' using errcode = 'P0001';
  end if;
  select count(*) into occupied from public.inscriptions where tournament_id=p_tournament_id and couple_id is not null and es_prueba=false and occupies_slot;
  if t.max_participants is not null and occupied >= t.max_participants then
    if p_organizer then raise exception 'Cupos llenos. Modificá el límite de inscriptos para emparejarlos' using errcode='P0001'; end if;
    raise exception 'Cupos llenos' using errcode='P0001';
  end if;
  if p_payment_method is not null and p_payment_method not in ('TRANSFER','CASH') then
    raise exception 'Forma de pago inválida' using errcode='22023';
  end if;
  if p_payment_method='CASH' and not t.allow_cash_payment then raise exception 'Este torneo no permite efectivo'; end if;
  if t.gender::text = 'MIXED' then
    if a.gender::text not in ('MALE','FEMALE') or b.gender::text not in ('MALE','FEMALE') or a.gender=b.gender
      or a.gender is null or b.gender is null then raise exception 'La pareja debe ser mixta'; end if;
  elsif t.gender::text='FEMALE' and (a.gender::text is distinct from 'FEMALE' or b.gender::text is distinct from 'FEMALE') then
    raise exception 'Es un torneo femenino, ambas jugadoras deben ser femeninas.';
  end if;
  cfg := t.category_config;
  -- Preserve the existing registration-time initialization, inside the same
  -- rollback boundary. Merely publishing still never touches ranking/profile.
  if not coalesce(a.is_categorized and a.score is not null and nullif(trim(a.category_name),'') is not null,false)
    or not coalesce(b.is_categorized and b.score is not null and nullif(trim(b.category_name),'' ) is not null,false) then
    cfg := coalesce(cfg,jsonb_build_object('mode','SINGLE','category',t.category_name));
    initial_category := tournament_points_private.initial_category(cfg,t.category_name);
    initial_score := 0;
    if initial_category is null then raise exception 'No se pudo resolver la categoría inicial del torneo'; end if;
    update public.players set score=initial_score,category_name=initial_category,is_categorized=true
      where id in (p_player1_id,p_player2_id)
        and not coalesce(is_categorized and score is not null and nullif(trim(category_name),'') is not null,false);
    select * into strict a from public.players where id=p_player1_id;
    select * into strict b from public.players where id=p_player2_id;
  end if;
  if coalesce((cfg->>'validationEnabled')::boolean,false) then
    if a.category_name is null or b.category_name is null then raise exception 'Falta categoría de uno de los jugadores'; end if;
    if cfg->>'mode' = 'SINGLE' and (a.category_name <> cfg->>'category' or b.category_name <> cfg->>'category') then
      raise exception 'La pareja no cumple la categoría del torneo';
    elsif cfg->>'mode' = 'RANGE' and (a.category_name not in (cfg->>'categoryA',cfg->>'categoryB') or b.category_name not in (cfg->>'categoryA',cfg->>'categoryB')) then
      raise exception 'La pareja no cumple el rango de categorías';
    elsif cfg->>'mode' = 'MIXED_SUM' and coalesce(
      substring(a.category_name from '^([0-9]+)')::integer + substring(b.category_name from '^([0-9]+)')::integer = (cfg->>'targetSum')::integer,false)=false then
      raise exception 'La pareja no cumple la suma de categorías';
    end if;
  end if;
  if p_tenant='padel-elite' and t.type::text='AMERICAN' then
    if exists(select 1 from public.tpe_registration_blocks where player_id in (p_player1_id,p_player2_id) and unblocked_at is null)
      and not (p_organizer and p_allow_blocked_override) then
      raise exception 'Te prohibieron la inscripción a los torneos de Padel Elite, comunicate con los organizadores para resolverlo.';
    end if;
    if not p_organizer and (not coalesce(p_terms_accepted,false) or (p_request_id is not null
      and (r.tournament_terms_version is distinct from terms or post.tournament_terms_version is distinct from terms))) then
      raise exception 'Debes aceptar los Términos y Condiciones vigentes para inscribirte.';
    end if;
  end if;
  select id into v_couple_id from public.couples where least(player1_id,player2_id)=least(p_player1_id,p_player2_id)
    and greatest(player1_id,player2_id)=greatest(p_player1_id,p_player2_id) order by id limit 1;
  if v_couple_id is null then
    insert into public.couples(player1_id,player2_id) values(p_player1_id,p_player2_id) returning id into v_couple_id;
  end if;
  -- The universal inscription trigger invalidates pending alternatives. Resolve
  -- the winning request first, inside this transaction, so it is not invalidated.
  if p_request_id is not null then
    update public.solo_player_requests set status='ACCEPTED',resolved_at=now(),resolved_by=p_actor_id where id=r.id;
  end if;
  insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending,payment_method,pairing_source,paired_by_user_id)
    values(p_tournament_id,v_couple_id,case when p_organizer then null else p_player1_id end,
      coalesce(t.validate_inscriptions,false) and not p_organizer,
      coalesce(p_payment_method,case when t.enable_transfer_proof then 'TRANSFER' end),source,p_actor_id) returning * into saved;
  -- Delete only the consumed individuals, in this same transaction; never any
  -- publication or unrelated tournament history.
  delete from public.inscriptions where tournament_id=p_tournament_id and couple_id is null and player_id in (p_player1_id,p_player2_id);
  if p_request_id is not null then
    update solo_player_private.request_contacts c set recipient_phone=pc.phone from solo_player_private.post_contacts pc
      where c.request_id=r.id and pc.post_id=r.post_id;
    update public.solo_player_requests set status='ACCEPTED',inscription_id=saved.id,resolved_at=now(),resolved_by=p_actor_id where id=r.id;
    perform solo_player_private.notify_request(r.id,'REQUEST_ACCEPTED');
  end if;
  if p_tenant='padel-elite' and t.type::text='AMERICAN' then
    if not p_organizer then
      insert into public.tpe_terms_acceptances(tournament_id,inscription_id,accepted_by_player_id,accepted_by_user_id,terms_version,terms_url)
        values(t.id,saved.id,p_player1_id,coalesce(r.sender_user_id,p_actor_id),terms,'/tournaments/terms');
      if p_request_id is not null then
        insert into public.tpe_terms_acceptances(tournament_id,inscription_id,accepted_by_player_id,accepted_by_user_id,terms_version,terms_url)
          values(t.id,saved.id,p_player2_id,p_actor_id,terms,'/tournaments/terms');
      end if;
    elsif p_allow_blocked_override then
      insert into public.tpe_registration_block_overrides(block_id,tournament_id,player_id,authorized_by_user_id)
        select id,t.id,player_id,p_actor_id from public.tpe_registration_blocks where player_id in (p_player1_id,p_player2_id) and unblocked_at is null;
    end if;
  end if;
  return jsonb_build_object('inscription',to_jsonb(saved),'request_status',case when p_request_id is not null then 'ACCEPTED' end,'created',true);
end $$;

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
    'categories',coalesce((select jsonb_agg(to_jsonb(r) order by r.level desc nulls last,r.name) from (
      select name,level,initial_score from public.categories
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

create or replace function long_substitution_private.points_context(p_id uuid) returns jsonb
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
    'categories',coalesce((select jsonb_agg(to_jsonb(r) order by r.level desc nulls last,r.name) from (
      select name,level,initial_score from public.categories
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

create or replace function tournament_points_private.ranking_context(p_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select context || jsonb_build_object(
    'tournament', context->'tournament' || jsonb_build_object(
      'category_name', t.category_name, 'category_config', t.category_config, 'es_prueba', t.es_prueba
    ),
    'rankingPolicy', settings.policy, 'rankingStartedAt', settings.started_at,
    'players', (select coalesce(jsonb_agg(player || jsonb_build_object('category_revision', p.category_revision)
      order by player->>'id'), '[]'::jsonb)
      from jsonb_array_elements(context->'players') player join public.players p on p.id=(player->>'id')::uuid),
    'categories', (select coalesce(jsonb_agg(to_jsonb(c) order by c.level desc nulls last, c.name), '[]'::jsonb)
      from (select name, level, initial_score from public.categories) c),
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

create or replace function public.recategorize_tournament_players(p_tournament_id uuid,p_actor_id uuid,p_updates jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t public.tournaments%rowtype; item jsonb; p public.players%rowtype; seen uuid[]:='{}'; result jsonb:='[]'; next_score integer;
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
    next_score := case when exists(select 1 from public.ranking_settings) then 0 else p.score end;
    update public.players set category_name=item->>'newCategory',score=next_score where id=p.id;
    insert into public.player_recategorizations(player_id,tournament_id,old_category_name,new_category_name,old_score,new_score,recategorized_by,reason,tournament_context,es_prueba)
      values(p.id,p_tournament_id,p.category_name,item->>'newCategory',p.score,next_score,p_actor_id,'Recategorización manual',true,t.es_prueba);
    result:=result||jsonb_build_array(jsonb_build_object('playerId',p.id,'oldCategory',p.category_name,'newCategory',item->>'newCategory','oldScore',p.score,'newScore',next_score));
  end loop;
  return jsonb_build_object('success',true,'updated',jsonb_array_length(result),'updateDetails',result);
end $$;

alter table public.categories drop column lower_range, drop column upper_range;
alter table public.players alter column score set default 0;
