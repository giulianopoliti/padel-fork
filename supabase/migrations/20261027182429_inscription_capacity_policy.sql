-- Authored/validated locally. Remote deployment belongs to the owner's CI/CD.
-- PT409 is an optimistic conflict, not a retryable PostgreSQL serialization failure.
alter table public.tournaments add column reserve_slot_without_proof boolean not null default true;
alter table public.inscriptions add column occupies_slot boolean not null default true;
alter table public.inscriptions add column proof_waived_at timestamptz;
alter table public.inscriptions add column proof_waived_by uuid references public.users(id) on delete set null;
alter table public.inscriptions add column proof_waiver_reason text;
-- Preserve every historical couple's place; individuals never consume a couple place.
update public.inscriptions set occupies_slot = false where couple_id is null;
alter table public.inscriptions add constraint inscriptions_individual_no_slot check (couple_id is not null or not occupies_slot);
alter table public.inscriptions add constraint inscriptions_proof_waiver_consistency check (
  (proof_waived_at is null and proof_waived_by is null and proof_waiver_reason is null)
  or (proof_waived_at is not null and nullif(btrim(proof_waiver_reason),'') is not null)
);
create index inscriptions_occupied_slots_idx on public.inscriptions(tournament_id) where occupies_slot and couple_id is not null and es_prueba = false;
create index inscriptions_without_slot_idx on public.inscriptions(tournament_id,created_at) where not occupies_slot and couple_id is not null;

create or replace function inscription_private.manages_registration(p_tournament_id uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_actor is not null and exists(
    select 1 from public.tournaments t where t.id=p_tournament_id and (
      exists(select 1 from public.users u where u.id=p_actor and u.role::text='ADMIN')
      or exists(select 1 from public.clubes c join public.users u on u.id=c.user_id where c.id=t.club_id and c.user_id=p_actor and u.role::text='CLUB')
      or exists(select 1 from public.organization_members m join public.users u on u.id=m.user_id where m.organizacion_id=t.organization_id and m.user_id=p_actor and m.is_active and u.role::text='ORGANIZADOR')
    )
  );
$$;
revoke all on function inscription_private.manages_registration(uuid,uuid) from public,anon,authenticated;

create or replace function inscription_private.guard_inscription_actor()
returns trigger language plpgsql security definer set search_path='' as $$
declare target public.inscriptions%rowtype; actor uuid; owns boolean;
begin
  if current_setting('role',true) not in ('anon','authenticated') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  actor:=auth.uid();
  if actor is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  if tg_op in ('UPDATE','DELETE') then target:=old; else target:=new; end if;
  if inscription_private.manages_registration(target.tournament_id,actor) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if target.couple_id is null then
    select exists(select 1 from public.players p where p.id=target.player_id and p.user_id=actor) into owns;
  else
    select exists(select 1 from public.couples c join public.players p on p.id in(c.player1_id,c.player2_id)
      where c.id=target.couple_id and p.user_id=actor) into owns;
  end if;
  if not owns then raise exception 'Sin permisos sobre esta inscripción' using errcode='42501'; end if;
  if tg_op='INSERT' and coalesce(new.es_prueba,false) then raise exception 'No podés crear inscripciones de prueba' using errcode='42501'; end if;
  if tg_op='INSERT' and (new.pairing_source='ORGANIZER' or new.paired_by_user_id is not null) then
    raise exception 'La admisión del organizador requiere la operación autorizada' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function inscription_private.guard_inscription_actor() from public,anon,authenticated;
create trigger a0_registration_actor_guard before insert or update or delete on public.inscriptions
for each row execute function inscription_private.guard_inscription_actor();

create or replace function inscription_private.can_claim_registration_slot(t public.tournaments)
returns boolean language sql immutable set search_path = '' as $$
  select t.status::text in ('NOT_STARTED','PAIRING','ZONE_REGISTRATION','ZONE_PHASE')
    and not (coalesce(t.registration_locked,false) and not coalesce(t.registration_locked_by_capacity,false))
    and coalesce(t.bracket_status::text,'') not in ('BRACKET_GENERATED','BRACKET_ACTIVE');
$$;
revoke all on function inscription_private.can_claim_registration_slot(public.tournaments) from public,anon,authenticated;

create or replace function inscription_private.registration_ready(i public.inscriptions,t public.tournaments)
returns boolean language sql immutable set search_path = '' as $$
  select i.couple_id is not null and i.occupies_slot and not coalesce(i.is_pending,false)
    and not (t.enable_transfer_proof and coalesce(i.payment_method='TRANSFER',false) and i.payment_proof_path is null and i.proof_waived_at is null);
$$;
revoke all on function inscription_private.registration_ready(public.inscriptions,public.tournaments) from public,anon,authenticated;

-- Capacity changes and administrative exemptions must not be writable through the Data API.
-- Existing narrow payment/review triggers continue protecting file paths and reviews.
create or replace function inscription_private.guard_registration_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.tournaments%rowtype; manages boolean; occupied integer; actor uuid; relevant boolean; explicit_claim boolean;
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
    -- Organizer-created rows are intentional admissions, including imports.
    if new.payment_proof_path is null and t.enable_transfer_proof and (
      (manages and new.player_id is null)
      or (current_setting('role',true) not in ('anon','authenticated') and new.pairing_source='ORGANIZER'
        and inscription_private.manages_registration(new.tournament_id,new.paired_by_user_id))
    ) then
      new.proof_waived_at:=now(); new.proof_waived_by:=coalesce(actor,new.paired_by_user_id);
      new.proof_waiver_reason:='Alta realizada por el organizador';
    end if;
    new.occupies_slot := not (t.enable_transfer_proof and coalesce(new.payment_method,'TRANSFER')='TRANSFER'
      and new.payment_proof_path is null and new.proof_waived_at is null and not t.reserve_slot_without_proof);
    return new;
  end if;
  if old.occupies_slot then new.occupies_slot:=true; return new; end if;
  explicit_claim := new.occupies_slot;
  if explicit_claim or (new.payment_proof_path is not null and new.payment_proof_path is distinct from old.payment_proof_path)
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
create trigger b_registration_capacity_guard before insert or update on public.inscriptions
for each row execute function inscription_private.guard_registration_capacity();

create or replace function inscription_private.bump_registration_revision()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.occupies_slot is distinct from old.occupies_slot or new.is_pending is distinct from old.is_pending
    or new.proof_waived_at is distinct from old.proof_waived_at then
    new.payment_revision:=greatest(new.payment_revision,old.payment_revision+1);
  end if;
  return new;
end $$;
revoke all on function inscription_private.bump_registration_revision() from public,anon,authenticated;
create trigger z_registration_revision before update on public.inscriptions
for each row execute function inscription_private.bump_registration_revision();

create table inscription_private.registration_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  inscription_id uuid references public.inscriptions(id) on delete set null,
  actor_id uuid references public.users(id) on delete set null,
  kind text not null check(kind in ('SUBMITTED','CONFIRMED','CAPACITY_FULL','PROOF_WITHOUT_SLOT','SLOT_ASSIGNED','PROOF_WAIVED')),
  payload jsonb not null default '{}'::jsonb,
  notification_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  delivered_at timestamptz, claimed_at timestamptz, attempts integer not null default 0,
  available_at timestamptz not null default now(), last_error text
);
alter table inscription_private.registration_events enable row level security;
revoke all on inscription_private.registration_events from public,anon,authenticated;
create index registration_events_due_idx on inscription_private.registration_events(available_at) where delivered_at is null;

