# Americano singlezone: inconsistencias y decisiones pendientes

Fecha de revisión: 2026-09-05

Alcance: presets de americano con una zona general, 2 o 3 partidos por pareja y llave única u Oro/Plata. Este documento registra el estado del worktree `american/singlezone`; no propone todavía una implementación.

## Decisión ya tomada

- Cuando haya una cantidad impar de parejas en la modalidad de 3 partidos, una pareja podrá jugar solamente 2 partidos.
- La tabla seguirá ordenándose por victorias absolutas. Por ahora no se aplicará porcentaje de victorias ni otra normalización por cantidad de partidos jugados.
- El organizador podrá cambiar entre llave única y dos llaves Oro/Plata mientras todavía no exista una llave generada.
- No se permitirá convertir una estructura singlezone en multizona, ni una multizona en singlezone, cuando ya existan zonas.
- En llave única, el reparto AUTO clasificará a todas las parejas.
- En Oro/Plata, el reparto AUTO incluirá a todas las parejas. Ante una cantidad impar, Plata recibirá una pareja más que Oro: por ejemplo, con 9 parejas quedarán Oro 4 y Plata 5.
- El organizador podrá reemplazar el reparto AUTO por uno personalizado:
  - en llave única podrá elegir cuántas parejas avanzan;
  - en Oro/Plata podrá elegir cuántas avanzan a cada copa;
  - las parejas restantes quedarán eliminadas.
- Después de una descalificación, los partidos que ya fueron disputados seguirán computando. La pareja descalificada quedará excluida de la clasificación y de las llaves.
- La llave única admitirá desde 2 parejas clasificadas, permitiendo una final directa.
- Oro/Plata admitirá desde 2 parejas en cada copa, permitiendo una final directa en cada llave. El mínimo total será de 4 parejas clasificadas entre ambas copas.

## Inconsistencias confirmadas

### 1. El reparto automático llega a la generación de la llave con cero clasificados

Los cuatro presets nuevos guardan `allocationMode: 'AUTO'`. `QualificationSourceService` obtiene las reglas mediante `TournamentFormatRulesService.resolve({ tournament })`, sin informar la cantidad de parejas. El resolver interpreta esa ausencia como `0` y `BracketQualificationAllocationService` produce:

- llave única: `advanceCount: 0`;
- Oro/Plata: `goldCount: 0` y `silverCount: 0`.

Luego `selectQualifiedEntries` aplica esos valores y devuelve una lista vacía. Se reprodujo localmente con 8 parejas y el preset `AMERICAN_SINGLE_ZONE_GLOBAL_2`.

Impacto: bloqueo crítico de la generación real de las llaves con la configuración recomendada.

Archivos implicados:

- `lib/services/qualification-source.service.ts`
- `lib/services/tournament-format-rules.service.ts`
- `lib/services/tournament-format-resolver.ts`
- `lib/services/bracket-qualification-allocation.service.ts`

### 2. La transición a 3 partidos reutiliza una restricción exclusiva de multizona

Los presets singlezone fueron agregados a `RUNTIME_AMERICAN_MULTI_ZONE_PRESET_IDS`. Como consecuencia, durante el cambio de formato se ejecuta la validación de MZ3 que rechaza cualquier zona con más de 4 parejas.

Una zona general normal de 5 a 32 parejas puede quedar impedida de:

- pasar de 2 a 3 partidos;
- cambiar entre llave única y Oro/Plata si el preset de destino tiene 3 partidos;
- volver a guardar una configuración de 3 partidos durante la fase de zonas.

El mensaje de error también habla de MZ3 y de un máximo de 4, aunque el formato elegido sea singlezone.

Archivos implicados:

- `lib/services/tournament-format-policy.ts`
- `app/(main)/tournaments/[id]/settings/actions.ts`

### 3. Se permiten transiciones entre multizona y singlezone sin transformar la estructura

La misma lista de compatibilidad habilita cambios en fase de zonas entre presets multizona y singlezone. El guardado actualiza `format_config` y `rounds_per_couple`, pero no fusiona varias zonas en una Zona General ni redistribuye parejas y partidos en sentido inverso.

Esto permite estados contradictorios, por ejemplo un torneo configurado como `SINGLE_ZONE` que conserva varias filas en `zones` y fixtures separados.

Archivos implicados:

- `lib/services/tournament-format-policy.ts`
- `app/(main)/tournaments/[id]/settings/actions.ts`

### 4. La validación del fixture no trata las descalificaciones de forma consistente

Para calcular parejas y partidos esperados se excluyen las parejas descalificadas. Sin embargo, `resolveZoneFixtureRequirements` recibe todos los partidos originales, incluidos los que involucran a esas parejas.

Como `isComplete` exige igualdad exacta entre `matches.length` y `expectedTotalMatches`, una zona previamente completa puede quedar bloqueada después de una descalificación. También pueden aparecer conteos por encima del límite para las parejas activas que jugaron contra la pareja descalificada.

Archivo implicado:

- `lib/services/bracket-generation-validation.ts`

