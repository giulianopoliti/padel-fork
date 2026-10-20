-- Local only: run after the phase-one migration. All fixtures roll back.
begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select no_plan();

create temporary table solo_fixture (key text primary key, id uuid not null);
grant select, insert, update on solo_fixture to authenticated;
insert into solo_fixture select key, gen_random_uuid() from unnest(array['owner','sender','stranger','manager','legacy','american','long','old_tournament','club']) as key;
create function pg_temp.fid(p_key text) returns uuid language sql stable as $$ select id from pg_temp.solo_fixture where key = p_key $$;
insert into auth.users(id, email) select id, 'solo-test-' || key || '@example.invalid' from solo_fixture where key in ('owner','sender','stranger','manager');
insert into public.users(id, email, role) select id, 'solo-test-' || key || '@example.invalid',
  case when key = 'manager' then 'CLUB'::public."ROLE" else 'PLAYER'::public."ROLE" end
  from solo_fixture where key in ('owner','sender','stranger','manager');
insert into public.players(id, user_id, first_name, last_name, category_name, score)
  select id, case when key <> 'legacy' then id end, key, 'Fixture', '9na', 111
  from solo_fixture where key in ('owner','sender','stranger','legacy');
insert into public.clubes(id, user_id, name) values (pg_temp.fid('club'),pg_temp.fid('manager'),'Solo test club');
insert into public.tournaments(id, club_id, type, status, category_name, name, max_participants, enable_public_inscriptions)
  values (pg_temp.fid('american'),pg_temp.fid('club'),'AMERICAN','NOT_STARTED','9na','Solo American',16,true),
    (pg_temp.fid('long'),pg_temp.fid('club'),'LONG','ZONE_PHASE','9na','Solo Long',16,true);
insert into public.tournaments(id, club_id, type, status, category_name, name, created_at, bracket_status)
  values(pg_temp.fid('old_tournament'),pg_temp.fid('club'),'AMERICAN','NOT_STARTED','9na','Legacy null bracket','2025-01-01',null);
insert into public.inscriptions(player_id,tournament_id,couple_id) values
  (pg_temp.fid('legacy'),pg_temp.fid('american'),null),(pg_temp.fid('legacy'),pg_temp.fid('american'),null);

select ok(not has_table_privilege('anon','public.solo_player_posts','SELECT'), 'anon has no publications grant');
select ok(not has_table_privilege('authenticated','solo_player_private.post_contacts','SELECT'), 'authenticated has no private publication contact grant');
select ok(not has_table_privilege('authenticated','solo_player_private.request_contacts','SELECT'), 'authenticated has no private request contact grant');
select ok(not has_table_privilege('service_role','solo_player_private.post_contacts','SELECT'), 'service role has no private publication contact grant');
select ok(not has_function_privilege('anon','public.get_solo_player_contact(uuid,uuid)','EXECUTE'), 'anon cannot execute contact RPC');
select ok(not has_function_privilege('authenticated','solo_player_private.expire_scope(uuid,uuid)','EXECUTE'), 'client cannot invoke internal expiry worker');
select hasnt_column('public','solo_player_posts','phone','publications contain no phone');
select hasnt_column('public','solo_player_requests','phone','requests contain no phone');

