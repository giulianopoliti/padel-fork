begin;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.reset_free(t text,target text,r bigint,actor text default 'owner') returns jsonb language sql as $$
  select public.reset_american_free_tournament(american_free_test.fid(t),american_free_test.fid(actor),target,r)
$$;
select ok(not has_function_privilege('authenticated','public.reset_american_free_tournament(uuid,uuid,text,bigint)','execute'),'browser cannot reset or spoof actor');
set local role service_role;
select throws_ok($$select pg_temp.reset_free('sports-four','ZONE_PHASE',4,'stranger')$$,'42501','Sin permisos sobre el torneo','reset checks tournament ownership');
select throws_ok($$select pg_temp.reset_free('sports-four','ZONE_PHASE',3)$$,'40001','La llave cambió. Recargá antes de revertir.','stale reset cannot remove newer results');
select throws_ok($$select pg_temp.reset_free('sports-four','NOT_STARTED',4)$$,'40001','La fase del torneo cambió. Recargá antes de revertir.','cannot skip zone reset confirmation');
select throws_ok($$select pg_temp.reset_free('sports-four',null,4)$$,'40001','La fase del torneo cambió. Recargá antes de revertir.','null target is rejected');
-- Record all zone rows to prove the bracket reset preserves their statistics.
create temporary table zone_before as select * from public.zone_positions where tournament_id=american_free_test.fid('sports-four');
insert into public.tournament_fechas(id,tournament_id,fecha_number,round_type,name)
  values(american_free_test.fid('reset-bracket-date'),american_free_test.fid('sports-four'),1,'SEMIFINAL','Semifinal'),
        (american_free_test.fid('reset-zone-date'),american_free_test.fid('sports-four'),2,'ZONE','Zona');
insert into public.tournament_time_slots(id,fecha_id,date,start_time,end_time)
  values(american_free_test.fid('reset-slot'),american_free_test.fid('reset-bracket-date'),'2026-10-20','10:00','11:00');
select set_config('american_free.tournament_id',american_free_test.fid('sports-four')::text,true);
insert into public.fecha_matches(fecha_id,match_id,scheduled_time_slot_id)
  values(american_free_test.fid('reset-bracket-date'),american_free_test.mid('sports-four',5,1),american_free_test.fid('reset-slot'));
insert into public.bracket_operations_log(tournament_id,operation_type,source_match_id)
  values(american_free_test.fid('sports-four'),'SWAP_POSITIONS',american_free_test.mid('sports-four',5,1));
