-- Deploy only through the owner's Supabase CI/CD. Validate locally first.
-- Auth verifies the issuer claim before PostgREST executes an authenticated RPC.
-- Neither a request parameter nor user_metadata selects the production tenant.
create function solo_player_private.check_release_terms(p_tournament_id uuid, p_version text, p_player_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare issuer text := auth.jwt()->>'iss'; expected text; elite boolean := false;
begin
  if p_tournament_id is null then return; end if;
  if issuer = 'https://bfmaqrythlwbfjuqumom.supabase.co/auth/v1' then
    expected := 'solo-players-tournament-v1';
  elsif issuer = 'https://lzowflvgnspjdbvdxliy.supabase.co/auth/v1' then
    expected := '2026-08-28'; elite := true;
  elsif issuer is null or issuer ~ '^http://(localhost|127[.]0[.]0[.]1|kong)(:[0-9]+)?/auth/v1$' then
    -- SQL fixtures/local Auth exercise both brands without remote writes.
    if p_version in ('solo-players-tournament-v1','2026-08-28') then expected := p_version; end if;
    elite := p_version = '2026-08-28';
  else
    raise exception 'Emisor de sesión no habilitado para este circuito' using errcode='42501';
  end if;
  if expected is null or p_version is distinct from expected then
    raise exception 'Aceptá las condiciones vigentes de este circuito' using errcode='22023';
  end if;
  if elite and exists(select 1 from public.tournaments where id=p_tournament_id and type::text='AMERICAN')
    and exists(select 1 from public.tpe_registration_blocks where player_id=any(p_player_ids) and unblocked_at is null) then
    raise exception 'Te prohibieron la inscripción a los torneos de Padel Elite, comunicate con los organizadores para resolverlo.' using errcode='P0001';
  end if;
end $$;
revoke all on function solo_player_private.check_release_terms(uuid,text,uuid[]) from public,anon,authenticated,service_role;

create function solo_player_private.check_release_post()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null then
    perform solo_player_private.check_release_terms(new.tournament_id,new.tournament_terms_version,array[new.player_id]);
  end if;
  return new;
end $$;
create function solo_player_private.check_release_request()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null then
    perform solo_player_private.check_release_terms(new.tournament_id,new.tournament_terms_version,array[new.sender_player_id,new.recipient_player_id]);
  end if;
  return new;
end $$;
revoke all on function solo_player_private.check_release_post(),solo_player_private.check_release_request() from public,anon,authenticated,service_role;
create trigger solo_release_post_terms before insert or update of tournament_terms_version,tournament_id on public.solo_player_posts
 for each row execute function solo_player_private.check_release_post();
create trigger solo_release_request_terms before insert on public.solo_player_requests
 for each row execute function solo_player_private.check_release_request();