create or replace function inscription_private.capture_registration_notification_preference()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  select coalesce(messages_enabled,true) into new.notification_allowed from public.tournaments where id=new.tournament_id;
  return new;
end $$;
revoke all on function inscription_private.capture_registration_notification_preference() from public,anon,authenticated;
create trigger registration_event_notification_preference before insert on inscription_private.registration_events
for each row execute function inscription_private.capture_registration_notification_preference();

create table inscription_private.exclusion_acknowledgements (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  actor_id uuid not null references public.users(id) on delete cascade,
  signature text not null, expires_at timestamptz not null,
  primary key(tournament_id,actor_id)
);
alter table inscription_private.exclusion_acknowledgements enable row level security;
revoke all on inscription_private.exclusion_acknowledgements from public,anon,authenticated;

create or replace function inscription_private.exclusion_signature(p_tid uuid)
returns text language sql stable security definer set search_path='' as $$
  select case when count(i.id)=0 then null else md5(
    coalesce(string_agg(i.id::text||':'||i.payment_revision::text,',' order by i.id),'')||':'||
    t.enable_transfer_proof::text||':'||coalesce(t.max_participants::text,'unlimited')||':'||
    coalesce(t.registration_locked::text,'false')||':'||coalesce(t.bracket_status::text,'')
  ) end
  from public.tournaments t left join public.inscriptions i on i.tournament_id=t.id and i.couple_id is not null
    and i.es_prueba=false and not inscription_private.registration_ready(i,t)
  where t.id=p_tid group by t.id;
