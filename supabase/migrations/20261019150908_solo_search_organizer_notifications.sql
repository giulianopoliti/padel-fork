-- Validate locally only; the repository owner deploys through Supabase CI/CD.
-- A search is its own event, not a fabricated partner request.
alter table public.solo_player_notifications alter column request_id drop not null;
alter table public.solo_player_notifications add column post_id uuid
  references public.solo_player_posts(id) on delete cascade;
alter table public.solo_player_notifications drop constraint solo_player_notifications_event_type_check;
alter table public.solo_player_notifications add constraint solo_player_notifications_event_type_check
  check (event_type in ('REQUEST_RECEIVED','REQUEST_SENT','REQUEST_ACCEPTED','REQUEST_REJECTED',
    'REQUEST_WITHDRAWN','REQUEST_EXPIRED','REQUEST_INVALIDATED','PLAYER_SEARCHING'));
alter table public.solo_player_notifications add constraint solo_notification_subject_check
  check ((event_type='PLAYER_SEARCHING' and post_id is not null and request_id is null)
    or (event_type<>'PLAYER_SEARCHING' and request_id is not null and post_id is null));
create unique index solo_player_notifications_post_recipient_key
  on public.solo_player_notifications(recipient_user_id,post_id,event_type) where post_id is not null;
create index solo_player_notifications_post_idx on public.solo_player_notifications(post_id) where post_id is not null;

create function solo_player_private.notify_new_tournament_search()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tournament_id is null or new.status <> 'ACTIVE' then return new; end if;
  insert into public.solo_player_notifications(recipient_user_id,post_id,event_type)
    select u.id,new.id,'PLAYER_SEARCHING' from public.users u
    where u.id <> new.owner_user_id and exists (
      select 1 from public.tournaments t where t.id=new.tournament_id and (
        (u.role::text='CLUB' and exists(select 1 from public.clubes c where c.id=t.club_id and c.user_id=u.id))
        or (u.role::text='ORGANIZADOR' and exists(select 1 from public.organization_members m
          where m.organizacion_id=t.organization_id and m.user_id=u.id and m.is_active))
      )
    ) on conflict do nothing;
  return new;
end $$;
revoke all on function solo_player_private.notify_new_tournament_search() from public,anon,authenticated,service_role;
create trigger solo_player_post_created_notification after insert on public.solo_player_posts
  for each row execute function solo_player_private.notify_new_tournament_search();
