-- The runner loads these tests exclusively into its disposable local clone.
begin;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.sports(t text,r bigint,ops jsonb) returns jsonb language sql as $$
  select public.mutate_american_free_sports(american_free_test.fid(t),american_free_test.fid('owner'),r,ops)
$$;
create function pg_temp.op(k text,t text,r integer,i integer,a integer default null,b integer default null) returns jsonb language sql as $$
  select jsonb_build_object('kind',k,'matchId',american_free_test.mid(t,r,i),'score1',a,'score2',b)
$$;
insert into public.tournaments(id,club_id,name,type,status,category_name,gender,format_config)
  select american_free_test.fid(k),american_free_test.fid('club'),k,'AMERICAN','ZONE_PHASE','9na','MALE',
    '{"version":2,"presetId":"AMERICAN_MULTI_ZONE_FREE"}'::jsonb from unnest(array['sports-four','sports-bye','sports-direct','sports-dq']) k;
insert into public.zones(id,tournament_id,name)
  select american_free_test.fid(k||'-zone'),american_free_test.fid(k),'Zone reference' from unnest(array['sports-four','sports-bye','sports-direct','sports-dq']) k;
insert into public.inscriptions(tournament_id,couple_id,is_pending)
  select american_free_test.fid(k),american_free_test.fid('c'||i),false from unnest(array['sports-four','sports-bye','sports-direct','sports-dq']) k cross join generate_series(1,4) i;
insert into public.zone_positions(tournament_id,zone_id,couple_id,position)
  select american_free_test.fid(k),american_free_test.fid(k||'-zone'),american_free_test.fid('c'||i),i
  from unnest(array['sports-four','sports-bye','sports-direct','sports-dq']) k cross join generate_series(1,4) i;
set local role service_role;
select american_free_test.gen('sports-four',4,4);
select american_free_test.gen('sports-bye',4,3);
select american_free_test.gen('sports-direct',32,32);
select american_free_test.gen('sports-dq',4,4);
select american_free_test.save('sports-dq',0,american_free_test.put(american_free_test.put(american_free_test.layout('sports-dq'),american_free_test.mid('sports-dq',5,1),1,american_free_test.fid('c1')),american_free_test.mid('sports-dq',5,1),2,american_free_test.fid('c2')));
select american_free_test.save('sports-four',0,
  american_free_test.put(american_free_test.put(american_free_test.put(american_free_test.put(american_free_test.layout('sports-four'),
  american_free_test.mid('sports-four',5,1),1,american_free_test.fid('c1')),american_free_test.mid('sports-four',5,1),2,american_free_test.fid('c2')),
  american_free_test.mid('sports-four',5,2),1,american_free_test.fid('c3')),american_free_test.mid('sports-four',5,2),2,american_free_test.fid('c4')));
select american_free_test.save('sports-bye',0,
  american_free_test.put(american_free_test.put(american_free_test.layout('sports-bye'),american_free_test.mid('sports-bye',5,1),1,american_free_test.fid('c1')),
    american_free_test.mid('sports-bye',5,2),1,american_free_test.fid('c2')));

select ok(not has_function_privilege('authenticated','public.mutate_american_free_sports(uuid,uuid,bigint,jsonb,jsonb)','execute'),'browser cannot spoof sports actor');
select throws_ok($$select public.mutate_american_free_sports(american_free_test.fid('sports-four'),american_free_test.fid('stranger'),1,
  jsonb_build_array(pg_temp.op('RESULT','sports-four',5,1,6,3)))$$,'42501','Sin permisos sobre el torneo','server authorization repeated by database');
select throws_ok($$select pg_temp.sports('sports-bye',1,jsonb_build_array(pg_temp.op('PROCESS_BYE','sports-bye',5,2)))$$,
  '22023','El partido no tiene un pase previsto listo para procesar','one of two ENTRY participants is incomplete');
select throws_ok($$select pg_temp.sports('sports-bye',1,jsonb_build_array(pg_temp.op('PROCESS_BYE','sports-bye',6,1)))$$,
  '22023','El partido no tiene un pase previsto listo para procesar','pending WINNER is never a BYE');
