-- Local preparation only. Remote deployment belongs to the repository owner/CI.
-- Keep the receipt private; reopening has no additional audit workflow in the UI.
create schema tournament_reopen_private;
revoke all on schema tournament_reopen_private from public, anon, authenticated;
grant usage on schema tournament_reopen_private to service_role;

create table tournament_reopen_private.closures (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  previous jsonb not null,
  closed_at timestamptz not null default clock_timestamp()
);
create table tournament_reopen_private.receipts (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{32}$'),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  original jsonb not null,
  result jsonb not null,
  primary key (tournament_id, fingerprint)
);
revoke all on all tables in schema tournament_reopen_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema tournament_reopen_private to service_role;

-- Captures both ordinary and transactional American free-bracket closures.
-- The trigger alone uses definer privileges: authenticated finalization cannot
-- read or write the private snapshot table directly.
create function tournament_reopen_private.capture_closure() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status::text='FINISHED_POINTS_PENDING' and old.status::text in ('BRACKET_PHASE','ZONE_PHASE') then
    insert into tournament_reopen_private.closures(tournament_id, previous, closed_at)
      values(old.id, jsonb_build_object('status',old.status,'winner_id',old.winner_id,
        'end_date',old.end_date,'bonuses',old.format_config->'bonuses'), clock_timestamp())
      on conflict(tournament_id) do update set previous=excluded.previous, closed_at=excluded.closed_at;
  end if;
  return new;
end $$;
create trigger tournament_capture_points_closure before update of status on public.tournaments
  for each row execute function tournament_reopen_private.capture_closure();

-- A single statement supplies a consistent read. Called again AFTER locks on
-- confirmation, so no score or category supplied by the browser is trusted.
create function tournament_reopen_private.context(p_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  with settlement as (
    select * from public.tournament_points_settlements where tournament_id=p_id
  ), player_ids as (
    select (v->>'playerId')::uuid id from settlement s cross join lateral jsonb_array_elements(s.summary->'playerScores') v
    union select player_id from public.player_tournament_history where tournament_id=p_id
    union select player_id from public.player_recategorizations where tournament_id=p_id
  )
  select jsonb_build_object(
    'tournament',(select to_jsonb(t) from public.tournaments t where t.id=p_id),
    'closure',(select to_jsonb(c) from tournament_reopen_private.closures c where c.tournament_id=p_id),
    'settlement',(select to_jsonb(s) from settlement s),
    'rankingStartedAt',(select started_at from public.ranking_settings),
    'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from (
      select id,first_name,last_name,score,category_name,category_revision from public.players where id in(select id from player_ids)
    ) p),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.id) from public.player_tournament_history h
      where h.player_id in(select id from player_ids)),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.player_recategorizations r
      where r.player_id in(select id from player_ids)),'[]'::jsonb),
    'matchPoints',coalesce((select jsonb_agg(to_jsonb(mp) order by mp.id) from public.match_points_couples mp
      join public.matches m on m.id=mp.match_id where m.tournament_id=p_id),'[]'::jsonb),
    'freeRevision',(select revision from public.american_free_brackets where tournament_id=p_id)
  )
$$;

