-- Prepared locally only. Deployment belongs to the repository owner.
-- All sports operations serialize with the layout writer from phase one.
create function american_free_private.lock_sports(p_id uuid,p_actor uuid,p_revision bigint) returns void
language plpgsql security invoker set search_path='' as $$
declare r bigint;
begin
  perform american_free_private.lock_tournament(p_id,p_actor);
  select revision into r from public.american_free_brackets where tournament_id=p_id for update;
  if not found or p_revision is distinct from r then
    raise exception 'La llave cambió. Recargá antes de guardar.' using errcode='40001';
  end if;
  if (select status::text from public.tournaments where id=p_id)<>'BRACKET_PHASE' then
    raise exception 'La operación requiere fase de llaves' using errcode='22023';
  end if;
  perform 1 from public.matches where tournament_id=p_id order by id for update;
  perform 1 from public.match_hierarchy where tournament_id=p_id order by id for update;
  perform 1 from public.tournament_couple_seeds where tournament_id=p_id order by id for update;
  -- Existing membership/billing writers acquire their row before the phase-one
  -- tournament trigger. Never wait on those rows while holding the tournament:
  -- fail as an explicit conflict instead of completing a deadlock cycle.
  begin
    perform 1 from public.zone_positions zp join public.zones z on z.id=zp.zone_id
      where z.tournament_id=p_id order by zp.id for update of zp nowait;
    perform 1 from public.inscriptions where tournament_id=p_id order by id for update nowait;
    perform 1 from public.tournament_couple_disqualifications where tournament_id=p_id order by id for update nowait;
  exception when lock_not_available then
    raise exception 'La pertenencia o inscripción está cambiando. Recargá antes de guardar.' using errcode='40001';
  end;
  perform set_config('american_free.tournament_id',p_id::text,true);
end $$;

-- Also guard zone sports once the manual bracket exists. Legacy zone creation
-- remains available; results/sets/history cannot bypass the sports transaction.
create function american_free_private.guard_sports() returns trigger
language plpgsql security definer set search_path='' as $$
declare tid uuid; mid uuid; protected boolean:=true;
begin
  if TG_TABLE_NAME='matches' then
    tid:=coalesce(NEW.tournament_id,OLD.tournament_id);
    if TG_OP='UPDATE' and OLD.tournament_id is distinct from NEW.tournament_id
      and exists(select 1 from public.american_free_brackets where tournament_id in (OLD.tournament_id,NEW.tournament_id)) then
      raise exception 'No se puede trasladar un partido LIBRE a otro torneo' using errcode='22023'; end if;
    if TG_OP='UPDATE' then
      protected:=(NEW.status,NEW.winner_id,NEW.result_couple1,NEW.result_couple2,NEW.court,NEW.couple1_id,NEW.couple2_id)
        is distinct from (OLD.status,OLD.winner_id,OLD.result_couple1,OLD.result_couple2,OLD.court,OLD.couple1_id,OLD.couple2_id);
    elsif TG_OP='INSERT' then
      protected:=NEW.winner_id is not null or NEW.result_couple1 is not null or NEW.result_couple2 is not null
        or NEW.status::text in ('IN_PROGRESS','FINISHED');
    end if;
  else
    mid:=case when TG_OP='DELETE' then OLD.match_id else NEW.match_id end;
    select tournament_id into tid from public.matches where id=mid;
    if TG_OP='UPDATE' and NEW.match_id is distinct from OLD.match_id then
      if exists(select 1 from public.matches m join public.american_free_brackets b on b.tournament_id=m.tournament_id
        where m.id=OLD.match_id) then raise exception 'No se puede trasladar evidencia deportiva LIBRE' using errcode='42501'; end if;
    end if;
  end if;
  if protected and exists(select 1 from public.american_free_brackets where tournament_id=tid) and (
    coalesce(current_setting('american_free.tournament_id',true),'')<>tid::text
    or current_setting('role',true) not in ('service_role','postgres','supabase_admin')) then
    raise exception 'Americano libre requiere persistencia transaccional' using errcode='42501';
  end if;
  if TG_TABLE_NAME='fecha_matches' and TG_OP<>'DELETE' and exists(
    select 1 from public.matches where id=mid and not bracket_is_active) then
    raise exception 'No se puede agendar una rama inactiva' using errcode='22023';
  end if;
  return coalesce(NEW,OLD);
