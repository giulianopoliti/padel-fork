CREATE TABLE public.tenant_billing_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  billing_model text NOT NULL,
  currency text NOT NULL DEFAULT 'ARS',
  fv_amount_up_to_16 integer NOT NULL DEFAULT 50000,
  fv_amount_over_16 integer NOT NULL DEFAULT 70000,
  tpe_amount_per_player integer NOT NULL DEFAULT 1000,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tenant_billing_settings_model_check
    CHECK (billing_model IN ('FV_LEAGUE', 'TPE_PLAYER')),
  CONSTRAINT tenant_billing_settings_currency_check
    CHECK (currency = 'ARS'),
  CONSTRAINT tenant_billing_settings_amounts_check
    CHECK (
      fv_amount_up_to_16 >= 0
      AND fv_amount_over_16 >= 0
      AND tpe_amount_per_player >= 0
    )
);

CREATE INDEX tenant_billing_settings_updated_by_idx
  ON public.tenant_billing_settings(updated_by);

CREATE TABLE public.tournament_billing_charges (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  billing_model text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  billable_units integer NOT NULL,
  pricing_rule text NOT NULL,
  unit_amount_ars integer NOT NULL,
  amount_ars integer NOT NULL,
  period_start date,
  period_end date,
  resolved_at timestamp with time zone,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tournament_billing_charges_model_check
    CHECK (billing_model IN ('FV_LEAGUE', 'TPE_PLAYER')),
  CONSTRAINT tournament_billing_charges_status_check
    CHECK (status IN ('PENDING', 'PAID', 'DISMISSED')),
  CONSTRAINT tournament_billing_charges_amounts_check
    CHECK (billable_units >= 0 AND unit_amount_ars >= 0 AND amount_ars >= 0),
  CONSTRAINT tournament_billing_charges_period_check
    CHECK (
      (period_start IS NULL AND period_end IS NULL)
      OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_start <= period_end)
    ),
  CONSTRAINT tournament_billing_charges_resolution_check
    CHECK (
      (status = 'PENDING' AND resolved_at IS NULL)
      OR (status IN ('PAID', 'DISMISSED') AND resolved_at IS NOT NULL)
    )
);

CREATE INDEX tournament_billing_charges_org_status_idx
  ON public.tournament_billing_charges(organization_id, status);

CREATE INDEX tournament_billing_charges_org_period_idx
  ON public.tournament_billing_charges(organization_id, period_start, period_end);

CREATE INDEX tournament_billing_charges_updated_by_idx
  ON public.tournament_billing_charges(updated_by);

CREATE TRIGGER tenant_billing_settings_set_updated_at
  BEFORE UPDATE ON public.tenant_billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tournament_billing_charges_set_updated_at
  BEFORE UPDATE ON public.tournament_billing_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_billing_charges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_billing_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.tournament_billing_charges FROM anon, authenticated;
REVOKE ALL ON TABLE public.tenant_billing_settings FROM service_role;
REVOKE ALL ON TABLE public.tournament_billing_charges FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_billing_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_billing_charges TO service_role;

COMMENT ON TABLE public.tenant_billing_settings IS
  'Tenant-scoped editable billing rates. Only trusted admin server code may access this table.';
COMMENT ON TABLE public.tournament_billing_charges IS
  'Per-tournament billing status and immutable snapshots for paid or dismissed charges.';

INSERT INTO public.tenant_billing_settings (organization_id, billing_model)
SELECT id, 'FV_LEAGUE'
FROM public.organizaciones
WHERE slug = 'padel-fv'
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO public.tenant_billing_settings (organization_id, billing_model)
SELECT id, 'TPE_PLAYER'
FROM public.organizaciones
WHERE slug IN ('padel-elite', 'tpe-padel')
ON CONFLICT (organization_id) DO NOTHING;
