-- Existing inscriptions retain NULL: no historical payment method is inferred.
alter table public.tournaments add column if not exists allow_cash_payment boolean not null default false;
alter table public.inscriptions add column if not exists payment_method text
  check (payment_method in ('TRANSFER', 'CASH'));
create index if not exists inscriptions_missing_proof_idx on public.inscriptions(tournament_id)
  where payment_method = 'TRANSFER' and payment_proof_path is null;

create schema if not exists inscription_private;
revoke all on schema inscription_private from public, anon, authenticated;

-- Internal trigger only. Full visibility is necessary for capacity and duplicate
-- checks, including tournaments whose inscriptions are not publicly visible.
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
    -- Only an incomplete transfer can switch to currently permitted cash.
    if (old.payment_method is not null and old.payment_method <> 'TRANSFER') or old.payment_proof_path is not null or new.payment_method is distinct from 'CASH' then
      raise exception 'No se puede cambiar la forma de pago de esta inscripción' using errcode = 'P0001';
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
create trigger inscription_payment_guard before insert or update of payment_method, payment_proof_path, payment_proof_status, payment_alias_snapshot, payment_amount_snapshot
  on public.inscriptions for each row execute function inscription_private.guard_registration_payment();

create or replace function inscription_private.require_complete_registrations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  if current_setting('role', true) in ('authenticated', 'anon') and auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if tg_table_name = 'matches' and tg_op = 'UPDATE' then
    if new.couple1_id is not distinct from old.couple1_id and new.couple2_id is not distinct from old.couple2_id then return new; end if;
  end if;
  if tg_table_name = 'tournaments' then
    if new.status = old.status or new.status::text not in ('PAIRING', 'ZONES_READY', 'MATCHES_READY', 'IN_PROGRESS', 'ZONE_PHASE', 'ELIMINATION', 'BRACKET_PHASE') then return new; end if;
    tid := new.id;
  elsif tg_table_name = 'zone_couples' then
    select tournament_id into tid from public.zones where id = new.zone_id;
  else tid := new.tournament_id;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tid::text, 701));
  if exists(select 1 from public.inscriptions where tournament_id = tid and payment_method = 'TRANSFER' and payment_proof_path is null) then
    raise exception 'Hay inscripciones sin comprobante. Completalas o cancelalas desde Inscripciones antes de armar zonas o partidos.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function inscription_private.require_complete_registrations() from public, anon, authenticated;
create trigger require_complete_inscriptions before update of status on public.tournaments
  for each row execute function inscription_private.require_complete_registrations();
create trigger require_complete_inscriptions before insert on public.zones
  for each row execute function inscription_private.require_complete_registrations();
create trigger require_complete_inscriptions before insert or update of couple_id, zone_id on public.zone_positions
  for each row execute function inscription_private.require_complete_registrations();
create trigger require_complete_inscriptions before insert or update of couple_id, zone_id on public.zone_couples
  for each row execute function inscription_private.require_complete_registrations();
create trigger require_complete_inscriptions before insert or update of couple1_id, couple2_id on public.matches
  for each row execute function inscription_private.require_complete_registrations();
