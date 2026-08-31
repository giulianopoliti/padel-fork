-- Additive and deliberately nullable: existing UUID URLs remain the source of truth.
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS seo_slug text;

-- The public resolver always scopes by organization and ignores rows without a slug.
-- A partial index keeps the index small while allowing the staged backfill.
CREATE UNIQUE INDEX IF NOT EXISTS tournaments_organization_seo_slug_unique
  ON public.tournaments (organization_id, seo_slug)
  WHERE seo_slug IS NOT NULL;
