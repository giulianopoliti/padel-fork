# AMERICANO LIBRE: contrato técnico de fase 0

Fecha: 17 de octubre de 2026. Alcance: contrato previo a implementación y migraciones.
Referencia funcional: [plan-americano-libre.md](plan-americano-libre.md).

Continuación: [resultado de fase 1](resultado-americano-libre-fase-1.md), con nombres definitivos de metadatos y persistencia local verificada. El esquema acumulado usa `set_matches`: `match_sets` fue migrada y eliminada en septiembre de 2025.

## Base de trabajo y evidencia

- Worktree: `C:/Users/54116/.codex/worktrees/americano-libre/padel-fv`.
- Rama: `codex/americano-libre`. Base: snapshot local `af7a5b0f9caf45929d262a74319b85c2ddf0faa3`, hijo de `00b3c109fba526d91a49aed75da295b6bfcd9d63`.
- El snapshot incorpora los cambios existentes de inscripciones, pagos y jugadores sueltos. No modifica el índice ni el checkout original y no se publica.
- Se revisaron fuentes y migraciones locales; `database.types.ts` sigue siendo `Database = any`. No se inspeccionó ni modificó un esquema remoto. Los nombres de metadatos de este contrato son lógicos: el DDL y sus permisos se verifican en fase 1.
- Tenant de referencia: FV (`bfmaqrythlwbfjuqumom`). No hay conexión MCP específica de FV expuesta en esta sesión; no se utiliza el conector Supabase genérico. Las migraciones se prepararán y validarán localmente; su despliegue remoto corresponde al propietario.

## Inventario de integración

Las rutas indicadas son relativas a la raíz del repositorio. La columna final es trabajo posterior requerido, no comportamiento ya implementado.

