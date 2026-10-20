-- Phase 4, local validation only. The owner deploys migrations through CI/CD.
alter table public.solo_player_notifications add column email_claim_id uuid;
alter table public.solo_player_notifications add column email_last_error text;
create index solo_player_email_reclaim_idx on public.solo_player_notifications(email_next_attempt_at)
  where email_status = 'PROCESSING';

-- Frozen delivery payloads keep retries identical for the provider's idempotency key.
-- No addresses, HTML, or delivery credentials are exposed in the public inbox.
create table solo_player_private.email_deliveries (
  notification_id uuid primary key references public.solo_player_notifications(id) on delete cascade,
  tenant text not null check (tenant in ('padel-fv','padel-elite')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table solo_player_private.email_deliveries enable row level security;
revoke all on solo_player_private.email_deliveries from public, anon, authenticated, service_role;

create function solo_player_private.claim_emails(p_claim_id uuid, p_limit integer)
returns setof public.solo_player_notifications language plpgsql security definer set search_path = '' as $$
begin
  if p_claim_id is null or p_limit is null or p_limit not between 1 and 20 then
    raise exception 'Invalid email batch' using errcode = '22023'; end if;
  return query
    with ready as (
      select id from public.solo_player_notifications
      where email_status in ('PENDING','FAILED','PROCESSING') and email_next_attempt_at <= now()
      order by email_next_attempt_at, id limit p_limit for update skip locked
    )
    update public.solo_player_notifications n
      set email_status='PROCESSING', email_claim_id=p_claim_id, email_attempts=n.email_attempts+1,
        email_next_attempt_at=now()+interval '5 minutes', email_last_error=null
      from ready where n.id=ready.id returning n.*;
end $$;

create function solo_player_private.prepare_email(p_notification_id uuid, p_claim_id uuid, p_tenant text, p_content jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n public.solo_player_notifications%rowtype; saved solo_player_private.email_deliveries%rowtype; address text;
begin
  select * into n from public.solo_player_notifications where id=p_notification_id for update;
  if not found or n.email_status <> 'PROCESSING' or n.email_claim_id is distinct from p_claim_id then
    raise exception 'Email lease no longer owned' using errcode = '42501'; end if;
  if p_tenant is null or p_tenant not in ('padel-fv','padel-elite')
    or nullif(p_content->>'subject','') is null or nullif(p_content->>'html','') is null then
    raise exception 'Invalid delivery content' using errcode = '22023'; end if;
  select * into saved from solo_player_private.email_deliveries where notification_id=n.id;
  if found then
    if saved.tenant <> p_tenant then raise exception 'Delivery tenant mismatch' using errcode = '22023'; end if;
    return saved.payload;
  end if;
  select email into address from auth.users where id=n.recipient_user_id;
  if nullif(trim(address),'') is null then raise exception 'Missing recipient email' using errcode = '22023'; end if;
  insert into solo_player_private.email_deliveries(notification_id,tenant,payload)
    values(n.id,p_tenant,jsonb_build_object('to',address,'subject',p_content->>'subject',
      'html',p_content->>'html','text',p_content->>'text')) returning * into saved;
  return saved.payload;
end $$;

create function solo_player_private.finish_email(p_notification_id uuid, p_claim_id uuid, p_success boolean, p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.solo_player_notifications set email_status=case when p_success then 'SENT' else 'FAILED' end,
    email_claim_id=null, email_sent_at=case when p_success then now() end,
    email_last_error=case when p_success then null else left(coalesce(p_error,'DELIVERY_FAILED'),64) end,
    email_next_attempt_at=case when p_success then now() else now()+interval '1 minute' * least(1440,power(2,least(email_attempts,11))) end
    where id=p_notification_id and email_status='PROCESSING' and email_claim_id=p_claim_id;
  return found;
end $$;

create function solo_player_private.expiry_scopes()
returns table(tournament_id uuid) language sql stable security definer set search_path = '' as $$
  select scope from (
    select p.tournament_id as scope from public.solo_player_posts p
      where p.status in ('ACTIVE','PAUSED') and p.expires_at <= now()
    union
    select r.tournament_id from public.solo_player_requests r join public.solo_player_posts p on p.id=r.post_id
      where r.status='PENDING' and (r.expires_at <= now() or p.expires_at <= now()
        or p.status in ('EXPIRED','WITHDRAWN','MATCHED'))
  ) s order by scope nulls first limit 50;
$$;
create function solo_player_private.expire_worker_scope(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform solo_player_private.lock_scope(p_tournament_id);
  perform solo_player_private.expire_scope(p_tournament_id);
end $$;

create function public.claim_solo_player_emails(p_claim_id uuid, p_limit integer default 10)
returns setof public.solo_player_notifications language sql security invoker set search_path = '' as $$
  select * from solo_player_private.claim_emails(p_claim_id,p_limit);
$$;
create function public.prepare_solo_player_email(p_notification_id uuid,p_claim_id uuid,p_tenant text,p_content jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select solo_player_private.prepare_email(p_notification_id,p_claim_id,p_tenant,p_content);
$$;
create function public.finish_solo_player_email(p_notification_id uuid,p_claim_id uuid,p_success boolean,p_error text default null)
returns boolean language sql security invoker set search_path = '' as $$
  select solo_player_private.finish_email(p_notification_id,p_claim_id,p_success,p_error);
$$;
create function public.get_solo_player_expiry_scopes()
returns table(tournament_id uuid) language sql security invoker set search_path = '' as $$
  select * from solo_player_private.expiry_scopes();
$$;
create function public.expire_solo_player_scope(p_tournament_id uuid default null)
returns void language sql security invoker set search_path = '' as $$
  select solo_player_private.expire_worker_scope(p_tournament_id);
$$;

revoke all on function solo_player_private.claim_emails(uuid,integer),solo_player_private.prepare_email(uuid,uuid,text,jsonb),
  solo_player_private.finish_email(uuid,uuid,boolean,text),solo_player_private.expiry_scopes(),solo_player_private.expire_worker_scope(uuid),
  public.claim_solo_player_emails(uuid,integer),public.prepare_solo_player_email(uuid,uuid,text,jsonb),
  public.finish_solo_player_email(uuid,uuid,boolean,text),public.get_solo_player_expiry_scopes(),public.expire_solo_player_scope(uuid)
  from public,anon,authenticated,service_role;
grant execute on function solo_player_private.claim_emails(uuid,integer),solo_player_private.prepare_email(uuid,uuid,text,jsonb),
  solo_player_private.finish_email(uuid,uuid,boolean,text),solo_player_private.expiry_scopes(),solo_player_private.expire_worker_scope(uuid),
  public.claim_solo_player_emails(uuid,integer),public.prepare_solo_player_email(uuid,uuid,text,jsonb),
  public.finish_solo_player_email(uuid,uuid,boolean,text),public.get_solo_player_expiry_scopes(),public.expire_solo_player_scope(uuid)
  to service_role;
