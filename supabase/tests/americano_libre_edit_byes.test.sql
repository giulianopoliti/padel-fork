begin;
set local search_path=public,extensions;
select no_plan();
set local role service_role;
select lives_ok($$select american_free_test.gen('twenty',32,20)$$,'Generate original tree with BYEs');
create temporary table original_tree as select original_slots from public.american_free_brackets where tournament_id=american_free_test.fid('twenty');
select lives_ok($$select american_free_test.save('twenty',0,
  american_free_test.put(american_free_test.put(american_free_test.put(american_free_test.layout('twenty'),american_free_test.mid('twenty',2,1),1,american_free_test.fid('c1')),
    american_free_test.mid('twenty',2,13),1,american_free_test.fid('c2')),
    american_free_test.mid('twenty',2,13),2,american_free_test.fid('c3')))$$,'Assign a pair with a BYE and two pairs in another match');
select lives_ok($$select public.mutate_american_free_sports(american_free_test.fid('twenty'),american_free_test.fid('owner'),1,
  jsonb_build_array(jsonb_build_object('kind','PROCESS_BYE','matchId',american_free_test.mid('twenty',2,1))))$$,'Process original BYE');
select throws_ok($$select american_free_test.save('twenty',2,american_free_test.put(american_free_test.layout('twenty'),american_free_test.mid('twenty',2,1),2,american_free_test.fid('c3')))$$,
  '22023','No se pueden reorganizar partidos con actividad deportiva','Processed BYE cannot be replaced');
select lives_ok($$select public.mutate_american_free_sports(american_free_test.fid('twenty'),american_free_test.fid('owner'),2,
  jsonb_build_array(jsonb_build_object('kind','UNDO_BYE','matchId',american_free_test.mid('twenty',2,1))))$$,'Undo processed BYE');
select lives_ok($$select american_free_test.save('twenty',3,
  american_free_test.put(american_free_test.put(american_free_test.layout('twenty'),american_free_test.mid('twenty',2,1),2,american_free_test.fid('c2')),
    american_free_test.mid('twenty',2,13),1,null,'BYE'))$$,'Move pair onto undone BYE and transfer pass to the vacated slot');
select is((select couple2_id from public.matches where id=american_free_test.mid('twenty',2,1)),american_free_test.fid('c2'),'Former BYE contains moved pair');
select is((select free_slot1_origin from public.matches where id=american_free_test.mid('twenty',2,13)),'BYE','Vacated place contains BYE');
select is((select couple2_id from public.matches where id=american_free_test.mid('twenty',2,13)),american_free_test.fid('c3'),'Rival left behind now receives the BYE');
select is((select effective_capacity from public.american_free_brackets where tournament_id=american_free_test.fid('twenty')),20,'Transfer keeps capacity');
select lives_ok($$select american_free_test.save('twenty',4,
  american_free_test.put(american_free_test.layout('twenty'),american_free_test.mid('twenty',2,13),1,null))$$,'Remove transferred BYE to open an entry');
select is((select effective_capacity from public.american_free_brackets where tournament_id=american_free_test.fid('twenty')),21,'Removing BYE opens an additional place');
select lives_ok($$select american_free_test.save('twenty',5,
  american_free_test.put(american_free_test.put(american_free_test.layout('twenty'),american_free_test.mid('twenty',2,13),1,american_free_test.fid('c4')),
    american_free_test.mid('twenty',2,14),2,null,'BYE'))$$,'Fill open entry and give BYE to a different match');
select is((select original_slots from public.american_free_brackets where tournament_id=american_free_test.fid('twenty')),(select original_slots from original_tree),'Original tree remains immutable');
select is((select count(*) from public.matches where tournament_id=american_free_test.fid('twenty') and (winner_id is not null or free_bye_processed)),0::bigint,'No automatic winners or stale advances');
select throws_ok($$select american_free_test.save('twenty',6,
  american_free_test.put(american_free_test.layout('twenty'),american_free_test.mid('twenty',2,14),1,null,'BYE'))$$,
  '22023','Distribución de rondas o pases inválida','Reject two BYEs in one match');
select throws_ok($$select american_free_test.save('twenty',6,
  american_free_test.put(american_free_test.layout('twenty'),american_free_test.mid('twenty',3,1),1,null,'BYE'))$$,
  '22023','Orígenes incompatibles con la distribución original','Do not replace winner branches with BYEs');
select throws_ok($$select american_free_test.save('twenty',5,american_free_test.layout('twenty'))$$,
  '40001','La llave cambió. Recargá antes de guardar.','Stale save remains blocked');
select lives_ok($$select public.mutate_american_free_sports(american_free_test.fid('twenty'),american_free_test.fid('owner'),6,
  jsonb_build_array(jsonb_build_object('kind','RESULT','matchId',american_free_test.mid('twenty',2,1),'score1',6,'score2',2)))$$,'Play former BYE as normal match');
select lives_ok($$select public.mutate_american_free_sports(american_free_test.fid('twenty'),american_free_test.fid('owner'),7,
  jsonb_build_array(jsonb_build_object('kind','CLEAR_RESULT','matchId',american_free_test.mid('twenty',2,1))))$$,'Clear sporting result');
select throws_ok($$select american_free_test.save('twenty',8,
  american_free_test.put(american_free_test.layout('twenty'),american_free_test.mid('twenty',2,1),2,null,'BYE'))$$,
  '22023','No se pueden reorganizar partidos con actividad deportiva','Sporting history still locks reorganization after clear');
reset role;
select ok(not has_function_privilege('authenticated','public.save_american_free_bracket(uuid,uuid,bigint,jsonb)','execute'),'Browser cannot bypass API permissions');
select * from finish();
rollback;
