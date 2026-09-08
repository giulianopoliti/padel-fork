# Plan de acción: Americano singlezone robusto

Fecha: 2026-09-05

## Objetivo

Completar los formatos americanos de Zona General con 2 o 3 partidos por pareja y salida a:

- llave única (`MAIN`);
- Copa de Oro y Copa de Plata (`GOLD` y `SILVER`).

El flujo debe admitir reparto automático o personalizado, cambios seguros durante la fase de zonas, descalificaciones y cantidades pares o impares. La funcionalidad de copas debe reutilizar el flujo canónico que ya usa el torneo LONG.

## Comportamiento final acordado

### Zona

- Se requieren al menos 3 parejas inscriptas para crear la Zona General.
- El organizador elige 2 o 3 partidos por pareja.
- Con 3 partidos y cantidad impar, una pareja juega 2 y las demás 3.
- No se repiten rivales dentro del fixture válido.
- El ranking usa victorias absolutas.

### Clasificación

- Llave única AUTO: clasifican todas las parejas elegibles.
- Llave única CUSTOM: el organizador elige entre 2 y el total de parejas elegibles.
- Oro/Plata AUTO: clasifican todas; se divide por la mitad y, si el total es impar, Plata recibe una pareja más.
- Oro/Plata CUSTOM: mínimo 2 en Oro, mínimo 2 en Plata y el resto queda eliminado.
- Los cortes siguen la tabla global: primero Oro, después Plata y finalmente eliminadas.
- Las parejas descalificadas se excluyen antes de aplicar los cortes.

### Cambios en curso

- Se permiten en `NOT_STARTED` y `ZONE_PHASE`.
- Se permite llave única ↔ Oro/Plata conservando zona, partidos, resultados y tabla.
- Se permite 2 → 3 conservando los partidos y habilitando la creación de los faltantes.
- Se permite 3 → 2 únicamente si ninguna pareja tiene más de 2 partidos creados.
- Se rechazan todos estos cambios en `BRACKET_PHASE` o si existen seeds, partidos eliminatorios, jerarquías, resoluciones o indicadores persistidos de una llave.
- Se rechaza singlezone ↔ multizona cuando ya existe una estructura de zonas.

### Descalificaciones

- Los partidos disputados permanecen en el historial y computan para los rivales activos.
- La pareja descalificada no aparece entre las clasificadas ni en las llaves.
- Los partidos históricos contra una descalificada no vuelven incompleta una zona que ya cumplía el requisito.

## Etapa 1: separar identidad del formato y reglas de transición

### Trabajo

1. Reemplazar la lista mezclada `RUNTIME_AMERICAN_MULTI_ZONE_PRESET_IDS` por clasificadores explícitos:
   - americano multizona;
   - americano singlezone;
   - misma topología de zona;
   - mismo número objetivo de partidos;
   - cambio de tipo de llave.
2. Crear una política única de transición que reciba formato actual, formato destino, estado, snapshots de zonas y artefactos de llave.
3. Permitir únicamente las combinaciones acordadas y devolver códigos de error propios del caso, sin mensajes MZ3 para singlezone.
4. Considerar `BRACKET_PHASE` y la existencia real de artefactos como bloqueos independientes. Esto protege estados dañados donde el estado y los datos no coinciden.
5. Al cambiar de 3 a 2, validar el número de partidos por pareja, no solamente el total de partidos de la zona.

### Archivos principales

- `lib/services/tournament-format-policy.ts`
- `app/(main)/tournaments/[id]/settings/actions.ts`
- nuevo servicio puro de validación de transición, si la política actual queda demasiado amplia
- tests de política y de la Server Action

### Resultado verificable

- Singlezone 2/3 y MAIN/GOLD_SILVER pueden combinarse antes de la llave.
- Multizona y singlezone no se consideran formatos intercambiables con zonas persistidas.
- Ningún cambio parcial queda persistido si falla la sincronización de `rounds_per_couple`.

## Etapa 2: hacer que AUTO sea dinámico y tenga una sola fuente de verdad

### Trabajo

1. Mantener `allocationMode` como intención persistida y calcular los números efectivos con la cantidad de parejas elegibles del momento.
2. Evitar que la ausencia de `totalCouples` se convierta silenciosamente en cero. El resolver no debe materializar AUTO si no conoce el total.
3. En `QualificationSourceService`, cargar la tabla, excluir descalificadas y recién entonces aplicar AUTO usando `effectiveEntries.length`.
4. Para CUSTOM, validar contra la cantidad elegible:
   - SINGLE: `2 <= advanceCount <= elegibles`;
   - GOLD_SILVER: `goldCount >= 2`, `silverCount >= 2` y `goldCount + silverCount <= elegibles`;
   - derivar siempre `eliminatedCount = elegibles - goldCount - silverCount`.
