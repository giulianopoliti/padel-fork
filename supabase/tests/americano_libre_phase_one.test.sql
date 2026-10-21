-- Run only in the separate local schema clone. Every fixture rolls back.
begin;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(k text) returns uuid language sql immutable as $$select md5('americano-phase1-'||k)::uuid$$;
create function pg_temp.mid(t text,r integer,i integer) returns uuid language sql immutable as $$select pg_temp.fid(t||'-'||r||'-'||i)$$;
create function pg_temp.structure(t text,base integer,n integer) returns jsonb language plpgsql as $$
declare ms jsonb:='[]'; hs jsonb:='[]'; total integer:=base/2; r integer:=6-log(2,base)::integer+1; i integer; first_round integer:=r;
  names text[]:=array['32VOS','16VOS','8VOS','4TOS','SEMIFINAL','FINAL'];
begin
  while total>=1 loop
    for i in 1..total loop
      ms:=ms||jsonb_build_array(jsonb_build_object('id',pg_temp.mid(t,r,i),'round',names[r],'order_in_round',i,
        'slot1_origin',case when r=first_round then 'ENTRY' else 'WINNER' end,
        'slot2_origin',case when r<>first_round then 'WINNER' when i<=base-n then 'BYE' else 'ENTRY' end));
      if r<6 then hs:=hs||jsonb_build_array(jsonb_build_object('child_match_id',pg_temp.mid(t,r,i),
        'parent_match_id',pg_temp.mid(t,r+1,(i+1)/2),'parent_slot',case when i%2=1 then 1 else 2 end)); end if;
    end loop;
    r:=r+1; total:=total/2;
  end loop;
  return jsonb_build_object('matches',ms,'hierarchy',hs);
end $$;
create function pg_temp.layout(t text) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object('id',id,'slot1_origin',free_slot1_origin,'slot2_origin',free_slot2_origin,
    'couple1_id',couple1_id,'couple2_id',couple2_id) order by id)
    from public.matches where tournament_id=pg_temp.fid(t) and type::text='ELIMINATION'
$$;
create function pg_temp.put(j jsonb,m uuid,s integer,c uuid,o text default 'ENTRY') returns jsonb language sql immutable as $$
  select jsonb_agg(case when x->>'id'=m::text then x||jsonb_build_object('couple'||s||'_id',c,'slot'||s||'_origin',o) else x end)
    from jsonb_array_elements(j) x
$$;
create function pg_temp.gen(t text,base integer,n integer,actor text default 'owner') returns jsonb language sql as $$
  select public.create_american_free_bracket(pg_temp.fid(t),pg_temp.fid(actor),n,
    pg_temp.structure(t,base,n)->'matches',pg_temp.structure(t,base,n)->'hierarchy')
$$;
create function pg_temp.save(t text,rev bigint,j jsonb,actor text default 'owner') returns jsonb language sql as $$
  select public.save_american_free_bracket(pg_temp.fid(t),pg_temp.fid(actor),rev,j)
$$;
insert into auth.users(id,email) select pg_temp.fid(k),k||'-free@example.invalid' from unnest(array['owner','stranger','admin','organizer','inactive']) k;
insert into public.users(id,email,role) select pg_temp.fid(k),k||'-free@example.invalid',
  case when k='admin' then 'ADMIN'::public."ROLE" when k in ('organizer','inactive') then 'ORGANIZADOR'::public."ROLE" else 'CLUB'::public."ROLE" end
  from unnest(array['owner','stranger','admin','organizer','inactive']) k;
insert into public.organizaciones(id,name,slug) values(pg_temp.fid('org'),'Free fixture org','americano-phase1-fixture');
insert into public.organization_members(organizacion_id,user_id,is_active)
  values(pg_temp.fid('org'),pg_temp.fid('organizer'),true),(pg_temp.fid('org'),pg_temp.fid('inactive'),false);
insert into public.categories(name,lower_range,upper_range) values('9na',0,200) on conflict(name) do nothing;
insert into public.clubes(id,user_id,name) values(pg_temp.fid('club'),pg_temp.fid('owner'),'Free fixture');
insert into public.players(id,first_name,last_name,category_name,score)
  select pg_temp.fid('player'||i),'Player'||i,'Fixture','9na',111 from generate_series(1,16) i;
insert into public.couples(id,player1_id,player2_id)
  select pg_temp.fid('c'||i),pg_temp.fid('player'||(i*2-1)),pg_temp.fid('player'||(i*2)) from generate_series(1,8) i;
insert into public.tournaments(id,club_id,name,type,status,category_name,gender,format_config)
  select pg_temp.fid(k),pg_temp.fid('club'),'Free '||k,'AMERICAN','ZONE_PHASE','9na','MALE',
    jsonb_build_object('version',2,'presetId','AMERICAN_MULTI_ZONE_FREE') from unnest(array['eight','twenty','thirtytwo','invalid','race','stranger_t']) k;
