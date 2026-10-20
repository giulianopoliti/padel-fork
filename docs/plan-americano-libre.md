# Plan de acción: AMERICANO LIBRE

Fecha: 16 de octubre de 2026.
Estado: planificación; implementación pendiente.

Este documento reúne las decisiones de la conversación. Reemplaza las propuestas anteriores de dar prioridad a asignaciones manuales sobre ganadores, inventar BYEs por saltar rondas, guardar cada arrastre automáticamente o modificar participantes de partidos ya jugados.

## 1. Resultado esperado

Un formato AMERICANO LIBRE, con zona única o multizona, en el que el organizador elige la cantidad inicial de participantes de la llave y ubica las parejas manualmente. Las posiciones de zonas se calculan y se muestran como referencia, pero no asignan participantes a la llave.

Se extiende el editor existente. El botón **Reorganizar parejas** habilita tanto el arrastre entre lugares de la llave como desde el panel de zonas. Se conserva el guardado explícito, la cancelación de cambios y el funcionamiento deportivo de resultados y BYEs.

## 2. Decisiones confirmadas

| Tema | Comportamiento acordado |
|---|---|
| Formato | AMERICANO LIBRE, con zona única o multizona. |
| Fases | Primero `ZONE_PHASE`. La generación exitosa lleva a `BRACKET_PHASE`. |
| Momento de generación | En cualquier momento de `ZONE_PHASE`, sin exigir fixture completo ni posiciones definitivas. |
| Selector de cantidad | Propone el total de parejas inscriptas y permite elegir otro número dentro de los límites soportados. No contar jugadores sueltos como parejas. |
| Generación inicial | Priorizar el cuadro con distribución convencional de pases libres para la cantidad elegida. Crear lugares sin asignar parejas. |
| Placeholders de clasificación | No crear “1A”, “2B” ni dependencias de posiciones de zona. Las referencias necesarias a ganadores de partidos siguen perteneciendo al árbol. |
| Origen de parejas | Sólo parejas que pertenecen a una zona del mismo torneo, según las reglas vigentes de habilitación. |
| Panel derecho | Zonas, posición, nombre de pareja, PG, PP y DG; también parejas sin resultados todavía. |
| Edición | Reutilizar Reorganizar parejas, Guardar y Cancelar. Sin auto-guardado por arrastre. |
| Avance deportivo | Los ganadores siguen avanzando por sus conexiones. No hay prioridad manual que bloquee un ganador legítimo. |
| Entrada directa | Colocar una pareja en una ronda posterior no crea victorias ni BYEs procesados ficticios. |
| Destino reservado | No permitir una entrada directa si un partido o una rama anterior con participantes o actividad deportiva puede alimentar ese casillero. Revisar toda la rama, no sólo el hijo inmediato. |
| Rama anterior vacía | Al colocar directamente la pareja, queda inactiva la rama anterior correspondiente a ese casillero, no la del rival. |
| Conservación de ramas | **Confirmado por el usuario:** conservar los partidos y conexiones de las ramas inactivas; no eliminarlos y recrearlos. |
| Retroceso manual | Elegir el casillero exacto mediante arrastre dentro de la rama compatible. Reactivar el recorrido necesario. No elegir izquierda/derecha automáticamente. |
| BYEs | Mantener Procesar BYE y Desprocesar BYE. Sólo deshacer pases realmente procesados. Adaptar las comprobaciones para ramas inactivas. |
| Partidos jugados | Mantener restricciones actuales. No borrar resultados ni mover participantes de partidos finalizados como parte de esta funcionalidad. |
| Capacidad | Mostrar cuadro base, cantidad solicitada, capacidad efectiva y parejas ubicadas; la distribución manual puede cambiar la capacidad. |

Ejemplos obligatorios:

