-- Prepared locally only. The repository owner deploys through Supabase CI/CD.
-- Serialize resets with generation, manual layout and sporting operations.
create function public.reset_american_free_tournament(
  p_tournament_id uuid, p_actor_id uuid, p_target text, p_expected_revision bigint
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_phase text; target_phase public.tournaments.status%type; current_revision bigint; match_ids uuid[]; zone_ids uuid[];
begin
  perform american_free_private.lock_tournament(p_tournament_id,p_actor_id);
  select status::text into current_phase from public.tournaments where id=p_tournament_id;
  if p_target is null or p_target not in ('ZONE_PHASE','NOT_STARTED')
    or (p_target='ZONE_PHASE' and current_phase<>'BRACKET_PHASE')
    or (p_target='NOT_STARTED' and current_phase<>'ZONE_PHASE') then
    raise exception 'La fase del torneo cambió. Recargá antes de revertir.' using errcode='40001';
  end if;
  select revision into current_revision from public.american_free_brackets where tournament_id=p_tournament_id for update;
  if p_expected_revision is distinct from current_revision then
    raise exception 'La llave cambió. Recargá antes de revertir.' using errcode='40001';
  end if;
  perform 1 from public.matches where tournament_id=p_tournament_id order by id for update;
  begin
    perform 1 from public.zone_positions where tournament_id=p_tournament_id order by id for update nowait;
    perform 1 from public.inscriptions where tournament_id=p_tournament_id order by id for update nowait;
    perform 1 from public.tournament_couple_disqualifications where tournament_id=p_tournament_id order by id for update nowait;
  exception when lock_not_available then
    raise exception 'Las parejas están cambiando. Recargá antes de revertir.' using errcode='40001';
  end;
  perform set_config('american_free.tournament_id',p_tournament_id::text,true);
  select coalesce(array_agg(id),'{}'::uuid[]) into match_ids from public.matches
    where tournament_id=p_tournament_id and (p_target='NOT_STARTED' or type::text='ELIMINATION');
  select coalesce(array_agg(id),'{}'::uuid[]) into zone_ids from public.zones where tournament_id=p_tournament_id;

  -- Remove the immutable-layout marker before removing the original hierarchy.
  -- Everything, including this marker, rolls back if any dependent deletion fails.
  delete from public.american_free_brackets where tournament_id=p_tournament_id;
  delete from public.bracket_operations_log where tournament_id=p_tournament_id;
  delete from public.match_results_history where match_id=any(match_ids);
  delete from public.fecha_matches where match_id=any(match_ids);
  delete from public.set_matches where match_id=any(match_ids);
  delete from public.tournament_couple_disqualifications where tournament_id=p_tournament_id
    and (p_target='NOT_STARTED' or phase='BRACKET_PHASE');
  delete from public.match_hierarchy where tournament_id=p_tournament_id;
  delete from public.matches where id=any(match_ids);
  delete from public.placeholder_resolutions where seed_id in (
    select id from public.tournament_couple_seeds where tournament_id=p_tournament_id
  ) or (p_target='NOT_STARTED' and zone_id=any(zone_ids));
  delete from public.tournament_couple_seeds where tournament_id=p_tournament_id;
  delete from public.tournament_fechas where tournament_id=p_tournament_id
    and (p_target='NOT_STARTED' or round_type::text<>'ZONE');
  if p_target='NOT_STARTED' then
    delete from public.zone_couples where zone_id=any(zone_ids);
    delete from public.zone_positions where zone_id=any(zone_ids);
    delete from public.zones where id=any(zone_ids);
  end if;
  update public.inscriptions i set is_eliminated=false,eliminated_at=null,eliminated_in_round=null
    where i.tournament_id=p_tournament_id and not exists (
      select 1 from public.tournament_couple_disqualifications d where d.tournament_id=p_tournament_id
        and d.couple_id=i.couple_id and d.status='ACTIVE'
    );
  if p_target='NOT_STARTED' then target_phase:='NOT_STARTED'; else target_phase:='ZONE_PHASE'; end if;
  update public.tournaments set
    status=target_phase,
    status_sort_value=case when p_target='NOT_STARTED' then 1 else 2 end,
    winner_id=null,bracket_status='NOT_STARTED',bracket_generated_at=null,
    placeholder_brackets_generated_at=null,last_bracket_update=null,
    registration_locked=case when p_target='NOT_STARTED' then false else registration_locked end,
    registration_locked_by_capacity=case when p_target='NOT_STARTED' then false else registration_locked_by_capacity end
    where id=p_tournament_id;
  perform set_config('american_free.tournament_id','',true);
  return jsonb_build_object('success',true,'status',p_target);
end $$;
revoke all on function public.reset_american_free_tournament(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.reset_american_free_tournament(uuid,uuid,text,bigint) to service_role;
