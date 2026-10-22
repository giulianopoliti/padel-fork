# Plan técnico: cobros parciales y mantenimiento mensual

Fecha: 22/10/2026. Estado: propuesta de implementación; no ejecuta cambios de aplicación ni de base de datos.

Actualización: el desarrollo local fue implementado y validado. Ver `resultado-cobros-parciales-mantenimiento-mensual.md` para los cambios, las pruebas y los pasos de publicación pendientes. Este documento conserva el plan original.

## Objetivo y alcance

En `/admin/cobros`, distinguir torneos sin pagos, parcialmente cobrados y cobrados por completo. Cada cuota mensual puede incluir una parte de los torneos y el mantenimiento de un mes identificado. Mostrar el saldo real, sin duplicar cobros ni mantenimiento.

Destino de implementación: Padel FV, proyecto Supabase `bfmaqrythlwbfjuqumom`. Mantener el comportamiento de TPE/Elite. Las migraciones se crean y validan localmente; el propietario las despliega mediante Supabase CI/CD. No ejecutar migraciones ni backfills contra ningún entorno remoto desde esta tarea.

## Evidencia y situación inicial

La consulta de solo lectura realizada durante el análisis encontró un cobro `bf12f935-6a03-458c-ac18-8005c2a2efaa` con:

| Concepto | Importe / cantidad |
| --- | ---: |
| Torneos incluidos | 21 |
| Subtotal de torneos | $1.190.000 |
| Cuotas mensuales | 2 |
| Mantenimiento por cuota | $69.750 |
| Total por cuota | $664.750 |
| Primera cuota | Cobrada el 07/10/2026 |
| Segunda cuota | Pendiente |
| Cobrado total | $664.750 |
| Saldo total | $664.750 |

Hay 14 torneos de $50.000 y 7 de $70.000. El usuario confirmó que cada mantenimiento corresponde a un mes diferente. Los meses exactos todavía no están informados.

Problemas identificados:

- `service.ts` y la lista inferior toman el estado individual desde `tournament_billing_charges`, sin incorporar el avance del cobro en cuotas.
- Los 21 torneos no tienen un cargo individual registrado y se muestran como pendientes por el importe completo.
- El pago de una cuota actualiza cuotas y cobro agrupado; no actualiza los estados individuales de los torneos.
- Los resúmenes suman importes completos de torneos pendientes, sin descontar cuotas cobradas.
- El mantenimiento se guarda en la cabecera del cobro como importe por cuota, sin un período mensual explícito.
- La interfaz permite seleccionar torneos que ya pertenecen a un cobro y muestra acciones individuales que luego el servidor rechaza.

## Decisiones de diseño

1. **Conservar los pagos actuales como fuente de verdad.** Registrar el pago una sola vez en `billing_installment_payments`. Calcular el avance de cada torneo desde sus cuotas; no crear pagos individuales adicionales para reflejar el mismo dinero.
2. **Conservar el total original de cada torneo.** Para los incluidos en un cobro, usar `billing_collection_tournaments.amount_ars`, no tarifas o inscripciones actuales.
3. **Separar conceptos dentro de cada cuota.** `importe de cuota = parte de torneos + mantenimiento mensual`. Solo la parte de torneos se reparte entre ellos.
4. **Diferenciar estado financiero calculado de estado administrativo almacenado.** Mantener inicialmente el enum actual de `tournament_billing_charges`; agregar `collectionStatus` y `financialStatus` al modelo de lectura. Un parcial no se convierte en `PAID` individual.
5. **Mantener la gestión desde las cuotas.** Los torneos incluidos en un cobro tendrán acceso a “Ver cuotas”; sus acciones individuales y selección para nuevos cobros quedarán deshabilitadas.
6. **No automatizar cargos mensuales futuros.** Esta entrega identifica y valida el mantenimiento de las cuotas creadas. La emisión recurrente automática queda fuera de alcance.

## Fase 1 — Contrato de datos y mantenimiento mensual

Preparar una migración aditiva mediante el flujo de Supabase CLI del repositorio. Como el mantenimiento se factura junto a la cuota mensual, extender `billing_collection_installments`, evitando una tabla de pagos paralela:

- `billing_month`: fecha del primer día del mes facturado, independiente de la fecha de emisión y de pago.
- `maintenance_amount_ars`: importe histórico de mantenimiento incluido en esa cuota, entero en pesos.
- `organization_id`: organización del cobro, con relación que garantice coincidencia con su cabecera.
- `billing_account_key`: identificador estable de la cuenta a la que se factura; derivado en el servidor, nunca desde un texto libre del cliente.

Para el cobro actual, cuya cabecera es de alcance tenant y tiene `organizer_id` nulo, la cuenta será la cuenta general de FV. Si se utilizan cobros por organizador, usar una clave estable basada en su UUID; nunca el nombre o email. Confirmar este alcance antes de fijar la restricción de unicidad para nuevas cuentas.

Restricciones e índices:

