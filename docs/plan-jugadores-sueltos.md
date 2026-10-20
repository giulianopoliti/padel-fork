# Plan de acción: Jugadores sueltos

Fecha: 16 de octubre de 2026. Estado: fases 1–4 implementadas y verificadas localmente; sin despliegues ni activación pública del directorio. Ver los resultados de [fase 1](resultado-jugadores-sueltos-fase-1.md), [fase 2](resultado-jugadores-sueltos-fase-2.md), [fase 3](resultado-jugadores-sueltos-fase-3.md) y [fase 4](resultado-jugadores-sueltos-fase-4.md). Siguen pendientes los límites de activación y la revisión integrada de fase 5.

Este plan incorpora las aclaraciones y anotaciones del usuario y reemplaza las recomendaciones pendientes del diagnóstico cuando difieren. Entregar cada fase con una revisión pequeña; no hacer una reescritura del sistema de inscripciones.

## Reglas acordadas

- Antes de publicar se avisa al propietario. El propietario hace QA manual y luego despliega manualmente código y migraciones; iniciar una fase no autoriza despliegues en producción.

- Un suelto publica interés, sin comprobante, sin consumir cupo y sin confirmar inscripción. Los sueltos no bloquean inicio ni armado de zonas de LONG o AMERICAN.
- La inscripción de pareja se crea al aceptar una solicitud o al emparejar el organizador. Revisar cupo en ese momento, también para el organizador. Jugador: «Cupos llenos». Organizador: «Cupos llenos. Modificá el límite de inscriptos para emparejarlos».
- Conservar las reglas de inscripción vigentes, términos y restricciones de cada tenant, aprobación opcional, comprobantes, efectivo habilitado y bajas. La aceptación del compañero no reemplaza requisitos del torneo. El alta administrativa conserva su tratamiento actual autorizado, sin eximir comprobantes implícitamente.
- Confirmación por jugadores: sin comprobante y sin validación, confirma al aceptar; con validación, espera aprobación; con comprobante, espera adjunto; con ambos, espera ambos requisitos, en cualquier orden. La revisión del archivo y las casillas de cobro conservan su significado independiente.
- LONG habilitado: `zone_positions` y espejo `zone_couples`; AMERICAN de zona única: asignación automática; AMERICAN de varias zonas: disponible para armado. Ninguna pareja debe quedar olvidada al completar el último requisito.
- Comprobante actual: una seña por pareja, que cualquiera de los dos puede subir. El primer archivo guardado prevalece; un envío simultáneo no sobrescribe. El otro jugador ve «Tu compañero ya adjuntó un comprobante». Reemplazo explícito con controles actuales; aclarar que no deben transferir dos señas.
- Las inscripciones guardadas siguen reservando cupo sin vencimiento automático. Conservar el bloqueo actual por comprobantes faltantes de parejas; quitar sólo el bloqueo por sueltos.
- Disponibilidad general por categoría y disponibilidad para un torneo pueden coexistir. Formar pareja cierra la búsqueda de ese torneo; no borra las demás. Cancelar pareja no reactiva publicaciones automáticamente: el jugador puede publicarse nuevamente.
- Categoría declarada, Drive/Revés y zurdo/diestro; sin filtros de ubicación ni horarios. No sobrescribir ranking al publicar.
- Teléfono público sólo por elección. Si está oculto, solicitar contacto por notificación y email; al aceptar, compartirlo únicamente entre los dos. Sin chat interno. Exigir un número válido para poder compartirlo tras aceptación, aunque no sea público.
- Términos y condiciones correspondientes también al publicar para un torneo. Aclarar que intentarán conseguirle pareja, que otros jugadores pueden enviar solicitudes, que recibirá email, que esto no confirma inscripción ni garantiza cupo y que puede consultar por WhatsApp a FV o Elite según el sitio. Informar el consentimiento de contacto antes de publicar.
- Solicitudes pendientes AMERICAN: vencen a las 24 horas desde envío; LONG: al entrar en `BRACKET_PHASE`, o antes si el torneo deja de admitir la operación por cierre/cancelación. Publicaciones generales: duración elegida de 1 día, 1 semana, 2 semanas o 1 mes. Las solicitudes de una publicación vencida dejan de ser aceptables.
- Disponibilidades de torneo dejan de ofrecer acciones cuando ya no se puede inscribir. No trasladar el vencimiento de una solicitud AMERICAN a la inscripción ya creada ni inventar un plazo para una solicitud general independiente de su publicación.

