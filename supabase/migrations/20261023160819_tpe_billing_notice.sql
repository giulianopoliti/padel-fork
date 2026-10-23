CREATE TABLE public.tenant_billing_notices (
  organization_id uuid PRIMARY KEY REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_billing_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_billing_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_billing_notices TO service_role;
CREATE TRIGGER tenant_billing_notices_updated_at
  BEFORE UPDATE ON public.tenant_billing_notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
COMMENT ON TABLE public.tenant_billing_notices IS
  'Manual service-payment notice. Server validates ADMIN for updates and active tenant organizer membership for reads.';