$$;
create or replace function inscription_private.assert_exclusions_acknowledged(p_tid uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_signature text;
begin
  v_signature:=inscription_private.exclusion_signature(p_tid);
  if v_signature is null then return; end if;
  if not exists(select 1 from inscription_private.exclusion_acknowledgements a where a.tournament_id=p_tid
    and a.signature=v_signature and a.expires_at>now() and inscription_private.manages_registration(p_tid,a.actor_id)) then
    raise exception 'Hay parejas pendientes que no se incluirán. Revisalas y confirmá Continuar sin estas parejas antes de organizar el torneo' using errcode='P0001';
  end if;
end $$;
create or replace function public.acknowledge_registration_exclusions(p_tournament_id uuid,p_actor uuid,p_signature text)
returns void language plpgsql security definer set search_path='' as $$
declare v_signature text;
begin
  if not inscription_private.manages_registration(p_tournament_id,p_actor) then raise exception 'Sin permisos sobre el torneo' using errcode='42501'; end if;
  perform solo_player_private.lock_scope(p_tournament_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text,701));
  v_signature:=inscription_private.exclusion_signature(p_tournament_id);
  if v_signature is distinct from p_signature then raise exception 'Las inscripciones cambiaron. Revisá el listado actualizado' using errcode='PT409'; end if;
  if v_signature is not null then
    insert into inscription_private.exclusion_acknowledgements(tournament_id,actor_id,signature,expires_at)
      values(p_tournament_id,p_actor,v_signature,now()+interval '10 minutes')
      on conflict(tournament_id,actor_id) do update set signature=excluded.signature,expires_at=excluded.expires_at;
  end if;
end $$;
create or replace function public.registration_exclusion_state(p_tournament_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('signature',s.signature,'acknowledged',s.signature is null or exists(
    select 1 from inscription_private.exclusion_acknowledgements a where a.tournament_id=p_tournament_id
      and a.signature=s.signature and a.expires_at>now() and inscription_private.manages_registration(p_tournament_id,a.actor_id)
  )) from (select inscription_private.exclusion_signature(p_tournament_id) signature) s;
$$;
revoke all on function inscription_private.exclusion_signature(uuid),inscription_private.assert_exclusions_acknowledged(uuid),
  public.acknowledge_registration_exclusions(uuid,uuid,text),public.registration_exclusion_state(uuid) from public,anon,authenticated;
grant execute on function public.acknowledge_registration_exclusions(uuid,uuid,text),public.registration_exclusion_state(uuid) to service_role;

create or replace function public.get_tournament_registration_readiness(p_tournament_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('tournament',jsonb_build_object('id',t.id,'max_participants',t.max_participants,
    'enable_transfer_proof',t.enable_transfer_proof,'status',t.status,'registration_locked',t.registration_locked,
    'registration_locked_by_capacity',t.registration_locked_by_capacity,'bracket_status',t.bracket_status),
    'exclusions',public.registration_exclusion_state(t.id),'pairs',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id,'couple_id',i.couple_id,'is_pending',i.is_pending,
        'occupies_slot',i.occupies_slot,'payment_method',i.payment_method,'has_proof',i.payment_proof_path is not null,
        'proof_waived_at',i.proof_waived_at,'payment_revision',i.payment_revision,
        'name',concat_ws(' / ',nullif(btrim(concat_ws(' ',p1.first_name,p1.last_name)),''),nullif(btrim(concat_ws(' ',p2.first_name,p2.last_name)),''))) order by i.created_at,i.id)
      from public.inscriptions i join public.couples c on c.id=i.couple_id
      left join public.players p1 on p1.id=c.player1_id left join public.players p2 on p2.id=c.player2_id
      where i.tournament_id=t.id and i.couple_id is not null and i.es_prueba=false
    ),'[]'::jsonb)) from public.tournaments t where t.id=p_tournament_id;
$$;
revoke all on function public.get_tournament_registration_readiness(uuid) from public,anon,authenticated;
grant execute on function public.get_tournament_registration_readiness(uuid) to service_role;

create or replace function inscription_private.record_registration_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.tournaments%rowtype; occupied integer; pending integer; obtained boolean; ready boolean;
begin
  if coalesce(new.es_prueba,false) then return null; end if;
  if new.couple_id is null then
    if tg_op='INSERT' then insert into inscription_private.registration_events(tournament_id,inscription_id,actor_id,kind)
      values(new.tournament_id,new.id,auth.uid(),'SUBMITTED'); end if;
    if not coalesce(new.is_pending,false) and (tg_op='INSERT' or coalesce(old.is_pending,false)) then
      insert into inscription_private.registration_events(tournament_id,inscription_id,kind) values(new.tournament_id,new.id,'CONFIRMED');
    end if;
    return null;
  end if;
  select * into strict t from public.tournaments where id=new.tournament_id;
  if tg_op='INSERT' then
    insert into inscription_private.registration_events(tournament_id,inscription_id,actor_id,kind)
      values(new.tournament_id,new.id,auth.uid(),'SUBMITTED');
    obtained:=new.occupies_slot;
    ready:=inscription_private.registration_ready(new,t);
  else
    obtained:=new.occupies_slot and not old.occupies_slot;
    ready:=inscription_private.registration_ready(new,t) and not inscription_private.registration_ready(old,t);
    if new.payment_proof_path is not null and old.payment_proof_path is null and not new.occupies_slot then
      insert into inscription_private.registration_events(tournament_id,inscription_id,kind)
        values(new.tournament_id,new.id,'PROOF_WITHOUT_SLOT');
    end if;
    if obtained then insert into inscription_private.registration_events(tournament_id,inscription_id,actor_id,kind)
      values(new.tournament_id,new.id,auth.uid(),'SLOT_ASSIGNED'); end if;
  end if;
  if new.proof_waived_at is not null and (tg_op='INSERT' or old.proof_waived_at is null) then
    insert into inscription_private.registration_events(tournament_id,inscription_id,actor_id,kind,payload)
      values(new.tournament_id,new.id,new.proof_waived_by,'PROOF_WAIVED',jsonb_build_object('reason',new.proof_waiver_reason));
  end if;
  if ready then insert into inscription_private.registration_events(tournament_id,inscription_id,kind)
    values(new.tournament_id,new.id,'CONFIRMED'); end if;
  if obtained and t.max_participants is not null then
    select count(*) filter(where occupies_slot),count(*) filter(where not occupies_slot) into occupied,pending
      from public.inscriptions where tournament_id=new.tournament_id and couple_id is not null and es_prueba=false;
    if occupied>=t.max_participants and pending>0 then
      insert into inscription_private.registration_events(tournament_id,kind,payload)
      values(new.tournament_id,'CAPACITY_FULL',jsonb_build_object('occupied',occupied,'pending',pending));
    end if;
  end if;
  return null;
