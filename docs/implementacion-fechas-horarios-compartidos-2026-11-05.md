# Implementación de fechas y horarios compartidos

Fecha: 5 de noviembre de 2026.

El panel `/schedules`, el asistente de distribución y las entradas desde cada torneo están conectados a la base transaccional. La migración candidata `supabase/migrations/20261105170244_schedule_sharing_atomic_create.sql` se validó en una base local aislada. La activación sigue pendiente, al igual que la propagación de cambios comunes.

## Panel, distribución y mantenimiento

- El panel incluye filtros persistidos en la URL, paginación, fechas individuales y grupos. Desde cada torneo administrable se puede crear una fecha, compartir una fecha existente o consultar el grupo al que pertenece.
- El asistente permite seleccionar varios clubes, elegir la ronda y copa de cada destino, preparar franjas libres y revisar la creación o adopción de fechas y horarios. La revisión muestra conflictos y permite resolver coincidencias ambiguas o excluir destinos. Un reintento conserva la clave y el contenido confirmados.
- Desde el detalle se pueden incorporar torneos a un grupo existente, completar franjas vigentes que nunca se vincularon y desvincular una copia manteniendo sus datos operativos. Para restaurarla, se elige explícitamente el torneo y la fecha existente. Las franjas pasadas quedan fuera de nuevas aplicaciones.

## Código implementado

En `lib/services/schedule-sharing/`:

- `types.ts`: contratos estrictos de metadatos, franjas, destinos, operaciones y snapshots. El origen es opcional; no se agrega `tenant_id`.
- `validation.ts`: fechas civiles sin conversión a UTC, “hoy” de Argentina, normalización de horas/canchas, capacidad positiva, período, duplicados y solapamientos contra el lote y datos existentes. Las canchas vacías son un mismo recurso. Se admiten rangos contiguos y minutos precisos. `FREE_DATE` e `is_system` quedan fuera del editor.
- `draft.ts`: operaciones puras para agregar, editar, quitar, dividir, mover y copiar días en modos agregar/reemplazar. Conservan capacidad, texto y cobertura al dividir. Reemplazar memoria no autoriza borrar horarios persistidos.
- `permissions.ts` y `scope.ts`: ámbito desde la sesión autenticada para ADMIN, CLUB y ORGANIZADOR. Los organizadores se autorizan por membresía activa en el `organization_id` del torneo, en equivalencia con `checkTournamentPermissions`, sin inferir acceso por una asociación del club. Se conservan los torneos históricos para consultas; se excluyen de nuevas aplicaciones, incluidos los estados `FINISHED_POINTS_PENDING` y `FINISHED_POINTS_CALCULATED`. Lecturas paginadas, sin consultas por torneo.
- `batch.ts`: esquema Zod estricto y planificación pura de una operación. Autoriza todos los recursos antes de devolver nombres, valida ronda/copa por destino y calcula `max(fecha_number) + 1`. Adopta fechas únicamente por selección explícita. Reutiliza horarios equivalentes conservando IDs; ante múltiples equivalentes exige una selección explícita. No sobrescribe diferencias locales ni descarta destinos con conflictos. Informa la transición a `ZONE_PHASE`.
- `differences.ts`: comparación de contenido actual, snapshot aplicado y contenido común. Detecta cambios realizados desde formularios antiguos, diferencia faltantes de bajas voluntarias y conserva horarios adicionales locales. El llamador debe cargar exclusivamente miembros autorizados antes de calcular cobertura.
- `dependencies.ts` y `dependency-reader.ts`: protección basada en todas las respuestas de parejas y en partidos, tanto por `scheduled_time_slot_id` como por programación concreta de la fecha. Los errores de lectura bloquean la escritura. La lectura de partidos está paginada.
- `rpc.ts`: puente tipado hacia la vista previa y la confirmación de Postgres. Valida el borrador y el ámbito autenticado, conserva `operation_key`, verifica la versión del esquema y devuelve la revisión que debe confirmarse. Las acciones en `app/(main)/schedules/actions.ts` invalidan panel, detalle y rutas de cada torneo tras el guardado.
- `reader.ts`: listado paginado con filtros de club, torneo, período, ronda/copa y distribución, incluyendo registros sin período; detalle con copias autorizadas y comparación de snapshots. El listado y el detalle comparten reglas de contenido y no devuelven recursos fuera del ámbito autenticado.

## Persistencia transaccional local

La migración candidata incorpora `schedule_share_groups`, `schedule_share_members`, `schedule_share_items`, `schedule_share_item_targets` y `schedule_share_operations`, con RLS y claves/índices de pertenencia. No agrega identidad de tenant por fila ni modifica IDs de fechas, horarios, parejas o respuestas existentes.

