-- LOCAL ONLY. Run against a disposable copy; every fixture is rolled back.
begin;
set local request.jwt.claim.role='service_role';
create temporary table capacity_fixture(tid uuid,actor uuid,ids uuid[]);
grant select on capacity_fixture to authenticated,service_role;
do $$
declare t public.tournaments%rowtype; p public.players%rowtype; tid uuid:=gen_random_uuid(); actor uuid;
  a uuid; b uuid; c uuid; iid uuid; ids uuid[]:='{}'; i public.inscriptions%rowtype; path text; zid uuid; n integer;
begin
  select * into strict t from public.tournaments where club_id is not null and type::text='AMERICAN' limit 1;
  select user_id into strict actor from public.clubes where id=t.club_id;
  select * into strict p from public.players limit 1;
  insert into public.tournaments select (jsonb_populate_record(null::public.tournaments,to_jsonb(t)||jsonb_build_object(
    'id',tid,'name','Capacity policy local fixture','seo_slug',tid::text,'status','NOT_STARTED','max_participants',1,
    'bracket_status','NOT_STARTED','registration_locked',false,'registration_locked_by_capacity',false,
    'enable_transfer_proof',true,'reserve_slot_without_proof',false,'validate_inscriptions',false,
    'allow_cash_payment',false,'transfer_alias','local.alias','transfer_amount',100,'messages_enabled',false))).*;
  for n in 1..4 loop
    a:=gen_random_uuid(); b:=gen_random_uuid(); c:=gen_random_uuid();
    insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id',a,'user_id',null,'dni',a::text))).*;
    insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id',b,'user_id',null,'dni',b::text))).*;
    insert into public.couples(id,player1_id,player2_id) values(c,a,b);
    insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending,es_prueba) values(tid,c,a,false,false) returning id into iid;
    ids:=array_append(ids,iid);
  end loop;
  if exists(select 1 from public.inscriptions where tournament_id=tid and occupies_slot) then raise exception 'FAIL initial pending inscriptions occupy capacity'; end if;
  select * into strict i from public.inscriptions where id=ids[1];
  path:='tournament/'||tid||'/inscription/'||i.id||'/first.pdf';
  insert into public.inscription_proof_cleanup(path,available_at) values(path,now()+interval '15 minutes');
  select * into strict i from public.change_inscription_payment(i.id,tid,i.payment_revision,'attach',path);
  if not i.occupies_slot or i.payment_proof_path<>path then raise exception 'FAIL first upload did not obtain the available place'; end if;
  select * into strict i from public.inscriptions where id=ids[2];
  path:='tournament/'||tid||'/inscription/'||i.id||'/second.pdf';
  insert into public.inscription_proof_cleanup(path,available_at) values(path,now()+interval '15 minutes');
  select * into strict i from public.change_inscription_payment(i.id,tid,i.payment_revision,'attach',path);
  if i.occupies_slot or i.payment_proof_path<>path then raise exception 'FAIL upload without place was lost or overbooked'; end if;
  if not exists(select 1 from inscription_private.registration_events where tournament_id=tid and kind='PROOF_WITHOUT_SLOT' and inscription_id=i.id) then raise exception 'FAIL missing proof conflict event'; end if;
  if (select count(*) from inscription_private.registration_events where tournament_id=tid and kind='CAPACITY_FULL')<>1 then raise exception 'FAIL capacity transition not recorded once'; end if;
  select * into strict i from public.approve_inscription_proof(i.id,tid,i.payment_revision,i.payment_proof_path,actor);
  if i.occupies_slot then raise exception 'FAIL reviewing receipt granted a place'; end if;
  select * into strict i from public.inscriptions where id=ids[3];
  begin
    perform public.manage_inscription_admission(i.id,tid,i.payment_revision,actor,'admit-without-proof');
    raise exception 'FAIL admission overbooked';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  if exists(select 1 from public.inscriptions where id=i.id and proof_waived_at is not null) then raise exception 'FAIL partial waiver after failed admission'; end if;
  delete from public.inscriptions where id=ids[1];
  select * into strict i from public.manage_inscription_admission(i.id,tid,i.payment_revision,actor,'admit-without-proof');
  if not i.occupies_slot or i.proof_waived_by<>actor or i.proof_waived_at is null or i.is_pending then raise exception 'FAIL incomplete organizer admission'; end if;
  begin
    insert into public.zones(tournament_id,name) values(tid,'Unacknowledged exclusion');
    raise exception 'FAIL organizing silently excluded pending pairs';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.acknowledge_registration_exclusions(tid,actor,inscription_private.exclusion_signature(tid));
  insert into public.zones(tournament_id,name) values(tid,'Capacity local zone') returning id into zid;
  insert into public.zone_couples(zone_id,couple_id) values(zid,i.couple_id);
  select * into strict i from public.inscriptions where id=ids[2];
  begin
    insert into public.zone_couples(zone_id,couple_id) values(zid,i.couple_id);
    raise exception 'FAIL pair without slot joined a zone';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    update public.tournaments set max_participants=0 where id=tid;
    raise exception 'FAIL capacity reduced below occupied';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  delete from public.inscriptions where id=ids[3];
  select * into strict i from public.inscriptions where id=ids[2];
  select * into strict i from public.manage_inscription_admission(i.id,tid,i.payment_revision,actor,'assign');
  if not i.occupies_slot then raise exception 'FAIL existing uploaded receipt could not obtain freed place'; end if;
  select * into strict i from public.change_inscription_payment(i.id,tid,i.payment_revision,'remove',null,true);
  if not i.occupies_slot or i.payment_proof_path is not null then raise exception 'FAIL removing receipt lost an obtained place'; end if;
  select * into strict t from public.tournaments where id=tid;
  if not inscription_private.registration_ready(i,t) then raise exception 'FAIL missing receipt blocked an obtained place'; end if;
  update public.tournaments set enable_transfer_proof=false where id=tid;
  if exists(select 1 from public.inscriptions where id=ids[4] and occupies_slot) then raise exception 'FAIL disabling proof granted an unreserved place'; end if;
  update public.tournaments set reserve_slot_without_proof=true where id=tid;
  if exists(select 1 from public.inscriptions where id=ids[4] and occupies_slot) then raise exception 'FAIL changing reservation retroactively assigned capacity'; end if;
  update public.tournaments set enable_transfer_proof=true,registration_locked=true,registration_locked_by_capacity=false where id=tid;
  delete from public.inscriptions where id=ids[2];
  select * into strict i from public.inscriptions where id=ids[4];
  path:='tournament/'||tid||'/inscription/'||i.id||'/closed.pdf';
  insert into public.inscription_proof_cleanup(path,available_at) values(path,now()+interval '15 minutes');
  select * into strict i from public.change_inscription_payment(i.id,tid,i.payment_revision,'attach',path);
  if i.occupies_slot or i.payment_proof_path<>path then raise exception 'FAIL closed registration evidence or capacity'; end if;
  begin
    perform public.manage_inscription_admission(i.id,tid,i.payment_revision,actor,'assign');
    raise exception 'FAIL manually closed tournament admitted a new pair';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  insert into capacity_fixture values(tid,actor,ids);
  perform set_config('request.jwt.claim.sub',actor::text,true);
