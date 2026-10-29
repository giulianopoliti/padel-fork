-- LOCAL ONLY. Run after all capacity migrations in an isolated local copy.
begin;
create function pg_temp.make_policy_registration(p_tid uuid,p_method text default null,p_pending boolean default false,p_manager uuid default null)
returns public.inscriptions language plpgsql as $$
declare p public.players%rowtype; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); i public.inscriptions%rowtype;
begin
  select * into strict p from public.players limit 1;
  insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id',a,'user_id',null,'dni',a::text))).*;
  insert into public.players select (jsonb_populate_record(null::public.players,to_jsonb(p)||jsonb_build_object('id',b,'user_id',null,'dni',b::text))).*;
  insert into public.couples(id,player1_id,player2_id) values(c,a,b);
  if p_manager is null then
    insert into public.inscriptions(tournament_id,couple_id,player_id,payment_method,is_pending) values(p_tid,c,a,p_method,p_pending) returning * into i;
  else
    insert into public.inscriptions(tournament_id,couple_id,player_id,payment_method,is_pending,pairing_source,paired_by_user_id)
      values(p_tid,c,null,p_method,p_pending,'ORGANIZER',p_manager) returning * into i;
  end if;
  return i;
end $$;
do $$
declare t public.tournaments%rowtype; snapshot public.tournaments%rowtype; tid uuid; manager uuid;
  deposit boolean; reserve_initial boolean; legacy_approval boolean; initial_place boolean;
  i public.inscriptions%rowtype; cash_i public.inscriptions%rowtype; deferred_i public.inscriptions%rowtype; path text;
begin
  select * into strict snapshot from public.tournaments where club_id is not null and type::text='AMERICAN' limit 1;
  select user_id into strict manager from public.clubes where id=snapshot.club_id;
  foreach deposit in array array[false,true] loop
    foreach reserve_initial in array array[false,true] loop
      foreach legacy_approval in array array[false,true] loop
        tid:=gen_random_uuid();
        insert into public.tournaments select (jsonb_populate_record(null::public.tournaments,to_jsonb(snapshot)||jsonb_build_object(
          'id',tid,'name','Payment policy local','seo_slug',tid::text,'status','NOT_STARTED','max_participants',null,
          'bracket_status','NOT_STARTED','registration_locked',false,'registration_locked_by_capacity',false,
          'enable_transfer_proof',deposit,'reserve_slot_without_proof',reserve_initial,'allow_cash_payment',true,
          'validate_inscriptions',legacy_approval,'transfer_alias','local.policy','transfer_amount',100,'messages_enabled',false))).*;
        initial_place:=reserve_initial or not deposit;
        select * into strict i from pg_temp.make_policy_registration(tid,case when deposit then 'TRANSFER' end,true);
        select * into strict t from public.tournaments where id=tid;
        if t.validate_inscriptions or i.is_pending then raise exception 'FAIL manual approval was reintroduced'; end if;
        if t.reserve_slot_without_proof is distinct from initial_place or i.occupies_slot is distinct from initial_place then raise exception 'FAIL payment capacity matrix deposit=% reserve=%',deposit,reserve_initial; end if;
        if inscription_private.registration_ready(i,t) is distinct from initial_place then raise exception 'FAIL proof incorrectly controlled participation'; end if;
        select * into strict cash_i from pg_temp.make_policy_registration(tid,'CASH',true);
        if not cash_i.occupies_slot or cash_i.is_pending then raise exception 'FAIL cash did not reserve directly'; end if;
        if exists(select 1 from public.inscription_payments where inscription_id=cash_i.id and has_paid) then raise exception 'FAIL cash became money received'; end if;
        select * into strict deferred_i from pg_temp.make_policy_registration(tid,case when deposit then 'TRANSFER' end,true);
        select * into strict deferred_i from public.manage_inscription_admission(deferred_i.id,tid,deferred_i.payment_revision,manager,'approve');
        if deferred_i.occupies_slot is distinct from initial_place then raise exception 'FAIL legacy approval granted capacity'; end if;
        if deposit then
          path:='tournament/'||tid||'/inscription/'||i.id||'/proof.pdf';
          insert into public.inscription_proof_cleanup(path,available_at) values(path,now()+interval '15 minutes');
          select * into strict i from public.change_inscription_payment(i.id,tid,i.payment_revision,'attach',path);
          if not i.occupies_slot then raise exception 'FAIL required proof did not assign an available place'; end if;
          select * into strict i from public.change_inscription_payment(i.id,tid,i.payment_revision,'remove',null,true);
          if not inscription_private.registration_ready(i,t) then raise exception 'FAIL removing a proof disqualified a reserved couple'; end if;
          select * into strict deferred_i from public.change_inscription_payment(deferred_i.id,tid,deferred_i.payment_revision,'cash',null,true);
          if not deferred_i.occupies_slot then raise exception 'FAIL cash method switch did not reserve'; end if;
        end if;
        select * into strict i from pg_temp.make_policy_registration(tid,case when deposit then 'TRANSFER' end,false,manager);
        if not i.occupies_slot then raise exception 'FAIL explicit organizer creation did not admit'; end if;
        update public.tournaments set reserve_slot_without_proof=not reserve_initial where id=tid;
        if not (select occupies_slot from public.inscriptions where id=cash_i.id) then raise exception 'FAIL policy change removed an existing place'; end if;
      end loop;
    end loop;
  end loop;
  update public.tournaments set enable_transfer_proof=true,reserve_slot_without_proof=false where id=tid;
  select * into strict i from pg_temp.make_policy_registration(tid,'TRANSFER');
  update public.tournaments set enable_transfer_proof=false where id=tid;
  path:='tournament/'||tid||'/inscription/'||i.id||'/historical.pdf';
  insert into public.inscription_proof_cleanup(path,available_at) values(path,now()+interval '15 minutes');
  select * into strict i from public.change_inscription_payment(i.id,tid,i.payment_revision,'attach',path);
  if i.occupies_slot or i.payment_proof_path<>path then raise exception 'FAIL optional historical evidence reassigned a prior waiting place'; end if;
end $$;
rollback;
