-- Local preparation only. The repository owner deploys migrations through CI/CD.
ALTER TABLE public.billing_collection_installments
  ADD COLUMN billing_month date,
  ADD COLUMN maintenance_amount_ars integer,
  ADD COLUMN organization_id uuid,
  ADD COLUMN billing_account_key text,
  ADD COLUMN billing_month_assigned_at timestamptz,
  ADD COLUMN billing_month_assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Preserve exact historical amounts. Months cannot be inferred from payment dates.
UPDATE public.billing_collection_installments i
SET maintenance_amount_ars = c.maintenance_amount_per_installment_ars,
    organization_id = c.organization_id,
    billing_account_key = CASE WHEN c.organizer_id IS NULL THEN 'tenant' ELSE 'organizer:' || c.organizer_id::text END
FROM public.billing_collections c WHERE c.id = i.collection_id;

ALTER TABLE public.billing_collections
  ADD CONSTRAINT billing_collections_id_organization_key UNIQUE (id, organization_id);
ALTER TABLE public.billing_collection_installments
  ALTER COLUMN maintenance_amount_ars SET NOT NULL,
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN billing_account_key SET NOT NULL,
  -- Replace, rather than add a second relationship: existing PostgREST embeds must remain unambiguous.
  DROP CONSTRAINT billing_collection_installments_collection_id_fkey,
  ADD CONSTRAINT billing_collection_installments_collection_id_fkey
    FOREIGN KEY (collection_id, organization_id) REFERENCES public.billing_collections(id, organization_id) ON DELETE CASCADE,
  ADD CONSTRAINT billing_installments_maintenance_check CHECK (maintenance_amount_ars >= 0 AND maintenance_amount_ars <= amount_ars),
  ADD CONSTRAINT billing_installments_month_check CHECK (billing_month IS NULL OR
    (extract(day FROM billing_month) = 1 AND billing_month >= DATE '2000-01-01' AND billing_month < DATE '9999-01-01'));

CREATE UNIQUE INDEX billing_installments_account_month_key
  ON public.billing_collection_installments (organization_id, billing_account_key, billing_month)
  WHERE maintenance_amount_ars > 0 AND billing_month IS NOT NULL;
CREATE INDEX billing_installments_month_assigned_by_idx
  ON public.billing_collection_installments(billing_month_assigned_by) WHERE billing_month_assigned_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_billing_installment_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_collection public.billing_collections%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_collection FROM public.billing_collections WHERE id = NEW.collection_id;
  IF TG_OP = 'UPDATE' AND (NEW.collection_id IS DISTINCT FROM OLD.collection_id
      OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
      OR NEW.amount_ars IS DISTINCT FROM OLD.amount_ars
      OR NEW.maintenance_amount_ars IS DISTINCT FROM OLD.maintenance_amount_ars) THEN
    RAISE EXCEPTION 'No se pueden modificar los importes originales de una cuota';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.billing_month IS NOT NULL AND NEW.billing_month IS DISTINCT FROM OLD.billing_month THEN
    RAISE EXCEPTION 'El mes facturado ya fue asignado; requiere revisión administrativa';
  END IF;
  NEW.organization_id := v_collection.organization_id;
  NEW.billing_account_key := CASE WHEN v_collection.organizer_id IS NULL THEN 'tenant' ELSE 'organizer:' || v_collection.organizer_id::text END;
  NEW.maintenance_amount_ars := coalesce(NEW.maintenance_amount_ars, v_collection.maintenance_amount_per_installment_ars);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_billing_installment_snapshot() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER billing_installment_snapshot_guard BEFORE INSERT OR UPDATE ON public.billing_collection_installments
  FOR EACH ROW EXECUTE FUNCTION public.guard_billing_installment_snapshot();

