# AMERICANO LIBRE: resultado de fase 4

Fecha: 19 de octubre de 2026. Rama: `codex/americano-libre`.
Worktree: `C:/Users/54116/.codex/worktrees/americano-libre/padel-fv`.

## Alcance

Integración deportiva sobre el generador y el editor existentes. No se creó otro worktree, no se rediseñó Reorganizar ni se ampliaron las rondas. Se conservaron los cambios anteriores de inscripciones, pagos y jugadores sueltos.

- Resultados de un set, modificación y reversión, con sets, historial, estado, avance, referencias de zona y revisión dentro de la misma transacción.
- Procesar y Desprocesar BYE, individual o mediante un lote atómico de pases previstos listos. ENTRY sin participante y WINNER pendiente nunca son BYEs. No se ejecuta recursión legacy ni se deducen pases por contar participantes.
- Avance exclusivamente por `match_hierarchy`, con destino activo WINNER y ocupante anterior coherente. Una entrada directa inactiva su rama; ningún resultado puede ejecutarse sobre esa rama ni reemplazar la entrada manual silenciosamente.
- Reversión y cambio de ganador bloqueados por actividad deportiva posterior. Después de revertir el partido posterior se puede corregir el anterior; el historial se conserva. Los ganadores siguen protegidos frente a Reorganizar.
- Descalificación en un partido activo de llave, avance del rival y reversión mediante el mismo protocolo de resultados. Se persiste evidencia administrativa y se actualizan conjuntamente los indicadores de eliminación, fecha y ronda de las inscripciones. No se fabrican sets ni resultados numéricos por descalificación.
- Canchas, inicio de partido y asignación o retirada de fecha/horario mediante operaciones transaccionales. Se comprueba torneo, ronda y disponibilidad del horario. Se conservan los bloqueos del editor sobre ramas con agenda.
- Cierre transaccional con campeón y finalista reales, zonas y partidos activos terminados. Las ramas inactivas conservan IDs, conexiones y su estado sin jugar.

## Persistencia y acceso

Nueva migración local: `supabase/migrations/20261019221832_americano_libre_sports.sql`, creada con `supabase migration new`. No se reescribió la migración de fase 1.

RPC nuevas, invoker y disponibles sólo para `service_role`:

- `mutate_american_free_sports`: lote tipado de RESULT, CLEAR_RESULT, PROCESS_BYE, UNDO_BYE, DISQUALIFY, COURT y SCHEDULE.
- `finalize_american_free_bracket`: verifica requisitos deportivos dentro del bloqueo y confirma cierre, bonos y revisión.

El orden común es torneo → estado MAIN → partidos por ID → conexiones → seeds. La revisión esperada se compara bajo el bloqueo. Cada lote confirma una sola revisión; una excepción revierte todos sus efectos. `40001` se devuelve como HTTP 409, sin reintentar escrituras.

Las filas de pertenencia, inscripción y descalificación se adquieren después en orden estable con `NOWAIT`. Algunos escritores anteriores de membresía/pagos toman su fila antes del trigger que bloquea el torneo: si esa fila está ocupada, la operación deportiva responde conflicto y pide recargar, evitando esperar en un ciclo de deadlock. Dos pruebas con conexiones independientes mantienen esas filas bloqueadas y comprueban el rechazo sin cambiar la revisión.

La API `american-free-bracket/sports` obtiene el actor con `auth.getUser`, verifica gestión en servidor y valida el payload. La base vuelve a comprobar permisos. No acepta actores, rankings ni posiciones calculadas por el navegador. Las lecturas que componen la vista deportiva comprueban la revisión antes y después.

Se extendieron las protecciones de base a resultados, sets, historial y agenda de zona después de generar la llave, a variantes antiguas de sets cuando esa tabla existe, a reversión/eliminación de descalificaciones y a cambios de fase/campeón que intenten eludir el cierre. Los guards viven en el esquema privado con privilegios limitados.

La proyección conserva la entrada original de una pareja descalificada en un partido terminado, respaldada por evidencia administrativa y derrota real; esa excepción permite editar otras entradas sin eliminar el historial. No habilita una nueva entrada independiente de esa pareja.

## Consumidores e interfaz

En LIBRE se incorporó **Resultados, BYEs y canchas**, con los partidos activos de llave y de zona. Permite cargar/corregir/revertir resultados, procesar/desprocesar pases reales, descalificar, gestionar cancha e inicio y elegir fechas/horarios ya creados. Incluye procesamiento masivo explícito de BYEs previstos habilitados; el lote se valida completo en la base.

Un conflicto conserva el formulario bloqueado y exige **Recargar partidos**. El cierre captura la revisión al abrir su diálogo y también exige recarga explícita si pierde vigencia. No hay reintento automático. Si la operación se confirmó pero falla la recarga de pantalla, se comunica que ya se guardó.

Las tarjetas muestran resultado y ganador o BYE procesado. Se reutilizaron los controles existentes de cierre y revisión de puntos.

Se filtraron ramas inactivas en las lecturas compartidas de partidos, rondas disponibles, hooks de partidos/próximo partido, requisitos de cierre y cálculo de puntos. La consulta deportiva de gestión también las excluye y toda operación sobre una rama inactiva se rechaza en la base.

PG, PP, DG y posiciones de zona se calculan en el servidor con `ZoneStatsCalculator` y `ZoneRankingEngine`, conservando sus desempates. Se entregan como referencias al commit deportivo. La actualización no resuelve placeholders, asigna seeds desde posiciones ni modifica cantidad solicitada, cuadro base o distribución original. Antes de generar la llave siguen disponibles los recorridos de zona existentes.

