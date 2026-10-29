-- Registration capacity depends only on the payment policy.
-- Remote deployment is performed separately by the repository owner through CI/CD.
create or replace function inscription_private.normalize_registration_policy()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.validate_inscriptions:=false;
  if not coalesce(new.enable_transfer_proof,false) then new.reserve_slot_without_proof:=true; end if;
  return new;
end $$;
revoke all on function inscription_private.normalize_registration_policy() from public,anon,authenticated;

create or replace function inscription_private.registration_ready(i public.inscriptions,t public.tournaments)
returns boolean language sql immutable set search_path = '' as $$
  select i.couple_id is not null and i.occupies_slot;
$$;
revoke all on function inscription_private.registration_ready(public.inscriptions,public.tournaments) from public,anon,authenticated;

create or replace function inscription_private.guard_registration_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.tournaments%rowtype; manages boolean; occupied integer; actor uuid; relevant boolean; explicit_claim boolean; intentional_admission boolean;
begin
  new.is_pending:=false;
  actor := auth.uid();
  manages := inscription_private.manages_registration(new.tournament_id,actor);
  if tg_op='UPDATE' then
    if current_setting('role',true) in ('anon','authenticated') then
      if actor is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
      if new.occupies_slot is distinct from old.occupies_slot or new.proof_waived_at is distinct from old.proof_waived_at
        or new.proof_waived_by is distinct from old.proof_waived_by or new.proof_waiver_reason is distinct from old.proof_waiver_reason then
        raise exception 'El cupo y las admisiones se gestionan desde la operación autorizada' using errcode='42501';
      end if;
      if new.es_prueba is distinct from old.es_prueba then raise exception 'La condición de prueba no se modifica desde el cliente' using errcode='42501'; end if;
      if new.is_pending is distinct from old.is_pending and not manages then
        raise exception 'Sólo el organizador puede aprobar la inscripción' using errcode='42501';
      end if;
      if new.tournament_id is distinct from old.tournament_id or new.couple_id is distinct from old.couple_id
        or new.player_id is distinct from old.player_id then
        raise exception 'Los cambios de pareja requieren la operación autorizada' using errcode='42501';
      end if;
      if new.payment_method is distinct from old.payment_method then
        raise exception 'El medio de pago se modifica desde la operación autorizada' using errcode='42501';
      end if;
    end if;
    relevant := new.payment_proof_path is distinct from old.payment_proof_path
      or new.payment_method is distinct from old.payment_method or new.occupies_slot is distinct from old.occupies_slot
      or new.proof_waived_at is distinct from old.proof_waived_at or new.couple_id is distinct from old.couple_id;
    if not relevant then return new; end if;
  end if;
  if new.couple_id is null then new.occupies_slot:=false; return new; end if;
  -- Same lock ordering as the existing pair RPC. Payment RPCs below use it too.
  perform solo_player_private.lock_scope(new.tournament_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.tournament_id::text,701));
  select * into strict t from public.tournaments where id=new.tournament_id;
  if tg_op='INSERT' then
    if current_setting('role',true) in ('anon','authenticated') then
      if actor is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
      if new.proof_waived_at is not null or new.proof_waived_by is not null or new.proof_waiver_reason is not null then
        raise exception 'La excepción requiere autorización del organizador' using errcode='42501';
      end if;
      if not manages then new.is_pending:=coalesce(t.validate_inscriptions,false); end if;
      if not inscription_private.can_claim_registration_slot(t) then raise exception 'Las inscripciones están cerradas'; end if;
    end if;
    -- Explicit organizer admissions/imports retain their place in every policy mode.
    intentional_admission := coalesce((manages and new.player_id is null)
      or (current_setting('role',true) not in ('anon','authenticated') and new.pairing_source='ORGANIZER'
        and inscription_private.manages_registration(new.tournament_id,new.paired_by_user_id)),false);
    -- Organizer-created rows are intentional admissions, including imports.
    if new.payment_proof_path is null and t.enable_transfer_proof and (
      (manages and new.player_id is null)
      or (current_setting('role',true) not in ('anon','authenticated') and new.pairing_source='ORGANIZER'
        and inscription_private.manages_registration(new.tournament_id,new.paired_by_user_id))
    ) then
      new.proof_waived_at:=now(); new.proof_waived_by:=coalesce(actor,new.paired_by_user_id);
      new.proof_waiver_reason:='Alta realizada por el organizador';
    end if;
    new.occupies_slot := intentional_admission or new.proof_waived_at is not null or not t.enable_transfer_proof
      or coalesce(new.payment_method,'TRANSFER')='CASH' or t.reserve_slot_without_proof
      or (t.enable_transfer_proof and coalesce(new.payment_method,'TRANSFER')='TRANSFER' and new.payment_proof_path is not null);
    return new;
  end if;
  if old.occupies_slot then new.occupies_slot:=true; return new; end if;
  explicit_claim := new.occupies_slot;
  if explicit_claim or (t.enable_transfer_proof and new.payment_method='TRANSFER'
    and new.payment_proof_path is not null and new.payment_proof_path is distinct from old.payment_proof_path)
    or (new.payment_method='CASH' and new.payment_method is distinct from old.payment_method) then
    if not inscription_private.can_claim_registration_slot(t) then
      if explicit_claim then raise exception 'La fase actual o el cierre del torneo no permite asignar cupo'; end if;
      new.occupies_slot:=false; return new;
    end if;
    select count(*) into occupied from public.inscriptions where tournament_id=new.tournament_id
      and couple_id is not null and es_prueba=false and occupies_slot and id<>new.id;
    new.occupies_slot := t.max_participants is null or occupied<t.max_participants;
    if explicit_claim and not new.occupies_slot then raise exception 'El torneo ya no tiene cupo' using errcode='P0001'; end if;
  else new.occupies_slot:=false;
  end if;
  return new;
