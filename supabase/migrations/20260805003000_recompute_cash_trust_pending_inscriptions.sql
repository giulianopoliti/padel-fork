WITH pending_cash AS (
  SELECT
    i.id AS inscription_id,
    i.tournament_id,
    COALESCE(i.player_id, c.player1_id) AS trusted_player_id,
    t.organization_id,
    COALESCE(t.trust_policy_min_played_tournaments, 2) AS min_confirmed_inscriptions
  FROM public.inscriptions i
  JOIN public.tournaments t ON t.id = i.tournament_id
  LEFT JOIN public.couples c ON c.id = i.couple_id
  WHERE t.type = 'AMERICAN'
    AND t.enable_trust_based_payment_policy = true
    AND i.trust_policy_applied = true
    AND i.payment_method = 'CASH'
    AND i.is_pending = true
),
confirmed_history AS (
  SELECT
    pc.inscription_id,
    COUNT(DISTINCT previous_t.id) AS confirmed_count
  FROM pending_cash pc
  JOIN public.inscriptions previous_i ON previous_i.is_pending = false
  JOIN public.tournaments previous_t ON previous_t.id = previous_i.tournament_id
  LEFT JOIN public.couples previous_c ON previous_c.id = previous_i.couple_id
  WHERE pc.trusted_player_id IS NOT NULL
    AND previous_t.type = 'AMERICAN'
    AND previous_t.status <> 'CANCELED'
    AND previous_t.organization_id = pc.organization_id
    AND previous_t.id <> pc.tournament_id
    AND (
      previous_i.player_id = pc.trusted_player_id
      OR previous_c.player1_id = pc.trusted_player_id
      OR previous_c.player2_id = pc.trusted_player_id
    )
  GROUP BY pc.inscription_id
)
UPDATE public.inscriptions i
SET is_pending = false,
    trust_player_played_tournaments_snapshot = h.confirmed_count
FROM pending_cash pc
JOIN confirmed_history h ON h.inscription_id = pc.inscription_id
WHERE i.id = pc.inscription_id
  AND h.confirmed_count >= pc.min_confirmed_inscriptions;