`preview_schedule_batch` y `commit_schedule_batch` son entradas públicas `SECURITY INVOKER`. Las implementaciones privilegiadas están en `schedule_private`, con `search_path` vacío y permisos de ejecución acotados. Esta excepción permite que los clientes **no tengan escrituras directas** sobre vínculos, snapshots o ledger. Las implementaciones comprueban `auth.uid()`, el rol de base, propiedad de club y membresías activas para cada origen/destino, incluso en llamadas directas sin Server Action. No usan service role ni roles de `user_metadata`.

La confirmación bloquea autoridades, torneos, fechas y horarios en orden estable, reconstruye el plan y contrasta su huella con la revisión confirmada. Calcula numeración por torneo dentro de esa transacción, crea todas las copias o revierte todo y registra el resultado con clave única por actor/operación. El mismo reintento devuelve ese resultado, tras revalidar permisos; reutilizar la clave con otro contenido falla. Una segunda operación sobre una revisión vieja pide revisar nuevamente.

La adopción conserva fechas, horarios y respuestas, y exige selección explícita ante equivalentes ambiguos. Los destinos guardan tanto el snapshot físico aplicado como el contenido lógico común aplicado: una cancha cambiada explícitamente para otro club no se confunde con una nueva versión compartida.

La vista `schedule_workspace_entries` usa `security_invoker = true`, combina grupos e individuales sin agrupación por similitud y calcula estados/conteos sobre miembros autorizados. Los grupos siguen disponibles para diagnóstico tras eliminar su última copia administrable; no se recrea esa copia automáticamente.

Los triggers de la candidata protegen cambios físicos y borrados frente a respuestas, programación por referencia o por intervalo, reducción de capacidad con partidos y borrado de fechas que contengan dependencias. Las respuestas y la programación toman bloqueos de sus padres. Las políticas restrictivas de INSERT/UPDATE/DELETE intersectan las políticas existentes para cerrar escrituras de organizadores con membresía inactiva. Políticas de gestión explícitas agregan el acceso de ADMIN que faltaba en los predicados heredados; se conservan las lecturas y disponibilidades de jugadores. Las modificaciones de franjas heredadas pueden recibir un error de serialización/deadlock ante una carrera; se revierte la escritura y debe recargarse antes de reintentar.

La activación está apagada por defecto. Requiere `NEXT_PUBLIC_SCHEDULE_SHARING_ENABLED=true`, `SCHEDULE_SHARING_ENABLED=true`, backend correspondiente al deployment (o local) y versión de esquema compatible. Solo se agregaron valores `false` a los archivos `.example`; no se cambiaron los entornos reales.

Las acciones existentes de `tournaments/[id]/schedules` ahora usan la validación común, conservan la fecha civil y autorizan gestión mediante `checkTournamentPermissions`, incluyendo ADMIN. Crear un horario no permite usar un ID enviado por el navegador para eludir duplicados. Editar conserva cancha y capacidad cuando se omiten; rechaza mover una fila a otra fecha o modificar franjas de sistema. Las ediciones incompatibles y los borrados con respuestas o partidos se rechazan.

`forceDeleteTimeSlot` se mantiene como entrada compatible, pero usa las mismas protecciones y ya no borra respuestas. El diálogo deja de ofrecer esa opción, conserva el mensaje cuando falla una eliminación y explica que los partidos se deben reprogramar. `EditTimeSlotDialog` deja de enviar `max_matches: 1` al editar texto u horas.

## Verificación

