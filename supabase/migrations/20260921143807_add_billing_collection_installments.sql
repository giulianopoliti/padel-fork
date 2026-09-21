CREATE TABLE public.billing_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  organizer_label text NOT NULL,
  currency text NOT NULL DEFAULT 'ARS',
  total_amount_ars integer NOT NULL,
  amount_paid_ars integer NOT NULL DEFAULT 0,
  balance_ars integer NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT billing_collections_currency_check CHECK (currency = 'ARS'),
  CONSTRAINT billing_collections_amounts_check CHECK (
    total_amount_ars > 0
    AND amount_paid_ars >= 0
    AND balance_ars >= 0
    AND amount_paid_ars + balance_ars = total_amount_ars
  ),
  CONSTRAINT billing_collections_status_check CHECK (status IN ('OPEN', 'PARTIALLY_PAID', 'PAID')),
  CONSTRAINT billing_collections_status_amount_check CHECK (
    (status = 'OPEN' AND amount_paid_ars = 0)
    OR (status = 'PARTIALLY_PAID' AND amount_paid_ars > 0 AND balance_ars > 0)
    OR (status = 'PAID' AND balance_ars = 0)
  )
);

CREATE TABLE public.billing_collection_tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.billing_collections(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  amount_ars integer NOT NULL CHECK (amount_ars >= 0),
  tournament_name text NOT NULL,
  club_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT billing_collection_tournaments_collection_tournament_key UNIQUE (collection_id, tournament_id)
);

CREATE UNIQUE INDEX billing_collection_tournaments_tournament_id_key
  ON public.billing_collection_tournaments(tournament_id);

CREATE INDEX billing_collections_org_organizer_status_idx
  ON public.billing_collections(organization_id, organizer_id, status, created_at DESC);

CREATE TABLE public.billing_collection_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.billing_collections(id) ON DELETE CASCADE,
  installment_number smallint NOT NULL CHECK (installment_number > 0),
  amount_ars integer NOT NULL CHECK (amount_ars > 0),
  status text NOT NULL DEFAULT 'PENDING',
  issued_at timestamp with time zone,
  issued_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  paid_at timestamp with time zone,
  paid_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT billing_collection_installments_status_check CHECK (status IN ('PENDING', 'ISSUED', 'PAID')),
  CONSTRAINT billing_collection_installments_paid_check CHECK (
    (status = 'PAID' AND paid_at IS NOT NULL AND paid_by IS NOT NULL)
    OR (status IN ('PENDING', 'ISSUED') AND paid_at IS NULL)
  ),
  CONSTRAINT billing_collection_installments_collection_number_key UNIQUE (collection_id, installment_number)
);

CREATE INDEX billing_collection_installments_collection_status_idx
  ON public.billing_collection_installments(collection_id, status, installment_number);

CREATE TABLE public.billing_installment_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id uuid NOT NULL REFERENCES public.billing_collection_installments(id) ON DELETE RESTRICT,
  amount_ars integer NOT NULL CHECK (amount_ars > 0),
  payment_reference text,
  payment_note text,
  registered_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  paid_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT billing_installment_payments_installment_key UNIQUE (installment_id)
);

CREATE INDEX billing_installment_payments_installment_idx
  ON public.billing_installment_payments(installment_id);

CREATE TRIGGER billing_collections_set_updated_at
  BEFORE UPDATE ON public.billing_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER billing_collection_installments_set_updated_at
  BEFORE UPDATE ON public.billing_collection_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
    club_name text
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
    collection_id, tournament_id, amount_ars, tournament_name, club_name
  )
  SELECT v_collection_id, value.tournament_id, value.amount_ars, value.tournament_name, value.club_name
  FROM jsonb_to_recordset(p_tournaments) AS value(
    tournament_id uuid,
    amount_ars integer,
    tournament_name text,
    club_name text
  );

  INSERT INTO public.billing_collection_installments (collection_id, installment_number, amount_ars)
  SELECT v_collection_id, value.installment_number, value.amount_ars
  FROM jsonb_to_recordset(p_installments) AS value(installment_number smallint, amount_ars integer);

  RETURN v_collection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_billing_installment_payment(
  p_installment_id uuid,
  p_amount_ars integer,
  p_payment_reference text,
  p_payment_note text,
  p_registered_by uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_installment public.billing_collection_installments%ROWTYPE;
  v_payment_id uuid;
  v_paid_amount integer;
  v_total_amount integer;
BEGIN
  SELECT * INTO v_installment
  FROM public.billing_collection_installments
  WHERE id = p_installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuota inexistente';
  END IF;

  IF v_installment.status = 'PAID' THEN
    RAISE EXCEPTION 'La cuota ya fue abonada';
  END IF;

  IF p_amount_ars <> v_installment.amount_ars THEN
    RAISE EXCEPTION 'El pago debe coincidir con el importe completo de la cuota';
  END IF;

  INSERT INTO public.billing_installment_payments (
    installment_id, amount_ars, payment_reference, payment_note, registered_by
  ) VALUES (
    p_installment_id, p_amount_ars, nullif(trim(p_payment_reference), ''), nullif(trim(p_payment_note), ''), p_registered_by
  ) RETURNING id INTO v_payment_id;

  UPDATE public.billing_collection_installments
  SET status = 'PAID', paid_at = now(), paid_by = p_registered_by
  WHERE id = p_installment_id;

  SELECT total_amount_ars, coalesce(sum(payment.amount_ars), 0)
    INTO v_total_amount, v_paid_amount
  FROM public.billing_collections collection
  LEFT JOIN public.billing_collection_installments installment ON installment.collection_id = collection.id
  LEFT JOIN public.billing_installment_payments payment ON payment.installment_id = installment.id
  WHERE collection.id = v_installment.collection_id
  GROUP BY collection.total_amount_ars;

  UPDATE public.billing_collections
  SET amount_paid_ars = v_paid_amount,
      balance_ars = v_total_amount - v_paid_amount,
      status = CASE
        WHEN v_paid_amount = 0 THEN 'OPEN'
        WHEN v_paid_amount = v_total_amount THEN 'PAID'
        ELSE 'PARTIALLY_PAID'
      END
  WHERE id = v_installment.collection_id;

  RETURN v_payment_id;
END;
$$;

ALTER TABLE public.billing_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_collection_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_collection_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_installment_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.billing_collections FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_collection_tournaments FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_collection_installments FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_installment_payments FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_billing_collection(uuid, uuid, text, integer, jsonb, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_billing_installment_payment(uuid, integer, text, text, uuid) FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_collections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_collection_tournaments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_collection_installments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_installment_payments TO service_role;
GRANT EXECUTE ON FUNCTION public.create_billing_collection(uuid, uuid, text, integer, jsonb, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_billing_installment_payment(uuid, integer, text, text, uuid) TO service_role;
