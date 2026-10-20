# AMERICANO LIBRE: resultado de fase 1

Fecha: 17 de octubre de 2026. Rama: `codex/americano-libre`.
Worktree: `C:/Users/54116/.codex/worktrees/americano-libre/padel-fv`.

## Alcance completado

- Presets `AMERICAN_MULTI_ZONE_FREE` y `AMERICAN_SINGLE_ZONE_FREE`, ambos sobre AMERICAN, con llave MAIN y asignación manual explícita. La creación ofrece ambos y permite 2 o 3 partidos por pareja en zonas; conserva la excepción de zonas de tres y las reglas de zona única/multizona.
- Constructor y resolvedor conservan la modalidad al serializar y recargar. No recalculan automáticamente cantidad/clasificados para LIBRE. Los presets anteriores no se convierten por recibir un campo manual en el payload.
- Vista pública y ajustes explican asignación manual y posiciones de referencia, sin prometer clasificación automática. LIBRE se selecciona en la creación; en ajustes se muestra su configuración de sólo lectura y no se ofrece convertir otros torneos a esta modalidad.
- Se bloquea la generación por clasificación mediante validación y generador existentes. Los resolutores automáticos omiten asignaciones de LIBRE; el análisis de posiciones sigue disponible. El generador por cantidad se incorpora en fase 2.
- Persistencia transaccional de creación estructural y guardado completo, con revisión, permisos, pertenencia a zona, inscripción habilitada y descalificaciones revalidados en la base.
- No se modificaron las estrategias de inscripción, pagos, aprobación ni jugadores sueltos que venían en el snapshot base. Los guardas de inscripción/membresía sólo impiden invalidar una entrada de LIBRE que ya está asignada.

## Materialización del contrato

Migración: `supabase/migrations/20261017213508_americano_libre_phase_one.sql`, creada mediante `supabase migration new`.

| Entidad | Metadatos y comportamiento |
|---|---|
| `american_free_brackets` | Una fila por torneo, MAIN, contrato v1, revisión, cantidad solicitada, tamaño base, distribución original inmutable, capacidad efectiva y entradas asignadas. |
| `matches` | `bracket_is_active` por defecto true; `free_slot1_origin`/`free_slot2_origin` con ENTRY/WINNER/BYE; `free_bye_processed` por defecto false. Las zonas y formatos actuales conservan sus valores habituales. |
| `match_hierarchy` | Se conservan filas y extremos. La actividad depende de partidos activos y origen WINNER en el destino; no se duplica con un flag independiente. |
| `tournament_couple_seeds` | Un seed técnico por pareja asignada, creado dentro del guardado. Viaja con la pareja y se conserva si queda sin uso. Una entrada vacía no requiere seed. No genera placeholders de zona ni implica clasificación. |
| Contratos de aplicación | `types/americano-libre.ts` define y valida payloads, estado y snapshot canónico mediante Zod. No depende de `Database = any`. |
| Adaptador de persistencia | `lib/services/americano-libre-persistence.ts`: valida payloads antes de la RPC, devuelve snapshot canónico y convierte conflictos 40001 en estado HTTP 409, sin reintento automático. |

RPC disponibles sólo para `service_role`:

- `create_american_free_bracket(tournament_id, actor_id, requested_count, matches, hierarchy)`: recibe una estructura calculada por el futuro generador; valida árbol, rondas, entradas, pases y ausencia de artefactos previos. Persiste todo junto con el cambio de fase. No selecciona participantes.
- `save_american_free_bracket(tournament_id, actor_id, expected_revision, layout)`: recibe todos los casilleros, valida el conjunto y conserva conexiones. Devuelve revisión, capacidad, partidos activos/inactivos y jerarquía del mismo commit.

El servidor que invoque el adaptador debe obtener el actor con `auth.getUser()` y verificar acceso. La RPC vuelve a autorizar ADMIN, dueño del club o ORGANIZADOR activo de la organización correspondiente. Un navegador no puede ejecutar las RPC ni acceder al esquema privado.

## Integridad y concurrencia

El orden de bloqueo es torneo, estado de MAIN, partidos por ID, jerarquía y seeds. La generación bloquea el torneo incluso cuando aún no existe el registro de llave. Un guardado con revisión antigua falla íntegramente.

