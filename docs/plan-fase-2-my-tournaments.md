# Fase 2: /my-tournaments con carga por filtro y página

## Objetivo

Conservar las funciones actuales para ORGANIZADOR y CLUB, eliminando las Edge Functions del listado. Next.js consultará únicamente una página del filtro seleccionado y sus métricas. No habrá nuevas funciones SQL ni migraciones salvo que la medición justifique un índice.

## Diagnóstico del código actual

- `page.tsx` espera `getClubTournamentsWithMetrics(undefined, 999)` antes de renderizar. Esa acción invoca `get-organization-tournaments` o `get-club-tournaments` según el rol.
- Las funciones consultan los torneos por `created_at DESC` y hacen cuatro peticiones de conteo por torneo. Se calculan métricas para todos los registros recuperados, aunque el usuario vea una sola pestaña.
- Después se enriquecen los enlaces SEO mediante otra consulta y se separan las cinco pestañas en memoria.
- `Tabs defaultValue="upcoming"` cambia la vista en el cliente; no hace una nueva consulta. El filtro se pierde al recargar o compartir la URL.
- El `Suspense` envuelve contenido construido después del await; no permite mostrar su fallback durante esa consulta inicial.
- Total, activos y badges se calculan con los registros descargados. El límite de 999 puede hacer que los contadores no representen el universo real.
- La página ignora `result.success/message`; un fallo puede mostrarse como una lista vacía.
- `IN_PROGRESS` y `PAIRING` no se incluyen en ninguna de las cinco pestañas.
- Cada card incluye imagen, datos generales, métricas, progreso y HoverCard. Hay diálogos de duplicación por torneo LONG/AMERICAN y descancelación por torneo CANCELED.
- Duplicar ya carga configuración, categorías y sedes solo al abrir el diálogo, mediante Server Actions. Restaurar ya usa una API de Next.js. Estas acciones no necesitan migrar a otro backend.
- Las rutas y links recientes usan `seo_slug`, con fallback al ID para borradores; deben conservarse.

## 1. Servicio de backend compartido

Crear un módulo `server-only` de listado y extraer del servicio del panel la lectura agrupada de métricas, manteniendo sus reglas de selección independientes.

- Resolver usuario, rol y alcance autorizado en el servidor: organización activa para organizadores; club asociado para CLUB, preservando los permisos existentes.
- No aceptar un organizationId/clubId del navegador como autorización.
- Validar filtro y página; fijar un tamaño de 12 torneos en el servidor.
- Aplicar alcance, exclusión de pruebas, estados y orden en la consulta antes de `range`.
- Ordenar por `start_date ASC NULLS LAST, id ASC` en todos los filtros de /my-tournaments, según el ajuste posterior solicitado para ambos tenants. No aplicar la prioridad de TPE del panel a esta página.
- Seleccionar los campos que consume la card, incluyendo `seo_slug`, `is_draft`, club, fechas, precio, tipo, categoría, género e imagen. Evitar la consulta posterior de enlaces.
- Usar el cliente autenticado y preservar RLS. Evitar ampliar permisos con service_role.

## 2. Filtros en la URL y paginación

Ejemplo: `/my-tournaments?estado=zones&page=2`.

| Filtro | Estados actuales a preservar |
| --- | --- |
| Próximos | NOT_STARTED, ZONE_REGISTRATION |
| Zonas | ZONE_PHASE |
| Llaves | BRACKET_PHASE |
| Finalizados | FINISHED, FINISHED_POINTS_PENDING, FINISHED_POINTS_CALCULATED |
| Cancelados | CANCELED |

- Default: Próximos, página 1, como hoy.
- Cambiar de filtro resetea a página 1. Atrás/adelante, recarga y enlaces compartidos conservan la selección.
- Añadir navegación anterior/siguiente y total del filtro. Corregir páginas fuera de rango sin ejecutar la carga de métricas de páginas inexistentes.
- No enviar las listas de las pestañas inactivas al cliente ni precargarlas automáticamente. Evitar prefetch de filtros no seleccionados si dispara consultas de métricas.
- Mantener navegación de teclado y etiquetas accesibles; si se conservan Tabs, controlar su valor desde la URL y usar activación manual para evitar consultas al mover el foco.
- Para los estados actualmente invisibles, proponer un filtro Otros que aparezca cuando tenga registros, sin alterar las cinco agrupaciones actuales.

## 3. Métricas de la página visible

Después de seleccionar los IDs de la página:

1. Consultar inscripciones y parejas solo de esos IDs.
2. Consultar los campos mínimos de partidos solo de esos IDs.
3. Calcular los resúmenes en Next.js, reutilizando la agrupación de fase 1 y paginando estas lecturas para evitar el límite de filas de Supabase.

La cantidad de peticiones deja de multiplicarse por cada torneo. Una página grande puede requerir varias páginas de métricas; no se prometerá una única petición por tabla para cualquier volumen.

Conservar las métricas actuales mediante un adaptador para la card existente si es necesario. Diferenciar inscripciones totales, parejas confirmadas y solicitudes pendientes; no renombrar conteos de inscripciones como jugadores. Si se adopta la presentación del panel, usar jugadores únicos y partidos sin BYEs de forma explícita y consistente en todo el listado.

