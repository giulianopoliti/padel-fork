-- Fixed local test runner wraps these fixtures in a rollback.
begin;
-- Ignore pre-existing local email jobs only inside this rolled-back test.
update public.solo_player_notifications set email_next_attempt_at=now()+interval '1 day';
set local search_path=public,extensions;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temporary table solo4_ids(key text primary key,id uuid not null);
grant all on solo4_ids to authenticated,service_role;
insert into solo4_ids select key,gen_random_uuid() from unnest(array['a','b','manager','club','american','claim1','claim2']) key;
create function pg_temp.sid(key text) returns uuid language sql stable as $$select id from pg_temp.solo4_ids where solo4_ids.key=$1$$;
insert into auth.users(id,email) select id,'solo4-'||key||'@example.invalid' from solo4_ids where key in ('a','b','manager');
insert into public.users(id,email,role) select id,'solo4-'||key||'@example.invalid',case when key='manager' then 'CLUB'::public."ROLE" else 'PLAYER'::public."ROLE" end from solo4_ids where key in ('a','b','manager');
insert into public.players(id,user_id,first_name,category_name) select id,id,key,'9na' from solo4_ids where key in ('a','b');
insert into public.clubes(id,user_id,name) values(pg_temp.sid('club'),pg_temp.sid('manager'),'Phase four fixture');
insert into public.tournaments(id,club_id,name,type,status,category_name,enable_public_inscriptions,max_participants)
  values(pg_temp.sid('american'),pg_temp.sid('club'),'Phase four AMERICAN','AMERICAN','NOT_STARTED','9na',true,16);

select ok(not has_table_privilege('authenticated','solo_player_private.email_deliveries','SELECT'),'client cannot read frozen email payloads');
select ok(not has_table_privilege('service_role','solo_player_private.email_deliveries','SELECT'),'worker uses narrow RPC instead of direct payload reads');
select ok(not has_function_privilege('authenticated','public.claim_solo_player_emails(uuid,integer)','EXECUTE'),'client cannot claim deliveries');
select ok(not has_function_privilege('anon','public.finish_solo_player_email(uuid,uuid,boolean,text)','EXECUTE'),'anon cannot forge delivery');
select ok(not has_function_privilege('authenticated','public.expire_solo_player_scope(uuid)','EXECUTE'),'client cannot run sweep');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.sid('b')::text,true);
insert into solo4_ids values('post',(select id from public.save_solo_player_post(pg_temp.sid('b'),'9na','DRIVE','RIGHT','+5491123456789',false,'solo-players-contact-v1',null,'1_DAY')));
select set_config('request.jwt.claim.sub',pg_temp.sid('a')::text,true);
insert into solo4_ids values('request',(select id from public.send_solo_player_request(pg_temp.sid('post'),pg_temp.sid('a'),'+5491199999999','solo-players-contact-v1')));
select is((select count(*) from public.solo_player_notifications where request_id=pg_temp.sid('request')),1::bigint,'sender inbox records send');
select throws_ok($$select * from public.claim_solo_player_emails(pg_temp.sid('claim1'),1)$$,'42501',null,'authenticated worker RPC denied');
reset role;
select is((select count(*) from public.solo_player_notifications where request_id=pg_temp.sid('request')),2::bigint,'general event reaches both players, no invented manager');
-- Isolate deliveries under test from any pre-existing local pending events.
update public.solo_player_notifications set email_next_attempt_at=now()+interval '1 day' where request_id<>pg_temp.sid('request');
set local role service_role;
insert into solo4_ids values('notification',(select id from public.claim_solo_player_emails(pg_temp.sid('claim1'),1)));
select is((select count(*) from public.claim_solo_player_emails(pg_temp.sid('claim2'),20)),1::bigint,'second worker only claims the other notification');
select is((select count(*) from public.claim_solo_player_emails(pg_temp.sid('claim2'),20)),0::bigint,'unexpired leases cannot be claimed again');
select is((select email_attempts from public.solo_player_notifications where id=pg_temp.sid('notification')),1,'claim increments attempts');
select ok(not public.finish_solo_player_email(pg_temp.sid('notification'),pg_temp.sid('claim2'),true),'stale worker cannot acknowledge another lease');
select throws_ok($$select public.prepare_solo_player_email(pg_temp.sid('notification'),pg_temp.sid('claim2'),'padel-fv','{"subject":"wrong","html":"wrong"}')$$,'42501',null,'stale worker cannot prepare delivery');
select is(public.prepare_solo_player_email(pg_temp.sid('notification'),pg_temp.sid('claim1'),'padel-fv','{"to":"attacker@example.invalid","subject":"First","html":"<p>First</p>","text":"First"}')->>'to',
  (select 'solo4-'||key||'@example.invalid' from solo4_ids where id=(select recipient_user_id from public.solo_player_notifications where id=pg_temp.sid('notification'))),'address comes from auth identity, not payload');
