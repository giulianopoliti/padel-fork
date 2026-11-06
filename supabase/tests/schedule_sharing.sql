-- Local QA only; all fixtures roll back. Run the migration in an isolated DB first.
begin;
insert into auth.users(id,aud,role) select ('11000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'authenticated','authenticated' from generate_series(1,7) n;
insert into public.users(id,role) values
 ('11000000-0000-4000-8000-000000000001','CLUB'),
 ('11000000-0000-4000-8000-000000000002','CLUB'),
 ('11000000-0000-4000-8000-000000000003','ORGANIZADOR'),
 ('11000000-0000-4000-8000-000000000004','PLAYER'),
 ('11000000-0000-4000-8000-000000000005','PLAYER'),
 ('11000000-0000-4000-8000-000000000006','ADMIN'),
 ('11000000-0000-4000-8000-000000000007','CLUB');
insert into public.clubes(id,user_id,name) values
 ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Club A'),
 ('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002','Club B'),
 ('31000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000007','Club ajeno');
insert into public.organizaciones(id,name,slug) values
 ('31000000-0000-4000-8000-000000000011','Organización A','schedule-qa-a'),
 ('31000000-0000-4000-8000-000000000012','Organización B','schedule-qa-b');
insert into public.organization_members(organizacion_id,user_id,is_active) values
 ('31000000-0000-4000-8000-000000000011','11000000-0000-4000-8000-000000000003',true),
 ('31000000-0000-4000-8000-000000000012','11000000-0000-4000-8000-000000000003',false);
insert into public.tournaments(id,name,type,status,club_id,organization_id) values
 ('51000000-0000-4000-8000-000000000001','Torneo A','LONG','NOT_STARTED','31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000011'),
 ('51000000-0000-4000-8000-000000000002','Torneo B','LONG','NOT_STARTED','31000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000011'),
 ('51000000-0000-4000-8000-000000000003','Torneo ajeno','LONG','NOT_STARTED','31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000012');

create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end; $$;
create function pg_temp.assert_error(statement text, expected_code text, label text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected_code then raise notice 'PASS: %',label; return; end if;
    raise exception 'FAIL: %, expected %, got %: %',label,expected_code,sqlstate,sqlerrm;
  end;
  raise exception 'FAIL: % was accepted',label;
end; $$;
create function pg_temp.payload(operation_key uuid, targets uuid[]) returns jsonb language sql as $$
 select jsonb_build_object('operation_key',operation_key,'source_fecha_id',null,
  'metadata',jsonb_build_object('name','Fecha compartida','description',null,'start_date','2099-11-06','end_date','2099-11-08'),
  'slots',jsonb_build_array(jsonb_build_object('key','morning','date','2099-11-06','start_time','08:00','end_time','15:00','max_matches',4)),
  'destinations',(select jsonb_agg(jsonb_build_object('tournament_id',id,'fecha',jsonb_build_object('kind','create'),
    'round_type','ZONE','bracket_key','MAIN','estimated_match_duration_minutes',90,'max_matches_per_couple',null,'court_choice','preserve')) from unnest(targets) id));
$$;
create function pg_temp.fail_second_destination() returns trigger language plpgsql as $$
begin
  if new.description = 'ROLLBACK_TEST' and exists(select 1 from public.tournament_fechas f
    where f.id = new.fecha_id and f.tournament_id = '51000000-0000-4000-8000-000000000002') then
    raise exception 'Injected failure after first destination' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger schedule_qa_injected_failure before insert on public.tournament_time_slots
  for each row execute function pg_temp.fail_second_destination();

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
do $$declare p jsonb; review jsonb; result jsonb; replay jsonb; begin
 p := pg_temp.payload('91000000-0000-4000-8000-000000000001',array['51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002']::uuid[]);
 review := public.preview_schedule_batch(p);
 perform pg_temp.assert_true((review->'preview'->>'can_commit')::boolean,'preview without a source tournament');
 result := public.commit_schedule_batch(p,review->>'revision');
 perform set_config('schedule_qa.payload',p::text,true);
 perform set_config('schedule_qa.review',review::text,true);
 perform set_config('schedule_qa.result',result::text,true);
 perform pg_temp.assert_true(jsonb_array_length(result->'destinations')=2,'atomic two-club creation');
 replay := public.commit_schedule_batch(p,'lost-response-retry');
 perform pg_temp.assert_true(replay=result,'idempotent replay after a lost response');
 perform pg_temp.assert_true((select count(*)=2 from public.schedule_share_members),'no duplicate members');
 perform pg_temp.assert_true((select count(*)=2 from public.schedule_share_item_targets),'physical slots have stable logical links');
 perform pg_temp.assert_true((select count(*)=2 from public.tournament_time_slots where slot_type='FREE_DATE'),'FREE_DATE created independently per fecha');
 perform pg_temp.assert_true((select count(*)=1 from public.schedule_share_items),'FREE_DATE excluded from shared items');
 perform pg_temp.assert_true((select count(*)=1 from public.schedule_workspace_entries where kind='GROUP' and tournament_count=2 and slot_count=1 and distribution_state='COMPLETE'),'workspace groups copies once with content-based coverage');
 perform pg_temp.assert_true((select count(*)=0 from public.schedule_workspace_entries where kind='INDIVIDUAL'),'workspace omits fechas already represented by a group');
 perform pg_temp.assert_true((select bool_and(status::text='ZONE_PHASE') from public.tournaments where id in ('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002')),'ZONE_PHASE transition');
end$$;
select pg_temp.assert_error(format('select public.commit_schedule_batch(%L::jsonb,%L)',
  jsonb_set(current_setting('schedule_qa.payload')::jsonb,'{metadata,name}','"Otro nombre"'), 'ignored'), '22023','operation key rejects a different payload');
select pg_temp.assert_error(format('select public.commit_schedule_batch(%L::jsonb,%L)',
  jsonb_set(current_setting('schedule_qa.payload')::jsonb,'{operation_key}','"91000000-0000-4000-8000-000000000002"'),
  current_setting('schedule_qa.review')::jsonb->>'revision'), '40001','stale preview rejects concurrent duplicate creation');

do $$declare p jsonb; review jsonb; groups_before integer; begin
 p := pg_temp.payload('91000000-0000-4000-8000-000000000003',array['51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002']::uuid[]);
 p := jsonb_set(p,'{slots,0,description}','"ROLLBACK_TEST"');
 review := public.preview_schedule_batch(p);
 select count(*) into groups_before from public.schedule_share_groups;
 perform pg_temp.assert_error(format('select public.commit_schedule_batch(%L::jsonb,%L)',p,review->>'revision'),'23514','second-destination failure rolls back the transaction');
 perform pg_temp.assert_true((select count(*)=groups_before from public.schedule_share_groups),'rollback leaves no orphan group');
 perform pg_temp.assert_true((select count(*)=2 from public.schedule_share_members),'rollback leaves no intermediate fechas or links');
end$$;
select pg_temp.assert_error(format('select public.preview_schedule_batch(%L::jsonb)',
 pg_temp.payload('91000000-0000-4000-8000-000000000004',array['51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000003']::uuid[])),
 '42501','foreign destination denied even on direct RPC');
select pg_temp.assert_error('insert into public.schedule_share_members(group_id,applied_metadata) values(gen_random_uuid(),''{}'')','42501','direct link forgery denied');
select pg_temp.assert_error('select source_fecha_id from public.schedule_share_groups','42501','origin IDs cannot leak through direct group reads');

-- Losing one organization scope hides its members and prevents stale replay.
reset role;
update public.tournaments set organization_id='31000000-0000-4000-8000-000000000012' where id='51000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.schedule_share_members),'coverage only includes authorized destinations');
select pg_temp.assert_true((select tournament_count=1 and cardinality(tournament_ids)=1 from public.schedule_workspace_entries),'workspace counts do not expose a revoked destination');
select pg_temp.assert_error(format('select public.commit_schedule_batch(%L::jsonb,%L)',current_setting('schedule_qa.payload'),'retry'),'42501','replay rechecks current permissions');
reset role;
update public.tournaments set organization_id='31000000-0000-4000-8000-000000000011' where id='51000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=2 from public.schedule_share_members),'active organizer membership grants resource access');
select pg_temp.assert_error(format('select public.preview_schedule_batch(%L::jsonb)',
 pg_temp.payload('91000000-0000-4000-8000-000000000005',array['51000000-0000-4000-8000-000000000003']::uuid[])),
 '42501','inactive organizer membership rejected');
select pg_temp.assert_error('insert into public.tournament_fechas(tournament_id,fecha_number,name) values(''51000000-0000-4000-8000-000000000003'',1,''Bypass'')',
 '42501','inactive membership cannot bypass the app through legacy table writes');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
select pg_temp.assert_true((select count(*)=0 from public.schedule_share_groups),'players see no sharing metadata');
select pg_temp.assert_true((select count(*)=0 from public.schedule_share_members),'players see no other destinations');
select pg_temp.assert_true((select count(*)=0 from public.schedule_workspace_entries),'players cannot bypass workspace permissions through the view');
select pg_temp.assert_error(format('select public.preview_schedule_batch(%L::jsonb)',current_setting('schedule_qa.payload')),'42501','players cannot invoke management RPCs');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000006',true);
select pg_temp.assert_true((select count(*)=2 from public.schedule_share_members),'ADMIN scope includes all visible resources');
do $$declare changed integer; begin
 update public.tournament_fechas set description='ADMIN_WRITE' where tournament_id='51000000-0000-4000-8000-000000000001';
 get diagnostics changed=row_count;
 perform pg_temp.assert_true(changed=1,'ADMIN may update existing fechas through the legacy user-scoped client');
 update public.tournament_time_slots set description='ADMIN_WRITE' where slot_type='TIME_RANGE'
   and fecha_id in(select id from public.tournament_fechas where tournament_id='51000000-0000-4000-8000-000000000001');
 get diagnostics changed=row_count;
 perform pg_temp.assert_true(changed=1,'ADMIN may update existing ranges without bypass credentials');
 perform pg_temp.assert_true(exists(select 1 from public.schedule_workspace_entries
   where id=(current_setting('schedule_qa.result')::jsonb->>'group_id')::uuid and distribution_state='LOCAL_CHANGES'),'workspace detects legacy edits from content snapshots');
end$$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_error(format('select public.preview_schedule_batch(%L::jsonb)',current_setting('schedule_qa.payload')),'42501','anonymous RPC execution denied');

reset role;
insert into public.players(id,user_id) values
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000004'),
 ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000005');
insert into public.couples(id,player1_id,player2_id) values
 ('41000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002');
insert into public.tournament_fechas(id,tournament_id,fecha_number,name,start_date,end_date,estimated_match_duration_minutes) values
 ('61000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',7,'Manual','2099-11-06','2099-11-08',90);
insert into public.tournament_time_slots(id,fecha_id,date,start_time,end_time,max_matches) values
 ('71000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','2099-11-06','08:00','15:00',4);
insert into public.couple_time_availability(couple_id,time_slot_id,is_available,notes) values
 ('41000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',false,'Respuesta existente');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(exists(select 1 from public.schedule_workspace_entries where kind='INDIVIDUAL' and id='61000000-0000-4000-8000-000000000001'),'legacy manual fecha is visible independently');
do $$declare p jsonb; review jsonb; result jsonb; begin
 p := pg_temp.payload('91000000-0000-4000-8000-000000000006',array['51000000-0000-4000-8000-000000000001']::uuid[]);
 p := jsonb_set(p,'{destinations,0,fecha}','{"kind":"adopt","fecha_id":"61000000-0000-4000-8000-000000000001"}');
 review := public.preview_schedule_batch(p);
 perform pg_temp.assert_true((review->'preview'->>'physical_slots_to_reuse')::integer=1,'manual equivalent identified for adoption');
 result := public.commit_schedule_batch(p,review->>'revision');
 perform pg_temp.assert_true(result->'destinations'->0->>'fecha_id'='61000000-0000-4000-8000-000000000001','manual fecha identity preserved');
 perform pg_temp.assert_true(exists(select 1 from public.schedule_share_item_targets where slot_id='71000000-0000-4000-8000-000000000001'),'manual slot identity preserved');
 perform pg_temp.assert_true((select max(fecha_number)=7 from public.tournament_fechas where tournament_id='51000000-0000-4000-8000-000000000001'),'adoption does not renumber existing fechas');
end$$;
update public.tournament_time_slots set description='Texto corregido' where id='71000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select max_matches=4 from public.tournament_time_slots where id='71000000-0000-4000-8000-000000000001'),'text edit preserves capacity');
select pg_temp.assert_error('update public.tournament_time_slots set start_time=''09:00'' where id=''71000000-0000-4000-8000-000000000001''','23514','answered option cannot change physical meaning');
select pg_temp.assert_error('delete from public.tournament_time_slots where id=''71000000-0000-4000-8000-000000000001''','23514','answered option cannot be deleted');
select pg_temp.assert_error('delete from public.tournament_fechas where id=''61000000-0000-4000-8000-000000000001''','23514','deleting a fecha cannot bypass answer protections');
select pg_temp.assert_error('delete from public.tournament_time_slots where fecha_id=''61000000-0000-4000-8000-000000000001'' and slot_type=''FREE_DATE''','23514','system option cannot be deleted');
reset role;
select pg_temp.assert_true(exists(select 1 from public.couple_time_availability where time_slot_id='71000000-0000-4000-8000-000000000001' and not is_available and notes='Respuesta existente'),'adoption preserves every availability response');

-- Programming without a slot reference is protected by the concrete interval.
insert into public.tournament_fechas(id,tournament_id,fecha_number,name) values
 ('61000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001',10,'Sin período');
insert into public.tournament_time_slots(id,fecha_id,date,start_time,end_time,max_matches,court_name) values
 ('71000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','2099-11-07','08:00','15:00',4,'1');
insert into public.matches(id,tournament_id,couple1_id,couple2_id,round,type,status) values
 ('81000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',null,null,'ZONE','ZONE','PENDING');
insert into public.fecha_matches(fecha_id,match_id,scheduled_date,scheduled_start_time,scheduled_end_time,court_assignment) values
 ('61000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','2099-11-07','10:00','11:30','1');
set local role authenticated;
select pg_temp.assert_true(exists(select 1 from public.schedule_workspace_entries where kind='INDIVIDUAL' and start_date is null and end_date is null),'undated historical entries remain discoverable');
select pg_temp.assert_error('delete from public.tournament_time_slots where id=''71000000-0000-4000-8000-000000000002''','23514','concrete scheduled match blocks deletion without a slot reference');
select pg_temp.assert_error('update public.tournament_time_slots set max_matches=1 where id=''71000000-0000-4000-8000-000000000002''','23514','scheduled match blocks reducing capacity');
select pg_temp.assert_error('delete from public.tournament_fechas where id=''61000000-0000-4000-8000-000000000002''','23514','programmed fecha cannot be removed');

-- Explicit court remapping has its own snapshot; it is not a new common change.
do $$declare p jsonb; review jsonb; result jsonb; begin
 p := pg_temp.payload('91000000-0000-4000-8000-000000000007',array['51000000-0000-4000-8000-000000000001']::uuid[]);
 p := jsonb_set(p,'{slots,0,court_name}','"Cancha original"');
 p := jsonb_set(p,'{destinations,0,court_choice}','{"rename":{"morning":"Cancha local"}}');
 review := public.preview_schedule_batch(p);
 result := public.commit_schedule_batch(p,review->>'revision');
 perform pg_temp.assert_true(exists(select 1 from public.schedule_workspace_entries where id=(result->>'group_id')::uuid and distribution_state='COMPLETE'),'explicit local court choice is complete on initial distribution');
end$$;

do $$declare p jsonb; review jsonb; result jsonb; begin
 p := pg_temp.payload('91000000-0000-4000-8000-000000000008',array['51000000-0000-4000-8000-000000000001']::uuid[]);
 p := jsonb_set(p,'{slots}','[]');
 review := public.preview_schedule_batch(p);
 result := public.commit_schedule_batch(p,review->>'revision');
 perform pg_temp.assert_true(exists(select 1 from public.schedule_workspace_entries where id=(result->>'group_id')::uuid
   and slot_count=0 and tournament_count=1 and distribution_state='COMPLETE'),'date-only group is complete and remains expandable');
 perform set_config('schedule_qa.empty_group',result->>'group_id',true);
end$$;
reset role;
-- A tombstone remains visible to a manager for explicit recovery; it does not
-- become a pending item that an automatic completion could recreate.
delete from public.tournament_fechas where id=(select fecha_id from public.schedule_share_members where group_id=current_setting('schedule_qa.empty_group')::uuid);
set local role authenticated;
select pg_temp.assert_true(exists(select 1 from public.schedule_workspace_entries where id=current_setting('schedule_qa.empty_group')::uuid
  and tournament_count=0 and distribution_state='UNLINKED'),'deleted last copy preserves an authorized diagnosable group');
reset role;
insert into public.tournaments(id,name,type,status,club_id,format_config) values
 ('51000000-0000-4000-8000-000000000004','Oro y Plata','LONG','NOT_STARTED','31000000-0000-4000-8000-000000000001',
  '{"version":2,"presetId":"LONG_SINGLE_ZONE_GOLD_SILVER","baseType":"LONG","zoneMode":"SINGLE_ZONE","zoneStage":"FIXED_MATCH_COUNT","bracketMode":"GOLD_SILVER","advancementConfig":{"kind":"GOLD_SILVER","goldCount":4,"silverCount":4}}');
insert into public.matches(id,tournament_id,couple1_id,couple2_id,round,type,status,bracket_key) values
 ('81000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000004',null,null,'FINAL','ELIMINATION','DRAFT','GOLD'),
 ('81000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000004',null,null,'FINAL','ELIMINATION','DRAFT','MAIN');
set local role authenticated;
do $$declare p jsonb; review jsonb; begin
 p := pg_temp.payload('91000000-0000-4000-8000-000000000009',array['51000000-0000-4000-8000-000000000004']::uuid[]);
 p := jsonb_set(jsonb_set(p,'{destinations,0,round_type}','"FINAL"'),'{destinations,0,bracket_key}','"GOLD"');
 review := public.preview_schedule_batch(p);
 perform pg_temp.assert_true((review->'preview'->>'can_commit')::boolean,'management preview sees an active draft bracket round');
 p := jsonb_set(p,'{destinations,0,bracket_key}','"MAIN"');
 review := public.preview_schedule_batch(p);
 perform pg_temp.assert_true(not (review->'preview'->>'can_commit')::boolean,'gold/silver preset rejects MAIN even when a legacy MAIN match exists');
 p := jsonb_set(p,'{destinations,0,bracket_key}','"SILVER"');
 review := public.preview_schedule_batch(p);
 perform pg_temp.assert_true(not (review->'preview'->>'can_commit')::boolean,'a missing cup/round is not silently incorporated');
end$$;

select pg_temp.assert_true(public.schedule_available_rounds(array['51000000-0000-4000-8000-000000000004']::uuid[])
  @> '[{"round_type":"FINAL","bracket_key":"GOLD"}]'::jsonb,'selector exposes a compatible draft bracket round');
select pg_temp.assert_error('select public.schedule_available_rounds(array[''51000000-0000-4000-8000-000000000003'']::uuid[])',
  '42501','round selector does not expose foreign tournaments');

-- Add a tournament to the original group, detach it and restore the same fecha.
do $$declare p jsonb; review jsonb; result jsonb; gid uuid; fid uuid; mid uuid; sid uuid; member_revision timestamptz; begin
 gid := (current_setting('schedule_qa.result')::jsonb->>'group_id')::uuid;
 p := pg_temp.payload('91000000-0000-4000-8000-000000000010',array['51000000-0000-4000-8000-000000000004']::uuid[])
   || jsonb_build_object('group_id',gid);
 review := public.preview_schedule_batch(p);
 perform pg_temp.assert_true((review->'preview'->>'can_commit')::boolean,'an authorized tournament can be added to an existing group');
 result := public.commit_schedule_batch(p,review->>'revision');
 fid := (result->'destinations'->0->>'fecha_id')::uuid;
 select id,updated_at into strict mid,member_revision from public.schedule_share_members where group_id=gid and fecha_id=fid;
 select slot_id into strict sid from public.schedule_share_item_targets where member_id=mid;
 perform pg_temp.assert_true((result->>'group_id')::uuid=gid and (select count(*)=1 from public.schedule_share_items where group_id=gid),
   'extension keeps the original group and logical items');
 perform pg_temp.assert_error(format('select public.unlink_schedule_member(%L,%L,%L,%L)',gid,mid,fid,'epoch'),
   '40001','stale detach confirmation cannot unlink a current copy');
 perform public.unlink_schedule_member(gid,mid,fid,member_revision);
 perform public.unlink_schedule_member(gid,mid,fid,member_revision);
 perform pg_temp.assert_true(exists(select 1 from public.tournament_time_slots where id=sid and fecha_id=fid)
   and exists(select 1 from public.schedule_workspace_entries where id=fid and kind='INDIVIDUAL'), 'idempotent unlink preserves physical data and restores independent listing');
 p := jsonb_set(p,'{operation_key}','"91000000-0000-4000-8000-000000000011"');
 p := jsonb_set(p,'{destinations,0,fecha}',jsonb_build_object('kind','adopt','fecha_id',fid));
 review := public.preview_schedule_batch(p);
 result := public.commit_schedule_batch(p,review->>'revision');
 perform pg_temp.assert_true(exists(select 1 from public.schedule_share_members where id=mid and fecha_id=fid and status='active')
   and exists(select 1 from public.schedule_share_item_targets where member_id=mid and slot_id=sid and status='active'), 'explicit relinking restores the same physical and logical identities');
 perform set_config('schedule_qa.extension_member',mid::text,true);
 perform set_config('schedule_qa.extension_fecha',fid::text,true);
end$$;

reset role;
insert into public.schedule_share_items(group_id,item_key,content,version)
select (current_setting('schedule_qa.result')::jsonb->>'group_id')::uuid,'missing',
  '{"date":"2099-11-07","start_time":"09:00:00","end_time":"11:00:00","court_name":null,"max_matches":2,"description":null,"is_available":true}',1;
update public.tournament_fechas set name='Nombre local' where id=current_setting('schedule_qa.extension_fecha')::uuid;
set local role authenticated;
do $$declare p jsonb; review jsonb; result jsonb; gid uuid; fid uuid; mid uuid; begin
 gid := (current_setting('schedule_qa.result')::jsonb->>'group_id')::uuid;
 fid := current_setting('schedule_qa.extension_fecha')::uuid;
 mid := current_setting('schedule_qa.extension_member')::uuid;
 p := pg_temp.payload('91000000-0000-4000-8000-000000000012',array['51000000-0000-4000-8000-000000000004']::uuid[])
   || jsonb_build_object('group_id',gid,'complete_member_id',mid);
 p := jsonb_set(p,'{destinations,0,fecha}',jsonb_build_object('kind','adopt','fecha_id',fid));
 perform pg_temp.assert_error(format('select public.preview_schedule_batch(%L::jsonb)',p),'40001','completion cannot reapply an already linked item');
 p := jsonb_set(p,'{slots}',(select jsonb_build_array(content || jsonb_build_object('key',item_key)) from public.schedule_share_items
   where group_id=gid and item_key='missing'));
 review := public.preview_schedule_batch(p);
 result := public.commit_schedule_batch(p,review->>'revision');
 perform pg_temp.assert_true((result->'destinations'->0->>'new_slots')::integer=1
   and (select name='Nombre local' from public.tournament_fechas where id=fid)
   and (select count(*)=2 from public.schedule_share_item_targets where member_id=mid and status='active'),
   'completion adds only missing items and preserves the local fecha name');
end$$;
reset role;
insert into public.matches(id,tournament_id,couple1_id,couple2_id,round,type,status,bracket_key) values
 ('81000000-0000-4000-8000-000000000081','51000000-0000-4000-8000-000000000001',null,null,'8VOS','ELIMINATION','DRAFT','MAIN'),
 ('81000000-0000-4000-8000-000000000082','51000000-0000-4000-8000-000000000004',null,null,'4TOS','ELIMINATION','DRAFT','GOLD');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000006',true);
do $$declare p jsonb; review jsonb; result jsonb; actual jsonb; begin
 p := pg_temp.payload('91000000-0000-4000-8000-000000000081',
  array['51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000004']::uuid[]);
 p := jsonb_set(jsonb_set(jsonb_set(p,'{destinations,0,round_type}','"8VOS"'),'{destinations,1,round_type}','"4TOS"'),'{destinations,1,bracket_key}','"GOLD"');
 review := public.preview_schedule_batch(p);
 result := public.commit_schedule_batch(p,review->>'revision');
 select destinations into strict actual from public.schedule_workspace_entries where id=(result->>'group_id')::uuid;
 perform pg_temp.assert_true(actual @> '[{"round_type":"8VOS","bracket_key":"MAIN"}]'
   and actual @> '[{"round_type":"4TOS","bracket_key":"GOLD"}]'
   and not (actual @> '[{"round_type":"8VOS","bracket_key":"GOLD"}]'),
   'mixed-round batch persists and workspace filters only match a real round/cup pair');
end$$;
rollback;