select lives_ok($$select pg_temp.sports('sports-bye',1,jsonb_build_array(pg_temp.op('PROCESS_BYE','sports-bye',5,1)))$$,'process explicit BYE');
select is((select couple1_id from public.matches where id=american_free_test.mid('sports-bye',6,1)),american_free_test.fid('c1'),'BYE advances through correct parent_slot');
select is((select count(*) from public.set_matches where match_id=american_free_test.mid('sports-bye',5,1)),0::bigint,'BYE does not invent sets');
select lives_ok($$select pg_temp.sports('sports-bye',2,jsonb_build_array(pg_temp.op('UNDO_BYE','sports-bye',5,1)))$$,'undo actual BYE');
select is((select couple1_id from public.matches where id=american_free_test.mid('sports-bye',6,1)),null::uuid,'undo clears only its connection');
select throws_ok($$select pg_temp.sports('sports-bye',3,jsonb_build_array(pg_temp.op('UNDO_BYE','sports-bye',5,1)))$$,
  '22023','No hay un BYE realmente procesado para deshacer','second undo rejected');

select lives_ok($$select pg_temp.sports('sports-four',1,jsonb_build_array(pg_temp.op('RESULT','sports-four',5,1,6,2)))$$,'result, set, history and advance commit together');
select is((select couple1_id from public.matches where id=american_free_test.mid('sports-four',6,1)),american_free_test.fid('c1'),'winner uses correct connection');
select is((select count(*) from public.set_matches where match_id=american_free_test.mid('sports-four',5,1)),1::bigint,'one real set');
select is((select revision from public.american_free_brackets where tournament_id=american_free_test.fid('sports-four')),2::bigint,'result increments common revision');
select throws_ok($$select american_free_test.save('sports-four',1,american_free_test.layout('sports-four'))$$,
  '40001','La llave cambió. Recargá antes de guardar.','stale editor cannot overwrite sports');
select lives_ok($$select pg_temp.sports('sports-four',2,jsonb_build_array(pg_temp.op('RESULT','sports-four',5,1,2,6)))$$,'modify winner before later activity');
select is((select couple1_id from public.matches where id=american_free_test.mid('sports-four',6,1)),american_free_test.fid('c2'),'replacement follows original edge');
select lives_ok($$select pg_temp.sports('sports-four',3,jsonb_build_array(pg_temp.op('CLEAR_RESULT','sports-four',5,1)))$$,'revert result');
select is((select count(*) from public.set_matches where match_id=american_free_test.mid('sports-four',5,1)),0::bigint,'reversal removes real set');
select throws_ok($$select pg_temp.sports('sports-four',4,jsonb_build_array(pg_temp.op('RESULT','sports-four',5,1,6,2),pg_temp.op('UNDO_BYE','sports-four',5,2)))$$,
  '22023','No hay un BYE realmente procesado para deshacer','intermediate batch failure rolls everything back');
select is((select winner_id from public.matches where id=american_free_test.mid('sports-four',5,1)),null::uuid,'no partial winner after failed batch');
select is((select count(*) from public.set_matches where match_id=american_free_test.mid('sports-four',5,1)),0::bigint,'no partial set');
select is((select revision from public.american_free_brackets where tournament_id=american_free_test.fid('sports-four')),4::bigint,'no partial revision');
select lives_ok($$select pg_temp.sports('sports-four',4,jsonb_build_array(pg_temp.op('RESULT','sports-four',5,1,6,2),pg_temp.op('RESULT','sports-four',5,2,6,1)))$$,'both semifinals in one revision');
select lives_ok($$select pg_temp.sports('sports-four',5,jsonb_build_array(pg_temp.op('RESULT','sports-four',6,1,6,3)))$$,'final');
select throws_ok($$select pg_temp.sports('sports-four',6,jsonb_build_array(pg_temp.op('CLEAR_RESULT','sports-four',5,1)))$$,
  '22023','Hay actividad deportiva posterior. Revertí primero esos partidos.','later result protects winner');