end $$;
revoke all on function inscription_private.guard_registration_capacity() from public,anon,authenticated;

create or replace function inscription_private.require_complete_registrations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tid uuid; cid uuid; pair_ids uuid[]; t public.tournaments%rowtype; i public.inscriptions%rowtype;
begin
  if current_setting('role',true) in ('anon','authenticated') and auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  if tg_table_name='tournaments' then
    if new.status is distinct from old.status and new.status::text in ('PAIRING','ZONES_READY','MATCHES_READY','IN_PROGRESS','ZONE_PHASE','ELIMINATION','BRACKET_PHASE') then
      perform inscription_private.assert_exclusions_acknowledged(new.id);
    end if;
    return new;
  end if;
  if tg_table_name='zones' then perform inscription_private.assert_exclusions_acknowledged(new.tournament_id); return new; end if;
  if tg_table_name='tournament_couple_seeds' then
    tid:=new.tournament_id; pair_ids:=array[new.couple_id];
    if not exists(select 1 from public.tournament_couple_seeds where tournament_id=tid) then
      perform inscription_private.assert_exclusions_acknowledged(tid);
    end if;
  elsif tg_table_name='matches' then
    if tg_op='UPDATE' and new.couple1_id is not distinct from old.couple1_id and new.couple2_id is not distinct from old.couple2_id then return new; end if;
    tid:=new.tournament_id; pair_ids:=array[new.couple1_id,new.couple2_id];
    if tg_op='INSERT' and not exists(select 1 from public.matches where tournament_id=tid) then
      perform inscription_private.assert_exclusions_acknowledged(tid);
    end if;
  else
    if tg_op='UPDATE' and new.couple_id is not distinct from old.couple_id and new.zone_id is not distinct from old.zone_id then return new; end if;
    select tournament_id into tid from public.zones where id=new.zone_id;
    pair_ids:=array[new.couple_id];
  end if;
  select * into strict t from public.tournaments where id=tid;
  foreach cid in array pair_ids loop
    if cid is null then continue; end if;
    select * into i from public.inscriptions where tournament_id=tid and couple_id=cid;
    -- Existing virtual couples/placeholders are not public registrations.
    if not found then
      if exists(select 1 from public.couples c where c.id=cid and coalesce(c.es_prueba,false)) then continue; end if;
      raise exception 'La pareja no tiene una inscripción habilitada';
    end if;
    if not i.occupies_slot then raise exception 'La pareja está pendiente de cupo'; end if;

  end loop;
  return new;
end $$;
revoke all on function inscription_private.require_complete_registrations() from public,anon,authenticated;

-- Remove the retired administrative requirement without allocating waiting places,
-- changing files/payment reviews, or sending historical registration notifications.
alter table public.inscriptions disable trigger registration_capacity_events;
update public.tournaments set validate_inscriptions=false,
  reserve_slot_without_proof=case when not enable_transfer_proof then true else reserve_slot_without_proof end
  where validate_inscriptions or (not enable_transfer_proof and not reserve_slot_without_proof);
update public.inscriptions set is_pending=false where is_pending;
alter table public.inscriptions enable trigger registration_capacity_events;
comment on column public.tournaments.validate_inscriptions is 'Retired manual approval flag. Kept false for compatibility with older clients.';
comment on column public.tournaments.reserve_slot_without_proof is
  'Transfer signup reserves immediately or on receipt upload. No deposit and cash always reserve at signup. A missing receipt never disqualifies a couple that already has a place.';
notify pgrst,'reload schema';