set local role anon;
select throws_ok($$select * from public.solo_player_posts$$, '42501', null, 'anon direct posts denied');
select throws_ok($$select * from public.get_solo_player_contact()$$, '42501', null, 'anon RPC denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid('owner')::text,true);
select throws_ok($$select public.save_solo_player_post(pg_temp.fid('sender'),'9na','DRIVE','RIGHT','+5491123456789',false,'solo-players-contact-v1',null,'1_DAY')$$,
  '42501', null, 'cannot publish for another profile');
select throws_ok($$select public.save_solo_player_post(pg_temp.fid('owner'),'9na','DRIVE','RIGHT','+5491123456789',false,'wrong',null,'1_DAY')$$,
  '22023', null, 'explicit contact consent required');
select throws_ok($$select public.save_solo_player_post(pg_temp.fid('owner'),'9na','DRIVE','RIGHT','invalid',false,'solo-players-contact-v1',null,'1_DAY')$$,
  '22023', null, 'valid international contact required even when hidden');
select throws_ok($$select public.save_solo_player_post(pg_temp.fid('owner'),'9na','DRIVE','RIGHT','+5491123456789',false,'solo-players-contact-v1',null,'3_DAYS')$$,
  '22023', null, 'general duration constrained');
select throws_ok($$select public.save_solo_player_post(pg_temp.fid('owner'),'9na','DRIVE','RIGHT','+5491123456789',false,'solo-players-contact-v1',pg_temp.fid('american'))$$,
  '22023', null, 'tournament terms required');
insert into solo_fixture values ('owner_post',(select id from public.save_solo_player_post(pg_temp.fid('owner'),'9na','DRIVE','RIGHT','+5491123456789',false,'solo-players-contact-v1',null,'1_WEEK')));
select is((select status from public.solo_player_posts where id = pg_temp.fid('owner_post')),'ACTIVE','owner publication created');
select ok((select expires_at = now() + interval '1 week' from public.solo_player_posts where id = pg_temp.fid('owner_post')),'chosen general duration persisted');
select is((select phone from public.players where id = pg_temp.fid('owner')),null::text,'publishing never writes profile phone');
select is((select score from public.players where id = pg_temp.fid('owner')),111::numeric,'publishing never changes ranking');
select throws_ok($$select public.save_solo_player_post(pg_temp.fid('owner'),'9na','DRIVE','RIGHT','+5491123456789',false,'solo-players-contact-v1',null,'1_DAY')$$,
  '23505', null, 'duplicate open general publication blocked');
insert into solo_fixture values ('american_post',(select id from public.save_solo_player_post(pg_temp.fid('owner'),'9na','REVES','LEFT','+5491123456789',false,'solo-players-contact-v1',pg_temp.fid('american'),null,'solo-players-tournament-v1')));
insert into solo_fixture values ('long_post',(select id from public.save_solo_player_post(pg_temp.fid('owner'),'9na','REVES','LEFT','+5491123456789',false,'solo-players-contact-v1',pg_temp.fid('long'),null,'solo-players-tournament-v1')));
select is((select count(*) from public.solo_player_posts where owner_user_id = pg_temp.fid('owner')),3::bigint,'general and tournament interests coexist');
select is((select tournament_id from public.save_solo_player_post(pg_temp.fid('owner'),'9na','DRIVE','RIGHT','+5491123456789',false,'solo-players-contact-v1',pg_temp.fid('old_tournament'),null,'solo-players-tournament-v1')),pg_temp.fid('old_tournament'),'legacy tournament with null bracket status admits interests');
select is((select count(*) from public.get_solo_player_contact(pg_temp.fid('owner_post'))),1::bigint,'owner can read own hidden contact');
select throws_ok($$update public.solo_player_posts set owner_user_id=pg_temp.fid('sender') where id=pg_temp.fid('owner_post')$$,
  '42501',null,'even owner cannot mutate raw publication columns');
select throws_ok($$select * from solo_player_private.post_contacts$$,'42501',null,'direct private contact read denied');
select throws_ok($$select public.send_solo_player_request(pg_temp.fid('owner_post'),pg_temp.fid('owner'),'+5491199999999','solo-players-contact-v1')$$,
  '22023',null,'self request denied');

select set_config('request.jwt.claim.sub',pg_temp.fid('sender')::text,true);
select is((select count(*) from public.solo_player_directory where id=pg_temp.fid('owner_post')),1::bigint,'authenticated directory exposes opt-in publication');
select is((select count(*) from public.get_solo_player_contact(pg_temp.fid('owner_post'))),0::bigint,'hidden publication contact absent from RPC response');
insert into solo_fixture values ('sender_post',(select id from public.save_solo_player_post(pg_temp.fid('sender'),'9na','REVES','LEFT','+5491199999999',false,'solo-players-contact-v1',null,'1_DAY')));
insert into solo_fixture values ('general_request',(select id from public.send_solo_player_request(pg_temp.fid('owner_post'),pg_temp.fid('sender'),'+5491199999999','solo-players-contact-v1')));
select is((select expires_at from public.solo_player_requests where id=pg_temp.fid('general_request')),null::timestamptz,'general request has no independent deadline');
select is((select count(*) from public.get_solo_player_contact(null,pg_temp.fid('general_request'))),0::bigint,'pending request shares no contacts');
select throws_ok($$select public.send_solo_player_request(pg_temp.fid('owner_post'),pg_temp.fid('sender'),'+5491199999999','solo-players-contact-v1')$$,
  '23505',null,'repeated pending request denied');
select throws_ok($$select public.resolve_solo_player_request(pg_temp.fid('general_request'),'ACCEPT')$$,'42501',null,'sender cannot accept');
reset role;
update public.tournaments set max_participants=0 where id=pg_temp.fid('american');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid('sender')::text,true);
select is((select is_actionable from public.solo_player_directory where id=pg_temp.fid('american_post')),false,'full tournament remains visible with actions disabled');
select throws_ok($$select public.send_solo_player_request(pg_temp.fid('american_post'),pg_temp.fid('sender'),'+5491199999999','solo-players-contact-v1','solo-players-tournament-v1')$$,
  'P0001',null,'full tournament does not offer a new request');
