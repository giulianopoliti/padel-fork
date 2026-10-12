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
do $$
declare test payment_test_ids%rowtype; i public.inscriptions%rowtype; before_row jsonb;
  path1 text; path2 text; original_revision integer; original_review timestamptz;
  zid uuid; mid uuid; before_match jsonb;
begin
  select * into strict test from payment_test_ids;
  select * into strict i from public.inscriptions where id=test.inscription_id;
  path1 := 'tournament/'||test.tournament_id||'/inscription/'||i.id||'/review.pdf';
  path2 := 'tournament/'||test.tournament_id||'/inscription/'||i.id||'/replacement.pdf';
  begin
    perform public.approve_inscription_proof(i.id,test.tournament_id,i.payment_revision,path1,test.user_id);
    raise exception 'FAIL: approval without file';
  exception when serialization_failure then null; end;
  insert into public.inscription_proof_cleanup(path,available_at) values(path1,now()+interval '1 hour'),(path2,now()+interval '1 hour');
  select * into strict i from public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision,'attach',path1,true);
  update public.inscriptions set is_pending=true where id=i.id returning * into i;
  original_revision := i.payment_revision;
  before_row := to_jsonb(i)-array['payment_proof_status','payment_reviewed_at','payment_reviewed_by','payment_revision'];
  select * into strict i from public.approve_inscription_proof(i.id,test.tournament_id,original_revision,path1,test.user_id);
  if not i.is_pending or i.payment_proof_status<>'APPROVED' or i.payment_reviewed_by<>test.user_id or i.payment_reviewed_at is null then
    raise exception 'FAIL: proof approval changed inscription or omitted review';
  end if;
  if to_jsonb(i)-array['payment_proof_status','payment_reviewed_at','payment_reviewed_by','payment_revision'] <> before_row then
    raise exception 'FAIL: proof approval changed unrelated fields';
  end if;
  original_review := i.payment_reviewed_at;
  select * into strict i from public.approve_inscription_proof(i.id,test.tournament_id,original_revision,path1,test.user_id);
  if i.payment_revision<>original_revision+1 or i.payment_reviewed_at<>original_review then raise exception 'FAIL: repeated approval rewrote review'; end if;
  select * into strict i from public.change_inscription_payment(i.id,test.tournament_id,i.payment_revision,'replace',path2,true);
  if i.payment_proof_status<>'PENDING_REVIEW' or i.payment_reviewed_at is not null or i.payment_reviewed_by is not null then raise exception 'FAIL: replacement retained approval'; end if;
  begin
    perform public.approve_inscription_proof(i.id,test.tournament_id,original_revision,path1,test.user_id);
    raise exception 'FAIL: old file approved replacement';
  exception when serialization_failure then null; end;
  -- Registration approval must leave the file pending and individual payments unpaid.
  update public.inscriptions set is_pending=false where id=i.id returning * into i;
  if i.payment_proof_status<>'PENDING_REVIEW' then raise exception 'FAIL: inscription approval reviewed proof'; end if;
  insert into public.zones(tournament_id,name) values(test.tournament_id,'Review preservation') returning id into zid;
  insert into public.matches(tournament_id,zone_id,couple1_id,couple2_id,es_prueba) values(test.tournament_id,zid,i.couple_id,null,true) returning id into mid;
  select to_jsonb(m) into before_match from public.matches m where id=mid;
  before_row := to_jsonb(i)-array['payment_proof_status','payment_reviewed_at','payment_reviewed_by','payment_revision'];
  select * into strict i from public.approve_inscription_proof(i.id,test.tournament_id,i.payment_revision,path2,test.user_id);
  if to_jsonb(i)-array['payment_proof_status','payment_reviewed_at','payment_reviewed_by','payment_revision'] <> before_row then raise exception 'FAIL: unrelated data changed'; end if;
  if exists(select 1 from public.inscription_payments where inscription_id=i.id and has_paid) then raise exception 'FAIL: approval marked player paid'; end if;
  if not exists(select 1 from public.zones where tournament_id=test.tournament_id and name='Review preservation') then raise exception 'FAIL: zones lost'; end if;
  if (select to_jsonb(m) from public.matches m where id=mid) is distinct from before_match then raise exception 'FAIL: match changed'; end if;
  if has_function_privilege('authenticated','public.approve_inscription_proof(uuid,uuid,integer,text,uuid)','execute') or
    has_function_privilege('anon','public.approve_inscription_proof(uuid,uuid,integer,text,uuid)','execute') then raise exception 'FAIL: public RPC access'; end if;
  -- Prepare a player-owned unreviewed record for direct-write attempts.
  update public.inscriptions set payment_proof_status='PENDING_REVIEW',payment_reviewed_at=null,payment_reviewed_by=null where id=i.id;
end $$;
grant select on public.players to authenticated;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $$
declare test payment_test_ids%rowtype;
begin
  select * into strict test from payment_test_ids;
  begin
    update public.inscriptions set payment_reviewed_at=now() where id=test.inscription_id;
    raise exception 'FAIL: player forged review time';
  exception when insufficient_privilege then null; end;
  begin
    update public.inscriptions set payment_reviewed_by=test.user_id where id=test.inscription_id;
    raise exception 'FAIL: player forged reviewer';
  exception when insufficient_privilege then null; end;
  begin
    update public.inscriptions set payment_proof_status='APPROVED' where id=test.inscription_id;
    raise exception 'FAIL: player forged approval';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
\echo 'PASS: independent approval, metadata, unchanged fields/payments/zones/matches, duplicate/stale requests, and protected direct writes.'
