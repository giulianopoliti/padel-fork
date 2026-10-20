# AMERICANO LIBRE: resultado de fase 2

Fecha: 19 de octubre de 2026. Rama: `codex/americano-libre`.
Worktree existente: `C:/Users/54116/.codex/worktrees/americano-libre/padel-fv`.

## Alcance completado

Generación de estructura por cantidad, para LIBRE multizona y zona única, utilizando el contrato y la persistencia transaccional de fase 1. Se conservaron los cambios existentes del worktree. No se creó otro worktree, no se publicó ni desplegó y todas las mutaciones de verificación fueron locales.

- En Llaves, el organizador dispone de **Cantidad de entradas** y **Generar llave**. El valor propuesto cuenta parejas distintas con inscripción aprobada (`is_pending=false` o nulo, igual que el contrato de persistencia), sin descalificación competitiva activa. Excluye `couple_id` nulo, inscripciones pendientes y jugadores sueltos. No exige que el número elegido coincida con el total ni con las posiciones de zona.
- El selector permite enteros de 2 a 64. Si la sugerencia queda fuera del rango, hay que editarla antes de generar. Se mantienen las seis rondas soportadas, desde `32VOS` hasta `FINAL`.
- Se extrajo `buildBracketSeeding` a `lib/services/bracket-structure.ts`, conservando el orden serpentino y su uso por el generador existente. `americano-libre-generator.ts` construye únicamente partidos vacíos y conexiones a partir de esa distribución, con UUID nuevos.
- La primera ronda contiene `ENTRY` pendientes y `BYE` previstos; las posteriores tienen `WINNER` con conexión persistida. No se crean seeds, parejas asignadas ni placeholders 1A/2B. No se procesa ningún pase ni se inventan ganadores.
- `POST /api/tournaments/[id]/american-free-bracket` valida sesión, permiso de gestión y un payload estricto que sólo admite `requestedCount`. El actor proviene de `auth.getUser()`. El servicio conserva modalidad, fase y bloqueo por indicadores/artefactos de llave existentes, sin borrar ni reemplazar esos artefactos.
- La creación usa exclusivamente el adaptador `createFreeBracket` y `create_american_free_bracket`. La RPC revalida permisos, zonas, fase y artefactos bajo bloqueo. Estructura y transición a `BRACKET_PHASE` se confirman juntas. Un cambio concurrente de fase se presenta como conflicto HTTP 409 y pide recargar; no se reintenta la generación automáticamente.
- Se puede generar en `ZONE_PHASE` con zonas existentes aunque no haya partidos de zona creados o resultados. No se llama a sincronización de fixture, clasificación, análisis definitivo ni procesamiento de BYEs en este recorrido.
- `GET` recupera los metadatos, partidos y conexiones guardados y valida el snapshot con el contrato Zod de fase 1. Los datos de llave se leen con el cliente sujeto a RLS; las inscripciones sólo se cuentan para quien tiene permiso de gestión y antes de existir la llave.
- La vista específica de esta fase muestra cantidad solicitada, cuadro base, capacidad efectiva y parejas ubicadas, además de los tres estados de casillero. Las referencias a ganadores usan `match_hierarchy`, no posiciones de zonas. La vista se integra tanto en la ruta Llaves como en el tab del torneo, para organizadores y público.
- Para LIBRE no se monta el editor ni los controles deportivos legacy. Sus guardas de base siguen vigentes. Los recorridos anteriores de AMERICAN y LONG se mantienen.

## Casos obligatorios

| Selector | Base | Partidos iniciales con dos ENTRY | Partidos iniciales con ENTRY + BYE | Entradas vacías | Parejas ubicadas |
|---|---|---|---|---|---|
| 16 | 16 | 8 | 0 | 16 | 0 |
| 20 | 32 | 4 | 12 | 20 | 0 |
| 24 | 32 | 8 | 8 | 24 | 0 |
| 32 | 32 | 16 | 0 | 32 | 0 |

Cada caso se persistió en una base local desechable con 24 parejas aprobadas y un jugador suelto, sin fixture ni resultados de zonas. En el caso 20 se verificaron 31 partidos, 30 conexiones, cuatro dieciseisavos con dos entradas y doce con un pase previsto. Todos permanecen sin participantes, seeds, ganadores o BYEs procesados. El estado deportivo persistido es el enum existente `WAITING_OPONENT`.

Una sesión nueva recupera el mismo snapshot después de agregar otra inscripción y actualizar posición, PG y DG de zona. La distribución original, cantidad, capacidad e identificadores no se recalculan.

## Pruebas ejecutadas