reset role;
update public.tournaments set max_participants=16 where id=pg_temp.fid('american');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid('sender')::text,true);
insert into solo_fixture values ('american_request',(select id from public.send_solo_player_request(pg_temp.fid('american_post'),pg_temp.fid('sender'),'+5491199999999','solo-players-contact-v1','solo-players-tournament-v1')));
insert into solo_fixture values ('long_request',(select id from public.send_solo_player_request(pg_temp.fid('long_post'),pg_temp.fid('sender'),'+5491199999999','solo-players-contact-v1','solo-players-tournament-v1')));
select ok((select expires_at = created_at + interval '24 hours' from public.solo_player_requests where id=pg_temp.fid('american_request')),'American request expires 24h after sending');
select is((select expires_at from public.solo_player_requests where id=pg_temp.fid('long_request')),null::timestamptz,'Long has no arbitrary time deadline');

select set_config('request.jwt.claim.sub',pg_temp.fid('stranger')::text,true);
select is((select count(*) from public.solo_player_requests where id=pg_temp.fid('general_request')),0::bigint,'unrelated user cannot read request directly');
select is((select count(*) from public.solo_player_notifications where request_id=pg_temp.fid('general_request')),0::bigint,'unrelated user cannot read notifications');
select is((select count(*) from public.get_solo_player_contact(null,pg_temp.fid('general_request'))),0::bigint,'unrelated user receives no request contacts');
select throws_ok($$select public.resolve_solo_player_request(pg_temp.fid('general_request'),'REJECT')$$,'42501',null,'unrelated user cannot resolve');
select throws_ok($$select public.set_solo_player_post_status(pg_temp.fid('owner_post'),'WITHDRAWN')$$,'42501',null,'unrelated user cannot withdraw publication');
select throws_ok($$insert into public.solo_player_requests(post_id,sender_user_id,recipient_user_id,sender_player_id,recipient_player_id,contact_consent_version)
  values(pg_temp.fid('owner_post'),pg_temp.fid('stranger'),pg_temp.fid('owner'),pg_temp.fid('stranger'),pg_temp.fid('owner'),'solo-players-contact-v1')$$,
  '42501',null,'direct request forgery denied');

select set_config('request.jwt.claim.sub',pg_temp.fid('manager')::text,true);
select is((select count(*) from public.solo_player_requests where id=pg_temp.fid('american_request')),1::bigint,'club manager reads tournament request');
select is((select count(*) from public.solo_player_requests where id=pg_temp.fid('general_request')),0::bigint,'club manager has no general request privilege');
select is((select count(*) from public.solo_player_notifications where request_id=pg_temp.fid('general_request')),0::bigint,'general requests invent no organizer recipient');
select is((select count(*) from public.get_solo_player_contact(pg_temp.fid('american_post'))),0::bigint,'manager cannot bypass hidden phone consent');
select is((select cardinality(inscription_ids) from public.get_legacy_solo_players(pg_temp.fid('american'))),2,'historical duplicate IDs are grouped without duplication');
select is((select user_id from public.get_legacy_solo_players(pg_temp.fid('american'))),null::uuid,'unlinked historical player stays available to organizer');
select throws_ok($$select public.resolve_solo_player_request(pg_temp.fid('american_request'),'ACCEPT')$$,'42501',null,'organizer cannot impersonate recipient acceptance');

