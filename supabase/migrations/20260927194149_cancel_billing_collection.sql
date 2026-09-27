CREATE OR REPLACE FUNCTION public.cancel_billing_collection(
  p_collection_id uuid,
  p_organization_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_amount_paid_ars integer;
  v_released_tournaments integer;
BEGIN
  -- Lock installments before the parent to match the payment workflow's lock order.
  PERFORM 1
  FROM public.billing_collection_installments installment
  WHERE installment.collection_id = p_collection_id
  ORDER BY installment.id
  FOR UPDATE;

  SELECT collection.amount_paid_ars
    INTO v_amount_paid_ars
  FROM public.billing_collections collection
  WHERE collection.id = p_collection_id
    AND collection.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobro no encontrado para este tenant';
  END IF;

  IF v_amount_paid_ars <> 0 OR EXISTS (
    SELECT 1
    FROM public.billing_collection_installments installment
    JOIN public.billing_installment_payments payment
      ON payment.installment_id = installment.id
    WHERE installment.collection_id = p_collection_id
  ) THEN
    RAISE EXCEPTION 'No se puede cancelar un cobro con pagos registrados';
  END IF;

  SELECT count(*)::integer
    INTO v_released_tournaments
  FROM public.billing_collection_tournaments tournament
  WHERE tournament.collection_id = p_collection_id;

  DELETE FROM public.billing_collections collection
  WHERE collection.id = p_collection_id
    AND collection.organization_id = p_organization_id;

  RETURN v_released_tournaments;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_billing_collection(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_billing_collection(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_billing_collection(uuid, uuid) TO service_role;
