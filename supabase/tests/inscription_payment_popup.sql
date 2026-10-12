-- Run with psql against a LOCAL database with the migration installed.
-- Fixtures and all changes are rolled back; no emails or application services run.
begin;
set local request.jwt.claim.role = 'service_role';
create temporary table payment_test_ids(tournament_id uuid, inscription_id uuid, player_id uuid, user_id uuid);
grant select on payment_test_ids to authenticated;
do $$
declare
  tid uuid := gen_random_uuid(); uid uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid(); p4 uuid := gen_random_uuid();
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); iid uuid;
  base_t public.tournaments%rowtype; base_p public.players%rowtype; base_u public.users%rowtype;
  required boolean;
begin
  select * into strict base_t from public.tournaments limit 1;
  select * into strict base_p from public.players limit 1;
  select * into strict base_u from public.users limit 1;
  insert into auth.users(id) values(uid);
  insert into public.users select (jsonb_populate_record(null::public.users, to_jsonb(base_u) || jsonb_build_object('id',uid,'email',uid::text||'@test.invalid','role','PLAYER'))).*;
  insert into public.tournaments select (jsonb_populate_record(null::public.tournaments, to_jsonb(base_t) || jsonb_build_object(
    'id',tid,'name','Payment regression test','seo_slug',tid::text,'status','NOT_STARTED','max_participants',2,
    'enable_transfer_proof',true,'allow_cash_payment',false,'transfer_alias','test.alias','transfer_amount',100,'messages_enabled',false))).*;
  insert into public.players select (jsonb_populate_record(null::public.players, to_jsonb(base_p) || jsonb_build_object('id',p1,'user_id',uid,'dni',p1::text,'first_name','Test','last_name','One'))).*;
  insert into public.players select (jsonb_populate_record(null::public.players, to_jsonb(base_p) || jsonb_build_object('id',p2,'user_id',null,'dni',p2::text,'first_name','Test','last_name','Two'))).*;
  insert into public.players select (jsonb_populate_record(null::public.players, to_jsonb(base_p) || jsonb_build_object('id',p3,'user_id',null,'dni',p3::text,'first_name','Test','last_name','Three'))).*;
  insert into public.players select (jsonb_populate_record(null::public.players, to_jsonb(base_p) || jsonb_build_object('id',p4,'user_id',null,'dni',p4::text,'first_name','Test','last_name','Four'))).*;
  insert into public.couples(id,player1_id,player2_id) values(c1,p1,p2),(c2,p3,p4);
  -- The existing conversion creates a couple before deleting its individual row.
  insert into public.inscriptions(tournament_id,player_id,is_pending,es_prueba) values(tid,p1,false,false);
  insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending,es_prueba) values(tid,c1,p1,false,false) returning id into iid;
  delete from public.inscriptions where tournament_id=tid and couple_id is null and player_id=p1;
  if not exists(select 1 from public.inscriptions where id=iid and payment_method='TRANSFER' and payment_proof_path is null and payment_alias_snapshot='test.alias') then
    raise exception 'FAIL: missing transfer snapshot';
  end if;
  begin
    insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending,es_prueba) values(tid,c1,p1,false,false);
    raise exception 'FAIL: duplicate allowed';
  exception when unique_violation then null; end;
  begin
    update public.inscriptions set payment_method='CASH' where id=iid;
    raise exception 'FAIL: disabled cash allowed';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    update public.tournaments set status='IN_PROGRESS' where id=tid;
    raise exception 'FAIL: incomplete tournament started';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.zones(tournament_id,name) values(tid,'Blocked test zone');
    raise exception 'FAIL: zones accepted incomplete inscription';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  update public.tournaments set allow_cash_payment=true where id=tid;
  insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending,es_prueba,payment_method) values(tid,c2,p3,false,false,'CASH');
  begin
    insert into public.inscriptions(tournament_id,couple_id,is_pending,es_prueba) values(tid,c2,false,false);
    raise exception 'FAIL: capacity exceeded';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  insert into payment_test_ids values(tid,iid,p1,uid);
  perform set_config('request.jwt.claim.sub',uid::text,true);
end $$;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $$
declare test payment_test_ids%rowtype;
begin
  select * into strict test from payment_test_ids;
  begin
    update public.inscriptions set payment_proof_path='forged-path' where id=test.inscription_id;
    raise exception 'FAIL: player forged proof';
  exception when insufficient_privilege then null; end;
  begin
    update public.inscriptions set payment_amount_snapshot=1 where id=test.inscription_id;
    raise exception 'FAIL: player changed transfer snapshot';
  exception when insufficient_privilege then null; end;
  update public.inscriptions set payment_method='CASH' where id=test.inscription_id;
