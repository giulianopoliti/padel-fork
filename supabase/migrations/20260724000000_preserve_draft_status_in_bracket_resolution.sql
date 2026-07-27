-- Preserve draft bracket visibility when placeholder resolution fills a match.
-- Matches that are already DRAFT must stay hidden until an organizer publishes them.

CREATE OR REPLACE FUNCTION public.update_matches_via_fk(
  p_tournament_id uuid,
  p_seed_id uuid,
  p_couple_id uuid
)
RETURNS TABLE(match_id uuid, couple1_id uuid, couple2_id uuid, status text)
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE NOTICE 'Updating matches for seed % with couple %', p_seed_id, p_couple_id;

  UPDATE public.matches
  SET
    couple1_id = CASE
      WHEN tournament_couple_seed1_id = p_seed_id THEN p_couple_id
      ELSE matches.couple1_id
    END,
    couple2_id = CASE
      WHEN tournament_couple_seed2_id = p_seed_id THEN p_couple_id
      ELSE matches.couple2_id
    END,
    placeholder_couple1_label = CASE
      WHEN tournament_couple_seed1_id = p_seed_id THEN NULL
      ELSE matches.placeholder_couple1_label
    END,
    placeholder_couple2_label = CASE
      WHEN tournament_couple_seed2_id = p_seed_id THEN NULL
      ELSE matches.placeholder_couple2_label
    END,
    status = CASE
      WHEN matches.status = 'DRAFT'::public.match_status THEN 'DRAFT'::public.match_status
      WHEN (
        (CASE WHEN tournament_couple_seed1_id = p_seed_id THEN p_couple_id ELSE matches.couple1_id END) IS NOT NULL
        AND
        (CASE WHEN tournament_couple_seed2_id = p_seed_id THEN p_couple_id ELSE matches.couple2_id END) IS NOT NULL
      ) THEN 'PENDING'::public.match_status
      ELSE matches.status
    END
  WHERE
    matches.tournament_id = p_tournament_id
    AND (
      tournament_couple_seed1_id = p_seed_id
      OR tournament_couple_seed2_id = p_seed_id
    );

  RETURN QUERY
  SELECT
    matches.id,
    matches.couple1_id,
    matches.couple2_id,
    matches.status::text
  FROM public.matches
  WHERE
    matches.tournament_id = p_tournament_id
    AND (
      tournament_couple_seed1_id = p_seed_id
      OR tournament_couple_seed2_id = p_seed_id
    );

  RAISE NOTICE 'Updated matches for seed %: % rows', p_seed_id, FOUND;
END;
$$;