## 4. Contadores separados

- Obtener los totales de los cinco filtros con consultas `head/count`, acotadas al mismo alcance autorizado y excluyendo pruebas.
- Obtener el total general mediante un conteo, sin descargar torneos para contarlos; activos sigue siendo Zonas + Llaves para conservar la definición actual.
- Ejecutar los conteos independientes en paralelo. Estas peticiones son de costo fijo respecto de la cantidad de cards; no incluyen inscripciones ni partidos.
- El total del filtro de la consulta paginada permite calcular páginas aunque falle el resumen del encabezado.
- Deduplicar durante el request y evitar caché global de datos de usuarios. Si se cachean badges posteriormente, incluir tenant/alcance y una invalidación explícita.

## 5. Estructura de la página y estados de carga

- Convertir `page.tsx` en una composición que lea searchParams y establezca contexto autorizado.
- Colocar la carga del listado dentro de un componente servidor asíncrono bajo Suspense, con clave por filtro/página.
- Encabezado, filtros y navegación quedan disponibles mientras carga el listado. Los contadores tienen una frontera de carga/error separada.
- Mostrar skeletons acordes a la página visible y errores con reintento. Una consulta fallida no equivale a cero torneos ni cero partidos.
- Limitar componentes cliente a controles, navegación y diálogos. Mantener imágenes diferidas; no cargar las de filtros inactivos.
- Mantener título, total/activos, badges, botón Crear, estados vacíos, datos y progreso de cards, HoverCard y links canónicos.

## 6. Duplicación y descancelación

- Preservar duplicación solo LONG/AMERICAN, con nombre, descripción, género, categoría/configuración, sede principal y adicionales, fechas/horarios, cupo, precio, premio y formato.
- Seguir obteniendo la configuración detallada solo al abrir el diálogo. Creación de un nuevo torneo sin participantes ni partidos y navegación al nuevo registro como hoy.
- Preservar confirmación y API de descancelación: restaurar a llaves, zonas o no iniciado según la estructura real.
- Tras restaurar, actualizar listado y conteos; si desaparece la última card de una página, navegar a una página válida.
- Conservar validaciones y permisos en las mutaciones; usar acciones separadas del enlace principal para evitar clicks superpuestos.
- Revisar invalidación de /my-tournaments, /panel y enlaces SEO tras cambios que afecten esas vistas.

## 7. Migración y retirada de Edge Functions

1. Implementar el servicio nuevo sin tocar el consumidor actual.
2. Migrar /my-tournaments para ORGANIZADOR y CLUB. El panel sigue con su selección propia.
3. Eliminar o adaptar `getClubTournamentsWithMetrics` solo después de comprobar todos sus consumidores.
4. Verificar que el listado ya no invoca las dos Edge Functions, ni necesita un fallback a ellas.
5. Publicar la aplicación en ambos tenants; confirmar que no quedan versiones activas ni consumidores externos que dependan de esas funciones antes de retirarlas de Supabase y de la documentación.

## Validación y criterios de aceptación

- Solo una página del filtro seleccionado carga cards y métricas. Con 500 torneos se siguen obteniendo hasta 12 cards por página.
- Orden estable sin duplicados/saltos; valores de URL inválidos, filtros vacíos y páginas fuera de rango resueltos.
- Totales correctos incluso con más de 999 torneos, y sin incluir datos de otra organización/club.
- Lecturas de métricas completas cuando superan el límite de filas de Supabase. Errores explícitos y sin ceros falsos.
- Duplicación y descancelación funcionan desde cada página; las listas y badges se actualizan.
- Links SEO y borradores funcionan como antes; ambos tenants y ambos roles conservan sus permisos.
- Verificar móvil, escritorio, teclado, carga inicial y cambios rápidos de filtros.
- Medir tiempo del servidor, filas transferidas y peticiones antes/después. Revisar índices reales solo si la medición detecta consultas lentas.

## Estado de implementación

Implementada en el código local: servicio de listado autenticado para ORGANIZADOR y CLUB, 12 torneos por filtro/página, métricas agrupadas de los IDs visibles, contadores independientes, navegación por URL, errores con reintento y filtro Otros. Se mantienen los conteos históricos de las cards, las acciones de duplicación/descancelación y los enlaces SEO.

La aplicación ya no invoca las dos Edge Functions de listado. Sus despliegues remotos se conservan hasta publicar esta versión y descartar consumidores externos.

Validación: 23 pruebas pasaron, cubriendo permisos, paginación, filtros, totales superiores a 999 y regresión del panel/enlaces SEO. Se verificó visualmente con datos de prueba la navegación entre páginas/filtros, Atrás, el diálogo de descancelación y el ancho móvil. No se ejecutaron mutaciones reales durante la revisión visual. Las compilaciones FV y TPE finalizaron correctamente. El build FV avisó que su Supabase local no estaba disponible; TPE avisó que su TENANT_ORGANIZATION_ID local no coincide y resolvió la organización por slug. Estos avisos no impidieron compilar y no se cambiaron variables de entorno. No se desplegó la aplicación ni se modificaron bases remotas.
