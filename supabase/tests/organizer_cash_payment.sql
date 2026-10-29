-- LOCAL ONLY. An organizer override must not enable cash for player signup.
begin;
create temporary table organizer_cash_fixture(tid uuid,ids uuid[],actor uuid);
grant select on organizer_cash_fixture to service_role,authenticated;
do $$
declare t public.tournaments%rowtype; p public.players%rowtype; tid uuid:=gen_random_uuid();
  a uuid; b uuid; c uuid; i public.inscriptions%rowtype; ids uuid[]:='{}'; n integer; actor uuid;
begin
  select * into strict t from public.tournaments where club_id is not null and type::text='AMERICAN' limit 1;
  select user_id into strict actor from public.clubes where id=t.club_id;
  select * into strict p from public.players limit 1;
  insert into public.tournaments select (jsonb_populate_record(null::public.tournaments,to_jsonb(t)||jsonb_build_object(
    'id',tid,'name','Organizer cash local','seo_slug',tid::text,'status','NOT_STARTED','max_participants',1,
    'bracket_status','NOT_STARTED','registration_locked',false,'registration_locked_by_capacity',false,
    'enable_transfer_proof',true,'reserve_slot_without_proof',false,'allow_cash_payment',false,
    'transfer_alias','local.organizer','transfer_amount',100,'messages_enabled',false))).*;
  for n in 1..3 loop
    a:=gen_random_uuid(); b:=gen_random_uuid(); c:=gen_random_uuid();
    insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id',a,'user_id',null,'dni',a::text))).*;
    insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id',b,'user_id',null,'dni',b::text))).*;
    insert into public.couples(id,player1_id,player2_id) values(c,a,b);
    insert into public.inscriptions(tournament_id,couple_id,player_id) values(tid,c,a) returning * into i;
    ids:=array_append(ids,i.id);
  end loop;
  insert into organizer_cash_fixture values(tid,ids,actor);
end $$;
set local role service_role;
do $$
declare f organizer_cash_fixture%rowtype; i public.inscriptions%rowtype;
begin
  select * into strict f from organizer_cash_fixture;
  perform set_config('inscription_private.manager_cash_inscription','previous-marker',true);
  begin
    perform public.change_inscription_payment(f.ids[1],f.tid,0,'cash',null,false);
    raise exception 'FAIL ordinary cash operation bypassed tournament configuration';
  exception when raise_exception then
    if sqlerrm not like 'Este torneo no permite efectivo%' then raise; end if;
  end;
  select * into strict i from public.change_inscription_payment(f.ids[1],f.tid,0,'cash',null,true);
  if i.payment_method<>'CASH' or not i.occupies_slot or i.payment_revision<>1 then raise exception 'FAIL organizer cash did not save and reserve'; end if;
  if (select allow_cash_payment from public.tournaments where id=f.tid) then raise exception 'FAIL organizer cash enabled cash for every player'; end if;
  if current_setting('inscription_private.manager_cash_inscription',true)<>'previous-marker' then raise exception 'FAIL organizer override leaked'; end if;
  if exists(select 1 from public.inscription_payments where inscription_id=i.id and has_paid) then raise exception 'FAIL method became money received'; end if;
  select * into strict i from public.change_inscription_payment(f.ids[2],f.tid,0,'cash',null,true);
  if i.payment_method<>'CASH' or i.occupies_slot then raise exception 'FAIL cash lost its record or overbooked a full tournament'; end if;
  begin
    update public.inscriptions set payment_method='CASH' where id=f.ids[3];
    raise exception 'FAIL cash exception applied to another inscription';
  exception when raise_exception then
    if sqlerrm not like 'Este torneo no permite efectivo%' then raise; end if;
  end;
  begin
    perform public.change_inscription_payment(f.ids[1],f.tid,0,'cash',null,true);
    raise exception 'FAIL stale organizer operation accepted';
  exception when sqlstate 'PT409' then null; end;
  if current_setting('inscription_private.manager_cash_inscription',true)<>'previous-marker' then raise exception 'FAIL failed operation leaked its override'; end if;
end $$;
reset role;
do $$
declare f organizer_cash_fixture%rowtype;
begin
  select * into strict f from organizer_cash_fixture;
  perform set_config('request.jwt.claim.sub',f.actor::text,true);
  perform set_config('inscription_private.manager_cash_inscription',f.ids[3]::text,true);
end $$;
set local role authenticated;
do $$
declare f organizer_cash_fixture%rowtype;
begin
  select * into strict f from organizer_cash_fixture;
  begin
    update public.inscriptions set payment_method='CASH' where id=f.ids[3];
    raise exception 'FAIL authenticated custom-setting forgery worked';
  exception when insufficient_privilege then null; end;
  begin
    perform public.change_inscription_payment(f.ids[3],f.tid,0,'cash',null,true);
    raise exception 'FAIL authenticated caller invoked the server-only override';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
