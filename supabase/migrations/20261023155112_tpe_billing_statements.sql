-- Recuperada del historial remoto de TPE; no eliminar esta versión.
-- FV ya recibió 20261023160819 sin esta versión anterior. Las operaciones
-- idempotentes permiten completar su historial sin reemplazar tablas ni datos.
-- Las publicaciones manuales son legado: la aplicación actual sólo usa notices.
CREATE TABLE IF NOT EXISTS public.tenant_billing_notices (
  organization_id uuid PRIMARY KEY REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_billing_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_billing_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_billing_notices TO service_role;
DROP TRIGGER IF EXISTS tenant_billing_notices_updated_at ON public.tenant_billing_notices;
CREATE TRIGGER tenant_billing_notices_updated_at
  BEFORE UPDATE ON public.tenant_billing_notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.tenant_billing_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  amount_ars integer NOT NULL CHECK (amount_ars > 0),
  due_date date NOT NULL,
  payment_instructions text NOT NULL DEFAULT '' CHECK (char_length(payment_instructions) <= 2000),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'CANCELLED')),
  pdf_path text UNIQUE,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_billing_statement_pdf_scope CHECK (
    pdf_path IS NULL OR pdf_path = organization_id::text || '/' || id::text || '.pdf'
  )
);
CREATE INDEX IF NOT EXISTS tenant_billing_statements_org_created_idx
  ON public.tenant_billing_statements (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_billing_statements_created_by_idx
  ON public.tenant_billing_statements (created_by);
DROP TRIGGER IF EXISTS tenant_billing_statements_updated_at ON public.tenant_billing_statements;
CREATE TRIGGER tenant_billing_statements_updated_at
  BEFORE UPDATE ON public.tenant_billing_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Como el resto de billing, sólo se accede desde el servidor, que verifica rol y tenant.
ALTER TABLE public.tenant_billing_statements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_billing_statements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_billing_statements TO service_role;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('billing-statements', 'billing-statements', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE public.tenant_billing_statements IS
  'Service invoices explicitly published by ADMIN for the tenant organizer. Server-only access; PDFs remain private.';
