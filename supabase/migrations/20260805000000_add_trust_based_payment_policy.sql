DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'inscription_payment_method'
  ) THEN
    CREATE TYPE public.inscription_payment_method AS ENUM (
      'CASH',
      'TRANSFER'
    );
  END IF;
END $$;

ALTER TABLE public.tournaments
ADD COLUMN IF NOT EXISTS enable_trust_based_payment_policy boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS trust_policy_min_played_tournaments integer NOT NULL DEFAULT 2,
ADD COLUMN IF NOT EXISTS transfer_amount_per_player numeric(10,2);

ALTER TABLE public.inscriptions
ADD COLUMN IF NOT EXISTS payment_method public.inscription_payment_method,
ADD COLUMN IF NOT EXISTS payment_amount_per_player_snapshot numeric(10,2),
ADD COLUMN IF NOT EXISTS payment_total_amount_snapshot numeric(10,2),
ADD COLUMN IF NOT EXISTS trust_policy_applied boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS trust_policy_min_tournaments_snapshot integer,
ADD COLUMN IF NOT EXISTS trust_player_played_tournaments_snapshot integer;

CREATE INDEX IF NOT EXISTS idx_inscriptions_payment_method
ON public.inscriptions (payment_method);

CREATE INDEX IF NOT EXISTS idx_inscriptions_trust_policy_applied
ON public.inscriptions (trust_policy_applied);

COMMENT ON COLUMN public.tournaments.enable_trust_based_payment_policy IS
'When enabled for American tournaments, public player registrations use cash/transfer policy instead of the generic pending-validation and forced-proof switches.';

COMMENT ON COLUMN public.tournaments.trust_policy_min_played_tournaments IS
'Minimum organization tournaments played by the registering player before cash registrations are auto-confirmed.';

COMMENT ON COLUMN public.tournaments.transfer_amount_per_player IS
'Transfer/deposit amount shown per player when the trust-based payment policy is active.';

COMMENT ON COLUMN public.inscriptions.payment_method IS
'Payment method chosen by the player during public registration.';

COMMENT ON COLUMN public.inscriptions.payment_amount_per_player_snapshot IS
'Per-player payment amount shown to the player at registration time.';

COMMENT ON COLUMN public.inscriptions.payment_total_amount_snapshot IS
'Total couple payment amount shown to the player at registration time.';

COMMENT ON COLUMN public.inscriptions.trust_policy_applied IS
'Whether the trust-based payment policy decided the pending/confirmed state for this inscription.';

COMMENT ON COLUMN public.inscriptions.trust_policy_min_tournaments_snapshot IS
'Minimum played-tournament threshold used when this inscription was created.';

COMMENT ON COLUMN public.inscriptions.trust_player_played_tournaments_snapshot IS
'Played tournament count for the registering player when this inscription was created.';

UPDATE public.tournaments
SET enable_trust_based_payment_policy = true
WHERE type = 'AMERICAN'
  AND organization_id IN (
    SELECT id
    FROM public.organizaciones
    WHERE slug = 'padel-elite'
  );
