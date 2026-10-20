-- Local validation only. The repository owner deploys through Supabase CI/CD.
-- Keep disabled emails terminal without labelling them SENT or dropping inbox events.
alter table public.solo_player_notifications
  drop constraint solo_player_notifications_email_status_check;
alter table public.solo_player_notifications
  add constraint solo_player_notifications_email_status_check
  check (email_status in ('PENDING','PROCESSING','SENT','FAILED','SKIPPED'));

create or replace function solo_player_private.finish_email(p_notification_id uuid, p_claim_id uuid, p_success boolean, p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.solo_player_notifications set
    email_status=case when p_success then 'SENT' when p_error='EMAIL_DISABLED' then 'SKIPPED' else 'FAILED' end,
    email_claim_id=null, email_sent_at=case when p_success then now() end,
    email_last_error=case when p_success then null else left(coalesce(p_error,'DELIVERY_FAILED'),64) end,
    email_next_attempt_at=case when p_success or p_error='EMAIL_DISABLED' then now()
      else now()+interval '1 minute' * least(1440,power(2,least(email_attempts,11))) end
    where id=p_notification_id and email_status='PROCESSING' and email_claim_id=p_claim_id;
  return found;
end $$;
