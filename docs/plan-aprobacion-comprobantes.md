# Plan: aprobar comprobantes de forma independiente

Fecha: 12 de octubre de 2026.
Estado: implementado y verificado localmente. Migración remota y despliegue pendientes.

## Objetivo

Separar la aprobación de la inscripción de la revisión del comprobante. El organizador debe poder aprobar un archivo aunque la inscripción ya esté aprobada, y aprobar una inscripción sin dar por revisado su archivo.

## Situación actual comprobada

- `approveInscription` en `app/api/tournaments/actions.ts` sólo admite inscripciones pendientes. Además de cambiar `is_pending`, cambia un comprobante `PENDING_REVIEW` a `APPROVED` y registra el revisor.
- La tabla de parejas muestra «Aprobar» únicamente cuando `is_pending` es verdadero.
- El popup del organizador permite ver, reemplazar o eliminar el comprobante, pero no aprobarlo.
- Ya existen `payment_proof_status`, `payment_reviewed_at`, `payment_reviewed_by` y `payment_revision`. La revisión se reinicia al reemplazar el archivo.
- Las modificaciones del pago usan una operación transaccional con bloqueo y comprobación de revisión. La nueva aprobación debe respetar esa misma protección.

## Reglas acordadas para esta implementación

| Acción | Estado de inscripción | Estado de comprobante |
| --- | --- | --- |
| Aprobar inscripción | Pasa a aprobada | Se conserva |
| Aprobar comprobante | Se conserva | Pasa de pendiente de revisión a aprobado |
| Subir o reemplazar archivo | Se conserva | Pasa a pendiente de revisión y limpia la revisión anterior |
| Eliminar archivo o cambiar a efectivo | Se conserva | Mantiene el comportamiento vigente: elimina la asociación y limpia la revisión |

- Aprobar un comprobante conserva cupo, pareja, zonas y partidos, incluso si el torneo ya está armado.
- La acción valida el archivo guardado en ese momento; no implica marcar como pagados los registros individuales de los jugadores.
- La selección de efectivo sigue siendo una forma de pago, sin confirmar automáticamente que se cobró.
- Se conservan las aprobaciones históricas; no se reinterpreta ni modifica información anterior.
- El alcance inicial es aprobar. Rechazar un comprobante, pedir correcciones o reabrir su revisión requeriría un flujo posterior y no se confundirá con rechazar la inscripción.

## 1. Separar la aprobación de inscripción

Modificar `approveInscription` para que deje de escribir `payment_proof_status`, `payment_reviewed_at` y `payment_reviewed_by`.

Conservar su control de permisos, aprobación de inscripción, mensajes y reconciliación de zonas. Revisar los disparadores y las rutas alternativas que puedan aprobar una inscripción para asegurar que ninguna apruebe implícitamente el comprobante. No cambiar los requisitos vigentes para completar una inscripción.

## 2. Agregar una operación de aprobación del comprobante

Extender el POST de `app/api/tournaments/[id]/inscriptions/payment/route.ts` con una operación explícita `approve-proof` y campos `inscriptionId` y `revision` obligatorios.

- Exigir sesión y permisos de gestión del torneo verificados en el servidor. El indicador de organizador enviado desde la interfaz no concede permisos.
- Comprobar que la inscripción pertenece al torneo y que tiene un archivo asociado pendiente de revisión. Admitir el caso histórico de método vacío con archivo ya asociado que el flujo actual soporta.
- Tomar el revisor de la sesión, nunca de un campo editable del formulario.
- Devolver el estado confirmado usando el DTO actual de pago y su revisión actualizada.
- Responder con conflicto si cambió el archivo o la revisión; pedir consultar nuevamente antes de aprobar.
- Resolver resultados inciertos consultando el estado guardado, sin repetir la operación a ciegas.

La aprobación tendrá su propia rama. No ejecutará la reconciliación de zonas, la limpieza de Storage ni el mensaje de inscripción aprobada que actualmente están al final de la ruta. Reutilizará la actualización de caché y rutas pertinente.

## 3. Proteger la aprobación en una transacción

Crear una migración nueva, sin modificar las migraciones ya existentes, con una RPC dedicada para aprobar el comprobante.

