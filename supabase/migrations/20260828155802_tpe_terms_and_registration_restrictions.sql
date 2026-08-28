-- TPE Padel: acceptance of global terms, late withdrawals and registration restrictions.
-- These tables are intentionally inert in the Padel FV database; application code only uses
-- them for Padel Elite AMERICAN tournaments.

create table public.tpe_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  inscription_id uuid references public.inscriptions(id) on delete set null,
  accepted_by_player_id uuid not null references public.players(id),
  accepted_by_user_id uuid not null references public.users(id),
  terms_version text not null,
  terms_url text not null,
  accepted_at timestamptz not null default now()
);

create table public.tpe_late_withdrawals (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  inscription_id uuid,
  player_id uuid not null references public.players(id),
  cancelled_by_user_id uuid not null references public.users(id),
  cancellation_source text not null check (cancellation_source in ('PLAYER', 'ORGANIZER')),
  tournament_start_at timestamptz not null,
  cancelled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (inscription_id, player_id)
);

create table public.tpe_registration_blocks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  blocked_by_user_id uuid not null references public.users(id),
  blocked_at timestamptz not null default now(),
  unblocked_by_user_id uuid references public.users(id),
  unblocked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tpe_registration_blocks_resolution_check check (
    (unblocked_at is null and unblocked_by_user_id is null)
    or (unblocked_at is not null and unblocked_by_user_id is not null)
  )
);

create unique index tpe_registration_blocks_one_active_player_idx
  on public.tpe_registration_blocks (player_id)
  where unblocked_at is null;

create table public.tpe_registration_block_overrides (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.tpe_registration_blocks(id),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id),
  authorized_by_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create index tpe_terms_acceptances_inscription_idx on public.tpe_terms_acceptances (inscription_id);
create index tpe_terms_acceptances_player_idx on public.tpe_terms_acceptances (accepted_by_player_id, accepted_at desc);
create index tpe_late_withdrawals_player_idx on public.tpe_late_withdrawals (player_id, cancelled_at desc);
create index tpe_late_withdrawals_tournament_idx on public.tpe_late_withdrawals (tournament_id);
create index tpe_registration_blocks_active_idx on public.tpe_registration_blocks (player_id) where unblocked_at is null;

alter table public.tpe_terms_acceptances enable row level security;
alter table public.tpe_late_withdrawals enable row level security;
alter table public.tpe_registration_blocks enable row level security;
alter table public.tpe_registration_block_overrides enable row level security;

revoke all on public.tpe_terms_acceptances, public.tpe_late_withdrawals,
  public.tpe_registration_blocks, public.tpe_registration_block_overrides
  from anon, authenticated;

-- Mutations and reads are performed only by authenticated server actions after
-- they verify the caller role. service_role keeps full access and bypasses RLS.
