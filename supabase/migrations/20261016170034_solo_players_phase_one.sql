-- Phase 1 only: interests never write couples, inscriptions, zones or rankings.
-- Apply through the owner's CI/CD; agents must only validate this locally.
create schema if not exists solo_player_private;
revoke all on schema solo_player_private from public, anon, authenticated;
grant usage on schema solo_player_private to authenticated;

create table public.solo_player_posts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  category_name text not null references public.categories(name) on update cascade,
  preferred_side public."PREFERRED_SIDE" not null,
  preferred_hand text not null check (preferred_hand in ('RIGHT', 'LEFT')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'WITHDRAWN', 'EXPIRED', 'MATCHED')),
  public_phone boolean not null default false,
  contact_consent_version text not null check (contact_consent_version = 'solo-players-contact-v1'),
  contact_consented_at timestamptz not null default now(),
  tournament_terms_version text,
  tournament_terms_accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((tournament_id is null and expires_at is not null and tournament_terms_version is null and tournament_terms_accepted_at is null)
      or (tournament_id is not null and expires_at is null and nullif(trim(tournament_terms_version), '') is not null and tournament_terms_accepted_at is not null)),
  check (expires_at is null or expires_at > created_at)
);
-- Pausing preserves the same editable publication; expiry is materialized on writes.
create unique index solo_player_posts_open_general_key on public.solo_player_posts(owner_user_id)
  where tournament_id is null and status in ('ACTIVE', 'PAUSED');
create unique index solo_player_posts_open_tournament_key on public.solo_player_posts(owner_user_id, tournament_id)
  where tournament_id is not null and status in ('ACTIVE', 'PAUSED');
create index solo_player_posts_directory_idx on public.solo_player_posts(category_name, preferred_side, preferred_hand, created_at desc)
  where status = 'ACTIVE';
create index solo_player_posts_tournament_idx on public.solo_player_posts(tournament_id) where tournament_id is not null;
create index solo_player_posts_player_idx on public.solo_player_posts(player_id);

