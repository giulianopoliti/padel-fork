# padel-fv

Sistema de gestion de torneos de padel con dos tenants productivos desde un unico repositorio GitHub.

## Modelo actual

Este repo es la unica fuente de codigo para:

- `padel-fv`
- `padel-elite`

No se usan forks separados por tenant y, por ahora, no se usa Vercel Platforms. El modelo operativo es:

```txt
GitHub repo giulianopoliti/padel-fv
  -> Vercel project padel-fv    -> Supabase FV    -> dominio FV
  -> Vercel project padel-elite -> Supabase Elite -> dominio Elite
```

Cada proyecto de Vercel apunta al mismo repo y se diferencia por sus variables de entorno. Cada tenant tiene su propio proyecto Supabase productivo.

## Deploys en Vercel

Un `git push` no elige tenant por si mismo. El deploy lo decide la configuracion de cada proyecto en Vercel:

- Si los dos proyectos de Vercel estan conectados al mismo repo y a la misma rama productiva, el mismo push puede disparar deploys en ambos proyectos.
- Si solo uno esta conectado a esa rama, deploya solo ese proyecto.
- Las variables de entorno de cada proyecto de Vercel determinan que tenant se compila y contra que Supabase corre.

Variables minimas por proyecto Vercel:

```env
NEXT_PUBLIC_TENANT_KEY=padel-fv # o padel-elite
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TENANT_ORGANIZATION_ID=
TENANT_ORGANIZATION_SLUG=
NEXT_PUBLIC_TENANT_ORGANIZATION_SLUG=
```

El archivo `.vercel/project.json` es estado local del CLI y esta ignorado por Git. No debe usarse como fuente de verdad para saber que proyecto deploya en produccion.

## Variables importantes

Para desarrollo local con un tenant especifico, ver [TENANTS.md](./TENANTS.md).

Los archivos locales esperados son:

```txt
.env.padel-fv.local
.env.padel-elite.local
```

Tambien puede existir `.env.local` para apuntar al Supabase local.

## Migraciones de Supabase

Las migraciones en `supabase/migrations/` son compartidas por los dos tenants porque el esquema debe mantenerse igual en ambos Supabase.

Crear un archivo SQL en `supabase/migrations/` no lo aplica automaticamente a ningun proyecto. El destino real depende del comando que ejecutes:

- `supabase db reset` aplica migraciones al Supabase local.
- `supabase db push` aplica migraciones al proyecto remoto actualmente linkeado por el CLI.
- El link remoto vive en `supabase/.temp/project-ref`, es local, esta ignorado por Git y puede cambiar de una maquina a otra.

Antes de empujar migraciones, verificar el proyecto linkeado:

```bash
cat supabase/.temp/project-ref
supabase projects list
supabase migration list --linked
```

Flujo recomendado para una migracion de esquema:

1. Crear la migracion en `supabase/migrations/`.
2. Probar localmente con `supabase db reset`.
3. Linkear FV y aplicar:

```bash
supabase login
supabase link --project-ref PROJECT_REF_FV
supabase migration list --linked
supabase db push
```

4. Linkear Elite y aplicar la misma migracion:

```bash
supabase link --project-ref PROJECT_REF_ELITE
supabase migration list --linked
supabase db push
```

5. Committear el archivo de migracion para que el historial quede versionado en el unico repo.

Regla practica: `git push` deploya codigo en Vercel; `supabase db push` migra base de datos. Son pasos separados.

## Funciones Edge

Si una migracion o cambio requiere funciones Edge, desplegarlas en cada Supabase remoto:

```bash
supabase functions deploy get-player-inscribed-tournaments
supabase functions deploy get-player-next-match
supabase functions deploy get-player-upcoming-tournaments
supabase functions deploy search-players-organization
supabase functions deploy search-ranking-players
supabase functions deploy search-tournament-players
```

`/panel` y `/my-tournaments` consultan los torneos desde Next.js. Las funciones
`get-club-tournaments` y `get-organization-tournaments` son legado: conservarlas
remotamente mientras existan versiones de la aplicación o consumidores externos
que aún las invoquen; no son necesarias para el listado nuevo.

Igual que con `db push`, el destino de `functions deploy` es el proyecto Supabase actualmente linkeado.

## Configuracion de Auth

En cada proyecto Supabase configurar:

- `Site URL`
- `Redirect URLs`
- proveedor Google si el tenant lo usa
- recovery/reset password para el dominio del cliente

Para recovery/reset password, el codigo envia a Supabase un `redirectTo` hacia:

```txt
<NEXT_PUBLIC_SITE_URL>/auth/callback/recovery
```

Por tenant, asegurar que la allowlist de Supabase Auth incluya el callback del dominio correspondiente:

```txt
https://<dominio-fv>/auth/callback**
https://<dominio-elite>/auth/callback**
http://localhost:3000/auth/callback**
```

## Datos por tenant

Cada Supabase tiene sus propios datos. Si se necesita migrar informacion entre tenants, hacerlo de forma explicita y cuidando:

- organizacion
- members
- clubs
- players
- tournaments
- inscripciones, matches y tablas relacionadas
- assets de storage

## Convenciones del producto

- Registro publico: solo `PLAYER`
- Organizadores: alta manual
- Login: unificado para jugadores y organizadores
- Home: logo del tenant, proximos torneos, clubes y ranking
- Datos publicos: filtrados por la organizacion configurada

## Notas

- La base de datos mantiene el esquema multi-organizacion para no romper permisos ni paneles existentes.
- Cada deploy productivo se comporta como single-tenant por sus variables de entorno.
- `supabase/.temp`, `supabase/.branches`, `.env*` y `.vercel` son estado local y no deben versionarse.
