-- Execute after the migration. Fixtures are rolled back.
begin;
create function pg_temp.assert_true(condition boolean, label text) returns void
language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;

insert into auth.users(id, aud, role) values
  ('ab000000-0000-4000-8000-000000000001','authenticated','authenticated'),
  ('ab000000-0000-4000-8000-000000000002','authenticated','authenticated');
insert into public.users(id, role) values
  ('ab000000-0000-4000-8000-000000000001','CLUB'),
  ('ab000000-0000-4000-8000-000000000002','PLAYER');
select set_config('request.jwt.claim.role','service_role',true);
insert into public.players(id, first_name, last_name, score, user_id) values
  ('ab100000-0000-4000-8000-000000000001','Ana','Original',1000,null),
  ('ab100000-0000-4000-8000-000000000002','Bea','Original',1000,null),
  ('ab100000-0000-4000-8000-000000000003','Carla','Suplente',1100,'ab000000-0000-4000-8000-000000000002'),
  ('ab100000-0000-4000-8000-000000000004','Diana','Suplente',1200,null),
  ('ab100000-0000-4000-8000-000000000005','Elena','Rival',1000,null),
  ('ab100000-0000-4000-8000-000000000006','Fabiana','Rival',1000,null);
select set_config('request.jwt.claim.role','',true);
insert into public.clubes(id, user_id) values ('ab200000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001');
insert into public.couples(id, player1_id, player2_id) values
  ('ab300000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002'),
  ('ab300000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000005','ab100000-0000-4000-8000-000000000006');
insert into public.tournaments(id, name, type, status, club_id, gender) values
  ('ab400000-0000-4000-8000-000000000001','Suplencias LONG','LONG','NOT_STARTED','ab200000-0000-4000-8000-000000000001','MALE');
insert into public.inscriptions(tournament_id, couple_id, player_id) values
  ('ab400000-0000-4000-8000-000000000001','ab300000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001'),
  ('ab400000-0000-4000-8000-000000000001','ab300000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000005');
insert into public.tournament_fechas(id, tournament_id, fecha_number, name, created_at) values
  ('ab500000-0000-4000-8000-000000000001','ab400000-0000-4000-8000-000000000001',1,'Fecha 1','2026-01-01'),
  ('ab500000-0000-4000-8000-000000000002','ab400000-0000-4000-8000-000000000001',2,'Fecha 2','2026-01-02');
insert into public.matches(id, tournament_id, couple1_id, couple2_id, status, round, type)
select id,'ab400000-0000-4000-8000-000000000001','ab300000-0000-4000-8000-000000000001','ab300000-0000-4000-8000-000000000002',
  'PENDING','ZONE','ZONE' from unnest(array['ab600000-0000-4000-8000-000000000001','ab600000-0000-4000-8000-000000000002']::uuid[]) id;
insert into public.fecha_matches(match_id, fecha_id, scheduled_date, scheduled_start_time, scheduled_end_time) values
  ('ab600000-0000-4000-8000-000000000001','ab500000-0000-4000-8000-000000000001','2026-03-05','18:00','19:00'),
  ('ab600000-0000-4000-8000-000000000002','ab500000-0000-4000-8000-000000000002','2026-03-04','18:00','19:00');

set local role service_role;
select public.manage_long_substitution('ab400000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001',null,
  'ab300000-0000-4000-8000-000000000001',2,'ab100000-0000-4000-8000-000000000003','FROM_MATCH','ab600000-0000-4000-8000-000000000002',false);
select pg_temp.assert_true((select jsonb_array_length(public.get_long_substitution_editor('ab400000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001','ab300000-0000-4000-8000-000000000001',null)->'matches')) = 2,'organizer can open the editor');
select pg_temp.assert_true((select count(*) from public.list_long_substitution_rules('ab400000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001')) = 1,'inscriptions show the definitive change');