end $$;
revoke all on function inscription_private.record_registration_events() from public,anon,authenticated;
create trigger registration_capacity_events after insert or update on public.inscriptions
for each row execute function inscription_private.record_registration_events();

create or replace function inscription_private.notify_removed_proof_requirement()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.enable_transfer_proof and not new.enable_transfer_proof then
    insert into inscription_private.registration_events(tournament_id,inscription_id,kind)
      select new.id,i.id,'CONFIRMED' from public.inscriptions i where i.tournament_id=new.id
        and i.couple_id is not null and not i.es_prueba and i.occupies_slot and not coalesce(i.is_pending,false)
        and i.payment_method='TRANSFER' and i.payment_proof_path is null and i.proof_waived_at is null;
  end if;
  return null;
end $$;
revoke all on function inscription_private.notify_removed_proof_requirement() from public,anon,authenticated;
create trigger registration_requirement_removed after update of enable_transfer_proof on public.tournaments
for each row execute function inscription_private.notify_removed_proof_requirement();

create or replace function public.manage_inscription_admission(
  p_id uuid,p_tournament_id uuid,p_revision integer,p_actor uuid,p_operation text
) returns setof public.inscriptions language plpgsql security definer set search_path = '' as $$
declare i public.inscriptions%rowtype; t public.tournaments%rowtype;
begin
  if not inscription_private.manages_registration(p_tournament_id,p_actor) then raise exception 'Sin permisos sobre el torneo' using errcode='42501'; end if;
  if p_revision is null or p_revision<0 or p_operation is null or p_operation not in ('approve','assign','admit','admit-without-proof') then raise exception 'Acción o revisión inválida' using errcode='22023'; end if;
  perform solo_player_private.lock_scope(p_tournament_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text,701));
  select * into strict t from public.tournaments where id=p_tournament_id;
  select * into i from public.inscriptions where id=p_id and tournament_id=p_tournament_id for update;
  if not found then raise exception 'La inscripción ya no existe' using errcode='P0002'; end if;
  if i.payment_revision<>p_revision then raise exception 'La inscripción cambió. Actualizá antes de continuar' using errcode='PT409'; end if;
  if p_operation='approve' then
    update public.inscriptions set is_pending=false where id=p_id;
  else
    if not inscription_private.can_claim_registration_slot(t) then raise exception 'La fase actual o el cierre del torneo no permite nuevas admisiones'; end if;
    if p_operation<>'admit-without-proof' and t.enable_transfer_proof and i.payment_method='TRANSFER'
      and i.payment_proof_path is null and i.proof_waived_at is null then raise exception 'Falta el comprobante. Usá Admitir sin comprobante para autorizar una excepción'; end if;
    update public.inscriptions set occupies_slot=true,
      is_pending=case when p_operation in ('admit','admit-without-proof') then false else is_pending end,
      proof_waived_at=case when p_operation='admit-without-proof' and t.enable_transfer_proof and i.payment_method='TRANSFER' and i.payment_proof_path is null then coalesce(proof_waived_at,now()) else proof_waived_at end,
      proof_waived_by=case when p_operation='admit-without-proof' and t.enable_transfer_proof and i.payment_method='TRANSFER' and i.payment_proof_path is null and i.proof_waived_at is null then p_actor else proof_waived_by end,
      proof_waiver_reason=case when p_operation='admit-without-proof' and t.enable_transfer_proof and i.payment_method='TRANSFER' and i.payment_proof_path is null then coalesce(proof_waiver_reason,'Admitida sin comprobante por el organizador') else proof_waiver_reason end
      where id=p_id;
  end if;
  return query select * from public.inscriptions where id=p_id;