| Recorrido | Fuentes revisadas | Integración requerida para LIBRE |
|---|---|---|
| Formato y creación | `types/tournament-format-v2.ts`, `config/tournament-format-presets.ts`, `lib/services/tournament-format-{config-builder,resolver,policy}.ts`, `components/tournaments/tournament-create-form.tsx` | Modalidad explícita sobre AMERICAN; zona única/multizona y llave MAIN. No reutilizar una estrategia de clasificación como indicador de LIBRE. |
| Validación, generación y persistencia | `lib/services/bracket-generation-{validation,orchestrator,persistence,rollback}.ts`, `lib/services/bracket-generator-v2.ts`, `components/tournament/bracket-generation-section.tsx` | Omitir clasificación y requisitos de fixture sólo en LIBRE. Generar estructura vacía y cambiar fase en una transacción. La persistencia actual hace varias solicitudes y el rollback compensatorio no garantiza atomicidad. |
| Esquema y seeds | `supabase/migrations/20250903221213_remote_schema.sql`, `20260105000001_add_unique_constraint_tournament_couple_seeds.sql`, `20260501001000_add_multi_bracket_key_support.sql`, `20260724000000_preserve_draft_status_in_bracket_resolution.sql` | Verificar constraints acumuladas, nulabilidad, RLS y funciones locales antes del DDL. Los FK nulos no describen el origen de un casillero. No usar resolución por FK como operación manual genérica. |
| Edición y guardado | `components/tournament/bracket-v2/{context/bracket-drag-context.tsx,hooks/useBracketDragOperations.ts,types/bracket-drag-types.ts}`, `app/api/tournaments/[id]/enhanced-bracket-operations/route.ts` | Conservar borrador, Guardar y Cancelar. Añadir fuentes de zona y revisión del estado. El endpoint actual procesa individualmente y responde 207 ante éxito parcial; no sirve para el lote de LIBRE. |
| RPC de movimientos | Migraciones `20250917160001_update_swap_bracket_positions_atomic.sql`, `20251029000001_fix_couple_to_empty_swap_seed_update.sql`, `20260710000400_swap_manual_bracket_replacement_cross_cup.sql` | Conservar restricciones de otros formatos. No reutilizar cambios de conexiones ni reemplazos de participantes para simular una entrada directa. |
| Lectura y dibujo | `app/api/tournaments/actions.ts` (`getMatchesByTournamentId`), endpoints `matches`, `seeds`, `match-hierarchy`; `bracket-v2/hooks/{useBracketData,useBracketTreeLayout}.ts`, `bracket-v2/utils/format-adapters.ts`, `bracket-v2/components/{ImprovedBracketRenderer,GranularMatchCard}.tsx` | Transportar orígenes, actividad y conexiones persistidas. Las zonas del panel deben provenir de zonas/posiciones, no de seeds. El layout actual usa relaciones inferidas por índice. Conservar privacidad y visibilidad DRAFT. |
| Resultados y ganadores | `app/api/tournaments/actions.ts` (`advanceWinnerUsingHierarchy` y helpers legacy), endpoints `matches/[matchId]/{universal-result,update-result}`; `utils/bracket-generator-core.ts` | Para LIBRE, resultado y avance deben compartir transacción, revisión y conexiones activas. Impedir que caminos alternativos vuelvan a deducir un BYE de la ausencia de rival. |
| BYEs y reversión | Endpoints `matches/[matchId]/{process-bye,process-bye-strict}`, `process-all-byes`, `undo-bye/{route,actions}.ts`; `bracket-generator-v2.ts` | Exigir pase previsto y evidencia del procesamiento. Adaptar hijos activos, cascadas y reversión con las mismas garantías transaccionales. Hoy existen escrituras de resultado y avance separadas. |
| Posiciones y clasificación automática | `app/api/tournaments/[id]/actions.ts`, `lib/services/{bracket-zone-progression.service,bracket-placeholder-resolver,incremental-placeholder-updater,incremental-bracket-updater}.ts`, `lib/services/zone-position/{tournament-zone-dispatcher,atomic-position-persistence}.ts` | Seguir calculando posiciones; cortar resolución, regeneración y avances desde zonas en todos los puntos de entrada de LIBRE, también durante BRACKET_PHASE. |
| Horarios y canchas | `app/(main)/tournaments/[id]/{schedules,schedule-management}/actions.ts`, endpoints `matches/[matchId]/{assign-court,court}`, `hooks/use-tournament-matches.ts` | Excluir inactivos de pendientes/agendas y rechazar escrituras directas sobre ellos. No eliminar asignaciones de horario silenciosamente al inactivar. |
| Cierre, estadísticas y puntos | `lib/tournaments/finalization.ts`, `lib/services/points/services/{points.calculator,points.application}.service.ts`, `lib/services/points/calculators/match-points.calculator.ts`, acciones de partidos | Inactivos fuera de conteos; zonas activas siguen siendo obligatorias. Entrada directa no genera resultado, PG ni puntos. Conservar reglas actuales de un BYE real. |
| Permisos y caminos alternativos | `utils/tournament-permissions.ts`, endpoint `couples/[coupleId]/disqualify`, RPC y políticas del esquema local | Revalidar gestión del torneo en servidor y persistencia. Auditar descalificaciones, publicación, regeneración y endpoints legacy para que no salteen el protocolo LIBRE. No alterar políticas de otras modalidades. |

## Modelo e invariantes

Se conserva `matches` como entidad deportiva, `match_hierarchy` como topología y `tournament_couple_seeds` como referencia técnica de participantes. No se crea otro árbol de partidos. La modalidad selecciona explícitamente este contrato; los formatos existentes conservan sus reglas.

Metadatos mínimos y ubicación propuesta para la fase 1:

