-- Business calculations are supplied by TypeScript at the tournament write boundary.
-- The CLI may execute statements separately; own the transaction required by LOCK.
BEGIN;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS category_sort_value numeric(3,1),
  ADD COLUMN IF NOT EXISTS status_sort_value smallint;

LOCK TABLE public.tenant_tournament_list_settings IN ACCESS EXCLUSIVE MODE;
-- A database now has one configuration per screen. Keep the most recent row
-- if an older installation created settings for more than one organization.
WITH ranked AS (
  SELECT ctid, row_number() OVER (PARTITION BY surface ORDER BY updated_at DESC, organization_id) AS position
  FROM public.tenant_tournament_list_settings
)
DELETE FROM public.tenant_tournament_list_settings s USING ranked r
WHERE s.ctid = r.ctid AND r.position > 1;

DROP POLICY tenant_tournament_sort_read ON public.tenant_tournament_list_settings;
DROP POLICY tenant_tournament_sort_insert ON public.tenant_tournament_list_settings;
DROP POLICY tenant_tournament_sort_update ON public.tenant_tournament_list_settings;
ALTER TABLE public.tenant_tournament_list_settings
  DROP CONSTRAINT tenant_tournament_list_settings_rules_check,
  DROP CONSTRAINT tenant_tournament_list_settings_pkey,
  DROP COLUMN organization_id,
  ADD PRIMARY KEY (surface),
  ADD CONSTRAINT tenant_tournament_list_settings_rules_array_check
    CHECK (jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) BETWEEN 1 AND 4);

CREATE POLICY tenant_tournament_sort_read ON public.tenant_tournament_list_settings
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = (SELECT auth.uid()) AND m.is_active)
  OR EXISTS (SELECT 1 FROM public.clubes c WHERE c.user_id = (SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'ADMIN')
);
CREATE POLICY tenant_tournament_sort_insert ON public.tenant_tournament_list_settings
FOR INSERT TO authenticated WITH CHECK (
  updated_by = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active AND m.member_role IN ('owner', 'admin'))
);
CREATE POLICY tenant_tournament_sort_update ON public.tenant_tournament_list_settings
FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active AND m.member_role IN ('owner', 'admin'))
) WITH CHECK (
  updated_by = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active AND m.member_role IN ('owner', 'admin'))
);
COMMENT ON TABLE public.tenant_tournament_list_settings IS 'One tenant per database: one shared configuration per screen. Rules are validated in TypeScript.';
NOTIFY pgrst, 'reload schema';
COMMIT;