end $$;
revoke all on function public.manage_inscription_admission(uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.manage_inscription_admission(uuid,uuid,integer,uuid,text) to service_role;

create or replace function inscription_private.guard_tournament_capacity_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare occupied integer;
begin
  if new.max_participants is not null and new.max_participants is distinct from old.max_participants then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text,701));
    select count(*) into occupied from public.inscriptions where tournament_id=new.id and couple_id is not null and es_prueba=false and occupies_slot;
    if new.max_participants<occupied then raise exception 'El máximo no puede ser menor a los cupos ya ocupados' using errcode='P0001'; end if;
    if new.max_participants=occupied and exists(select 1 from public.inscriptions where tournament_id=new.id and couple_id is not null and not occupies_slot) then
      insert into inscription_private.registration_events(tournament_id,kind,payload)
        values(new.id,'CAPACITY_FULL',jsonb_build_object('occupied',occupied));
    end if;
  end if;
  return new;
end $$;
revoke all on function inscription_private.guard_tournament_capacity_limit() from public,anon,authenticated;
create trigger tournament_capacity_limit before update of max_participants on public.tournaments
for each row execute function inscription_private.guard_tournament_capacity_limit();

-- Guard the actual pairs being introduced, rather than vetoing the entire tournament.
create or replace function inscription_private.require_complete_registrations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tid uuid; cid uuid; pair_ids uuid[]; t public.tournaments%rowtype; i public.inscriptions%rowtype; existing_member boolean;
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
    if not i.occupies_slot or coalesce(i.is_pending,false) then raise exception 'La pareja está pendiente de cupo o aprobación'; end if;
    if t.enable_transfer_proof and i.payment_method='TRANSFER' and i.payment_proof_path is null and i.proof_waived_at is null then
      select exists(select 1 from public.zone_couples zc join public.zones z on z.id=zc.zone_id where z.tournament_id=tid and zc.couple_id=cid)
        or exists(select 1 from public.matches m where m.tournament_id=tid and cid in (m.couple1_id,m.couple2_id)) into existing_member;
      if not existing_member then raise exception 'Falta el comprobante o la admisión del organizador para incorporar esta pareja'; end if;
    end if;
  end loop;
  return new;
end $$;
revoke all on function inscription_private.require_complete_registrations() from public,anon,authenticated;
create trigger registration_seed_eligibility before insert or update of couple_id,tournament_id on public.tournament_couple_seeds
for each row execute function inscription_private.require_complete_registrations();

create or replace function public.claim_registration_events(p_limit integer default 20)
returns setof jsonb language plpgsql security definer set search_path = '' as $$
begin
  return query with jobs as (
    select id from inscription_private.registration_events where delivered_at is null and attempts<8 and available_at<=now()
      and (claimed_at is null or claimed_at<now()-interval '10 minutes') order by created_at for update skip locked limit least(greatest(p_limit,1),50)
  ) update inscription_private.registration_events e set claimed_at=now(),attempts=e.attempts+1
    from jobs where e.id=jobs.id returning to_jsonb(e);