| Nivel | Datos lógicos | Autoridad e invariantes |
|---|---|---|
| Llave MAIN | versión del contrato, revisión monotónica, cantidad solicitada, tamaño base y distribución original por `(match_id, slot)` | Registro de estado de la llave, con unicidad por torneo/llave. La distribución original y sus IDs son inmutables después de generar. Nunca reconstruirla desde resultados o inscripciones actuales. |
| Casillero | origen actual `ENTRY`, `WINNER` o `BYE`; pareja y seed técnico cuando correspondan | Metadatos asociados a los dos casilleros de `matches`; el vínculo del origen WINNER es el hijo persistido que apunta al mismo `parent_slot`. ENTRY puede estar vacío. BYE no admite pareja. |
| Partido | actividad estructural y evidencia de BYE procesado | Actividad en `matches`, separada de `status`, por defecto activa para formatos actuales. La evidencia identifica el procesamiento real y su ganador; no se infiere de un resultado FINISHED con un solo participante. |
| Conexión | hijo, padre y slot existentes | Sus IDs y extremos no se modifican en una reorganización. La conexión está activa sólo si sus partidos están activos y el destino conserva origen WINNER. No hace falta persistir otro flag de actividad independiente. |

La actividad se calcula recorriendo desde la final por los orígenes WINNER actuales y se guarda como proyección para filtrar consultas de partidos. La misma transacción comprueba que proyección, topología y orígenes coincidan. Un origen ENTRY sustituye únicamente la rama que alimentaba ese lado. Las ramas inaccesibles se conservan completas y sin actividad deportiva nueva.

Estados visibles derivados:

| Estado | Representación | Consecuencia |
|---|---|---|
| Entrada pendiente | ENTRY sin pareja | Cuenta en capacidad; espera asignación, aunque el otro lado tenga pareja. |
| Entrada asignada/directa | ENTRY con pareja | Inicio independiente de su recorrido; es directa si su origen original era WINNER. No crea victorias. |
| Espera de ganador | WINNER con conexión activa | Reservado a esa rama; puede mostrar su ganador cuando exista, sin cambiar de origen. |
| Pase libre previsto | BYE explícito en la distribución | No cuenta como entrada. Sólo el rival asignado y habilitado permite procesar ese pase. |
| BYE procesado | Evidencia explícita más resultado/avance coherentes | Sólo esta evidencia permite Desprocesar BYE, sujeto a restricciones del recorrido posterior. |
| Rama inactiva | Partido fuera del recorrido activo | No es FINISHED ni un BYE ganado. No se programa, juega, puntúa ni cuenta como pendiente. |

Reglas adicionales:

1. Topología válida: una final MAIN, sin ciclos, hijos ni destinos duplicados; todos los IDs pertenecen al mismo torneo/llave y `parent_slot` es 1 o 2. Nunca reconstruir por el orden de tarjetas filtradas.
2. Capacidad efectiva = cantidad de orígenes ENTRY de partidos activos, cargados o vacíos. Parejas ubicadas = entradas activas asignadas; no contar apariciones posteriores por avance. Cantidad solicitada y tamaño base no cambian al editar.
3. Una pareja tiene como máximo una entrada independiente activa. Puede aparecer en varias rondas mediante victorias. Pareja y FK de seed viajan juntos; su ranking o `bracket_position` no decide la ruta. Nunca generar labels 1A/2B ni resoluciones de posición para LIBRE.
4. Los seeds de LIBRE son técnicos y no se marcan como placeholders de clasificación. El adaptador de fase 1 debe definir su asignación y sincronización sin alterar constraints de otros formatos; la falta de seed o pareja nunca significa BYE.
5. Para sustituir WINNER por ENTRY, inspeccionar **todos** los descendientes originales de ese lado. Bloquean parejas asignadas, ganadores, resultados, sets, inicio de juego y evidencia/historial deportivo, aunque el hijo inmediato esté vacío. Una rama inactiva no autoriza ignorar datos residuales.
6. Al mover la propia entrada desde un descendiente compatible, retirar sólo su asignación en el borrador antes de evaluar la rama; cualquier otra pareja o actividad sigue bloqueando. No limpiar historial, resultados ni avances para satisfacer la validación.
7. Un partido IN_PROGRESS/FINISHED, sus participantes y los casilleros que sostienen su historial no se reorganizan. Un ganador en un casillero WINNER no es una entrada manual que pueda arrastrarse.
8. Una rama con horarios/cancha asignados no se inactiva silenciosamente: comunicar el bloqueo y exigir su gestión con las acciones vigentes. Esto evita introducir una operación implícita de borrado de agenda.

