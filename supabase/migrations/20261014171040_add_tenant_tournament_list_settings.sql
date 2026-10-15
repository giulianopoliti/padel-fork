-- Numeric categories, including ranges. Mixed sums/unknown categories sort last.
CREATE FUNCTION public.tournament_category_sort_rank(category_name text, category_config jsonb)
RETURNS smallint LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  first_category text;
  second_category text;
BEGIN
  IF category_config->>'mode' = 'MIXED_SUM' THEN RETURN NULL; END IF;
  IF category_config->>'mode' = 'RANGE' THEN
    first_category := substring(trim(category_config->>'categoryA') FROM '^([1-9])([^0-9]|$)');
    second_category := substring(trim(category_config->>'categoryB') FROM '^([1-9])([^0-9]|$)');
    RETURN least(first_category::smallint, second_category::smallint);
  END IF;
  first_category := substring(trim(CASE WHEN category_config->>'mode' = 'SINGLE'
    THEN category_config->>'category' ELSE category_name END) FROM '^([1-9])([^0-9]|$)');
  RETURN first_category::smallint;
END;
$$;
REVOKE ALL ON FUNCTION public.tournament_category_sort_rank(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_category_sort_rank(text, jsonb) TO authenticated, service_role;

ALTER TABLE public.tournaments
  ADD COLUMN list_category_rank smallint GENERATED ALWAYS AS
    (public.tournament_category_sort_rank(category_name, category_config)) STORED,
  ADD COLUMN list_status_rank smallint GENERATED ALWAYS AS
    (CASE status WHEN 'NOT_STARTED' THEN 1 WHEN 'ZONE_PHASE' THEN 2 WHEN 'BRACKET_PHASE' THEN 3 ELSE NULL END) STORED;

CREATE FUNCTION public.valid_tournament_sort_rules(surface text, rules jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  rule jsonb;
  fields text[] := ARRAY[]::text[];
BEGIN
  IF rules IS NULL OR jsonb_typeof(rules) <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(rules) NOT BETWEEN 1 AND 4 THEN RETURN false; END IF;
  FOR rule IN SELECT value FROM jsonb_array_elements(rules) LOOP
    IF jsonb_typeof(rule) <> 'object' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(rule)) <> 2 THEN RETURN false; END IF;
    IF rule->>'field' IS NULL OR rule->>'direction' IS NULL THEN RETURN false; END IF;
    IF rule->>'field' NOT IN ('created_at', 'status', 'category', 'start_date')
      OR rule->>'direction' NOT IN ('asc', 'desc') THEN RETURN false; END IF;
    IF surface = 'my-tournaments' AND rule->>'field' = 'status' THEN RETURN false; END IF;
    IF rule->>'field' = ANY(fields) THEN RETURN false; END IF;
    fields := array_append(fields, rule->>'field');
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.valid_tournament_sort_rules(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valid_tournament_sort_rules(text, jsonb) TO authenticated, service_role;

CREATE TABLE public.tenant_tournament_list_settings (
  organization_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  surface text NOT NULL CHECK (surface IN ('panel', 'my-tournaments')),
  rules jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (organization_id, surface),
  CONSTRAINT tenant_tournament_list_settings_rules_check CHECK (public.valid_tournament_sort_rules(surface, rules))
);
CREATE INDEX tenant_tournament_list_settings_updated_by_idx ON public.tenant_tournament_list_settings(updated_by);
COMMENT ON TABLE public.tenant_tournament_list_settings IS 'Shared tenant tournament ordering, independently configured per screen; array order is priority.';

ALTER TABLE public.tenant_tournament_list_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_tournament_list_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_tournament_list_settings TO authenticated;
GRANT ALL ON public.tenant_tournament_list_settings TO service_role;

CREATE POLICY tenant_tournament_sort_read ON public.tenant_tournament_list_settings
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.organizacion_id = organization_id AND m.user_id = (SELECT auth.uid()) AND m.is_active)
  OR EXISTS (SELECT 1 FROM public.organization_clubs oc JOIN public.clubes c ON c.id = oc.club_id
    WHERE oc.organizacion_id = organization_id AND c.user_id = (SELECT auth.uid()))
);
CREATE POLICY tenant_tournament_sort_insert ON public.tenant_tournament_list_settings
FOR INSERT TO authenticated WITH CHECK (
  updated_by = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.organizacion_id = organization_id AND m.user_id = (SELECT auth.uid()) AND m.is_active AND m.member_role IN ('owner', 'admin'))
);
CREATE POLICY tenant_tournament_sort_update ON public.tenant_tournament_list_settings
FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.organizacion_id = organization_id AND m.user_id = (SELECT auth.uid()) AND m.is_active AND m.member_role IN ('owner', 'admin'))
) WITH CHECK (
  updated_by = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.organizacion_id = organization_id AND m.user_id = (SELECT auth.uid()) AND m.is_active AND m.member_role IN ('owner', 'admin'))
);

-- No initial rows: preserve the existing per-tenant ordering until the first save.
NOTIFY pgrst, 'reload schema';
