# Auditoría de rutas de torneos y SEO — FV y TPE

Fecha: 12 de octubre de 2026. Alcance: código del workspace y comprobaciones HTTP públicas en ambos dominios. Este relevamiento no modifica rutas, bases de datos ni deployments.

## Respuesta principal

Desde `/panel` de organizador se navega a `/tournaments/{id}`. `/panel/@organizador/page.tsx` reutiliza la página de `/panel-cpa/@organizador`; tanto la nueva tarjeta local `panel-tournament-card.tsx` como la tarjeta anterior `tournament-card.tsx` construyen enlaces por ID. El nuevo servicio `organizer-panel.service.ts` tampoco selecciona `seo_slug`.

La portada por ID renderiza contenido y emite canonical hacia `/torneos/{slug}` cuando el torneo público tiene slug. No redirige. La portada por slug reutiliza `TournamentPageById`, con la misma lógica de permisos. Por eso puede servir también al organizador de un torneo publicado, pero sus enlaces internos vuelven a las rutas por ID.

Es viable unificar las URLs de navegación en `/torneos/{slug}` y `/torneos/{slug}/{sección}`, conservando ID para fallback. Requiere implementar primero las subrutas y adaptar navegación, providers y código que extrae el ID de la URL. Un reemplazo general de prefijos o una redirección de todas las secciones a la portada perdería funcionalidad.

## Evidencia en producción

Se comprobó un torneo de cada tenant, con peticiones sin sesión. Esto verifica esos casos concretos; no prueba todos los torneos ni las vistas autenticadas.

| Tenant | ID | Slug |
| --- | --- | --- |
| FV | `4ceda862-7a3d-4370-b35c-9ae20b46b822` | `americano-c7-lasaigues-almagro-18-octubre` |
| TPE | `93dd530c-79a1-4ecd-9ac6-013efce3b3ab` | `americano-d5-nova-padel-center-15-octubre` |

| Comprobación | FV | TPE |
| --- | --- | --- |
| `/tournaments/{id}` | 200, canonical al slug, sin redirección | Igual |
| `/torneos/{slug}` | 200, canonical a sí misma | Igual |
| `/tournaments/{id}/bracket` | 200 | 200 |
| `/torneos/{slug}/bracket` | 404 | 404 |
| Título de la portada | `Padel FV` | `PadelElite` |
| Descripción de la portada | Descripción global del sitio | Descripción global del sitio |
| `og:title` en la portada relevada | Ausente | Ausente |
| Sitemap | 118 portadas de torneos | 386 portadas de torneos |
| Robots | Bloquea `/tournaments/` | Igual |

Los conteos de sitemap excluyen los tres listados por estado. No representan un conteo de torneos sin slug ni de borradores: no se consultó ninguna base remota. Los archivos `.env` por tenant apuntan actualmente a bases locales; se descartaron para este relevamiento remoto.

Los cuatro listados legacy tienen `permanentRedirect` en el código y en producción se detectó el destino en el HTML:

| Ruta anterior | Destino |
| --- | --- |
| `/tournaments` | `/torneos` |
| `/tournaments/upcoming` | `/torneos/proximos` |
| `/tournaments/in-progress` | `/torneos/en-curso` |
| `/tournaments/past` | `/torneos/finalizados` |

En las peticiones relevadas el HTTP fue **200 con meta refresh y marcador de Next `NEXT_REDIRECT ... 308`**, no un 308 HTTP con `Location`. La redirección se emitió durante streaming. Conviene resolver estas redirecciones antes del render para obtener un 308 HTTP directo. El helper actual conserva los query params.

## Inventario de rutas por ID existentes en el código

Todas las siguientes tienen implementación bajo `app/(main)/tournaments/[id]`. Su disponibilidad depende del tipo de torneo y los permisos; se verificaron por HTTP únicamente la portada y bracket de los ejemplos anteriores.

| Sufijo después de `/tournaments/{id}` | Implementación / propósito |
| --- | --- |
| Sin sufijo | Portada AMERICAN/LONG según tipo y acceso |
| `/bracket` | Llaves; incluye vistas paralelas de organizador/jugador |
| `/qually` | Tablas de posiciones |
| `/resultados` | Matriz de resultados |
| `/resultados/{coupleId}` | Resultados de una pareja |
| `/formato` | Formato del torneo |
| `/zones` | Zonas |
| `/matches` | Partidos |
| `/zone-matches` | Partidos de zona |
| `/inscriptions` | Inscripciones, con acceso condicionado |
| `/schedules` | Horarios/disponibilidad; vistas paralelas según rol |
| `/match-scheduling` | Programación de encuentros |
| `/schedule-management` | Gestión de horarios |
| `/dates` | Fechas, con autenticación y permisos |
| `/recategorize-players` | Recategorización |
| `/settings` | Redirige a `/settings/datos` |
| `/settings/datos` | Configuración |
| `/settings/operacion` | Configuración |
| `/settings/inscripciones` | Configuración |
| `/settings/formato` | Configuración |
| `/settings/peligro` | Configuración |

También hay un archivo legacy en `tournaments/@player/[id]/page.tsx`. Es un slot paralelo, no una URL independiente; no debe tratarse como una nueva ruta pública.

`/tournaments/create` y `/tournaments/terms` son rutas estáticas. No corresponden a un torneo por ID y deben quedar fuera del redireccionamiento ID → slug. Las rutas `/api/tournaments/{id}/...` y los paths de Storage también deben seguir usando ID.