create function tournament_reopen_private.plan(source jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare t jsonb:=source->'tournament'; s jsonb:=source->'settlement'; previous jsonb:=source->'closure'->'previous';
  blockers jsonb:='[]'; changes jsonb:='[]'; movement_ids jsonb:='[]'; row_data jsonb; p jsonb; baseline jsonb;
  movement jsonb; reversal jsonb; player_movement_ids jsonb; expected_score numeric; expected_category text;
  expected_revision bigint; original_revision bigint; fixed_test boolean; changed boolean;
  destination text; player_name text; extra_bonus integer; titles integer:=0; promotions integer:=0;
begin
  if t->>'status' is null or t->>'status' not in ('FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED') then
    raise exception 'Solo se puede reabrir un torneo cerrado o con puntos acreditados' using errcode='22023'; end if;
  destination:=coalesce(previous->>'status',case when t->'format_config'->>'bracketMode'='NONE' then 'ZONE_PHASE' else 'BRACKET_PHASE' end);
  if destination not in ('BRACKET_PHASE','ZONE_PHASE') then
    raise exception 'La fase anterior al cierre no es válida' using errcode='22023'; end if;

  if s is null or s='null'::jsonb then
    if t->>'status'='FINISHED_POINTS_CALCULATED' or jsonb_array_length(source->'matchPoints')>0
      or exists(select 1 from jsonb_array_elements(source->'history') h where h->>'tournament_id'=t->>'id') then
      blockers:=blockers||jsonb_build_array('Este cierre no tiene una acreditación guardada que permita restaurar los saldos con seguridad.');
    end if;
  elsif t->>'status'<>'FINISHED_POINTS_CALCULATED' then
    blockers:=blockers||jsonb_build_array('El estado del torneo no coincide con su acreditación. Revisá los datos antes de reabrir.');
  elsif s->>'rules_version'<>'fixed-ranking-v1' or source->>'rankingStartedAt' is null
    or (s->>'created_at')::timestamptz < (source->>'rankingStartedAt')::timestamptz then
    blockers:=blockers||jsonb_build_array('La acreditación es anterior al ranking actual. No se pueden restaurar automáticamente los saldos de ese período.');
  else
    if md5((s->'source_context')::text) is distinct from s->>'source_fingerprint'
      or s->'summary'->>'fingerprint' is distinct from s->>'source_fingerprint'
      or jsonb_array_length(source->'matchPoints') is distinct from (s->'summary'->>'totalMatches')::integer then
      blockers:=blockers||jsonb_build_array('Los registros del cierre no coinciden con la acreditación guardada.');
    end if;
    fixed_test:=coalesce((s->'source_context'->'tournament'->>'es_prueba')::boolean,false);
    for row_data in select value from jsonb_array_elements(s->'summary'->'playerScores') loop
      select value into p from jsonb_array_elements(source->'players') where value->>'id'=row_data->>'playerId';
      select value into baseline from jsonb_array_elements(s->'source_context'->'players') where value->>'id'=row_data->>'playerId';
      player_name:=coalesce(row_data->>'playerName',row_data->>'playerId');
      original_revision:=(baseline->>'category_revision')::bigint;
      if p is null or baseline is null or original_revision is null then
        blockers:=blockers||jsonb_build_array(player_name||': falta la captura previa a la acreditación.');
        continue;
      end if;
      changed:=not fixed_test and (row_data->>'categoryAfter' is distinct from row_data->>'categoryBefore');
      expected_score:=case when fixed_test then (row_data->>'pointsBefore')::numeric else (row_data->>'pointsAfter')::numeric end;
      expected_category:=case when fixed_test then row_data->>'categoryBefore' else row_data->>'categoryAfter' end;
      expected_revision:=original_revision+changed::integer;
      extra_bonus:=0;
      select value into movement from jsonb_array_elements(source->'movements')
        where value->>'tournament_id'=t->>'id' and value->>'player_id'=row_data->>'playerId'
          and value->>'created_at'=s->>'created_at' and value->>'ranking_reverts_id' is null
          and value->>'old_category_name'=row_data->>'categoryBefore' and value->>'new_category_name'=row_data->>'categoryAfter';
      select value into reversal from jsonb_array_elements(source->'movements')
        where value->>'ranking_reverts_id'=movement->>'id';
      player_movement_ids:=case when movement is null then '[]'::jsonb else jsonb_build_array(movement->>'id') end;
      if changed and movement is null then
        blockers:=blockers||jsonb_build_array(player_name||': falta el movimiento de categoría del cierre.');
      end if;
      if reversal is not null then
        expected_score:=(movement->>'old_score')::numeric+300;
        expected_category:=row_data->>'categoryBefore';
        expected_revision:=original_revision+2;
        extra_bonus:=300;
        player_movement_ids:=player_movement_ids||jsonb_build_array(reversal->>'id');
      end if;
      if (p->>'score')::numeric is distinct from expected_score or p->>'category_name' is distinct from expected_category
        or (p->>'category_revision')::bigint is distinct from expected_revision then
        blockers:=blockers||jsonb_build_array(player_name||': el saldo o la categoría cambiaron después de acreditar.');
      end if;
      if exists(select 1 from jsonb_array_elements(source->'history') h where h->>'player_id'=row_data->>'playerId'
        and h->>'tournament_id'<>t->>'id' and (h->>'created_at')::timestamptz >= (s->>'created_at')::timestamptz) then
        blockers:=blockers||jsonb_build_array(player_name||': tiene puntos acreditados por otro torneo después de este cierre.');
      end if;
      if exists(select 1 from jsonb_array_elements(source->'movements') r where r->>'player_id'=row_data->>'playerId'
        and (r->>'created_at')::timestamptz >= (s->>'created_at')::timestamptz
        and not (player_movement_ids ? (r->>'id'))) then
        blockers:=blockers||jsonb_build_array(player_name||': tiene otro cambio de categoría posterior.');
      end if;
      if (select count(*) from jsonb_array_elements(source->'history') h where h->>'tournament_id'=t->>'id'
        and h->>'player_id'=row_data->>'playerId' and h->>'points_before'=row_data->>'pointsBefore'
        and h->>'points_earned'=row_data->>'pointsEarned'
        and h->>'ranking_category' is not distinct from row_data->>'rankingCategory'
        and (h->>'ranking_category_revision')::bigint=original_revision
        and (h->>'ranking_champion')::boolean is not distinct from coalesce((row_data->>'champion')::boolean,false)
        and (h->>'ranking_bonus')::integer=(row_data->>'bonus')::integer)<>1 then
        blockers:=blockers||jsonb_build_array(player_name||': su historial no coincide con la acreditación guardada.');
      end if;
      movement_ids:=movement_ids||player_movement_ids;
      titles:=titles+coalesce((row_data->>'champion')::boolean,false)::integer;
      promotions:=promotions+coalesce((row_data->>'automaticPromotion')::boolean,false)::integer;
      if (row_data->>'pointsEarned')::numeric<>0 or coalesce((row_data->>'champion')::boolean,false)
        or movement is not null or (p->>'score')::numeric is distinct from (row_data->>'pointsBefore')::numeric then
        changes:=changes||jsonb_build_array(jsonb_build_object(
          'playerId',row_data->>'playerId','playerName',player_name,
          'pointsBefore',(p->>'score')::numeric,'pointsAfter',(row_data->>'pointsBefore')::numeric,
          'categoryBefore',p->>'category_name','categoryAfter',row_data->>'categoryBefore',
          'categoryRevisionAfter',original_revision,'creditedPoints',(row_data->>'pointsEarned')::integer,
          'extraBonusToRemove',extra_bonus,'titleRemoved',coalesce((row_data->>'champion')::boolean,false),
          'promotionRemoved',coalesce((row_data->>'automaticPromotion')::boolean,false)));
      end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(source->'history') h where h->>'tournament_id'=t->>'id'
      and not exists(select 1 from jsonb_array_elements(s->'summary'->'playerScores') v where v->>'playerId'=h->>'player_id'))
      or exists(select 1 from jsonb_array_elements(source->'movements') r where r->>'tournament_id'=t->>'id'
        and (r->>'created_at')::timestamptz >= (s->>'created_at')::timestamptz and not (movement_ids ? (r->>'id'))) then
      blockers:=blockers||jsonb_build_array('Hay movimientos del torneo que no pertenecen a la acreditación guardada.');
    end if;
  end if;
  return jsonb_build_object('tournamentId',t->>'id','tournamentName',t->>'name','statusBefore',t->>'status',
    'statusAfter',destination,'fingerprint',md5(source::text),'hadPoints',t->>'status'='FINISHED_POINTS_CALCULATED' or (s is not null and s<>'null'::jsonb),
    'estimatedPreviousState',previous is null or previous='null'::jsonb,
    'playerChanges',changes,'titlesToRemove',titles,'promotionsToRemove',promotions,
    'matchPointsToRemove',jsonb_array_length(source->'matchPoints'),'blockers',blockers,
    'movementIds',movement_ids,'canReopen',jsonb_array_length(blockers)=0);