### 5. El formulario no representa con fidelidad el reparto que se persiste

Al seleccionar un preset Oro/Plata, la pantalla carga los valores nominales del preset (`4 + 4`) aunque el modo AUTO los recalculará al guardar según las inscripciones. En modo CUSTOM, `eliminatedCount` queda en solo lectura y no se recalcula en pantalla cuando se modifican Oro y Plata.

Consecuencias:

- el usuario puede ver `4 + 4 + 0` con otra cantidad de inscriptos;
- el resultado persistido puede diferir de lo mostrado antes de guardar;
- en modo CUSTOM no queda claro cuántas parejas serán eliminadas hasta que el servidor valide o normalice la configuración.

Archivo implicado:

- `app/(main)/tournaments/[id]/settings/components/TournamentFormatConfigForm.tsx`

### 6. Las reglas de cantidades mínimas no están alineadas con el comportamiento acordado

Los presets de llave única admiten una zona desde 3 parejas (`minSize: 3`) y `AdvancementPlanner` rechaza una llave singlezone con menos de 4 parejas. El comportamiento acordado debe permitir 2 parejas clasificadas y una final directa.

La cantidad mínima de parejas inscriptas para disputar una fase de zona puede ser una regla diferente de la cantidad mínima de clasificadas a una llave. Esa separación todavía no está representada claramente en los presets y validadores.

Para Oro/Plata se confirmó el mínimo técnico actual: 2 parejas en Oro y 2 en Plata.

Archivos implicados:

- `config/tournament-format-presets.ts`
- `lib/services/zone-fixture-planner.service.ts`
- `lib/services/advancement-planner.service.ts`

## Debilidades de validación y pruebas

- Los tests prueban el resolver, el reparto y la selección como unidades separadas, pero no el recorrido real `QualificationSourceService -> TournamentFormatRulesService -> TournamentFormatResolver -> selectQualifiedEntries`.
- No hay casos de integración para los cuatro presets nuevos con 4, 5, 8 y 9 parejas.
- No hay casos que cambien 2/3 partidos y llave única/Oro-Plata con una zona ya creada.
- No hay casos singlezone que validen un fixture después de una descalificación.
- La excepción impar se prueba con un fixture armado manualmente, pero no se verificó que el flujo que crea o recomienda partidos pueda producir siempre esa distribución sin rivales repetidos.

## Decisiones pendientes

No quedan decisiones funcionales abiertas para preparar el plan de implementación.

- Se podrá pasar de 2 a 3 partidos en `NOT_STARTED` o `ZONE_PHASE`; los partidos existentes se conservan y se habilita la creación de los faltantes.
- Se podrá pasar de 3 a 2 solamente si ninguna pareja tiene más de 2 partidos creados. En caso contrario, el cambio se rechaza sin alterar datos.
- Todo cambio de partidos o de tipo de llave se rechaza en `BRACKET_PHASE` y también cuando exista cualquier artefacto persistido de llave, aunque el estado del torneo sea inconsistente.
- Se podrá cambiar entre llave única y Oro/Plata durante `ZONE_PHASE`, aunque haya partidos disputados, porque se conserva la misma Zona General y su tabla.
- Los partidos disputados contra una pareja posteriormente descalificada permanecen en el historial y computan para sus rivales. La pareja descalificada no puede clasificar.
- El torneo necesita al menos 3 parejas inscriptas para crear la Zona General.
- La llave única puede tener solamente 2 clasificadas. Oro y Plata requieren al menos 2 clasificadas en cada copa.
- En CUSTOM, la tabla global se corta en orden: primeras `N` a Oro, siguientes `M` a Plata y las restantes quedan eliminadas.

## Reglas de aceptación derivadas

- AUTO nunca puede resolverse con cero plazas cuando existen parejas elegibles.
- Llave única AUTO: `advanceCount = parejas elegibles`.
- Oro/Plata AUTO: todas las parejas elegibles se reparten entre ambas copas; Plata recibe la adicional cuando el total es impar.
- CUSTOM de llave única: entre 2 y el total de parejas elegibles.
- CUSTOM de Oro/Plata: al menos 2 en cada copa y la suma no puede superar el total de parejas elegibles; eliminadas se deriva como `total - oro - plata`.
- El cambio llave única ↔ Oro/Plata conserva la Zona General, su fixture, resultados y tabla; solo cambia la política de clasificación y las futuras llaves.
- Ningún cambio de formato puede reutilizar restricciones de tamaño propias de MZ3 sobre un torneo singlezone.
- Las transiciones singlezone ↔ multizona deben rechazarse cuando haya estructura de zonas persistida.
- Una descalificación no invalida partidos que ya se disputaron.
- La Zona General no se crea con menos de 3 parejas inscriptas.
- El cambio de 3 a 2 partidos se bloquea si alguna pareja ya supera el nuevo límite.

## Verificación realizada

- Reproducción directa del problema de cero clasificados con 8 parejas.
- Ejecución de cuatro suites relacionadas: 35 tests aprobados.
- No se modificaron datos locales ni remotos y no se hizo validación en navegador.
