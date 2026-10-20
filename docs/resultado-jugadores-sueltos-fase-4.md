# Jugadores sueltos: resultado de la fase 4

Fecha: 16 de octubre de 2026. Implementación y verificación locales. **Sin despliegue de código, migraciones remotas, envío real de emails ni activación pública.** El propietario hará QA manual y desplegará manualmente después; se le avisa antes de cualquier publicación.

## Solicitudes y aceptación

El directorio permite solicitar contacto general o proponer pareja para un torneo. El formulario pide un teléfono válido y consentimiento explícito; para torneos exige también las condiciones correspondientes a FV/TPE. El servidor obtiene identidad y versión de términos y llama al RPC de envío con la sesión del jugador. Se mantienen unicidad, solicitudes inversas, privacidad y control de cupo del contrato existente.

La ruta `/jugadores-sueltos/solicitudes` muestra solicitudes recibidas, enviadas y de torneos gestionados, separando activas e historial. Usa `effective_status` y revalida al volver a la pantalla y cada 30 segundos. Incluye paginación y enlaces directos por solicitud, incluso después de resolverla o vencer. El destinatario acepta/rechaza, el emisor retira y el gestor autorizado puede dejar sin efecto una solicitud de su torneo. La base vuelve a comprobar permisos, disponibilidad y vencimiento al responder.

- General: aceptar comparte contacto únicamente entre los participantes; no crea pareja competitiva ni inscripción.
- Torneo: aceptar pasa por `RegistrationService.acceptTournamentRequest`, implementado en fase 2. Conserva cupo, términos/restricciones, aprobación y forma de pago. Si requiere transferencia sin comprobante, abre el popup retomable existente. Una sola seña por pareja.
- La UI distingue el estado realmente retornado: un vencimiento o una resolución concurrente no se anuncia como aceptación exitosa. La fecha límite de una solicitud AMERICAN no se muestra como vencimiento de una inscripción aceptada.
- El contacto aceptado se consulta con `get_solo_player_contact`. El organizador no recibe teléfonos ocultos por gestionar el torneo. Las listas de solicitudes, avisos y directorio no contienen teléfonos de jugadores, email, DNI ni archivos de pago.

## Bandeja y contador

La campana de la navbar compartida funciona en escritorio/móvil para jugadores y gestores de ambos tenants. Cuenta todas las notificaciones propias no leídas, aunque haya más que las incluidas en una página. La bandeja permite marcar cada aviso como leído y abrir su solicitud. Las respuestas y la caché se separan por cuenta; no hay caché pública compartida. Fechas/horas se muestran en Argentina con formato de 24 horas.

Las notificaciones siguen persistiendo dentro de la transacción social. Los eventos de torneo alcanzan a ambos jugadores y a sus gestores efectivos; los generales no inventan un destinatario organizador. Resolver una solicitud genera el resultado para ambos participantes. Las notificaciones permanecen aunque falle el email.

## Email y tarea compartida

La migración `20261016215439_solo_players_phase_four.sql` agrega reservas temporales de envío y una tabla privada de contenido congelado. Los RPC de procesamiento sólo admiten `service_role`; clientes y anónimos no pueden reclamar, preparar, completar ni ejecutar la limpieza. La tabla privada no tiene lectura directa, ni siquiera para `service_role`. La dirección destinataria se obtiene de `auth.users`, nunca de un dato enviado por el navegador.

El worker reutiliza `sendTransactionalEmail`/Resend y `renderEmailLayout`, con identificación FV/TPE. No consulta el switch de mensajes generales del torneo. El switch global `EMAIL_ENABLED` y la configuración del proveedor sí se respetan: un envío omitido no se marca entregado y queda reintentable. El HTML no contiene teléfonos ni confirma una inscripción sin sus requisitos.

El envío se solicita con `after()` después de guardar la operación. Dos workers reclaman filas con `FOR UPDATE SKIP LOCKED`; la reserva dura cinco minutos y puede recuperarse si un proceso se interrumpe. Cada intento usa el mismo contenido/destinatario guardado y una clave idempotente por notificación. Una confirmación de un worker anterior no puede sobrescribir una reserva posterior. Los fallos conservan el aviso y aplican espera creciente, hasta un día.

