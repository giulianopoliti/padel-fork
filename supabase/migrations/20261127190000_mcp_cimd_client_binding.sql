-- Existing grants belong to the original confidential ChatGPT client.
-- Deploy through the owner's CI/CD BEFORE deploying the application change.
alter table public.padel_fv_mcp_grants
  add column client_id text not null default 'padelfv-chatgpt';

comment on column public.padel_fv_mcp_grants.client_id is
  'OAuth client bound to this one-time authorization code (legacy ID or approved CIMD URL).';