select is(public.prepare_solo_player_email(pg_temp.sid('notification'),pg_temp.sid('claim1'),'padel-fv','{"subject":"Changed","html":"Changed"}')->>'subject','First','retry reuses identical frozen payload');
select throws_ok($$select public.prepare_solo_player_email(pg_temp.sid('notification'),pg_temp.sid('claim1'),'padel-elite','{"subject":"Wrong tenant","html":"Wrong"}')$$,'22023',null,'delivery tenant cannot change on retry');
select ok(public.finish_solo_player_email(pg_temp.sid('notification'),pg_temp.sid('claim1'),false,'DELIVERY_FAILED'),'delivery failure acknowledged');
select is((select email_status from public.solo_player_notifications where id=pg_temp.sid('notification')),'FAILED','failed email remains queued');
select ok((select email_next_attempt_at>now() from public.solo_player_notifications where id=pg_temp.sid('notification')),'failure has retry backoff');
select is((select status from public.solo_player_requests where id=pg_temp.sid('request')),'PENDING','delivery failure never loses or rejects request');
reset role;
update public.solo_player_notifications set email_next_attempt_at=now()-interval '1 second' where id=pg_temp.sid('notification');
set local role service_role;
select is((select count(*) from public.claim_solo_player_emails(pg_temp.sid('claim2'),1)),1::bigint,'due failure is reclaimed');
select ok(not public.finish_solo_player_email(pg_temp.sid('notification'),pg_temp.sid('claim1'),true),'old lease cannot complete a reclaimed event');
select ok(public.finish_solo_player_email(pg_temp.sid('notification'),pg_temp.sid('claim2'),true),'current worker can mark sent');
select ok((select email_sent_at is not null from public.solo_player_notifications where id=pg_temp.sid('notification')),'sent timestamp persisted');
reset role;
-- Reclaim a crashed PROCESSING worker rather than losing its event forever.
update public.solo_player_notifications set email_next_attempt_at=now()-interval '1 second' where request_id=pg_temp.sid('request') and email_status='PROCESSING';
set local role service_role;
select is((select count(*) from public.claim_solo_player_emails(pg_temp.sid('claim1'),20)),1::bigint,'expired PROCESSING lease is recovered');
reset role;
-- Expiry sweep only updates social state, creates both notices, and never registrations.
update public.solo_player_posts set created_at=now()-interval '2 days',expires_at=now()-interval '1 second' where id=pg_temp.sid('post');
set local role service_role;
select ok(exists(select 1 from public.get_solo_player_expiry_scopes() where tournament_id is null),'general expired scope discovered');
select public.expire_solo_player_scope(null);
select is((select status from public.solo_player_requests where id=pg_temp.sid('request')),'EXPIRED','sweep materializes request expiry');
select is((select count(*) from public.solo_player_notifications where request_id=pg_temp.sid('request') and event_type='REQUEST_EXPIRED'),2::bigint,'expiry persists notifications for both players');
select public.expire_solo_player_scope(null);
select is((select count(*) from public.solo_player_notifications where request_id=pg_temp.sid('request') and event_type='REQUEST_EXPIRED'),2::bigint,'repeat sweep deduplicates events');
reset role;
select is((select count(*) from public.inscriptions where tournament_id=pg_temp.sid('american')),0::bigint,'social sweep never creates or deletes registrations');
select * from finish();
rollback;