select throws_ok($$select pg_temp.sports('sports-four',6,jsonb_build_array(pg_temp.op('RESULT','sports-four',5,1,1,6)))$$,
  '22023','Hay actividad deportiva posterior. Revertí primero esos partidos.','later result protects modification');

select american_free_test.save('sports-direct',0,american_free_test.put(american_free_test.layout('sports-direct'),american_free_test.mid('sports-direct',4,1),1,american_free_test.fid('c1')));
select is((select effective_capacity from public.american_free_brackets where tournament_id=american_free_test.fid('sports-direct')),29,'direct quarter entry capacity 29');
select throws_ok($$select pg_temp.sports('sports-direct',1,jsonb_build_array(pg_temp.op('PROCESS_BYE','sports-direct',3,1)))$$,
  '22023','Partido ajeno o rama inactiva','cannot process inactive branch');
select throws_ok($$select pg_temp.sports('sports-direct',1,jsonb_build_array(pg_temp.op('UNDO_BYE','sports-direct',4,1)))$$,
  '22023','No hay un BYE realmente procesado para deshacer','direct entry is not a fictitious victory');
select throws_ok($$select pg_temp.sports('sports-direct',1,jsonb_build_array(jsonb_build_object('kind','COURT','matchId',american_free_test.mid('sports-direct',3,1),'court','1')))$$,
  '22023','Partido ajeno o rama inactiva','cannot assign court to inactive branch');
select is((select count(*) from public.matches where tournament_id=american_free_test.fid('sports-direct') and status='FINISHED'),0::bigint,'direct entry never finishes inactive matches');
select is((select count(*) from public.match_results_history where tournament_id=american_free_test.fid('sports-direct')),0::bigint,'direct entry grants no sporting history');

select throws_ok($$update public.matches set winner_id=american_free_test.fid('c4') where id=american_free_test.mid('sports-four',6,1)$$,
  '42501','Americano libre requiere persistencia transaccional','legacy result writer remains blocked');
select lives_ok($$select public.finalize_american_free_bracket(american_free_test.fid('sports-four'),american_free_test.fid('owner'),6,
  '{"MAIN":{"enabled":true,"champion":10,"finalist":5}}')$$,'finish with valid champion and finalist');
select is((select winner_id from public.tournaments where id=american_free_test.fid('sports-four')),american_free_test.fid('c1'),'champion is actual final winner');
select throws_ok($$select public.finalize_american_free_bracket(american_free_test.fid('sports-direct'),american_free_test.fid('owner'),1,
  '{"MAIN":{"enabled":true,"champion":10,"finalist":5}}')$$,'22023','Quedan partidos activos o de zona sin finalizar','active pending matches still prevent finish');

select lives_ok($$select pg_temp.sports('sports-dq',1,jsonb_build_array(jsonb_build_object('kind','DISQUALIFY','matchId',american_free_test.mid('sports-dq',5,1),'coupleId',american_free_test.fid('c1'),'reason','Fixture')))$$,'disqualification and opponent advance commit together');
select is((select couple1_id from public.matches where id=american_free_test.mid('sports-dq',6,1)),american_free_test.fid('c2'),'opponent advances through actual hierarchy');
select is((select count(*) from public.tournament_couple_disqualifications where tournament_id=american_free_test.fid('sports-dq') and status='ACTIVE'),1::bigint,'one disqualification with evidence');
select lives_ok($$select american_free_test.save('sports-dq',2,american_free_test.layout('sports-dq'))$$,'completed disqualification preserves valid original ENTRY history');
select throws_ok($$update public.tournament_couple_disqualifications set status='REVERTED',reverted_at=now() where tournament_id=american_free_test.fid('sports-dq')$$,
  '42501','La descalificación LIBRE requiere persistencia transaccional','legacy disqualification reversal cannot bypass contract');
select lives_ok($$select pg_temp.sports('sports-dq',3,jsonb_build_array(pg_temp.op('CLEAR_RESULT','sports-dq',5,1)))$$,'reverse disqualification through result protocol');
select is((select count(*) from public.tournament_couple_disqualifications where tournament_id=american_free_test.fid('sports-dq') and status='ACTIVE'),0::bigint,'reversal leaves no active walkover');
select is((select is_eliminated from public.inscriptions where tournament_id=american_free_test.fid('sports-dq') and couple_id=american_free_test.fid('c1')),false,'reversal restores elimination flag');