end $$;
-- Exercise the actual PostgREST role, including access to the shared private lock.
do $$
declare f capacity_fixture%rowtype; p public.players%rowtype; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); i public.inscriptions%rowtype;
begin
  select * into strict f from capacity_fixture;
  select * into strict p from public.players limit 1;
  insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id',a,'user_id',null,'dni',a::text))).*;
  insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id',b,'user_id',null,'dni',b::text))).*;
  insert into public.couples(id,player1_id,player2_id) values(c,a,b);
  update public.tournaments set registration_locked=false,max_participants=null,reserve_slot_without_proof=true where id=f.tid;
  insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending) values(f.tid,c,a,true) returning * into i;
  if not i.occupies_slot or i.is_pending or i.payment_proof_path is not null then raise exception 'FAIL initial reservation or retired approval flag'; end if;
  delete from public.inscriptions where id=i.id;
  update public.tournaments set reserve_slot_without_proof=false,allow_cash_payment=true,validate_inscriptions=true where id=f.tid;
  insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending,payment_method) values(f.tid,c,a,true,'CASH') returning * into i;
  if not i.occupies_slot or i.is_pending or i.payment_method<>'CASH' then raise exception 'FAIL cash did not reserve directly'; end if;
  if exists(select 1 from public.inscription_payments where inscription_id=i.id and has_paid) then raise exception 'FAIL choosing cash marked money received'; end if;
  delete from public.inscriptions where id=i.id;
end $$;
set local role service_role;
do $$
declare f capacity_fixture%rowtype; i public.inscriptions%rowtype;
begin
  select * into strict f from capacity_fixture;
  select * into strict i from public.inscriptions where id=f.ids[4];
  perform public.change_inscription_payment(i.id,f.tid,i.payment_revision,'remove',null,true);
  select * into strict i from public.inscriptions where id=f.ids[4];
  perform public.manage_inscription_admission(i.id,f.tid,i.payment_revision,f.actor,'approve');
