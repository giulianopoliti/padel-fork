-- Deploy remotely only through the repository owner's Supabase CI/CD.
-- The zone form creates an unscored match directly as IN_PROGRESS, including
-- after the manual bracket exists. Starting that match does not write a result.
create or replace function american_free_private.guard_sports() returns trigger
language plpgsql security definer set search_path='' as $$
declare tid uuid; mid uuid; protected boolean:=true;
begin
  if TG_TABLE_NAME='matches' then
    tid:=coalesce(NEW.tournament_id,OLD.tournament_id);
    if TG_OP='UPDATE' and OLD.tournament_id is distinct from NEW.tournament_id
      and exists(select 1 from public.american_free_brackets where tournament_id in (OLD.tournament_id,NEW.tournament_id)) then
      raise exception 'No se puede trasladar un partido LIBRE a otro torneo' using errcode='22023'; end if;
    if TG_OP='UPDATE' then
      protected:=(NEW.status,NEW.winner_id,NEW.result_couple1,NEW.result_couple2,NEW.court,NEW.couple1_id,NEW.couple2_id)
        is distinct from (OLD.status,OLD.winner_id,OLD.result_couple1,OLD.result_couple2,OLD.court,OLD.couple1_id,OLD.couple2_id);
    elsif TG_OP='INSERT' then
      protected:=NEW.winner_id is not null or NEW.result_couple1 is not null or NEW.result_couple2 is not null
        or NEW.status::text='FINISHED'
        or (NEW.status::text='IN_PROGRESS' and (
          NEW.type is distinct from 'ZONE' or NEW.round::text is distinct from 'ZONE' or NEW.zone_id is null
        ));
    end if;
  else
    mid:=case when TG_OP='DELETE' then OLD.match_id else NEW.match_id end;
    select tournament_id into tid from public.matches where id=mid;
    if TG_OP='UPDATE' and NEW.match_id is distinct from OLD.match_id then
      if exists(select 1 from public.matches m join public.american_free_brackets b on b.tournament_id=m.tournament_id
        where m.id=OLD.match_id) then raise exception 'No se puede trasladar evidencia deportiva LIBRE' using errcode='42501'; end if;
    end if;
  end if;
  if protected and exists(select 1 from public.american_free_brackets where tournament_id=tid) and (
    coalesce(current_setting('american_free.tournament_id',true),'')<>tid::text
    or current_setting('role',true) not in ('service_role','postgres','supabase_admin')) then
    raise exception 'Americano libre requiere persistencia transaccional' using errcode='42501';
  end if;
  if TG_TABLE_NAME='fecha_matches' and TG_OP<>'DELETE' and exists(
    select 1 from public.matches where id=mid and not bracket_is_active) then
    raise exception 'No se puede agendar una rama inactiva' using errcode='22023';
  end if;
  return coalesce(NEW,OLD);
end $$;
revoke all on function american_free_private.guard_sports() from public,anon,authenticated,service_role;
