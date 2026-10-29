-- LOCAL ONLY. Copy the new migration beside this file before running psql.
begin;
create temporary table compatibility_fixture(tid uuid,held uuid,pending uuid);
do $$
declare t public.tournaments%rowtype; tid uuid:=gen_random_uuid(); c public.couples%rowtype; other_c public.couples%rowtype; held uuid; pending uuid;
begin
  select * into strict t from public.tournaments where club_id is not null and type::text='AMERICAN' limit 1;
  select * into strict c from public.couples where not es_prueba limit 1;
  select * into strict other_c from public.couples where not es_prueba
    and player1_id not in(c.player1_id,c.player2_id) and player2_id not in(c.player1_id,c.player2_id) limit 1;
  insert into public.tournaments select (jsonb_populate_record(null::public.tournaments,to_jsonb(t)||jsonb_build_object(
    'id',tid,'name','Policy compatibility local','seo_slug',tid::text,'status','NOT_STARTED','max_participants',null,
    'bracket_status','NOT_STARTED','registration_locked',false,'registration_locked_by_capacity',false,
    'enable_transfer_proof',false,'reserve_slot_without_proof',true,'messages_enabled',false))).*;
  insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending) values(tid,c.id,c.player1_id,false) returning id into held;
  update public.tournaments set enable_transfer_proof=true,reserve_slot_without_proof=false,transfer_alias='local.compatibility',transfer_amount=100 where id=tid;
  insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending) values(tid,other_c.id,other_c.player1_id,false) returning id into pending;
  update public.tournaments set enable_transfer_proof=false where id=tid;
  -- A historical no-deposit tournament with an inactive false preference, one
  -- already-held place and one pending place after the proof requirement changed.
  insert into compatibility_fixture values(tid,held,pending);
end $$;
\ir independent_registration_policy.sql
do $$
declare f compatibility_fixture%rowtype;
begin
  select * into strict f from compatibility_fixture;
  if not (select reserve_slot_without_proof from public.tournaments where id=f.tid) then raise exception 'FAIL old no-deposit behavior was reinterpreted as manual admission'; end if;
  if not (select occupies_slot from public.inscriptions where id=f.held) then raise exception 'FAIL historical place removed'; end if;
  if (select occupies_slot from public.inscriptions where id=f.pending) then raise exception 'FAIL migration assigned a previous pending place'; end if;
  if (select count(*) from public.inscriptions where tournament_id=f.tid)<>2 then raise exception 'FAIL migration duplicated registrations'; end if;
end $$;
rollback;