end $$;

create function public.preview_tournament_reopen(p_tournament_id uuid,p_actor_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  perform tournament_points_private.assert_actor(p_tournament_id,p_actor_id);
  return tournament_reopen_private.plan(tournament_reopen_private.context(p_tournament_id))-'movementIds';
end $$;

create function public.reopen_tournament_points(p_tournament_id uuid,p_actor_id uuid,p_fingerprint text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare source jsonb; preview jsonb; receipt jsonb; row_data jsonb; previous jsonb; destination public.tournaments.status%type;
begin
  -- Same order as accreditation: global lock, tournament, children, players.
  perform pg_advisory_xact_lock_shared(41703,1);
  perform 1 from public.tournaments where id=p_tournament_id for update;
  perform tournament_points_private.assert_actor(p_tournament_id,p_actor_id);
  select result into receipt from tournament_reopen_private.receipts
    where tournament_id=p_tournament_id and fingerprint=p_fingerprint;
  if found then return receipt||jsonb_build_object('alreadyReopened',true); end if;
  perform 1 from public.matches where tournament_id=p_tournament_id order by id for update;
  source:=tournament_reopen_private.context(p_tournament_id);
  perform 1 from public.players where id in(select (v->>'id')::uuid from jsonb_array_elements(source->'players') v)
    order by id for update;
  perform 1 from public.player_tournament_history where player_id in(select (v->>'id')::uuid from jsonb_array_elements(source->'players') v)
    order by id for update;
  perform 1 from public.player_recategorizations where player_id in(select (v->>'id')::uuid from jsonb_array_elements(source->'players') v)
    order by id for update;
  source:=tournament_reopen_private.context(p_tournament_id);
  preview:=tournament_reopen_private.plan(source);
  if preview->>'fingerprint' is distinct from p_fingerprint then
    raise exception 'Los datos cambiaron. Volvé a revisar la reapertura.' using errcode='40001'; end if;
  if (preview->>'canReopen')::boolean is not true then
    raise exception 'No se puede reabrir: %',preview->'blockers'->>0 using errcode='22023'; end if;

  for row_data in select value from jsonb_array_elements(preview->'playerChanges') loop
    update public.players set category_name=row_data->>'categoryAfter'
      where id=(row_data->>'playerId')::uuid and category_name is distinct from row_data->>'categoryAfter';
    -- Exact rollback of this category transition also restores earlier weekly
    -- ranking history. The guard above rejects any intervening category epoch.
    -- The regular category trigger does not run on a revision-only update.
    update public.players set category_revision=(row_data->>'categoryRevisionAfter')::bigint,score=(row_data->>'pointsAfter')::numeric
      where id=(row_data->>'playerId')::uuid;
  end loop;
  delete from public.player_recategorizations where ranking_reverts_id is not null and preview->'movementIds' ? id::text;
  delete from public.player_recategorizations where preview->'movementIds' ? id::text;
  delete from public.match_points_couples mp using public.matches m where m.id=mp.match_id and m.tournament_id=p_tournament_id;
  delete from public.player_tournament_history where tournament_id=p_tournament_id;
  delete from public.tournament_points_settlements where tournament_id=p_tournament_id;

  previous:=source->'closure'->'previous';
  destination:=preview->>'statusAfter';
  perform set_config('american_free.tournament_id',p_tournament_id::text,true);
  update public.tournaments set status=destination,status_sort_value=null,
    winner_id=case when previous is not null then (previous->>'winner_id')::uuid end,
    end_date=case when previous is not null then (previous->>'end_date')::timestamptz else end_date end,
    format_config=case when previous is null then format_config
      when previous->'bonuses'='null'::jsonb then format_config-'bonuses'
      else jsonb_set(coalesce(format_config,'{}'::jsonb),'{bonuses}',previous->'bonuses') end
    where id=p_tournament_id;
  update public.american_free_brackets set revision=revision+1 where tournament_id=p_tournament_id;
  perform set_config('american_free.tournament_id','',true);
  delete from tournament_reopen_private.closures where tournament_id=p_tournament_id;
  receipt:=jsonb_build_object('preview',preview-'movementIds','alreadyReopened',false);
  insert into tournament_reopen_private.receipts(tournament_id,fingerprint,actor_id,original,result)
    values(p_tournament_id,p_fingerprint,p_actor_id,source,receipt);
  return receipt;
end $$;

revoke all on all functions in schema tournament_reopen_private from public,anon,authenticated;
grant execute on function tournament_reopen_private.context(uuid),tournament_reopen_private.plan(jsonb) to service_role;
revoke all on function public.preview_tournament_reopen(uuid,uuid),public.reopen_tournament_points(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.preview_tournament_reopen(uuid,uuid),public.reopen_tournament_points(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