select set_config('request.jwt.claim.sub',pg_temp.fid('owner')::text,true);
select throws_ok($$select public.send_solo_player_request(pg_temp.fid('sender_post'),pg_temp.fid('owner'),'+5491123456789','solo-players-contact-v1')$$,
  '23505',null,'inverse general pending request denied');
select is((select id from public.save_solo_player_post(pg_temp.fid('owner'),'9na','DRIVE','RIGHT','+5491188888888',false,'solo-players-contact-v1',null,'2_WEEKS',null,pg_temp.fid('owner_post'))),pg_temp.fid('owner_post'),'owner can update consented contact');
select is((select status from public.resolve_solo_player_request(pg_temp.fid('general_request'),'ACCEPT')),'ACCEPTED','recipient accepts general contact request');
select is((select count(*) from public.get_solo_player_contact(null,pg_temp.fid('general_request'))),2::bigint,'accepted contacts visible to recipient');
select is((select phone from public.get_solo_player_contact(null,pg_temp.fid('general_request')) where user_id=pg_temp.fid('owner')),'+5491188888888','acceptance shares corrected recipient phone');
select is((select status from public.resolve_solo_player_request(pg_temp.fid('general_request'),'ACCEPT')),'ACCEPTED','acceptance retry is idempotent');
select is((select count(*) from public.solo_player_notifications where request_id=pg_temp.fid('general_request') and event_type='REQUEST_ACCEPTED'),1::bigint,'accepted notification deduplicated for recipient');
select throws_ok($$select public.resolve_solo_player_request(pg_temp.fid('american_request'),'ACCEPT')$$,'0A000',null,'tournament acceptance blocked until atomic phase two');
select is((select status from public.solo_player_requests where id=pg_temp.fid('american_request')),'PENDING','blocked tournament accept leaves request pending');
select is((select status from public.set_solo_player_post_status(pg_temp.fid('long_post'),'PAUSED')),'PAUSED','owner pauses long publication');
select is((select status from public.resolve_solo_player_request(pg_temp.fid('long_request'),'ACCEPT')),'PENDING','pause disables acceptance without expiring request');
select is((select status from public.set_solo_player_post_status(pg_temp.fid('long_post'),'ACTIVE')),'ACTIVE','owner resumes same publication');

select set_config('request.jwt.claim.sub',pg_temp.fid('sender')::text,true);
select is((select count(*) from public.get_solo_player_contact(null,pg_temp.fid('general_request'))),2::bigint,'accepted contacts visible to sender');
select is((select status from public.resolve_solo_player_request(pg_temp.fid('american_request'),'WITHDRAW')),'WITHDRAWN','sender can withdraw own request');
insert into solo_fixture values ('american_timeout',(select id from public.send_solo_player_request(pg_temp.fid('american_post'),pg_temp.fid('sender'),'+5491199999999','solo-players-contact-v1','solo-players-tournament-v1')));
reset role;
update public.solo_player_requests set expires_at=now()-interval '1 second' where id=pg_temp.fid('american_timeout');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid('owner')::text,true);
select is((select effective_status from public.solo_player_request_inbox where id=pg_temp.fid('american_timeout')),'EXPIRED','American inbox computes 24h expiry without cleanup');
select is((select status from public.resolve_solo_player_request(pg_temp.fid('american_timeout'),'ACCEPT')),'EXPIRED','American request cannot be accepted after 24h');
select set_config('request.jwt.claim.sub',pg_temp.fid('sender')::text,true);
select throws_ok($$select public.mark_solo_player_notification_read((select id from public.solo_player_notifications where recipient_user_id=pg_temp.fid('owner') limit 1))$$,
  '42501',null,'other inbox notification cannot be marked read');
