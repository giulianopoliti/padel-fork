-- Local validation only. Preferences belong to this proposal, not the ranking profile.
alter table public.solo_player_requests
  add column sender_preferred_side text check (sender_preferred_side in ('DRIVE','REVES')),
  add column sender_preferred_hand text check (sender_preferred_hand in ('RIGHT','LEFT'));

-- Preserve the existing view column order; new columns are appended.
create or replace view public.solo_player_request_inbox with (security_invoker = true) as
  select r.id,r.post_id,r.sender_user_id,r.recipient_user_id,r.sender_player_id,r.recipient_player_id,
    r.tournament_id,r.status,r.expires_at,r.contact_consent_version,r.contact_consented_at,
    r.tournament_terms_version,r.tournament_terms_accepted_at,r.resolved_by,r.resolved_at,r.inscription_id,r.created_at,
    solo_player_private.request_effective_status(r.id) as effective_status,
    (r.status='PENDING' and (r.expires_at is null or r.expires_at>now())
      and solo_player_private.post_is_actionable(r.post_id)) as is_actionable,
    r.sender_preferred_side,r.sender_preferred_hand
  from public.solo_player_requests r;

create function solo_player_private.send_request_with_preferences(
  p_post_id uuid,p_sender_player_id uuid,p_phone text,p_contact_consent_version text,
  p_tournament_terms_version text,p_preferred_side text,p_preferred_hand text)
returns public.solo_player_requests language plpgsql security definer set search_path = '' as $$
declare saved public.solo_player_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  if p_preferred_side is null or p_preferred_side not in ('DRIVE','REVES')
    or p_preferred_hand is null or p_preferred_hand not in ('RIGHT','LEFT') then
    raise exception 'Datos de juego inválidos' using errcode='22023';
  end if;
  -- Existing function enforces ownership, consent, availability and locks atomically.
  saved := solo_player_private.send_request(p_post_id,p_sender_player_id,p_phone,p_contact_consent_version,p_tournament_terms_version);
  update public.solo_player_requests set sender_preferred_side=p_preferred_side,sender_preferred_hand=p_preferred_hand
    where id=saved.id returning * into saved;
  return saved;
end $$;

create function public.send_solo_player_request_with_preferences(
  p_post_id uuid,p_sender_player_id uuid,p_phone text,p_contact_consent_version text,
  p_tournament_terms_version text,p_preferred_side text,p_preferred_hand text)
returns public.solo_player_requests language sql security invoker set search_path = '' as $$
  select solo_player_private.send_request_with_preferences(p_post_id,p_sender_player_id,p_phone,p_contact_consent_version,
    p_tournament_terms_version,p_preferred_side,p_preferred_hand);
$$;
revoke all on function solo_player_private.send_request_with_preferences(uuid,uuid,text,text,text,text,text),
  public.send_solo_player_request_with_preferences(uuid,uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function solo_player_private.send_request_with_preferences(uuid,uuid,text,text,text,text,text),
  public.send_solo_player_request_with_preferences(uuid,uuid,text,text,text,text,text) to authenticated;
