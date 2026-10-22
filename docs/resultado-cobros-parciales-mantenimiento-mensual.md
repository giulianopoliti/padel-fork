# Resultado de desarrollo: cobros parciales y mantenimiento mensual

Fecha: 22/10/2026. Implementación local para FV. Sin despliegue de aplicación ni ejecución de migraciones en entornos remotos.

## Comportamiento implementado

- Cada torneo muestra total original, cobrado y saldo. Los incluidos en cuotas obtienen su estado financiero desde los pagos de esas cuotas, manteniendo el estado administrativo original.
- La lista distingue “Sin cobrar”, “Cobro parcial” y “Cobrado”. El filtro “Pendientes de cobro” incluye saldos completos y parciales; hay filtros específicos de “Sin pagos” y “Cobro parcial”.
- Un torneo ya asociado a un cobro queda excluido de la selección individual y masiva; su acción es “Ver cuotas”.
- El resumen cuenta cada pago una sola vez y separa saldo de torneos y mantenimiento.
- La creación de cobros exige el primer mes facturado y genera meses consecutivos, con vista previa de conceptos e importes.
- Las cuotas guardan el importe histórico del mantenimiento, el mes, la organización y la cuenta facturada. Un índice único impide repetir mantenimiento positivo para la misma organización, cuenta y mes.
- Los meses históricos desconocidos aparecen como “Mes por confirmar”. Un administrador puede asignarlos individualmente, conservando autor y fecha de la asignación. Una asignación ya hecha requiere revisión administrativa para cambiarse.
- El detalle muestra los torneos incluidos por club y un listado del mantenimiento mensual. Ambos representan los mismos cargos, no cargos duplicados.
- El PDF consolidado separa cuotas y torneos, con cobrado y saldo. El PDF de cuota diferencia importe a pagar de recibo cobrado, y muestra el mantenimiento separado.
- El cálculo distribuye primero el calendario completo entre los torneos, con aritmética entera y redondeo determinístico. El resultado no depende del orden de los pagos.
- Las lecturas paginan colecciones y sus relaciones para evitar omisiones por el límite de 1.000 filas de Supabase.

## Archivos

- `lib/billing/financials.ts`: asignación de importes, saldos, filtros, resúmenes y períodos.
- `lib/billing/service.ts` y `types.ts`: integración de colecciones, importes congelados, lectura paginada y compatibilidad con esquema anterior.
- `app/api/admin/billing/actions.ts`: creación mensual, asignación de meses históricos y validación previa al pago.
- `app/(main)/admin/cobros/billing-client.tsx`, `installment-month-editor.tsx`, `error.tsx`: interfaz y errores.
- `supabase/migrations/20261022160854_billing_monthly_maintenance.sql`: cambio estructural, copia determinística del mantenimiento histórico, RPC mensual y serialización de pagos.
- `lib/billing/__tests__/financials.test.ts`, `service.test.ts`, `rules.test.ts`: pruebas de cálculo y lectura.
- `supabase/tests/billing_monthly_maintenance.sql`, `billing-monthly-concurrency.mjs`: integración y concurrencia locales.

`database.types.ts` es actualmente un fallback `Database = any` en este repositorio. No se reemplazó globalmente con una generación que produciría cambios ajenos al alcance; los DTO de billing sí se actualizaron explícitamente.

## Validaciones realizadas

1. Pruebas de Jest específicas de billing: cálculo histórico, cuotas desiguales, redondeos, importes grandes, cuotas fuera de orden, totales inconsistentes, cargos individuales TPE, mezcla de pendientes y parciales, lectura con esquema anterior y más de 1.000 torneos relacionados.
2. Pruebas SQL en PostgreSQL local con transacción y rollback: meses inválidos, mantenimiento duplicado, cuota sin mantenimiento en un mes ya facturado, aislamiento de organización, cancelación sin pagos y liberación del mes, compatibilidad con RPC anterior, asignación histórica idempotente, importes originales inmutables y privilegios.
3. Migración ejecutada y revertida en transacción local, incluida una repetición que reconstruyó temporalmente el esquema previo para verificar la copia de importes en cuotas existentes. Luego se aplicó exclusivamente a la base local de pruebas para verificar el flujo HTTP.
4. Concurrencia real con dos conexiones locales: pagos de cuotas hermanas, pago repetido, carrera entre pago y cancelación, y dos solicitudes por el mismo mantenimiento mensual. Los fixtures de estas pruebas se eliminan al terminar.
5. Flujo HTTP autenticado contra Next.js local con datos sintéticos: rechazo de mantenimiento duplicado; creación de noviembre y diciembre; registro de la segunda cuota del cobro histórico reproducido; saldo final cero; rechazo de pago repetido. La página renderizada muestra los 21 torneos completos después del segundo pago.
6. Navegador local, antes de que se deshabilitara su uso en Work: login QA, lista de 21 parciales al 50%, filtro “Cobro parcial”, exclusión de selección, asignación de septiembre/octubre a cuotas ficticias y descarga del PDF consolidado.
7. PDF consolidado de QA extraído, renderizado e inspeccionado visualmente. Los torneos de $50.000 muestran $25.000 cobrados y $25.000 de saldo; los de $70.000 muestran $35.000/$35.000. El mantenimiento queda separado.
8. Resultado final: 25 pruebas Jest aprobadas; suite SQL aprobada; cuatro escenarios de concurrencia aprobados; builds de producción con configuración FV y Elite aprobados, ambos contra el entorno de datos local de QA.
9. Advisors de Supabase ejecutados exclusivamente con `--local`: no reportaron hallazgos para los objetos de billing. La base local contiene hallazgos en otras áreas que quedan fuera de este cambio.

