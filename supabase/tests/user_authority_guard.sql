-- Transactional integration test. All DML targets a temporary table, not users.
-- Run after 20261013161646_guard_user_authority.sql with psql ON_ERROR_STOP=1.
begin;

create temporary table user_authority_probe (like public.users including defaults);
alter table pg_temp.user_authority_probe add primary key (id);
alter table pg_temp.user_authority_probe enable row level security;
grant select, insert, update, delete on pg_temp.user_authority_probe to anon, authenticated, service_role;
create policy probe_select on pg_temp.user_authority_probe for select using (true);
create policy probe_insert on pg_temp.user_authority_probe for insert with check (true);
create policy probe_update on pg_temp.user_authority_probe for update using (auth.uid() = id);
create trigger probe_authority before insert or update on pg_temp.user_authority_probe
  for each row execute function private.guard_user_authority();

insert into pg_temp.user_authority_probe (id, role) values
  ('00000000-0000-4000-8000-000000000001', 'PLAYER'),
  ('00000000-0000-4000-8000-000000000002', 'ORGANIZADOR'),
  ('00000000-0000-4000-8000-000000000003', 'ADMIN'),
  ('00000000-0000-4000-8000-000000000004', null);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
do $test$
declare
  target_role public."ROLE";
begin
  -- The existing profile action repeats PLAYER: allow and verify a real write.
  update pg_temp.user_authority_probe set role = 'PLAYER', avatar_url = 'profile-avatar'
    where id = '00000000-0000-4000-8000-000000000001';
  if not found then raise exception 'Profile update unexpectedly affected zero rows'; end if;
  if not exists (select 1 from pg_temp.user_authority_probe
      where id = '00000000-0000-4000-8000-000000000001'
        and role = 'PLAYER' and avatar_url = 'profile-avatar') then
    raise exception 'Profile update did not persist';
  end if;

  -- Avatar-only UPSERT must not lose the existing role.
  insert into pg_temp.user_authority_probe (id, avatar_url)
    values ('00000000-0000-4000-8000-000000000001', 'upsert-avatar')
    on conflict (id) do update set avatar_url = excluded.avatar_url;
  if not found then raise exception 'Avatar UPSERT unexpectedly affected zero rows'; end if;
  if not exists (select 1 from pg_temp.user_authority_probe
      where id = '00000000-0000-4000-8000-000000000001'
        and role = 'PLAYER' and avatar_url = 'upsert-avatar') then
    raise exception 'Avatar UPSERT changed role or did not persist';
  end if;

  foreach target_role in array array['ADMIN','ORGANIZADOR','CLUB','COACH',null]::public."ROLE"[] loop
    begin
      update pg_temp.user_authority_probe set role = target_role
        where id = '00000000-0000-4000-8000-000000000001';
      raise exception 'Role change unexpectedly allowed: %', target_role;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    insert into pg_temp.user_authority_probe (id, role)
      values ('00000000-0000-4000-8000-000000000005', 'ADMIN');
    raise exception 'Authenticated ADMIN creation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into pg_temp.user_authority_probe (id, role)
      values ('00000000-0000-4000-8000-000000000001', 'ADMIN')
      on conflict (id) do update set role = excluded.role;
    raise exception 'ADMIN escalation by UPSERT unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update pg_temp.user_authority_probe set id = '00000000-0000-4000-8000-000000000006'
      where id = '00000000-0000-4000-8000-000000000001';
    raise exception 'Identity reassignment unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: own profile, avatar UPSERT, five blocked role changes, ADMIN INSERT/UPSERT, identity guard';
end;
$test$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
do $test$
begin
  update pg_temp.user_authority_probe set role = 'PLAYER'
    where id = '00000000-0000-4000-8000-000000000004';
  if not found then raise exception 'Unassigned profile completion affected zero rows'; end if;
  if not exists (select 1 from pg_temp.user_authority_probe
    where id = '00000000-0000-4000-8000-000000000004' and role = 'PLAYER') then
    raise exception 'Unassigned profile completion failed';
  end if;
  raise notice 'PASS: own NULL to PLAYER completion';
end;
$test$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $test$
begin
  insert into pg_temp.user_authority_probe (id, avatar_url)
    values ('00000000-0000-4000-8000-000000000003', 'admin-avatar')
    on conflict (id) do update set avatar_url = excluded.avatar_url;
  if not exists (select 1 from pg_temp.user_authority_probe
    where id = '00000000-0000-4000-8000-000000000003' and role = 'ADMIN' and avatar_url = 'admin-avatar') then
    raise exception 'Existing ADMIN avatar update failed';
  end if;
  raise notice 'PASS: existing ADMIN avatar-only UPSERT';
end;
$test$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $test$
begin
  update pg_temp.user_authority_probe set role = 'ORGANIZADOR', avatar_url = 'organizer-avatar'
    where id = '00000000-0000-4000-8000-000000000002';
  if not found then raise exception 'Organizer profile affected zero rows'; end if;
  if not exists (select 1 from pg_temp.user_authority_probe
    where id = '00000000-0000-4000-8000-000000000002' and role = 'ORGANIZADOR' and avatar_url = 'organizer-avatar') then
    raise exception 'Organizer role changed on profile update';
  end if;
  raise notice 'PASS: existing ORGANIZADOR idempotent profile';
end;
$test$;

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
do $test$
declare
  signup_role public."ROLE";
  fixture_number integer := 10;
begin
  begin
    insert into pg_temp.user_authority_probe (id, role)
      values ('00000000-0000-4000-8000-000000000007', 'ADMIN');
    raise exception 'Anonymous ADMIN creation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  foreach signup_role in array array['PLAYER','CLUB','COACH','ORGANIZADOR']::public."ROLE"[] loop
    fixture_number := fixture_number + 1;
    insert into pg_temp.user_authority_probe (id, role)
      values (('00000000-0000-4000-8000-' || lpad(fixture_number::text, 12, '0'))::uuid, signup_role);
    if not found then raise exception 'Existing signup role % failed', signup_role; end if;
  end loop;
  raise notice 'PASS: anon ADMIN denied; existing signup roles without session preserved';
end;
$test$;

set local role service_role;
do $test$
begin
  update pg_temp.user_authority_probe set role = 'ADMIN'
    where id = '00000000-0000-4000-8000-000000000001';
  if not found then raise exception 'Trusted backend role change failed'; end if;
  insert into pg_temp.user_authority_probe (id, role)
    values ('00000000-0000-4000-8000-000000000008', 'ADMIN');
  if not exists (select 1 from pg_temp.user_authority_probe
    where id = '00000000-0000-4000-8000-000000000001' and role = 'ADMIN') then
    raise exception 'Trusted backend role change did not persist';
  end if;
  raise notice 'PASS: trusted backend retains role provisioning';
end;
$test$;
reset role;
rollback;