## Fase 1 — Datos mínimos y acceso

**Responsable sugerido:** agente de backend/Supabase, GPT-6.1 Sol, razonamiento Extra High (`xhigh`).

- Definir sólo publicaciones, solicitudes y notificaciones, con propietario, destinatario, ámbito, estados y vencimiento. Reutilizar el perfil y catálogo de categorías.
- Proteger teléfono y demás datos privados en consultas, respuestas y permisos. Una solicitud general aceptada sólo comparte contacto; no crea pareja competitiva ni inscripción.
- Agregar unicidad para publicaciones activas y solicitudes repetidas/inversas, y autorización para aceptar, retirar o resolver. No convertir registros históricos en avisos públicos sin consentimiento.
- Preparar transición de individuales históricos para que sigan visibles al organizador y puedan emparejarse sin duplicar inscripciones. No borrarlos ni publicarlos automáticamente.

**Cierre:** migraciones y pruebas locales de permisos/duplicados; contrato de datos breve para las fases siguientes. Ninguna migración remota.

## Fase 2 — Emparejamiento, cupos y confirmación

**Responsable sugerido:** el mismo agente de backend, GPT-6.1 Sol, Extra High (`xhigh`). Depende de fase 1.

- Unificar el emparejamiento actual y la aceptación de solicitudes en el servicio existente. Confirmar datos, cupo y estado actual del torneo en servidor; una operación de base debe evitar resultados parciales o parejas dobles.
- Adaptar alta a todas las combinaciones de aprobación/comprobante/efectivo, reutilizando el pago retomable. Conservar un solo comprobante de seña y evitar sobrescrituras simultáneas.
- Al aprobar inscripción o completar el comprobante, ejecutar el mismo control de habilitación y asignación. Si falla la zona, mostrar «Pendiente de asignación» y permitir reintento automático/administrativo usando la reconciliación existente.
- Quitar bloqueos por individuales de inicio/armado sin tocar los controles de parejas incompletas, cupo ni llaves. No regenerar fixtures ni resultados.
- Al cancelar, mantener la baja actual y no reactivar publicaciones. Invalidar solicitudes incompatibles cuando se forma pareja.

**Cierre:** pruebas de último cupo, doble aceptación, emparejamiento del organizador, subida simultánea y orden aprobación/comprobante. Verificar LONG y ambos modos AMERICAN, incluyendo recuperación de asignación fallida.

## Fase 3 — Publicaciones y pantalla de Jugadores sueltos

**Estado al 16/10/2026:** implementada y verificada localmente, con accesos desactivados en producción. Ver [resultado de la fase 3](resultado-jugadores-sueltos-fase-3.md) para alcance, pruebas y pendientes de activación.

**Responsable sugerido:** agente de frontend, GPT-6.1 Sol, High (`high`). Depende del contrato de fase 1; puede avanzar en paralelo con fase 2 sin editar sus archivos.

- Añadir «Jugadores sueltos» a navbar de ambos tenants y móvil. Mostrar avisos generales o por torneo, con filtros de categoría, lado, mano y torneo.
- Publicar, editar, pausar y retirar, con duración para avisos generales y consentimiento de teléfono. Precargar datos deportivos y permitir categoría declarada.
- Reemplazar «Inscribirme solo» por publicación de interés incluso cuando el torneo pide comprobante. Incluir términos, explicación de email/solicitudes y WhatsApp correcto.
- Mostrar claramente búsqueda, solicitud pendiente, cupos llenos, pareja pendiente de requisitos y confirmada. Separar el listado de interesados del de parejas inscriptas.

**Cierre:** recorrido móvil/escritorio de publicar y retirar; teléfono oculto también en la respuesta de API, no sólo en la pantalla. Mantener los accesos nuevos sin publicar hasta integrar fase 4.

## Fase 4 — Solicitudes, email y bandeja

**Estado al 16/10/2026:** implementada y verificada localmente. Ver [resultado de fase 4](resultado-jugadores-sueltos-fase-4.md). Sin despliegues; quedan QA manual del propietario, revisión integrada y habilitación de producción.

**Responsable sugerido:** agente de integración/notificaciones, GPT-6.1 Sol, High (`high`). Depende de fases 1–3.