insert into public.tournaments(id,club_id,name,type,status) values(pg_temp.fid('legacy'),pg_temp.fid('club'),'Legacy','LONG','ZONE_PHASE');
update public.tournaments set organization_id=pg_temp.fid('org') where id=pg_temp.fid('eight');
insert into public.zones(id,tournament_id,name) select pg_temp.fid(k||'-zone'),pg_temp.fid(k),'Zona A'
  from unnest(array['eight','twenty','thirtytwo','invalid','race','stranger_t']) k;
insert into public.inscriptions(tournament_id,couple_id,is_pending)
  select pg_temp.fid(k),pg_temp.fid('c'||i),i=8 from unnest(array['eight','twenty','thirtytwo','invalid','race']) k cross join generate_series(1,8) i;
insert into public.zone_positions(tournament_id,zone_id,couple_id,position)
  select pg_temp.fid(k),pg_temp.fid(k||'-zone'),pg_temp.fid('c'||i),i from unnest(array['eight','twenty','thirtytwo','invalid','race']) k cross join generate_series(1,8) i;
insert into public.tournament_couple_disqualifications(tournament_id,couple_id,player1_id,player2_id,phase,status)
  values(pg_temp.fid('eight'),pg_temp.fid('c7'),pg_temp.fid('player13'),pg_temp.fid('player14'),'ZONE_PHASE','ACTIVE');

select ok(not has_function_privilege('anon','public.create_american_free_bracket(uuid,uuid,integer,jsonb,jsonb)','execute'),'anon cannot generate');
select ok(not has_function_privilege('authenticated','public.save_american_free_bracket(uuid,uuid,bigint,jsonb)','execute'),'browser cannot spoof actor');
select ok(not has_schema_privilege('authenticated','american_free_private','usage'),'private helpers unavailable to browsers');
set local role service_role;
select throws_ok($$select pg_temp.gen('eight',8,8,'stranger')$$,'42501','Sin permisos sobre el torneo','foreign manager rejected');
select throws_ok($$select pg_temp.gen('legacy',8,8)$$,'22023','El torneo no es Americano libre','legacy cannot use free RPC');
select throws_ok($$select public.create_american_free_bracket(pg_temp.fid('invalid'),pg_temp.fid('owner'),8,
  pg_temp.structure('invalid',8,8)->'matches','[]')$$,'22023','Estructura de llave incompleta','failure after insert rolls back');
select is((select count(*) from public.matches where tournament_id=pg_temp.fid('invalid')),0::bigint,'no partial matches');
select is((select status::text from public.tournaments where id=pg_temp.fid('invalid')),'ZONE_PHASE','failed generation preserves phase');
select lives_ok($$select pg_temp.gen('eight',8,8)$$,'empty eight generated atomically');
select is((select effective_capacity from public.american_free_brackets where tournament_id=pg_temp.fid('eight')),8,'eight entry capacity');
select is((select status::text from public.tournaments where id=pg_temp.fid('eight')),'BRACKET_PHASE','phase changes with structure');
select is((select count(*) from public.tournament_couple_seeds where tournament_id=pg_temp.fid('eight')),0::bigint,'no ranking seeds before assignment');
select throws_ok($$select pg_temp.gen('eight',8,8)$$,'22023','La generación requiere fase de zonas','no duplicate generation');
select lives_ok($$select pg_temp.save('eight',0,pg_temp.put(pg_temp.layout('eight'),pg_temp.mid('eight',4,1),1,pg_temp.fid('c1')))$$,'zone couple assignment');
select is((select revision from public.american_free_brackets where tournament_id=pg_temp.fid('eight')),1::bigint,'one revision per save');
select is((select status::text from public.matches where id=pg_temp.mid('eight',4,1)),'WAITING_OPONENT','one of two entries never invents BYE');
select throws_ok($$select pg_temp.save('eight',0,pg_temp.layout('eight'))$$,'40001','La llave cambió. Recargá antes de guardar.','stale editor rejected');
select throws_ok($$select pg_temp.save('eight',1,pg_temp.layout('eight'),'stranger')$$,'42501','Sin permisos sobre el torneo','save authorization repeated in DB');
select throws_ok($$select pg_temp.save('eight',1,pg_temp.layout('eight'),'inactive')$$,'42501','Sin permisos sobre el torneo','inactive organizer rejected');
select throws_ok($$select pg_temp.save('eight',1,pg_temp.put(pg_temp.layout('eight'),pg_temp.mid('eight',4,2),1,pg_temp.fid('c1')))$$,
  '22023','La pareja tiene dos entradas independientes','duplicate initial entry rejected');
