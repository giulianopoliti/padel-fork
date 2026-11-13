create or replace function long_substitution_private.availability_write_allowed(p_slot_id uuid, p_couple_id uuid, p_require_substitution boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select case
    when t.type <> 'LONG' then not p_require_substitution
    when not p_require_substitution and schedule_private.can_manage(t.id) then true
    when f.status in ('CANCELED','COMPLETED') then false
    when s.slot_type = 'TIME_RANGE' and (
      coalesce(f.end_date, f.start_date, 'infinity'::date) < local_clock.at::date
      or s.date + s.end_time <= local_clock.at
    ) then false
    when (long_substitution_private.fecha_rule(f,p_couple_id)).id is null then not p_require_substitution
    else s.is_available and long_substitution_private.can_vote_fecha(f.id,p_couple_id)
      and (not p_require_substitution or (s.slot_type = 'TIME_RANGE' and s.is_system is not true))
    end
  from public.tournament_time_slots s join public.tournament_fechas f on f.id = s.fecha_id
  join public.tournaments t on t.id = f.tournament_id
  cross join (select statement_timestamp() at time zone 'America/Argentina/Buenos_Aires' as at) local_clock
  where s.id = p_slot_id),false)
$$;
