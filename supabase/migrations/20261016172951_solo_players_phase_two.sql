-- Local validation only. The owner deploys this through CI/CD.
alter table public.inscriptions add column if not exists pairing_source text
  check (pairing_source in ('REQUEST', 'ORGANIZER', 'LEGACY_CONVERSION'));
alter table public.inscriptions add column if not exists paired_by_user_id uuid references public.users(id) on delete set null;
create index if not exists inscriptions_paired_by_idx on public.inscriptions(paired_by_user_id) where paired_by_user_id is not null;

-- Trusted server boundary: actor/tenant are supplied only after getUser(), never
-- by an authenticated Data API caller. The private implementation needs access
-- to consent snapshots; neither clients nor service_role can read those tables.
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
  select count(*) into occupied from public.inscriptions where tournament_id=p_tournament_id and couple_id is not null and es_prueba=false;
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
revoke all on function solo_player_private.confirm_tournament_pair(uuid,uuid,uuid,uuid,text,uuid,text,boolean,boolean,boolean) from public,anon,authenticated,service_role;
grant usage on schema solo_player_private to service_role;
grant execute on function solo_player_private.confirm_tournament_pair(uuid,uuid,uuid,uuid,text,uuid,text,boolean,boolean,boolean) to service_role;
create or replace function public.confirm_tournament_pair(
  p_tournament_id uuid,p_player1_id uuid,p_player2_id uuid,p_actor_id uuid,p_tenant text,
  p_request_id uuid default null,p_payment_method text default null,p_terms_accepted boolean default false,
  p_allow_blocked_override boolean default false,p_organizer boolean default false
) returns jsonb language sql security invoker set search_path='' as $$
  select solo_player_private.confirm_tournament_pair(p_tournament_id,p_player1_id,p_player2_id,p_actor_id,p_tenant,
    p_request_id,p_payment_method,p_terms_accepted,p_allow_blocked_override,p_organizer);
$$;
revoke all on function public.confirm_tournament_pair(uuid,uuid,uuid,uuid,text,uuid,text,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.confirm_tournament_pair(uuid,uuid,uuid,uuid,text,uuid,text,boolean,boolean,boolean) to service_role;

-- Historical solo rows are interests; retain the global missing-proof guard for couples.
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
  if exists(select 1 from public.inscriptions where tournament_id = tid and couple_id is not null and payment_method = 'TRANSFER' and payment_proof_path is null) then
    raise exception 'Hay inscripciones sin comprobante. Completalas o cancelalas desde Inscripciones antes de armar zonas o partidos.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function inscription_private.require_complete_registrations() from public, anon, authenticated;

-- PostgreSQL runs triggers of the same kind in name order. Obtain scope 702
-- before the existing inscription_payment_guard takes capacity/payment lock 701.
-- Updates deliberately retain their existing locking (they already own 701).
create or replace function solo_player_private.lock_pair_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform solo_player_private.lock_scope(new.tournament_id);
  return new;
end $$;
revoke all on function solo_player_private.lock_pair_insert() from public,anon,authenticated,service_role;
drop trigger if exists a_solo_pair_scope_lock on public.inscriptions;
create trigger a_solo_pair_scope_lock before insert on public.inscriptions
  for each row when (new.couple_id is not null) execute function solo_player_private.lock_pair_insert();

-- New audit fields are server-owned even on legacy tables with broad grants.
create or replace function solo_player_private.guard_pair_attribution()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true) in ('authenticated','anon') then
    if tg_op='INSERT' then
      if new.pairing_source is not null or new.paired_by_user_id is not null then
        raise exception 'El origen del emparejamiento se registra desde el servidor' using errcode='42501';
      end if;
    elsif new.pairing_source is distinct from old.pairing_source or new.paired_by_user_id is distinct from old.paired_by_user_id then
      raise exception 'No se puede modificar el origen del emparejamiento' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function solo_player_private.guard_pair_attribution() from public,anon,authenticated,service_role;
drop trigger if exists a_solo_pair_attribution on public.inscriptions;
create trigger a_solo_pair_attribution before insert or update of pairing_source,paired_by_user_id on public.inscriptions
  for each row execute function solo_player_private.guard_pair_attribution();

-- Registration through ordinary forms also closes tournament interests. Runs
-- after the guard has obtained tournament/scope/capacity locks, before commit.
create or replace function solo_player_private.close_paired_interests()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.couples%rowtype; invalidated_id uuid;
begin
  if new.couple_id is null or coalesce(new.es_prueba,false) then return new; end if;
  select * into strict c from public.couples where id=new.couple_id;
  delete from public.inscriptions where tournament_id=new.tournament_id and couple_id is null
    and player_id in (c.player1_id,c.player2_id);
  for invalidated_id in update public.solo_player_requests set status='INVALIDATED',resolved_at=now(),
      resolved_by=case when current_setting('role',true) in ('authenticated','anon') then auth.uid() else coalesce(new.paired_by_user_id,auth.uid()) end
    where tournament_id=new.tournament_id and status='PENDING'
      and (sender_player_id in (c.player1_id,c.player2_id) or recipient_player_id in (c.player1_id,c.player2_id)) returning id
  loop perform solo_player_private.notify_request(invalidated_id,'REQUEST_INVALIDATED'); end loop;
  update public.solo_player_posts set status='MATCHED',updated_at=now()
    where tournament_id=new.tournament_id and player_id in (c.player1_id,c.player2_id) and status in ('ACTIVE','PAUSED');
  return new;
end $$;
revoke all on function solo_player_private.close_paired_interests() from public,anon,authenticated,service_role;
drop trigger if exists solo_close_paired_interests on public.inscriptions;
create trigger solo_close_paired_interests after insert on public.inscriptions
  for each row execute function solo_player_private.close_paired_interests();
