# Americanos: cierre, puntajes y ascensos manuales

Fecha: 27/10/2026. Alcance: Padel FV y TPE / Padel Elite.

## Resultado del análisis

El cierre deportivo y la acreditación de puntos son dos operaciones distintas. El botón **Finalizar torneo** guarda los bonos y cambia el estado a `FINISHED_POINTS_PENDING`; no calcula ni acredita puntos ni abre automáticamente su revisión. Luego hay que pulsar **Calcular Puntos** y **Confirmar y Aplicar Puntos**.

Hay además un defecto de notificaciones: `FinalizeTournamentControl` usa `toast` de Sonner, mientras que el layout principal monta el Toaster basado en `use-toast`. No se encontró montado el Toaster de Sonner en ese recorrido. Los mensajes de éxito y error del cierre pueden quedar sin mostrarse.

La implementación actual de la API de puntos no ejecuta ascensos automáticos. Sin embargo, existe otro procesador exportado en `app/api/tournaments/actions.ts` que sí recategoriza por puntaje; no se encontraron consumidores externos de ese procesador en el recorrido actual. Hay que eliminar esa divergencia antes de garantizar una política única.

El cambio pedido debe fijar esta regla: **sumar puntos nunca cambia la categoría oficial; el organizador decide individualmente los ascensos desde la misma revisión de puntos**.

## Evidencia consultada

Se revisaron código, migraciones locales, tests existentes y datos remotos mediante consultas de lectura. Se verificó el destino de las credenciales contra estos proyectos:

| Tenant | Proyecto | Americanos con puntos pendientes | Americanos con puntos calculados |
| --- | --- | ---: | ---: |
| FV | `bfmaqrythlwbfjuqumom` | 1 | 1 |
| Elite | `lzowflvgnspjdbvdxliy` | 25 | 0 |

Los conteos son exactos para torneos `type = AMERICAN` y `es_prueba = false` al momento de la consulta. No son conteos de todos los tipos de torneo.

Casos contrastados:

| Tenant / torneo | Estado | Partidos activos / pendientes | Historial de jugadores | Snapshots | Registros de puntos por partido |
| --- | --- | --- | ---: | ---: | ---: |
| FV: C6 Lasaigues Almagro 11/10, `a3f4eed2-ceb6-4cf2-9cb7-02a927c3fb8e` | Puntos pendientes | 23 / 0 | 0 | 0 | 0 |
| FV: C7 Lasaigues Almagro 20/09, `8fa4a224-8068-4062-8b57-328fe633daf9` | Puntos calculados | 15 / 0 | 16 | 16 | 15 |
| Elite: Caballeros 7ma, `ae1c6af9-e63a-496b-86bb-439b3ef2d464` | Puntos pendientes | 25 / 0 | 0 | 0 | 0 |
| Elite: Damas 5ta, `cc98f136-38f0-4daa-816d-192858c3f4f1` | Puntos pendientes | 26 / 0 | 0 | 0 | 0 |

Se examinaron los 2 Americanos de FV y los 20 más recientes de Elite en estados de llaves, puntos pendientes o puntos calculados. Los 12 pendientes incluidos en esa muestra de Elite no tienen registros en las tres tablas de puntos consultadas. No se extrapola esa comprobación detallada a los otros 13 pendientes.

Los endpoints públicos de `finalization-status` de los dos casos pendientes de FV y Elite indicados arriba respondieron HTTP 200, `allMatchesFinished: true`, `FINISHED_POINTS_PENDING` y sin motivo de bloqueo. Es consistente con un cierre deportivo realizado y una acreditación pendiente.

No se reprodujo el clic con la sesión del organizador ni se consultaron logs de esa petición. Por eso no puede atribuirse un error específico de autenticación, permisos o base de datos al clic reportado. La separación de pasos y la incompatibilidad de notificaciones sí están confirmadas en el código.

No se llamó al GET de preview de puntos en producción: actualmente puede insertar snapshots. No se modificaron jugadores, torneos, políticas ni esquemas remotos.

