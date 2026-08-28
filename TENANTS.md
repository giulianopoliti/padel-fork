# Tenants y desarrollo local

Este repo usa el mismo codigo para `padel-fv` y `padel-elite`.

## Arquitectura

Hay un solo repositorio GitHub:

```txt
https://github.com/giulianopoliti/padel-fv
```

Ese repo alimenta dos proyectos Vercel y dos proyectos Supabase:

```txt
Vercel project padel-fv    -> variables FV    -> Supabase FV
Vercel project padel-elite -> variables Elite -> Supabase Elite
```

El codigo y las migraciones son compartidos. Los deploys y las bases de datos se separan por configuracion de entorno.

## MCP de Supabase

Nunca usar un MCP generico llamado `supabase` ni `supabase-develop` en este repo: ambos nombres permiten terminar conectado al proyecto equivocado. Los dos destinos remotos estan nombrados explicitamente en `.mcp.json` y `.codex/config.toml`:

```txt
supabase-fv     -> Supabase de Padel FV
supabase-elite  -> Supabase de Padel Elite
```

Antes de cualquier consulta o cambio remoto, confirmar el tenant solicitado y usar exclusivamente el MCP con ese sufijo. La configuracion se carga al abrir el proyecto; tras modificarla, reiniciar Codex o reabrir esta carpeta para que desaparezca el MCP generico de la sesion actual.

En produccion, cada proyecto de Vercel define sus propias variables de entorno. En local, usamos archivos separados por tenant para simular ese mismo comportamiento.

## Comandos locales

```bash
npm run dev:fv
npm run dev:elite
npm run build:fv
npm run build:elite
```

`npm run dev` sigue funcionando, pero no fuerza tenant. Para evitar diferencias raras con produccion, preferi siempre `dev:fv` o `dev:elite`.

## Archivos locales

Los archivos secretos locales son:

```txt
.env.padel-fv.local
.env.padel-elite.local
```

Estan ignorados por Git. Los ejemplos versionables son:

```txt
.env.padel-fv.example
.env.padel-elite.example
```

## Variables importantes

Cada tenant necesita:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TENANT_ORGANIZATION_ID=
TENANT_ORGANIZATION_SLUG=
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_TENANT_ORGANIZATION_SLUG=
```

El script `scripts/with-tenant-env.mjs` agrega automaticamente:

```env
NEXT_PUBLIC_TENANT_KEY=padel-fv
```

o:

```env
NEXT_PUBLIC_TENANT_KEY=padel-elite
```

## Produccion

Por ahora no usamos Vercel Platforms.

El modelo recomendado es:

```txt
Vercel project padel-fv    -> mismo repo -> env FV    -> dominio padelfv.com
Vercel project padel-elite -> mismo repo -> env Elite -> dominio padelelite.com
```

En cada proyecto de Vercel, definir explicitamente `NEXT_PUBLIC_TENANT_KEY`, `NEXT_PUBLIC_SITE_URL`, `TENANT_ORGANIZATION_ID`, `TENANT_ORGANIZATION_SLUG` y las credenciales Supabase correspondientes.

Un `git push` deploya el codigo en los proyectos Vercel que esten conectados a esa rama. Si ambos proyectos Vercel escuchan `main`, el mismo push puede redeployar ambos. Cual Supabase usa cada deploy depende exclusivamente de las variables configuradas en ese proyecto Vercel.

## Migraciones Supabase

Las migraciones viven en `supabase/migrations/` y son comunes a ambos tenants. Crear una migracion no la aplica automaticamente a ninguna base remota.

El destino de estos comandos lo define el proyecto linkeado por Supabase CLI:

```bash
supabase db push
supabase functions deploy <function-name>
```

Ese link es local y esta en `supabase/.temp/project-ref`; no se versiona. Antes de migrar, revisar:

```bash
cat supabase/.temp/project-ref
supabase migration list --linked
```

Flujo recomendado:

1. Probar la migracion localmente con `supabase db reset`.
2. Linkear el Supabase de FV y correr `supabase db push`.
3. Linkear el Supabase de Elite y correr `supabase db push`.
4. Committear la migracion en Git.

Ejemplo:

```bash
supabase link --project-ref PROJECT_REF_FV
supabase migration list --linked
supabase db push

supabase link --project-ref PROJECT_REF_ELITE
supabase migration list --linked
supabase db push
```

Regla corta: `git push` actualiza codigo en Vercel; `supabase db push` actualiza esquema en el Supabase linkeado en ese momento.