- `0 <= maintenance_amount_ars <= amount_ars`.
- El período, cuando exista, debe ser el primer día de un mes.
- Índice único parcial por organización, cuenta y mes para cuotas con mantenimiento positivo y período conocido. Debe impedir duplicados incluso con solicitudes concurrentes.
- No reservar un mantenimiento mensual para cuotas con mantenimiento cero.
- Mantener los datos antiguos compatibles durante el despliegue: período histórico desconocido permitido y visible como “Mes por confirmar”. Los cobros nuevos con mantenimiento deben exigir período.
- Mantener RLS y acceso exclusivo desde el servidor administrador, como en las tablas actuales. La relación con la organización debe validarse también en la base.

La cabecera `maintenance_amount_per_installment_ars` se conserva como dato histórico y compatibilidad inicial. Después de la transición, el cálculo financiero usa el detalle de cada cuota; no sumar nuevamente el importe de cabecera.

## Fase 2 — Cálculo de cobrado y saldo por torneo

Agregar funciones puras de cálculo en `lib/billing/`, consumidas desde el servidor por la pantalla y los reportes.

Algoritmo:

1. Tomar los importes originales de los torneos incluidos y las cuotas ordenadas por número.
2. Restar a cada cuota su mantenimiento para obtener el importe destinado a torneos.
3. Construir un reparto fijo entre cuotas y torneos, antes de considerar cuáles están pagadas. Para cada cuota, repartir proporcionalmente a los saldos todavía no asignados de los torneos, con redondeo por mayores restos y desempate por UUID. La última cuota recibe los saldos restantes.
4. Sumar únicamente las asignaciones de cuotas con pago confirmado para obtener lo cobrado por torneo.
5. Calcular `saldo = total original - cobrado` y derivar el estado.

Este orden permite cobrar la segunda cuota antes que la primera sin cambiar qué parte de cada torneo corresponde a cada cuota. No usar simplemente “cantidad de cuotas pagadas / cantidad de cuotas”, porque existen cuotas con importes diferentes y redondeos.

Invariantes obligatorias:

- Por torneo: suma de asignaciones = total original.
- Por cuota: suma de asignaciones a torneos + mantenimiento = importe de cuota.
- Por cobro: suma de pagos confirmados = cobrado de torneos + mantenimiento cobrado.
- Ningún saldo negativo, peso perdido ni diferencia entre pantalla y PDF.
- Cualquier inconsistencia histórica bloquea nuevas mutaciones del cobro y muestra un error de conciliación; no corregir importes silenciosamente.

Resultado esperado para el histórico:

| Torneos | Total unitario | Cobrado unitario | Saldo unitario |
| --- | ---: | ---: | ---: |
| 14 | $50.000 | $25.000 | $25.000 |
| 7 | $70.000 | $35.000 | $35.000 |

Torneos cobrados: $595.000. Mantenimiento cobrado: $69.750. Total recibido: $664.750.

## Fase 3 — Servidor, acciones y compatibilidad

Archivos principales:

- `lib/billing/types.ts`: estados calculados y campos de total original, cobrado, saldo, cobro relacionado y avance de cuotas.
- `lib/billing/service.ts`: cruzar torneos con colecciones; priorizar los importes congelados de la colección; calcular resúmenes con una única implementación.
- `lib/billing/rules.ts` o módulo nuevo de asignación: reparto determinístico y conciliación.
- `app/api/admin/billing/actions.ts`: validar períodos, alcance de cuenta, conceptos y totales.
- `database.types.ts`: actualizar los tipos desde la base local validada.

Actualizar o versionar la RPC de creación para guardar períodos y mantenimiento de cada cuota atómicamente. Mantener la firma anterior durante la transición para evitar romper la versión desplegada antes de publicar la aplicación nueva.

Al registrar pagos, validar que el mantenimiento y la parte de torneos concilien con el importe de cuota. Conservar la protección contra pagos duplicados y comprobar la concurrencia sobre el cobro completo: dos cuotas pagadas simultáneamente deben dejar el agregado correcto. Revisar el orden de bloqueos junto con la RPC de cancelación para evitar interbloqueos.

Al cancelar un cobro sin pagos, liberar también las reservas mensuales de mantenimiento asociadas. Seguir bloqueando la cancelación si ya hay un pago. Revalidar `/admin/cobros` después de cada mutación.

Mantener las reglas vigentes de TPE/Elite y los torneos individuales cobrados o descartados. No sobrescribir estados administrativos históricos durante el cálculo.

## Fase 4 — Interfaz, filtros y comprobantes

En `app/(main)/admin/cobros/billing-client.tsx`, tanto en escritorio como en móvil:

- Mostrar por torneo: total original, cobrado, saldo y estado financiero.
- Etiquetas: “Sin cobrar”, “Cobro parcial · 1 de 2 cuotas” y “Cobrado”. Distinguir también un cobro en cuotas todavía sin pagos.
- Mantener “Pendientes de cobro” como filtro que incluye saldos completos y parciales; agregar “Sin pagos” y “Cobro parcial”. Conservar acceso a descartados.
- Sustituir acciones individuales por “Ver cuotas” en torneos ya asociados. Excluirlos también de selección masiva, totales seleccionados y creación de otro cobro.
- En cada cobro: identificarlo, mostrar torneos por club, cuotas con mes facturado, fecha de pago, parte de torneos y mantenimiento.
- Al crear el cobro: elegir el primer mes y generar una cuota por mes consecutivo. Mostrar una vista previa de todos los períodos e importes y validar cada mes antes de confirmar. El mes representa el período facturado, no una fecha de vencimiento inferida.
- Ofrecer una sección de mantenimiento por mes, calculada desde las cuotas, sin convertirla en un segundo cargo.
- Si el período histórico es desconocido, mostrar “Mes por confirmar” y permitir completar ese dato con validación y trazabilidad.