Comandos repetibles de pruebas, exclusivamente locales:

```powershell
npm test -- --runInBand --runTestsByPath lib/billing/__tests__/financials.test.ts lib/billing/__tests__/rules.test.ts lib/billing/__tests__/service.test.ts
node supabase/tests/billing-monthly-concurrency.mjs
$billingSql = Get-Content -LiteralPath 'supabase/tests/billing_monthly_maintenance.sql' -Raw
@('BEGIN;', $billingSql, 'ROLLBACK;') | docker exec -i supabase_db_padel-base-main-test psql -v ON_ERROR_STOP=1 -U postgres -d postgres
```

Las pruebas SQL requieren el esquema actualizado y un usuario de prueba local existente. La prueba de concurrencia usa explícitamente el contenedor local `supabase_db_padel-base-main-test`; no acepta una URL remota.

## Limitaciones de verificación

- El chequeo global de TypeScript tiene numerosos errores previos fuera de billing. El último chequeo no produjo diagnósticos para los archivos modificados de billing.
- `next lint` no puede ejecutarse porque ESLint no está instalado en las dependencias del repositorio.
- La configuración existente de Next.js omite chequeo de tipos y lint durante el build; por eso un build correcto no equivale a un typecheck global correcto.
- El navegador local quedó deshabilitado en la configuración de Work durante la verificación. La revisión móvil y el último cierre del pago desde un clic no se completaron en navegador; el cierre sí se comprobó mediante HTTP autenticado, base de datos y contenido renderizado de la página.
- Las pruebas de desarrollo utilizan datos ficticios locales. Los meses reales del cobro de FV no se asignaron ni se dedujeron de fechas de pago.

## Publicación y datos pendientes

1. El propietario revisa y despliega la migración mediante Supabase CI/CD. La migración no modifica pagos, fechas de pago ni totales: copia el importe de mantenimiento de cada cabecera a sus cuotas y deja los meses históricos nulos.
2. Publicar la aplicación. La lectura de saldos parciales también funciona antes de la migración, pero la creación de cuotas mensuales y la asignación de meses permanecen deshabilitadas hasta que el esquema esté actualizado.
3. Confirmar los dos meses reales del cobro FV existente y asignarlos desde el administrador. Los períodos usados en QA no son datos históricos confirmados.
4. Verificar en FV por lectura: $595.000 pendientes en los 21 torneos, $69.750 de mantenimiento pendiente y $664.750 de saldo del cobro, siempre que no se hayan registrado nuevos pagos desde el análisis.
5. Completar la revisión visual móvil antes de publicar.

La cuenta implementada para los nuevos cobros de esta pantalla es la cuenta general de FV (`tenant`), como la cabecera actual. El esquema contempla claves por organizador, pero esta entrega no agrega una interfaz de cuentas múltiples.

Mientras existan cuotas históricas sin mes, no pueden detectarse duplicados contra sus períodos desconocidos. Completar esos meses antes de generar nuevo mantenimiento para los mismos períodos. La RPC anterior permanece disponible para compatibilidad temporal; auditar cualquier cuota creada sin período durante la transición.

## Sincronización posterior del historial local

Al ejecutar el propietario `migration up --include-all`, la base local intentó recrear `reset_american_free_tournament`, que ya existía. Se inspeccionó el historial completo: faltaban cinco versiones. Se compararon las funciones con los archivos (cuerpos idénticos normalizando saltos de línea), columnas, restricciones, índices, trigger y permisos.

Cuatro cambios ya estaban presentes y se registraron exclusivamente con `migration repair --local --status applied`: `20261020161721`, `20261021150850`, `20261021163545` y `20261022160854`. Para billing, la causa fue su aplicación SQL directa durante las pruebas locales, sin registro en el historial del CLI. La versión `20261021202643`, cuyo cuerpo de función todavía difería, se aplicó mediante `migration up --local --include-all`.

Una segunda ejecución no encontró migraciones pendientes. Las huellas de los registros de usuarios, torneos, colecciones, asociaciones, cuotas y pagos permanecieron idénticas antes y después. La suite SQL de billing volvió a pasar. No se alteraron archivos de migraciones históricas ni entornos remotos.
