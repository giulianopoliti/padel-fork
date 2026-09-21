WITH billable_couples AS (
  SELECT
    billing_tournament.id,
    count(DISTINCT inscription.couple_id) FILTER (
      WHERE inscription.couple_id IS NOT NULL
        AND coalesce(inscription.es_prueba, false) = false
        AND couple.id IS NOT NULL
        AND coalesce(couple.es_prueba, false) = false
        AND player1.id IS NOT NULL
        AND coalesce(player1.es_prueba, false) = false
        AND player2.id IS NOT NULL
        AND coalesce(player2.es_prueba, false) = false
    )::integer AS billable_units
  FROM public.billing_collection_tournaments billing_tournament
  LEFT JOIN public.inscriptions inscription
    ON inscription.tournament_id = billing_tournament.tournament_id
  LEFT JOIN public.couples couple
    ON couple.id = inscription.couple_id
  LEFT JOIN public.players player1
    ON player1.id = couple.player1_id
  LEFT JOIN public.players player2
    ON player2.id = couple.player2_id
  WHERE billing_tournament.collection_id = 'b2e97377-d5a5-4f6f-aa8f-911ca0360198'
    AND billing_tournament.billable_units = 0
  GROUP BY billing_tournament.id
)
UPDATE public.billing_collection_tournaments billing_tournament
SET billable_units = billable_couples.billable_units
FROM billable_couples
WHERE billing_tournament.id = billable_couples.id;