-- A distinct RPC preserves the old signature while old application instances finish deploying.
CREATE OR REPLACE FUNCTION public.create_billing_collection_monthly(
  p_organization_id uuid, p_organizer_id uuid, p_organizer_label text,
  p_total_amount_ars integer, p_maintenance_amount_per_installment_ars integer,
  p_tournaments jsonb, p_installments jsonb, p_created_by uuid, p_first_month date
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid; v_count integer;
BEGIN
  IF p_first_month IS NULL OR extract(day FROM p_first_month) <> 1
      OR p_first_month < DATE '2000-01-01' OR p_first_month >= DATE '9999-01-01' THEN
    RAISE EXCEPTION 'Mes de facturación inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_billing_settings
      WHERE organization_id = p_organization_id AND billing_model = 'FV_LEAGUE') THEN
    RAISE EXCEPTION 'Los cobros mensuales solo están disponibles para FV';
  END IF;
  IF jsonb_typeof(p_tournaments) IS DISTINCT FROM 'array' OR jsonb_array_length(p_tournaments) NOT BETWEEN 1 AND 100
      OR jsonb_typeof(p_installments) IS DISTINCT FROM 'array' OR jsonb_array_length(p_installments) NOT BETWEEN 1 AND 24 THEN
    RAISE EXCEPTION 'Torneos o cuotas inválidos';
  END IF;
  PERFORM 1 FROM public.tournaments t
    WHERE t.id IN (SELECT (v->>'tournament_id')::uuid FROM jsonb_array_elements(p_tournaments) v)
    ORDER BY t.id FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.tournaments t
    JOIN jsonb_to_recordset(p_tournaments) v(tournament_id uuid) ON t.id = v.tournament_id
    WHERE t.organization_id = p_organization_id AND t.type::text = 'LONG' AND t.es_prueba = false;
  IF v_count <> jsonb_array_length(p_tournaments) OR EXISTS (
    SELECT 1 FROM public.tournament_billing_charges b
    WHERE b.tournament_id IN (SELECT (v->>'tournament_id')::uuid FROM jsonb_array_elements(p_tournaments) v)
      AND b.status <> 'PENDING'
  ) THEN RAISE EXCEPTION 'Los torneos no están disponibles para este tenant'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_installments) v(installment_number integer, amount_ars integer)
    WHERE v.amount_ars IS NULL OR v.amount_ars < p_maintenance_amount_per_installment_ars
      OR v.installment_number IS NULL
  ) OR (SELECT array_agg(v.installment_number ORDER BY v.installment_number)
        FROM jsonb_to_recordset(p_installments) v(installment_number integer))
    IS DISTINCT FROM ARRAY(SELECT generate_series(1, jsonb_array_length(p_installments))) THEN
    RAISE EXCEPTION 'Las cuotas deben ser consecutivas y cubrir su mantenimiento';
  END IF;
  v_id := public.create_billing_collection(p_organization_id, p_organizer_id, p_organizer_label,
    p_total_amount_ars, p_maintenance_amount_per_installment_ars, p_tournaments, p_installments, p_created_by);
  UPDATE public.billing_collection_installments SET
    billing_month = (p_first_month + make_interval(months => installment_number - 1))::date,
    billing_month_assigned_at = now(), billing_month_assigned_by = p_created_by
  WHERE collection_id = v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_billing_collection_monthly(uuid,uuid,text,integer,integer,jsonb,jsonb,uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_billing_collection_monthly(uuid,uuid,text,integer,integer,jsonb,jsonb,uuid,date) TO service_role;

CREATE OR REPLACE FUNCTION public.assign_billing_installment_month(
  p_installment_id uuid, p_organization_id uuid, p_billing_month date, p_assigned_by uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF p_billing_month IS NULL OR extract(day FROM p_billing_month) <> 1
      OR p_billing_month < DATE '2000-01-01' OR p_billing_month >= DATE '9999-01-01' THEN
    RAISE EXCEPTION 'Mes de facturación inválido';
  END IF;
  UPDATE public.billing_collection_installments SET billing_month = p_billing_month,
    billing_month_assigned_at = coalesce(billing_month_assigned_at, now()),
    billing_month_assigned_by = coalesce(billing_month_assigned_by, p_assigned_by)
  WHERE id = p_installment_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuota no encontrada para este tenant'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_billing_installment_month(uuid,uuid,date,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_billing_installment_month(uuid,uuid,date,uuid) TO service_role;

-- Serialize all sibling payments in the same order used by cancel_billing_collection.
CREATE OR REPLACE FUNCTION public.register_billing_installment_payment(
  p_installment_id uuid, p_amount_ars integer, p_payment_reference text,
  p_payment_note text, p_registered_by uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_collection_id uuid; v_installment public.billing_collection_installments%ROWTYPE;
  v_collection public.billing_collections%ROWTYPE; v_payment_id uuid; v_paid_amount bigint;
BEGIN
  SELECT collection_id INTO v_collection_id FROM public.billing_collection_installments WHERE id = p_installment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuota inexistente'; END IF;
  PERFORM 1 FROM public.billing_collection_installments WHERE collection_id = v_collection_id ORDER BY id FOR UPDATE;
  SELECT * INTO v_installment FROM public.billing_collection_installments WHERE id = p_installment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuota inexistente'; END IF;
  SELECT * INTO STRICT v_collection FROM public.billing_collections WHERE id = v_collection_id FOR UPDATE;
  IF v_installment.status = 'PAID' THEN RAISE EXCEPTION 'La cuota ya fue abonada'; END IF;
  IF p_amount_ars IS DISTINCT FROM v_installment.amount_ars THEN RAISE EXCEPTION 'El pago debe coincidir con el importe completo de la cuota'; END IF;
  SELECT coalesce(sum(p.amount_ars), 0) INTO v_paid_amount
    FROM public.billing_collection_installments i JOIN public.billing_installment_payments p ON p.installment_id = i.id
    WHERE i.collection_id = v_collection_id;
  IF v_paid_amount <> v_collection.amount_paid_ars
      OR (SELECT sum(amount_ars) FROM public.billing_collection_installments WHERE collection_id = v_collection_id) <> v_collection.total_amount_ars
      OR (SELECT sum(amount_ars) FROM public.billing_collection_tournaments WHERE collection_id = v_collection_id) <> v_collection.tournament_subtotal_ars
      OR (SELECT sum(amount_ars - maintenance_amount_ars) FROM public.billing_collection_installments WHERE collection_id = v_collection_id) <> v_collection.tournament_subtotal_ars
      OR EXISTS (SELECT 1 FROM public.billing_collection_installments i LEFT JOIN public.billing_installment_payments p ON p.installment_id = i.id
          WHERE i.collection_id = v_collection_id AND ((i.status = 'PAID') IS DISTINCT FROM (p.id IS NOT NULL) OR p.amount_ars <> i.amount_ars)) THEN
    RAISE EXCEPTION 'El cobro no concilia; revisá sus torneos, cuotas y pagos';
  END IF;
  INSERT INTO public.billing_installment_payments(installment_id,amount_ars,payment_reference,payment_note,registered_by)
    VALUES (p_installment_id,p_amount_ars,nullif(trim(p_payment_reference),''),nullif(trim(p_payment_note),''),p_registered_by)
    RETURNING id INTO v_payment_id;
  UPDATE public.billing_collection_installments SET status = 'PAID', paid_at = now(), paid_by = p_registered_by WHERE id = p_installment_id;
  v_paid_amount := v_paid_amount + p_amount_ars;
  UPDATE public.billing_collections SET amount_paid_ars = v_paid_amount, balance_ars = total_amount_ars - v_paid_amount,
    status = CASE WHEN v_paid_amount = total_amount_ars THEN 'PAID' ELSE 'PARTIALLY_PAID' END WHERE id = v_collection_id;
  RETURN v_payment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.register_billing_installment_payment(uuid,integer,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_billing_installment_payment(uuid,integer,text,text,uuid) TO service_role;

COMMENT ON COLUMN public.billing_collection_installments.billing_month IS 'Billing period, not payment date. NULL on legacy installments until explicitly assigned.';
COMMENT ON COLUMN public.billing_collection_installments.maintenance_amount_ars IS 'Frozen monthly maintenance included in amount_ars. Never allocated to tournaments.';
NOTIFY pgrst, 'reload schema';
