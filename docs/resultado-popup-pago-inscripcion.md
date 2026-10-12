# Popup de pago de inscripción: implementación local

12 de octubre de 2026. Implementado sobre el directorio de trabajo existente, sin commit ni despliegue remoto. Destino de publicación: TPE/Elite (`lzowflvgnspjdbvdxliy`). El código conserva compatibilidad con FV y efectivo sigue deshabilitado por defecto.

## Comportamiento

- Un único `Dialog` montado en el layout principal. Las filas sólo renderizan un estado y botón; no montan formularios ni diálogos propios.
- Acceso desde detalle americano/LONG (incluidas solicitudes pendientes), `/torneos`, las cuatro variantes del panel y filas del organizador. `/torneos/[slug]` reutiliza el detalle; no se agregaron rutas ficticias.
- El alta en pareja cierra su diálogo y, al terminar de devolver el foco, abre el mismo popup de pago con el ID guardado.
- Seleccionar archivo prepara una vista previa local. La subida requiere confirmar con el botón. Quitar selección no borra el archivo guardado. Cerrar sin guardar no cambia el método.
- Cambios efectivo/transferencia, reemplazo y eliminación conservan inscripción, cupo y aprobación de inscripción. Elegir efectivo no marca dinero cobrado. Un comprobante nuevo vuelve a revisión pendiente y borra los datos de la revisión anterior.
- Jugadores editan comprobantes pendientes; sólo gestión puede modificar aprobados. Un cambio o aprobación concurrente invalida el borrador por su versión, también al recuperar el foco después de volver del banco.
- Las inscripciones existentes prevalecen sobre disponibilidad/cierre. La consulta privada de las tarjetas es una consulta conjunta, con caché de navegador separada por cuenta y respuesta `private, no-store`; no se agregaron datos personales al resumen público cacheado.
- Confirmación del usuario: se permite dejar pendiente de comprobante una inscripción con zonas o partidos armados. No se eliminan esas zonas/partidos. Las validaciones anteriores siguen exigiendo completar las reservas antes de crear nuevas zonas/partidos o iniciar el torneo.

## Migraciones y limpieza

La migración anterior `20261011172839_resumable_inscription_payments.sql` se conservó. La nueva es `20261012151518_inscription_payment_popup.sql`; ambas están registradas en TPE local. No se aplicaron cambios remotos.

La nueva migración agrega `payment_revision`, la cola `inscription_proof_cleanup`, triggers y dos RPC exclusivas de `service_role`. La cola tiene RLS y ningún permiso de acceso para `anon`/`authenticated`. Las rutas comprueban sesión, pertenencia a cualquiera de los dos lugares de la pareja o gestión del torneo antes de usar las RPC.

Cada subida registra primero un ticket durable con una ruta única y disponibilidad a los 15 minutos. La asociación del archivo y eliminación del ticket son atómicas. Un worker que reclamó el ticket impide una asociación tardía. Reemplazo, eliminación y DELETE de inscripción encolan el archivo anterior en la misma transacción; esto también cubre eliminaciones por FK cuando el esquema las permita. El esquema TPE local exige eliminar inscripciones antes de borrar un torneo.

La aplicación intenta procesar la cola después de confirmar la respuesta (`after`) en las mutaciones de pago, bajas del servicio de registro, rechazo y eliminación desde zonas. Un fallo no restaura cupo ni cancela otra vez. El respaldo es `GET /api/cron/inscription-proof-cleanup`, protegido por `CRON_SECRET`, configurado diariamente a las **00:00 de Argentina** en `vercel.json`. Procesa hasta 50 tickets por ejecución, verifica que no haya una inscripción asociada y elimina por la API de Storage. Los fallos conservan el ticket con demora creciente; un claim abandonado puede recuperarse después de 10 minutos.

Antes de publicar hay que aplicar ambas migraciones y configurar `CRON_SECRET` en el proyecto de destino. Publicar aplicación y esquema coordinadamente. Sin ese secreto el endpoint retorna 401; los tickets permanecen pendientes. No se hizo un barrido histórico de archivos.

## Verificación