select set_config('american_free.tournament_id','',true);
-- An unexpected dependent failure must restore the entire bracket transaction.
reset role;
create function pg_temp.fail_reset() returns trigger language plpgsql as $$ begin raise exception 'fixture rollback'; end $$;
create trigger fixture_fail_reset before delete on public.tournament_couple_seeds for each row execute function pg_temp.fail_reset();
set local role service_role;
select throws_ok($$select pg_temp.reset_free('sports-four','ZONE_PHASE',4)$$,'P0001','fixture rollback','failed cleanup rolls back everything');
select is((select revision from public.american_free_brackets where tournament_id=american_free_test.fid('sports-four')),4::bigint,'metadata restored after rollback');
select is((select count(*) from public.matches where tournament_id=american_free_test.fid('sports-four') and type='ELIMINATION'),3::bigint,'all bracket matches restored');
reset role;
drop trigger fixture_fail_reset on public.tournament_couple_seeds;
set local role service_role;
select lives_ok($$select pg_temp.reset_free('sports-four','ZONE_PHASE',4)$$,'reset removes bracket with finished results');
select is((select status::text from public.tournaments where id=american_free_test.fid('sports-four')),'ZONE_PHASE','returns to zones');
select is((select count(*) from public.american_free_brackets where tournament_id=american_free_test.fid('sports-four')),0::bigint,'manual bracket metadata removed');
select is((select count(*) from public.matches where tournament_id=american_free_test.fid('sports-four') and type='ELIMINATION'),0::bigint,'all active and inactive bracket matches removed');
select is((select count(*) from public.match_hierarchy where tournament_id=american_free_test.fid('sports-four')),0::bigint,'original hierarchy removed');
select is((select count(*) from public.tournament_couple_seeds where tournament_id=american_free_test.fid('sports-four')),0::bigint,'all seeds removed');
select is((select count(*) from public.match_results_history where tournament_id=american_free_test.fid('sports-four')),0::bigint,'result history removed');
select is((select count(*) from public.bracket_operations_log where tournament_id=american_free_test.fid('sports-four')),0::bigint,'operation log removed');
select is((select count(*) from public.tournament_time_slots where id=american_free_test.fid('reset-slot')),0::bigint,'bracket calendar and slots removed');
select is((select count(*) from public.tournament_fechas where id=american_free_test.fid('reset-zone-date')),1::bigint,'zone calendar preserved');
select results_eq('select * from public.zone_positions where tournament_id=american_free_test.fid(''sports-four'') order by id','select * from zone_before order by id','zone references preserved exactly');
select lives_ok($$select american_free_test.gen('sports-four',4,4)$$,'bracket can be generated again after reset');
select lives_ok($$select pg_temp.reset_free('sports-four','ZONE_PHASE',0)$$,'new empty bracket resets cleanly');
-- Zone-only reset also succeeds when there are no zones; it must change status.
select lives_ok($$select pg_temp.reset_free('sports-four','NOT_STARTED',null)$$,'zone reset removes all phase data');
select is((select status::text from public.tournaments where id=american_free_test.fid('sports-four')),'NOT_STARTED','tournament not started');
select is((select count(*) from public.zones where tournament_id=american_free_test.fid('sports-four')),0::bigint,'zones removed');
select is((select count(*) from public.zone_positions where tournament_id=american_free_test.fid('sports-four')),0::bigint,'standings removed');
select is((select count(*) from public.matches where tournament_id=american_free_test.fid('sports-four')),0::bigint,'all matches removed');
select is((select count(*) from public.tournament_fechas where tournament_id=american_free_test.fid('sports-four')),0::bigint,'all dates removed');
select is((select count(*) from public.inscriptions where tournament_id=american_free_test.fid('sports-four')),4::bigint,'registrations preserved');
select is((select bracket_status::text from public.tournaments where id=american_free_test.fid('sports-four')),'NOT_STARTED','bracket generation flags cleared');
select is((select count(*) from public.matches where tournament_id=american_free_test.fid('sports-bye')),3::bigint,'other tournaments untouched');
select lives_ok($$select pg_temp.reset_free('sports-bye','ZONE_PHASE',3)$$,'processed and undone BYEs can be reset');
select lives_ok($$select pg_temp.reset_free('sports-bye','NOT_STARTED',null)$$,'zone reset works after BYEs');
insert into public.tournaments(id,club_id,name,type,status,format_config)
  values(american_free_test.fid('reset-empty'),american_free_test.fid('club'),'Empty free','AMERICAN','ZONE_PHASE','{"version":2,"presetId":"AMERICAN_SINGLE_ZONE_FREE"}');
select lives_ok($$select pg_temp.reset_free('reset-empty','NOT_STARTED',null)$$,'empty zone phase still resets');
select is((select status::text from public.tournaments where id=american_free_test.fid('reset-empty')),'NOT_STARTED','empty tournament state updated');
-- Direct entries can deactivate original branches. A reset must remove those too.
select american_free_test.save('sports-direct',0,american_free_test.put(american_free_test.layout('sports-direct'),american_free_test.mid('sports-direct',5,1),1,american_free_test.fid('c1')));
select ok(exists(select 1 from public.matches where tournament_id=american_free_test.fid('sports-direct') and not bracket_is_active),'fixture includes inactive descendants');
select lives_ok($$select pg_temp.reset_free('sports-direct','ZONE_PHASE',1)$$,'reset handles inactive descendants and direct entries');
select is((select count(*) from public.matches where tournament_id=american_free_test.fid('sports-direct')),0::bigint,'no inactive matches survive reset');
select public.mutate_american_free_sports(american_free_test.fid('sports-dq'),american_free_test.fid('owner'),1,
  jsonb_build_array(jsonb_build_object('kind','DISQUALIFY','matchId',american_free_test.mid('sports-dq',5,1),'coupleId',american_free_test.fid('c1'),'reason','Reset fixture')));
select lives_ok($$select pg_temp.reset_free('sports-dq','ZONE_PHASE',2)$$,'reset removes sporting disqualifications');
select is((select count(*) from public.tournament_couple_disqualifications where tournament_id=american_free_test.fid('sports-dq')),0::bigint,'no bracket disqualification survives reset');
select is((select is_eliminated from public.inscriptions where tournament_id=american_free_test.fid('sports-dq') and couple_id=american_free_test.fid('c1')),false,'disqualified registration restored');
select * from finish();
rollback;