select ok((select read_at is not null from public.mark_solo_player_notification_read((select id from public.solo_player_notifications where recipient_user_id=pg_temp.fid('sender') limit 1))),'own notification can be marked read');
select throws_ok($$update public.solo_player_notifications set email_status='SENT'$$,'42501',null,'client cannot forge email delivery');

select set_config('request.jwt.claim.sub',pg_temp.fid('stranger')::text,true);
select is((select count(*) from public.get_solo_player_contact(null,pg_temp.fid('general_request'))),0::bigint,'accepted contacts still hidden from third party');
select throws_ok($$select * from public.get_legacy_solo_players(pg_temp.fid('american'))$$,'42501',null,'legacy singles admin query denied to stranger');
insert into solo_fixture values ('expiry_request',(select id from public.send_solo_player_request(pg_temp.fid('owner_post'),pg_temp.fid('stranger'),'+5491177777777','solo-players-contact-v1')));
reset role;
update public.solo_player_posts set created_at=now()-interval '3 weeks',expires_at=now()-interval '1 second' where id=pg_temp.fid('owner_post');
update public.tournaments set status='BRACKET_PHASE' where id=pg_temp.fid('long');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid('owner')::text,true);
select is((select effective_status from public.solo_player_request_inbox where id=pg_temp.fid('expiry_request')),'EXPIRED','list computes publication expiry without cleanup');
select is((select effective_status from public.solo_player_request_inbox where id=pg_temp.fid('long_request')),'EXPIRED','Long expires on bracket phase without cleanup');
select is((select count(*) from public.solo_player_directory where id in (pg_temp.fid('owner_post'),pg_temp.fid('long_post'))),0::bigint,'closed and expired publications absent from directory');
select is((select status from public.resolve_solo_player_request(pg_temp.fid('expiry_request'),'ACCEPT')),'EXPIRED','expired general cannot be accepted');
select is((select status from public.resolve_solo_player_request(pg_temp.fid('long_request'),'ACCEPT')),'EXPIRED','closed Long cannot be accepted');
reset role;
update public.tournaments set status='ZONE_PHASE' where id=pg_temp.fid('long');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fid('owner')::text,true);
select is((select status from public.solo_player_requests where id=pg_temp.fid('long_request')),'EXPIRED','reopening Long does not reactivate expired request');
select is((select status from public.solo_player_posts where id=pg_temp.fid('long_post')),'EXPIRED','reopening Long does not silently republish interest');
insert into solo_fixture values ('replacement_post',(select id from public.save_solo_player_post(pg_temp.fid('owner'),'9na','DRIVE','RIGHT','+5491123456789',true,'solo-players-contact-v1',null,'1_MONTH')));
select ok((select expires_at=now()+interval '1 month' from public.solo_player_posts where id=pg_temp.fid('replacement_post')),'expired publication frees uniqueness for chosen calendar month');
select set_config('request.jwt.claim.sub',pg_temp.fid('stranger')::text,true);
select is((select phone from public.get_solo_player_contact(pg_temp.fid('replacement_post'))),'+5491123456789','explicit public contact consent allows signed-in directory contact');
reset role;
insert into solo_fixture values ('deletable_inscription',gen_random_uuid());
insert into public.inscriptions(id,player_id,tournament_id) values(pg_temp.fid('deletable_inscription'),pg_temp.fid('legacy'),pg_temp.fid('american'));
update public.solo_player_requests set inscription_id=pg_temp.fid('deletable_inscription') where id=pg_temp.fid('american_request');
delete from public.inscriptions where id=pg_temp.fid('deletable_inscription');
select is((select inscription_id from public.solo_player_requests where id=pg_temp.fid('american_request')),null::uuid,'existing inscription cancellation preserves request and clears reference');
select is((select count(*) from public.inscriptions where tournament_id in (pg_temp.fid('american'),pg_temp.fid('long'))),2::bigint,'all interests/contact acceptances leave historical inscriptions intact');
select is((select count(*) from public.solo_player_posts where player_id=pg_temp.fid('legacy')),0::bigint,'historical singles never automatically published');
select is((select count(*) from public.solo_player_notifications where request_id=pg_temp.fid('general_request')),4::bigint,'one sent, received and two accepted notifications, no duplicates');
select * from finish();
rollback;
