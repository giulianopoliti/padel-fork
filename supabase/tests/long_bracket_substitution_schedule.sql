-- Local fixtures roll back.
begin;

create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end
$$;

insert into auth.users(id, aud, role) values
  ('ac000000-0000-4000-8000-000000000001','authenticated','authenticated'),
  ('ac000000-0000-4000-8000-000000000002','authenticated','authenticated'),
  ('ac000000-0000-4000-8000-000000000003','authenticated','authenticated');
insert into public.users(id, role) values
  ('ac000000-0000-4000-8000-000000000001','CLUB'),
  ('ac000000-0000-4000-8000-000000000002','PLAYER'),
  ('ac000000-0000-4000-8000-000000000003','PLAYER');
select set_config('request.jwt.claim.role','service_role',true);
insert into public.players(id, first_name, last_name, score, user_id) values
  ('ac100000-0000-4000-8000-000000000001','Ana','Titular',1000,null),
  ('ac100000-0000-4000-8000-000000000002','Bea','Titular',1000,'ac000000-0000-4000-8000-000000000003'),
  ('ac100000-0000-4000-8000-000000000003','Carla','Jornada',1000,'ac000000-0000-4000-8000-000000000002'),
  ('ac100000-0000-4000-8000-000000000004','Diana','Puntual',1000,null),
  ('ac100000-0000-4000-8000-000000000005','Elena','Rival',1000,null),
  ('ac100000-0000-4000-8000-000000000006','Fabiana','Rival',1000,null);
select set_config('request.jwt.claim.role','',true);
insert into public.clubes(id,user_id) values
  ('ac200000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001');
insert into public.couples(id,player1_id,player2_id) values
  ('ac300000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000002'),
  ('ac300000-0000-4000-8000-000000000002','ac100000-0000-4000-8000-000000000005','ac100000-0000-4000-8000-000000000006');

create temp table cups as
select cup, gen_random_uuid() tournament_id, gen_random_uuid() match_id, gen_random_uuid() first_fecha,
  gen_random_uuid() other_fecha, gen_random_uuid() final_fecha, gen_random_uuid() first_slot, gen_random_uuid() final_slot
from (values ('MAIN'),('GOLD'),('SILVER')) c(cup);
grant select on cups to service_role, authenticated;

insert into public.tournaments(id,name,type,status,club_id,gender)
select tournament_id,'Llave suplencias ' || cup,'LONG','NOT_STARTED','ac200000-0000-4000-8000-000000000001','MALE' from cups;
insert into public.inscriptions(tournament_id,couple_id,player_id)
select tournament_id,'ac300000-0000-4000-8000-000000000001'::uuid,'ac100000-0000-4000-8000-000000000001'::uuid from cups
union all
select tournament_id,'ac300000-0000-4000-8000-000000000002'::uuid,'ac100000-0000-4000-8000-000000000005'::uuid from cups;
insert into public.tournament_couple_seeds(tournament_id,couple_id,bracket_key,seed)
select tournament_id,'ac300000-0000-4000-8000-000000000001',cup,1 from cups;
insert into public.matches(id,tournament_id,couple1_id,couple2_id,status,type,round,bracket_key,order_in_round)
select match_id,tournament_id,'ac300000-0000-4000-8000-000000000001','ac300000-0000-4000-8000-000000000002',
  'PENDING','ELIMINATION','SEMIFINAL',cup,1 from cups;
insert into public.tournament_fechas(id,tournament_id,fecha_number,name,round_type,bracket_key)
select f.id,c.tournament_id,f.number,f.name,f.round_type,c.cup from cups c
cross join lateral (values
  (c.first_fecha,1,'Sábado','SEMIFINAL'::public."ROUND"),
  (c.other_fecha,2,'Domingo','SEMIFINAL'::public."ROUND"),
  (c.final_fecha,3,'Final','FINAL'::public."ROUND")
) f(id,number,name,round_type);
insert into public.tournament_time_slots(id,fecha_id,date,start_time,end_time,slot_type,is_system)
select r.slot,r.fecha,current_date + 2,'18:00','20:00','TIME_RANGE',false from cups c
cross join lateral (values (c.first_slot,c.first_fecha),(c.final_slot,c.final_fecha)) r(slot,fecha);
update public.tournaments set status='BRACKET_PHASE' where id in (select tournament_id from cups);