Resend conserva sus claves idempotentes durante 24 horas; esto reduce duplicados de reintentos, pero no representa una garantía de entrega exactamente una vez ante una interrupción ambigua que dure más que esa ventana. Ver [documentación oficial de idempotencia](https://resend.com/changelog/idempotency-keys).

Hay **una sola tarea periódica del módulo**: `/api/cron/solo-players`, que materializa vencimientos y reintenta emails. Está protegida con `CRON_SECRET`. La configuración preparada en `vercel.json` es diaria a las 03:05 UTC (00:05 de Argentina), compatible con la frecuencia diaria del proyecto y sin asumir un plan que permita ejecuciones más frecuentes. La operación normal intenta el envío inmediatamente; un fallo puede esperar hasta el siguiente disparo o actividad del módulo. Si se desea un reintento periódico cada cinco minutos, el propietario debe revisar el plan de hosting y ajustar la única tarea durante la preparación de publicación. [Límites oficiales de cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).

La limpieza procesa un ámbito por transacción, conservando el orden de bloqueos de fases anteriores. Las vistas ya calculan vencimientos inmediatamente: ni la corrección de la aceptación ni el listado de activas dependen de que corra el cron. No se borran inscripciones, parejas ni resultados durante esa tarea.

## Configuración y activación

- `NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW=true`: acceso local de prueba, tanto con desarrollo como con `build/start` local. Se exige una URL Supabase HTTP(S) de loopback. El bloqueo inicial por `NODE_ENV=production` se corrigió durante QA porque impedía probar el build en la máquina del propietario. Poner el flag con una URL remota FV/Elite sigue sin habilitar el módulo; la activación remota necesita la revisión de fase 5.
- `SOLO_PLAYERS_EMAIL_DELIVERY=resend`: habilita el envío real del worker. Dejar vacío en desarrollo/QA sin destinatarios de prueba: no se envían correos ni se consumen avisos pendientes. Tener claves Resend antiguas en `.env` no activa por sí solo este envío.
- `EMAIL_ENABLED`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`: configuración existente del proveedor/remitente por tenant. Los ejemplos de FV y TPE incluyen los nuevos controles.
- `CRON_SECRET`: secreto de invocación de la tarea. La respuesta del cron es un `skipped` sin acceso a base si el módulo no está habilitado.
- El WhatsApp de ayuda sigue leyéndose de `organizaciones.phone` de la organización configurada del tenant, según la instrucción del propietario.

## Verificación ejecutada

- **109 pruebas Jest focalizadas en 12 suites**: acciones/autenticación, privacidad, contacto aceptado, contador/lectura, cron, fallo/omisión/excepción del proveedor, reservas obsoletas, contenido por tenant, vencimiento sin trasladarlo a la inscripción, navegación, formulario anterior y regresiones de emparejamiento/mensajes.
- **30 assertions pgTAP nuevas aprobadas**: permisos del worker, reclamaciones exclusivas, recuperación de reserva interrumpida, rechazo de confirmación obsoleta, dirección auténtica, contenido estable, tenant, fallo/reintento, persistencia de solicitud, vencimientos y deduplicación de avisos.
- **Regresión SQL:** 83 assertions de fase 1 con sus cuatro escenarios concurrentes y 53 assertions de fase 2 con sus seis escenarios concurrentes aprobados con la migración nueva instalada.
- **HTTP/PostgreSQL local:** solicitud general → avisos de ambos → lectura → aceptación → contacto; rechazo, retiro, vencimiento, acceso ajeno y activos/historial. LONG/AMERICAN → aceptación → una inscripción → avisos al organizador. AMERICAN conserva aprobación/comprobante pendientes y su API de popup responde correctamente.
- Regresión HTTP del directorio/publicaciones de fase 3 aprobada. Los runners usan exclusivamente servicios locales fijos y eliminan sus propias fixtures.
- **Navegador FV, escritorio y móvil 390 × 844:** contador, bandeja, aceptación general, revelado autorizado, lectura y actualización del contador, aceptación AMERICAN y apertura automática del popup con comprobante y aprobación pendientes. Se verificó el envío desde móvil y su retiro, con confirmación persistida y salida de la lista activa. No se hizo un segundo recorrido completo de navegador TPE; sus variantes de navegación/términos/plantilla se cubren con Jest y quedan para QA manual integrado.
- Advisors locales: 188 hallazgos heredados y ninguno relacionado con los objetos nuevos. `git diff --check` sin errores. Chequeo TypeScript final del 17/10: 374 diagnósticos heredados, sin diagnósticos en el módulo nuevo; no se declara build de producción exitoso. Lint sigue sin estar disponible por la dependencia ESLint ausente, ya documentada en fase 3.
- **Correo real pendiente:** se probaron fallos/omisiones con proveedor simulado y persistencia real en PostgreSQL. No se verificó entrega real ni reputación del remitente en FV/TPE y no se enviaron mensajes a usuarios reales.

## Reproducción y QA manual pendiente

Después de las migraciones locales de fases 1–2, aplicar la nueva migración sólo al contenedor de pruebas y ejecutar:

```powershell
Get-Content -Raw supabase/migrations/20261016215439_solo_players_phase_four.sql | docker exec -i supabase_db_padel-base-main-test psql -X -U postgres -d postgres --single-transaction -v ON_ERROR_STOP=1
node scripts/test-solo-notifications-local.mjs
node scripts/test-solo-players-local.mjs
node scripts/test-solo-pairing-local.mjs
# Next en localhost:3043, Supabase local 127.0.0.1:8011, emails deshabilitados:
node scripts/test-solo-requests-local.mjs
node scripts/test-solo-directory-local.mjs
```

Antes de producción, el propietario revisa manualmente:

1. En ambos tenants y móvil/escritorio: publicar, enviar, aceptar/rechazar/retirar, contador, lectura, historial, contacto oculto y WhatsApp correcto.
2. General sin inscripción; torneo con/sin comprobante, con/sin aprobación y efectivo permitido. Confirmar una sola seña y retomar desde cualquiera de los integrantes.
3. Cupos llenos, pausa/vencimiento/cierre durante una respuesta, bajas sin republicación y solicitudes incompatibles después de formar pareja.
4. Bandeja del organizador, privacidad frente a otra cuenta, remitente/enlaces por tenant y entrega/reintento con destinatarios de prueba controlados.
5. Pendientes de activación de fase 1: privacidad de perfiles antiguos y validación autoritativa de términos/tenant/restricciones frente a llamadas directas a los RPC autenticados. Los wrappers nuevos no sustituyen ese control en base.

El servidor temporal se detuvo, las fixtures del navegador se eliminaron y `tsconfig.json` se restauró a su contenido anterior a la prueba. La carpeta de compilación temporal y los logs permanecen excluidos localmente de Git.

La fase 5 conserva la revisión integrada y la preparación de publicación. **El agente no despliega: el propietario hace QA manual y luego aplica migraciones y código por su procedimiento manual/CI/CD.** Ver [diagnóstico y pasos de QA local del 17/10](diagnostico-jugadores-sueltos-2026-10-17.md).

Los cambios posteriores de diseño, campana, `/notificaciones`, perfiles deportivos y gestión del organizador se documentan en [ajustes de QA del 17/10](ajustes-jugadores-sueltos-qa-2026-10-17.md).