5. Aplicar la misma normalización al guardar configuración, mostrar la vista previa y generar la llave.
6. Evitar guardar números derivados obsoletos como verdad operativa de AUTO; el modo y la política deben prevalecer cuando cambien inscripciones o descalificaciones.

### Archivos principales

- `lib/services/bracket-qualification-allocation.service.ts`
- `lib/services/tournament-format-resolver.ts`
- `lib/services/tournament-format-rules.service.ts`
- `lib/services/qualification-source.service.ts`
- `lib/services/advancement-planner.service.ts`
- `lib/services/tournament-format-config-builder.ts`
- `app/(main)/tournaments/[id]/settings/actions.ts`

### Resultado verificable

- Con 8 parejas, MAIN AUTO genera 8 clasificados.
- Con 9 parejas, Oro/Plata AUTO genera Oro 4 y Plata 5.
- Una descalificación recalcula AUTO con las elegibles restantes.
- CUSTOM nunca produce una llave vacía ni un corte mayor que la población elegible.

## Etapa 3: consolidar las reglas del fixture singlezone

### Trabajo

1. Convertir `resolveZoneFixtureRequirements` en la fuente única para:
   - cantidad requerida por pareja;
   - total teórico cuando no hay descalificaciones;
   - excepción impar de 3 partidos;
   - detección de rivales duplicados;
   - faltantes y excesos.
2. Separar partidos creados de partidos disputados en la entrada y en el diagnóstico.
3. Con descalificaciones:
   - excluir a la pareja de la población elegible;
   - conservar para cada rival activo el crédito de un partido ya disputado contra ella;
   - ignorar a la descalificada para determinar clasificación;
   - no exigir igualdad exacta del total global cuando existen partidos históricos válidos.
4. Para el cambio 2 → 3, conservar todos los partidos y calcular los pares adicionales posibles sin repetir rival. Los faltantes quedarán disponibles para creación y programación mediante el flujo existente.
5. Para 3 → 2, detectar cualquier pareja con más de 2 partidos creados y rechazar antes de guardar.
6. Probar que para 3, 5, 7, 9 y hasta 31 parejas impares la regla produce exactamente una pareja con 2 partidos y el resto con 3, siempre que el fixture esté completo.

### Archivos principales

- `lib/services/zone-fixture-requirements.service.ts`
- `lib/services/zone-fixture-planner.service.ts`
- `lib/services/bracket-generation-validation.ts`
- `lib/services/zone-match-rules.service.ts`
- `lib/services/zone-rules-sync.service.ts`
- flujo existente de creación/recomendación de partidos

### Resultado verificable

- El validador, el creador manual de partidos y la pantalla de requisitos informan el mismo límite.
- No se bloquea la llave por partidos históricos contra una descalificada.
- No se puede crear un rival duplicado ni superar la cuota vigente.

## Etapa 4: reutilizar por completo las llaves de LONG

### Trabajo

1. Mantener `getOperationalBracketKeysForFormat` como selector canónico:
   - SINGLE → `MAIN`;
   - GOLD_SILVER → `GOLD`, `SILVER`.
2. Verificar que el orquestador genere ambas copas en una sola operación, con seeds, matches, jerarquías, BYEs y rollback conjunto.
3. Asegurar que `QualificationSourceService` entregue a cada llave el segmento correcto de la tabla global.
4. Verificar que los endpoints heredados envuelvan el flujo canónico también para los cuatro presets americanos nuevos.
5. Revisar lectura, visualización, programación, resultado, finalización y eliminación de llaves por `bracket_key`.
6. Mantener fuera de alcance las herramientas exclusivas de reemplazo manual de parejas de LONG, salvo que sean necesarias para que la UI de las copas funcione. El objetivo es compartir la generación y operación de llaves, no cambiar las reglas propias de LONG.

### Archivos principales

- `lib/services/bracket-key-policy.ts`
- `lib/services/bracket-generation-orchestrator.ts`
- `lib/services/bracket-generator-v2.ts`
- `lib/services/qualification-source.service.ts`
- persistencia, rollback y endpoints de lectura por `bracket_key`
- componentes de visualización y programación de las llaves

### Resultado verificable

- El americano GOLD_SILVER crea exactamente dos llaves independientes.
- Ninguna pareja aparece en ambas copas.
- Los BYEs avanzan correctamente y cada final queda asociada a su copa.
- La finalización del torneo toma a GOLD como llave principal, igual que LONG.

## Etapa 5: corregir la experiencia de configuración

### Trabajo

1. Separar visualmente tres decisiones:
   - partidos por pareja: 2 o 3;
   - tipo de eliminación: llave única u Oro/Plata;
   - reparto: recomendado o personalizado.
2. Mostrar siempre una vista previa basada en la cantidad actual de parejas:
   - MAIN: clasificadas y eliminadas;
   - GOLD_SILVER: Oro, Plata y eliminadas.