end $$;
reset role;
do $$
declare f capacity_fixture%rowtype; sig text; i public.inscriptions%rowtype; eid uuid; prepared jsonb;
begin
  select * into strict f from capacity_fixture;
  if exists(select 1 from inscription_private.registration_events where tournament_id=f.tid and notification_allowed) then
    raise exception 'FAIL disabled notifications enabled retroactively'; end if;
  update public.tournaments set messages_enabled=true,registration_locked=false where id=f.tid;
  if exists(select 1 from inscription_private.registration_events where tournament_id=f.tid and notification_allowed) then
    raise exception 'FAIL changing preferences enabled old events'; end if;
  sig:=inscription_private.exclusion_signature(f.tid);
  perform public.acknowledge_registration_exclusions(f.tid,f.actor,sig);
  update public.tournaments set max_participants=3 where id=f.tid;
  if (public.registration_exclusion_state(f.tid)->>'acknowledged')::boolean then raise exception 'FAIL stale acknowledgement survived an inscription change'; end if;
  begin
    perform public.acknowledge_registration_exclusions(f.tid,f.actor,sig);
    raise exception 'FAIL stale snapshot accepted';
  exception when sqlstate 'PT409' then null; end;
  perform public.acknowledge_registration_exclusions(f.tid,f.actor,inscription_private.exclusion_signature(f.tid));
  update public.tournaments set status='ZONE_PHASE' where id=f.tid;
  if not (public.registration_exclusion_state(f.tid)->>'acknowledged')::boolean then raise exception 'FAIL internal phase transition lost the current review'; end if;
  insert into inscription_private.registration_events(tournament_id,kind,claimed_at,attempts) values(f.tid,'CAPACITY_FULL',now(),1) returning id into eid;
  prepared:=public.prepare_registration_event(eid,1,'{"subject":"first"}');
  prepared:=public.prepare_registration_event(eid,1,'{"subject":"second"}');
  if prepared->>'subject'<>'first' then raise exception 'FAIL retry changed frozen message'; end if;
  perform public.finish_registration_event(eid,0,null);
  if exists(select 1 from inscription_private.registration_events where id=eid and delivered_at is not null) then raise exception 'FAIL stale worker finalized another attempt'; end if;
end $$;
alter table capacity_fixture add column spoof_couple uuid;
alter table capacity_fixture add column spoof_player uuid;
alter table capacity_fixture add column spoof_user uuid;
do $$
declare f capacity_fixture%rowtype; a public.players%rowtype; b public.players%rowtype; c uuid:=gen_random_uuid(); bid uuid:=gen_random_uuid();
begin
  select * into strict f from capacity_fixture;
  select p.* into strict a from public.players p join public.users u on u.id=p.user_id where u.role::text='PLAYER' limit 1;
  select * into strict b from public.players limit 1;
  insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(b)||jsonb_build_object('id',bid,'user_id',null,'dni',bid::text))).*;
  insert into public.couples(id,player1_id,player2_id) values(c,a.id,bid);
  update capacity_fixture set spoof_couple=c,spoof_player=a.id,spoof_user=a.user_id;
end $$;
set local role authenticated;
do $$
declare f capacity_fixture%rowtype; i public.inscriptions%rowtype;
begin
  select * into strict f from capacity_fixture;
  begin
    update public.inscriptions set occupies_slot=true where id=f.ids[4];
    raise exception 'FAIL direct client capacity write allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.inscriptions set proof_waived_at=now(),proof_waived_by=f.actor,proof_waiver_reason='forged' where id=f.ids[4];
    raise exception 'FAIL direct client waiver allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.manage_inscription_admission(f.ids[4],f.tid,0,f.actor,'assign');
    raise exception 'FAIL privileged RPC public execution allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',f.spoof_user::text,true);
  begin
    insert into public.inscriptions(tournament_id,couple_id,player_id,pairing_source,paired_by_user_id)
      values(f.tid,f.spoof_couple,f.spoof_player,'ORGANIZER',f.actor);
    raise exception 'FAIL player forged organizer admission metadata';
  exception when insufficient_privilege then null; end;
  insert into public.inscriptions(tournament_id,couple_id,player_id) values(f.tid,f.spoof_couple,f.spoof_player) returning * into i;
  if i.occupies_slot or i.proof_waived_at is not null then raise exception 'FAIL ordinary player received an unearned place or waiver'; end if;
  begin
    update public.inscriptions set player_id=null where id=i.id;
    raise exception 'FAIL direct identity change allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
