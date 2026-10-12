# Aprobación independiente de comprobantes

Implementación local del plan, 12 de octubre de 2026.

## Resultado

El popup propio del organizador muestra «Aprobar comprobante» cuando hay un archivo pendiente de revisión y el servidor confirma permisos sobre el torneo. La aprobación registra revisor y fecha, conserva el estado de inscripción y actualiza las filas y vistas del jugador. Un borrador de reemplazo/cambio de método bloquea la aprobación hasta guardarlo o descartarlo. El jugador no tiene esta acción.

`approveInscription` cambia sólo la aprobación de inscripción; deja la revisión del archivo intacta. Reemplazar el archivo reinicia la revisión como antes. La nueva aprobación no marca cobros individuales, no envía mensajes de inscripción y no ejecuta reconciliación de zonas ni limpieza de Storage.

## Migración

`supabase/migrations/20261012190000_independent_proof_approval.sql` agrega la RPC `approve_inscription_proof` y un disparador que protege estado aprobado y metadatos frente a escrituras directas del cliente. La RPC es accesible sólo mediante `service_role`; la ruta autoriza al organizador y toma el revisor de la sesión. Usa el bloqueo existente y la revisión esperada para evitar aprobar un archivo reemplazado. Un reintento idéntico conserva la atribución original.

Aplicada y registrada exclusivamente en el contenedor local `supabase_db_padel-elite-local`. No se modificó ningún proyecto remoto ni se desplegó. `database.types.ts` sigue siendo el fallback `Database = any` del repositorio; se incorporó `ProofApprovalArgs` para tipar explícitamente el límite de la nueva RPC.

## Verificación

- 72 pruebas focalizadas pasan: ruta de pago, aprobación de inscripción, acceso al popup, registro, archivos, compresión y apertura privada de comprobantes.
- SQL transaccional `supabase/tests/independent_proof_approval.sql`: separación de aprobaciones, metadatos, duplicados, revisión antigua, protección de escrituras y conservación de campos, pagos individuales, zona y partido. Todo se revierte al terminar.
- `supabase/tests/proof-approval-concurrency.mjs`: dos sesiones reales de PostgreSQL verifican una sola aprobación ante dos revisores y conflictos frente a reemplazo/eliminación. Fixtures eliminados al finalizar.
- SQL anterior `supabase/tests/inscription_payment_popup.sql` pasa, incluyendo cambios de método, reemplazo, limpieza, permisos y conservación de zonas.
- Chrome con `PAYMENT_TEST_APPROVAL_ONLY=1`: prueba real de acciones de jugador/organizador, botón bloqueado al seleccionar reemplazo, aprobación, metadatos, vista aprobada del jugador, reemplazo que reinicia revisión y aprobación independiente en ambos sentidos. Captura móvil en `%TEMP%/padel-payment-popup/proof-approved-mobile.png`.
- El permiso temporal local de lectura de `players` se restauró y los fixtures fueron eliminados. No se ampliaron permisos remotos.
- La comprobación global de TypeScript encuentra errores previos en módulos del proyecto, sin errores en los archivos nuevos ni en las líneas modificadas. Log: `%TEMP%/padel-proof-approval-types.log`. Se usó una configuración temporal que excluye las copias locales para evitar analizarlas por duplicado.
- `npm run build:elite` pasa en la copia aislada de la aplicación. El repositorio omite lint y errores de tipos durante el build según su configuración existente; por eso se registra por separado el resultado de TypeScript. Log: `%TEMP%/padel-proof-approval-build.log`.

## Publicación posterior

La aplicación remota requiere esta migración y el despliegue del código juntos. Seleccionar el tenant antes de publicar: FV (`bfmaqrythlwbfjuqumom`) es el predeterminado de este workspace; TPE/Elite (`lzowflvgnspjdbvdxliy`) es un proyecto separado. Las aprobaciones históricas se conservan y no requieren backfill.
