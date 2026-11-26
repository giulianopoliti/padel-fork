import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Legacy local schema restores can leave application objects owned by
// supabase_admin, while `supabase migrations up` runs as postgres.
// Keep this repair outside migrations: it requires the LOCAL bootstrap role.
export const buildLocalRankingOwnershipSql = ({ apply = false } = {}) => `
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $repair$
declare
  item record;
  private_schemas text[] := array['tournament_points_private', 'long_substitution_private', 'solo_player_private', 'tournament_reopen_private'];
begin
  if current_user <> 'supabase_admin' or
    (current_database() <> 'postgres' and current_database() !~ '^ranking_test_[a-f0-9]{32}$') then
    raise exception 'This repair requires the local bootstrap role and the local application/test database';
  end if;

  for item in
    select n.nspname as name, pg_get_userbyid(n.nspowner) as owner
    from pg_namespace n where n.nspname = any(private_schemas) order by n.nspname
  loop
    if item.owner not in ('postgres', 'supabase_admin') then
      raise exception 'Unexpected owner % for schema %; no changes committed', item.owner, item.name;
    end if;
    if item.owner <> 'postgres' then
      raise notice 'Schema %: % -> postgres', item.name, item.owner;
      if ${apply} then execute format('alter schema %I owner to postgres', item.name); end if;
    end if;
  end loop;

  for item in
    select n.nspname as schema_name, c.relname as name,
      pg_get_userbyid(c.relowner) as owner,
      case c.relkind when 'S' then 'sequence' when 'v' then 'view'
        when 'm' then 'materialized view' else 'table' end as object_kind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'S', 'v', 'm') and (
      n.nspname = any(private_schemas) or n.nspname = 'public' and c.relname in (
        'categories', 'players', 'tournaments', 'player_tournament_history',
        'player_recategorizations', 'tournament_points_settlements'
      )
    ) order by n.nspname, c.relkind = 'S', c.relname
  loop
    if item.owner not in ('postgres', 'supabase_admin') then
      raise exception 'Unexpected owner % for %.%; no changes committed', item.owner, item.schema_name, item.name;
    end if;
    if item.owner <> 'postgres' then
      raise notice '% %.%: % -> postgres', item.object_kind, item.schema_name, item.name, item.owner;
      if ${apply} then
        execute format('alter %s %I.%I owner to postgres', item.object_kind, item.schema_name, item.name);
      end if;
    end if;
  end loop;

  for item in
    select n.nspname as schema_name, p.proname as name,
      pg_get_function_identity_arguments(p.oid) as arguments,
      pg_get_userbyid(p.proowner) as owner
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prokind = 'f' and (
      n.nspname = any(private_schemas) or n.nspname = 'public' and p.oid in (
        to_regprocedure('public.get_tournament_points_context_with_lineups(uuid,uuid)'),
        to_regprocedure('public.commit_tournament_points_with_lineups(uuid,uuid,text,jsonb)'),
        to_regprocedure('public.preview_tournament_reopen(uuid,uuid)'),
        to_regprocedure('public.reopen_tournament_points(uuid,uuid,text)'),
        to_regprocedure('public.recategorize_tournament_players(uuid,uuid,jsonb)')
      )
    ) order by n.nspname, p.proname, p.oid
  loop
    if item.owner not in ('postgres', 'supabase_admin') then
      raise exception 'Unexpected owner % for %.%; no changes committed', item.owner, item.schema_name, item.name;
    end if;
    if item.owner <> 'postgres' then
      raise notice 'Function %.%(%): % -> postgres', item.schema_name, item.name, item.arguments, item.owner;
      if ${apply} then
        execute format('alter function %I.%I(%s) owner to postgres', item.schema_name, item.name, item.arguments);
      end if;
    end if;
  end loop;
end $repair$;
commit;
`

export const isLocalDockerEndpoint = endpoint => typeof endpoint === 'string' &&
  (endpoint.startsWith('npipe:////./pipe/') || endpoint.startsWith('unix:///'))

const main = () => {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log('Uso: node scripts/repair-local-ranking-ownership.mjs [--apply]\n' +
      'Sin --apply solo muestra los propietarios que cambiarian.\n' +
      'Destino fijo: supabase_db_padel-base-main-test, base postgres, Docker local.\n' +
      'No cambia puntajes, categorias, resultados ni el historial de migraciones.')
    return
  }
  if (args.some(arg => arg !== '--apply')) throw new Error('Solo se admite --apply; no se aceptan destinos remotos.')
  const docker = (args, input) => {
    const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 35000, maxBuffer: 8 * 1024 * 1024 })
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || 'Docker fallo')
    if (result.stderr) process.stderr.write(result.stderr)
    return result.stdout
  }
  if (process.env.DOCKER_HOST && !isLocalDockerEndpoint(process.env.DOCKER_HOST)) {
    throw new Error('DOCKER_HOST debe ser un socket local; se rechazan conexiones TCP/SSH.')
  }
  const contexts = JSON.parse(docker(['context', 'inspect']))
  if (contexts.length !== 1 || !isLocalDockerEndpoint(contexts[0]?.Endpoints?.docker?.Host ?? '')) {
    throw new Error('El contexto Docker debe usar un socket local; no se ejecutara la reparacion.')
  }
  const container = 'supabase_db_padel-base-main-test'
  const containers = JSON.parse(docker(['inspect', '--type', 'container', container]))
  if (containers.length !== 1 || containers[0].Name !== '/' + container || !containers[0].State.Running) {
    throw new Error('El contenedor Supabase local esperado no esta en ejecucion.')
  }
  console.log(args.includes('--apply') ? 'Reparando propietarios de objetos de la app local...' : 'Diagnostico de propietarios (sin cambios):')
  const output = docker(['exec', '-i', container, 'bash', '-c',
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec "$@"', '--',
    'psql', '-X', '-q', '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  buildLocalRankingOwnershipSql({ apply: args.includes('--apply') }))
  if (output) process.stdout.write(output)
  console.log(args.includes('--apply') ? 'Propietarios locales reparados. Ahora ejecuta pnpm exec supabase migrations up.' : 'Para aplicar: node scripts/repair-local-ranking-ownership.mjs --apply')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
