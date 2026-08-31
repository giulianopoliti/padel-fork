-- Keep registration availability separate from the public list of inscriptions.
-- Existing tournaments preserve their current visibility preference.
ALTER TABLE public.tournaments
ADD COLUMN IF NOT EXISTS show_public_inscriptions boolean NOT NULL DEFAULT true;

UPDATE public.tournaments
SET show_public_inscriptions = COALESCE(enable_public_inscriptions, true)
WHERE show_public_inscriptions IS DISTINCT FROM COALESCE(enable_public_inscriptions, true);

COMMENT ON COLUMN public.tournaments.show_public_inscriptions IS
'Controls whether visitors and players can see inscription counts and the /inscriptions list. It does not control whether players can register.';

-- The old policy exposed every tournament inscription through the Data API.
-- Keep a player limited to their own inscription when the list is private,
-- while managers retain full access and public tournaments remain readable.
DROP POLICY IF EXISTS "inscriptions_public_select" ON public.inscriptions;

CREATE POLICY "inscriptions_visibility_select"
ON public.inscriptions
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tournaments tournament
    WHERE tournament.id = inscriptions.tournament_id
      AND tournament.show_public_inscriptions = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.users app_user
    WHERE app_user.id = auth.uid()
      AND app_user.role = 'ADMIN'
  )
  OR EXISTS (
    SELECT 1
    FROM public.tournaments tournament
    INNER JOIN public.clubes club ON club.id = tournament.club_id
    WHERE tournament.id = inscriptions.tournament_id
      AND club.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.tournaments tournament
    INNER JOIN public.organization_members member
      ON member.organizacion_id = tournament.organization_id
    WHERE tournament.id = inscriptions.tournament_id
      AND member.user_id = auth.uid()
      AND member.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.players player
    WHERE player.id = inscriptions.player_id
      AND player.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.couples couple
    INNER JOIN public.players player_one ON player_one.id = couple.player1_id
    WHERE couple.id = inscriptions.couple_id
      AND player_one.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.couples couple
    INNER JOIN public.players player_two ON player_two.id = couple.player2_id
    WHERE couple.id = inscriptions.couple_id
      AND player_two.user_id = auth.uid()
  )
);
