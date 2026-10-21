-- Presentation belongs to the tournament, so bracket/zone resets preserve it.
alter table public.tournaments
  add column show_bracket_zone_references boolean not null default true;

comment on column public.tournaments.show_bracket_zone_references is
  'Whether Americano libre displays current zone positions next to bracket couples.';

notify pgrst, 'reload schema';
