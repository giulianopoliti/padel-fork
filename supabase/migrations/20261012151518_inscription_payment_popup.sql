-- No historical objects are swept. Only new uploads and detached proofs enter this queue.
alter table public.inscriptions add column payment_revision integer not null default 0;
create table public.inscription_proof_cleanup (
  path text primary key,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts integer not null default 0
);
alter table public.inscription_proof_cleanup enable row level security;
revoke all on public.inscription_proof_cleanup from public, anon, authenticated;
grant all on public.inscription_proof_cleanup to service_role;
create index inscription_proof_cleanup_due_idx on public.inscription_proof_cleanup(available_at);
create index if not exists inscriptions_proof_path_idx on public.inscriptions(payment_proof_path)
  where payment_proof_path is not null;

create or replace function inscription_private.track_payment_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.payment_revision := old.payment_revision + 1;
  return new;
end $$;
revoke all on function inscription_private.track_payment_revision() from public, anon, authenticated;
create trigger inscription_payment_revision before update on public.inscriptions
  for each row execute function inscription_private.track_payment_revision();

-- Transactional outbox covers cancellation, rejection and every FK cascade.
create or replace function inscription_private.queue_detached_proof()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.payment_proof_path is not null then
    if tg_op = 'DELETE' or old.payment_proof_path is distinct from new.payment_proof_path then
      insert into public.inscription_proof_cleanup(path) values(old.payment_proof_path)
      on conflict(path) do update set available_at = now();
    end if;
  end if;
  return null;
end $$;
revoke all on function inscription_private.queue_detached_proof() from public, anon, authenticated;
create trigger inscription_detached_proof after delete or update of payment_proof_path on public.inscriptions
  for each row execute function inscription_private.queue_detached_proof();

-- Only trusted server code can invoke these functions, after checking ownership/management.
-- Uploads have a cleanup ticket BEFORE Storage is called. A worker claim prevents late linking.
create or replace function public.change_inscription_payment(
  p_id uuid, p_tournament_id uuid, p_revision integer, p_operation text,
  p_path text default null, p_manager boolean default false
) returns setof public.inscriptions language plpgsql security invoker set search_path = '' as $$
declare i public.inscriptions%rowtype; t public.tournaments%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text, 701));
  select * into i from public.inscriptions where id = p_id and tournament_id = p_tournament_id for update;
  if not found then raise exception 'La inscripción ya no existe' using errcode = 'P0002'; end if;
  if i.payment_revision <> p_revision then raise exception 'El pago cambió. Actualizá antes de guardar' using errcode = '40001'; end if;
  if not p_manager and i.payment_proof_status = 'APPROVED' then
    raise exception 'El comprobante aprobado sólo puede modificarlo el organizador' using errcode = '42501';
  end if;
  select * into strict t from public.tournaments where id = p_tournament_id;
  if p_operation in ('attach', 'replace') then
    if i.payment_method is distinct from 'TRANSFER' and not (i.payment_method is null and i.payment_proof_path is not null) then
      raise exception 'Elegí transferencia antes de subir el comprobante';
    end if;
    if (p_operation = 'attach' and i.payment_proof_path is not null) or (p_operation = 'replace' and i.payment_proof_path is null) then
      raise exception 'El comprobante cambió. Actualizá antes de guardar' using errcode = '40001';
    end if;
    perform 1 from public.inscription_proof_cleanup where path = p_path and claimed_at is null and available_at > now() for update;
    if not found or p_path not like 'tournament/' || p_tournament_id::text || '/inscription/' || p_id::text || '/%' then
      raise exception 'El intento de subida venció. Seleccioná el archivo nuevamente';
    end if;
    update public.inscriptions set payment_proof_path = p_path, payment_proof_status = 'PENDING_REVIEW',
      payment_proof_uploaded_at = now(), payment_reviewed_at = null, payment_reviewed_by = null where id = p_id;
    delete from public.inscription_proof_cleanup where path = p_path;
  elsif p_operation = 'remove' then
    update public.inscriptions set payment_proof_path = null, payment_proof_uploaded_at = null,
      payment_proof_status = 'NOT_REQUIRED', payment_reviewed_at = null, payment_reviewed_by = null where id = p_id;
  elsif p_operation in ('cash', 'transfer') then
    if p_operation = 'cash' and not t.allow_cash_payment then raise exception 'Este torneo no permite efectivo'; end if;
    if p_operation = 'transfer' and (not t.enable_transfer_proof or nullif(trim(t.transfer_alias), '') is null or coalesce(t.transfer_amount, 0) <= 0) then
      raise exception 'El organizador debe configurar la transferencia';
    end if;
    update public.inscriptions set payment_method = case when p_operation = 'cash' then 'CASH' else 'TRANSFER' end,
      payment_proof_path = null, payment_proof_uploaded_at = null, payment_proof_status = 'NOT_REQUIRED',
      payment_reviewed_at = null, payment_reviewed_by = null
      where id = p_id;
  else raise exception 'Acción inválida'; end if;
  return query select * from public.inscriptions where id = p_id;
end $$;
revoke all on function public.change_inscription_payment(uuid, uuid, integer, text, text, boolean) from public, anon, authenticated;
grant execute on function public.change_inscription_payment(uuid, uuid, integer, text, text, boolean) to service_role;

