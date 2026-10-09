-- Run with psql -v ON_ERROR_STOP=1. All fixtures are rolled back.
begin;

insert into auth.users (id, aud, role) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated'),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated'),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated');
insert into public.users (id, role) values
  ('10000000-0000-4000-8000-000000000001', 'PLAYER'),
  ('10000000-0000-4000-8000-000000000002', 'PLAYER'),
  ('10000000-0000-4000-8000-000000000003', 'CLUB');
insert into public.players (id, user_id) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002');
insert into public.clubes (id, user_id) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003');
insert into public.organizaciones (id, name, slug) values
  ('30000000-0000-4000-8000-000000000002', 'RLS registration test', 'rls-registration-test');
insert into public.organization_members (organizacion_id, user_id) values
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003');
insert into public.couples (id, player1_id, player2_id) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', null);
insert into public.tournaments (id, type, status, club_id, show_public_inscriptions) values
  ('50000000-0000-4000-8000-000000000001', 'LONG', 'NOT_STARTED', '30000000-0000-4000-8000-000000000001', false),
  ('50000000-0000-4000-8000-000000000002', 'LONG', 'NOT_STARTED', '30000000-0000-4000-8000-000000000001', true),
  ('50000000-0000-4000-8000-000000000003', 'AMERICAN', 'NOT_STARTED', '30000000-0000-4000-8000-000000000001', true);
update public.tournaments set club_id = null, organization_id = '30000000-0000-4000-8000-000000000002'
where id = '50000000-0000-4000-8000-000000000002';
insert into public.zones (id, tournament_id, name, created_at) values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Zona General', '2026-01-01'),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'Zona General', '2026-01-01'),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', 'Otra zona', '2026-01-02'),
  ('60000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000003', 'Zona A', '2026-01-01');
insert into public.inscriptions (tournament_id, couple_id, player_id) values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');

create function pg_temp.assert_rejected(statement text, label text) returns void
language plpgsql security invoker as $$
begin
  begin
    execute statement;
  exception when insufficient_privilege then
    raise notice 'PASS: %', label;
    return;
  end;
  raise exception 'FAIL: % was allowed', label;
end;
$$;

-- Local fixtures may have RLS disabled on these dependencies. Exercise the
-- policy with their production visibility rules too; rollback restores them.
alter table public.inscriptions enable row level security;
alter table public.zones enable row level security;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select pg_temp.assert_rejected($sql$insert into public.zone_positions (tournament_id, zone_id, couple_id, position) values
 ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 1)$sql$, 'another couple');
select pg_temp.assert_rejected($sql$insert into public.zone_positions (tournament_id, zone_id, couple_id, position) values
 ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 1)$sql$, 'zone from another tournament');
select pg_temp.assert_rejected($sql$insert into public.zone_positions (tournament_id, zone_id, couple_id, position) values
 ('50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 1)$sql$, 'missing inscription');
select pg_temp.assert_rejected($sql$insert into public.zone_positions (tournament_id, zone_id, couple_id, position) values
 ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 1)$sql$, 'non-general zone');
select pg_temp.assert_rejected($sql$insert into public.zone_positions (tournament_id, zone_id, couple_id, position, points) values
 ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 1, 99)$sql$, 'fabricated score');
select pg_temp.assert_rejected($sql$insert into public.zone_positions (tournament_id, zone_id, couple_id, position) values
 ('50000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 1)$sql$, 'AMERICAN player assignment');

-- INSERT ... RETURNING mirrors the application, including SELECT RLS.
insert into public.zone_positions (tournament_id, zone_id, couple_id, position) values
 ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 1) returning id;
do $$begin raise notice 'PASS: first player with private inscriptions'; end$$;

do $$begin
  update public.zone_positions set points = 99 where tournament_id = '50000000-0000-4000-8000-000000000001';
  if found then raise exception 'FAIL: player can update positions'; end if;
  delete from public.zone_positions where tournament_id = '50000000-0000-4000-8000-000000000001';
  if found then raise exception 'FAIL: player can delete positions'; end if;
  raise notice 'PASS: player update and delete blocked';
end$$;

reset role;
delete from public.zone_positions where tournament_id = '50000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
insert into public.zone_positions (tournament_id, zone_id, couple_id, position) values
 ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 1) returning id;
do $$begin raise notice 'PASS: second player with private inscriptions'; end$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
insert into public.zone_positions (tournament_id, zone_id, couple_id, position) values
 ('50000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 1) returning id;
do $$begin raise notice 'PASS: club owner assignment preserved'; end$$;

reset role;
insert into public.inscriptions (tournament_id, couple_id, player_id) values
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
set local role authenticated;
insert into public.zone_positions (tournament_id, zone_id, couple_id, position) values
 ('50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 1) returning id;
do $$begin raise notice 'PASS: organization member assignment preserved'; end$$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_rejected($sql$insert into public.zone_positions (tournament_id, zone_id, couple_id, position) values
 ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 2)$sql$, 'anonymous assignment');

rollback;
