# AMERICANO LIBRE: resultado de fase 3

Fecha: 19 de octubre de 2026. Rama: `codex/americano-libre`.
Worktree conservado: `C:/Users/54116/.codex/worktrees/americano-libre/padel-fv`.

## Alcance

Se incorporó la reorganización manual al modo LIBRE de Llaves, sobre la estructura persistente de fase 2 y el guardado transaccional de fase 1. Se conservaron los cambios previos del worktree, las inscripciones, pagos y jugadores sueltos. No se implementó la integración deportiva de fase 4, no se habilitaron escritores legacy para LIBRE y no se publicó ni desplegó.

## Cambios

- **Reorganizar parejas, Guardar y Cancelar:** el editor mantiene un snapshot base con su revisión y un borrador independiente. Arrastrar, seleccionar, mover o quitar una entrada no realiza escrituras. Cancelar recupera la distribución guardada y su capacidad. Guardar envía la distribución completa una sola vez.
- **Panel derecho de zonas:** nombres de ambos jugadores, posición, PG, PP y DG, incluidos quienes todavía tienen estadísticas en cero. La información viene de `zone_positions` y sus relaciones con zonas, parejas y jugadores; no usa seeds para reconstruir las zonas. En móvil, el panel se sitúa antes del cuadro.
- **Habilitación:** se ofrecen como fuentes parejas completas con inscripción aprobada, sin descalificación activa y pertenecientes a una zona del torneo. Se explica si una inscripción está pendiente, la pareja está incompleta o descalificada, o ya se encuentra ubicada. El guardado vuelve a validar estas condiciones en la base.
- **Arrastre y selección:** las parejas disponibles de zona y las entradas manuales activas se pueden arrastrar. También pueden seleccionarse con botones y ubicarse usando teclado o pantalla táctil. Sólo Reorganizar habilita estas acciones; los destinos válidos se resaltan y se muestran las razones de bloqueo.
- **Movimientos:** asignación desde zona, movimiento entre entradas, intercambio explícito al mover una entrada sobre otra ocupada y retirada de una asignación inicial. No se reemplaza una entrada ocupada desde el panel de zonas. No se seleccionan ganadores deportivos como entradas manuales.
- **Entrada directa y retroceso:** al colocar en un WINNER sin actividad previa se inactiva únicamente la rama que alimentaba ese lado. Se revisan todos los descendientes, incluidas parejas, resultados, sets, historial y agenda. Al retroceder, el organizador elige el casillero exacto de una rama compatible; se restaura el recorrido original necesario sin fabricar BYEs ni victorias. Los movimientos entre rondas también se comprueban contra la entrada guardada al iniciar la edición, igual que en la RPC.
- **Capacidad:** se calcula recorriendo desde la final las conexiones WINNER persistidas. Se cuentan entradas activas, cargadas o vacías; las apariciones por avance no duplican el contador de parejas ubicadas. Se conservan cantidad solicitada, cuadro base y distribución original.
- **Árbol:** las tarjetas y líneas se dibujan desde `match_hierarchy`. Las ramas inactivas siguen presentes, con sus IDs y conexiones originales, estilo discontinuo y rótulo de inactividad. Sus posiciones no se renumeran al cambiar la actividad. ENTRY pendiente, BYE previsto y WINNER siguen diferenciados.
- **Guardado seguro:** `PATCH /api/tournaments/[id]/american-free-bracket` obtiene el actor desde la sesión, verifica gestión y valida un payload estricto con revisión y layout. Usa exclusivamente `saveFreeBracket` / `save_american_free_bracket`; no usa el endpoint legacy de éxito parcial ni una RPC por arrastre. La base confirma participantes, seeds técnicos, orígenes, actividad, capacidad y revisión en una transacción.
- **Concurrencia:** un 409 conserva el borrador para inspección, bloquea su aplicación y ofrece **Recargar y descartar borrador**. No hay reintento automático contra una revisión diferente. La lectura GET comprueba nuevamente la revisión después de reunir partidos, conexiones y referencias; si cambió durante la carga, rechaza el snapshot mezclado.
- **Vista pública:** comparte el árbol y los nombres legibles, sin controles de edición, arrastre ni panel de fuentes. La modalidad se mantiene separada de los escritores y reglas existentes de AMERICAN y LONG.

Archivos principales: `components/tournament/american-free-bracket-editor.tsx`, `lib/services/americano-libre-editor.ts`, `lib/services/americano-libre-editor-read.ts`, `types/americano-libre-editor.ts` y la ruta `american-free-bracket`. El componente de fase 2 delega la vista generada en este editor específico de LIBRE, conservando el flujo de generación.

## Verificación