- 24 parejas inscriptas y selector en 20: cuadro base de 32, con 8 lugares de entrada en cuatro partidos de dieciseisavos y 12 entradas con pase a octavos. Los 20 lugares iniciales esperan la elección manual de parejas.
- Cuadro base de 32: colocar directamente una pareja en un lado de cuartos sustituye una rama de cuatro entradas por una entrada. Si todo lo demás queda igual, la capacidad efectiva es 29.
- Una pareja colocada directamente en cuartos vuelve al casillero de octavos elegido por el organizador mediante Reorganizar. No se utiliza Desprocesar BYE para inventar ese recorrido.
- Un partido con dos lugares de entrada y sólo una pareja cargada está incompleto. No convertirlo en BYE por la ausencia temporal del segundo participante. Un pase libre definido en la distribución sí permite el tratamiento de BYE correspondiente.

## 3. Alcance de la primera versión

- Una llave principal por torneo, siguiendo la variante de americano acordada; no agregar Oro/Plata en este trabajo.
- Generación por cantidad con distribución de BYEs; después, edición manual de los lugares habilitados.
- Movimientos nuevos desde zonas y entre rondas compatibles, junto a las operaciones existentes de reorganización.
- Conservación y reactivación de ramas, resultados, BYEs, lectura pública, horarios y cierre del torneo.
- Guardado explícito y Cancelar existentes. No agregar un historial general de Deshacer ni botones nuevos Avanzar/Retroceder.
- El generador de un cuadro totalmente vacío sin distribución inicial de pases libres queda para una ampliación posterior.
- No cambiar las reglas de inscripciones, pagos, aprobación o jugadores sueltos. Hay trabajo en curso en esos archivos: integrar sobre su estado actual, sin revertir cambios ajenos.

## 4. Puntos del código que condicionan la implementación

| Evidencia local | Consecuencia para el plan |
|---|---|
| `types/tournament-format-v2.ts`, `config/tournament-format-presets.ts` y `tournament-format-resolver.ts` separan tipo base y configuración. | Integrar LIBRE como modalidad sobre `AMERICAN`, reutilizando zona única y multizona. |
| `bracket-generator-v2.ts` calcula rondas, potencia de dos, BYEs y conexiones, pero genera participantes desde clasificación. | Extraer/reutilizar la construcción de estructura sin ejecutar la selección por posiciones. |
| `bracket-generation-validation.ts` exige fase de zonas y verifica partidos creados por pareja. | Conservar la transición de fase y adaptar sólo los requisitos de LIBRE. |
| `bracket-generation-orchestrator.ts` ejecuta análisis definitivo y procesamiento de BYEs después de generar seeds. | LIBRE necesita un recorrido de generación que no ejecute clasificación ni avance parejas todavía no asignadas. |
| `ImprovedBracketRenderer.tsx`, `GranularMatchCard.tsx` y `useBracketDragOperations.ts` usan modo edición, misma ronda y operaciones pendientes. | Conservar el flujo visible y ampliar los tipos de origen y las validaciones sólo para LIBRE. |
| `enhanced-bracket-operations/route.ts` guarda operaciones una a una y puede devolver éxito parcial. | Para los cambios de rama de LIBRE, guardar el conjunto coherentemente: ningún participante o rama debe quedar a mitad de una edición. |
| RPCs existentes mueven parejas, seeds y algunas conexiones; el intercambio restringe misma ronda. | Auditar antes de reutilizar. No quitar restricciones globales de formatos existentes ni reconectar ramas por accidente. |
| `advanceWinnerUsingHierarchy` escribe el ganador en el destino indicado por `match_hierarchy`. | Mantener el avance deportivo; validar la colocación manual y consultar sólo conexiones activas. |
| `process-bye-strict` rechaza partidos que tienen hijos; `undo-bye` limpia el avance siguiente. | Adaptar los controles de LIBRE para distinguir hijos activos/inactivos y BYEs reales, conservando las acciones. |
| `useBracketTreeLayout.ts` deduce conexiones por orden, en lugar de usar las relaciones persistidas. | Para LIBRE, dibujar con conexiones y ramas reales. Filtrar tarjetas no debe desplazar sus destinos. |
| `finalization.ts` cuenta todos los partidos sin finalizar. | Excluir partidos inactivos, conservando las condiciones actuales sobre los demás partidos y la final. |
| `database.types.ts` es actualmente un fallback `Database = any`. | Crear contratos explícitos y verificar el esquema disponible; no asumir que los tipos actuales validan columnas nuevas. |

