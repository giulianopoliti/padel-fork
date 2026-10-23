# Aviso de pago y cuenta TPE

Exclusivo de `padel-elite` / `tpepadel.com` (proyecto remoto: `lzowflvgnspjdbvdxliy`).

## Uso

- En `/admin/cobros`, **Mostrar aviso de pago** activa o desactiva manualmente el reclamo al organizador. Empieza apagado y no cambia al registrar pagos.
- Al ingresar, el organizador ve “Regularizá tu cuota para evitar la suspensión del servicio”, un diálogo por inicio de sesión y un aviso persistente con enlace a `/cobros`. Se consulta el interruptor cada 60 segundos y al recuperar foco.
- `/cobros` utiliza exactamente `getTenantBillingDashboard` y `BillingClient`, los mismos datos y vista del panel administrativo, en modo de sólo lectura. Muestra tarifa vigente por jugador, semanas, torneos, jugadores, parejas, importes, estados y resúmenes. Permite buscar, filtrar, cambiar semana y descargar el mismo PDF semanal.
- La tarifa se toma de la configuración existente: si administración guarda $500 por jugador, el organizador ve $500. Los cobros cerrados conservan sus importes históricos, igual que en administración.
- Arriba se muestra el alias `Julivaldez94`, también incluido en el PDF, y el total de semanas con saldo pendiente hasta la semana actual. Cada semana se cuenta una vez aunque tenga varios torneos; el resumen no cambia al consultar otra semana. Se puede desplegar el listado para ir a cada período pendiente.
- El organizador no puede cambiar tarifas, seleccionar registros, marcar pagos, descartar cargos ni crear cobros. Los Server Actions administrativos siguen exigiendo ADMIN, también si alguien intenta invocarlos directamente.

No hay carga adicional de importes ni una copia de los datos. No suspende automáticamente el servicio.

## Despliegue

`20261023160819_tpe_billing_notice.sql` agrega exclusivamente el interruptor por organización, con acceso directo revocado y RLS habilitado. Sin la migración, `/cobros` funciona y el aviso permanece apagado; administración muestra que el interruptor está pendiente.

**No se ejecutó la migración en remoto. El propietario la publica mediante su CI/CD de Supabase**, de acuerdo con `AGENTS.md`.

Se valida sesión, rol y pertenencia activa a TPE antes de leer los datos de la cuenta. Las lecturas del portal no crean configuraciones ni escriben en la base. FV no muestra el aviso ni ofrece acceso a `/cobros`.

## Pruebas locales

- `npm test -- --runInBand lib/billing/__tests__`
- `supabase/tests/tpe_billing_notice.sql`, dentro de una transacción local seguida de `ROLLBACK`.
- `supabase/tests/tpe-billing-browser.mjs`, con servidor TPE y Supabase locales. Variables: `BILLING_TEST_BASE_URL`, `BILLING_TEST_SUPABASE_URL`, `BILLING_TEST_KONG_CONTAINER` para leer las claves del contenedor local y `PLAYWRIGHT_MODULE_PATH` si Playwright no está en node_modules. Rechaza URLs remotas y limpia sus propias cuentas y fixtures.