## Proceso actual

1. Deben terminar todos los partidos activos, incluidas las zonas y las finales requeridas. Oro/Plata exige ambas finales.
2. En Llaves, **Finalizar torneo** abre el formulario de bonos por copa.
3. La confirmación guarda esos bonos, campeón principal, fecha de cierre y estado de puntos pendientes. En Americano libre utiliza la RPC con revisión de la llave.
4. Aparece un bloque distinto con **Calcular Puntos** y **Recategorizar Jugadores**. No se abre sola la tabla de puntos.
5. **Calcular Puntos** consulta el preview: obtiene o crea snapshots, calcula partidos y bonos y devuelve el puntaje anterior, movimiento y total por jugador.
6. **Confirmar y Aplicar Puntos** vuelve a calcular, actualiza jugadores, intenta guardar los historiales y cambia el estado a `FINISHED_POINTS_CALCULATED`.
7. La recategorización manual actual se hace en otra pantalla y también cambia el puntaje al mínimo de la categoría elegida.

## Qué se calcula hoy

| Concepto | Americano |
| --- | --- |
| Victoria con parejas de igual puntaje promedio | +12 por jugador |
| Derrota con parejas de igual puntaje promedio | -8 por jugador |
| Ajuste por diferencia entre promedios | Cada 50 puntos: ajuste de 1,5 para ganador y 1 para perdedor; redondeado y limitado |
| Rango por victoria | +6 a +24 |
| Rango por derrota | -18 a -4 |
| Bono predeterminado campeón MAIN / GOLD | +30 por jugador |
| Bono predeterminado subcampeón MAIN / GOLD | +10 por jugador |
| Bono SILVER | Desactivado por defecto; se puede habilitar y configurar |

Los puntos de partidos se acumulan tanto en zonas como en eliminación. El modo Oro/Plata no cambia la fórmula de partidos. Los bonos se agregan al resultado de los partidos, incluida la final: no reemplazan los puntos de esa final.

Ejemplo con igualdad de puntajes: el campeón gana +12 por la final y +30 de bono; el subcampeón obtiene -8 por la final y +10 de bono. A ambos se les suma también su recorrido anterior.

Los bonos son configurables por copa, con importes independientes para campeón y subcampeón, enteros de 0 a 10000. Cada miembro de la pareja recibe el importe completo. Un valor 0 permite suprimir un bono sin suprimir el otro.

La elegibilidad implementada es por copa habilitada y posición final; no hay un selector de elegibilidad individual ni una regla por categoría o umbral de puntos. No hay un vínculo obligatorio entre recibir un bono y ascender.

El cálculo de partidos excluye encuentros incompletos, ramas inactivas y partidos asociados a descalificaciones activas. Un BYE con una sola pareja no genera puntos de partido. Los bonos, en cambio, se calculan desde las finales y no pasan por el mismo filtro de descalificaciones: falta acordar y probar esa regla para finales resueltas por descalificación.

No se encontraron Americanos con `format_config.bracketMode = GOLD_SILVER` en ninguno de los dos proyectos consultados. El comportamiento de esas copas se verificó en código y tests; no mediante una acreditación real en producción.

## Problemas que debe resolver el cambio