Resúmenes:

- Saldo pendiente de torneos: suma de saldos de cada torneo, incluidos los parciales.
- Saldo de mantenimiento: suma de conceptos mensuales aún no cobrados.
- Total pendiente: suma de los dos anteriores.
- Cobrado: sumar cada pago una sola vez. Los cobros individuales ajenos a cuotas y los de cuotas deben consolidarse sin solaparse.
- Descartados no forman parte del saldo exigible.

Actualizar PDF consolidado y PDF de cuota con los mismos conceptos y períodos. Identificar claramente “cuota a pagar” frente a “pago recibido”; la emisión del PDF no modifica el saldo cobrado. Actualizar las exportaciones que presenten estados o importes afectados, preservando el reporte semanal de TPE.

## Fase 5 — Datos históricos y despliegue

Separar dos operaciones:

1. **Migración estructural aditiva:** campos, restricciones, índices y RPC compatible. Puede incluir la copia determinística del mantenimiento de cabecera a cada cuota existente, validando los totales. No requiere inventar meses.
2. **Carga histórica de períodos:** mapeo explícito de cuota a mes, limitado al proyecto, organización y cobro esperados. Ejecutar solo cuando el propietario informe los dos meses.

La carga histórica debe ser idempotente, transaccional y con precondiciones: importes, cuotas, pagos y organización deben coincidir con lo revisado. Si el estado cambió desde el análisis, detenerse y volver a conciliar. Conservar los IDs, pagos, fechas, totales y estados originales. Registrar el origen y la fecha de la asignación histórica.

Secuencia de entrega:

1. Preparar implementación y migraciones en local, con fixtures del caso real sin datos personales.
2. Validar migración sobre una base local que reproduzca el esquema actual y su compatibilidad con la aplicación anterior.
3. Entregar SQL, informe previo de conciliación, pruebas y los meses pendientes de completar.
4. El propietario despliega la migración mediante Supabase CI/CD.
5. Publicar la aplicación compatible con el esquema nuevo después de confirmar la migración.
6. El propietario incorpora los períodos históricos mediante el flujo aprobado; verificar resultados con consultas de solo lectura.
7. Auditar cobros creados durante la transición para detectar períodos pendientes. Retirar la RPC antigua en una entrega posterior, una vez comprobado que no tiene consumidores.

Reversión: conservar los campos nuevos y pagos; volver a la versión compatible anterior de la aplicación si fuera necesario. No borrar pagos ni ejecutar una migración destructiva para revertir esta entrega.

## Fase 6 — Pruebas y criterios de aceptación

Extender las pruebas existentes de `lib/billing/__tests__/rules.test.ts` y agregar pruebas SQL locales y de integración para las operaciones que cambian.

Casos obligatorios:

- Torneo individual sin pagos, cobrado y descartado.
- Cobro de 21 torneos con cero, una y dos cuotas pagadas.
- Segunda cuota pagada primero; cuotas desiguales; mantenimiento cero; importes con redondeos.
- Cambio de tarifa o inscripciones después de crear el cobro: los importes originales permanecen iguales.
- Mes desconocido histórico; mes inválido; mantenimiento duplicado; duplicado concurrente.
- Pago duplicado, pago simultáneo de cuotas diferentes y carrera entre pago y cancelación.
- Cruces de organización o cuenta rechazados en servidor y base de datos.
- Cancelación sin pagos libera el mes; cancelación con pagos se rechaza.
- Sumas de lista, resúmenes y PDFs coinciden sin duplicación.
- Flujo TPE/Elite conserva sus resultados.
- Revisión de interfaz móvil, escritorio, teclado y foco al navegar a una cuota.

Validaciones de entrega: pruebas específicas de billing, pruebas SQL locales, chequeo TypeScript y build FV; verificar también la compilación/configuración afectada de Elite. Registrar por separado fallos preexistentes y limitaciones del entorno.

Se considera terminado cuando los 21 torneos históricos muestran 50% cobrado, sus saldos suman $595.000, el mantenimiento pendiente suma $69.750 y el saldo del cobro es $664.750. Al registrar localmente la segunda cuota, los 21 deben pasar a cobrado y ambos saldos a cero.

## Datos pendientes y trabajo que puede avanzar

- Confirmar los dos meses del cobro histórico antes de cargar períodos.
- Validar la unidad de facturación del mantenimiento al habilitar cuentas distintas de la cuenta general de FV.

El cálculo, la interfaz, las pruebas y la migración estructural pueden desarrollarse mientras se aclaran esos datos. Este documento no autoriza ni ejecuta despliegues remotos.
