-- Permissions only: category/rule calculations are tested in TypeScript.
-- All fixture writes are rolled back. Requires an administrator and a non-member user.
BEGIN;
DO $$
DECLARE owner_id uuid;
BEGIN
  SELECT user_id INTO owner_id FROM public.organization_members
  WHERE is_active AND member_role IN ('owner', 'admin') LIMIT 1;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'An administrator is required'; END IF;
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  IF has_table_privilege('anon','public.tenant_tournament_list_settings','SELECT')
    OR has_table_privilege('authenticated','public.tenant_tournament_list_settings','DELETE') THEN
    RAISE EXCEPTION 'Excessive grants';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
INSERT INTO public.tenant_tournament_list_settings(surface,rules,updated_by)
VALUES('panel','[{"field":"category","direction":"asc"}]',auth.uid())
ON CONFLICT(surface) DO UPDATE SET rules=excluded.rules,updated_by=excluded.updated_by;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.tenant_tournament_list_settings WHERE surface='panel' AND rules->0->>'field'='category') THEN
    RAISE EXCEPTION 'Administrator cannot read the shared settings';
  END IF;
END;
$$;
RESET ROLE;
DO $$
DECLARE outsider_id uuid;
BEGIN
  SELECT u.id INTO outsider_id FROM public.users u WHERE u.role <> 'ADMIN'
    AND NOT EXISTS(SELECT 1 FROM public.organization_members m WHERE m.user_id=u.id AND m.is_active)
    AND NOT EXISTS(SELECT 1 FROM public.clubes c WHERE c.user_id=u.id) LIMIT 1;
  IF outsider_id IS NULL THEN RAISE EXCEPTION 'A non-member is required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',outsider_id::text,true);
END;
$$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE affected integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.tenant_tournament_list_settings) THEN RAISE EXCEPTION 'Unrelated user can read settings'; END IF;
  UPDATE public.tenant_tournament_list_settings SET rules='[{"field":"category","direction":"desc"}]' WHERE surface='panel';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Unrelated user can update settings'; END IF;
  BEGIN
    INSERT INTO public.tenant_tournament_list_settings(surface,rules,updated_by)
    VALUES('my-tournaments','[{"field":"category","direction":"asc"}]',auth.uid());
    RAISE EXCEPTION 'Unrelated user can insert settings';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;
ROLLBACK;
