-- Disposable local schema clone only. Includes the original fixtures/helpers.
begin;
set local search_path=public,extensions,american_free_test;
select no_plan();

-- Convert in both directions without touching zone data or registrations.
select lives_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_2"}' where id=fid('invalid')$$,'free to automatic before bracket');
select lives_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_FREE"}' where id=fid('invalid')$$,'automatic to free during zones');
select is((select count(*) from public.zone_positions where tournament_id=fid('invalid')),8::bigint,'zone positions preserved');
select is((select count(*) from public.inscriptions where tournament_id=fid('invalid')),8::bigint,'registrations preserved');
select is((select count(*) from public.zones where tournament_id=fid('invalid')),1::bigint,'zones preserved');
update public.tournaments set status='NOT_STARTED' where id=fid('race');
select lives_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_3"}' where id=fid('race')$$,'free conversion allowed before start');
select lives_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_FREE"}' where id=fid('race')$$,'free selected before start');

insert into public.matches(id,tournament_id,type,round,status,couple1_id,couple2_id,result_couple1,result_couple2)
values(fid('zone-result'),fid('invalid'),'ZONE','ZONE','FINISHED',fid('c1'),fid('c2'),'6','2');
select lives_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_GLOBAL_2"}' where id=fid('invalid')$$,'completed zone matches allow conversion');
select is((select result_couple1 from public.matches where id=fid('zone-result')),'6','zone result preserved');

update public.tournaments set status='BRACKET_PHASE' where id=fid('invalid');
select throws_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_FREE"}' where id=fid('invalid')$$,'22023','Para cambiar el formato primero tenés que revertir la llave','bracket phase blocks conversion to free');
select throws_ok($$update public.tournaments set status='ZONE_PHASE',format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_FREE"}' where id=fid('invalid')$$,'22023','Para cambiar el formato primero tenés que revertir la llave','cannot bypass with same-update phase reset');
update public.tournaments set status='ZONE_PHASE',bracket_generated_at=now() where id=fid('invalid');
select throws_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_FREE"}' where id=fid('invalid')$$,'22023','Para cambiar el formato primero tenés que revertir la llave','generation timestamp blocks conversion');
update public.tournaments set bracket_generated_at=null,bracket_status='BRACKET_GENERATED' where id=fid('invalid');
select throws_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_FREE"}' where id=fid('invalid')$$,'22023','Para cambiar el formato primero tenés que revertir la llave','generation flag blocks conversion');
update public.tournaments set bracket_status='NOT_STARTED' where id=fid('invalid');
insert into public.matches(tournament_id,type,round,couple1_id,couple2_id) values(fid('invalid'),'ELIMINATION','FINAL',null,null);
select throws_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_FREE"}' where id=fid('invalid')$$,'22023','Para cambiar el formato primero tenés que revertir la llave','legacy elimination artifacts block conversion');

set local role service_role;
select lives_ok($$select american_free_test.gen('eight',8,8)$$,'converted guard preserves bracket creation');
select throws_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_2"}' where id=fid('eight')$$,'22023','Para cambiar el formato primero tenés que revertir la llave','cannot leave free after generation');
select throws_ok($$update public.tournaments set format_config=format_config||'{"zoneMatchTarget":3}' where id=fid('eight')$$,'22023','Para cambiar el formato primero tenés que revertir la llave','same-preset format edits blocked after generation');
select lives_ok($$update public.tournaments set format_config=format_config where id=fid('eight')$$,'unchanged config remains valid');
reset role;
select throws_ok($$update public.tournaments set type='LONG' where id=fid('eight')$$,'22023','Configuración LIBRE inválida','cannot change free tournament type');
select throws_ok($$update public.tournaments set format_config='{"version":1,"presetId":"AMERICAN_MULTI_ZONE_FREE"}' where id=fid('race')$$,'22023','Configuración LIBRE inválida','invalid free version rejected');
select lives_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_SINGLE_ZONE_FREE"}' where id=fid('stranger_t')$$,'single zone free accepted before bracket');
select * from finish();
rollback;
