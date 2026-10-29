-- Couple capacity follows a concrete requirement: required proof or explicit approval.
-- Remote deployment belongs to the repository owner's CI/CD.
-- Normalize only future registration policy; preserve all acquired and waiting places.
update public.tournaments set reserve_slot_without_proof=true
  where not enable_transfer_proof and not validate_inscriptions and not reserve_slot_without_proof;

create or replace function inscription_private.normalize_registration_policy()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not coalesce(new.enable_transfer_proof,false) and not coalesce(new.validate_inscriptions,false) then
    new.reserve_slot_without_proof:=true;
  end if;
  return new;
end $$;
revoke all on function inscription_private.normalize_registration_policy() from public,anon,authenticated;
create trigger normalize_registration_policy
  before insert or update of enable_transfer_proof,validate_inscriptions,reserve_slot_without_proof on public.tournaments
  for each row execute function inscription_private.normalize_registration_policy();
comment on column public.tournaments.reserve_slot_without_proof is
  'Reserve at signup or when the required proof arrives. Without a proof requirement, deferred capacity is assigned by explicit organizer approval. No proof and no manual approval always reserves at signup.';

create or replace function inscription_private.guard_registration_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.tournaments%rowtype; manages boolean; occupied integer; actor uuid; relevant boolean; explicit_claim boolean; intentional_admission boolean; approval_claim boolean;
begin
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
      or new.proof_waived_at is distinct from old.proof_waived_at or new.couple_id is distinct from old.couple_id
      or new.is_pending is distinct from old.is_pending;
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
    new.occupies_slot := intentional_admission or new.proof_waived_at is not null or t.reserve_slot_without_proof
      or (not t.validate_inscriptions and (not t.enable_transfer_proof or coalesce(new.payment_method,'TRANSFER')='CASH'))
      or (t.enable_transfer_proof and coalesce(new.payment_method,'TRANSFER')='TRANSFER' and new.payment_proof_path is not null);
    return new;
  end if;
  if old.occupies_slot then new.occupies_slot:=true; return new; end if;
  -- A deliberate approval assigns an available place in the same transaction.
  -- The nested bulk approval caused by a settings change never promotes old rows.
  approval_claim := pg_catalog.pg_trigger_depth()=1 and old.is_pending is true and new.is_pending is not true
    and (not t.enable_transfer_proof or new.payment_method='CASH'
      or new.payment_proof_path is not null or new.proof_waived_at is not null);
  explicit_claim := new.occupies_slot or approval_claim;
  if explicit_claim or (t.enable_transfer_proof and new.payment_method='TRANSFER'
    and new.payment_proof_path is not null and new.payment_proof_path is distinct from old.payment_proof_path)
    or (new.payment_method='CASH' and new.payment_method is distinct from old.payment_method and new.is_pending is not true) then
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
notify pgrst,'reload schema';
