-- Fixed local runner only; no historical fixtures are modified.
begin;
set local search_path=public,extensions;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temporary table pair_fixture(key text primary key,id uuid default gen_random_uuid());
insert into pair_fixture(key) select unnest(array['a','b','c','d','manager','stranger','club',
  'plain','approval','proof','both','cash','full','legacy','closed','category','elite','general','newposts','newprofile','brokenTransfer','wrongTerms','paused','expired','fullRequest','soloProof']);
grant all on pair_fixture to service_role,authenticated;
create function pg_temp.fid(k text) returns uuid language sql stable as $$select id from pg_temp.pair_fixture where key=k$$;
insert into auth.users(id,email) select id,'pair-'||id||'@example.invalid' from pair_fixture where key in ('a','b','c','d','manager','stranger');
insert into public.users(id,email,role) select id,'pair-'||id||'@example.invalid',
  case when key='manager' then 'CLUB'::public."ROLE" else 'PLAYER'::public."ROLE" end
  from pair_fixture where key in ('a','b','c','d','manager','stranger');
insert into public.players(id,user_id,first_name,last_name,category_name,gender,score,is_categorized)
  select id,id,key,'Pair fixture','9na','MALE',111,true from pair_fixture where key in ('a','b','c','d');
insert into public.clubes(id,user_id,name) values(pg_temp.fid('club'),pg_temp.fid('manager'),'Pair fixture');
insert into public.tournaments(id,club_id,name,type,status,category_name,gender,max_participants,enable_public_inscriptions,
  validate_inscriptions,enable_transfer_proof,allow_cash_payment,transfer_alias,transfer_amount)
  select id,pg_temp.fid('club'),key,case when key in ('plain','both','legacy') then 'LONG'::public.tournament_type else 'AMERICAN'::public.tournament_type end,
    'NOT_STARTED','9na','MALE',case when key='full' then 0 else 2 end,true,
    key in ('approval','both'),key in ('proof','both','cash','brokenTransfer'),key='cash',case when key='brokenTransfer' then '' else 'test.alias' end,100
    from pair_fixture where key in ('plain','approval','proof','both','cash','full','legacy','closed','category','elite','newposts','newprofile','brokenTransfer','wrongTerms','paused','expired','fullRequest','soloProof');
create function pg_temp.make_request(k text, sender text default 'a', recipient text default 'b', terms text default 'solo-players-tournament-v1') returns uuid language plpgsql as $$
declare post_id uuid; request_id uuid;
begin
  perform set_config('request.jwt.claim.sub',pg_temp.fid(recipient)::text,true);
  select id into post_id from public.save_solo_player_post(pg_temp.fid(recipient),'9na','DRIVE','RIGHT','+5491123456789',false,
    'solo-players-contact-v1',pg_temp.fid(k),null,terms);
  perform set_config('request.jwt.claim.sub',pg_temp.fid(sender)::text,true);
  select id into request_id from public.send_solo_player_request(post_id,pg_temp.fid(sender),'+5491199999999','solo-players-contact-v1',terms);
  insert into pg_temp.pair_fixture(key,id) values(case when sender='c' then 'incompatible' else k||'_request' end,request_id);
  return request_id;
end $$;
create function pg_temp.confirm(k text, actor text default 'b', organizer boolean default false, tenant text default 'padel-fv', payment text default null, accepted boolean default true)
returns jsonb language sql as $$select public.confirm_tournament_pair(pg_temp.fid(k),pg_temp.fid('a'),pg_temp.fid('b'),pg_temp.fid(actor),tenant,
 case when organizer then null else pg_temp.fid(k||'_request') end,payment,accepted,false,organizer)$$;
select ok(not has_function_privilege('anon','public.confirm_tournament_pair(uuid,uuid,uuid,uuid,text,uuid,text,boolean,boolean,boolean)','EXECUTE'),'anonymous pair confirmation denied');
select ok(not has_function_privilege('authenticated','public.confirm_tournament_pair(uuid,uuid,uuid,uuid,text,uuid,text,boolean,boolean,boolean)','EXECUTE'),'actor and tenant cannot be forged by clients');
select ok(has_function_privilege('service_role','public.confirm_tournament_pair(uuid,uuid,uuid,uuid,text,uuid,text,boolean,boolean,boolean)','EXECUTE'),'server boundary has explicit grant');
select pg_temp.make_request(k) from unnest(array['plain','approval','proof','both','cash','closed','category','wrongTerms','paused','expired','fullRequest']) k;
select pg_temp.make_request('elite','a','b','2026-08-28');
select set_config('request.jwt.claim.sub',pg_temp.fid('a')::text,true);
insert into pair_fixture(key,id) select 'general_post',id from public.save_solo_player_post(pg_temp.fid('a'),'9na','DRIVE','RIGHT',
  '+5491123456789',false,'solo-players-contact-v1',null,'1_WEEK');
