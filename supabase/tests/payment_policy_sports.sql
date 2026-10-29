-- LOCAL ONLY. A held place is sufficient for sporting participation, without proof.
begin;
do $$
declare t public.tournaments%rowtype; tid uuid:=gen_random_uuid(); zid uuid:=gen_random_uuid();
  c public.couples%rowtype; other_c public.couples%rowtype; held public.inscriptions%rowtype; waiting public.inscriptions%rowtype;
begin
  select * into strict t from public.tournaments where club_id is not null and type::text='AMERICAN' limit 1;
  select * into strict c from public.couples where not es_prueba limit 1;
  select * into strict other_c from public.couples where not es_prueba
    and player1_id not in(c.player1_id,c.player2_id) and player2_id not in(c.player1_id,c.player2_id) limit 1;
  insert into public.tournaments select (jsonb_populate_record(null::public.tournaments,to_jsonb(t)||jsonb_build_object(
    'id',tid,'name','Payment sporting eligibility local','seo_slug',tid::text,'status','NOT_STARTED','max_participants',null,
    'bracket_status','NOT_STARTED','registration_locked',false,'registration_locked_by_capacity',false,
    'enable_transfer_proof',true,'reserve_slot_without_proof',true,'validate_inscriptions',true,
    'transfer_alias','local.sports','transfer_amount',100,'messages_enabled',false))).*;
  insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending) values(tid,c.id,c.player1_id,true) returning * into held;
  select * into strict t from public.tournaments where id=tid;
  if held.is_pending or held.payment_proof_path is not null or not inscription_private.registration_ready(held,t) then raise exception 'FAIL reserved signup not eligible without receipt'; end if;
  insert into public.zones(id,tournament_id,name) values(zid,tid,'Local reserved couple');
  insert into public.zone_couples(zone_id,couple_id) values(zid,c.id);
  if not exists(select 1 from public.zone_couples where zone_id=zid and couple_id=c.id) then raise exception 'FAIL real sporting trigger rejected reserved couple'; end if;
  update public.tournaments set reserve_slot_without_proof=false where id=tid;
  insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending) values(tid,other_c.id,other_c.player1_id,true) returning * into waiting;
  if waiting.occupies_slot or waiting.is_pending then raise exception 'FAIL deferred payment signup did not wait exclusively for cupo'; end if;
  begin
    insert into public.zone_couples(zone_id,couple_id) values(zid,other_c.id);
    raise exception 'FAIL unreserved couple entered sporting play';
  exception when raise_exception then
    if sqlerrm not like 'La pareja está pendiente de cupo%' then raise; end if;
  end;
  update public.inscriptions set is_pending=true where id=held.id;
  if (select is_pending from public.inscriptions where id=held.id) then raise exception 'FAIL legacy action reintroduced manual approval'; end if;
  if not (select occupies_slot from public.inscriptions where id=held.id) then raise exception 'FAIL policy update lost existing place'; end if;
  if exists(select 1 from public.inscription_payments where inscription_id=held.id and has_paid) then raise exception 'FAIL receipt-free confirmation marked money received'; end if;
end $$;
rollback;
