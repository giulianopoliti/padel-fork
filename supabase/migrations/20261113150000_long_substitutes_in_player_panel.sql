-- Find only the current player's assigned couples before looking up their upcoming matches.
create function long_substitution_private.my_substitute_couples()
returns table (tournament_id uuid, couple_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct s.tournament_id, s.couple_id
  from public.players p
  join long_substitution_private.long_substitutions s on s.substitute_player_id = p.id
  where p.user_id = (select auth.uid())
  union
  select distinct m.tournament_id, l.couple_id
  from public.players p
  join long_substitution_private.match_lineups l
    on (l.substitute_slot = 1 and l.player1_id = p.id) or (l.substitute_slot = 2 and l.player2_id = p.id)
  join public.matches m on m.id = l.match_id
  where p.user_id = (select auth.uid()) and m.status in ('PENDING', 'IN_PROGRESS')
$$;

revoke all on function long_substitution_private.my_substitute_couples() from public, anon, authenticated;
grant execute on function long_substitution_private.my_substitute_couples() to authenticated;

create function public.get_my_upcoming_long_substitute_matches()
returns table (match_id uuid, couple_id uuid)
language sql stable security invoker set search_path = '' as $$
  with assignments as materialized (select * from long_substitution_private.my_substitute_couples()),
  candidates as (
    select m.id from assignments a join public.matches m
      on m.tournament_id = a.tournament_id and m.couple1_id = a.couple_id
    where m.status in ('PENDING', 'IN_PROGRESS') and m.bracket_is_active is not false
    union
    select m.id from assignments a join public.matches m
      on m.tournament_id = a.tournament_id and m.couple2_id = a.couple_id
    where m.status in ('PENDING', 'IN_PROGRESS') and m.bracket_is_active is not false
  )
  select l.match_id, l.couple_id from candidates m
  cross join lateral long_substitution_private.match_changes(m.id, true) l
$$;

revoke all on function public.get_my_upcoming_long_substitute_matches() from public, anon, authenticated;
grant execute on function public.get_my_upcoming_long_substitute_matches() to authenticated;