## 5. Fases de ejecución

### Fase 0. Contrato técnico y recorrido completo

Objetivo: precisar cómo se representa una entrada y una rama antes de escribir migraciones.

- Inventariar lecturas y escrituras de partidos, seeds, jerarquía, horarios, resultados, BYEs, estadísticas, finalización y vista pública.
- Definir y documentar los estados necesarios: lugar sin asignar, entrada directa, lugar alimentado por ganador, pase libre previsto, BYE procesado y rama inactiva.
- Separar inactividad del estado deportivo del partido: una rama sin uso no es un partido finalizado ni un BYE ganado.
- Precisar qué metadatos mínimos necesita cada casillero/rama, preservando los identificadores y las conexiones existentes. No introducir tablas o columnas por anticipación.
- Mantener diferenciada la estructura original generada de la distribución actual, para poder reactivar recorridos y calcular capacidad.
- Definir operaciones desde zona, movimiento, intercambio, quitar una asignación inicial y reactivar rama. Conservar las restricciones vigentes sobre resultados e historial deportivo.
- Definir origen/destino para cada ejemplo, incluyendo efectos sobre el lugar del rival y sobre operaciones pendientes del mismo guardado.
- Si el inventario revela una alternativa de arquitectura con consecuencias relevantes no resueltas, preguntarla al usuario antes de escoger y registrar su respuesta en este documento.

Entrega: contrato breve de datos, invariantes, operaciones y archivos afectados. La conservación de ramas inactivas ya está decidida; no volver a preguntarla.

### Fase 1. Configuración y persistencia de LIBRE

Depende de fase 0.

- Incorporar AMERICANO LIBRE a los tipos, presets, constructor/resolvedor de formato, creación y visualización del torneo, conservando las reglas existentes de zonas.
- Persistir los estados de entradas y ramas definidos en el contrato, con los valores por defecto necesarios para que los formatos actuales sigan funcionando igual.
- Mantener coherentes `couple_id` y referencias a seeds cuando los consumidores existentes lo requieran. Una referencia técnica a seed no implica clasificar por posiciones ni mostrar placeholders de zona.
- Preparar migraciones locales y permisos acordes a organizadores del torneo y lectura pública vigente. No ampliar permisos de otras modalidades.
- Proteger guardados concurrentes: verificar la versión/estado vigente y guardar participantes, activación de ramas, conexiones y capacidad en una transacción corta. Usar un orden de bloqueo consistente.
- Revalidar pertenencia a zona y permisos al guardar; el estado del navegador no es la autoridad.
- Permitir la misma pareja en rondas sucesivas por avances legítimos, evitando dos asignaciones iniciales independientes de la misma pareja.

Entrega: contratos y persistencia local verificados con fallos parciales y concurrencia. No desplegar migraciones remotas.

### Fase 2. Generación de estructura por cantidad

Depende de fase 1.

- Botón Generar llave con cantidad propuesta igual al total de parejas inscriptas según los criterios vigentes, editable por el organizador.
- Reutilizar el cálculo de rondas, tamaño base y distribución convencional de pases libres. Crear lugares sin asignar participantes y sin clasificaciones de zona.
- Distinguir lugar pendiente de completar, pase libre definido y destino de un ganador. No procesar BYEs contra parejas todavía no seleccionadas.
- Permitir generar durante `ZONE_PHASE` aunque falten partidos creados o resultados de zona. Mantener las demás precondiciones vigentes aplicables al torneo.
- Confirmar `BRACKET_PHASE` sólo al persistir la estructura completa. Si falla, conservar el estado previo sin llave parcial.
- Bloquear doble generación simultánea y conservar el tratamiento vigente de una llave ya existente.
- Mostrar cantidad solicitada y capacidad efectiva; no recalcular silenciosamente la distribución por nuevas inscripciones o nuevos resultados de zonas.

Entrega: cuadros de 16, 20, 24 y 32, vacíos de participantes, con sus distribuciones de entrada correctas y persistentes después de recargar.

### Fase 3. Extensión de Reorganizar parejas

