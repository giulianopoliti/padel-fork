create table public.padel_fv_mcp_grants (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_challenge text not null,
  resource text not null,
  redirect_uri text not null,
  code_expires_at timestamptz not null,
  access_hash text unique,
  access_expires_at timestamptz,
  check ((access_hash is null) = (access_expires_at is null))
);

create index padel_fv_mcp_grants_user_id_idx on public.padel_fv_mcp_grants (user_id);

alter table public.padel_fv_mcp_grants enable row level security;
revoke all on public.padel_fv_mcp_grants from public, anon, authenticated;
grant select, insert, update, delete on public.padel_fv_mcp_grants to service_role;
