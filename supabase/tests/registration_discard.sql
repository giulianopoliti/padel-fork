-- LOCAL ONLY. Synthetic records and every change are rolled back.
begin;
create temporary table discard_fixture(tid uuid, ids uuid[], actor uuid);
grant select on discard_fixture to service_role;
do $$
declare t public.tournaments%rowtype; p public.players%rowtype; tid uuid:=gen_random_uuid();
  a uuid; b uuid; c uuid; row_id uuid; ids uuid[]:='{}'; actor uuid; n integer;
begin
  select * into strict t from public.tournaments where club_id is not null and type::text='AMERICAN' limit 1;
  select user_id into strict actor from public.clubes where id=t.club_id;
  select * into strict p from public.players limit 1;
  insert into public.tournaments select (jsonb_populate_record(null::public.tournaments,to_jsonb(t)||jsonb_build_object(
    'id',tid,'name','Local discard regression','seo_slug',tid::text,'status','NOT_STARTED','max_participants',1,
    'bracket_status','NOT_STARTED','registration_locked',false,'registration_locked_by_capacity',false,
    'enable_transfer_proof',true,'reserve_slot_without_proof',false,'allow_cash_payment',false,
    'transfer_alias','local.test','transfer_amount',100,'messages_enabled',false))).*;
  for n in 1..3 loop
    a:=gen_random_uuid(); b:=gen_random_uuid(); c:=gen_random_uuid();
    insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id',a,'user_id',null,'dni',a::text))).*;
    insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id',b,'user_id',null,'dni',b::text))).*;
    insert into public.couples(id,player1_id,player2_id) values(c,a,b);
    insert into public.inscriptions(tournament_id,couple_id,player_id) values(tid,c,a) returning id into row_id;
    ids:=array_append(ids,row_id);
  end loop;
  insert into discard_fixture values(tid,ids,actor);
end $$;
set local role service_role;
do $$
declare f discard_fixture%rowtype; proof_path text; deleted_id uuid; admitted public.inscriptions%rowtype;
begin
  select * into strict f from discard_fixture;
  select * into strict admitted from public.manage_inscription_admission(f.ids[2],f.tid,0,f.actor,'admit-without-proof');
  proof_path:='tournament/'||f.tid||'/inscription/'||f.ids[1]||'/receipt.pdf';
  insert into public.inscription_proof_cleanup(path,available_at) values(proof_path,now()+interval '1 hour');
  perform public.change_inscription_payment(f.ids[1],f.tid,0,'attach',proof_path,true);
  -- A new receipt increments the revision; the old discard must do nothing.
  delete from public.inscriptions where id=f.ids[1] and tournament_id=f.tid and not occupies_slot
    and payment_revision=0 and not es_prueba and couple_id is not null returning id into deleted_id;
  if deleted_id is not null then raise exception 'FAIL deleted after another actor attached a receipt'; end if;
  -- Preserve a place assigned after the organizer first opened the notice.
  delete from public.inscriptions where id=f.ids[2] and tournament_id=f.tid and not occupies_slot
    and payment_revision=admitted.payment_revision and not es_prueba and couple_id is not null returning id into deleted_id;
  if deleted_id is not null then raise exception 'FAIL discarded a confirmed inscription'; end if;
  -- A pending row with its current receipt revision can be discarded; its
  -- proof cleanup is queued in the same transaction.
  delete from public.inscriptions where id=f.ids[1] and tournament_id=f.tid and not occupies_slot
    and payment_revision=1 and not es_prueba and couple_id is not null returning id into deleted_id;
  if deleted_id is distinct from f.ids[1] then raise exception 'FAIL could not discard the current receipt inscription'; end if;
  if not exists(select 1 from public.inscription_proof_cleanup where path=proof_path) then
    raise exception 'FAIL discarded proof was not queued for cleanup';
  end if;
  delete from public.inscriptions where id=f.ids[3] and tournament_id=f.tid and not occupies_slot
    and payment_revision=0 and not es_prueba and couple_id is not null returning id into deleted_id;
  if deleted_id is distinct from f.ids[3] then raise exception 'FAIL could not discard the pending inscription'; end if;
  if (select count(*) from public.inscriptions where tournament_id=f.tid and occupies_slot)<>1 then
    raise exception 'FAIL discard changed the number of confirmed places';
  end if;
end $$;
reset role;
rollback;
