-- Replace the original blanket conversion ban. The tournament row lock taken by
-- UPDATE serializes this check with the manual bracket RPCs' tournament lock.
-- Keep the private trigger's existing ownership, privileges and empty search path.
create or replace function american_free_private.guard_format() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if NEW.format_config->>'presetId' in ('AMERICAN_MULTI_ZONE_FREE','AMERICAN_SINGLE_ZONE_FREE')
    and (NEW.type::text is distinct from 'AMERICAN' or NEW.format_config->>'version' is distinct from '2') then
    raise exception 'Configuración LIBRE inválida' using errcode='22023';
  end if;

  if TG_OP <> 'UPDATE' then return NEW; end if;
  if not (coalesce(OLD.format_config->>'presetId','') in ('AMERICAN_MULTI_ZONE_FREE','AMERICAN_SINGLE_ZONE_FREE')
    or coalesce(NEW.format_config->>'presetId','') in ('AMERICAN_MULTI_ZONE_FREE','AMERICAN_SINGLE_ZONE_FREE')) then
    return NEW;
  end if;
  if OLD.type is not distinct from NEW.type and OLD.format_config is not distinct from NEW.format_config then
    return NEW;
  end if;

  if OLD.type::text is distinct from 'AMERICAN' or NEW.type::text is distinct from 'AMERICAN' then
    raise exception 'Solo se puede cambiar a Americano libre desde un torneo americano' using errcode='22023';
  end if;

  -- Inspect OLD as well as NEW so resetting phase/flags in the same UPDATE
  -- cannot detach an existing bracket from its transactional write guards.
  if coalesce(OLD.status::text,'') not in ('NOT_STARTED','ZONE_PHASE')
    or coalesce(NEW.status::text,'') not in ('NOT_STARTED','ZONE_PHASE')
    or OLD.bracket_status::text in ('BRACKET_GENERATED','BRACKET_ACTIVE')
    or NEW.bracket_status::text in ('BRACKET_GENERATED','BRACKET_ACTIVE')
    or OLD.bracket_generated_at is not null or NEW.bracket_generated_at is not null
    or exists(select 1 from public.american_free_brackets where tournament_id=OLD.id)
    or exists(select 1 from public.matches where tournament_id=OLD.id and type::text='ELIMINATION')
    or exists(select 1 from public.tournament_couple_seeds where tournament_id=OLD.id)
    or exists(select 1 from public.match_hierarchy where tournament_id=OLD.id)
    or exists(select 1 from public.placeholder_resolutions where tournament_id=OLD.id) then
    raise exception 'Para cambiar el formato primero tenés que revertir la llave' using errcode='22023';
  end if;

  return NEW;
end $$;