| Prioridad | Hallazgo | Consecuencia |
| --- | --- | --- |
| P0 | Cerrar no lleva automáticamente a revisar puntos; mensajes Sonner sin receptor en el layout | El organizador no sabe si terminó la operación ni qué debe hacer después |
| P0 | Actualizaciones de jugadores, movimientos y estado final mediante peticiones separadas | Una falla puede dejar aplicación parcial; un reintento puede acreditar dos veces |
| P0 | Preview y confirmación recalculan con datos que pueden haber cambiado | Lo confirmado puede diferir de lo mostrado, incluso con otra pestaña abierta |
| P0 | La recategorización actual reemplaza el puntaje por el mínimo de la nueva categoría | Puede borrar parte de la ganancia del torneo o agregar un ajuste que no es deportivo |
| P1 | Hay un procesador histórico con ascensos/descensos automáticos | La política manual puede romperse si se reutiliza ese procesador |
| P1 | El GET de preview escribe snapshots y los crea al revisar, aunque se llamen `tournament_start` | La base de cálculo no representa necesariamente el puntaje al inicio del torneo |
| P1 | Errores al guardar historial y puntos por partido se consideran no críticos | Puede informarse éxito sin trazabilidad completa |
| P1 | La recategorización verifica permiso del torneo, pero no verifica explícitamente en su POST que todos los jugadores enviados pertenezcan a él | Hay que validar alcance de jugadores en servidor, además de RLS y permisos del actor |
| P1 | La tabla del preview agrega partidos y bonus en un movimiento; no muestra categoría ni decisiones manuales | Falta el desglose necesario para revisar el cierre |
| P1 | Errores de preview y aplicación se reemplazan por mensajes genéricos | El organizador no puede distinguir partidos pendientes, conflicto, sesión o permisos |

## Experiencia propuesta

Un único flujo con pasos dentro del mismo popup, o pantalla completa en móvil:

**Finalizar torneo → Bonos por copa → Revisar puntos y ascensos → Confirmar y aplicar → Resumen guardado.**

Para torneos que ya están en puntos pendientes, **Revisar puntos y ascensos** debe reabrir directamente ese flujo.

La revisión muestra:

| Jugador | Categoría oficial | Puntos antes | Partidos | Bono / copa | Total después | Decisión manual |
| --- | --- | ---: | ---: | --- | ---: | --- |
| Ejemplo A | 7ma | 890 | +24 | +30 / Oro campeón | 944 | Mantener 7ma / Ascender a 6ta |
| Ejemplo B | 7ma | 850 | -8 | +10 / Oro subcampeón | 852 | Mantener 7ma / Ascender a 6ta |

Los números de esta tabla son ilustrativos.

Reglas propuestas:

- Todos los jugadores empiezan con **Mantener categoría**. Ningún ascenso está preseleccionado, aunque el puntaje cruce el rango.
- Se puede ascender por decisión deportiva sin alcanzar un umbral de puntos. La categoría sugerida, si se muestra, es informativa.
- Los dos integrantes de una pareja pueden recibir decisiones diferentes. Campeón, bono y ascenso son conceptos independientes.
- La categoría oficial sigue siendo la almacenada en el jugador; ranking, filtros e inscripciones deben respetarla aunque los puntos queden fuera de su rango histórico.
- Como criterio inicial, el ascenso conserva el puntaje resultante del torneo. Cualquier ajuste al puntaje de ingreso a una categoría debe ser otra decisión explícita, visible y auditada. Esto es una propuesta de producto que debe cerrarse antes de implementar esa parte, no una regla deducida del pedido.
- Se propone que los descensos también requieran decisión manual; el requisito explícito del pedido son los ascensos.
- El organizador puede cerrar deportivamente y dejar puntos pendientes, con un botón separado y un mensaje permanente que lo explique.
- Luego de acreditar, se puede volver a abrir el resumen persistido. Cambiar categorías más adelante utiliza una operación manual separada y nunca vuelve a aplicar los puntos.
- Si un torneo no admite finalizar, se muestran los partidos o las copas que faltan. Si falla el guardado, el error queda dentro del popup y permite reintentar.

## Plan de implementación

### Fase 1 — Hacer visible y continuo el cierre

1. Unificar las notificaciones del control con el sistema montado en el layout y agregar errores persistentes dentro del diálogo.
2. Coordinar ambos diálogos desde un estado de cierre compartido. Tras guardar bonos/cierre, abrir la revisión automáticamente.
3. Renombrar el acceso posterior a **Revisar puntos y ascensos**, accesible en pendientes y con resumen de solo lectura en acreditados.
4. Conservar los bloqueos deportivos actuales, las dos finales en Oro/Plata y el control de revisión del Americano libre.

