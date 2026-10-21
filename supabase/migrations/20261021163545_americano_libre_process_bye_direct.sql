-- Atomically turn an empty initial entry into a BYE and advance its rival.
-- Deployment is reserved for the repository owner's CI/CD.
create function public.process_american_free_bye(
  p_tournament_id uuid,p_actor_id uuid,p_expected_revision bigint,p_match_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.matches%rowtype; b public.american_free_brackets%rowtype;
  empty_slot integer; origin text; layout jsonb; saved jsonb; revision bigint;
begin
  perform american_free_private.lock_sports(p_tournament_id,p_actor_id,p_expected_revision);
  select * into b from public.american_free_brackets where tournament_id=p_tournament_id;
  select * into m from public.matches where id=p_match_id and tournament_id=p_tournament_id;
  if not found or m.type::text<>'ELIMINATION' or not m.bracket_is_active
    or m.status::text not in ('PENDING','WAITING_OPONENT') or m.winner_id is not null or m.free_bye_processed
    or (m.couple1_id is null) = (m.couple2_id is null) then
    raise exception 'El BYE requiere una única pareja y un partido sin actividad' using errcode='22023';
  end if;
  empty_slot:=case when m.couple1_id is null then 1 else 2 end;
  origin:=case when empty_slot=1 then m.free_slot1_origin else m.free_slot2_origin end;
  if origin not in ('ENTRY','BYE') or b.original_slots->m.id::text->>(empty_slot-1)='WINNER' then
    raise exception 'El rival depende de otra ronda; no se puede reemplazar por un BYE' using errcode='22023';
  end if;
  revision:=p_expected_revision;
  if origin='ENTRY' then
    select jsonb_agg(jsonb_build_object('id',x.id,
      'slot1_origin',case when x.id=p_match_id and empty_slot=1 then 'BYE' else x.free_slot1_origin end,
      'slot2_origin',case when x.id=p_match_id and empty_slot=2 then 'BYE' else x.free_slot2_origin end,
      'couple1_id',x.couple1_id,'couple2_id',x.couple2_id) order by x.id)
      into layout from public.matches x where x.tournament_id=p_tournament_id and x.type::text='ELIMINATION';
    saved:=public.save_american_free_bracket(p_tournament_id,p_actor_id,revision,layout);
    revision:=(saved->>'revision')::bigint;
  end if;
  return public.mutate_american_free_sports(p_tournament_id,p_actor_id,revision,
    jsonb_build_array(jsonb_build_object('kind','PROCESS_BYE','matchId',p_match_id)), '[]'::jsonb);
end $$;
revoke all on function public.process_american_free_bye(uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.process_american_free_bye(uuid,uuid,bigint,uuid) to service_role;
notify pgrst,'reload schema';
