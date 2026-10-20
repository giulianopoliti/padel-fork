-- Local validation only. Remote deployment belongs to the repository owner.
alter table public.solo_player_posts add column organization_id uuid references public.organizaciones(id);
create index solo_player_posts_organization_idx on public.solo_player_posts(organization_id) where organization_id is not null;

create function solo_player_private.save_organization_post(p_organization_id uuid, p_player_id uuid, p_category_name text,
 p_preferred_side public."PREFERRED_SIDE", p_preferred_hand text, p_phone text, p_public_phone boolean,
 p_contact_consent_version text, p_tournament_id uuid, p_duration text, p_tournament_terms_version text, p_post_id uuid)
returns public.solo_player_posts language plpgsql security definer set search_path='' as $$
declare v_post public.solo_player_posts;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if not exists(select 1 from public.organizaciones where id=p_organization_id and is_active)
 or (p_tournament_id is not null and exists(select 1 from public.tournaments where id=p_tournament_id
   and organization_id is not null and organization_id<>p_organization_id)) then
   raise exception 'Circuito inválido' using errcode='22023';
 end if;
 v_post:=solo_player_private.save_post(p_player_id,p_category_name,p_preferred_side,p_preferred_hand,p_phone,p_public_phone,
   p_contact_consent_version,p_tournament_id,p_duration,p_tournament_terms_version,p_post_id);
 if p_post_id is null then
   update public.solo_player_posts set organization_id=p_organization_id where id=v_post.id returning * into v_post;
 end if;
 return v_post;
end $$;
revoke all on function solo_player_private.save_organization_post(uuid,uuid,text,public."PREFERRED_SIDE",text,text,boolean,text,uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function solo_player_private.save_organization_post(uuid,uuid,text,public."PREFERRED_SIDE",text,text,boolean,text,uuid,text,text,uuid) to authenticated;
create function public.save_solo_player_post_in_organization(p_organization_id uuid,p_player_id uuid,p_category_name text,
 p_preferred_side public."PREFERRED_SIDE",p_preferred_hand text,p_phone text,p_public_phone boolean,p_contact_consent_version text,
 p_tournament_id uuid default null,p_duration text default null,p_tournament_terms_version text default null,p_post_id uuid default null)
returns public.solo_player_posts language sql security invoker set search_path='' as $$
 select solo_player_private.save_organization_post(p_organization_id,p_player_id,p_category_name,p_preferred_side,p_preferred_hand,
   p_phone,p_public_phone,p_contact_consent_version,p_tournament_id,p_duration,p_tournament_terms_version,p_post_id);
$$;
revoke all on function public.save_solo_player_post_in_organization(uuid,uuid,text,public."PREFERRED_SIDE",text,text,boolean,text,uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_solo_player_post_in_organization(uuid,uuid,text,public."PREFERRED_SIDE",text,text,boolean,text,uuid,text,text,uuid) to authenticated;

create function solo_player_private.notify_new_general_search()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.organization_id is not null or new.organization_id is null or new.tournament_id is not null or new.status<>'ACTIVE' then return new; end if;
 insert into public.solo_player_notifications(recipient_user_id,post_id,event_type)
 select u.id,new.id,'PLAYER_SEARCHING' from public.users u
 where u.id<>new.owner_user_id and u.role::text='ORGANIZADOR'
 and exists(select 1 from public.organization_members m where m.organizacion_id=new.organization_id and m.user_id=u.id and m.is_active)
 on conflict do nothing;
 return new;
end $$;
revoke all on function solo_player_private.notify_new_general_search() from public,anon,authenticated,service_role;
create trigger solo_player_general_post_created_notification after update of organization_id on public.solo_player_posts
 for each row execute function solo_player_private.notify_new_general_search();
-- A received event remains useful after the search is paused or matched.
create policy solo_search_notification_post_read on public.solo_player_posts for select to authenticated using (
 exists(select 1 from public.solo_player_notifications n where n.post_id=solo_player_posts.id and n.recipient_user_id=(select auth.uid()))
);
