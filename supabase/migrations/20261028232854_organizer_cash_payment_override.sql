-- An organizer may record cash for one inscription without changing the
-- payment methods available for player self-registration. Remote deployment: CI/CD.
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
        where tournament_id = new.tournament_id and couple_id is not null and es_prueba = false and occupies_slot;
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
    -- Only the server-only payment RPC can authorize a per-inscription exception.
    -- An authenticated player cannot use a custom setting to bypass this check.
    if not t.allow_cash_payment and not coalesce(tg_op='UPDATE'
      and current_setting('role',true) not in ('anon','authenticated')
      and current_setting('inscription_private.manager_cash_inscription',true)=new.id::text,false) then
      raise exception 'Este torneo no permite efectivo' using errcode = 'P0001';
    end if;
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

create or replace function public.change_inscription_payment(
  p_id uuid, p_tournament_id uuid, p_revision integer, p_operation text,
  p_path text default null, p_manager boolean default false
) returns setof public.inscriptions language plpgsql security definer set search_path = '' as $$
declare i public.inscriptions%rowtype; t public.tournaments%rowtype; previous_cash_override text;
begin
  perform solo_player_private.lock_scope(p_tournament_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text, 701));
  select * into i from public.inscriptions where id = p_id and tournament_id = p_tournament_id for update;
  if not found then raise exception 'La inscripción ya no existe' using errcode = 'P0002'; end if;
  if i.payment_revision <> p_revision then raise exception 'El pago cambió. Actualizá antes de guardar' using errcode = 'PT409'; end if;
  if not p_manager and i.payment_proof_status = 'APPROVED' then
    raise exception 'El comprobante aprobado sólo puede modificarlo el organizador' using errcode = '42501';
  end if;
  select * into strict t from public.tournaments where id = p_tournament_id;
  if p_operation in ('attach', 'replace') then
    if i.payment_method is distinct from 'TRANSFER' and not (i.payment_method is null and i.payment_proof_path is not null) then
      raise exception 'Elegí transferencia antes de subir el comprobante';
    end if;
    if (p_operation = 'attach' and i.payment_proof_path is not null) or (p_operation = 'replace' and i.payment_proof_path is null) then
      raise exception 'El comprobante cambió. Actualizá antes de guardar' using errcode = 'PT409';
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
    if p_operation = 'cash' and not t.allow_cash_payment and not p_manager then raise exception 'Este torneo no permite efectivo'; end if;
    if p_operation = 'transfer' and (not t.enable_transfer_proof or nullif(trim(t.transfer_alias), '') is null or coalesce(t.transfer_amount, 0) <= 0) then
      raise exception 'El organizador debe configurar la transferencia';
    end if;
    if p_operation='cash' and p_manager then
      previous_cash_override:=current_setting('inscription_private.manager_cash_inscription',true);
      perform set_config('inscription_private.manager_cash_inscription',p_id::text,true);
    end if;
    update public.inscriptions set payment_method = case when p_operation = 'cash' then 'CASH' else 'TRANSFER' end,
      payment_proof_path = null, payment_proof_uploaded_at = null, payment_proof_status = 'NOT_REQUIRED',
      payment_reviewed_at = null, payment_reviewed_by = null
      where id = p_id;
  else raise exception 'Acción inválida'; end if;
  if p_operation='cash' and p_manager then
    perform set_config('inscription_private.manager_cash_inscription',coalesce(previous_cash_override,''),true);
  end if;
  return query select * from public.inscriptions where id = p_id;
end $$;


revoke all on function inscription_private.guard_registration_payment() from public,anon,authenticated;
revoke all on function public.change_inscription_payment(uuid,uuid,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.change_inscription_payment(uuid,uuid,integer,text,text,boolean) to service_role;
notify pgrst,'reload schema';