- **125 pruebas / 17 suites**, sin contar copias de pruebas bajo `.local`: 104 focalizadas de API de pago y consulta conjunta, permisos, errores, revisión concurrente, cambios de método, reemplazo fallido, respuesta perdida, limpieza recuperable, estados compactos y entradas existentes; más 21 de validación de inscripción y agenda/overview LONG.
- SQL transaccional contra TPE local: reglas de reserva anteriores y nuevas, snapshots vigentes, aprobación, versiones, conservación de zonas al retirar archivo, tickets/claims, limpieza al borrar inscripción y permisos privados. Todo el fixture SQL se revierte.
- Concurrencia con sesiones reales: exactamente una inscripción obtiene el último cupo; exactamente un reemplazo con la misma versión puede ganar. El archivo vigente queda fuera de la cola de limpieza.
- Navegador Chrome automatizado, escritorio 1280 px y móvil 390 px: ambos integrantes, PDF e imagen con vista previa, selección sin subida, subida explícita, reemplazo, eliminación, efectivo/transferencia, cierre sin guardar, recarga, devolución de foco, `/torneos` con cupo completo y `/panel`. También alta inicial con un solo diálogo y carga desde fila del organizador. Capturas en `%TEMP%/padel-payment-popup`.
- Para la prueba completa del alta se otorgó temporalmente `SELECT` sobre `players` a `authenticated` **sólo en TPE local**, y se revocó al terminar. Sin esa preparación, el flujo anterior falla en la consulta de teléfonos (`42501`), antes de llegar a reservar o abrir pago. Esta limitación preexistente no se corrigió ampliando permisos en la migración de pago.
- Builds FV y TPE verificados. El build del repositorio omite validación TypeScript/lint por configuración existente; se ejecutó además `tsc --noEmit`. No hay diagnósticos en los archivos nuevos del pago ni en los componentes modificados de este flujo, pero el chequeo global sigue fallando por errores anteriores de rutas, contratos y funciones Deno.
- No se probó Android físico, un banco real ni desconexión real del dispositivo. Respuestas perdidas y fallos de Storage se cubren con pruebas controladas; la revalidación de foco y la recarga usan el estado del servidor. No se modificaron cuentas reales ni se enviaron mensajes de prueba.

## Repetir pruebas locales

```powershell
Get-Content supabase/tests/inscription_payment_popup.sql -Raw | docker exec -i supabase_db_padel-elite-local psql -X -U postgres -d postgres -v ON_ERROR_STOP=1
node supabase/tests/payment-popup-concurrency.mjs
node supabase/tests/resumable-payment-concurrency.mjs
```

`supabase/tests/payment-popup-browser.mjs` requiere el servidor TPE local en el puerto 3100 y Playwright disponible (se puede indicar `PLAYWRIGHT_MODULE_PATH`). Rechaza hosts remotos, usa cuentas/archivos sintéticos con mensajes deshabilitados y elimina únicamente sus propios fixtures en `finally`. El estado de permisos de `players` debe permitir el flujo anterior para repetir el alta inicial; el script no cambia esos permisos por su cuenta.

## Ajuste de imágenes pesadas

El selector ahora admite imágenes originales de hasta 20 MB para que lleguen al compresor existente. La compresión se realiza localmente al confirmar la subida, con estado «Preparando imagen…». El archivo final y el servidor mantienen el límite de 4 MB; los PDF siguen limitados a 4 MB y no se convierten. No se agregaron dependencias ni se cambiaron calidades, dimensiones o fallback del compresor; se agregó un límite de entrada antes de asignar recursos del navegador.

Verificación del ajuste: 47 pruebas focalizadas pasan. `supabase/tests/proof-compression-browser.mjs` ejecuta los helpers reales en Chrome con Canvas nativo: PNG sintético de 5.709.079 bytes → JPEG de 973.671 bytes en 381 ms, conservando 1800 × 1200 píxeles y texto legible, sin peticiones HTTP. La prueba completa del popup con esta imagen se dejó disponible con `PAYMENT_TEST_COMPRESSION_ONLY=1`, pero su ejecución en esta sesión quedó interferida por compilaciones concurrentes de Next.js; la medición confirmada corresponde al compresor ejecutado directamente en Chrome. No se publicó este ajuste.

## Ajuste de acciones visibles y cierre

Los botones Copiar, Ver comprobante, Eliminar comprobante y Quitar selección tienen fondo, borde e identificación visible; los tres primeros también incorporan iconos. El selector de archivo diferencia visualmente su botón. El pie del popup muestra «Cerrar», deshabilitado sólo mientras guarda/sube. Tras guardar se oculta la acción de subida sin archivo seleccionado; elegir un archivo nuevo muestra «Reemplazar comprobante» cuando existe uno guardado.

Prueba real de navegador con `PAYMENT_TEST_UI_ONLY=1`, contra una copia aislada de la aplicación: verificación de fondos sin hover, carga inicial, reemplazo, cierre después de cada operación y vista móvil de 390 px. Pasó. Se preparó temporalmente el permiso local de lectura de `players` descrito arriba y se restauró al terminar; no se modificaron permisos remotos. Capturas en `%TEMP%/padel-payment-popup/actions-desktop.png` y `actions-mobile.png`. Sin despliegue.

## Popup propio del organizador

Por pedido posterior, el acceso de las filas del organizador abre `OrganizerInscriptionPaymentDialog`, separado del popup del jugador. Conserva el diseño y las acciones, con textos «El jugador paga en efectivo» y «El jugador paga por transferencia», y confirmaciones referidas a la inscripción de la pareja. Ambos comparten el editor y la lógica de carga, revisión y reemplazo; los permisos continúan definidos por la respuesta del servidor.

Verificado en Chrome contra el entorno local: apertura de cada popup por su rol, textos de efectivo y transferencia, cierre del borrador del organizador sin guardar, carga y reemplazo de comprobante y vista móvil. También pasan las 6 pruebas focalizadas de acceso al pago y registro. La comprobación global con TypeScript no pudo completar por falta de memoria; los tres componentes transpilan sin errores. Sin despliegue ni cambios remotos.