Archivos principales: `FinalizeTournamentControl.tsx`, `PointsCalculationBanner.tsx`, `points-review-dialog.tsx`, `useTournamentFinalization.ts`, y sus contenedores de llaves estándar/libres.

Aceptación: cada clic muestra carga y un resultado visible; finalizar abre la revisión; cerrar el popup permite retomarla sin perder el estado del torneo.

### Fase 2 — Fijar el contrato de puntos y categoría

1. Adoptar un único servicio de cálculo/acreditación y retirar o delegar el procesador histórico que recategoriza automáticamente.
2. Añadir categoría actual y decisiones manuales al DTO de revisión; ninguna decisión se deriva automáticamente del total.
3. Separar en los datos puntos de partidos, bono de campeón/subcampeón, copa y cualquier ajuste manual posterior.
4. Conservar los valores deportivos actuales como primera versión. La fórmula ELO y los importes base pueden revisarse después con ejemplos comparables; no hace falta reemplazarlos para implementar ascensos manuales.
5. Usar configuración de bonos guardada por torneo. Si se agregan defaults por tenant, versionarlos y copiar la regla efectiva al cierre para que una configuración nueva no altere historiales anteriores.
6. Definir tratamiento de finales por descalificación, participantes sin categoría y posibles excepciones individuales de bonus. El selector individual de bonus solo se incorpora si el organizador necesita esa excepción; hoy la selección existente es por copa.
7. Adaptar la recategorización independiente para que no restablezca silenciosamente el puntaje mínimo y no mantenga una segunda política incompatible.

Aceptación: un jugador que pasa de 890 a 944 sigue en 7ma salvo decisión explícita; el bono no obliga al ascenso y el ascenso no exige bono.

### Fase 3 — Acreditación atómica y repetible sin duplicados

1. Preparar una liquidación con identificador, versión de reglas y huella/revisión de resultados, bonos, composición de parejas, puntajes y categorías usados.
2. Hacer que la consulta de preview sea de solo lectura. La preparación persistente debe ser una operación explícita.
3. Capturar la base de puntajes en un momento deportivo definido, idealmente al comenzar el torneo. Para torneos viejos sin snapshot, identificar la base utilizada y no presentarla como una captura histórica real.
4. Confirmar con una operación transaccional de PostgreSQL que valide actor, torneo, participantes y versión; acredite puntos; aplique únicamente cambios de categoría seleccionados; guarde movimientos y auditoría; y marque el torneo acreditado.
5. Bloquear las filas necesarias con orden estable y usar una clave única de liquidación por torneo. Un reintento devuelve la liquidación existente; no suma otra vez. Torneos diferentes que comparten jugadores tampoco deben sobrescribir sus saldos.
6. Si cambian puntajes/categorías o resultados desde la revisión, devolver conflicto, refrescar el preview y exigir revisar el nuevo resultado. No sobrescribir con un saldo calculado antes.
7. Guardar actor, fecha, categoría anterior/nueva, puntos antes/después, partidos, bonos y motivo de cada cambio manual. Si falla una escritura obligatoria, revertir todo.
8. Verificar autorizaciones de la operación y de las tablas que modifica; no confiar en importes enviados desde el navegador ni en RLS histórica sin revisión.

Diseño orientativo: cabecera de liquidación por torneo y detalle por jugador, aprovechando `player_tournament_history` y `player_recategorizations` donde corresponda. Definir el esquema final después de contrastar ambos proyectos; las migraciones se preparan y validan localmente.

Aceptación: doble clic, dos organizadores y una falla intermedia producen una sola acreditación completa o ninguna, con error visible.

### Fase 4 — Resumen, ranking e inscripciones