end $$;
create or replace function public.finish_registration_event(p_id uuid,p_attempt integer,p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update inscription_private.registration_events set claimed_at=null,last_error=left(p_error,500),
    delivered_at=case when p_error is null then now() else null end,
    available_at=now()+least(interval '1 hour',interval '1 minute'*power(2,least(attempts,6)))
    where id=p_id and attempts=p_attempt and delivered_at is null;
$$;
revoke all on function public.claim_registration_events(integer),public.finish_registration_event(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.claim_registration_events(integer),public.finish_registration_event(uuid,integer,text) to service_role;

create or replace function public.prepare_registration_event(p_id uuid,p_attempt integer,p_message jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prepared jsonb;
begin
  update inscription_private.registration_events set payload=jsonb_set(payload,'{message}',coalesce(payload->'message',p_message))
    where id=p_id and attempts=p_attempt and delivered_at is null and claimed_at is not null returning payload->'message' into prepared;
  if not found then raise exception 'El aviso cambió de ejecución' using errcode='PT409'; end if;
  return prepared;
end $$;
revoke all on function public.prepare_registration_event(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_registration_event(uuid,integer,jsonb) to service_role;
notify pgrst,'reload schema';








-- Updated existing registration/payment RPCs, with the same signatures.
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

create or replace function public.change_inscription_payment(
  p_id uuid, p_tournament_id uuid, p_revision integer, p_operation text,
  p_path text default null, p_manager boolean default false
) returns setof public.inscriptions language plpgsql security definer set search_path = '' as $$
declare i public.inscriptions%rowtype; t public.tournaments%rowtype;
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

create or replace function public.approve_inscription_proof(
  p_id uuid, p_tournament_id uuid, p_revision integer, p_path text, p_reviewer uuid
) returns setof public.inscriptions
language plpgsql security definer set search_path = '' as $$
declare i public.inscriptions%rowtype;
begin
  if p_revision is null or p_revision < 0 or p_reviewer is null or nullif(p_path, '') is null then
    raise exception 'Solicitud de revisión inválida' using errcode = '22023';
  end if;
  perform solo_player_private.lock_scope(p_tournament_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text, 701));
  select * into i from public.inscriptions where id = p_id and tournament_id = p_tournament_id for update;
  if not found then raise exception 'La inscripción ya no existe' using errcode = 'P0002'; end if;
  if i.payment_proof_path is distinct from p_path then
    raise exception 'El comprobante cambió. Actualizá antes de aprobar' using errcode = 'PT409';
  end if;
  -- Repeated responses/competing reviewers do not rewrite attribution.
  if i.payment_revision = p_revision + 1 and i.payment_proof_status = 'APPROVED' and i.payment_reviewed_at is not null then
    return next i;
    return;
  end if;
  if i.payment_revision <> p_revision then
    raise exception 'El pago cambió. Actualizá antes de aprobar' using errcode = 'PT409';
  end if;
  if i.payment_proof_status <> 'PENDING_REVIEW' or (i.payment_method is not null and i.payment_method <> 'TRANSFER') then
    raise exception 'No hay un comprobante pendiente de revisión' using errcode = '22023';
  end if;
  update public.inscriptions set payment_proof_status = 'APPROVED', payment_reviewed_at = now(), payment_reviewed_by = p_reviewer where id = p_id;
  return query select * from public.inscriptions where id = p_id;
end $$;

create or replace function solo_player_private.confirm_tournament_pair(
  p_tournament_id uuid, p_player1_id uuid, p_player2_id uuid, p_actor_id uuid,
  p_tenant text, p_request_id uuid default null, p_payment_method text default null,
  p_terms_accepted boolean default false, p_allow_blocked_override boolean default false,
  p_organizer boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments%rowtype; r public.solo_player_requests%rowtype;
  post public.solo_player_posts%rowtype; a public.players%rowtype; b public.players%rowtype;
  saved public.inscriptions%rowtype; v_couple_id uuid; manages boolean; actor_role text;
  cfg jsonb; occupied integer; source text; terms text := '2026-08-28';
  initial_score numeric; initial_category text;
begin
  if p_actor_id is null or p_player1_id is null or p_player2_id is null or p_player1_id = p_player2_id
    or p_tenant is null or p_tenant not in ('padel-fv','padel-elite') then
    raise exception 'Datos de emparejamiento inválidos' using errcode = '22023';
  end if;
  select role::text into actor_role from public.users where id = p_actor_id;
  if not found then raise exception 'Usuario no autenticado' using errcode = '42501'; end if;

  -- Same ordering as phase 1: tournament row -> scope 702 -> payment/capacity 701.
  -- Do not update the tournament row while holding these locks: capacity UI sync
  -- runs after commit. Closure/config changes wait for this transaction's share.
  perform solo_player_private.lock_scope(p_tournament_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tournament_id::text, 701));
  select * into strict t from public.tournaments where id = p_tournament_id;
  select actor_role = 'ADMIN'
    or (actor_role = 'CLUB' and exists(select 1 from public.clubes c where c.id=t.club_id and c.user_id=p_actor_id))
    or (actor_role = 'ORGANIZADOR' and exists(select 1 from public.organization_members m
      where m.organizacion_id=t.organization_id and m.user_id=p_actor_id and m.is_active)) into manages;
  if p_organizer and not manages then raise exception 'Sin permisos sobre el torneo' using errcode = '42501'; end if;

  if p_request_id is not null then
    select * into r from public.solo_player_requests where id=p_request_id for update;
    if not found or r.tournament_id is distinct from p_tournament_id or r.recipient_user_id <> p_actor_id
      or r.sender_player_id <> p_player1_id or r.recipient_player_id <> p_player2_id or p_organizer then
      raise exception 'Sin permisos sobre la solicitud' using errcode = '42501';
    end if;
    if r.status = 'ACCEPTED' and r.inscription_id is not null then
      select * into strict saved from public.inscriptions where id=r.inscription_id;
      return jsonb_build_object('inscription',to_jsonb(saved),'request_status',r.status,'created',false);
    end if;
    if r.status <> 'PENDING' then raise exception 'Solicitud no disponible' using errcode = 'P0001'; end if;
    select * into strict post from public.solo_player_posts where id=r.post_id for update;
    if post.status <> 'ACTIVE' or (r.expires_at is not null and r.expires_at <= now()) then
      raise exception 'Solicitud vencida o publicación no disponible' using errcode = 'P0001';
    end if;
    source := 'REQUEST';
  else
    source := case when p_organizer then 'ORGANIZER' else 'LEGACY_CONVERSION' end;
  end if;

  if t.status::text not in ('NOT_STARTED','PAIRING','ZONE_REGISTRATION','ZONE_PHASE')
    or (coalesce(t.registration_locked,false) and not coalesce(t.registration_locked_by_capacity,false))
    or (t.created_at < '2025-07-01'::timestamptz and t.status::text <> 'ZONE_PHASE'
      and coalesce(t.bracket_status::text,'') in ('BRACKET_GENERATED','BRACKET_ACTIVE'))
    or (not p_organizer and (coalesce(t.is_draft,false) or not coalesce(t.enable_public_inscriptions,false))) then
    raise exception 'El torneo ya no admite inscripciones' using errcode = 'P0001';
  end if;

  perform 1 from public.players where id in (p_player1_id,p_player2_id) order by id for update;
  select * into strict a from public.players where id=p_player1_id;
  select * into strict b from public.players where id=p_player2_id;
  if not p_organizer and p_request_id is null and a.user_id is distinct from p_actor_id then
    raise exception 'Sin permisos sobre los jugadores' using errcode = '42501';
  end if;
  if p_request_id is not null and (a.user_id is distinct from r.sender_user_id or b.user_id is distinct from r.recipient_user_id) then
    raise exception 'El vínculo de los jugadores cambió' using errcode = '42501';
  end if;

  -- A repeated organizer submission returns the canonical inscription even after
  -- its historical individual rows have been consumed.
  select i.* into saved from public.inscriptions i join public.couples c on c.id=i.couple_id
    where i.tournament_id=p_tournament_id and least(c.player1_id,c.player2_id)=least(p_player1_id,p_player2_id)
      and greatest(c.player1_id,c.player2_id)=greatest(p_player1_id,p_player2_id);
  if found and p_organizer then
    return jsonb_build_object('inscription',to_jsonb(saved),'created',false);
  end if;
  if exists(select 1 from public.inscriptions i join public.couples c on c.id=i.couple_id
    where i.tournament_id=p_tournament_id and (c.player1_id in (p_player1_id,p_player2_id) or c.player2_id in (p_player1_id,p_player2_id))) then
    raise exception 'Uno de los jugadores ya está inscrito en una pareja' using errcode = '23505';
  end if;
  if p_request_id is null and not p_organizer and not exists(select 1 from public.inscriptions i where i.tournament_id=p_tournament_id
    and i.couple_id is null and i.player_id in (p_player1_id,p_player2_id)) then
    raise exception 'Ninguno de los jugadores tiene inscripción individual en este torneo' using errcode = 'P0001';
  end if;
  select count(*) into occupied from public.inscriptions where tournament_id=p_tournament_id and couple_id is not null and es_prueba=false and occupies_slot;
  if t.max_participants is not null and occupied >= t.max_participants then
    if p_organizer then raise exception 'Cupos llenos. Modificá el límite de inscriptos para emparejarlos' using errcode='P0001'; end if;
    raise exception 'Cupos llenos' using errcode='P0001';
  end if;
  if p_payment_method is not null and p_payment_method not in ('TRANSFER','CASH') then
    raise exception 'Forma de pago inválida' using errcode='22023';
  end if;
  if p_payment_method='CASH' and not t.allow_cash_payment then raise exception 'Este torneo no permite efectivo'; end if;
  if t.gender::text = 'MIXED' then
    if a.gender::text not in ('MALE','FEMALE') or b.gender::text not in ('MALE','FEMALE') or a.gender=b.gender
      or a.gender is null or b.gender is null then raise exception 'La pareja debe ser mixta'; end if;
  elsif t.gender::text='FEMALE' and (a.gender::text is distinct from 'FEMALE' or b.gender::text is distinct from 'FEMALE') then
    raise exception 'Es un torneo femenino, ambas jugadoras deben ser femeninas.';
  end if;
  cfg := t.category_config;
  -- Preserve the existing registration-time initialization, inside the same
  -- rollback boundary. Merely publishing still never touches ranking/profile.
  if not coalesce(a.is_categorized and a.score is not null and nullif(trim(a.category_name),'') is not null,false)
    or not coalesce(b.is_categorized and b.score is not null and nullif(trim(b.category_name),'' ) is not null,false) then
    cfg := coalesce(cfg,jsonb_build_object('mode','SINGLE','category',t.category_name));
    if cfg->>'mode' = 'SINGLE' then
      select lower_range into initial_score from public.categories where name=cfg->>'category';
    elsif cfg->>'mode' = 'RANGE' then
      select round((c1.lower_range+c2.lower_range)/2.0) into initial_score from public.categories c1 cross join public.categories c2
        where c1.name=cfg->>'categoryA' and c2.name=cfg->>'categoryB';
    elsif cfg->>'mode' = 'MIXED_SUM' then
      select round(avg((c1.lower_range+c2.lower_range)/2.0)) into initial_score from public.categories c1 join public.categories c2 on c1.name<=c2.name
        where substring(c1.name from '^([0-9]+)')::integer + substring(c2.name from '^([0-9]+)')::integer = (cfg->>'targetSum')::integer;
    end if;
    select name into initial_category from public.categories where lower_range<=initial_score and (upper_range is null or upper_range>=initial_score)
      order by lower_range limit 1;
    if initial_category is null then raise exception 'No se pudo resolver la categoría inicial del torneo'; end if;
    update public.players set score=initial_score,category_name=initial_category,is_categorized=true
      where id in (p_player1_id,p_player2_id)
        and not coalesce(is_categorized and score is not null and nullif(trim(category_name),'') is not null,false);
    select * into strict a from public.players where id=p_player1_id;
    select * into strict b from public.players where id=p_player2_id;
  end if;
  if coalesce((cfg->>'validationEnabled')::boolean,false) then
    if a.category_name is null or b.category_name is null then raise exception 'Falta categoría de uno de los jugadores'; end if;
    if cfg->>'mode' = 'SINGLE' and (a.category_name <> cfg->>'category' or b.category_name <> cfg->>'category') then
      raise exception 'La pareja no cumple la categoría del torneo';
    elsif cfg->>'mode' = 'RANGE' and (a.category_name not in (cfg->>'categoryA',cfg->>'categoryB') or b.category_name not in (cfg->>'categoryA',cfg->>'categoryB')) then
      raise exception 'La pareja no cumple el rango de categorías';
    elsif cfg->>'mode' = 'MIXED_SUM' and coalesce(
      substring(a.category_name from '^([0-9]+)')::integer + substring(b.category_name from '^([0-9]+)')::integer = (cfg->>'targetSum')::integer,false)=false then
      raise exception 'La pareja no cumple la suma de categorías';
    end if;
  end if;
  if p_tenant='padel-elite' and t.type::text='AMERICAN' then
    if exists(select 1 from public.tpe_registration_blocks where player_id in (p_player1_id,p_player2_id) and unblocked_at is null)
      and not (p_organizer and p_allow_blocked_override) then
      raise exception 'Te prohibieron la inscripción a los torneos de Padel Elite, comunicate con los organizadores para resolverlo.';
    end if;
    if not p_organizer and (not coalesce(p_terms_accepted,false) or (p_request_id is not null
      and (r.tournament_terms_version is distinct from terms or post.tournament_terms_version is distinct from terms))) then
      raise exception 'Debes aceptar los Términos y Condiciones vigentes para inscribirte.';
    end if;
  end if;
  select id into v_couple_id from public.couples where least(player1_id,player2_id)=least(p_player1_id,p_player2_id)
    and greatest(player1_id,player2_id)=greatest(p_player1_id,p_player2_id) order by id limit 1;
  if v_couple_id is null then
    insert into public.couples(player1_id,player2_id) values(p_player1_id,p_player2_id) returning id into v_couple_id;
  end if;
  -- The universal inscription trigger invalidates pending alternatives. Resolve
  -- the winning request first, inside this transaction, so it is not invalidated.
  if p_request_id is not null then
    update public.solo_player_requests set status='ACCEPTED',resolved_at=now(),resolved_by=p_actor_id where id=r.id;
  end if;
  insert into public.inscriptions(tournament_id,couple_id,player_id,is_pending,payment_method,pairing_source,paired_by_user_id)
    values(p_tournament_id,v_couple_id,case when p_organizer then null else p_player1_id end,
      coalesce(t.validate_inscriptions,false) and not p_organizer,
      coalesce(p_payment_method,case when t.enable_transfer_proof then 'TRANSFER' end),source,p_actor_id) returning * into saved;
  -- Delete only the consumed individuals, in this same transaction; never any
  -- publication or unrelated tournament history.
  delete from public.inscriptions where tournament_id=p_tournament_id and couple_id is null and player_id in (p_player1_id,p_player2_id);
  if p_request_id is not null then
    update solo_player_private.request_contacts c set recipient_phone=pc.phone from solo_player_private.post_contacts pc
      where c.request_id=r.id and pc.post_id=r.post_id;
    update public.solo_player_requests set status='ACCEPTED',inscription_id=saved.id,resolved_at=now(),resolved_by=p_actor_id where id=r.id;
    perform solo_player_private.notify_request(r.id,'REQUEST_ACCEPTED');
  end if;
  if p_tenant='padel-elite' and t.type::text='AMERICAN' then
    if not p_organizer then
      insert into public.tpe_terms_acceptances(tournament_id,inscription_id,accepted_by_player_id,accepted_by_user_id,terms_version,terms_url)
        values(t.id,saved.id,p_player1_id,coalesce(r.sender_user_id,p_actor_id),terms,'/tournaments/terms');
      if p_request_id is not null then
        insert into public.tpe_terms_acceptances(tournament_id,inscription_id,accepted_by_player_id,accepted_by_user_id,terms_version,terms_url)
          values(t.id,saved.id,p_player2_id,p_actor_id,terms,'/tournaments/terms');
      end if;
    elsif p_allow_blocked_override then
      insert into public.tpe_registration_block_overrides(block_id,tournament_id,player_id,authorized_by_user_id)
        select id,t.id,player_id,p_actor_id from public.tpe_registration_blocks where player_id in (p_player1_id,p_player2_id) and unblocked_at is null;
    end if;
  end if;
  return jsonb_build_object('inscription',to_jsonb(saved),'request_status',case when p_request_id is not null then 'ACCEPTED' end,'created',true);
end $$;