do $$begin
  perform public.manage_long_substitution('ab400000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000002',null,
    'ab300000-0000-4000-8000-000000000001',2,'ab100000-0000-4000-8000-000000000004','ONLY_MATCH','ab600000-0000-4000-8000-000000000002',false);
  raise exception 'FAIL: player was able to assign a substitute';
exception when insufficient_privilege then raise notice 'PASS: player cannot assign a substitute'; end $$;
reset role;

insert into public.matches(id, tournament_id, couple1_id, couple2_id, status, round, type, bracket_key) values
  ('ab600000-0000-4000-8000-000000000003','ab400000-0000-4000-8000-000000000001','ab300000-0000-4000-8000-000000000001',
   'ab300000-0000-4000-8000-000000000002','PENDING','SEMIFINAL','ELIMINATION','SILVER'),
  ('ab600000-0000-4000-8000-000000000004','ab400000-0000-4000-8000-000000000001','ab300000-0000-4000-8000-000000000001',
   'ab300000-0000-4000-8000-000000000002','DRAFT','FINAL','ELIMINATION','SILVER');
insert into public.tournament_fechas(id, tournament_id, fecha_number, name, created_at) values
  ('ab500000-0000-4000-8000-000000000003','ab400000-0000-4000-8000-000000000001',3,'Fecha 3','2026-01-03');
insert into public.matches(id, tournament_id, couple1_id, couple2_id, status, round, type) values
  ('ab600000-0000-4000-8000-000000000005','ab400000-0000-4000-8000-000000000001','ab300000-0000-4000-8000-000000000001',
   'ab300000-0000-4000-8000-000000000002','DRAFT','ZONE','ZONE');
insert into public.fecha_matches(match_id, fecha_id) values
  ('ab600000-0000-4000-8000-000000000005','ab500000-0000-4000-8000-000000000003');

set local role service_role;
select public.manage_long_substitution('ab400000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001',null,
  'ab300000-0000-4000-8000-000000000001',2,'ab100000-0000-4000-8000-000000000004','ONLY_MATCH','ab600000-0000-4000-8000-000000000003',false);
select pg_temp.assert_true((select replaced_name from public.list_long_substitution_rules('ab400000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001') where scope='ONLY_MATCH') = 'Carla Suplente', 'inscriptions identify who is actually being covered');
reset role;

select pg_temp.assert_true(not exists(select 1 from public.get_long_match_lineups(array['ab600000-0000-4000-8000-000000000001'::uuid])),
  'a postponed earlier fecha retains the original pair');
select pg_temp.assert_true((select player->>'first_name' from public.get_long_match_lineups(array['ab600000-0000-4000-8000-000000000003'::uuid])) = 'Diana',
  'the one-match substitution overrides the permanent rule');
select pg_temp.assert_true((select player->>'first_name' from public.get_long_match_lineups(array['ab600000-0000-4000-8000-000000000004'::uuid])) = 'Carla',
  'the permanent substitute returns for a newly generated final');
select pg_temp.assert_true((select player->>'first_name' from public.get_long_match_lineups(array['ab600000-0000-4000-8000-000000000005'::uuid])) = 'Carla',
  'a group match created and assigned to a later fecha inherits the permanent substitute');

set local role anon;
select pg_temp.assert_true(not exists(select 1 from public.get_long_match_lineups(array['ab600000-0000-4000-8000-000000000004'::uuid])),
  'draft lineup stays private');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select array_agg(match_id) from public.get_my_long_substitute_matches('ab400000-0000-4000-8000-000000000001'))
  = array['ab600000-0000-4000-8000-000000000002'::uuid], 'the substitute sees their assigned published match');
select pg_temp.assert_true((select array_agg(match_id) from public.get_my_upcoming_long_substitute_matches())
  = array['ab600000-0000-4000-8000-000000000002'::uuid], 'the player panel sees only effective upcoming substitute matches');
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(not exists(select 1 from public.get_my_upcoming_long_substitute_matches()),
  'another account cannot read the substitute agenda');
reset role;

insert into public.set_matches(match_id, set_number, couple1_games, couple2_games, status) values
  ('ab600000-0000-4000-8000-000000000003',1,6,4,'COMPLETED');