insert into public.inscriptions(tournament_id,player_id) values(pg_temp.fid('plain'),pg_temp.fid('a')),(pg_temp.fid('plain'),pg_temp.fid('a')),
  (pg_temp.fid('legacy'),pg_temp.fid('a')),(pg_temp.fid('legacy'),pg_temp.fid('b')),(pg_temp.fid('full'),pg_temp.fid('a'));
-- Incompatible request targets a separate publication so its status is invalidated, not silently expired.
select pg_temp.make_request('plain','c','a');
set local role service_role;
select throws_ok($$select pg_temp.confirm('plain','stranger')$$,'42501',null,'only recipient can accept tournament request');
select throws_ok($$select pg_temp.confirm('legacy','stranger',true)$$,'42501',null,'organizer mode verifies actual tournament management');
select lives_ok($$select pg_temp.confirm('plain')$$,'accepted request creates pair atomically');
select is((select count(*) from public.inscriptions where tournament_id=pg_temp.fid('plain')),1::bigint,'duplicate historical individuals consumed in transaction');
select is((select count(*) from public.inscriptions where tournament_id=pg_temp.fid('plain') and not is_pending),1::bigint,'without requirements pair is confirmed');
select is((select status from public.solo_player_requests where id=pg_temp.fid('plain_request')),'ACCEPTED','request accepted with inscription');
select is((select status from public.solo_player_requests where id=pg_temp.fid('incompatible')),'INVALIDATED','incompatible request invalidated');
select is((select status from public.solo_player_posts where id=pg_temp.fid('general_post')),'ACTIVE','general availability remains active');
select is((select count(*) from public.solo_player_posts where tournament_id=pg_temp.fid('plain') and status='MATCHED'),2::bigint,'only matching tournament posts closed');
select is(pg_temp.confirm('plain')->>'created','false','double acceptance returns committed result');
select is((select count(*) from public.inscriptions where tournament_id=pg_temp.fid('plain')),1::bigint,'retry never duplicates inscription');
select lives_ok($$select pg_temp.confirm('approval')$$,'approval-only pair saved');
select is((select is_pending from public.inscriptions where tournament_id=pg_temp.fid('approval')),true,'accepting companion does not bypass approval');
select lives_ok($$select pg_temp.confirm('proof')$$,'proof-only pair reserves capacity');
select is((select payment_method from public.inscriptions where tournament_id=pg_temp.fid('proof')),'TRANSFER','transfer inferred from tournament');
select is((select payment_proof_path from public.inscriptions where tournament_id=pg_temp.fid('proof')),null::text,'pair remains saved without a proof');
select lives_ok($$select pg_temp.confirm('both')$$,'pair with both requirements saved');
select is((select is_pending from public.inscriptions where tournament_id=pg_temp.fid('both')),true,'approval still outstanding when transfer required');
select lives_ok($$select pg_temp.confirm('cash','b',false,'padel-fv','CASH')$$,'permitted cash accepted');
select is((select payment_method from public.inscriptions where tournament_id=pg_temp.fid('cash')),'CASH','cash has no transfer requirement');
select throws_ok($$select pg_temp.confirm('full','manager',true)$$,'P0001','Cupos llenos. Modificá el límite de inscriptos para emparejarlos','organizer must increase capacity');
select is((select count(*) from public.inscriptions where tournament_id=pg_temp.fid('full') and couple_id is null),1::bigint,'capacity failure preserves individuals');
select lives_ok($$select pg_temp.confirm('legacy','manager',true)$$,'organizer can pair legacy individuals without requests');
select is((select paired_by_user_id from public.inscriptions where tournament_id=pg_temp.fid('legacy')),pg_temp.fid('manager'),'pairing actor recorded');
select is((select pairing_source from public.inscriptions where tournament_id=pg_temp.fid('legacy')),'ORGANIZER','pairing source recorded');
select is(pg_temp.confirm('legacy','manager',true)->>'created','false','organizer double click returns same inscription');
select is(public.confirm_tournament_pair(pg_temp.fid('legacy'),pg_temp.fid('b'),pg_temp.fid('a'),pg_temp.fid('manager'),'padel-fv',null,null,false,false,true)->>'created','false','same pair is recognized in reversed order');
select throws_ok($$select public.confirm_tournament_pair(pg_temp.fid('legacy'),pg_temp.fid('a'),pg_temp.fid('c'),pg_temp.fid('manager'),'padel-fv',null,null,false,false,true)$$,'23505','Uno de los jugadores ya está inscrito en una pareja','first player already paired blocks registration with a free player');
select throws_ok($$select public.confirm_tournament_pair(pg_temp.fid('legacy'),pg_temp.fid('c'),pg_temp.fid('b'),pg_temp.fid('manager'),'padel-fv',null,null,false,false,true)$$,'23505','Uno de los jugadores ya está inscrito en una pareja','second player already paired also blocks registration');
select is((select count(*) from public.inscriptions where tournament_id=pg_temp.fid('legacy')),1::bigint,'duplicates and conflicts never create another inscription');
reset role;
update public.tournaments set status='BRACKET_PHASE' where id=pg_temp.fid('closed');
update public.tournaments set category_config='{"mode":"SINGLE","category":"8va","validationEnabled":true}' where id=pg_temp.fid('category');
set local role service_role;
select throws_ok($$select pg_temp.confirm('closed')$$,'P0001',null,'closed tournament cannot be accepted');
select throws_ok($$select pg_temp.confirm('category')$$,'P0001',null,'competitive category validated again on acceptance');
select is((select status from public.solo_player_requests where id=pg_temp.fid('category_request')),'PENDING','failed acceptance leaves request and reservation unchanged');
select throws_ok($$select pg_temp.confirm('elite','b',false,'padel-elite',null,false)$$,'P0001',null,'TPE requires explicit current terms');
select lives_ok($$select pg_temp.confirm('elite','b',false,'padel-elite')$$,'TPE current terms accepted');
select is((select count(*) from public.tpe_terms_acceptances where tournament_id=pg_temp.fid('elite')),2::bigint,'TPE terms recorded for both participants in transaction');
select throws_ok($$select pg_temp.confirm('wrongTerms','b',false,'padel-elite')$$,'P0001',null,'stored TPE terms must match the current version');
select lives_ok($$select pg_temp.confirm('newposts','manager',true)$$,'organizer can pair new players without a prior request or historical inscription');
reset role;
insert into public.tpe_registration_blocks(player_id,blocked_by_user_id) values(pg_temp.fid('a'),pg_temp.fid('manager'));
set local role service_role;
select throws_ok($$select pg_temp.confirm('newprofile','manager',true,'padel-elite')$$,'P0001',null,'organizer must explicitly authorize TPE block override');
select is((select count(*) from public.inscriptions where tournament_id=pg_temp.fid('newprofile')),0::bigint,'restricted pair has no partial inscription');
reset role;
update public.tpe_registration_blocks set unblocked_at=now(),unblocked_by_user_id=pg_temp.fid('manager') where player_id=pg_temp.fid('a');
update public.solo_player_posts set status='PAUSED' where tournament_id=pg_temp.fid('paused');
update public.solo_player_requests set expires_at=now()-interval '1 minute' where tournament_id=pg_temp.fid('expired');
update public.tournaments set max_participants=0 where id=pg_temp.fid('fullRequest');
set local role service_role;
select throws_ok($$select pg_temp.confirm('paused')$$,'P0001',null,'paused post cannot be accepted');
select throws_ok($$select pg_temp.confirm('expired')$$,'P0001',null,'expired request cannot be accepted');
select throws_ok($$select pg_temp.confirm('fullRequest')$$,'P0001','Cupos llenos','player gets the agreed capacity error');
select throws_ok($$update public.tournaments set status='ZONE_PHASE' where id=pg_temp.fid('proof')$$,'P0001',null,'incomplete couple still blocks tournament operations');
reset role;
insert into public.inscriptions(tournament_id,player_id,payment_method) values(pg_temp.fid('soloProof'),pg_temp.fid('a'),'TRANSFER');
select lives_ok($$update public.tournaments set status='ZONE_PHASE' where id=pg_temp.fid('soloProof')$$,'historical solo missing proof cannot block tournament start');
update public.players set is_categorized=false,score=null,category_name=null where id=pg_temp.fid('a');
set local role service_role;
select throws_ok($$select pg_temp.confirm('brokenTransfer','manager',true)$$,'P0001',null,'failed inscription insert rolls back profile initialization too');
select is((select score from public.players where id=pg_temp.fid('a')),null::numeric,'failed confirmation never partially categorizes');
select lives_ok($$select pg_temp.confirm('newprofile','manager',true)$$,'initial category is assigned at confirmation');
select is((select score from public.players where id=pg_temp.fid('a')),(select lower_range::numeric from public.categories where name='9na'),'new profile uses existing category initialization rule');
select is((select score from public.players where id=pg_temp.fid('b')),111::numeric,'existing categorized profile is preserved');
delete from public.inscriptions where tournament_id=pg_temp.fid('plain');
select is((select status from public.solo_player_posts where tournament_id=pg_temp.fid('plain') and player_id=pg_temp.fid('b')),'MATCHED','cancellation never republishes automatically');
select is((select inscription_id from public.solo_player_requests where id=pg_temp.fid('plain_request')),null::uuid,'cancellation keeps accepted request history');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid('a')::text,true);
select throws_ok($$update public.inscriptions set paired_by_user_id=pg_temp.fid('stranger') where tournament_id=pg_temp.fid('legacy')$$,
  '42501',null,'clients cannot rewrite pairing actor');
select throws_ok($$insert into public.inscriptions(tournament_id,couple_id,pairing_source,paired_by_user_id)
  select pg_temp.fid('paused'),couple_id,'ORGANIZER',pg_temp.fid('manager') from public.inscriptions where tournament_id=pg_temp.fid('legacy')$$,
  '42501',null,'client insertion cannot forge organizer origin or attribution');
reset role;
select * from finish();
rollback;