create table solo_player_private.post_contacts (
  post_id uuid primary key references public.solo_player_posts(id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$')
);

create table public.solo_player_requests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.solo_player_posts(id) on delete cascade,
  sender_user_id uuid not null references public.users(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  sender_player_id uuid not null references public.players(id) on delete cascade,
  recipient_player_id uuid not null references public.players(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'INVALIDATED')),
  expires_at timestamptz,
  contact_consent_version text not null check (contact_consent_version = 'solo-players-contact-v1'),
  contact_consented_at timestamptz not null default now(),
  tournament_terms_version text,
  tournament_terms_accepted_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  inscription_id uuid references public.inscriptions(id) on delete set null,
  created_at timestamptz not null default now(),
  check (sender_user_id <> recipient_user_id and sender_player_id <> recipient_player_id),
  check ((status = 'PENDING' and resolved_at is null and resolved_by is null) or (status <> 'PENDING' and resolved_at is not null)),
  check (tournament_id is not null or inscription_id is null),
  check ((tournament_id is null and tournament_terms_version is null and tournament_terms_accepted_at is null)
      or (tournament_id is not null and nullif(trim(tournament_terms_version), '') is not null and tournament_terms_accepted_at is not null))
);
-- Expression indexes handle NULL/general and reverse requests atomically.
create unique index solo_player_requests_pending_pair_key on public.solo_player_requests(
  least(sender_user_id, recipient_user_id), greatest(sender_user_id, recipient_user_id),
  coalesce(tournament_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where status = 'PENDING';
create index solo_player_requests_recipient_idx on public.solo_player_requests(recipient_user_id, created_at desc);
create index solo_player_requests_sender_idx on public.solo_player_requests(sender_user_id, created_at desc);
create index solo_player_requests_post_idx on public.solo_player_requests(post_id);
create index solo_player_requests_tournament_idx on public.solo_player_requests(tournament_id) where tournament_id is not null;
create index solo_player_requests_sender_player_idx on public.solo_player_requests(sender_player_id);
create index solo_player_requests_recipient_player_idx on public.solo_player_requests(recipient_player_id);
create index solo_player_requests_resolver_idx on public.solo_player_requests(resolved_by) where resolved_by is not null;
create index solo_player_requests_inscription_idx on public.solo_player_requests(inscription_id) where inscription_id is not null;

create table solo_player_private.request_contacts (
  request_id uuid primary key references public.solo_player_requests(id) on delete cascade,
  sender_phone text not null check (sender_phone ~ '^\+[1-9][0-9]{7,14}$'),
  recipient_phone text not null check (recipient_phone ~ '^\+[1-9][0-9]{7,14}$')
);

create table public.solo_player_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  request_id uuid not null references public.solo_player_requests(id) on delete cascade,
  event_type text not null check (event_type in ('REQUEST_RECEIVED', 'REQUEST_SENT', 'REQUEST_ACCEPTED', 'REQUEST_REJECTED', 'REQUEST_WITHDRAWN', 'REQUEST_EXPIRED', 'REQUEST_INVALIDATED')),
  read_at timestamptz,
  email_status text not null default 'PENDING' check (email_status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  email_attempts integer not null default 0 check (email_attempts >= 0),
  email_next_attempt_at timestamptz not null default now(),
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_user_id, request_id, event_type)
);
create index solo_player_notifications_inbox_idx on public.solo_player_notifications(recipient_user_id, created_at desc);
create index solo_player_notifications_unread_idx on public.solo_player_notifications(recipient_user_id) where read_at is null;
create index solo_player_notifications_email_idx on public.solo_player_notifications(email_next_attempt_at) where email_status in ('PENDING', 'FAILED');
create index solo_player_notifications_request_idx on public.solo_player_notifications(request_id);

alter table public.solo_player_posts enable row level security;
alter table public.solo_player_requests enable row level security;
alter table public.solo_player_notifications enable row level security;
alter table solo_player_private.post_contacts enable row level security;
alter table solo_player_private.request_contacts enable row level security;
revoke all on table public.solo_player_posts, public.solo_player_requests, public.solo_player_notifications from public, anon, authenticated;
revoke all on table solo_player_private.post_contacts, solo_player_private.request_contacts from public, anon, authenticated, service_role;
grant select on public.solo_player_posts, public.solo_player_requests, public.solo_player_notifications to authenticated;
grant all on public.solo_player_posts, public.solo_player_requests, public.solo_player_notifications to service_role;
-- No contact table grants, including service_role: narrowly scoped functions read these.

create or replace function solo_player_private.manages_tournament(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.tournaments t join public.users u on u.id = auth.uid()
    where t.id = p_tournament_id and (
      u.role::text = 'ADMIN'
      or (u.role::text = 'CLUB' and exists(select 1 from public.clubes c where c.id = t.club_id and c.user_id = auth.uid()))
      or (u.role::text = 'ORGANIZADOR' and exists(select 1 from public.organization_members m where m.organizacion_id = t.organization_id and m.user_id = auth.uid() and m.is_active))
    )
  );
$$;

-- An interest never consumes capacity. Capacity itself is rechecked in phase 2.
-- A capacity-generated lock can reopen; it is not a manual closure.
create or replace function solo_player_private.tournament_accepts_interest(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.tournaments t where t.id = p_tournament_id
    and not coalesce(t.is_draft, false) and coalesce(t.enable_public_inscriptions, false)
    and not (coalesce(t.registration_locked, false) and not coalesce(t.registration_locked_by_capacity, false))
    and t.status::text in ('NOT_STARTED', 'PAIRING', 'ZONE_REGISTRATION', 'ZONE_PHASE')
    and (t.created_at >= '2025-07-01'::timestamptz or t.status::text = 'ZONE_PHASE'
      or (coalesce(t.bracket_status::text, '') not in ('BRACKET_GENERATED', 'BRACKET_ACTIVE'))));
$$;

create or replace function solo_player_private.post_is_visible(p_post_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.solo_player_posts p where p.id = p_post_id and p.status = 'ACTIVE'
    and (p.expires_at is null or p.expires_at > now())
    and (p.tournament_id is null or solo_player_private.tournament_accepts_interest(p.tournament_id)));
$$;

create or replace function solo_player_private.post_is_actionable(p_post_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select solo_player_private.post_is_visible(p_post_id) and exists (
    select 1 from public.solo_player_posts p left join public.tournaments t on t.id = p.tournament_id
    where p.id = p_post_id and (p.tournament_id is null or t.max_participants is null
      or (select count(*) from public.inscriptions i where i.tournament_id = t.id and i.couple_id is not null and i.es_prueba = false) < t.max_participants)
  );
$$;

create or replace function solo_player_private.request_effective_status(p_request_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when r.status = 'PENDING' and (
    r.expires_at <= now() or p.expires_at <= now() or p.status in ('WITHDRAWN', 'EXPIRED', 'MATCHED')
    or (r.tournament_id is not null and not solo_player_private.tournament_accepts_interest(r.tournament_id))
  ) then 'EXPIRED' else r.status end
  from public.solo_player_requests r join public.solo_player_posts p on p.id = r.post_id
  where r.id = p_request_id and (auth.uid() in (r.sender_user_id, r.recipient_user_id)
    or solo_player_private.manages_tournament(r.tournament_id));
$$;

create policy solo_player_posts_read on public.solo_player_posts for select to authenticated using (
  owner_user_id = (select auth.uid()) or solo_player_private.manages_tournament(tournament_id)
  or solo_player_private.post_is_visible(id)
);
create policy solo_player_requests_read on public.solo_player_requests for select to authenticated using (
  (select auth.uid()) in (sender_user_id, recipient_user_id) or solo_player_private.manages_tournament(tournament_id)
);
create policy solo_player_notifications_read on public.solo_player_notifications for select to authenticated using (
  recipient_user_id = (select auth.uid())
);

create view public.solo_player_directory with (security_invoker = true) as
  select p.id, p.owner_user_id, p.player_id, p.tournament_id, p.category_name, p.preferred_side,
    p.preferred_hand, p.public_phone, p.expires_at, p.created_at,
    profile.first_name, profile.last_name, profile.profile_image_url,
    solo_player_private.post_is_actionable(p.id) as is_actionable
  from public.solo_player_posts p join public.players profile on profile.id = p.player_id
  where solo_player_private.post_is_visible(p.id);
create view public.solo_player_request_inbox with (security_invoker = true) as
  select r.*, solo_player_private.request_effective_status(r.id) as effective_status,
    (r.status = 'PENDING' and (r.expires_at is null or r.expires_at > now())
      and solo_player_private.post_is_actionable(r.post_id)) as is_actionable
  from public.solo_player_requests r;
revoke all on public.solo_player_directory, public.solo_player_request_inbox from public, anon, authenticated;
grant select on public.solo_player_directory, public.solo_player_request_inbox to authenticated;

-- Internal fixed event payloads contain references only, never phone/email/DNI.
create or replace function solo_player_private.notify_request(p_request_id uuid, p_event text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.solo_player_requests%rowtype;
begin
  select * into strict r from public.solo_player_requests where id = p_request_id;
  insert into public.solo_player_notifications(recipient_user_id, request_id, event_type)
  select r.recipient_user_id, r.id, p_event
  union all select r.sender_user_id, r.id, case when p_event = 'REQUEST_RECEIVED' then 'REQUEST_SENT' else p_event end
  on conflict do nothing;
  if r.tournament_id is not null then
    insert into public.solo_player_notifications(recipient_user_id, request_id, event_type)
    select u.id, r.id, p_event from public.users u where exists (
      select 1 from public.tournaments t where t.id = r.tournament_id and (
        (u.role::text = 'CLUB' and exists(select 1 from public.clubes c where c.id = t.club_id and c.user_id = u.id))
        or (u.role::text = 'ORGANIZADOR' and exists(select 1 from public.organization_members m where m.organizacion_id = t.organization_id and m.user_id = u.id and m.is_active))
      )
    ) on conflict do nothing;
  end if;
end $$;

-- Called under a scope advisory lock. Reads still compute expiry immediately,
-- so correctness does not depend on a scheduler or a write occurring first.
create or replace function solo_player_private.expire_scope(p_tournament_id uuid, p_owner_user_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare expired_id uuid;
begin
  update public.solo_player_posts p set status = 'EXPIRED', updated_at = now()
  where p.status in ('ACTIVE', 'PAUSED') and p.tournament_id is not distinct from p_tournament_id
    and (p_owner_user_id is null or p.owner_user_id = p_owner_user_id)
    and ((p.expires_at is not null and p.expires_at <= now())
      or (p.tournament_id is not null and not solo_player_private.tournament_accepts_interest(p.tournament_id)));
  for expired_id in update public.solo_player_requests r set status = 'EXPIRED', resolved_at = now()
    where r.status = 'PENDING' and r.tournament_id is not distinct from p_tournament_id
      and ((r.expires_at is not null and r.expires_at <= now())
        or exists (select 1 from public.solo_player_posts p where p.id = r.post_id and (
          p.status in ('WITHDRAWN', 'EXPIRED', 'MATCHED') or p.expires_at <= now()
          or (p.tournament_id is not null and not solo_player_private.tournament_accepts_interest(p.tournament_id))))) returning r.id
  loop perform solo_player_private.notify_request(expired_id, 'REQUEST_EXPIRED'); end loop;
end $$;

-- Consistent ordering: tournament row, then short scope advisory lock. A
-- tournament close already owns its row lock before reaching the trigger below.
create or replace function solo_player_private.lock_scope(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_tournament_id is not null then
    perform 1 from public.tournaments where id = p_tournament_id for share;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(p_tournament_id::text, 'general'), 702));
end $$;

create or replace function solo_player_private.expire_closed_tournament()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if solo_player_private.tournament_accepts_interest(new.id) then return new; end if;
  perform solo_player_private.lock_scope(new.id);
  perform solo_player_private.expire_scope(new.id);
  return new;
end $$;
create trigger solo_player_expire_closed_tournament
  after update of status, registration_locked, registration_locked_by_capacity, enable_public_inscriptions, is_draft, bracket_status on public.tournaments
  for each row execute function solo_player_private.expire_closed_tournament();

create or replace function solo_player_private.save_post(
  p_player_id uuid, p_category_name text, p_preferred_side public."PREFERRED_SIDE", p_preferred_hand text,
  p_phone text, p_public_phone boolean, p_contact_consent_version text,
  p_tournament_id uuid default null, p_duration text default null, p_tournament_terms_version text default null,
  p_post_id uuid default null
) returns public.solo_player_posts language plpgsql security definer set search_path = '' as $$
declare result public.solo_player_posts%rowtype; expiry timestamptz; previous public.solo_player_posts%rowtype;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  if not exists(select 1 from public.players where id = p_player_id and user_id = auth.uid()) then
    raise exception 'El perfil no pertenece al usuario' using errcode = '42501'; end if;
  if p_contact_consent_version is distinct from 'solo-players-contact-v1' then
    raise exception 'Debes aceptar el consentimiento de contacto' using errcode = '22023'; end if;
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Teléfono internacional inválido' using errcode = '22023'; end if;
  perform solo_player_private.lock_scope(p_tournament_id);
  if p_tournament_id is null then
    expiry := now() + case p_duration when '1_DAY' then interval '1 day' when '1_WEEK' then interval '1 week'
      when '2_WEEKS' then interval '2 weeks' when '1_MONTH' then interval '1 month' else null end;
    if expiry is null then raise exception 'Duración inválida' using errcode = '22023'; end if;
    if p_tournament_terms_version is not null then raise exception 'Ámbito general sin términos de torneo' using errcode = '22023'; end if;
  else
    if p_duration is not null or nullif(trim(p_tournament_terms_version), '') is null then
      raise exception 'Debes aceptar los términos del torneo' using errcode = '22023'; end if;
    if not solo_player_private.tournament_accepts_interest(p_tournament_id) then
      raise exception 'El torneo ya no admite búsquedas' using errcode = 'P0001'; end if;
    if exists(select 1 from public.inscriptions i join public.couples c on c.id = i.couple_id
      where i.tournament_id = p_tournament_id and p_player_id in (c.player1_id, c.player2_id)) then
      raise exception 'El jugador ya tiene pareja en este torneo' using errcode = '23505'; end if;
  end if;
  perform solo_player_private.expire_scope(p_tournament_id, auth.uid());
  if p_post_id is not null then
    select * into previous from public.solo_player_posts where id = p_post_id for update;
    if not found or previous.owner_user_id <> auth.uid() then raise exception 'Sin permisos sobre la publicación' using errcode = '42501'; end if;
    if previous.status not in ('ACTIVE', 'PAUSED') or previous.player_id <> p_player_id or previous.tournament_id is distinct from p_tournament_id then
      raise exception 'No se puede cambiar el ámbito o reabrir esta publicación' using errcode = '22023'; end if;
    update public.solo_player_posts set category_name = p_category_name, preferred_side = p_preferred_side,
      preferred_hand = p_preferred_hand, public_phone = p_public_phone, updated_at = now(),
      contact_consented_at = now(), expires_at = expiry,
      tournament_terms_version = p_tournament_terms_version,
      tournament_terms_accepted_at = case when p_tournament_id is not null then now() end
      where id = p_post_id returning * into result;
  else
    insert into public.solo_player_posts(owner_user_id, player_id, tournament_id, category_name, preferred_side, preferred_hand,
      public_phone, contact_consent_version, tournament_terms_version, tournament_terms_accepted_at, expires_at)
    values (auth.uid(), p_player_id, p_tournament_id, p_category_name, p_preferred_side, p_preferred_hand, p_public_phone,
      p_contact_consent_version, p_tournament_terms_version, case when p_tournament_id is not null then now() end, expiry)
    returning * into result;
  end if;
  insert into solo_player_private.post_contacts(post_id, phone) values (result.id, p_phone)
    on conflict(post_id) do update set phone = excluded.phone;
  return result;
end $$;

create or replace function solo_player_private.set_post_status(p_post_id uuid, p_status text)
returns public.solo_player_posts language plpgsql security definer set search_path = '' as $$
declare p public.solo_player_posts%rowtype;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  select * into p from public.solo_player_posts where id = p_post_id;
  if not found or p.owner_user_id <> auth.uid() then raise exception 'Sin permisos sobre la publicación' using errcode = '42501'; end if;
  perform solo_player_private.lock_scope(p.tournament_id);
  perform solo_player_private.expire_scope(p.tournament_id, auth.uid());
  select * into strict p from public.solo_player_posts where id = p_post_id for update;
  if p.status not in ('ACTIVE', 'PAUSED') or p_status not in ('ACTIVE', 'PAUSED', 'WITHDRAWN') then
    raise exception 'Transición de publicación inválida' using errcode = '22023'; end if;
  if p_status = 'ACTIVE' and p.tournament_id is not null and not solo_player_private.tournament_accepts_interest(p.tournament_id) then
    raise exception 'El torneo ya no admite búsquedas' using errcode = 'P0001'; end if;
  update public.solo_player_posts set status = p_status, updated_at = now() where id = p.id returning * into p;
  -- Pending requests cannot survive a withdrawn publication. Pause only disables actions.
  if p_status = 'WITHDRAWN' then perform solo_player_private.expire_scope(p.tournament_id, auth.uid()); end if;
  return p;
end $$;

create or replace function solo_player_private.send_request(p_post_id uuid, p_sender_player_id uuid, p_phone text,
  p_contact_consent_version text, p_tournament_terms_version text default null)
returns public.solo_player_requests language plpgsql security definer set search_path = '' as $$
declare p public.solo_player_posts%rowtype; r public.solo_player_requests%rowtype; expiry timestamptz;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  if p_contact_consent_version is distinct from 'solo-players-contact-v1' or p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Contacto válido y consentimiento requeridos' using errcode = '22023'; end if;
  if not exists(select 1 from public.players where id = p_sender_player_id and user_id = auth.uid()) then
    raise exception 'El perfil no pertenece al usuario' using errcode = '42501'; end if;
  select * into p from public.solo_player_posts where id = p_post_id;
  if not found then raise exception 'Publicación no disponible' using errcode = 'P0001'; end if;
  perform solo_player_private.lock_scope(p.tournament_id);
  perform solo_player_private.expire_scope(p.tournament_id);
  select * into strict p from public.solo_player_posts where id = p_post_id for update;
  if not solo_player_private.post_is_actionable(p.id) then raise exception 'Publicación no disponible' using errcode = 'P0001'; end if;
  if p.owner_user_id = auth.uid() then raise exception 'No puedes solicitarte a ti mismo' using errcode = '22023'; end if;
  if p.tournament_id is null then
    if p_tournament_terms_version is not null then raise exception 'Ámbito general sin términos de torneo' using errcode = '22023'; end if;
    expiry := null; -- General requests inherit the live publication deadline.
  else
    if not solo_player_private.tournament_accepts_interest(p.tournament_id) or nullif(trim(p_tournament_terms_version), '') is null then
      raise exception 'El torneo no admite la solicitud o faltan términos' using errcode = 'P0001'; end if;
    if exists(select 1 from public.inscriptions i join public.couples c on c.id = i.couple_id where i.tournament_id = p.tournament_id
      and (c.player1_id in (p_sender_player_id, p.player_id) or c.player2_id in (p_sender_player_id, p.player_id))) then
      raise exception 'Uno de los jugadores ya tiene pareja' using errcode = '23505'; end if;
    select case when type::text = 'AMERICAN' then now() + interval '24 hours' end into expiry from public.tournaments where id = p.tournament_id;
  end if;
  insert into public.solo_player_requests(post_id, sender_user_id, recipient_user_id, sender_player_id, recipient_player_id,
    tournament_id, expires_at, contact_consent_version, tournament_terms_version, tournament_terms_accepted_at)
    values (p.id, auth.uid(), p.owner_user_id, p_sender_player_id, p.player_id, p.tournament_id, expiry,
      p_contact_consent_version, p_tournament_terms_version, case when p.tournament_id is not null then now() end) returning * into r;
  insert into solo_player_private.request_contacts(request_id, sender_phone, recipient_phone)
    select r.id, p_phone, phone from solo_player_private.post_contacts where post_id = p.id;
  perform solo_player_private.notify_request(r.id, 'REQUEST_RECEIVED');
  return r;
end $$;

create or replace function solo_player_private.resolve_request(p_request_id uuid, p_action text)
returns public.solo_player_requests language plpgsql security definer set search_path = '' as $$
declare r public.solo_player_requests%rowtype; target_status text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  select * into r from public.solo_player_requests where id = p_request_id;
  if not found then raise exception 'Sin permisos sobre la solicitud' using errcode = '42501'; end if;
  if not ((p_action in ('ACCEPT', 'REJECT') and r.recipient_user_id = auth.uid())
    or (p_action = 'WITHDRAW' and r.sender_user_id = auth.uid())
    or (p_action = 'INVALIDATE' and solo_player_private.manages_tournament(r.tournament_id))) then
    raise exception 'Sin permisos para resolver la solicitud' using errcode = '42501'; end if;
  perform solo_player_private.lock_scope(r.tournament_id);
  perform solo_player_private.expire_scope(r.tournament_id);
  select * into strict r from public.solo_player_requests where id = p_request_id for update;
  target_status := case p_action when 'ACCEPT' then 'ACCEPTED' when 'REJECT' then 'REJECTED'
    when 'WITHDRAW' then 'WITHDRAWN' when 'INVALIDATE' then 'INVALIDATED' end;
  if r.status = target_status then return r; end if; -- Same actor retry is idempotent.
  if r.status <> 'PENDING' then return r; end if; -- Includes freshly expired requests.
  if p_action = 'ACCEPT' and not solo_player_private.post_is_actionable(r.post_id) then return r; end if;
  if p_action = 'ACCEPT' and r.tournament_id is not null then
    raise exception 'La aceptación de torneo requiere la integración transaccional de inscripción (Fase 2)' using errcode = '0A000'; end if;
  if p_action = 'ACCEPT' then
    update solo_player_private.request_contacts c set recipient_phone = p.phone
      from solo_player_private.post_contacts p where c.request_id = r.id and p.post_id = r.post_id;
  end if;
  update public.solo_player_requests set status = target_status, resolved_by = auth.uid(), resolved_at = now()
    where id = r.id returning * into r;
  perform solo_player_private.notify_request(r.id, 'REQUEST_' || target_status);
  return r;
end $$;

create or replace function solo_player_private.read_contact(p_post_id uuid default null, p_request_id uuid default null)
returns table(user_id uuid, phone text) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  if (p_post_id is null) = (p_request_id is null) then raise exception 'Elegí publicación o solicitud' using errcode = '22023'; end if;
  if p_post_id is not null then
    return query select p.owner_user_id, c.phone from public.solo_player_posts p
      join solo_player_private.post_contacts c on c.post_id = p.id where p.id = p_post_id
      and (p.owner_user_id = auth.uid() or (p.public_phone and solo_player_private.post_is_actionable(p.id)));
    return;
  end if;
  return query select r.sender_user_id, c.sender_phone from public.solo_player_requests r
    join solo_player_private.request_contacts c on c.request_id = r.id where r.id = p_request_id and r.status = 'ACCEPTED'
    and auth.uid() in (r.sender_user_id, r.recipient_user_id)
    union all select r.recipient_user_id, c.recipient_phone from public.solo_player_requests r
    join solo_player_private.request_contacts c on c.request_id = r.id where r.id = p_request_id and r.status = 'ACCEPTED'
    and auth.uid() in (r.sender_user_id, r.recipient_user_id);
end $$;

create or replace function solo_player_private.mark_notification_read(p_notification_id uuid)
returns public.solo_player_notifications language plpgsql security definer set search_path = '' as $$
declare result public.solo_player_notifications%rowtype;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  update public.solo_player_notifications set read_at = coalesce(read_at, now())
    where id = p_notification_id and recipient_user_id = auth.uid() returning * into result;
  if not found then raise exception 'Sin permisos sobre la notificación' using errcode = '42501'; end if;
  return result;
end $$;

-- Historical singles are NOT copied into publications or deleted. Returning all
-- legacy IDs for each player lets phase 2 reuse/lock them without double inserts.
create or replace function solo_player_private.legacy_singles(p_tournament_id uuid)
returns table(player_id uuid, user_id uuid, first_name text, last_name text, inscription_ids uuid[], already_in_couple boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not solo_player_private.manages_tournament(p_tournament_id) then raise exception 'Sin permisos sobre el torneo' using errcode = '42501'; end if;
  return query select p.id, p.user_id, p.first_name, p.last_name, array_agg(i.id order by i.id), exists(
    select 1 from public.inscriptions paired join public.couples c on c.id = paired.couple_id
    where paired.tournament_id = p_tournament_id and p.id in (c.player1_id, c.player2_id))
    from public.inscriptions i join public.players p on p.id = i.player_id
    where i.tournament_id = p_tournament_id and i.couple_id is null group by p.id;
end $$;

-- Public invoker wrappers are the only Data API entry points. Private definers
-- explicitly check the authenticated identity; no caller supplies owner IDs.
create or replace function public.save_solo_player_post(p_player_id uuid, p_category_name text, p_preferred_side public."PREFERRED_SIDE", p_preferred_hand text,
  p_phone text, p_public_phone boolean, p_contact_consent_version text, p_tournament_id uuid default null,
  p_duration text default null, p_tournament_terms_version text default null, p_post_id uuid default null)
returns public.solo_player_posts language sql security invoker set search_path = '' as $$
  select solo_player_private.save_post(p_player_id,p_category_name,p_preferred_side,p_preferred_hand,p_phone,p_public_phone,
    p_contact_consent_version,p_tournament_id,p_duration,p_tournament_terms_version,p_post_id);
$$;
create or replace function public.set_solo_player_post_status(p_post_id uuid, p_status text)
returns public.solo_player_posts language sql security invoker set search_path = '' as $$ select solo_player_private.set_post_status(p_post_id,p_status); $$;
create or replace function public.send_solo_player_request(p_post_id uuid, p_sender_player_id uuid, p_phone text,
  p_contact_consent_version text, p_tournament_terms_version text default null)
returns public.solo_player_requests language sql security invoker set search_path = '' as $$
  select solo_player_private.send_request(p_post_id,p_sender_player_id,p_phone,p_contact_consent_version,p_tournament_terms_version);
$$;
create or replace function public.resolve_solo_player_request(p_request_id uuid, p_action text)
returns public.solo_player_requests language sql security invoker set search_path = '' as $$ select solo_player_private.resolve_request(p_request_id,p_action); $$;
create or replace function public.get_solo_player_contact(p_post_id uuid default null, p_request_id uuid default null)
returns table(user_id uuid, phone text) language sql security invoker set search_path = '' as $$ select * from solo_player_private.read_contact(p_post_id,p_request_id); $$;
create or replace function public.mark_solo_player_notification_read(p_notification_id uuid)
returns public.solo_player_notifications language sql security invoker set search_path = '' as $$ select solo_player_private.mark_notification_read(p_notification_id); $$;
create or replace function public.get_legacy_solo_players(p_tournament_id uuid)
returns table(player_id uuid, user_id uuid, first_name text, last_name text, inscription_ids uuid[], already_in_couple boolean)
language sql security invoker set search_path = '' as $$ select * from solo_player_private.legacy_singles(p_tournament_id); $$;

-- Explicit grants override Supabase's default function grants; helpers stay private.
revoke all on all functions in schema solo_player_private from public, anon, authenticated, service_role;
grant execute on function solo_player_private.manages_tournament(uuid), solo_player_private.post_is_actionable(uuid),
  solo_player_private.post_is_visible(uuid),
  solo_player_private.request_effective_status(uuid),
  solo_player_private.save_post(uuid,text,public."PREFERRED_SIDE",text,text,boolean,text,uuid,text,text,uuid),
  solo_player_private.set_post_status(uuid,text), solo_player_private.send_request(uuid,uuid,text,text,text),
  solo_player_private.resolve_request(uuid,text), solo_player_private.read_contact(uuid,uuid),
  solo_player_private.mark_notification_read(uuid), solo_player_private.legacy_singles(uuid) to authenticated;
revoke all on function public.save_solo_player_post(uuid,text,public."PREFERRED_SIDE",text,text,boolean,text,uuid,text,text,uuid),
  public.set_solo_player_post_status(uuid,text), public.send_solo_player_request(uuid,uuid,text,text,text),
  public.resolve_solo_player_request(uuid,text), public.get_solo_player_contact(uuid,uuid),
  public.mark_solo_player_notification_read(uuid), public.get_legacy_solo_players(uuid) from public, anon, authenticated;
grant execute on function public.save_solo_player_post(uuid,text,public."PREFERRED_SIDE",text,text,boolean,text,uuid,text,text,uuid),
  public.set_solo_player_post_status(uuid,text), public.send_solo_player_request(uuid,uuid,text,text,text),
  public.resolve_solo_player_request(uuid,text), public.get_solo_player_contact(uuid,uuid),
  public.mark_solo_player_notification_read(uuid), public.get_legacy_solo_players(uuid) to authenticated;

comment on table public.solo_player_posts is 'Opt-in interests. No competitive registration or rank change. Phone is stored only in solo_player_private.';
comment on table public.solo_player_requests is 'General acceptance shares contact only. Tournament acceptance is intentionally disabled until phase 2 atomic registration.';
comment on table public.solo_player_notifications is 'Persistent inbox and email retry state; no email sender/worker enabled in phase 1.';
