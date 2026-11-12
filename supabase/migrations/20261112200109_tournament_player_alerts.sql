create table public.tournament_player_alerts (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 500),
  primary key (tournament_id, player_id)
);

create index tournament_player_alerts_player_idx on public.tournament_player_alerts(player_id);

alter table public.tournament_player_alerts enable row level security;
revoke all on table public.tournament_player_alerts from public, anon, authenticated;
grant select, insert, update, delete on table public.tournament_player_alerts to service_role;