select throws_ok($$select pg_temp.save('eight',1,pg_temp.put(pg_temp.layout('eight'),pg_temp.mid('eight',4,2),1,pg_temp.fid('c8')))$$,
  '22023','Participante, seed u origen no habilitado','pending inscription rejected');
select throws_ok($$select pg_temp.save('eight',1,pg_temp.put(pg_temp.layout('eight'),pg_temp.mid('eight',4,2),1,pg_temp.fid('c7')))$$,
  '22023','Participante, seed u origen no habilitado','disqualified couple rejected');
select is((select revision from public.american_free_brackets where tournament_id=pg_temp.fid('eight')),1::bigint,'failed saves preserve revision');
select is((select count(*) from public.tournament_couple_seeds where tournament_id=pg_temp.fid('eight')),1::bigint,'failed save rolls seed insert back');
select throws_ok($$update public.matches set couple1_id=null where id=pg_temp.mid('eight',4,1)$$,'42501','Americano libre requiere persistencia transaccional','legacy service writer blocked');
select throws_ok($$update public.match_hierarchy set parent_slot=2 where child_match_id=pg_temp.mid('eight',4,1)$$,
  '42501','Americano libre requiere persistencia transaccional','legacy rewire blocked');
select throws_ok($$delete from public.zone_positions where zone_id=pg_temp.fid('eight-zone') and couple_id=pg_temp.fid('c1')$$,
  '22023','Quitá la entrada de la llave antes de retirar la pareja de la zona','assigned membership cannot disappear');
select throws_ok($$update public.inscriptions set is_pending=true where tournament_id=pg_temp.fid('eight') and couple_id=pg_temp.fid('c1')$$,
  '22023','Quitá la entrada de la llave antes de cambiar su inscripción','assigned inscription cannot become pending');
select throws_ok($$update public.zones set tournament_id=pg_temp.fid('stranger_t') where id=pg_temp.fid('eight-zone')$$,
  '22023','No se puede trasladar una zona con entradas asignadas','zone cannot move assigned entries to another tournament');
delete from public.zone_positions where zone_id=pg_temp.fid('eight-zone') and couple_id=pg_temp.fid('c6');
select throws_ok($$select pg_temp.save('eight',1,pg_temp.put(pg_temp.layout('eight'),pg_temp.mid('eight',4,2),1,pg_temp.fid('c6')))$$,
  '22023','Participante, seed u origen no habilitado','approved couple outside a zone rejected');
select lives_ok($$select pg_temp.gen('twenty',32,20)$$,'twenty manual entries in base thirtytwo');
select is((select count(*) from public.matches where tournament_id=pg_temp.fid('twenty') and (free_slot1_origin='BYE' or free_slot2_origin='BYE')),12::bigint,'twelve planned byes');
select is((select count(*) from public.matches where tournament_id=pg_temp.fid('twenty') and (winner_id is not null or free_bye_processed)),0::bigint,'planned passes do not process themselves');
select lives_ok($$select pg_temp.gen('thirtytwo',32,32)$$,'base thirtytwo generated');
select lives_ok($$select pg_temp.save('thirtytwo',0,pg_temp.put(pg_temp.layout('thirtytwo'),pg_temp.mid('thirtytwo',2,1),1,pg_temp.fid('c1')))$$,'place entry in first round');
select throws_ok($$select pg_temp.save('thirtytwo',1,pg_temp.put(pg_temp.layout('thirtytwo'),pg_temp.mid('thirtytwo',4,1),1,pg_temp.fid('c2')))$$,
  '22023','Una rama con participantes, agenda o actividad no se puede inactivar','occupied grandchild blocks direct entry');
select lives_ok($$select pg_temp.save('thirtytwo',1,pg_temp.put(pg_temp.put(pg_temp.layout('thirtytwo'),pg_temp.mid('thirtytwo',2,1),1,null),
  pg_temp.mid('thirtytwo',4,1),1,pg_temp.fid('c1')))$$,'move own entry to ancestor slot');
select is((select effective_capacity from public.american_free_brackets where tournament_id=pg_temp.fid('thirtytwo')),29,'quarter direct capacity 29');
select is((select count(*) from public.matches where tournament_id=pg_temp.fid('thirtytwo') and not bracket_is_active),3::bigint,'exact three previous matches inactive');
select ok((select bracket_is_active from public.matches where id=pg_temp.mid('thirtytwo',3,2)),'opponent branch preserved');
select is((select count(*) from public.matches where tournament_id=pg_temp.fid('thirtytwo')),31::bigint,'all match identifiers retained');
select lives_ok($$select pg_temp.save('thirtytwo',2,pg_temp.put(pg_temp.put(pg_temp.layout('thirtytwo'),pg_temp.mid('thirtytwo',4,1),1,null,'WINNER'),
  pg_temp.mid('thirtytwo',3,1),2,pg_temp.fid('c1')))$$,'retreat to chosen octavos side');