## Operaciones del borrador

Cada origen/destino usa `(matchId, slot: 1 | 2)`. Un origen de zona incluye `zoneId` y `coupleId`; sus nombres, posición y estadísticas son sólo presentación. El servidor obtiene pertenencia y habilitación vigentes, incluidas descalificaciones. No cuenta jugadores sueltos ni crea una pareja desde el editor.

| Operación | Efecto en el borrador | Restricciones |
|---|---|---|
| Asignar desde zona | ENTRY vacío recibe pareja; WINNER puede convertirse en entrada directa al inactivar su rama vacía | Pareja de zona del torneo, sin otra entrada activa. Destino no jugado. No reemplazar rival ocupado implícitamente. |
| Mover entrada | Trasladar pareja/seed y dejar vacío el origen ENTRY; si era directa, restaurar allí el origen original y reactivar su recorrido | Entre rondas, origen y destino deben estar relacionados por la topología original y por el lado exacto. En la misma ronda se conservan los movimientos entre entradas admitidos por el editor. |
| Intercambiar | Intercambio de dos asignaciones iniciales y sus seeds | Validar ambas direcciones y sus ramas. No intercambiar un ganador deportivo ni introducir intercambio entre copas. |
| Quitar asignación | ENTRY original queda vacío; una entrada directa vuelve a su origen original WINNER | Sin actividad deportiva dependiente; restaurar rama y recalcular capacidad. La pareja vuelve a estar disponible en zonas. |
| Retroceder una directa | Restaurar origen WINNER y colocar la misma entrada en el descendiente exacto elegido | Reabrir el recorrido necesario conservando IDs; no elegir slot automáticamente ni usar Desprocesar BYE. |
| Cancelar | Descartar todas las operaciones y recuperar estado/revisión guardados | Ninguna escritura. Las tarjetas y capacidad vuelven al estado persistido. |

Las operaciones se simulan en orden sobre el mismo borrador: un segundo movimiento ve el primero. Tras cada operación deben cumplirse invariantes; dos entradas pueden intercambiarse con una operación de intercambio explícita. El guardado valida de nuevo el lote completo sobre el snapshot bloqueado y comprueba su estado final. Ante cualquier fallo se revierte todo; no hay respuesta de éxito parcial. Una validación del navegador nunca sustituye la del servidor.

## Atomicidad, concurrencia y permisos

La generación y cada guardado son una única llamada transaccional de persistencia. No reutilizar la secuencia de solicitudes de `savePlaceholderBracketToDatabase` ni ejecutar una RPC independiente por arrastre.

Protocolo común de todos los escritores de LIBRE (incluidos resultado, BYE, reversión, descalificación y acciones alternativas):

1. Resolver usuario autenticado y permiso vigente de gestión del torneo; validar contrato, modalidad y payload. La persistencia no confía en un `userId`, capacidad, actividad o pertenencia enviados por el navegador.
2. Bloquear primero la fila del torneo, después estado de MAIN, partidos por ID, conexiones y seeds en orden consistente. La fila del torneo serializa también dos generaciones iniciales cuando todavía no existe el estado de llave.
3. Comparar revisión esperada y estado/fase dentro del bloqueo; leer participantes, membresía de zonas y actividad/historial vigente. Las operaciones que cambien habilitación o pertenencia deben participar del mismo protocolo para evitar una asignación concurrente inválida.
4. Aplicar y validar el conjunto en memoria/transacción; persistir parejas, seeds, orígenes, proyección de actividad y capacidad coherentes. Conservar conexiones. Generar estructura y `BRACKET_PHASE` sólo en el mismo commit.
5. Incrementar revisión una vez y devolver snapshot canónico. Un conflicto devuelve 409 y solicita recargar; no reintentar movimientos automáticamente contra un estado distinto. Una excepción de persistencia revierte el lote.