- Enviar, aceptar, rechazar y retirar solicitudes. El organizador puede emparejar sin solicitud usando fase 2. La aceptación general revela contacto; la aceptación de torneo continúa a inscripción/pago según requisitos.
- Notificar al otro jugador y al organizador en solicitudes de torneo; registrar el resultado para ambos jugadores. Las solicitudes generales no inventan un organizador destinatario.
- Reutilizar Resend y plantillas por tenant. Guardar la notificación y su estado de email/reintento, sin agregar una plataforma genérica de mensajería.
- Agregar bandeja y contador de no leídas para jugador/organizador en ambos tenants. Persistir el aviso aunque falle email; configurar los correos necesarios de solicitudes sin que se pierdan por el switch de mensajes generales del torneo.
- Validar vencimiento al listar y al responder; usar como máximo una tarea periódica compartida para limpieza/reintentos, sin crear una por solicitud. Quitar solicitudes vencidas de las activas sin borrar inscripciones confirmadas.

**Cierre:** solicitud → email/bandeja → aceptación → inscripción o contacto; probar rechazo, vencimiento y falla de correo sin perder la solicitud.

## Fase 5 — Revisión integrada y preparación de publicación

**Responsable sugerido:** agente revisor distinto del autor principal, GPT-6.1 Sol, Extra High (`xhigh`).

- Probar ambos tenants y las combinaciones acordadas: sin/con comprobante, sin/con aprobación, efectivo habilitado, cupos llenos, bajas, torneo iniciado y llaves.
- Revisar carreras: dos aceptaciones, aceptación contra unión del organizador, dos comprobantes y cierre del torneo durante una solicitud. Probar individuales históricos y privacidad de contacto.
- Verificar que ningún suelto bloquee el inicio y que ninguna pareja habilitada quede olvidada fuera de zona; usar las pruebas existentes y añadir sólo las de estos casos reales.
- Preparar instrucciones breves de configuración y publicación por tenant, incluyendo email y tarea periódica. El propietario aplica migraciones mediante su CI/CD; los agentes no las ejecutan en remoto.

**Cierre:** resultados de pruebas, incidencias corregidas y lista concreta de lo preparado y lo aún no desplegado. La comprobación de correos reales debe informarse como pendiente si no se puede realizar.

## Fase 6 — Roadmap posterior: seña o pago completo con comprobantes individuales

**Responsable sugerido:** agente de backend/pagos GPT-6.1 Sol, Extra High (`xhigh`); ajustes de UI por frontend, High (`high`). No implementar con la primera entrega.

- Agregar opción por torneo: **seña de pareja**, comportamiento actual, o **pago completo por jugador**, habilitado expresamente por el organizador.
- En modo individual, cada integrante tiene su propio comprobante y estado; ambos deben completar el requisito antes de habilitar la pareja. Cada uno puede consultar su parte pendiente.
- Mantener aprobación de inscripción, revisión de archivos, cobros, efectivo y reglas de zona existentes. El archivo de un jugador no reemplaza ni completa el del otro.
- Torneos e inscripciones existentes conservan la modalidad actual. No reinterpretar una seña histórica como pago individual ni invalidar inscripciones si cambia la configuración; guardar la modalidad aplicable al dar el alta.
- Reutilizar upload, Storage, revisión y limpieza actuales, ampliándolos sólo para identificar al integrante. No desarrollar anticipadamente esta ampliación en fases 1–5.

**Cierre futuro:** modo actual sin regresiones; modo individual exige dos comprobantes y resuelve reemplazos, bajas y subidas simultáneas correctamente.

## Delegación práctica

Reutilizar los mismos roles entre fases. Como máximo dos implementadores simultáneos, con archivos distintos; el responsable principal integra. Evitar que varios agentes modifiquen a la vez inscripciones, pagos y zonas.

Orden: **1 → 2 y 3 → 4 → 5**. La fase 6 queda en roadmap. Los niveles son una recomendación para este proyecto: Extra High para permisos, concurrencia y pagos; High para UI e integración. No hace falta Max/Ultra por defecto. [Guía oficial de modelos y razonamiento](https://learn.chatgpt.com/docs/models).

Mantener soluciones dentro de Next.js y Supabase actuales: sin microservicios, chat, filtros de ubicación/horarios, motor nuevo de pagos ni refactorizaciones ajenas al flujo.
