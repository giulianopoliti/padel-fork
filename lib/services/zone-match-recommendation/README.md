# Recomendador de partidos de zona

Este módulo propone un **lote de cruces jugables ahora** y demuestra que, después
de comprometer cualquier subconjunto o el lote completo, todavía existe una forma
de completar los partidos pendientes sin repetir rivales. La recomendación no se
persiste: se recalcula a partir del estado actual de la base de datos.

El motor es agnóstico al torneo. La primera integración está limitada a torneos
`AMERICAN` con `SINGLE_ZONE`.

## Qué hace cada archivo

- `types.ts`: contrato independiente de infraestructura. Define parejas, partidos
  comprometidos, estados de respuesta y diagnósticos.
- `engine.ts`: algoritmo puro de grafo/backtracking. No consulta la base ni conoce
  formatos de torneo.
- `american-single-zone.service.ts`: adaptador de Supabase y reglas de negocio para
  Americano Single Zone. Convierte filas reales en la entrada del motor.
- `__tests__/engine.test.ts`: casos del motor, incluidos callejones sin salida,
  parejas ocupadas, cantidades desparejas y recálculo después de una elección manual.
- `app/api/tournaments/[id]/zone-match-recommendation/route.ts`: endpoint de lectura
  autenticado que expone la recomendación.
- `SingleZoneRecommendationPanel.tsx`: UI preparada para consumir el endpoint. Por
  ahora se monta bajo demanda en la creación de partidos de `/matches`.
- `createMatchOfZone` en `app/api/tournaments/[id]/actions.ts`: guardia de escritura.
  Valida el cruce elegido justo antes de insertarlo.

## Modelo mental

Cada pareja es un nodo. Un partido posible es una arista entre dos nodos. Los
partidos ya creados o terminados bloquean esa arista para evitar repetirla. El
objetivo de partidos de cada pareja indica cuántas aristas debe tener al terminar.

Hay dos conceptos distintos:

- **Comprometida**: la pareja ya tiene ese partido asignado, aunque esté en curso.
  Consume un cupo y el cruce no puede repetirse.
- **Ocupada**: tiene un partido `IN_PROGRESS`, por lo que no puede ser parte de la
  recomendación inmediata. Sí puede aparecer más adelante en `futurePlan`.

Por eso, cuando termina un partido no cambia el plan matemático comprometido, pero
sí se vuelve a consultar el recomendador: las parejas recién liberadas pueden
convertirse en el siguiente cruce jugable.

## Flujo de lectura

```text
SingleZoneRecommendationPanel
  -> GET /api/tournaments/:id/zone-match-recommendation
  -> getAmericanSingleZoneRecommendation
  -> loadSnapshot (torneo, zona, parejas, partidos, descalificaciones y reglas)
  -> buildRequirementVariants
  -> recommendZoneMatches
  -> recommendedBatch + futurePlan + alternatives + revision
```

`recommendedBatch` es un matching extraído de un mismo plan: sus partidos son
compatibles entre sí y ninguna pareja aparece dos veces. `futurePlan` es el
**testigo de viabilidad**, no un fixture reservado. Si el organizador crea otro
cruce o cambia el estado de un partido, el plan anterior deja de ser autoritativo
y se calcula uno nuevo.

## Flujo de creación y protección

```text
UI crea un partido
  -> POST /api/tournaments/:id
  -> createMatchOfZone
  -> validaciones existentes
  -> assessAmericanSingleZoneCandidate
  -> simula el cruce + busca un cierre completo
     -> seguro: INSERT del partido
     -> inseguro: 422 WOULD_BREAK_REMAINING_FIXTURE
     -> pareja ocupada: COUPLE_IN_PROGRESS
     -> revisión vieja: 409 RECOMMENDATION_STALE
```

La revisión (`revision`) es un hash del estado relevante. Sirve para evitar crear
una recomendación que era correcta cuando se mostró pero quedó vieja porque otra
cancha creó o terminó un partido. La validación principal igualmente se repite en
el servidor; la revisión no reemplaza esa comprobación.

El flujo existente de zonas permite confirmar un cruce inseguro y reintentar con
`allowUnsafe: true`. Esa excepción es explícita y queda fuera del motor.

## Estados de respuesta

- `READY`: hay uno o más cruces compatibles en `recommendedBatch`;
  `recommendedNow` conserva el primero para compatibilidad.
- `WAITING_FOR_AVAILABLE_COUPLES`: existe cierre global, pero ningún cruce seguro
  puede arrancar ahora porque las parejas necesarias están ocupadas.
- `COMPLETE`: todas las parejas alcanzaron su objetivo.
- `IMPOSSIBLE`: el estado actual ya no admite un cierre sin repeticiones.
- `SEARCH_LIMIT_REACHED`: no se pudo demostrar solución dentro del fusible de
  búsqueda; no equivale a afirmar que sea imposible.

## Casos impares y descalificaciones

Cada partido suma dos créditos. Si después de contemplar partidos ya jugados y
descalificaciones queda una cantidad impar de créditos, no todas las parejas
activas pueden alcanzar exactamente el mismo total. El adaptador genera variantes
reduciendo en uno el objetivo de cada posible pareja y elige una variante viable.
La pareja proyectada se informa en `projectedReducedCoupleId`.

## Integración actual en `/matches`

El botón `Recomendar cruce` aparece sólo para organizadores de torneos American
Single Zone. Al abrirlo, `SingleZoneRecommendationPanel` consulta el estado actual.
El panel muestra todos los cruces de `recommendedBatch` juntos. El organizador
puede agregar uno, una selección o todos a la cola de `MatchCreationSection` sin
crearlos todavía. Una tanda recomendada no se mezcla con cruces manuales, pero sus
partidos pueden incorporarse progresivamente porque pertenecen al mismo plan.

Al crear una tanda, el primer POST valida `expectedRecommendationRevision`; los
siguientes se revalidan contra el estado que dejó el anterior. Una revisión vieja
descarta la tanda y refresca el panel. Un cruce inseguro abre una confirmación
explícita antes del override.

## Verificación

Ejecutar los tests enfocados del motor:

```bash
npm test -- --runInBand lib/services/zone-match-recommendation/__tests__/engine.test.ts
```

Al depurar, el orden recomendado es: payload del GET, snapshot del adaptador,
entrada de `recommendZoneMatches`, y finalmente `visitedNodes`/`diagnostics` del
resultado.
