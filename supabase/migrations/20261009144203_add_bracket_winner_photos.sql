CREATE TABLE public.tournament_winner_photos (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  bracket_key text NOT NULL CHECK (bracket_key IN ('MAIN','GOLD','SILVER')),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  winner_id uuid NOT NULL REFERENCES public.couples(id),
  image_url text NOT NULL CHECK (length(image_url) > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, bracket_key)
);
ALTER TABLE public.tournament_winner_photos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tournament_winner_photos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tournament_winner_photos TO authenticated;
GRANT ALL ON public.tournament_winner_photos TO service_role;
CREATE POLICY winner_photos_public_read ON public.tournament_winner_photos FOR SELECT TO anon, authenticated USING (true);

DO $migration$
DECLARE
  organizer_owner_access text := $predicate$
    EXISTS (
      SELECT 1 FROM public.tournaments t
      JOIN public.organization_members om ON om.organizacion_id = t.organization_id
      JOIN public.users u ON u.id = om.user_id
      WHERE t.id = tournament_winner_photos.tournament_id
        AND om.user_id = (SELECT auth.uid()) AND om.is_active AND u.role::text = 'ORGANIZADOR'
        AND t.status::text IN ('FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED')
    )
  $predicate$;
  organizer_access text := $predicate$
    EXISTS (
      SELECT 1 FROM public.tournaments t
      JOIN public.organization_members om ON om.organizacion_id = t.organization_id
      JOIN public.users u ON u.id = om.user_id
      JOIN public.matches m ON m.tournament_id = t.id
      WHERE t.id = tournament_winner_photos.tournament_id
        AND om.user_id = (SELECT auth.uid()) AND om.is_active AND u.role::text = 'ORGANIZADOR'
        AND t.status::text IN ('FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED')
        AND m.id = tournament_winner_photos.match_id AND m.round::text = 'FINAL' AND m.status::text = 'FINISHED'
        AND m.bracket_key = tournament_winner_photos.bracket_key AND m.winner_id = tournament_winner_photos.winner_id
    )
  $predicate$;
  storage_access text := $predicate$
    bucket_id <> 'tournaments' OR storage.filename(storage.objects.name) !~* '^winner([.-]|$)'
    OR (
      array_length(storage.foldername(storage.objects.name), 1) = 1
      AND storage.extension(storage.objects.name) IN ('jpg','jpeg','png','webp')
      AND EXISTS (
        SELECT 1 FROM public.tournaments t
        JOIN public.organization_members om ON om.organizacion_id = t.organization_id
        JOIN public.users u ON u.id = om.user_id
        JOIN public.matches m ON m.tournament_id = t.id
        WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
          AND om.user_id = (SELECT auth.uid()) AND om.is_active AND u.role::text = 'ORGANIZADOR'
          AND t.status::text IN ('FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED')
          AND m.round::text = 'FINAL' AND m.status::text = 'FINISHED' AND m.winner_id IS NOT NULL
          AND (
            storage.filename(storage.objects.name) LIKE 'winner-' || lower(m.bracket_key) || '-%'
            OR (storage.filename(storage.objects.name) !~ '^winner-(main|gold|silver)-' AND m.winner_id = t.winner_id)
          )
      )
    )
  $predicate$;
BEGIN
  EXECUTE 'CREATE POLICY winner_photos_organizer_insert ON public.tournament_winner_photos FOR INSERT TO authenticated WITH CHECK (' || organizer_access || ')';
  EXECUTE 'CREATE POLICY winner_photos_organizer_update ON public.tournament_winner_photos FOR UPDATE TO authenticated USING (' || organizer_owner_access || ') WITH CHECK (' || organizer_access || ')';
  EXECUTE 'CREATE POLICY winner_photos_organizer_delete ON public.tournament_winner_photos FOR DELETE TO authenticated USING (' || organizer_owner_access || ')';
  DROP POLICY IF EXISTS winner_photo_organizer_insert ON storage.objects;
  DROP POLICY IF EXISTS winner_photo_organizer_update ON storage.objects;
  DROP POLICY IF EXISTS winner_photo_organizer_delete ON storage.objects;
  EXECUTE 'CREATE POLICY winner_photo_organizer_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (' || storage_access || ')';
  EXECUTE 'CREATE POLICY winner_photo_organizer_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (' || storage_access || ') WITH CHECK (' || storage_access || ')';
  EXECUTE 'CREATE POLICY winner_photo_organizer_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (' || storage_access || ')';
END;
$migration$;

CREATE FUNCTION public.validate_bracket_winner_photo() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.matches m JOIN public.tournaments t ON t.id = m.tournament_id
    WHERE m.id = NEW.match_id AND m.tournament_id = NEW.tournament_id
      AND m.bracket_key = NEW.bracket_key AND m.winner_id = NEW.winner_id
      AND m.round::text = 'FINAL' AND m.status::text = 'FINISHED'
      AND t.status::text IN ('FINISHED_POINTS_PENDING','FINISHED_POINTS_CALCULATED')
  ) THEN
    RAISE EXCEPTION 'Photo must belong to the current champions of this cup' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'tournaments'
      AND (storage.foldername(o.name))[1] = NEW.tournament_id::text
      AND storage.filename(o.name) LIKE 'winner-' || lower(NEW.bracket_key) || '-%'
      AND split_part(NEW.image_url, '/storage/v1/object/public/tournaments/', 2) = o.name
  ) THEN
    RAISE EXCEPTION 'Photo must exist in the storage folder for this cup' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.validate_bracket_winner_photo() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_bracket_winner_photo BEFORE INSERT OR UPDATE ON public.tournament_winner_photos
FOR EACH ROW EXECUTE FUNCTION public.validate_bracket_winner_photo();

-- Legacy single-photo records remain available as a read fallback; they are never
-- copied into Silver, which has a different champion and needs its own photo.
