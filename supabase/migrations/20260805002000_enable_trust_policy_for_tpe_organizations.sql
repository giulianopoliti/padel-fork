UPDATE public.tournaments
SET enable_trust_based_payment_policy = true,
    trust_policy_min_played_tournaments = COALESCE(trust_policy_min_played_tournaments, 2)
WHERE type = 'AMERICAN'
  AND organization_id IN (
    SELECT id
    FROM public.organizaciones
    WHERE slug IN ('padel-elite', 'tpe-padel')
  );