update public.matches set status='FINISHED', winner_id='ab300000-0000-4000-8000-000000000001'
  where id='ab600000-0000-4000-8000-000000000003';
select pg_temp.assert_true((select player2_id from long_substitution_private.match_lineups
  where match_id='ab600000-0000-4000-8000-000000000003' and couple_id='ab300000-0000-4000-8000-000000000001')
  = 'ab100000-0000-4000-8000-000000000004', 'first set freezes the effective players');
select pg_temp.assert_true((select player2_id from public.couples where id='ab300000-0000-4000-8000-000000000001')
  = 'ab100000-0000-4000-8000-000000000002','the registered couple retains its original player IDs');
set local role service_role;
select pg_temp.assert_true(public.get_tournament_points_context_with_lineups('ab400000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001')->'context'->'snapshots'
  @> '[{"player_id":"ab100000-0000-4000-8000-000000000004","score":1200,"basis":"SUBSTITUTION"}]',
  'points context includes the effective substitute and her captured rating');
reset role;

update public.matches set status='IN_PROGRESS' where id='ab600000-0000-4000-8000-000000000002';
set local role service_role;
select public.manage_long_substitution('ab400000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001',
  (select id from long_substitution_private.long_substitutions where tournament_id='ab400000-0000-4000-8000-000000000001' and scope='FROM_MATCH'),
  'ab300000-0000-4000-8000-000000000001',2,'ab100000-0000-4000-8000-000000000004','FROM_MATCH','ab600000-0000-4000-8000-000000000002',false);
reset role;
select pg_temp.assert_true((select player->>'first_name' from public.get_long_match_lineups(array['ab600000-0000-4000-8000-000000000002'::uuid])) = 'Carla',
  'editing a permanent rule preserves the already started match');
select pg_temp.assert_true((select player->>'first_name' from public.get_long_match_lineups(array['ab600000-0000-4000-8000-000000000004'::uuid])) = 'Diana',
  'editing a permanent rule updates the upcoming final');
set local role authenticated;
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select array_agg(match_id) from public.get_my_upcoming_long_substitute_matches())
  = array['ab600000-0000-4000-8000-000000000002'::uuid], 'a frozen substitute still sees their in-progress match after a rule changes');
reset role;

update public.matches set status='FINISHED', winner_id='ab300000-0000-4000-8000-000000000001'
  where tournament_id='ab400000-0000-4000-8000-000000000001';
update public.tournaments set status='FINISHED_POINTS_PENDING' where id='ab400000-0000-4000-8000-000000000001';

set local role service_role;
do $$
declare tournament uuid := 'ab400000-0000-4000-8000-000000000001';
  actor uuid := 'ab000000-0000-4000-8000-000000000001';
  source jsonb := public.get_tournament_points_context_with_lineups(tournament, actor);
  rows jsonb;
begin
  select jsonb_agg(jsonb_build_object('playerId', p->>'id', 'pointsBefore', p->'score', 'pointsAfter', p->'score',
    'categoryBefore', p->'category_name', 'categoryAfter', p->'category_name', 'matchPoints', 0, 'bonus', 0, 'pointsEarned', 0))
  into rows from jsonb_array_elements(source->'context'->'players') p;
  perform public.commit_tournament_points_with_lineups(tournament, actor, source->>'fingerprint', jsonb_build_object('review',
    jsonb_build_object('rulesVersion','manual-categories-v1','tournamentId',tournament,'fingerprint',source->>'fingerprint',
      'state','PREVIEW','playerScores',rows),'matchPoints','[]'::jsonb));
end $$;
select pg_temp.assert_true((select count(*) from public.player_tournament_history
  where tournament_id='ab400000-0000-4000-8000-000000000001' and player_id in (
    'ab100000-0000-4000-8000-000000000003','ab100000-0000-4000-8000-000000000004')) = 2,
  'points confirmation accepts both effective substitutes');
reset role;

rollback;