create or replace function public.claim_inscription_proof_cleanup(p_limit integer default 20)
returns setof public.inscription_proof_cleanup language plpgsql security invoker set search_path = '' as $$
begin
  return query with jobs as (
    select q.path from public.inscription_proof_cleanup q
    where q.available_at <= now() and (q.claimed_at is null or q.claimed_at < now() - interval '10 minutes')
    and not exists(select 1 from public.inscriptions i where i.payment_proof_path = q.path)
    order by q.available_at for update skip locked limit least(greatest(p_limit, 1), 100)
  ) update public.inscription_proof_cleanup q set claimed_at = now(), attempts = attempts + 1
    from jobs where q.path = jobs.path returning q.*;
end $$;
revoke all on function public.claim_inscription_proof_cleanup(integer) from public, anon, authenticated;
grant execute on function public.claim_inscription_proof_cleanup(integer) to service_role;
create or replace function inscription_private.guard_registration_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments%rowtype;
  c public.couples%rowtype;
  occupied integer;
  manages boolean;
begin
  if current_setting('role', true) in ('authenticated', 'anon') and auth.uid() is null then
    raise exception 'Debes iniciar sesión para inscribirte' using errcode = '42501';
  end if;
  if new.couple_id is null then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.tournament_id::text, 701));
  select * into strict t from public.tournaments where id = new.tournament_id;
  select * into strict c from public.couples where id = new.couple_id;

  if tg_op = 'INSERT' then
    if coalesce(new.es_prueba, false) = false then
      select count(*) into occupied from public.inscriptions
        where tournament_id = new.tournament_id and couple_id is not null and es_prueba = false;
      if t.max_participants is not null and occupied >= t.max_participants then
        raise exception 'El torneo ya no tiene cupo' using errcode = 'P0001';
      end if;
      if exists (
        -- Individual-to-couple conversion creates the couple before removing
        -- the individual rows. Preserve that existing ordering.
        select 1 from public.inscriptions i join public.couples existing on existing.id = i.couple_id
        where i.tournament_id = new.tournament_id and (
          existing.player1_id in (c.player1_id, c.player2_id) or
          existing.player2_id in (c.player1_id, c.player2_id)
        )
      ) then raise exception 'Uno de los jugadores ya está inscrito' using errcode = '23505'; end if;
    end if;
    if new.payment_method is null and t.enable_transfer_proof then new.payment_method := 'TRANSFER'; end if;
    if new.payment_method = 'TRANSFER' then
      if not t.enable_transfer_proof or nullif(trim(t.transfer_alias), '') is null or coalesce(t.transfer_amount, 0) <= 0 then
        raise exception 'El organizador debe configurar la transferencia' using errcode = 'P0001';
      end if;
      new.payment_alias_snapshot := t.transfer_alias;
      new.payment_amount_snapshot := t.transfer_amount;
    end if;
  elsif new.payment_method is distinct from old.payment_method then
    if new.payment_method not in ('CASH', 'TRANSFER') or new.payment_method is null then
      raise exception 'Forma de pago inválida';
    end if;
    if new.payment_proof_path is not null then raise exception 'Retirá la asociación del comprobante al cambiar el pago'; end if;
    if new.payment_method = 'TRANSFER' then
      if not t.enable_transfer_proof or nullif(trim(t.transfer_alias), '') is null or coalesce(t.transfer_amount, 0) <= 0 then
        raise exception 'El organizador debe configurar la transferencia';
      end if;
      new.payment_alias_snapshot := t.transfer_alias;
      new.payment_amount_snapshot := t.transfer_amount;
    end if;
  end if;

  if new.payment_method = 'CASH' and (tg_op = 'INSERT' or new.payment_method is distinct from old.payment_method) then
    if not t.allow_cash_payment then raise exception 'Este torneo no permite efectivo' using errcode = 'P0001'; end if;
    new.payment_proof_status := 'NOT_REQUIRED';
    new.payment_alias_snapshot := null;
    new.payment_amount_snapshot := null;
  end if;

  -- Proofs are uploaded and linked by a server route after ownership checks.
  -- Preserve organizer review, but do not allow a player to forge a storage path.
  if current_setting('role', true) in ('authenticated', 'anon') then
    select exists(select 1 from public.users u where u.id = auth.uid() and u.role::text = 'ADMIN')
      or exists(select 1 from public.clubes club where club.id = t.club_id and club.user_id = auth.uid())
      or exists(select 1 from public.organization_members m where m.organizacion_id = t.organization_id and m.user_id = auth.uid() and m.is_active)
      into manages;
    if not manages and not exists(select 1 from public.players p where p.id in (c.player1_id, c.player2_id) and p.user_id = auth.uid()) then
      raise exception 'Sin permisos sobre esta inscripción' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      if new.payment_proof_path is not null or new.payment_proof_status <> 'NOT_REQUIRED' then
        raise exception 'El comprobante debe adjuntarse desde la inscripción' using errcode = '42501';
      end if;
    elsif new.payment_proof_path is distinct from old.payment_proof_path or
      (not manages and (new.payment_proof_status is distinct from old.payment_proof_status or
        (new.payment_method is not distinct from old.payment_method and
          (new.payment_alias_snapshot is distinct from old.payment_alias_snapshot or new.payment_amount_snapshot is distinct from old.payment_amount_snapshot)))) then
      raise exception 'El comprobante debe adjuntarse desde la inscripción' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function inscription_private.guard_registration_payment() from public, anon, authenticated;