La actividad se proyecta desde la final por conexiones WINNER. Se examina la rama completa al inactivar: participantes residuales, resultados, `set_matches`, historial y agenda bloquean el cambio. El propio participante trasladado puede retirarse de su origen dentro del lote, conservando IDs. Los movimientos entre rondas verifican el lado exacto de la relación de ancestros; se rechazan ramas no relacionadas.

Las entradas originales pueden estar vacías. Una entrada directa sobre un WINNER original requiere pareja: al quitarla se restaura WINNER y su recorrido. Los ganadores deportivos no se tratan como asignaciones manuales; una pareja que avanzó legítimamente puede aparecer en rondas sucesivas sin contar como doble entrada.

Los guardas de base impiden que endpoints/RPC legacy, cambios de preset, modificaciones de sets/historial o cambios de membresía eludan estas reglas para LIBRE. Los nuevos metadatos tienen lectura pública mediante RLS y escritura reservada al servidor. Las funciones transaccionales usan SECURITY INVOKER; los guardas internos usan SECURITY DEFINER con `search_path` vacío para inspeccionar modalidad/estado pese a la RLS del llamador, y no son ejecutables por clientes.

La fase 1 **no habilita resultados, BYEs, descalificaciones o agendas de LIBRE por los escritores legacy**. Su integración completa debe seguir el mismo bloqueo/revisión/transacción en fase 4. No se debe publicar la funcionalidad completa antes de terminar esas fases.

## Verificación realizada

- 69 pruebas Jest aprobadas en 11 suites: formatos, constructor/resolvedor, fixture de zonas, contratos de persistencia, omisión de clasificación de LIBRE y regresiones de AMERICAN/LONG, generación, placeholders y zona única.
- 60 comprobaciones pgTAP aprobadas: autorizaciones por rol, escritura pública denegada, rollback después de insertar, ausencia de llave parcial, seeds coherentes, duplicados, inscripción pendiente, pareja sin zona, descalificación, conservación de ganadores/resultados, IDs, conexiones y snapshot.
- Cuatro pruebas con sesiones simultáneas aprobadas: doble generación, doble guardado de la misma revisión, retirada de zona frente a asignación y escritor deportivo legacy frente a reorganización. Sólo una generación/edición confirma; no quedan participantes, seeds o resultados parciales.
- Ejemplos verificados en persistencia: 20 entradas en base 32 con 12 pases previstos sin procesar; entrada directa a cuartos con capacidad 29; retroceso al lado elegido de octavos con capacidad 31 y sin victorias ficticias.
- `git diff --check` sin errores y sintaxis del runner Node validada.
- TypeScript comparado con el snapshot base mediante un host virtual del compilador: 424 diagnósticos en cada versión, **ninguno nuevo**. El conteo incluye los tipos generados por Next durante el build; el proyecto ya contiene errores globales que impiden afirmar un typecheck limpio.
- `npm run build`: compilación de producción exitosa; la recolección de páginas falla por `supabaseUrl is required` en `/api/players/search`, porque este worktree no tiene archivos de entorno. La configuración existente omite lint y comprobación de tipos en el build. No se realizó validación visual de navegador.
- `npm run lint`: no se pudo ejecutar porque ESLint no está instalado en las dependencias disponibles. No se cambiaron dependencias ni configuración para ocultar estos límites.

Runner reproducible: `node scripts/test-americano-libre-local.mjs`. Sólo usa el contenedor local fijo `supabase_db_padel-base-main-test`, clona su esquema en una base desechable con nombre aleatorio, aplica la migración allí, ejecuta pgTAP/concurrencia y elimina esa base en `finally`. Nunca acepta URLs remotas. Mantiene intacta la base fuente. El servidor local disponible es Postgres 17; `supabase/config.toml` declara 15. El esquema remoto no fue verificado y no se afirma validación contra esa versión remota.

## Continuidad

Fase 2: construir la distribución convencional por cantidad y conectar el botón Generar al adaptador transaccional existente. Fase 3: ampliar Reorganizar, panel de zonas, cancelación, móvil/teclado y lectura real de conexiones. Fase 4: incorporar resultados, BYEs, horarios, estadísticas y cierre al protocolo común. Fase 5: verificación del torneo completo y navegador para FV/Elite con fixtures locales.

No se desplegó ni ejecutó ninguna migración remota. La migración queda preparada para revisión y CI/CD del propietario. Tampoco se publicó la aplicación.