set local role authenticated;
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000003',true);
do $$declare slot uuid; begin
  select final_slot into slot from cups where cup='GOLD';
  begin
    insert into public.couple_time_availability(couple_id,time_slot_id,is_available)
    values ('ac300000-0000-4000-8000-000000000001',slot,true);
    raise exception 'FAIL: a starter voted for a final before qualifying';
  exception when insufficient_privilege then raise notice 'PASS: a starter cannot vote for an unqualified final'; end;
end $$;
reset role;

set local role service_role;
do $$declare fixture cups; begin
  select * into fixture from cups where cup = 'MAIN';
  begin
    perform public.manage_long_bracket_fecha_substitution(fixture.tournament_id,'ac000000-0000-4000-8000-000000000001',null,
      'ac300000-0000-4000-8000-000000000001',3,'ac100000-0000-4000-8000-000000000003','ONLY_FECHA',fixture.match_id,fixture.first_fecha);
    raise exception 'FAIL: invalid substitution succeeded';
  exception when invalid_parameter_value then null;
  end;
  perform pg_temp.assert_true(not exists(select 1 from public.fecha_matches where match_id=fixture.match_id),
    'invalid substitution rolls back the jornada link');
end $$;
select public.manage_long_bracket_fecha_substitution(tournament_id,'ac000000-0000-4000-8000-000000000001',null,
  'ac300000-0000-4000-8000-000000000001',2,'ac100000-0000-4000-8000-000000000003','FROM_FECHA',match_id,first_fecha)
from cups;
reset role;

select pg_temp.assert_true(count(*)=3,'the three brackets persist the jornada without setting a day or time')
from cups c join public.fecha_matches fm using(match_id)
where fm.fecha_id=c.first_fecha and fm.scheduled_date is null and fm.scheduled_start_time is null;

set local role service_role;
do $$declare fixture cups; begin
  select * into fixture from cups where cup='SILVER';
  begin
    perform public.manage_long_bracket_fecha_substitution(fixture.tournament_id,'ac000000-0000-4000-8000-000000000001',null,
      'ac300000-0000-4000-8000-000000000001',2,'ac100000-0000-4000-8000-000000000003','ONLY_FECHA',fixture.match_id,fixture.other_fecha);
    raise exception 'FAIL: substitution silently changed the linked jornada';
  exception when invalid_parameter_value then raise notice 'PASS: assigning a substitute cannot move a linked match'; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(count(*)=3,'the substitute can vote for the confirmed semifinal in each bracket')
from cups c cross join lateral public.get_my_long_fecha_substitutions(c.tournament_id) a
where a.fecha_id=c.first_fecha and a.can_vote and a.is_substitute;
select pg_temp.assert_true(count(*)=0,'same-round alternatives and unqualified finals grant no vote, even with a cup seed')
from cups c cross join lateral public.get_my_long_fecha_substitutions(c.tournament_id) a
where a.fecha_id in (c.other_fecha,c.final_fecha);
insert into public.couple_time_availability(couple_id,time_slot_id,is_available)
select 'ac300000-0000-4000-8000-000000000001',first_slot,true from cups;
reset role;

set local role service_role;
select public.manage_long_substitution(tournament_id,'ac000000-0000-4000-8000-000000000001',null,
  'ac300000-0000-4000-8000-000000000001',2,'ac100000-0000-4000-8000-000000000004','ONLY_MATCH',match_id,false)
from cups;
reset role;
update public.fecha_matches fm set fecha_id=c.other_fecha from cups c where c.match_id=fm.match_id;

select pg_temp.assert_true(count(*)=3,'a match-specific substitution follows the match to the new jornada')
from cups c cross join lateral public.get_long_match_lineups(array[c.match_id]) l
where l.player->>'first_name'='Diana';

set local role authenticated;
select pg_temp.assert_true(count(*)=0,'the old jornada is removed from the substitute agenda after moving the match')
from cups c cross join lateral public.get_my_long_fecha_substitutions(c.tournament_id) a
where a.fecha_id=c.first_fecha and a.can_vote;
reset role;

rollback;