3. En AUTO, mostrar valores calculados y mantenerlos como solo lectura.
4. En CUSTOM, recalcular `eliminatedCount` en vivo y validar mínimos y suma antes de enviar.
5. Si hay menos de 4 elegibles, deshabilitar Oro/Plata con una explicación; con 3 inscriptas seguirá disponible MAIN con 2 o 3 clasificadas según la elección.
6. Mostrar claramente por qué un cambio 3 → 2 está bloqueado e identificar las parejas que superan el límite.
7. En `BRACKET_PHASE`, mostrar la configuración como lectura y explicar que la llave ya fue creada.
8. Después de guardar, refrescar desde la configuración persistida para evitar diferencias entre el formulario y el servidor.

### Archivos principales

- `app/(main)/tournaments/[id]/settings/components/TournamentFormatConfigForm.tsx`
- `app/(main)/tournaments/[id]/settings/actions.ts`
- `app/(main)/tournaments/[id]/formato/page.tsx`

### Resultado verificable

- Lo mostrado antes de guardar coincide con lo usado para generar las llaves.
- No existen combinaciones inválidas enviables desde la interfaz.
- Los errores del servidor siguen siendo claros si existe una carrera o se llama la acción directamente.

## Etapa 6: validación integral y regresión

### Tests unitarios

- Asignación AUTO y CUSTOM con 3, 4, 5, 8, 9, 16 y 31 parejas.
- Cortes contiguos de MAIN, GOLD y SILVER.
- Resolver con total conocido, desconocido y cero real.
- Fixtures de 2 partidos con cantidades pares e impares.
- Fixtures de 3 partidos con cantidades pares e impares.
- Duplicados, faltantes, excesos y descalificaciones.
- Matriz completa de transiciones de formato y estados.

### Tests de integración de servicios

- Recorrido real `QualificationSourceService -> resolver -> allocation -> selección`.
- Generación MAIN para los presets de 2 y 3 partidos.
- Generación GOLD + SILVER para los presets de 2 y 3 partidos.
- Rollback si falla la segunda copa: no deben quedar artefactos de GOLD aislados.
- Cambio MAIN ↔ GOLD_SILVER con partidos disputados y sin artefactos de llave.
- Rechazo de todos los cambios en `BRACKET_PHASE` o con artefactos persistidos.
- Descalificación posterior a partidos terminados.

### Verificación de aplicación

Ejecutar, en este orden:

1. tests nuevos y suites cercanas;
2. suite completa de Jest;
3. TypeScript y lint disponibles en el repositorio;
4. build FV;
5. prueba manual local del flujo completo para 5, 8 y 9 parejas;
6. prueba visual de escritorio y móvil de configuración, tabla y ambas llaves.

No hace falta una migración de base de datos si `allocationMode` continúa dentro de `format_config`. Si durante la implementación aparece una necesidad de esquema, se debe detener esa parte, documentar la migración propuesta y revisar RLS antes de aplicarla.

## Escenarios de aceptación final

1. **5 parejas, 2 partidos, MAIN AUTO:** se conservan 5 clasificadas y se genera una llave con BYEs válidos.
2. **5 parejas, 3 partidos, MAIN CUSTOM 4:** una pareja juega 2 partidos, cuatro clasifican y se genera semifinal + final.
3. **8 parejas, 2 partidos, Oro/Plata AUTO:** Oro 4 y Plata 4, sin eliminadas.
4. **9 parejas, 3 partidos, Oro/Plata AUTO:** Oro 4, Plata 5, una pareja juega 2 partidos y las copas manejan sus BYEs.
5. **10 parejas, Oro/Plata CUSTOM 4 + 4:** dos quedan eliminadas respetando la tabla global.
6. **Cambio MAIN → Oro/Plata en ZONE_PHASE:** conserva zona, fixture y resultados; cambia solamente la futura clasificación.
7. **Cambio 2 → 3:** conserva partidos existentes y permite completar los faltantes sin repetir rivales.
8. **Cambio 3 → 2 con una pareja en 3 partidos:** se rechaza sin modificar configuración ni zona.
9. **Descalificación después de jugar:** sus partidos siguen computando para los rivales, se excluye a la pareja y la llave puede generarse cuando los activos cumplen la regla.
10. **Cualquier cambio en BRACKET_PHASE:** se rechaza sin mutaciones.

## Orden de implementación recomendado

1. Política de formatos y transiciones.
2. Reparto AUTO/CUSTOM y flujo real de clasificación.
3. Requisitos de fixture y descalificaciones.
4. Integración de MAIN/GOLD/SILVER con el orquestador LONG.
5. Formulario y mensajes.
6. Tests integrales, build y prueba local.

Cada etapa debe quedar verde antes de avanzar porque la siguiente depende de sus invariantes. No se deben tocar datos remotos durante la implementación ni la validación inicial.