-- Zone references are written with result/set/history/revision, never applied
-- to manual entries, even after BRACKET_PHASE has started.
insert into public.matches(id,tournament_id,zone_id,round,type,status,couple1_id,couple2_id)
 values(american_free_test.fid('sports-zone-match'),american_free_test.fid('sports-dq'),american_free_test.fid('sports-dq-zone'),'ZONE','ZONE','PENDING',american_free_test.fid('c1'),american_free_test.fid('c2'));
select throws_ok($$update public.matches set result_couple1='6',result_couple2='2',winner_id=american_free_test.fid('c1'),status='FINISHED' where id=american_free_test.fid('sports-zone-match')$$,
 '42501','Americano libre requiere persistencia transaccional','legacy zone result writer is blocked after bracket generation');
create function pg_temp.positions() returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('zone_id',american_free_test.fid('sports-dq-zone'),'couple_id',american_free_test.fid('c'||i),
   'position',i,'wins',case when i=1 then 1 else 0 end,'losses',case when i=2 then 1 else 0 end,
   'games_for',case when i=1 then 6 when i=2 then 2 else 0 end,'games_against',case when i=1 then 2 when i=2 then 6 else 0 end,
   'games_difference',case when i=1 then 4 when i=2 then -4 else 0 end,'points',case when i=1 then 1 when i=2 then -1 else 0 end,
   'player_score_total',222,'tie_info','Fixture','is_definitive',false)) from generate_series(1,4) i
$$;
select lives_ok($$select public.mutate_american_free_sports(american_free_test.fid('sports-dq'),american_free_test.fid('owner'),4,
 jsonb_build_array(jsonb_build_object('kind','RESULT','matchId',american_free_test.fid('sports-zone-match'),'score1',6,'score2',2)),pg_temp.positions())$$,'zone result and statistics commit in bracket phase');
select is((select wins||':'||games_difference from public.zone_positions where zone_id=american_free_test.fid('sports-dq-zone') and couple_id=american_free_test.fid('c1')),'1:4','PG and DG reflect zone result');
select is((select couple1_id from public.matches where id=american_free_test.mid('sports-dq',5,1)),american_free_test.fid('c1'),'zone positions never assign or move bracket entries');
select is((select requested_count||':'||base_size from public.american_free_brackets where tournament_id=american_free_test.fid('sports-dq')),'4:4','zone results preserve original quantity and base');
select throws_ok($$select public.finalize_american_free_bracket(american_free_test.fid('sports-dq'),american_free_test.fid('owner'),5,
 '{"MAIN":{"enabled":true,"champion":10,"finalist":5}}')$$,'22023','Quedan partidos activos o de zona sin finalizar','zone and active bracket requirements remain');

insert into public.tournament_fechas(id,tournament_id,fecha_number,name,round_type,bracket_key)
 values(american_free_test.fid('sports-fecha'),american_free_test.fid('sports-direct'),1,'Fixture date','16VOS','MAIN');
select lives_ok($$select pg_temp.sports('sports-direct',1,jsonb_build_array(jsonb_build_object('kind','SCHEDULE','matchId',american_free_test.mid('sports-direct',2,3),'fechaId',american_free_test.fid('sports-fecha'),'timeSlotId',null,'order',1)))$$,'active branch can be scheduled');
select throws_ok($$select pg_temp.sports('sports-direct',2,jsonb_build_array(jsonb_build_object('kind','SCHEDULE','matchId',american_free_test.mid('sports-direct',2,1),'fechaId',american_free_test.fid('sports-fecha'),'timeSlotId',null,'order',1)))$$,
 '22023','Partido ajeno o rama inactiva','inactive branch cannot be scheduled');
select is((select count(*) from public.fecha_matches where fecha_id=american_free_test.fid('sports-fecha')),1::bigint,'failed scheduling leaves previous agenda intact');


