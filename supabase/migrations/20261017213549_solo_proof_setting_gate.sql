-- A saved transfer method does not keep a disabled tournament requirement alive.
-- Preserve proof files, payment snapshots and independent inscription approval.
create or replace function inscription_private.require_complete_registrations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tid uuid; proof_required boolean;
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
    proof_required := coalesce(new.enable_transfer_proof, false);
  elsif tg_table_name = 'zone_couples' then
    select tournament_id into tid from public.zones where id = new.zone_id;
  else tid := new.tournament_id;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tid::text, 701));
  if tg_table_name <> 'tournaments' then
    select coalesce(t.enable_transfer_proof, false) into proof_required from public.tournaments t where t.id = tid;
  end if;
  if proof_required and exists(select 1 from public.inscriptions where tournament_id = tid and couple_id is not null and payment_method = 'TRANSFER' and payment_proof_path is null) then
    raise exception 'Hay inscripciones sin comprobante. Completalas o cancelalas desde Inscripciones antes de armar zonas o partidos.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function inscription_private.require_complete_registrations() from public, anon, authenticated;
