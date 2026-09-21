ALTER TABLE public.billing_collection_tournaments
  ADD COLUMN tournament_status text NOT NULL DEFAULT 'UNKNOWN';

UPDATE public.billing_collection_tournaments billing_tournament
SET tournament_status = tournament.status::text
FROM public.tournaments tournament
WHERE billing_tournament.tournament_id = tournament.id
  AND billing_tournament.collection_id = 'b2e97377-d5a5-4f6f-aa8f-911ca0360198';

CREATE OR REPLACE FUNCTION public.create_billing_collection(
  p_organization_id uuid,
  p_organizer_id uuid,
  p_organizer_label text,
  p_total_amount_ars integer,
  p_tournaments jsonb,
  p_installments jsonb,
  p_created_by uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_collection_id uuid;
  v_tournaments_total integer;
  v_installments_total integer;
  v_installment_count integer;
BEGIN
  IF p_total_amount_ars <= 0 OR coalesce(trim(p_organizer_label), '') = '' THEN
    RAISE EXCEPTION 'El cobro necesita organizador e importe positivo';
  END IF;

  SELECT coalesce(sum(amount_ars), 0)
    INTO v_tournaments_total
  FROM jsonb_to_recordset(p_tournaments) AS value(
    tournament_id uuid,
    amount_ars integer,
    tournament_name text,
    club_name text,
    billable_units integer,
    tournament_status text
  );

  SELECT coalesce(sum(amount_ars), 0), count(*)
    INTO v_installments_total, v_installment_count
  FROM jsonb_to_recordset(p_installments) AS value(amount_ars integer);

  IF v_tournaments_total <> p_total_amount_ars OR v_installments_total <> p_total_amount_ars OR v_installment_count = 0 THEN
    RAISE EXCEPTION 'Los torneos y las cuotas deben sumar exactamente el total';
  END IF;

  INSERT INTO public.billing_collections (
    organization_id, organizer_id, organizer_label, total_amount_ars, balance_ars, created_by
  ) VALUES (
    p_organization_id, p_organizer_id, trim(p_organizer_label), p_total_amount_ars, p_total_amount_ars, p_created_by
  ) RETURNING id INTO v_collection_id;

  INSERT INTO public.billing_collection_tournaments (
    collection_id, tournament_id, amount_ars, tournament_name, club_name, billable_units, tournament_status
  )
  SELECT v_collection_id, value.tournament_id, value.amount_ars, value.tournament_name, value.club_name, value.billable_units, value.tournament_status
  FROM jsonb_to_recordset(p_tournaments) AS value(
    tournament_id uuid,
    amount_ars integer,
    tournament_name text,
    club_name text,
    billable_units integer,
    tournament_status text
  );

  INSERT INTO public.billing_collection_installments (collection_id, installment_number, amount_ars)
  SELECT v_collection_id, value.installment_number, value.amount_ars
  FROM jsonb_to_recordset(p_installments) AS value(installment_number smallint, amount_ars integer);

  RETURN v_collection_id;
END;
$$;
