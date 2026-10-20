-- Fixed local PostgreSQL runner only. All fixtures roll back.
begin;
set local search_path=public,extensions;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temporary table proof_fixture(key text primary key,id uuid default gen_random_uuid());
insert into proof_fixture(key) select unnest(array['a','b','manager','club','tournament','couple']);
create function pg_temp.fid(k text) returns uuid language sql stable as $$select id from pg_temp.proof_fixture where key=k$$;
insert into auth.users(id,email) select id,'proof-toggle-'||id||'@example.invalid' from proof_fixture where key in ('a','b','manager');
insert into public.users(id,email,role) select id,'proof-toggle-'||id||'@example.invalid',
  case when key='manager' then 'CLUB'::public."ROLE" else 'PLAYER'::public."ROLE" end
  from proof_fixture where key in ('a','b','manager');
insert into public.players(id,user_id,first_name,last_name,category_name,gender,score,is_categorized)
  select id,id,key,'Proof toggle','9na','MALE',111,true from proof_fixture where key in ('a','b');
insert into public.clubes(id,user_id,name) values(pg_temp.fid('club'),pg_temp.fid('manager'),'Proof toggle');
insert into public.tournaments(id,club_id,name,type,status,category_name,gender,max_participants,
  validate_inscriptions,enable_transfer_proof,transfer_alias,transfer_amount)
  values(pg_temp.fid('tournament'),pg_temp.fid('club'),'Proof toggle','LONG','NOT_STARTED','9na','MALE',16,true,true,'test.alias',100);
insert into public.couples(id,player1_id,player2_id) values(pg_temp.fid('couple'),pg_temp.fid('a'),pg_temp.fid('b'));
insert into public.inscriptions(tournament_id,couple_id,payment_method,is_pending)
  values(pg_temp.fid('tournament'),pg_temp.fid('couple'),'TRANSFER',true);
select throws_ok($$insert into public.zones(tournament_id,name) values(pg_temp.fid('tournament'),'Blocked')$$,'P0001',null,'enabled proof requirement blocks zone creation');
select throws_ok($$update public.tournaments set status='ZONE_PHASE' where id=pg_temp.fid('tournament')$$,'P0001',null,'enabled requirement blocks tournament progression');
select lives_ok($$update public.tournaments set enable_transfer_proof=false,status='ZONE_PHASE' where id=pg_temp.fid('tournament')$$,'same update disabling proof and advancing uses NEW setting');
select is((select payment_method from public.inscriptions where tournament_id=pg_temp.fid('tournament')),'TRANSFER','historical payment method preserved');
select is((select is_pending from public.inscriptions where tournament_id=pg_temp.fid('tournament')),true,'independent approval not bypassed');
select lives_ok($$insert into public.zones(tournament_id,name) values(pg_temp.fid('tournament'),'Available')$$,'disabled proof requirement releases zone guard');
update public.tournaments set enable_transfer_proof=true where id=pg_temp.fid('tournament');
select throws_ok($$insert into public.zones(tournament_id,name) values(pg_temp.fid('tournament'),'Blocked again')$$,'P0001',null,'reenabling restores missing proof guard');
update public.inscriptions set payment_proof_path='fixture/receipt.png',payment_proof_status='PENDING_REVIEW' where tournament_id=pg_temp.fid('tournament');
update public.tournaments set enable_transfer_proof=false where id=pg_temp.fid('tournament');
select is((select payment_proof_path from public.inscriptions where tournament_id=pg_temp.fid('tournament')),'fixture/receipt.png','uploaded file reference retained');
select is((select payment_proof_status from public.inscriptions where tournament_id=pg_temp.fid('tournament')),'PENDING_REVIEW','proof review history retained');
select ok(not has_function_privilege('authenticated','inscription_private.require_complete_registrations()','EXECUTE'),'private trigger cannot be invoked by clients');
select * from finish();
rollback;