- La validación del 6 de noviembre aprobó 117 pruebas del módulo y 63 verificaciones SQL en `schedule_sharing_qa_20261106uiv2`. Las nuevas verificaciones cubren rondas de llaves en borrador, ampliación del grupo, desvinculación con revisión vigente, revinculación con las mismas identidades y compleción de faltantes con datos locales preservados. También pasaron las dos pruebas concurrentes y la escritura atómica de 840 franjas.
- `test/tournament-flow/schedule-sharing.browser.mjs` ejercitó el asistente real en Chrome a 390 y 1280 px. Usó acciones de servidor simuladas para comprobar selección entre clubes, edición por teclado, redimensionamiento con puntero, división, copia entre días y reintento con el mismo contenido. La ejecución requiere Playwright, Chrome y `SCHEDULE_SHARING_QA_CSS` apuntando a CSS del proyecto compilado con Tailwind.
- 138 pruebas aprobadas en 14 suites: diez suites del módulo, además de franjas LONG, política de copas, recomendaciones y disponibilidad del organizador. Se usó `--runTestsByPath` para evitar ejecutar copias del repositorio dentro de `.local/`.
- 54 verificaciones SQL aprobadas con roles reales `authenticated`/`anon`, cubriendo creación, permisos, rollback inyectado en el segundo destino, reintentos, adopción con respuestas, fechas sin franjas/período, programación concreta, rondas/copa, escritura de ADMIN desde el cliente normal y privacidad de listado/conteos.
- Dos sesiones reales de Postgres confirmaron: misma operación simultánea → mismo grupo/una fecha por torneo; distintas operaciones sobre la misma revisión → un guardado y un conflicto de revisión, sin duplicados ni deadlocks en esos escenarios.
- Volumen persistido: 30 torneos × 7 días × 4 franjas = 840 horarios físicos y 30 `FREE_DATE`, en una transacción. Última medición local: vista previa 421 ms y confirmación 884 ms; incluye arranque de Docker/psql y conexión. No es una medición de latencia de producción.
- Advisors de seguridad ejecutados exclusivamente contra la base local aislada: cero hallazgos correspondientes a los objetos nuevos; 84 hallazgos del esquema de referencia heredado quedan fuera de esta entrega.
- Baseline: la suite antigua `utils/__tests__/tournament-permissions.test.ts` ya tenía cinco fallos antes de editar. Sus mocks no contemplan la cadena con `is_active`/`maybeSingle` que usa el helper actual. No se modificó esa suite ni se incluyó entre las 124 pruebas aprobadas.
- `npx tsc --noEmit --incremental false`: 410 errores previos y 410 posteriores; ninguno en los archivos del módulo ni en los archivos de horarios modificados. El chequeo global continúa fallando por el baseline existente.
- `npm run lint`: no puede ejecutarse porque falta ESLint. La versión instalada de Next es 15.5.7 y mantiene `next lint` con aviso de deprecación.
- `npm run build:fv -- --experimental-build-mode compile`: aprobado, con `NEXT_DIST_DIR=.next-schedule-sharing-check` para aislar artefactos. Compiló y recolectó las rutas; este modo no verifica el prerender completo ni sustituye TypeScript/lint. Persisten avisos de Supabase en Edge Runtime. `tsconfig.json` y `next-env.d.ts` no cambiaron por el build.
- `git diff --check`: sin errores de whitespace.
- `npx tsx scripts/benchmark-schedule-sharing.ts`: vista previa pura de 30 torneos × 7 días × 4 franjas, 840 horarios proyectados. Veinte iteraciones medidas después de calentamiento: mediana 14,55 ms, p95 21,18 ms en esta máquina. No mide consultas, transacciones ni guardado. Los límites iniciales de 30 destinos/840 horarios deben validarse con persistencia antes de activar la feature.

El diagnóstico `supabase/diagnostics/schedule-sharing.sql` es exclusivamente de lectura y **no es una migración**. Se ejecutó sobre la base local existente `supabase_db_padel-base-main-test`, sin modificarla. Terminó correctamente; no encontró duplicados exactos, rangos inválidos, capacidades no positivas ni finales a las 24:00 en esa base local.

El esquema local de referencia conserva políticas llamadas `Organizadores can modify tournament_fechas` y `Organizadores can modify tournament_time_slots` que no comprueban `is_active`. La candidata agrega políticas restrictivas que exigen permisos efectivos y membresía activa; no elimina las políticas anteriores. Falta contrastar este cambio con el remoto antes de aprobar la migración.

Comandos locales reproducibles:

```powershell
./scripts/test-schedule-sharing-db.ps1 -DatabaseName schedule_sharing_qa_nombre_nuevo
node supabase/tests/schedule-sharing-concurrency.mjs schedule_sharing_qa_nombre_nuevo
```

El primer comando se niega a reutilizar/resetear una base existente. Clona exclusivamente el esquema local, restaura sus permisos y aplica la candidata sin escribir historial de migraciones. Los fixtures SQL se revierten; el test concurrente elimina únicamente sus IDs sintéticos. Ninguno acepta un destino remoto. La base aislada `schedule_sharing_qa_20261105j` queda disponible para inspección.

La conexión `supabase-fv` está definida en `.mcp.json`, pero no estuvo expuesta como herramienta en esta sesión. No se usó el conector genérico Supabase como sustituto. La inspección local **no confirma** el estado remoto de FV (`bfmaqrythlwbfjuqumom`). El plan requiere ese contraste antes de cerrar la migración final.

## Trabajo siguiente

1. Contrastar el diagnóstico con FV usando exclusivamente la conexión nombrada `supabase-fv`, en lectura. Revisar permisos/RLS y recursos de clubes/torneos.
2. Revisar y aprobar la candidata local a partir de ese contraste. Su despliegue remoto pertenece exclusivamente al CI/CD del propietario.
3. Implementar edición de la plantilla común y propagación selectiva a copias existentes, con revisión de cambios locales y dependencias.
4. Comprobar los tipos locales del módulo contra generación completa cuando se sustituya el fallback global `Database = any`.
5. Verificar el flujo completo con sesiones reales de organizador y jugador, incluyendo carreras con nuevas respuestas y programación. La activación sigue pendiente.

`24:00` permanece deshabilitado para nuevas franjas. Los comparadores pueden interpretar valores históricos, pero consumidores actuales como `formatTime` convierten ese límite a `00:00`. Habilitarlo requiere adaptar y verificar todos los consumidores; no se trunca a `23:59`.

El propietario despliega las futuras migraciones por su CI/CD. No aplicar, ejecutar ni hacer push de migraciones a ningún Supabase remoto desde esta implementación.
