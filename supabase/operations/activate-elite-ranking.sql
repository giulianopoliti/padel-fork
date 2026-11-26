-- Owner-run activation after validating the American points scale.
-- Destination: Padel Elite, lzowflvgnspjdbvdxliy.
-- Captures every existing score and resets all players to zero atomically.
-- A second activation is rejected. Categories remain assigned.
begin;
select tournament_points_private.activate_ranking('ELITE_AMERICAN');
commit;
