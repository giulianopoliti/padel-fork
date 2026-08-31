-- Preserve historical public slugs when a canonical SEO convention evolves.
CREATE TABLE IF NOT EXISTS public.tournament_seo_slug_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  seo_slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_seo_slug_aliases_organization_slug_unique UNIQUE (organization_id, seo_slug),
  CONSTRAINT tournament_seo_slug_aliases_tournament_slug_unique UNIQUE (tournament_id, seo_slug)
);

CREATE INDEX IF NOT EXISTS tournament_seo_slug_aliases_tournament_id_idx
  ON public.tournament_seo_slug_aliases (tournament_id);

ALTER TABLE public.tournament_seo_slug_aliases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tournament_seo_slug_aliases'
      AND policyname = 'Public can resolve active tournament SEO slug aliases'
  ) THEN
    CREATE POLICY "Public can resolve active tournament SEO slug aliases"
      ON public.tournament_seo_slug_aliases
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.tournaments
          WHERE tournaments.id = tournament_seo_slug_aliases.tournament_id
            AND tournaments.organization_id = tournament_seo_slug_aliases.organization_id
            AND tournaments.is_draft IS DISTINCT FROM true
        )
      );
  END IF;
END $$;