Depende de fases 1 y 2.

- Añadir al editor el panel derecho agrupado por zona, con posición, nombres, PG, PP y DG reutilizando los cálculos existentes.
- Incorporar origen de arrastre desde zona además del origen desde un partido. Arrastrar no cambia la zona de la pareja.
- Reorganizar habilita ambos orígenes; Guardar aplica y Cancelar descarta la vista previa, incluyendo cambios de activación de ramas y capacidad.
- Conservar las operaciones actuales donde siguen siendo válidas y extender los movimientos entre rondas únicamente bajo las reglas de LIBRE.
- Validar todas las parejas y actividad deportiva de la rama que alimenta el casillero. Un hijo inmediato vacío no demuestra que toda la rama esté libre.
- Al colocar directamente en ronda posterior, desactivar sólo la rama anterior de ese lado, sin inventar resultados, sin elegir un hijo de origen y sin afectar la rama del rival.
- Al retroceder, exigir un destino concreto compatible con el recorrido; reactivar lo necesario y recalcular disponibilidad/capacidad. No mover partidos jugados ni deshacer avances deportivos mediante un arrastre.
- Mostrar por qué un lugar está reservado, y las ramas sin uso de forma distinguible para permitir reactivarlas sin confundirlas con partidos pendientes.
- Dibujar la estructura real sin renumerar o reconectar partidos por filtrar ramas. Mantener el modo público de sólo lectura.
- Extender la alternativa existente de seleccionar pareja/destino para móvil y teclado a las operaciones nuevas cuando corresponda.

Entrega: recorrido desde zonas a llave, movimiento entre rondas, intercambio, guardado y cancelación; persistencia y recarga correctas.

### Fase 4. Integración deportiva y consumidores de partidos

Depende de fase 3; revisar sus interfaces desde fase 0.

- Mantener avance de ganadores, resultados, Procesar BYE y Desprocesar BYE, adaptando la consulta de ramas activas para LIBRE.
- Asegurar que un BYE sólo se desprocesa si efectivamente fue procesado. Una entrada directa se corrige con Reorganizar.
- Revisar los recorridos de BYEs recursivos y múltiples rondas: un lugar sin asignar no dispara un avance y un partido que espera ganador no se considera pase libre.
- Evitar carreras entre cargar resultado, procesar/desprocesar BYE y guardar reorganización. Rechazar un guardado desactualizado con un mensaje para recargar, sin éxito parcial.
- Mantener PG/PP/DG y posiciones de zonas actualizadas al seguir cargando partidos en `BRACKET_PHASE`. Omitir, sólo en LIBRE, la resolución y reasignación automática desde clasificación.
- Excluir partidos inactivos de agendas, asignación de canchas, pendientes, estadísticas y requisitos de cierre. No marcarlos finalizados para eludir conteos.
- Conservar los requisitos actuales de finalización de partidos activos, incluidas las zonas; no introducir una excepción para terminar con partidos de zona pendientes.
- Verificar campeón, finalista y puntos con entradas directas y BYEs, sin inventar partidos ganados por colocación manual.

Entrega: torneo completo de zonas a finalización, incluyendo ramas desactivadas/reactivadas y edición concurrente.

### Fase 5. Verificación integrada y preparación de entrega

Depende de fases 1 a 4.

- Ejecutar las pruebas específicas de estructura, capacidad, operaciones, permisos, resultados y BYEs; después las regresiones de formatos compartidos afectados.
- Verificar en navegador organizador y vista pública, escritorio y móvil. Confirmar que los destinos resaltados coinciden con las validaciones del servidor.
- Ejecutar los chequeos del proyecto apropiados a los archivos modificados, incluyendo TypeScript, pruebas relevantes, lint y build. Documentar limitaciones o fallas preexistentes.
- Probar configuración de FV y Elite sin mezclar proyectos. Usar bases locales/fixtures para las mutaciones de verificación.
- Entregar instrucciones de uso, resultado de pruebas, migraciones preparadas y estado de publicación. No afirmar desplegado ni disponible en producción sin verificarlo.