La revisión aumenta también por un resultado o BYE que afecte la llave, no sólo por Reorganizar. No basta con añadir locks al editor: resultado y avance separados dejan una carrera. La fase 1 debe establecer la frontera transaccional; la fase 4 debe incorporar todos los escritores antes de habilitar LIBRE para uso completo.

El esquema local contiene políticas permisivas y RPC antiguas con parámetros de usuario: no copiarlas como autorización. La fase 1 debe verificar restricciones efectivas y cerrar escrituras directas/legacy para LIBRE, manteniendo lectura pública vigente y sin ampliar accesos de otras modalidades. Nuevos registros expuestos requieren RLS, permisos explícitos y pruebas por rol; las funciones requieren grants limitados y autorización propia. Elegir privilegios de ejecución según las políticas locales verificadas, sin añadir SECURITY DEFINER para eludirlas.

## Ejemplos que fija el contrato

| Escenario y casillero | Resultado y capacidad |
|---|---|
| 24 inscriptas, selector 20 | Base 32; 20 ENTRY vacíos y 12 BYE previstos. Cuatro partidos de dieciseisavos tienen dos ENTRY (8 entradas) y doce tienen ENTRY + BYE (12 entradas con pase a octavos). Nadie avanza hasta ser asignado y procesar el pase real. |
| Base 32 completa, lado 1 de un cuarto recibe entrada directa | Su hijo de octavos y dos nietos de dieciseisavos quedan inactivos; el lado 2 conserva su recorrido. Se sustituyen 4 entradas por 1: capacidad 29, independientemente de cuántas parejas se hayan cargado. |
| Esa directa vuelve al lado elegido de su octavo | El cuarto vuelve a WINNER, se reactiva el octavo y su rama hermana; el slot exacto de octavos pasa a ENTRY. Su rama propia de dos entradas sigue inactiva. Capacidad 31 si el resto de la base 32 no cambió. No se fabrica una cadena de BYEs. |
| Hijo vacío, nieto con pareja o resultado | La entrada directa se rechaza, aunque el hijo todavía no tenga ganador. |
| Dos ENTRY, uno asignado | Partido incompleto: no hay pase libre y no se procesa BYE. |
| Resultado de zona tras generar | Cambian PG/PP/DG y posiciones. No cambian entradas, seeds manuales, cantidad solicitada ni distribución. |
| Dos editores con revisión R | El primero confirma R+1; el segundo recibe conflicto y no escribe. Lo mismo ante resultado/BYE concurrente. |

## Verificación y siguiente fase

Entrega de fase 0: inventario local, modelo, invariantes, operaciones, ejemplos y protocolo de persistencia. Se verificaron rutas de archivos y limpieza del diff. No hay código funcional ni migraciones nuevos en esta fase; no corresponde afirmar que LIBRE esté implementado ni disponible en producción.

Antes de dar por terminada fase 1: materializar y probar el DDL local acumulado, los contratos TypeScript explícitos, permisos y rollback/concurrencia de persistencia. La ausencia de esquema remoto verificado es una limitación de evidencia; no habilita cambiar de proyecto.

Las pruebas de fases siguientes deben cubrir cuadros 16/20/24/32, asignación pendiente frente a BYE, actividad en nietos, lado rival conservado, IDs tras retroceso, doble entrada frente a avance legítimo, fallos intermedios, carreras con resultados/BYEs, y regresión de AMERICAN/LONG. El máximo sigue limitado por las rondas soportadas actualmente; no ampliarlo para acomodar LIBRE.
