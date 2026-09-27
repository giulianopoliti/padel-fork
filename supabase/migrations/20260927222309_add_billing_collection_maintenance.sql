ALTER TABLE public.billing_collections
  ADD COLUMN tournament_subtotal_ars integer,
  ADD COLUMN maintenance_amount_per_installment_ars integer NOT NULL DEFAULT 0;

UPDATE public.billing_collections
SET tournament_subtotal_ars = total_amount_ars
WHERE tournament_subtotal_ars IS NULL;

ALTER TABLE public.billing_collections
  ALTER COLUMN tournament_subtotal_ars SET NOT NULL,
  ALTER COLUMN tournament_subtotal_ars SET DEFAULT 0,
  ADD CONSTRAINT billing_collections_tournament_subtotal_nonnegative
    CHECK (tournament_subtotal_ars >= 0),
  ADD CONSTRAINT billing_collections_maintenance_per_installment_nonnegative
    CHECK (maintenance_amount_per_installment_ars >= 0),
  ADD CONSTRAINT billing_collections_subtotal_not_above_total
    CHECK (tournament_subtotal_ars <= total_amount_ars);

DROP FUNCTION public.create_billing_collection(uuid, uuid, text, integer, jsonb, jsonb, uuid);

CREATE FUNCTION public.create_billing_collection(
  p_organization_id uuid,
  p_organizer_id uuid,
  p_organizer_label text,
  p_total_amount_ars integer,
  p_maintenance_amount_per_installment_ars integer,
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
  v_tournaments_total bigint;
  v_installments_total bigint;
  v_installment_count integer;
  v_expected_total bigint;
BEGIN
  IF p_total_amount_ars <= 0 OR coalesce(trim(p_organizer_label), '') = '' THEN
    RAISE EXCEPTION 'El cobro necesita organizador e importe positivo';
  END IF;

  IF p_maintenance_amount_per_installment_ars IS NULL
    OR p_maintenance_amount_per_installment_ars < 0 THEN
    RAISE EXCEPTION 'El mantenimiento por cuota no puede ser negativo';
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

  IF v_installment_count < 1 OR v_installment_count > 24 THEN
    RAISE EXCEPTION 'El cobro debe tener entre 1 y 24 cuotas';
  END IF;

  v_expected_total := v_tournaments_total
    + (p_maintenance_amount_per_installment_ars::bigint * v_installment_count);

  IF v_expected_total > 2000000000 THEN
    RAISE EXCEPTION 'El total del cobro supera el importe máximo permitido';
  END IF;

  IF v_expected_total <> p_total_amount_ars OR v_installments_total <> p_total_amount_ars THEN
    RAISE EXCEPTION 'Los torneos, el mantenimiento y las cuotas deben coincidir con el total';
  END IF;

  INSERT INTO public.billing_collections (
    organization_id,
    organizer_id,
    organizer_label,
    tournament_subtotal_ars,
    maintenance_amount_per_installment_ars,
    total_amount_ars,
    balance_ars,
    created_by
  ) VALUES (
    p_organization_id,
    p_organizer_id,
    trim(p_organizer_label),
    v_tournaments_total::integer,
    p_maintenance_amount_per_installment_ars,
    p_total_amount_ars,
    p_total_amount_ars,
    p_created_by
  ) RETURNING id INTO v_collection_id;

  INSERT INTO public.billing_collection_tournaments (
    collection_id,
    tournament_id,
    amount_ars,
    tournament_name,
    club_name,
    billable_units,
    tournament_status
  )
  SELECT
    v_collection_id,
    value.tournament_id,
    value.amount_ars,
    value.tournament_name,
    value.club_name,
    value.billable_units,
    value.tournament_status
  FROM jsonb_to_recordset(p_tournaments) AS value(
    tournament_id uuid,
    amount_ars integer,
    tournament_name text,
    club_name text,
    billable_units integer,
    tournament_status text
  );

  INSERT INTO public.billing_collection_installments (
    collection_id,
    installment_number,
    amount_ars
  )
  SELECT v_collection_id, value.installment_number, value.amount_ars
  FROM jsonb_to_recordset(p_installments) AS value(
    installment_number smallint,
    amount_ars integer
  );

  RETURN v_collection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_billing_collection(
  uuid, uuid, text, integer, integer, jsonb, jsonb, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_billing_collection(
  uuid, uuid, text, integer, integer, jsonb, jsonb, uuid
) TO service_role;