Entrega: funcionalidad verificable y migraciones listas para el circuito de CI/CD del propietario.

## 6. Casos de aceptación obligatorios

| Caso | Resultado esperado |
|---|---|
| Multizona y zona única | Ambas permiten LIBRE y conservan su fixture de zona. |
| 24 inscriptas, elegir 20 | Generar 20 entradas manuales con la distribución prevista, sin seleccionar quién clasifica. |
| Zonas con fixture/resultados incompletos | Se puede generar después de entrar en `ZONE_PHASE`. |
| Sin zonas o pareja sin zona | No ofrecerla ni aceptar su asignación por una petición directa. |
| Arrastrar sin Reorganizar | No habilitado. |
| Editar y cancelar | Base de datos sin cambios; vista y capacidad vuelven al estado guardado. |
| Una pareja en un partido de dos entradas | Esperar segunda asignación; no avanzar sola automáticamente. |
| Entrada directa a cuartos en cuadro de 32 | Inactivar la rama vacía de cuatro entradas; capacidad 29 si el resto queda igual. |
| Actividad en un nieto, hijo inmediato sin pareja | Rechazar la entrada directa al destino de esa rama. |
| Rama libre de un lado y ocupada del otro | Evaluar por casillero; no bloquear ni desactivar el lado equivocado. |
| Retroceder una entrada directa a octavos | Usar el destino elegido, conservar IDs y reactivar el recorrido sin BYEs ficticios. |
| Procesar/desprocesar BYE real | Conservar avance y reversión actuales adaptados a ramas activas. |
| Ganador de un partido | Ocupar el destino del árbol; ningún override manual bloquea ese avance. |
| Resultado de zona después de armar llave | Cambiar estadísticas y posiciones; conservar asignaciones manuales. |
| Partidos finalizados | Conservar restricciones actuales, sin borrar resultados por arrastre. |
| Dos organizadores guardan o resultado concurrente | Una edición coherente; el conflicto restante se comunica sin corromper la llave. |
| Fallo durante guardado/generación | No dejar parejas, ramas o fase parcialmente guardadas. |
| Ramas inactivas y horarios/cierre | No programarlas ni contarlas como pendientes. |
| Pareja en rondas sucesivas | Permitir el avance legítimo; no confundirlo con doble entrada inicial. |
| Americano existente y LONG | Mantener generación, clasificación, reorganización, BYEs y finalización actuales. |

## 7. Límites y decisiones de arquitectura

- Decisión cerrada: conservar ramas inactivas, confirmada por el usuario durante la preparación de este plan.
- La ubicación exacta de los metadatos de actividad/entrada se cierra en fase 0 después de revisar consumidores y esquema. Si aparecen alternativas relevantes que no se puedan resolver de forma clara, preguntar antes de escoger. No dar por aprobado un DDL concreto por este documento.
- Favorecer compartir componentes y lógica existentes; aislar las diferencias por modalidad para evitar cambios globales en otros torneos.
- No ampliar el máximo de rondas, añadir Oro/Plata, convertir torneos existentes automáticamente ni cambiar la política de regeneración como parte implícita de este trabajo.
- Revisar junto al usuario cualquier necesidad nueva de invalidar resultados, rehacer conexiones con partidos jugados, migrar torneos existentes o añadir un comportamiento distinto al acordado.

## 8. Entorno y despliegue

- Evidencia actual: código y migraciones locales. No se ha verificado el esquema remoto durante esta planificación.
- En este workspace, FV es el destino remoto por defecto: `bfmaqrythlwbfjuqumom`. Elite se verifica sólo cuando corresponda: `lzowflvgnspjdbvdxliy`.
- Para inspecciones remotas usar únicamente las conexiones de tenant autorizadas. No usar el MCP genérico `supabase`, `supabase-develop` ni el proyecto histórico.
- Crear y validar migraciones localmente siguiendo el flujo del repositorio. **Nunca aplicar, ejecutar o desplegar migraciones en remoto.** El propietario las despliega mediante su CI/CD.
- Si falta una conexión de tenant para verificar el esquema, conservar el trabajo local y declarar esa limitación; no reemplazarla por otra base.