## Dependencias que hay que adaptar

- `lib/tournaments/public-tournament-url.ts` ya implementa slug preferido y fallback por ID, pero solo para la portada. Extenderlo a sufijos, query params y borradores.
- Panel de organizador, paneles de jugadores, listado de partidos del organizador y múltiples botones de volver al torneo todavía generan enlaces por ID.
- `TournamentLongLayout`, sidebars AMERICAN/LONG y navegación móvil construyen URLs por ID. La detección de página activa también depende de ese prefijo.
- `recategorize-players/page.tsx` lee `useParams().id`.
- `useMatchScheduling.ts` extrae el ID buscando el segmento `tournaments` en `window.location.pathname`. Con una URL por slug podría enviar un ID incorrecto al endpoint de eliminación. Debe recibir el UUID explícitamente desde el torneo resuelto.
- El layout por ID monta `WinnerPhotoProvider`, mientras la página actual por slug monta directamente `TournamentLongLayout`. Debe haber un layout compartido que conserve todos los providers al migrar secciones.
- Hay muchas llamadas `revalidatePath('/tournaments/...')`. Se debe garantizar invalidación de las URLs canónicas después de editar, inscribir, cargar resultados o actualizar fotos.
- `getPublicTournamentBySlug` restringe tenant y excluye borradores. El enlace del panel no debe mandar borradores a ese resolver público. Para tener slug también en borradores haría falta resolución autorizada específica.
- Ya existe resolución de slugs históricos con `tournament_seo_slug_aliases`. Debe conservar el sufijo y los parámetros al redirigir a un slug nuevo; hoy la portada de alias solo redirige a la portada canónica.

## Mejoras SEO prioritarias

1. **Metadatos por torneo:** título con nombre/categoría/sede, descripción con fecha y datos públicos, Open Graph y Twitter. Hoy `generateMetadata` de la portada por slug solo devuelve canonical y hereda título/description globales.
2. **Unificar señales:** enlaces internos al slug, canonical propio por página pública y redirects permanentes de URLs anteriores. La portada por ID ya tiene canonical; las subrutas relevadas no.
3. **Revisar robots:** el bloqueo general `/tournaments/` impide rastrear esas páginas y ver sus canonical o futuras redirecciones. Permitir el rastreo de URLs que redirigen y definir `noindex` para páginas operativas que lo necesiten. No usar robots como sustituto de permisos ni como mecanismo de canonicalización. Referencia: [Google sobre URLs duplicadas y canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
4. **Indexación selectiva:** portada y contenido público útil pueden indexarse; configuración, programación operativa y recategorización deberían tener `noindex`. Cambiar su URL a slug no obliga a indexarlas.
5. **Sitemap:** conservar exclusivamente URLs canónicas de torneos publicados. Evaluar subpáginas públicas de valor; no agregar todas las páginas operativas. El `lastModified` actual usa fecha de inicio/final del evento, que no representa necesariamente una modificación real del contenido.

## Migración propuesta

1. Centralizar resolución `{ tenant, id, seoSlug, isDraft, basePath }` y construcción de enlaces. El UUID continúa siendo la identidad utilizada por Supabase, APIs y permisos.
2. Crear equivalentes por slug para los sufijos del inventario, reutilizando las pantallas y sus controles de acceso. Resolver el UUID en servidor y proporcionarlo explícitamente a clientes/hooks. Conservar slots paralelos, providers y comportamiento por rol.
3. Actualizar enlaces del panel, sidebars, navegación móvil, botones, enlaces compartidos y redirects internos para que apunten directamente a la URL preferida. Incorporar `seo_slug` a las consultas que hoy no lo traen.
4. Redirigir antes del render `/tournaments/{id}/{sufijo}` a `/torneos/{slug}/{sufijo}` mediante 308, preservando parámetros. Aplicarlo solo a rutas implementadas y al torneo del tenant correspondiente. Evitar cadenas y loops.
5. Conservar la implementación por ID como fallback cuando no haya slug, el torneo sea borrador o falle la resolución inicial. Un slug desconocido debe devolver 404: no contiene información suficiente para inferir un UUID. Si la base está caída, mantener la ruta por ID no garantiza que el contenido pueda cargarse.
6. Conservar alias antiguos hacia el slug vigente con sufijo/query intactos. No cambiar slugs existentes solo por editar nombre o fecha.
7. Ajustar metadata, robots, sitemap y revalidación. Verificar y desplegar para ambos tenants con configuración independiente.

## Verificación realizada y pendiente

Pasaron **5 suites, 15 tests** de URL pública/fallback, listados, slug, sitemap y robots ejecutadas con `--runTestsByPath`. No prueban una migración nueva; confirman el comportamiento de helpers existentes.

Antes de implementar/desplegar deben cubrirse: FV/TPE; AMERICAN/LONG; visitante/jugador/organizador; portada y secciones; query `fecha_id`; resultados por pareja; aliases; borradores; torneo sin slug; permisos de configuración; eliminación de partidos; fotos de ganadores; invalidación de páginas; y 308 HTTP sin streaming/loops.

La auditoría preservó los cambios locales previos del panel y `tsconfig.json`. No hubo mutaciones remotas. Para futuras verificaciones de datos o backfill, seleccionar explícitamente FV (`bfmaqrythlwbfjuqumom`) o TPE (`lzowflvgnspjdbvdxliy`), según corresponda.
