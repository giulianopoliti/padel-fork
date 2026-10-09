-- LONG registration inserts the inscription before its canonical zone membership.
-- Preserve organizer policies; players may only create their own initial membership.
create policy zone_positions_player_long_registration_insert
on public.zone_positions
for insert
to authenticated
with check (
  position > 0
  and is_definitive = false
  and points = 0 and wins = 0 and losses = 0
  and games_for = 0 and games_against = 0 and games_difference = 0
  and sets_for = 0 and sets_against = 0 and sets_difference = 0
  and player_score_total = 0
  and tie_info is null
  and exists (
    select 1
    from public.inscriptions i
    join public.couples c on c.id = i.couple_id
    join public.players p on p.id in (c.player1_id, c.player2_id)
    join public.tournaments t on t.id = i.tournament_id
    join public.zones z on z.tournament_id = t.id
    where i.tournament_id = zone_positions.tournament_id
      and i.couple_id = zone_positions.couple_id
      and p.user_id = (select auth.uid())
      and t.type = 'LONG'
      and z.id = zone_positions.zone_id
      -- Match LongTournamentStrategy: the oldest zone is the general zone.
      and z.id = (
        select general_zone.id
        from public.zones general_zone
        where general_zone.tournament_id = t.id
        order by general_zone.created_at asc, general_zone.id asc
        limit 1
      )
  )
);

comment on policy zone_positions_player_long_registration_insert on public.zone_positions is
  'Allows an authenticated member of an inscribed couple to create its zero-score membership in the LONG general zone; no player update/delete permissions.';