1. Mostrar desglose por jugador y por copa, ganadores identificados y categorías decididas manualmente.
2. Guardar el resumen para consultarlo luego; no reconstruir un cierre viejo con reglas actuales.
3. Verificar ranking público, fichas, filtros por categoría, validaciones SINGLE/RANGE/SUMA y categorización inicial de jugadores nuevos.
4. Revalidar torneo, ranking, perfil y listados afectados tras confirmar, para evitar saldos y categorías visualmente antiguos.
5. Permitir una recategorización manual posterior sin repetir la acreditación deportiva.

### Fase 5 — Verificación en ambos tenants

Matriz mínima:

- Americano de llave única, multizona, zona única y libre.
- Oro/Plata: ambas habilitadas, solo Oro, solo Plata y sin bonos; campeón y subcampeón con valores diferentes y con cero.
- Cruce de umbral sin ascenso, ascenso seleccionado a un solo integrante y ascenso sin cruzar umbral.
- Partidos/finales pendientes, BYEs, ramas inactivas y finales por descalificación con la regla acordada.
- Cambio de bonos, resultados o saldo entre preview y confirmación.
- Doble clic, dos sesiones, dos torneos con jugadores compartidos, error de auditoría y reintento tras timeout.
- Actor sin permiso, jugador ajeno al torneo y selector de categorías limitado a las existentes en cada proyecto.
- Resumen persistido, datos actualizados y recorrido móvil/teclado en FV y Elite.

### Fase 6 — Recuperar torneos pendientes y desplegar

1. Inventariar los 26 Americanos pendientes y contrastar los restantes historiales, snapshots y movimientos antes de acreditar.
2. Mostrar una revisión específica para torneos antiguos sin snapshot. Los puntajes actuales pueden incluir actividad posterior; no reconstruir automáticamente una base histórica inexistente.
3. Revisar y confirmar cada liquidación pendiente. No hacer una acreditación masiva ni reinterpretar torneos ya calculados con reglas nuevas por defecto.
4. Probar fixtures aislados de ambos tenants y preparar despliegues de aplicación/configuración correspondientes a sus proyectos.
5. El propietario despliega las migraciones por el CI/CD de Supabase. No aplicar, empujar ni ejecutar migraciones contra remotos desde este trabajo.

## Verificación realizada en esta revisión

Comando ejecutado contra las rutas exactas del workspace:

```text
npm test -- --runInBand --runTestsByPath lib/tournaments/__tests__/finalization.test.ts app/api/tournaments/__tests__/finalization-route.test.ts lib/services/points/__tests__/points-permissions.test.ts
```

Resultado: **3 suites y 38 tests aprobados**. Cubren cierre manual, requisitos de finales, configuración y reparto de bonos por copa y cálculo con permisos de columnas restringidos. No prueban la experiencia completa de clics, la atomicidad ni los nuevos ascensos manuales.

## Referencias de implementación

- `components/tournament/bracket-v2/components/FinalizeTournamentControl.tsx`: petición de cierre, configuración de bonus y notificaciones.
- `components/tournament/bracket-v2/components/PointsCalculationBanner.tsx`: segundo paso y acceso a recategorización separada.
- `components/tournament/points-review-dialog.tsx`: preview y confirmación actuales.
- `app/(main)/layout.tsx` y `components/ui/toaster.tsx`: sistema de notificaciones montado.
- `app/api/tournaments/[id]/finalization-status/route.ts` y `lib/tournaments/finalization.ts`: elegibilidad, persistencia de bonos y estados.
- `app/api/tournaments/[id]/points/route.ts` y `lib/services/points/`: cálculo y aplicación actuales.
- `app/api/tournaments/[id]/recategorize-players/route.ts`: reemplazo del puntaje por el mínimo de categoría.
- `app/api/tournaments/actions.ts`: procesador histórico y recategorización por puntaje.
- `lib/services/tournament-category-config.ts` y `app/api/users.ts`: categoría oficial, inscripción y ranking.
- `supabase/migrations/20261019221832_americano_libre_sports.sql`: cierre de Americano libre mediante RPC.

Este documento es un diagnóstico y plan. No se implementaron cambios funcionales ni se acreditaron puntos durante su elaboración.
