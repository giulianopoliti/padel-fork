begin;
set local search_path=public,extensions;
select no_plan();
select ok(not has_function_privilege('authenticated','public.process_american_free_bye(uuid,uuid,bigint,uuid)','execute'),'browser cannot spoof the actor');
set local role service_role;
select throws_ok($$select public.process_american_free_bye(american_free_test.fid('sports-bye'),american_free_test.fid('stranger'),1,american_free_test.mid('sports-bye',5,2))$$,
 '42501','Sin permisos sobre el torneo','management is checked inside the transaction');
select throws_ok($$select public.process_american_free_bye(american_free_test.fid('sports-bye'),american_free_test.fid('owner'),0,american_free_test.mid('sports-bye',5,2))$$,
 '40001','La llave cambió. Recargá antes de guardar.','stale revisions cannot assign a BYE');
select throws_ok($$select public.process_american_free_bye(american_free_test.fid('sports-four'),american_free_test.fid('owner'),1,american_free_test.mid('sports-four',5,1))$$,
 '22023','El BYE requiere una única pareja y un partido sin actividad','two participants cannot be replaced by a BYE');
reset role;
create function pg_temp.fail_direct_bye() returns trigger language plpgsql as $$ begin raise exception 'simulated history failure'; end $$;
create trigger fail_direct_bye before insert on public.match_results_history for each row execute function pg_temp.fail_direct_bye();
set local role service_role;
select throws_ok($$select public.process_american_free_bye(american_free_test.fid('sports-bye'),american_free_test.fid('owner'),1,american_free_test.mid('sports-bye',5,2))$$,
 'P0001','simulated history failure','advancement failure rolls back the assignment');
select is((select free_slot2_origin from public.matches where id=american_free_test.mid('sports-bye',5,2)),'ENTRY','empty entry restored on failure');
select is((select revision from public.american_free_brackets where tournament_id=american_free_test.fid('sports-bye')),1::bigint,'failed operation preserves revision');
reset role;
drop trigger fail_direct_bye on public.match_results_history;
set local role service_role;
select lives_ok($$select public.process_american_free_bye(american_free_test.fid('sports-bye'),american_free_test.fid('owner'),1,american_free_test.mid('sports-bye',5,2))$$,'assigns and processes an empty entry in one request');
select is((select free_slot2_origin from public.matches where id=american_free_test.mid('sports-bye',5,2)),'BYE','empty entry becomes a free pass');
select is((select winner_id from public.matches where id=american_free_test.mid('sports-bye',5,2)),american_free_test.fid('c2'),'single participant wins by BYE');
select is((select couple2_id from public.matches where id=american_free_test.mid('sports-bye',6,1)),american_free_test.fid('c2'),'advances through the correct hierarchy slot');
select is((select revision from public.american_free_brackets where tournament_id=american_free_test.fid('sports-bye')),3::bigint,'both internal writes commit together');
select is((select count(*) from public.set_matches where match_id=american_free_test.mid('sports-bye',5,2)),0::bigint,'no artificial set is created');
select throws_ok($$select public.process_american_free_bye(american_free_test.fid('sports-bye'),american_free_test.fid('owner'),3,american_free_test.mid('sports-bye',6,1))$$,
 '22023','El rival depende de otra ronda; no se puede reemplazar por un BYE','a pending winner is not silently discarded');
select lives_ok($$select public.process_american_free_bye(american_free_test.fid('sports-bye'),american_free_test.fid('owner'),3,american_free_test.mid('sports-bye',5,1))$$,'also processes an already explicit BYE');
select throws_ok($$select public.process_american_free_bye(american_free_test.fid('sports-bye'),american_free_test.fid('owner'),4,american_free_test.mid('sports-bye',5,1))$$,
 '22023','El BYE requiere una única pareja y un partido sin actividad','duplicate submission cannot advance twice');
select * from finish();
rollback;