end $$;
create trigger american_free_zone_sports_guard before insert or update or delete on public.matches
  for each row execute function american_free_private.guard_sports();
create trigger american_free_zone_sets_guard before insert or update or delete on public.set_matches
  for each row execute function american_free_private.guard_sports();
create trigger american_free_zone_history_guard before insert or update or delete on public.match_results_history
  for each row execute function american_free_private.guard_sports();
do $$ begin
  if to_regclass('public.match_sets') is not null then
    execute 'create trigger american_free_old_sets_guard before insert or update or delete on public.match_sets for each row execute function american_free_private.guard_sports()';
  end if;
end $$;
create trigger american_free_zone_agenda_guard before insert or update or delete on public.fecha_matches
  for each row execute function american_free_private.guard_sports();

create function american_free_private.guard_finish() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.american_free_brackets where tournament_id=OLD.id) and (
    (OLD.status::text='BRACKET_PHASE' and NEW.status is distinct from OLD.status)
    or (OLD.status::text in ('BRACKET_PHASE','FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED') and NEW.winner_id is distinct from OLD.winner_id)
    or (OLD.status::text in ('FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED') and NEW.status::text in ('ZONE_PHASE','BRACKET_PHASE'))
  ) and coalesce(current_setting('american_free.tournament_id',true),'')<>OLD.id::text then
    raise exception 'El cierre LIBRE requiere persistencia transaccional' using errcode='42501'; end if;
  return NEW;
end $$;
create trigger american_free_finish_guard before update of status,winner_id on public.tournaments
  for each row execute function american_free_private.guard_finish();

create function american_free_private.guard_disqualification() returns trigger
language plpgsql security definer set search_path='' as $$
declare tid uuid; old_tid uuid;
begin
  if TG_OP<>'INSERT' then old_tid:=OLD.tournament_id; end if;
  tid:=case when TG_OP='DELETE' then OLD.tournament_id else NEW.tournament_id end;
  if exists(select 1 from public.american_free_brackets where tournament_id in (tid,old_tid)) and (
    coalesce(current_setting('american_free.tournament_id',true),'')<>tid::text
    or current_setting('role',true) not in ('service_role','postgres','supabase_admin') or old_tid is distinct from tid and old_tid is not null) then
    raise exception 'La descalificación LIBRE requiere persistencia transaccional' using errcode='42501'; end if;
  return coalesce(NEW,OLD);
end $$;
create trigger american_free_disqualification_sports_guard before insert or update or delete on public.tournament_couple_disqualifications
  for each row execute function american_free_private.guard_disqualification();