- Usar el mismo orden de bloqueo que las operaciones actuales: bloqueo del torneo y de la fila de inscripción.
- Verificar torneo, revisión esperada, archivo asociado y estado pendiente dentro de la transacción.
- Actualizar únicamente `payment_proof_status`, `payment_reviewed_at` y `payment_reviewed_by`. El disparador existente incrementará `payment_revision`.
- Conservar `is_pending`, método, archivo, importe y alias, así como todos los datos deportivos y de cobro individual.
- Restringir la ejecución a `service_role`, después de la autorización en la ruta, con `search_path` fijo y tipos explícitos. No ampliar permisos públicos.
- Auditar las políticas/disparadores existentes para que un jugador tampoco pueda falsificar los metadatos de revisión mediante una actualización directa. Añadir el endurecimiento necesario en la misma migración si falta esa protección.
- Si dos organizadores aprueban a la vez, sólo una escritura registra la revisión; la otra consulta el resultado existente. Si hay un reemplazo simultáneo, nunca se aprueba el archivo nuevo usando la revisión del anterior.

Regenerar o actualizar los tipos de base de datos afectados por la nueva RPC. No hacen falta columnas nuevas para la funcionalidad inicial.

## 4. Incorporar la acción en el popup del organizador

En `OrganizerInscriptionPaymentDialog`, incorporar «Aprobar comprobante» junto al estado de revisión y al acceso «Ver comprobante», conservando el diseño actual y «Cerrar».

- Mostrar la acción sólo con permisos confirmados por el servidor, archivo guardado y estado pendiente de revisión.
- Deshabilitarla mientras haya una operación en curso, archivo seleccionado para reemplazo, cambio de método sin guardar, confirmación de eliminación, conflicto o resultado incierto.
- Mostrar «Aprobando…» durante el guardado y «Comprobante aprobado» al confirmar. El botón desaparece al aprobar.
- No agregar una confirmación adicional para la aprobación: el botón será explícito y actuará sobre el archivo guardado.
- El popup del jugador conserva su componente propio y sólo refleja el estado aprobado; no tendrá esa acción.
- Compartir la lógica de petición y actualización mediante el editor común, manteniendo la acción propia del organizador.

Actualizar las filas de Inscripciones y las vistas del jugador mediante SWR y revalidación de rutas. No volver a introducir el cartel general eliminado.

## 5. Verificación

Pruebas de servidor y base de datos:

- Aprobar inscripción con comprobante pendiente: la inscripción se aprueba y el archivo sigue pendiente de revisión.
- Aprobar comprobante con inscripción pendiente: el archivo se aprueba y la inscripción sigue pendiente.
- Aprobar comprobante con inscripción aprobada: funciona sin cambiar otros datos.
- Rechazar solicitudes sin archivo, con revisión inválida o de usuarios sin permisos, incluidos jugadores dueños de la inscripción y organizadores de otro torneo.
- Impedir la falsificación directa del estado y de los metadatos de revisión por un jugador.
- Verificar doble aprobación, aprobación contra reemplazo/eliminación y respuestas perdidas.
- Comprobar que el reemplazo por el organizador vuelve a pendiente de revisión, limpia el revisor anterior y conserva zonas y partidos.
- Comprobar que aprobar el archivo no cambia pagos individuales, no envía mensajes de inscripción y no toca Storage.

Prueba real de navegador en escritorio y móvil:

- Revisar y aprobar desde el popup del organizador; comprobar el resultado al cerrar y reabrir, en la fila y en la sesión del jugador.
- Confirmar que el jugador no ve la acción y que un borrador de reemplazo no permite aprobar el archivo anterior por accidente.
- Probar errores y cambios simultáneos sin perder selecciones locales ni repetir escrituras automáticamente.

Usar fixtures locales aislados y eliminarlos al terminar. Ejecutar las pruebas de pago, inscripción y permisos pertinentes, y comprobación de tipos/build según el entorno disponible.

## Criterio de finalización

Las dos aprobaciones funcionan por separado, se distinguen en la interfaz y conservan esa separación ante modificaciones simultáneas. Queda registrado quién aprobó el archivo y cuándo, sin modificar cupos, datos deportivos o pagos individuales.

Este plan prepara cambios locales. Para una futura aplicación remota, seleccionar explícitamente el tenant según el pedido: FV es el predeterminado de este workspace; TPE/Elite requiere su proyecto separado. No aplicar migraciones ni desplegar como parte de la preparación del plan.
