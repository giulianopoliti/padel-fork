-- Stage 1A: prevent client-side role escalation without changing existing RLS,
-- SELECT access, signup flows or idempotent profile/avatar updates.
create schema if not exists private;

create or replace function private.guard_user_authority()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  -- Use the effective database role, never user-editable metadata. Trusted
  -- backend operations retain authority to provision/change application roles.
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'ADMIN'::public."ROLE" then
      raise exception 'Las cuentas ADMIN solo pueden crearse desde un flujo autorizado'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'No se puede cambiar la identidad de la cuenta'
      using errcode = '42501';
  end if;

  -- Existing profile forms repeat PLAYER; avatar UPSERTs omit role entirely.
  if new.role is not distinct from old.role then
    return new;
  end if;

  -- Preserve completion of the authenticated user's unassigned player profile.
  if old.role is null
     and new.role = 'PLAYER'::public."ROLE"
     and old.id = auth.uid() then
    return new;
  end if;

  raise exception 'El rol de la cuenta solo puede modificarse desde un flujo autorizado'
    using errcode = '42501';
end;
$function$;

revoke all on function private.guard_user_authority() from public, anon, authenticated;

create trigger guard_user_authority
before insert or update on public.users
for each row execute function private.guard_user_authority();

comment on function private.guard_user_authority() is
  'Stage 1A: guard users identity/role changes and public ADMIN creation; preserve normal signup and idempotent profile updates. Membership authorization is hardened separately.';
