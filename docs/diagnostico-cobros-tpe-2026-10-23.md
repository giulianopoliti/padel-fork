# Diagnóstico de la captura de cobros TPE — 23/10/2026

## Resultado

Se reprodujo exactamente el resumen de la captura: **9 semanas y $556.000**. No se encontró un cálculo diferente entre administración y organizador ni un desplazamiento de fechas en el código y los datos auditados.

La causa de que esos períodos se presenten como deuda es la regla que convierte un torneo **sin registro en `tournament_billing_charges`** en estado `PENDING`, calculando su importe con las inscripciones actuales y la tarifa vigente. Esa ausencia de registro no prueba que el cliente no haya pagado por otro medio.

## Evidencia y alcance

- MCP utilizado: `supabase-elite`, proyecto `lzowflvgnspjdbvdxliy`, organización `padel-elite`.
- Sólo consultas de lectura. No se modificaron pagos, migraciones ni datos remotos.
- Se leyeron 419 torneos AMERICAN no marcados como prueba, 87 registros de cobro y 1.852 inscripciones, con los identificadores y flags necesarios para ejecutar el cálculo real.
- Se ejecutó `getTenantBillingDashboard` sobre una copia local de esas filas, tanto con `{ readOnly: true }` como en modo administración. Los resultados coincidieron en las 23 semanas disponibles. Los saldos de cada semana coincidieron con el resumen global.
- Los 87 registros de cobro existentes están en estado `PAID`. Ninguno de los 96 torneos con saldo que forman el reclamo de la captura tiene un registro de cobro. No hay un `PAID` convertido a `PENDING` en esa lista.
- No se encontraron pagos guardados bajo una organización distinta, fechas de inicio faltantes en torneos elegibles ni divergencias entre la semana guardada de un pago y la semana calculada por su fecha de inicio.
- No hay cobros en cuotas ni publicaciones manuales de legado para este tenant que expliquen pagos omitidos de otra tabla del sistema de billing.

## Semanas de la captura

| Semana | Importe calculado | Torneos con saldo sin registro de cobro |
| --- | ---: | ---: |
| 17/08–23/08 | $80.000 | 12 |
| 24/08–30/08 | $60.000 | 9 |
| 07/09–13/09 | $61.000 | 10 |
| 14/09–20/09 | $47.000 | 7 |
| 21/09–27/09 | $42.000 | 9 |
| 28/09–04/10 | $90.000 | 14 |
| 05/10–11/10 | $53.000 | 8 |
| 12/10–18/10 | $60.000 | 11 |
| 19/10–25/10 | $63.000 | 16 |
| **Total** | **$556.000** | **96** |

Estos importes son una estimación derivada del código, no una confirmación de deuda comercial. La tarifa actual es **$500 por jugador**. Al no existir una liquidación guardada para estos torneos, el sistema vuelve a calcular el importe a partir de su situación actual.

La semana **31/08–06/09** sí tiene **8 torneos registrados como `PAID`, por $86.000**, y saldo cero. Por eso no aparece entre el 24/08–30/08 y el 07/09–13/09 en la lista de pendientes. Ese salto no es un corrimiento de días. Los pagos anteriores hasta la semana 10/08–16/08 también permanecen fuera del reclamo.

## Fechas y diferencia de alcance visual

- Ambos paneles llaman a `getTenantBillingDashboard` y usan el mismo componente `BillingClient`. El modo de sólo lectura oculta las acciones administrativas; no cambia el estado de los cobros.
- Ambos usan lunes a domingo en `America/Argentina/Buenos_Aires`.
- Las fechas sin hora se formatean a partir de las 12:00 UTC para evitar que la conversión horaria las cambie al día anterior. El resumen usa fechas sin ceros iniciales y el detalle usa dos dígitos: es una diferencia de formato.
- La captura es el **resumen global de pendientes**, no el detalle de la semana seleccionada. Por diseño suma la semana actual y las anteriores. Incluye la semana en curso aunque todavía no haya terminado; el sistema no tiene un vencimiento semanal independiente.

## Qué corrigió el selector y qué sigue pendiente

El selector agregado permite consultar también las semanas pagadas. No cambia la regla que infiere deuda a partir de registros ausentes. La explicación anterior que atribuía todo a la navegación fue incompleta.

Si alguna de las nueve semanas ya fue pagada, falta conciliarla con la contabilidad real y registrar ese pago, o definir un período inicial de cobro explícito si esos históricos no debían reclamarse. No corresponde marcar semanas pagadas ni ocultarlas arbitrariamente a partir de esta captura. Para afirmar el monto exigible al cliente, debe validarse esa conciliación; el total de $556.000 por sí solo no la sustituye.
