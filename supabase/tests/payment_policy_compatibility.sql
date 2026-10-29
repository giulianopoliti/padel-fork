-- LOCAL ONLY. Copy payment_only_registration_capacity.sql beside this file.
begin;
alter table public.tournaments disable trigger normalize_registration_policy;
alter table public.inscriptions disable trigger b_registration_capacity_guard;
create temporary table payment_compatibility_fixture(tid uuid,held uuid,waiting uuid,deposit boolean,event_count bigint);
do $$
declare t public.tournaments%rowtype; tid uuid; c public.couples%rowtype; other_c public.couples%rowtype;
  held uuid; waiting uuid; deposit boolean;
begin
  select * into strict t from public.tournaments where club_id is not null and type::text='AMERICAN' limit 1;
  select * into strict c from public.couples where not es_prueba limit 1;
  select * into strict other_c from public.couples where not es_prueba
    and player1_id not in(c.player1_id,c.player2_id) and player2_id not in(c.player1_id,c.player2_id) limit 1;
  foreach deposit in array array[false,true] loop
    tid:=gen_random_uuid();
    insert into public.tournaments select (jsonb_populate_record(null::public.tournaments,to_jsonb(t)||jsonb_build_object(
      'id',tid,'name','Payment policy compatibility local','seo_slug',tid::text,'status','NOT_STARTED','max_participants',null,
      'bracket_status','NOT_STARTED','registration_locked',false,'registration_locked_by_capacity',false,
      'enable_transfer_proof',deposit,'reserve_slot_without_proof',false,'validate_inscriptions',true,
      'transfer_alias','local.compatibility','transfer_amount',100,'messages_enabled',false))).*;
    insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending,occupies_slot) values(tid,c.id,c.player1_id,true,true) returning id into held;
    insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending,occupies_slot) values(tid,other_c.id,other_c.player1_id,true,false) returning id into waiting;
    insert into payment_compatibility_fixture select tid,held,waiting,deposit,count(*) from inscription_private.registration_events where tournament_id=tid;
  end loop;
end $$;
alter table public.tournaments enable trigger normalize_registration_policy;
alter table public.inscriptions enable trigger b_registration_capacity_guard;
\ir payment_only_registration_capacity.sql
do $$
declare f payment_compatibility_fixture%rowtype;
begin
  for f in select * from payment_compatibility_fixture loop
    if (select validate_inscriptions from public.tournaments where id=f.tid) then raise exception 'FAIL retired manual configuration survived'; end if;
    if (select reserve_slot_without_proof from public.tournaments where id=f.tid) is distinct from not f.deposit then raise exception 'FAIL payment reservation policy normalized incorrectly'; end if;
    if not (select occupies_slot from public.inscriptions where id=f.held) then raise exception 'FAIL existing place removed'; end if;
    if (select occupies_slot from public.inscriptions where id=f.waiting) then raise exception 'FAIL waiting place allocated by migration'; end if;
    if exists(select 1 from public.inscriptions where tournament_id=f.tid and (is_pending or payment_proof_path is not null or proof_waived_at is not null)) then raise exception 'FAIL approval survived or payment data invented'; end if;
    if (select count(*) from inscription_private.registration_events where tournament_id=f.tid)<>f.event_count then raise exception 'FAIL migration queued historical messages'; end if;
  end loop;
end $$;
rollback;
