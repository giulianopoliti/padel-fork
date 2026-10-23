-- LOCAL ONLY; execute inside a transaction and ROLLBACK afterwards.
DO $test$
DECLARE v_org uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.organizaciones (id,name,slug,is_active)
    VALUES (v_org,'LOCAL billing notice QA','notice-qa-' || v_org,true);
  INSERT INTO public.tenant_billing_notices (organization_id) VALUES (v_org);
  IF (SELECT enabled FROM public.tenant_billing_notices WHERE organization_id=v_org) THEN
    RAISE EXCEPTION 'Notice must start disabled';
  END IF;
  UPDATE public.tenant_billing_notices SET enabled=true WHERE organization_id=v_org;
  IF NOT (SELECT enabled FROM public.tenant_billing_notices WHERE organization_id=v_org) THEN
    RAISE EXCEPTION 'Manual switch failed';
  END IF;
  IF has_table_privilege('authenticated','public.tenant_billing_notices','UPDATE')
    OR has_table_privilege('anon','public.tenant_billing_notices','SELECT')
    OR has_table_privilege('authenticated','public.tenant_billing_notices','SELECT') THEN
    RAISE EXCEPTION 'Untrusted role can directly access the notice';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.tenant_billing_notices'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled';
  END IF;
  RAISE NOTICE 'Manual billing notice: PASS';
END;
$test$;
