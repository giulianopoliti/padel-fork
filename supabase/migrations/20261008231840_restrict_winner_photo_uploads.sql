-- Keep existing tournament artwork permissions; additionally protect the reserved
-- winner filenames, even when a client bypasses the application's Server Action.
DO $migration$
DECLARE
  winner_access text := $predicate$
    bucket_id <> 'tournaments'
    OR storage.filename(storage.objects.name) !~* '^winner([.-]|$)'
    OR (
      array_length(storage.foldername(storage.objects.name), 1) = 1
      AND storage.extension(storage.objects.name) IN ('jpg', 'jpeg', 'png', 'webp')
      AND EXISTS (
        SELECT 1 FROM public.tournaments t
        JOIN public.organization_members om ON om.organizacion_id = t.organization_id
        JOIN public.users u ON u.id = om.user_id
        WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
          AND om.user_id = (SELECT auth.uid()) AND om.is_active
          AND u.role::text = 'ORGANIZADOR'
          AND t.status::text IN ('FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED')
          AND t.winner_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.matches m
            WHERE m.tournament_id = t.id AND m.round::text = 'FINAL'
              AND m.status::text = 'FINISHED' AND m.winner_id = t.winner_id
          )
      )
    )
  $predicate$;
BEGIN
  EXECUTE 'CREATE POLICY "winner_photo_organizer_insert" ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (' || winner_access || ')';
  EXECUTE 'CREATE POLICY "winner_photo_organizer_update" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (' || winner_access || ') WITH CHECK (' || winner_access || ')';
  EXECUTE 'CREATE POLICY "winner_photo_organizer_delete" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (' || winner_access || ')';
END;
$migration$;

-- Existing tournament UPDATE policies also allow clubs. Guard this one column
-- so only organizers can publish a winner photo through direct database calls.
CREATE FUNCTION public.guard_tournament_winner_photo() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF NEW.winner_image_url IS NOT DISTINCT FROM OLD.winner_image_url THEN
    RETURN NEW;
  END IF;
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.status::text NOT IN ('FINISHED_POINTS_PENDING', 'FINISHED_POINTS_CALCULATED')
    OR NEW.winner_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.users u ON u.id = om.user_id
      WHERE om.organizacion_id = NEW.organization_id
        AND om.user_id = (SELECT auth.uid()) AND om.is_active
        AND u.role::text = 'ORGANIZADOR'
    )
  THEN
    RAISE EXCEPTION 'Only tournament organizers can publish winner photos for completed tournaments' USING ERRCODE = '42501';
  END IF;
  IF NEW.winner_image_url IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'tournaments'
      AND (storage.foldername(o.name))[1] = NEW.id::text
      AND storage.filename(o.name) ~* '^winner([.-]|$)'
      AND split_part(NEW.winner_image_url, '/storage/v1/object/public/tournaments/', 2) = o.name
  ) THEN
    RAISE EXCEPTION 'Winner photo must exist in the tournament storage folder' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_tournament_winner_photo() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_tournament_winner_photo
BEFORE UPDATE OF winner_image_url ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.guard_tournament_winner_photo();
