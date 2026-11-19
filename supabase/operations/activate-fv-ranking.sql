-- Owner-run activation after deploying the ranking migrations and application.
-- Destination: Padel FV, bfmaqrythlwbfjuqumom.
-- Captures every existing score and resets all players to zero atomically.
-- A second activation is rejected. Categories remain assigned.
begin;
select tournament_points_private.activate_ranking('FV_LEAGUE');
commit;