end $$;
reset role;
do $$
declare test payment_test_ids%rowtype; i public.inscriptions%rowtype;
  path1 text; path2 text; path3 text; zid uuid;
begin
  select * into strict test from payment_test_ids;
  select * into strict i from public.inscriptions where id=test.inscription_id;
  path1 := 'tournament/' || test.tournament_id || '/inscription/' || i.id || '/first.pdf';
  path2 := 'tournament/' || test.tournament_id || '/inscription/' || i.id || '/second.png';
  path3 := 'tournament/' || test.tournament_id || '/inscription/' || i.id || '/abandoned.png';
  select * into strict i from public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision,'transfer');
  if i.payment_method <> 'TRANSFER' or i.payment_alias_snapshot <> 'test.alias' or i.payment_amount_snapshot <> 100 then raise exception 'FAIL: transfer snapshot'; end if;
  insert into public.inscription_proof_cleanup(path,available_at) values(path1,now()+interval '15 minutes');
  select * into strict i from public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision,'attach',path1);
  if i.is_pending or i.payment_proof_path <> path1 then raise exception 'FAIL: approval/capacity changed'; end if;
  if exists(select 1 from public.inscription_proof_cleanup where path=path1) then raise exception 'FAIL: linked upload ticket remains'; end if;
  insert into public.zones(tournament_id,name) values(test.tournament_id,'Popup fixture') returning id into zid;
  update public.tournaments set status='IN_PROGRESS' where id=test.tournament_id;
  insert into public.inscription_proof_cleanup(path,available_at) values(path2,now()+interval '15 minutes');
  select * into strict i from public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision,'replace',path2);
  if not exists(select 1 from public.inscription_proof_cleanup where path=path1) then raise exception 'FAIL: detached replacement not queued'; end if;
  if i.payment_proof_status <> 'PENDING_REVIEW' then raise exception 'FAIL: replacement review'; end if;
  begin
    perform public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision-1,'remove');
    raise exception 'FAIL: stale revision accepted';
  exception when serialization_failure then null; end;
  update public.inscriptions set payment_proof_status='APPROVED' where id=i.id returning * into i;
  begin
    perform public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision,'remove');
    raise exception 'FAIL: player edited approved proof';
  exception when insufficient_privilege then null; end;
  select * into strict i from public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision,'remove',null,true);
  if i.payment_proof_path is not null or i.is_pending then raise exception 'FAIL: removing file changed inscription'; end if;
  if not exists(select 1 from public.zones where id=zid) then raise exception 'FAIL: removal deleted zones'; end if;
  select * into strict i from public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision,'cash');
  update public.tournaments set transfer_alias='new.alias',transfer_amount=200 where id=test.tournament_id;
  select * into strict i from public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision,'transfer');
  if i.payment_alias_snapshot <> 'new.alias' or i.payment_amount_snapshot <> 200 then raise exception 'FAIL: new choice snapshot'; end if;
  insert into public.inscription_proof_cleanup(path,available_at) values(path3,now()-interval '1 minute');
  perform public.claim_inscription_proof_cleanup(100);
  begin
    perform public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision,'attach',path3);
    raise exception 'FAIL: claimed orphan was linked';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  insert into public.inscription_proof_cleanup(path,available_at) values(path1,now()+interval '15 minutes')
    on conflict(path) do update set claimed_at=null,available_at=now()+interval '15 minutes';
  select * into strict i from public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision,'attach',path1);
  -- Local schema restricts tournament deletion until inscriptions/zones are removed.
  delete from public.inscriptions where tournament_id=test.tournament_id;
  delete from public.zones where tournament_id=test.tournament_id;
  delete from public.tournaments where id=test.tournament_id;
  if not exists(select 1 from public.inscription_proof_cleanup where path=path1) then raise exception 'FAIL: cascade did not enqueue proof'; end if;
  if has_function_privilege('authenticated','public.change_inscription_payment(uuid,uuid,integer,text,text,boolean)','execute') then raise exception 'FAIL: player has privileged RPC access'; end if;
  if has_table_privilege('authenticated','public.inscription_proof_cleanup','select') then raise exception 'FAIL: private paths exposed'; end if;
  raise notice 'PASS: payment switches, current snapshots, revisions, concurrent approval, replacement outbox, removal with zones, worker claims, cascade cleanup and private privileges';
end $$;
rollback;