select throws_ok($$select american_free_test.save('sports-direct',2,american_free_test.put(american_free_test.layout('sports-direct'),american_free_test.mid('sports-direct',4,1),2,american_free_test.fid('c2')))$$,
 '22023','Una rama con participantes, agenda o actividad no se puede inactivar','editor preserves scheduled branches instead of deleting agenda');
select lives_ok($$select american_free_test.save('sports-direct',2,american_free_test.put(american_free_test.put(american_free_test.layout('sports-direct'),american_free_test.mid('sports-direct',4,1),1,null,'WINNER'),american_free_test.mid('sports-direct',3,1),1,american_free_test.fid('c1')))$$,'direct entry retreats to the chosen eighth slot');
select is((select effective_capacity from public.american_free_brackets where tournament_id=american_free_test.fid('sports-direct')),31,'retreat restores capacity 31 without sporting victories');
select is((select count(*) from public.matches where tournament_id=american_free_test.fid('sports-direct') and status='FINISHED'),0::bigint,'capacity 31 still has no fictitious finished match');
select is((select count(*) from public.fecha_matches where fecha_id=american_free_test.fid('sports-fecha')),1::bigint,'retreat preserves rival agenda');

select american_free_test.save('sports-bye',3,american_free_test.put(american_free_test.layout('sports-bye'),american_free_test.mid('sports-bye',5,2),2,american_free_test.fid('c3')));
select pg_temp.sports('sports-bye',4,jsonb_build_array(pg_temp.op('PROCESS_BYE','sports-bye',5,1)));
select pg_temp.sports('sports-bye',5,jsonb_build_array(pg_temp.op('RESULT','sports-bye',5,2,6,2)));
select pg_temp.sports('sports-bye',6,jsonb_build_array(pg_temp.op('RESULT','sports-bye',6,1,6,2)));
select throws_ok($$select pg_temp.sports('sports-bye',7,jsonb_build_array(pg_temp.op('UNDO_BYE','sports-bye',5,1)))$$,
 '22023','Hay actividad deportiva posterior. Revertí primero esos partidos.','processed BYE cannot be undone under a finished final');
select lives_ok($$select pg_temp.sports('sports-bye',7,jsonb_build_array(pg_temp.op('CLEAR_RESULT','sports-bye',6,1)))$$,'clear final before earlier BYE');
select lives_ok($$select pg_temp.sports('sports-bye',8,jsonb_build_array(pg_temp.op('UNDO_BYE','sports-bye',5,1)))$$,'reverted later history does not prevent legitimate BYE reversal');

-- Complete a tournament containing an entry directly in the final. The unused
-- semifinal remains WAITING_OPONENT, and is excluded by active sports consumers.
select american_free_test.save('sports-dq',5,american_free_test.put(american_free_test.layout('sports-dq'),american_free_test.mid('sports-dq',6,1),2,american_free_test.fid('c3')));
select pg_temp.sports('sports-dq',6,jsonb_build_array(pg_temp.op('RESULT','sports-dq',5,1,6,2)));
select pg_temp.sports('sports-dq',7,jsonb_build_array(pg_temp.op('RESULT','sports-dq',6,1,2,6)));
select lives_ok($$select public.finalize_american_free_bracket(american_free_test.fid('sports-dq'),american_free_test.fid('owner'),8,
 '{"MAIN":{"enabled":true,"champion":10,"finalist":5}}')$$,'close with completed zones and active final while unused semifinal remains unplayed');
select is((select winner_id from public.tournaments where id=american_free_test.fid('sports-dq')),american_free_test.fid('c3'),'direct entrant can become legitimate champion by winning the final');
select is((select status::text from public.matches where id=american_free_test.mid('sports-dq',5,2)),'WAITING_OPONENT','inactive branch is never marked FINISHED to close');
select is((select count(*) from public.matches where tournament_id=american_free_test.fid('sports-dq') and type='ELIMINATION' and status='FINISHED'),2::bigint,'direct entry creates only two genuinely played elimination matches');

select * from finish();
rollback;