- **176 pruebas Jest aprobadas en 22 suites.** Incluyen los tests nuevos `americano-libre-generation.test.ts` y `americano-libre-route.test.ts`: tamaños obligatorios, árbol conectado para todas las cantidades de 2 a 64, límites, zona única/multizona, generación sin consultar fixture/resultados, permisos HTTP, actor no falsificable, payload estricto, conflictos y recarga sin volver a contar inscripciones.
- Regresiones: configuración/resolvedor, política de formato, generador AMERICAN/LONG, placeholders, precondiciones de generación, orquestador de zona única, claves de copas, fixture americano de zona única, inscripciones, emparejamiento atómico, comprobantes y jugadores sueltos.
- **60 comprobaciones pgTAP aprobadas**, conservando las de fase 1: permisos por rol, escritura pública denegada, autorización dentro de RPC, rollback, coherencia de seeds, restricciones deportivas y guardas legacy.
- `node scripts/test-americano-libre-local.mjs`: extendido para pasar los payloads del generador TypeScript real a la RPC en los cuatro tamaños. Un payload con jerarquía incompleta falla después de insertar y revierte partidos, estado de llave y transición. Dos generaciones concurrentes reales de 20 y 24 confirman únicamente la primera estructura completa. Se conservan las cuatro carreras de fase 1: doble generación, revisión obsoleta, retirada de zona frente a asignación y escritor deportivo legacy frente a guardado.
- El runner usa exclusivamente `supabase_db_padel-base-main-test`, clona el esquema en una base aleatoria, aplica allí la migración existente y elimina esa base en `finally`. No acepta URLs remotas y no aplica migraciones ni modifica los datos del esquema fuente. Las fixtures mínimas de SQL verifican el contrato de base; las de Jest usan el preset completo de la aplicación.
- Navegador: componente real servido con Next.js en localhost mediante una página temporal y API simulada, identificada expresamente como tal. Se comprobó sugerencia 24, edición a 20, bloqueo de 65, generación, indicadores **20 / 32 / 20 / 0**, 20 etiquetas de entrada pendiente, 12 pases previstos, conexiones de ganador y desaparición del botón de generación. Se comprobó recarga visual y viewport móvil de 390 × 844, con indicadores en dos columnas y desplazamiento horizontal del cuadro accesible por teclado. Se retiró la página temporal y se detuvo el servidor.
- `git diff --check` sin errores de whitespace. La revisión React incluyó hooks, persistencia del selector, permisos visibles, etiquetas, foco, estados de carga/error y desplazamiento móvil.

Comando de regresiones utilizado:

```powershell
node node_modules/jest/bin/jest.js --runInBand --silent lib/services/__tests__/americano-libre lib/services/__tests__/bracket-generator-v2.test.ts lib/services/__tests__/bracket-generation lib/services/__tests__/tournament-format-v2.test.ts lib/services/__tests__/tournament-format-policy.test.ts lib/services/__tests__/zones-format-utils.test.ts lib/services/__tests__/bracket-placeholder-resolver.test.ts lib/services/__tests__/bracket-key-policy.test.ts lib/services/tournaments/__tests__/american-single-zone.test.ts lib/solo-players/__tests__ lib/services/registration/__tests__ lib/tournaments/__tests__/inscription-proof.test.ts lib/tournaments/__tests__/player-inscription-copy.test.ts
node scripts/test-americano-libre-local.mjs
```

## Limitaciones verificadas

- **TypeScript:** `tsc --noEmit --pretty false` reporta 424 diagnósticos globales, el mismo conteo documentado en fase 1. No aparecen diagnósticos en los archivos nuevos ni en las integraciones de interfaz modificadas para fase 2. Esto no es un typecheck global limpio ni una comparación exhaustiva de todos los diagnósticos contra una reconstrucción de fase 1.
- **Lint:** `npm run lint` no puede ejecutarse porque ESLint no está instalado; además Next informa la deprecación de `next lint`. No se modificaron dependencias ni configuración para ocultarlo.
- **Build:** `npm run build` compiló correctamente, pero falla al recolectar datos de `/api/players/search` con `supabaseUrl is required`, porque el worktree no dispone de entorno de aplicación. La configuración existente omite comprobación de tipos y lint durante build. No se afirma build completo aprobado.
- **Navegador:** la comprobación visual usó una API simulada con almacenamiento local del fixture; no fue un recorrido autenticado navegador → API real → Supabase. La persistencia y las carreras reales se verificaron separadamente en Postgres local, y la frontera HTTP mediante Jest.
- **Base:** el contenedor local usa Postgres 17, mientras `supabase/config.toml` declara 15. No se verificó un esquema remoto ni compatibilidad ejecutada sobre esa versión remota.

## Persistencia y continuidad

No se cambió ni reescribió la migración de fase 1 y no hizo falta una nueva. El propietario conserva el despliegue de migraciones mediante su circuito de aprobación/CI/CD. No hubo ninguna migración ni mutación remota.

La fase 2 termina con una estructura vacía persistente y una vista de lectura. La **fase 3** debe incorporar Reorganizar, panel de zonas, asignación, Guardar/Cancelar, movimientos compatibles y ramas activas/inactivas utilizando el contrato transaccional ya disponible. Puede reutilizar esta carga y los metadatos; debe coordinar snapshots/revisión con los nuevos guardados concurrentes. La **fase 4** debe integrar resultados, BYEs, horarios, estadísticas y cierre en el mismo protocolo. Esos escritores siguen bloqueados para LIBRE; no se habilitó su uso legacy ni se implementaron esas fases.
