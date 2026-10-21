-- The local runner supplies the phase-one fixtures in a disposable schema clone.
begin;
set local search_path=public,extensions;
select no_plan();
set local role service_role;
do $$ begin perform american_free_test.gen('eight',8,8); end $$;
create temporary table bracket_before_zone_creation as
  select american_free_private.snapshot(american_free_test.fid('eight')) as snapshot;

-- Match the existing POST payload: type defaults to ZONE and status is IN_PROGRESS.
select lives_ok($$insert into public.matches(id,tournament_id,zone_id,couple1_id,couple2_id,court,status,round)
  values(american_free_test.fid('new-zone-match'),american_free_test.fid('eight'),american_free_test.fid('eight-zone'),
    american_free_test.fid('c1'),american_free_test.fid('c2'),'2','IN_PROGRESS','ZONE')$$,
  'organizer can start a zone match after generating the manual bracket');
select is((select status::text from public.matches where id=american_free_test.fid('new-zone-match')),
  'IN_PROGRESS','new zone match starts immediately');
select is((select type from public.matches where id=american_free_test.fid('new-zone-match')),
  'ZONE','existing form defaults to a zone match');

do $$ begin perform set_config('request.jwt.claims',json_build_object('sub',american_free_test.fid('owner'),'role','authenticated')::text,true); end $$;
set local role authenticated;
select lives_ok($$insert into public.matches(id,tournament_id,zone_id,couple1_id,couple2_id,court,status,round)
  values(american_free_test.fid('authenticated-zone-match'),american_free_test.fid('eight'),american_free_test.fid('eight-zone'),
    american_free_test.fid('c3'),american_free_test.fid('c4'),'3','IN_PROGRESS','ZONE')$$,
  'the real user-scoped form can create a zone match under RLS');
set local role service_role;

select throws_ok($$insert into public.matches(tournament_id,zone_id,type,round,status,couple1_id,couple2_id,result_couple1)
  values(american_free_test.fid('eight'),american_free_test.fid('eight-zone'),'ZONE','ZONE','IN_PROGRESS',
    american_free_test.fid('c1'),american_free_test.fid('c2'),'6')$$,
  '42501','Americano libre requiere persistencia transaccional','creation cannot smuggle in a zone score');
select throws_ok($$insert into public.matches(tournament_id,zone_id,type,round,status,couple1_id,couple2_id,winner_id)
  values(american_free_test.fid('eight'),american_free_test.fid('eight-zone'),'ZONE','ZONE','IN_PROGRESS',
    american_free_test.fid('c1'),american_free_test.fid('c2'),american_free_test.fid('c1'))$$,
  '42501','Americano libre requiere persistencia transaccional','creation cannot smuggle in a winner');
select throws_ok($$insert into public.matches(tournament_id,zone_id,type,round,status,couple1_id,couple2_id)
  values(american_free_test.fid('eight'),american_free_test.fid('eight-zone'),'ZONE','ZONE','FINISHED',
    american_free_test.fid('c1'),american_free_test.fid('c2'))$$,
  '42501','Americano libre requiere persistencia transaccional','finished zone matches still require the sports transaction');
select throws_ok($$update public.matches set result_couple1='6',result_couple2='2',winner_id=american_free_test.fid('c1'),status='FINISHED'
  where id=american_free_test.fid('new-zone-match')$$,
  '42501','Americano libre requiere persistencia transaccional','zone results remain protected after creation');
select throws_ok($$insert into public.matches(tournament_id,type,round,status,couple1_id,couple2_id)
  values(american_free_test.fid('eight'),'ELIMINATION','FINAL','IN_PROGRESS',american_free_test.fid('c1'),american_free_test.fid('c2'))$$,
  '42501','Americano libre requiere persistencia transaccional','elimination matches remain protected');
select is(american_free_private.snapshot(american_free_test.fid('eight')),
  (select snapshot from bracket_before_zone_creation),'zone creation preserves the entire bracket and revision');
select lives_ok($$insert into public.matches(tournament_id,zone_id,couple1_id,couple2_id,status,round)
  values(american_free_test.fid('twenty'),american_free_test.fid('twenty-zone'),american_free_test.fid('c1'),american_free_test.fid('c2'),
    'IN_PROGRESS','ZONE')$$,'zone creation before bracket generation still works');
select * from finish();
rollback;
