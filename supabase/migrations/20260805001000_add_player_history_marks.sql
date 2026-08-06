CREATE TABLE IF NOT EXISTS public.player_history_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizaciones(id) ON DELETE SET NULL,
  club_id uuid REFERENCES public.clubes(id) ON DELETE SET NULL,
  mark_type text NOT NULL DEFAULT 'YELLOW',
  note text NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  resolution_note text,
  CONSTRAINT player_history_marks_mark_type_check
    CHECK (mark_type IN ('YELLOW', 'BLOCKED')),
  CONSTRAINT player_history_marks_note_not_blank
    CHECK (length(btrim(note)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_player_history_marks_player
ON public.player_history_marks (player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_history_marks_organization
ON public.player_history_marks (organization_id, created_at DESC)
WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_player_history_marks_tournament
ON public.player_history_marks (tournament_id, created_at DESC)
WHERE tournament_id IS NOT NULL;

ALTER TABLE public.player_history_marks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.player_history_marks TO authenticated;
GRANT ALL ON public.player_history_marks TO service_role;

CREATE POLICY "Admins can manage player history marks"
ON public.player_history_marks
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.role = 'ADMIN'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.role = 'ADMIN'
  )
);

CREATE POLICY "Organization members can read player history marks"
ON public.player_history_marks
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT om.organizacion_id
    FROM public.organization_members om
    WHERE om.user_id = (SELECT auth.uid())
      AND om.is_active = true
  )
  OR club_id IN (
    SELECT c.id
    FROM public.clubes c
    WHERE c.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Organization members can create player history marks"
ON public.player_history_marks
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND mark_type = 'YELLOW'
  AND (
    organization_id IN (
      SELECT om.organizacion_id
      FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
        AND om.is_active = true
    )
    OR club_id IN (
      SELECT c.id
      FROM public.clubes c
      WHERE c.user_id = (SELECT auth.uid())
    )
  )
);

COMMENT ON TABLE public.player_history_marks IS
'Simple player history marks. Currently used for yellow warnings; BLOCKED is reserved for a future blocked-list workflow.';

COMMENT ON COLUMN public.player_history_marks.mark_type IS
'YELLOW is an informational warning. BLOCKED is reserved for future blocked-list implementation.';