select is((select effective_capacity from public.american_free_brackets where tournament_id=pg_temp.fid('thirtytwo')),31,'retreat capacity 31');
select is((select count(*) from public.match_hierarchy where tournament_id=pg_temp.fid('thirtytwo')),30::bigint,'connections retained');
select is((select count(*) from public.matches where tournament_id=pg_temp.fid('thirtytwo') and (free_bye_processed or winner_id is not null)),0::bigint,'retreat invents no wins');
select is(jsonb_array_length(american_free_private.snapshot(pg_temp.fid('thirtytwo'))->'matches'),31,'canonical snapshot includes inactive matches');
select is(jsonb_array_length(american_free_private.snapshot(pg_temp.fid('thirtytwo'))->'hierarchy'),30,'canonical snapshot includes original connections');
select throws_ok($$select pg_temp.save('thirtytwo',3,pg_temp.put(pg_temp.put(pg_temp.layout('thirtytwo'),pg_temp.mid('thirtytwo',3,1),2,null,'WINNER'),
  pg_temp.mid('thirtytwo',4,4),1,pg_temp.fid('c1')))$$,'22023','El destino está fuera de la rama compatible','cross-round unrelated branch rejected');
select lives_ok($$select pg_temp.save('eight',1,pg_temp.put(pg_temp.layout('eight'),pg_temp.mid('eight',4,1),2,pg_temp.fid('c2')))$$,'second participant assigned');
-- Fixture for a future sports RPC: same transaction-local gate, revision and
-- hierarchy protocol. This is not an exposed result writer in phase one.
select set_config('american_free.tournament_id',pg_temp.fid('eight')::text,true);
update public.matches set status='FINISHED',winner_id=pg_temp.fid('c1'),result_couple1='6',result_couple2='2' where id=pg_temp.mid('eight',4,1);
update public.matches set couple1_id=pg_temp.fid('c1'),tournament_couple_seed1_id=(select id from public.tournament_couple_seeds where tournament_id=pg_temp.fid('eight') and couple_id=pg_temp.fid('c1'))
  where id=pg_temp.mid('eight',5,1);
update public.american_free_brackets set revision=revision+1 where tournament_id=pg_temp.fid('eight');
select set_config('american_free.tournament_id','',true);
select lives_ok($$select pg_temp.save('eight',3,pg_temp.layout('eight'))$$,'legitimate winner may appear in successive rounds');
select throws_ok($$select pg_temp.save('eight',4,pg_temp.put(pg_temp.layout('eight'),pg_temp.mid('eight',4,1),1,null))$$,
  '22023','No se pueden reorganizar partidos con actividad deportiva','finished participants protected');
select throws_ok($$select pg_temp.save('eight',4,pg_temp.put(pg_temp.layout('eight'),pg_temp.mid('eight',5,1),1,pg_temp.fid('c3')))$$,
  '22023','Un avance deportivo no es una asignación manual','manual entry cannot replace winner');
select throws_ok($$update public.tournaments set format_config='{"version":2,"presetId":"AMERICAN_MULTI_ZONE_2"}' where id=pg_temp.fid('eight')$$,
  '22023','Para cambiar el formato primero tenés que revertir la llave','preset cannot bypass write guards');
select lives_ok($$insert into public.matches(tournament_id,type,round,couple1_id,couple2_id) values(pg_temp.fid('legacy'),'ELIMINATION','FINAL',null,null)$$,'legacy persistence remains available');
select lives_ok($$select pg_temp.save('eight',4,pg_temp.layout('eight'),'organizer')$$,'active organization member can manage');
select lives_ok($$select pg_temp.save('eight',5,pg_temp.layout('eight'),'admin')$$,'admin can manage');
select throws_ok($$insert into public.set_matches(match_id,set_number,couple1_games,couple2_games)
  values(pg_temp.mid('eight',4,2),1,6,2)$$,'42501','Americano libre requiere persistencia transaccional','legacy sets cannot bypass revision protocol');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid('owner')::text,true);
select set_config('american_free.tournament_id',pg_temp.fid('eight')::text,true);
select throws_ok($$update public.matches set couple1_id=null where id=pg_temp.mid('eight',4,1)$$,
  '42501','Americano libre requiere persistencia transaccional','spoofed local gate does not authorize browser writes');
reset role;
set local role anon;
select is((select count(*) from public.american_free_brackets),3::bigint,'public reads bracket metadata');
select throws_ok($$update public.american_free_brackets set revision=99$$,'42501',null,'public writes denied');
reset role;
select * from finish();
rollback;
