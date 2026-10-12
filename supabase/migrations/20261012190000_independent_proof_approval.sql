-- File approval is independent from inscription approval.
create function public.approve_inscription_proof(
  p_id uuid, p_tournament_id uuid, p_revision integer, p_path text, p_reviewer uuid
) returns setof public.inscriptions
language plpgsql security invoker set search_path = '' as $$
declare i public.inscriptions%rowtype;
begin
  if p_revision is null or p_revision < 0 or p_reviewer is null or nullif(p_path, '') is null then
    raise exception 'Solicitud de revisión inválida' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text, 701));
  select * into i from public.inscriptions where id = p_id and tournament_id = p_tournament_id for update;
  if not found then raise exception 'La inscripción ya no existe' using errcode = 'P0002'; end if;
  if i.payment_proof_path is distinct from p_path then
    raise exception 'El comprobante cambió. Actualizá antes de aprobar' using errcode = '40001';
  end if;
  -- Repeated responses/competing reviewers do not rewrite attribution.
  if i.payment_revision = p_revision + 1 and i.payment_proof_status = 'APPROVED' and i.payment_reviewed_at is not null then
    return next i;
    return;
  end if;
  if i.payment_revision <> p_revision then
    raise exception 'El pago cambió. Actualizá antes de aprobar' using errcode = '40001';
  end if;
  if i.payment_proof_status <> 'PENDING_REVIEW' or (i.payment_method is not null and i.payment_method <> 'TRANSFER') then
    raise exception 'No hay un comprobante pendiente de revisión' using errcode = '22023';
  end if;
  update public.inscriptions set payment_proof_status = 'APPROVED', payment_reviewed_at = now(), payment_reviewed_by = p_reviewer where id = p_id;
  return query select * from public.inscriptions where id = p_id;
end $$;
revoke all on function public.approve_inscription_proof(uuid, uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.approve_inscription_proof(uuid, uuid, integer, text, uuid) to service_role;

-- Review writes go through the authorized server operation, including metadata.
create function inscription_private.guard_proof_review()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_setting('role', true) not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.payment_reviewed_at is not null or new.payment_reviewed_by is not null or new.payment_proof_status = 'APPROVED' then
      raise exception 'La revisión debe realizarse desde el organizador' using errcode = '42501';
    end if;
  elsif new.payment_reviewed_at is distinct from old.payment_reviewed_at
    or new.payment_reviewed_by is distinct from old.payment_reviewed_by
    or (new.payment_proof_status = 'APPROVED' and old.payment_proof_status is distinct from new.payment_proof_status) then
    raise exception 'La revisión debe realizarse desde el organizador' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function inscription_private.guard_proof_review() from public, anon, authenticated;
create trigger inscription_proof_review_guard
before insert or update of payment_proof_status, payment_reviewed_at, payment_reviewed_by on public.inscriptions
for each row execute function inscription_private.guard_proof_review();