- **192 pruebas Jest aprobadas en 24 suites.** Incluyen motor del borrador, fuentes de zona y estadísticas nulas, permisos HTTP de PATCH, actor no falsificable, payload estricto, revisión obsoleta, lectura concurrente y regresiones de fases 1/2, AMERICAN/LONG, inscripciones, emparejamiento atómico y jugadores sueltos.
- Casos del motor: entrada pendiente sin avance, asignación, intercambio, duplicados, fuentes no habilitadas, BYE no asignable, destinos inactivos, nieto con participante/agenda/actividad, lado rival conservado, partidos jugados y ganadores protegidos, movimientos fuera del lado exacto y compatibilidad respecto del snapshot base.
- **60 comprobaciones pgTAP aprobadas** y las carreras locales de generación, revisión, membresía y escritor deportivo legacy de las fases anteriores.
- `node scripts/test-americano-libre-local.mjs` se extendió para usar el **motor TypeScript real de fase 3** sobre snapshots reales de la base desechable. Se preparan varias operaciones sin escribir, se guarda el lote y se verifican capacidad **29**, retroceso al lado 2 de octavos con capacidad **31**, retirada con capacidad **32**, intercambio, revisión, seeds y recarga. Se conservan todos los IDs, conexiones y slots originales. Un lote con una pareja sin zona falla después de intentar crear su seed y revierte todo: misma revisión, participantes, capacidad y cantidad de seeds que antes del intento.
- El runner sigue usando únicamente el contenedor local fijo `supabase_db_padel-base-main-test`, clonando su esquema en una base aleatoria y eliminándola en `finally`. No acepta URLs remotas y no modifica el esquema fuente.
- **Navegador con API simulada, componente real:** teclado para asignar, Cancelar sin incrementar el contador de guardados, entrada directa a cuartos con capacidad 29, Guardar explícito, recarga, retroceso elegido a octavos con capacidad 31, conflicto 409 sin reintento y recarga explícita. Se verificó arrastre nativo desde zona a una entrada y que no guarde automáticamente. Se corrigió el desplazamiento de destinos causado por la aparición de mensajes al comenzar un arrastre.
- **Público y móvil:** sin botón Reorganizar ni panel de fuentes en la vista pública. En viewport 390 × 844 se verificaron panel de zonas, selección por teclado, destino, capacidad y cancelación. El cuadro tiene desplazamiento propio y foco de teclado; no necesita comprimir las tarjetas hasta volverlas ilegibles.
- Se retiró la página temporal de verificación, se detuvo el servidor y se restauró la modificación automática de `tsconfig.json` causada por el directorio temporal de Next.

Para reproducir: el comando de regresiones documentado en fase 2 incluye automáticamente los nuevos tests `americano-libre-editor.test.ts` y `americano-libre-editor-read.test.ts`. Después ejecutar `node scripts/test-americano-libre-local.mjs`.

## Límites reales del entorno

- La prueba visual no fue un recorrido autenticado de navegador a la API real y Supabase. La persistencia, permisos y concurrencia reales se verificaron separadamente en Postgres local; la frontera HTTP y las consultas auxiliares se probaron mediante mocks. Los FK usados por las lecturas auxiliares se revisaron en el esquema local. No se afirma validación de un entorno remoto.
- El contenedor local usa Postgres 17; `supabase/config.toml` declara 15. No se probó la ejecución sobre esa versión remota.
- **TypeScript:** la ejecución final, después de retirar la página y los tipos temporales de verificación, reporta **424 diagnósticos globales**, el mismo conteo documentado en fase 2. No aparecen diagnósticos en los archivos nuevos o modificados para fase 3. No se afirma un typecheck global limpio ni una comparación exhaustiva de todos los diagnósticos contra fase 2.
- **Lint:** `npm run lint` no puede ejecutarse porque falta ESLint. También informa la deprecación de `next lint`. No se alteraron dependencias ni configuración para ocultarlo.
- **Build:** `npm run build` compiló correctamente en 40 segundos, pero falló al recolectar `/api/players/search` con `supabaseUrl is required`, por falta del entorno de aplicación. La configuración existente omite lint y validación de tipos durante build. No se afirma build completo aprobado.
- `git diff --check` terminó sin errores de whitespace. Los avisos de conversión LF/CRLF de Git no son errores de aplicación.

## Continuidad

No hizo falta otra migración y no se reescribió la de fase 1. No hubo migraciones ni mutaciones remotas. El despliegue de migraciones sigue a cargo del propietario.

La fase 4 debe conectar resultados, avance de ganadores, Procesar/Desprocesar BYE, agendas, estadísticas y cierre al mismo protocolo de bloqueo/revisión/transacción. Hasta entonces esos escritores legacy siguen bloqueados para LIBRE. El motor de fase 3 sólo modifica entradas iniciales y actividad estructural; no finaliza partidos ni crea resultados. La fase 5 conserva la verificación completa autenticada, FV/Elite con fixtures locales y el recorrido deportivo completo.