-- Any change of winner or reversal must preserve every later sporting result.
create function american_free_private.assert_no_later_activity(p_id uuid,p_match uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if exists(with recursive ancestors as (
    select h.parent_match_id id from public.match_hierarchy h join public.matches p on p.id=h.parent_match_id
      where h.tournament_id=p_id and h.child_match_id=p_match and p.bracket_is_active
      and case when h.parent_slot=1 then p.free_slot1_origin else p.free_slot2_origin end='WINNER'
    union select h.parent_match_id from ancestors a join public.match_hierarchy h on h.child_match_id=a.id
      join public.matches p on p.id=h.parent_match_id where h.tournament_id=p_id and p.bracket_is_active
      and case when h.parent_slot=1 then p.free_slot1_origin else p.free_slot2_origin end='WINNER'
  ) select 1 from ancestors a join public.matches m on m.id=a.id where
    m.status::text in ('IN_PROGRESS','FINISHED') or m.winner_id is not null or m.free_bye_processed
    or m.result_couple1 is not null or m.result_couple2 is not null
    or exists(select 1 from public.set_matches where match_id=m.id)
    or exists(select 1 from public.match_results_history where match_id=m.id and is_current and operation_type<>'ASSIGN_COURT'
      and coalesce(operation_metadata->>'free_operation','') not in ('CLEAR_RESULT','UNDO_BYE'))) then
    raise exception 'Hay actividad deportiva posterior. Revertí primero esos partidos.' using errcode='22023';
  end if;
end $$;

create function american_free_private.advance(p_id uuid,p_match uuid,p_old uuid,p_winner uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare h record; parent public.matches%rowtype; origin text; occupant uuid; sid uuid;
begin
  for h in select * from public.match_hierarchy where tournament_id=p_id and child_match_id=p_match loop
    select * into strict parent from public.matches where id=h.parent_match_id;
    origin:=case when h.parent_slot=1 then parent.free_slot1_origin else parent.free_slot2_origin end;
    occupant:=case when h.parent_slot=1 then parent.couple1_id else parent.couple2_id end;
    if not parent.bracket_is_active or origin<>'WINNER' then
      raise exception 'La conexión del ganador no está activa' using errcode='22023'; end if;
    if occupant is distinct from p_old then
      raise exception 'El destino del ganador está ocupado o es incoherente' using errcode='22023'; end if;
    select id into sid from public.tournament_couple_seeds where tournament_id=p_id and bracket_key='MAIN' and couple_id=p_winner;
    if p_winner is not null and sid is null then raise exception 'Falta el seed del ganador' using errcode='22023'; end if;
    update public.matches set
      couple1_id=case when h.parent_slot=1 then p_winner else couple1_id end,
      couple2_id=case when h.parent_slot=2 then p_winner else couple2_id end,
      tournament_couple_seed1_id=case when h.parent_slot=1 then sid else tournament_couple_seed1_id end,
      tournament_couple_seed2_id=case when h.parent_slot=2 then sid else tournament_couple_seed2_id end
      where id=parent.id;
    update public.matches set status=case when couple1_id is not null and couple2_id is not null then 'PENDING'::public.match_status
      else 'WAITING_OPONENT'::public.match_status end where id=parent.id and status::text not in ('FINISHED','IN_PROGRESS');
  end loop;
end $$;

create function public.mutate_american_free_sports(p_tournament_id uuid,p_actor_id uuid,p_expected_revision bigint,p_operations jsonb,p_zone_positions jsonb default '[]')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op jsonb; kind text; m public.matches%rowtype; wid uuid; loser uuid; s1 integer; s2 integer;
  entry uuid; history_id uuid; zone uuid; pos jsonb; schedule jsonb;
begin
  perform american_free_private.lock_sports(p_tournament_id,p_actor_id,p_expected_revision);
  perform american_free_private.project(p_tournament_id);
  if jsonb_typeof(p_operations) is distinct from 'array' or jsonb_array_length(p_operations) not between 1 and 63 then
    raise exception 'Lote deportivo inválido' using errcode='22023'; end if;
  for op in select value from jsonb_array_elements(p_operations) loop
    kind:=op->>'kind';
    select * into m from public.matches where id=(op->>'matchId')::uuid and tournament_id=p_tournament_id;
    if not found or not m.bracket_is_active then raise exception 'Partido ajeno o rama inactiva' using errcode='22023'; end if;
    if m.status::text not in ('PENDING','WAITING_OPONENT','IN_PROGRESS','FINISHED') then
      raise exception 'El estado del partido no admite esta operación deportiva' using errcode='22023'; end if;
    if kind in ('RESULT','CLEAR_RESULT','PROCESS_BYE','UNDO_BYE','DISQUALIFY') then
      if kind='PROCESS_BYE' then
        if m.type::text<>'ELIMINATION' or m.status::text in ('IN_PROGRESS','FINISHED') or m.winner_id is not null
          or m.free_bye_processed or m.result_couple1 is not null or m.result_couple2 is not null
          or exists(select 1 from public.set_matches where match_id=m.id)
          or not ((m.free_slot1_origin='BYE' and m.couple1_id is null and m.couple2_id is not null)
            or (m.free_slot2_origin='BYE' and m.couple2_id is null and m.couple1_id is not null)) then
          raise exception 'El partido no tiene un pase previsto listo para procesar' using errcode='22023'; end if;
        wid:=coalesce(m.couple1_id,m.couple2_id); s1:=null; s2:=null;
      elsif kind='UNDO_BYE' then
        if m.type::text<>'ELIMINATION' or not m.free_bye_processed or m.status::text<>'FINISHED' or m.winner_id is null
          or m.winner_id is distinct from coalesce(m.couple1_id,m.couple2_id)
          or not ((m.free_slot1_origin='BYE' and m.couple1_id is null and m.couple2_id is not null)
            or (m.free_slot2_origin='BYE' and m.couple2_id is null and m.couple1_id is not null))
          or not exists(select 1 from public.match_results_history where match_id=m.id and is_current
            and operation_metadata->>'free_operation'='PROCESS_BYE' and new_winner_id=m.winner_id)
          or m.result_couple1 is not null or m.result_couple2 is not null
          or exists(select 1 from public.set_matches where match_id=m.id) then
          raise exception 'No hay un BYE realmente procesado para deshacer' using errcode='22023'; end if;
        wid:=null; s1:=null; s2:=null;
      elsif kind='CLEAR_RESULT' then
        if m.free_bye_processed or m.status::text<>'FINISHED' or m.winner_id is null then
          raise exception 'No hay un resultado deportivo para revertir' using errcode='22023'; end if;
        wid:=null; s1:=null; s2:=null;
      else
        if m.free_bye_processed or m.couple1_id is null or m.couple2_id is null or m.couple1_id=m.couple2_id then
          raise exception 'El partido requiere dos participantes habilitados' using errcode='22023'; end if;
        if kind='DISQUALIFY' then
          if m.type::text<>'ELIMINATION' or m.status::text='FINISHED' then
            raise exception 'La descalificación requiere un partido de llave sin finalizar' using errcode='22023'; end if;
          loser:=(op->>'coupleId')::uuid;
          if loser is null or loser not in (m.couple1_id,m.couple2_id) then raise exception 'La pareja no participa' using errcode='22023'; end if;
          wid:=case when loser=m.couple1_id then m.couple2_id else m.couple1_id end;
          s1:=null; s2:=null;
        else
          s1:=(op->>'score1')::integer; s2:=(op->>'score2')::integer;
          if s1 is null or s2 is null or s1 not between 0 and 99 or s2 not between 0 and 99 or s1=s2 then
            raise exception 'Resultado de set inválido' using errcode='22023'; end if;
          wid:=case when s1>s2 then m.couple1_id else m.couple2_id end;
        end if;
      end if;
      if wid is not null and exists(select 1 from public.tournament_couple_disqualifications
        where tournament_id=p_tournament_id and couple_id=wid and status='ACTIVE'
          and not (kind='RESULT' and match_id=m.id)) then
        raise exception 'El ganador está descalificado' using errcode='22023'; end if;
      if wid is distinct from m.winner_id then perform american_free_private.assert_no_later_activity(p_tournament_id,m.id); end if;
      -- Revert a walkover before updating its result. No lingering disqualification.
      if kind in ('CLEAR_RESULT','RESULT') then
        update public.tournament_couple_disqualifications set status='REVERTED',reverted_at=now(),reverted_by=p_actor_id
          where tournament_id=p_tournament_id and match_id=m.id and status='ACTIVE';
      end if;
      if kind='DISQUALIFY' then
        insert into public.tournament_couple_disqualifications(tournament_id,couple_id,player1_id,player2_id,phase,round,match_id,reason,disqualified_by,metadata)
          select p_tournament_id,id,player1_id,player2_id,'BRACKET_PHASE',m.round,m.id,left(op->>'reason',1000),p_actor_id,
            jsonb_build_object('free_contract',1) from public.couples where id=loser;
      end if;
      delete from public.set_matches where match_id=m.id;
      if kind='RESULT' then
        insert into public.set_matches(match_id,set_number,couple1_games,couple2_games,winner_couple_id)
          values(m.id,1,s1,s2,wid);
      end if;
      update public.match_results_history set is_current=false where match_id=m.id and is_current;
      update public.matches set winner_id=wid,result_couple1=s1::text,result_couple2=s2::text,
        free_bye_processed=(kind='PROCESS_BYE'),status=case when wid is not null then 'FINISHED'::public.match_status
          when m.couple1_id is not null and m.couple2_id is not null then 'PENDING'::public.match_status else 'WAITING_OPONENT'::public.match_status end
        where id=m.id;
      insert into public.match_results_history(match_id,tournament_id,user_id,operation_type,result_data,previous_status,new_status,
        previous_winner_id,new_winner_id,operation_metadata)
        values(m.id,p_tournament_id,p_actor_id,'MODIFY_RESULT',jsonb_build_object('score1',s1,'score2',s2),m.status::text,
          case when wid is null then 'PENDING' else 'FINISHED' end,m.winner_id,wid,
          jsonb_build_object('free_operation',kind,'revision',p_expected_revision+1));
      if m.type::text='ELIMINATION' and wid is distinct from m.winner_id then
        perform american_free_private.advance(p_tournament_id,m.id,m.winner_id,wid);
      end if;
    elsif kind='COURT' then
      if m.status::text='FINISHED' then raise exception 'El partido ya finalizó' using errcode='22023'; end if;
      if coalesce((op->>'start')::boolean,false) and (m.couple1_id is null or m.couple2_id is null) then
        raise exception 'Faltan participantes para iniciar el partido' using errcode='22023'; end if;
      update public.matches set court=nullif(left(op->>'court',100),''),status=case
        when coalesce((op->>'start')::boolean,false) then 'IN_PROGRESS'::public.match_status else status end where id=m.id;
    elsif kind='SCHEDULE' then
      if m.status::text in ('FINISHED','IN_PROGRESS') then raise exception 'No se puede reagendar un partido iniciado' using errcode='22023'; end if;
      if op->>'fechaId' is null then delete from public.fecha_matches where match_id=m.id;
      else
        if not exists(select 1 from public.tournament_fechas where id=(op->>'fechaId')::uuid and tournament_id=p_tournament_id
            and round_type::text=m.round::text and (m.round::text='ZONE' or coalesce(bracket_key,'MAIN')=coalesce(m.bracket_key,'MAIN')))
          or (op->>'timeSlotId' is not null and not exists(select 1 from public.tournament_time_slots
            where id=(op->>'timeSlotId')::uuid and fecha_id=(op->>'fechaId')::uuid and is_available)) then
          raise exception 'La fecha u horario no pertenece al torneo' using errcode='22023'; end if;
        select to_jsonb(ts) into schedule from public.tournament_time_slots ts where id=(op->>'timeSlotId')::uuid;
        insert into public.fecha_matches(match_id,fecha_id,scheduled_time_slot_id,match_order,scheduled_date,scheduled_start_time,scheduled_end_time,court_assignment)
          values(m.id,(op->>'fechaId')::uuid,(op->>'timeSlotId')::uuid,(op->>'order')::integer,
            (schedule->>'date')::date,(schedule->>'start_time')::time,(schedule->>'end_time')::time,coalesce(schedule->>'court_name',m.court))
          on conflict(match_id) do update set fecha_id=excluded.fecha_id,scheduled_time_slot_id=excluded.scheduled_time_slot_id,match_order=excluded.match_order,
            scheduled_date=excluded.scheduled_date,scheduled_start_time=excluded.scheduled_start_time,scheduled_end_time=excluded.scheduled_end_time,court_assignment=excluded.court_assignment;
      end if;
    else raise exception 'Operación deportiva desconocida' using errcode='22023'; end if;
  end loop;
  -- Server computes rankings with the existing American ranking engine from
  -- the revision being committed. Membership is checked again under the lock.
  for zone in select distinct zone_id from public.matches where tournament_id=p_tournament_id and id in (
    select (value->>'matchId')::uuid from jsonb_array_elements(p_operations) where value->>'kind' in ('RESULT','CLEAR_RESULT')) and zone_id is not null loop
    if (select count(*) from jsonb_array_elements(p_zone_positions) x where (x->>'zone_id')::uuid=zone)
      <> (select count(*) from public.zone_positions where zone_id=zone) then
      raise exception 'Faltan posiciones de referencia de zona' using errcode='22023'; end if;
    for pos in select value from jsonb_array_elements(p_zone_positions) where (value->>'zone_id')::uuid=zone loop
      update public.zone_positions set position=(pos->>'position')::integer,wins=(pos->>'wins')::integer,
        losses=(pos->>'losses')::integer,games_for=(pos->>'games_for')::integer,games_against=(pos->>'games_against')::integer,
        games_difference=(pos->>'games_difference')::integer,points=(pos->>'points')::integer,
        player_score_total=(pos->>'player_score_total')::integer,tie_info=pos->>'tie_info',
        is_definitive=(pos->>'is_definitive')::boolean,calculated_at=now()
        where zone_id=zone and couple_id=(pos->>'couple_id')::uuid;
      if not found then raise exception 'La pertenencia de zona cambió. Recargá.' using errcode='40001'; end if;
    end loop;
  end loop;
  perform american_free_private.project(p_tournament_id);
  -- Persist elimination flags with the same outcome. A direct placement never
  -- participates in this query because it has no finished match or winner.
  update public.inscriptions i set is_eliminated=(lost.round is not null),
    eliminated_at=case when lost.round is not null then coalesce(i.eliminated_at,now()) else null end,
    eliminated_in_round=lost.round
    from (select i2.id,(select lm.round from public.matches lm where lm.tournament_id=p_tournament_id
      and lm.type='ELIMINATION' and lm.bracket_is_active and lm.status='FINISHED' and lm.winner_id is not null
      and i2.couple_id in (lm.couple1_id,lm.couple2_id) and i2.couple_id<>lm.winner_id limit 1) round
      from public.inscriptions i2 where i2.tournament_id=p_tournament_id and i2.couple_id is not null) lost where i.id=lost.id;
  update public.american_free_brackets set revision=revision+1 where tournament_id=p_tournament_id;
  perform set_config('american_free.tournament_id','',true);
  return american_free_private.snapshot(p_tournament_id);
end $$;

revoke all on function american_free_private.lock_sports(uuid,uuid,bigint),american_free_private.guard_sports(),
  american_free_private.assert_no_later_activity(uuid,uuid),american_free_private.advance(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function american_free_private.lock_sports(uuid,uuid,bigint),american_free_private.assert_no_later_activity(uuid,uuid),
  american_free_private.advance(uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.mutate_american_free_sports(uuid,uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_american_free_sports(uuid,uuid,bigint,jsonb,jsonb) to service_role;

create function public.finalize_american_free_bracket(p_tournament_id uuid,p_actor_id uuid,p_expected_revision bigint,p_bonuses jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare final_match public.matches%rowtype;
begin
  perform american_free_private.lock_sports(p_tournament_id,p_actor_id,p_expected_revision);
  perform american_free_private.project(p_tournament_id);
  if exists(select 1 from public.matches where tournament_id=p_tournament_id and bracket_is_active and
    (status::text is distinct from 'FINISHED' or winner_id is null)) then
    raise exception 'Quedan partidos activos o de zona sin finalizar' using errcode='22023'; end if;
  select * into strict final_match from public.matches where tournament_id=p_tournament_id and type='ELIMINATION' and round::text='FINAL' and bracket_is_active;
  if final_match.winner_id is null or final_match.couple1_id is null or final_match.couple2_id is null
    or final_match.winner_id not in (final_match.couple1_id,final_match.couple2_id) then
    raise exception 'La final debe tener campeón y finalista válidos' using errcode='22023'; end if;
  if jsonb_typeof(p_bonuses) is distinct from 'object' or jsonb_typeof(p_bonuses->'MAIN'->'enabled') is distinct from 'boolean'
    or (p_bonuses->'MAIN'->>'champion')::integer not between 0 and 10000
    or (p_bonuses->'MAIN'->>'finalist')::integer not between 0 and 10000
    or p_bonuses->'MAIN'->>'champion' is null or p_bonuses->'MAIN'->>'finalist' is null then
    raise exception 'Bonos inválidos' using errcode='22023'; end if;
  update public.tournaments set status='FINISHED_POINTS_PENDING',status_sort_value=null,winner_id=final_match.winner_id,end_date=now(),
    format_config=format_config||jsonb_build_object('bonuses',p_bonuses) where id=p_tournament_id;
  update public.american_free_brackets set revision=revision+1 where tournament_id=p_tournament_id;
  perform set_config('american_free.tournament_id','',true);
  return american_free_private.snapshot(p_tournament_id);
end $$;
revoke all on function american_free_private.guard_finish(),american_free_private.guard_disqualification(),public.finalize_american_free_bracket(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_american_free_bracket(uuid,uuid,bigint,jsonb) to service_role;

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


create or replace function american_free_private.snapshot(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(b)||jsonb_build_object(
    'matches',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'round',m.round,'order_in_round',m.order_in_round,'bracket_is_active',m.bracket_is_active,
      'slot1_origin',m.free_slot1_origin,'slot2_origin',m.free_slot2_origin,
      'couple1_id',m.couple1_id,'couple2_id',m.couple2_id,
      'seed1_id',m.tournament_couple_seed1_id,'seed2_id',m.tournament_couple_seed2_id,
      'score1',m.result_couple1,'score2',m.result_couple2,'court',m.court,'status',m.status,'winner_id',m.winner_id,'bye_processed',m.free_bye_processed) order by m.id),'[]'::jsonb)
      from public.matches m where m.tournament_id=p_id and m.type='ELIMINATION'),
    'hierarchy',(select coalesce(jsonb_agg(jsonb_build_object('parent_match_id',h.parent_match_id,
      'child_match_id',h.child_match_id,'parent_slot',h.parent_slot) order by h.id),'[]'::jsonb)
      from public.match_hierarchy h where h.tournament_id=p_id))
  from public.american_free_brackets b where b.tournament_id=p_id
$$;