Los puntos se calculan después del cierre. Una entrada directa no produce un partido terminado, una victoria, un set ni puntos. Los BYEs reales avanzan sin sets ni puntos de partido; los conteos de partidos puntuables exigen ambos participantes. Los bonos identifican campeón y finalista a partir de la final deportiva.

## Auditoría de caminos alternativos

Los escritores anteriores **continúan bloqueados para la llave LIBRE**: `updateMatchResult`, `advanceWinnerUsingHierarchy`, `update-result`, `universal-result`, `process-bye`, `process-bye-strict`, `process-all-byes`, `process-bracket-byes`, `undo-bye`, la descalificación legacy y las escrituras directas de agenda/cancha o generación/reorganización legacy. Las variantes de reversión también están protegidas.

La interfaz de LIBRE usa las operaciones nuevas; no se retiraron guards para hacer funcionar un escritor no transaccional. Las pantallas antiguas que llamen directamente esos endpoints deben usar el control deportivo de LIBRE. Los resolutores de clasificación siguen omitiendo LIBRE como en las fases anteriores. AMERICAN y LONG conservan sus recorridos.

La creación de fechas y franjas horarias sigue en sus pantallas existentes. La asignación deportiva de un partido LIBRE se realiza por el protocolo nuevo. No se incluyeron operaciones ajenas a fase 4, como convertir modalidades, reconstruir una llave jugada o publicar automáticamente partidos.

## Verificación

Todas las mutaciones se ejecutaron en fixtures o en la base aleatoria desechable del runner local. El runner usa únicamente el contenedor fijo `supabase_db_padel-base-main-test`, clona su esquema sin modificar el origen y elimina la base de prueba en `finally`. No acepta una URL remota.

- **234 pruebas Jest, 28 suites**: contratos de LIBRE, editor/generador, API deportiva y permisos, estadísticas y reversión de zona, bonos de campeón/finalista con entrada directa; regresiones de AMERICAN/LONG, generación/clasificación, horarios, inscripciones, comprobantes, pagos y jugadores sueltos cubiertas por las suites seleccionadas.
- **60 comprobaciones pgTAP previas + 66 nuevas de fase 4**. Incluyen resultado/set/historial/avance/revisión, modificación y reversión, ENTRY pendiente frente a pase previsto, evidencia del BYE procesado, actividad posterior y su reversión, ramas inactivas, descalificación y reversión, referencias de zona durante BRACKET_PHASE, cierre con una entrada directa y un partido inactivo sin finalizar, capacidad 29→31 sin victorias ficticias, agenda preservada, permisos y escritores legacy rechazados.
- **Rollback real**: un lote que primero carga un resultado y después falla al desprocesar un BYE inexistente no deja ganador, set ni revisión parcial.
- **Conexiones independientes en Postgres**: resultado/editor en ambos órdenes, resultado/resultado, BYE/editor y desprocesamiento/resultado. El primer escritor confirma; el competidor recibe revisión obsoleta y no escribe. También pasan las carreras previas de generación, membresía y guardado.
- **Navegador, componente real con API simulada**: guardar un set, reabrir y ver resultado/ganador, procesar un pase, reabrir y desprocesarlo. Ante un 409 se bloquean los controles y se exige recarga; los contadores mostraron 4 POST y 3 guardados, sin POST automático adicional. Captura: `docs/verification/americano-libre-fase-4-conflicto.png`.

Reproducción principal: `node scripts/test-americano-libre-local.mjs`. Para Jest, usar el conjunto de regresiones de fase 2, agregando `lib/tournaments/__tests__/finalization.test.ts` y `lib/services/__tests__/long-schedule-slots.test.ts`; el prefijo de pruebas `americano-libre` incluye automáticamente las suites deportivas nuevas.

## Límites reales y continuidad

- La prueba de navegador usa una API simulada. La frontera HTTP y los cálculos se probaron con mocks; la persistencia, permisos y concurrencia se probaron realmente en Postgres local. No se afirma un recorrido autenticado completo navegador → API → Supabase.
- El contenedor disponible usa Postgres 17 y la configuración del repositorio declara 15; no se verificó ejecución remota en esa versión.
- **TypeScript**: 424 diagnósticos globales, el conteo previo documentado. Sin diagnósticos en los archivos nuevos de fase 4 ni en el control de cierre modificado. No se afirma typecheck global limpio.
- **Lint**: `npm run lint` falla porque ESLint no está instalado; también informa la deprecación de `next lint`. No se cambiaron dependencias o configuración para ocultarlo.
- **Build**: compila; falla al recolectar `/api/players/search` con `supabaseUrl is required`, por el entorno ausente del worktree. La configuración previa omite lint y tipos durante build. No se afirma build completo aprobado.
- La página temporal se retiró, el servidor de verificación se detuvo y `tsconfig.json` se restauró. La revisión automática bloqueó la limpieza recursiva de `.next-phase4-ui`; queda como salida generada ignorada por Git.

Fase 4 completada en código y verificación local, con los escritores legacy excluidos del contrato de LIBRE. La fase 5 conserva el recorrido autenticado completo, organizador/vista pública y móvil, configuración FV/Elite con fixtures locales y preparación de entrega. No hubo migraciones o mutaciones remotas, publicación, despliegue ni push. El propietario conserva el despliegue de migraciones por CI/CD.
