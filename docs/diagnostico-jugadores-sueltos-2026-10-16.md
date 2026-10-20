# Diagnóstico: Jugadores sueltos, solicitudes y notificaciones

Fecha: 16 de octubre de 2026. Alcance: revisión del código compartido FV/TPE, migraciones locales, documentación y pruebas existentes. No se implementó la funcionalidad ni se ejecutaron migraciones o mutaciones remotas.

Actualización: las aclaraciones posteriores del usuario y las decisiones aceptadas están consolidadas en [el plan de acción](C:/Users/54116/Downloads/padel-fv/docs/plan-jugadores-sueltos.md). Ese plan prevalece sobre las recomendaciones pendientes de este diagnóstico; incluye quitar bloqueos por sueltos, no republicar al cancelar pareja y dejar comprobantes individuales opcionales en el roadmap.

## Conclusión

Existe una base aprovechable para perfiles, parejas, inscripción, pagos, permisos y correo. Faltan el directorio general, las publicaciones de disponibilidad, las solicitudes entre jugadores y la bandeja persistente de notificaciones. La mejora necesita separar **buscar pareja**, **aceptar formar pareja**, **registrar la inscripción**, **adjuntar/revisar el comprobante** y **habilitar participación en zonas**.

No conviene que publicar «busco pareja» cree directamente una fila en `inscriptions`: hoy esa fila interviene en estados de inscripción, comunicaciones, listados y bloqueos del torneo.
NOTA: Modificar como esta hecho hoy en dia, actualmente genera una linea en inscriptions
## Alcance y certeza

- Hallazgos de aplicación: verificados leyendo los caminos y sus llamadas en el repositorio.
- Hallazgos SQL: describen lo que establecen las migraciones locales si están aplicadas. No se verificó el estado efectivo de las bases remotas.
- Configuración: `.codex/config.toml` identifica FV `bfmaqrythlwbfjuqumom` y Elite `lzowflvgnspjdbvdxliy`. Los MCP con esos nombres no están disponibles como herramientas en esta sesión. No se usó el conector Supabase genérico, conforme a `AGENTS.md`.
- No se verificaron variables de producción, dominios remitentes de Resend ni entrega real de emails en ninguno de los tenants.
- La documentación de pagos indica que varias mejoras recientes fueron implementadas y probadas localmente, sin despliegue remoto confirmado. Por eso no debe confundirse el comportamiento del checkout con el actualmente publicado.

## 1. Qué existe y qué puede reutilizarse

| Área | Base existente | Uso recomendado |
| --- | --- | --- |
| Identidad y perfil | `players`, vínculo `user_id`, nombre, foto, teléfono, categoría | Reutilizar identidad; publicar sólo jugadores que activen su disponibilidad |
| Datos deportivos | `preferred_side`: `DRIVE`/`REVES`; `preferred_hand`: valores UI `LEFT`/`RIGHT` | Reutilizar y precargar; normalizar mano, que actualmente es texto libre en base |
| Categorías | Catálogo `categories`, categoría/puntaje del perfil, configuración SINGLE/RANGE/MIXED_SUM | Catálogo para seleccionar nivel; separar declaración del jugador y categoría competitiva |
| Parejas e inscripciones | `RegistrationService`, estrategias LONG/AMERICAN, `couples`, `inscriptions` | Reutilizar reglas y componentes con un único camino de confirmación de pareja |
| Cupos y duplicados | Conteo de parejas; constraint por torneo/pareja; trigger con bloqueo por torneo | Conservar protecciones al crear la inscripción; ampliarlas a solicitudes y publicaciones |
| Zonas | `ensureCanonicalZoneMembership`, `ensureLongTournamentGeneralZone`, `ensureAmericanSingleZone` | Incorporar sólo parejas habilitadas; respetar formato real |
| Comprobantes | Popup retomable, Storage privado, snapshots de alias/importe, revisiones y limpieza | Reutilizar sobre la inscripción definitiva de pareja |
| Cobros | `inscription_payments`, estado pagado por miembro | Conservar como registro de cobro separado del archivo y de la aprobación de inscripción |
| Comunicaciones | `sendTournamentMessage`, adaptador email, Resend, plantillas por tenant | Extender eventos y sumar persistencia/reintentos |
| Navegación | Navbar compartida con variantes FV/TPE y menú móvil | Agregar «Jugadores sueltos» en links públicos y por rol; campana/bandeja para usuarios |

Referencias principales: `supabase/migrations/20250903221213_remote_schema.sql:2467`, `components/profile/game-data-section.tsx:50`, `components/navbar.tsx:13`, `config/permissions.ts:24`, `lib/services/registration/registration.service.ts:44`, `lib/services/tournament-zone-membership.ts:99`, `lib/services/messages/index.ts:4`.

## 2. Hallazgos y fallos posibles

### Alta: disponibilidad confundida con inscripción

El formulario individual pide teléfono, pero no categoría declarada, mano, lado ni permiso para mostrar teléfono. Llama a `registerAuthenticatedPlayerForTournament`, que termina insertando `inscriptions` con `couple_id = null`.

El servicio notifica al organizador y también intenta enviar `INSCRIPTION_APPROVED_PLAYER`. El adaptador verifica pendiente y comprobante, pero no exige que exista pareja: un individual aprobado puede recibir «Inscripción confirmada» aunque todavía esté buscando compañero.

Además, los componentes de inicio y armado de zonas bloquean el avance si quedan individuales sin emparejar. Migrar la nueva disponibilidad sin separar este concepto perpetuaría ese bloqueo. Son controles concretos de esas pantallas; hay que verificar también todos los accesos alternativos de armado al implementar.

Fuentes: `components/tournament/player/register-player-form.tsx:96`, `lib/services/registration/long-tournament-strategy.ts:277`, `lib/services/registration/registration.service.ts:457`, `lib/services/messages/email-adapter.ts:106`, `components/tournament/club/initiate-tournament-button.tsx:103`, `components/tournament/club/build-zones-button.tsx:90`.

### Transferencia: el individual está oculto

`PublicRegistrationLauncher` usa `coupleOnlyMode = enableTransferProof`; oculta el formulario individual cuando se exige comprobante. No basta con cambiar el texto del botón: la nueva publicación debe funcionar independientemente de ese requisito, porque todavía no representa una inscripción pagable.

Fuente: `components/tournament/public-registration-launcher.tsx:45`.

### Emparejamiento actual: caminos incompatibles

El botón de emparejar en `TournamentPlayersTab` llama a `pairIndividualPlayers`, no al camino de conversión del servicio.

Ese método crea la inscripción omitiendo `is_pending`, método de pago, términos y validaciones del servicio. El default local de `is_pending` es `false`; por tanto no respeta por sí mismo `validate_inscriptions`. Tampoco comprueba explícitamente en la acción que el actor gestione ese torneo. El trigger reciente de parejas sí verifica pertenencia del actor a la pareja o gestión, pero eso no representa aceptación del otro jugador.

Con transferencia, el trigger infiere `TRANSFER` al insertar la pareja:

- **LONG:** el método intenta inmediatamente crear/asignar zona. La regla de comprobantes faltantes impide esa operación. Intenta borrar la inscripción de pareja y retorna error. No deja un paso normal para subir comprobante antes de asignar.
- **AMERICAN:** puede guardar la pareja y borrar los individuales, pero no abre el popup de pago, no devuelve la inscripción al componente para continuarlo y no reconcilia la zona única en ese método. El jugador podría retomar por otros accesos, pero el flujo de emparejamiento queda incompleto.

El método tampoco ejecuta la sincronización de cupo y los mensajes que sí ejecuta el servicio central. El trigger de capacidad sigue protegiendo el límite, si está desplegado, pero el estado visual de cierre puede quedar desactualizado.

Fuentes: `components/tournament/tournament-players-tab.tsx:273`, `app/api/tournaments/actions.ts:3406`, `supabase/migrations/20261012151518_inscription_payment_popup.sql:103`.

### Conversión disponible, pero no atómica

Las estrategias contienen `convertIndividualToCouple`: crean la pareja/inscripción y después borran las filas individuales. El error devuelto por ese borrado no se comprueba. Una falla puede dejar simultáneamente la inscripción de pareja y los individuales.

El wrapper `registerCoupleForTournamentAndRemoveIndividualV2` no transmite aceptación de términos ni contexto de inscripción del organizador. En TPE AMERICAN puede ser rechazado por falta de términos. Encontré su importación en el formulario avanzado, pero éste actualmente llama al registro ordinario, no a la conversión; la importación no demuestra que la limpieza se ejecute.

Fuentes: `lib/services/registration/long-tournament-strategy.ts:365`, `lib/services/registration/american-tournament-strategy.ts:366`, `app/api/tournaments/actions.ts:6070`, `components/tournament/couple-registration-advanced/index.tsx:189`.

### Privacidad: ocultar en pantalla no alcanza

El endpoint de inscripciones devuelve `phone` y `dni` dentro de los datos de jugadores cuando permite ver el listado. La UI limita la visualización de detalles, pero los datos ya viajaron al navegador. El esquema histórico también contiene `players_public_select USING (true)` y políticas amplias de escritura sobre jugadores/inscripciones; no encontré su reemplazo en las migraciones revisadas, salvo el nuevo control de visibilidad SELECT de inscripciones.

La función de pagos agrega defensas para parejas, pero retorna pronto si `couple_id IS NULL`; no resuelve por sí sola autorización de individuales ni consentimiento de contacto. No se afirma que todas esas políticas estén vigentes en producción: debe contrastarse cada proyecto antes de publicar.

Para cumplir «mostrar teléfono sólo si quiero», el número no debe aparecer en respuestas de directorio/API sin consentimiento. Tampoco deben viajar DNI, email, fecha de nacimiento ni datos de pago al directorio. La protección debe considerar lecturas directas de la tabla, no sólo el endpoint nuevo. RLS restringe filas; proteger columnas sensibles requiere además una exposición de datos adecuada y permisos. [Referencia oficial de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

Fuentes: `app/api/tournaments/[id]/inscriptions/route.ts:131`, `supabase/migrations/20250903221213_remote_schema.sql:4198`, `supabase/migrations/20250903221213_remote_schema.sql:4387`, `supabase/migrations/20260831170937_add_public_inscriptions_visibility.sql:18`, `supabase/migrations/20261012151518_inscription_payment_popup.sql:114`.

### Categorías: declarar nivel no debe modificar ranking

El registro individual ejecuta categorización automática según el torneo. Para un perfil aún no categorizado, puede actualizar puntaje, categoría e `is_categorized`. Publicar interés en C6 no debería provocar ese cambio competitivo.

Ya existe `validateCategoryCombination`, con soporte categoría única, rango y suma, pero la búsqueda de referencias sólo encontró su definición: no está conectada a los caminos de registro revisados. Hay validación de género, pero no debe suponerse que eso valida nivel o suma.

Recomendación: categoría declarada en la publicación, precargada del perfil, claramente diferenciada de categoría asignada por el circuito. Validar elegibilidad real al solicitar y, nuevamente, al confirmar, respetando si el torneo habilita esa validación.

Fuentes: `lib/services/tournament-category-config.ts:290`, `lib/services/tournament-category-config.ts:409`, `lib/services/registration/registration.service.ts:502`, `lib/services/registration/long-tournament-strategy.ts:207`.

### Duplicados y concurrencia

Las comprobaciones de individuales consultan `inscriptions.player_id`. No recorren ambos integrantes de las parejas en ese camino: pueden no detectar a alguien ya anotado como segundo miembro o en una inscripción cargada por organizador con `player_id = null`. Tampoco encontré una unicidad local específica para individual por jugador/torneo; la unicidad por pareja admite varios valores `couple_id = null`.

Los triggers recientes sí agregan control de cupo y jugadores repetidos en parejas durante INSERT. Eso es reutilizable, pero no sustituye una transacción de aceptación: dos solicitudes simultáneas, o aceptación compitiendo con emparejamiento del organizador, deben producir un solo resultado y cerrar el resto.

Fuentes: `lib/services/registration/long-tournament-strategy.ts:227`, `lib/services/registration/american-tournament-strategy.ts:228`, `supabase/migrations/20250923210000_add_unique_constraint_tournament_couple_inscriptions.sql:17`, `supabase/migrations/20261012151518_inscription_payment_popup.sql:115`.

### Listados y estado optimista

El mapeo de individuales pierde `inscription_id`, `is_pending`, fecha y teléfono de contacto de la inscripción; toma teléfono del perfil. Una búsqueda pendiente puede presentarse como individual inscripto sin mostrar su estado, y el teléfono ingresado al registrarse no necesariamente es el mostrado.

La UI de emparejar crea una pareja temporal antes de la respuesta. En error restaura jugadores, pero deja comentada la falta de eliminación de la pareja temporal; en éxito tampoco recibe el ID real de la pareja. Conviene refrescar el resultado canónico al completar la nueva operación.

Fuentes: `app/(main)/tournaments/[id]/inscriptions/page.tsx:167`, `app/api/tournaments/[id]/inscriptions/route.ts:235`, `components/tournament/tournament-players-tab.tsx:253`.

## 3. Comprobantes y cupo: comportamiento recomendado

Conservar las decisiones ya documentadas en `docs/plan-reservas-comprobantes-efectivo.md` y `docs/resultado-aprobacion-comprobantes.md`:

1. Publicar disponibilidad o enviar solicitud no ocupa cupo ni requiere comprobante.
2. Al aceptar, o al unir el organizador, verificar que siga habiendo lugar y crear una sola inscripción de pareja. Desde ese momento reserva cupo.
3. Si corresponde transferencia, elegir/confirmar método permitido y adjuntar después sobre esa misma inscripción; el flujo es retomable. Ambos integrantes ya pueden ser reconocidos como propietarios por el endpoint de pagos.
4. Sin archivo requerido, la inscripción permanece guardada y pendiente de completar. No se cancela por una falla de subida.
5. Respetar por separado aceptación de pareja, aprobación de inscripción (`is_pending`), revisión del comprobante (`payment_proof_status`) y cobro individual (`has_paid`).
6. Las reservas guardadas no tienen vencimiento automático según la decisión documentada. No introducirlo de forma implícita al agregar solicitudes. El vencimiento de una solicitud pendiente es otra política, aún por definir.

**El comprobante actual es uno por inscripción de pareja.** Hay estados de cobro por persona, pero no dos archivos independientes. La opción de menor cambio es que cualquiera de los dos pueda aportar el archivo de esa inscripción. Si cada jugador debe transferir su parte y subir su propio comprobante, hace falta ampliar el modelo; no lo resuelven las casillas de pago.
NOTA: actualmente, esto esta bien, es seña, no pago de la inscripcion completa.

**Adjuntado no equivale a revisado ni cobrado.** Hoy la habilitación requiere que exista archivo cuando aplica y que la inscripción cumpla su aprobación; no exige que el archivo esté `APPROVED`. La aprobación independiente del comprobante fue diseñada expresamente para no cambiar inscripción, zonas ni cobros. Mantener esa semántica salvo nuevo requerimiento.

**Hay un bloqueo global deliberado:** mientras exista cualquier inscripción TRANSFER sin archivo, `require_complete_registrations` bloquea operaciones de zonas/partidos/inicio, y `reconcileCompleteInscriptions` retorna sin asignar parejas. Una pareja completa puede, por tanto, esperar porque otra no adjuntó. La nueva UI debe explicar y facilitar resolver ese bloqueo; no eliminarlo silenciosamente.

Fuentes: `app/api/tournaments/[id]/inscriptions/payment/route.ts:24`, `lib/services/registration/reconcile-complete-inscriptions.ts:9`, `supabase/migrations/20261011172839_resumable_inscription_payments.sql:95`, `supabase/migrations/20261012190000_independent_proof_approval.sql:1`.

## 4. Qué debe ocurrir por formato

| Momento | LONG | AMERICAN con varias zonas | AMERICAN con zona única |
| --- | --- | --- | --- |
| Publicación o solicitud pendiente | Sin inscripción ni zona | Igual | Igual |
| Pareja aceptada, falta aprobación o archivo requerido | Inscripción guardada, sin asignar zona | Inscripción guardada, fuera del armado | Inscripción guardada, sin asignar zona |
| Inscripción habilitada y comprobantes faltantes del torneo resueltos | Zona General, `zone_positions`, espejo `zone_couples` | Pool de parejas para armado del organizador | Zona General automática, membresía canónica |
| Llaves generadas / torneo cerrado | Volver a validar y rechazar según reglas | Igual; no regenerar fixture existente | Igual; no regenerar fixture existente |

AMERICAN no significa inscripción individual con rotación de compañeros en estos caminos: las estrategias revisadas terminan trabajando con parejas. Resolver con `TournamentFormatResolver`, no con la suposición «AMERICAN nunca asigna zona». El alta tardía debe seguir las reglas actuales y no crear partidos o modificar resultados automáticamente por aceptar una solicitud.

Fuentes: `lib/services/registration/long-tournament-strategy.ts:136`, `lib/services/registration/american-tournament-strategy.ts:136`, `lib/services/tournaments/american-single-zone.ts:29`, `lib/services/tournament-format-resolver.ts`, `lib/services/tournament-validation.service.ts:45`.

## 5. Flujo propuesto de Jugadores sueltos

- Navbar de ambos tenants, escritorio y móvil: **Jugadores sueltos**.
- Vista con disponibilidad **General** y **Para un torneo**, filtros por categoría, lado, mano y torneo; ubicación/disponibilidad horaria pueden ser una ampliación útil para el listado general.
- Formulario: categoría declarada, Drive/Revés, zurdo/diestro, consentimiento explícito para mostrar teléfono; teléfono oculto por defecto, con posibilidad de retirar consentimiento.
- Perfil/aviso gestionado por su propietario: activar, pausar, editar y retirar. No publicar automáticamente los individuales históricos importados por un organizador.
- La disponibilidad general puede coexistir con búsquedas para torneos. Emparejar en un torneo cierra la búsqueda de ese torneo; no debe borrar todas las búsquedas ni desactivar la general sin una regla explícita.
- En una tarjeta de torneo: «Solicitar inscripción juntos», mostrando torneo, costo y condiciones. Matías puede solicitar aunque todavía no tenga una publicación propia; debe tener cuenta y no estar inscripto en otra pareja de ese torneo.
- Al enviar: solicitud pendiente visible para ambos; notificación al destinatario y organizador, constancia para quien solicita. No se crea pareja ni se consume cupo.
- El destinatario puede aceptar o rechazar. El solicitante puede retirar. Aceptar revalida disponibilidad, cupo, elegibilidad, restricciones y estado del torneo.
- El organizador puede unir sin solicitud previa, como pide el requerimiento. Se registra actor y origen, se invalidan solicitudes incompatibles y se notifica a ambos. No implica marcar pago, aprobar comprobante ni omitir sus reglas.
- En general, contacto por teléfono sólo si fue habilitado. Si permanece oculto, hace falta una solicitud de contacto interna; de otro modo ese jugador no tendría una forma de ser contactado. No enviaría su email al otro jugador.

## 6. Persistencia y operación propuestas

Diseño conceptual, sin creación de tablas ni migraciones en esta revisión:

| Entidad | Responsabilidad |
| --- | --- |
| Disponibilidad/publicación | Jugador, ámbito general o torneo, categoría declarada, consentimiento de contacto, estado y fechas |
| Solicitud de pareja | Publicación destinataria, solicitante, torneo, estado, resolución y vínculo a la inscripción resultante |
| Notificación por usuario | Evento, destinatario, referencia, enlace interno, fecha de lectura |
| Entrega por canal / cola de salida | Email pendiente/enviado/fallido, reintentos, identificador de deduplicación y respuesta del proveedor |

Garantías necesarias:

- Una publicación activa general por jugador y una activa por jugador/torneo, con reglas explícitas para el ámbito general sin torneo.
- Una solicitud pendiente para la misma pareja y torneo, incluyendo el orden inverso; impedir autosolicitudes y limitar abuso/reenvíos.
- Sólo el destinatario acepta/rechaza; el solicitante retira; el organizador necesita permisos efectivos sobre ese torneo.
- Una aceptación confirma solicitud, crea/encuentra pareja e inscripción, cierra publicaciones de torneo incompatibles y guarda eventos en una transacción corta. Reintentar tras un corte devuelve el mismo resultado.
- Usar los bloqueos/protecciones de cupo existentes y ordenar bloqueos de forma consistente. No enviar emails ni subir archivos dentro de la transacción.
- Reconciliar zonas de manera idempotente después del guardado, con estado visible/reintento si se difiere. No presentar una falla de correo o zona como si la inscripción no existiera.
- Mantener separados los proyectos y las identidades de FV y TPE. No unir perfiles o solicitudes entre tenants por coincidencia de email.
- Los jugadores importados sin `user_id` no pueden aceptar solicitudes ni recibir el correo actual: requieren vinculación a una cuenta. Su inscripción administrativa puede seguir existiendo sin publicación pública.

## 7. Notificaciones: base existente y faltantes

Existe adaptador de email, no encontré bandeja persistente, contador de no leídas ni módulo de notificaciones en la app. `whatsapp` está declarado en los tipos, pero sólo se registra el adaptador email. No hace falta WhatsApp para este alcance.

Los cuatro eventos existentes son alta de inscripción al administrador, confirmación al jugador, cancelación al administrador y partido LONG programado. Faltan eventos específicos de solicitud recibida, aceptada, rechazada, retirada, invalidada y emparejamiento por organizador. También deben distinguirse «pareja formada», «falta comprobante», «esperando aprobación» e «inscripción confirmada».

El sistema actual:

- Depende de `EMAIL_ENABLED`, `RESEND_API_KEY`, `EMAIL_FROM` y `messages_enabled` del torneo.
- Saltea envíos si faltan configuración o destinatarios, sin revertir la inscripción.
- Usa claves de idempotencia para emails, pero no tiene una cola persistente de notificaciones/reintentos para esos eventos.
- Obtiene emails desde `players.user_id -> users.email`.
- Incluye destinatarios de organización, club y soporte del tenant; el módulo interno debe resolver usuarios autorizados, no guardar notificaciones para direcciones de soporte sin cuenta.

Recomendación: persistir primero la notificación y entrega pendiente, y procesar email con reintentos/deduplicación. La bandeja conserva la solicitud aunque el correo falle. Puede agregarse una cola propia o evaluar Supabase Queues; la disponibilidad del servicio no significa que ya esté instalada en estos proyectos. [Referencia oficial](https://supabase.com/docs/guides/queues).

Definir cómo interactúa el switch actual de mensajes con las solicitudes. Mi recomendación es que la bandeja mantenga los eventos necesarios para responder; las preferencias de email deben quedar expresadas por separado. No ejecutar aprobaciones mediante un GET del email: abrir la app, autenticar y confirmar con la operación autorizada.

Fuentes: `lib/services/messages/types.ts:3`, `lib/services/messages/index.ts:4`, `lib/services/email/resend-client.ts:17`, `lib/services/email/notification-utils.ts:72`, `docs/EMAIL-SERVICES.md`.

## 8. Decisiones pendientes de producto

| Decisión | Recomendación inicial |
| --- | --- |
| Categoría elegida frente a ranking | Autodeclarada en disponibilidad; no sobrescribir categoría competitiva |
| Visibilidad del directorio | Contacto y acciones para usuarios autenticados; visitantes pueden ver una invitación a entrar sin datos sensibles |
| Comprobante | Uno por inscripción de pareja, reutilizando el popup; dos comprobantes requieren ampliación explícita |
| Cupo | Se consume al crear la inscripción tras aceptación, no al publicar ni solicitar |
| Aprobación del organizador | Conservar `validate_inscriptions`; aceptar compañero no la reemplaza |
| Reservas de inscripción | Mantener sin vencimiento automático según decisión previa |
| Solicitudes sin respuesta | Definir caducidad propia, retiro y límite de solicitudes pendientes |
| Teléfono oculto en búsqueda general | Habilitar solicitud de contacto interna si se requiere contacto sin publicar número |
| Organización empareja | Permitido sin solicitud previa, con registro y aviso a ambos |
| Cancelar pareja | Definir si reactivar publicaciones; no hacerlo automáticamente sin consentimiento, y conservar reglas TPE de baja tardía |

## 9. Orden sugerido y verificación

1. Consolidar confirmación de pareja y revisar exposición de datos/permisos, preservando los pagos actuales.
2. Crear modelo de disponibilidad/solicitudes y notificaciones; revisar localmente las migraciones y políticas para ambos proyectos.
3. Construir directorio, formulario, filtros, navbar y contacto consentido.
4. Integrar aceptación y emparejamiento administrativo con inscripción, pago retomable y conciliación de zonas según formato.
5. Agregar bandeja para jugador/organizador y entrega de emails con reintentos.
6. Cubrir transición de individuales históricos, importaciones, cache/listados, bajas y pruebas de concurrencia.

Pruebas de aceptación indispensables: dos aceptaciones simultáneas, aceptación contra unión del organizador, último cupo, retiro de oferta mientras se acepta, torneo cerrado, jugador ya en otra pareja, restricción TPE, categoría inválida, solicitud inversa duplicada, destinatario sin cuenta, teléfono oculto incluso en API, caída de email, doble click, archivo inválido y vuelta del banco. Probar LONG y ambos modos AMERICAN con aprobación/comprobante/efectivo activados y desactivados; no duplicar ni regenerar partidos existentes.

### Verificación ejecutada

**8 suites y 79 pruebas existentes aprobadas**, ejecutadas localmente y con dependencias externas simuladas en las pruebas pertinentes:

- `components/tournament/__tests__/public-registration-launcher.test.tsx`
- `lib/services/messages/__tests__/tournament-messages.test.ts`
- `lib/services/registration/__tests__/inscription-validation.test.ts`
- `lib/services/__tests__/tournament-capacity.service.test.ts`
- `lib/services/__tests__/tournament-validation.service.test.ts`
- `lib/services/__tests__/tournament-category-config.test.ts`
- `app/api/tournaments/__tests__/inscription-approval.test.ts`
- `app/api/tournaments/[id]/inscriptions/payment/__tests__/route.test.ts`

Estas pruebas validan partes de la base reutilizable; no prueban las solicitudes propuestas ni equivalen a un recorrido real de producción. No se corrieron SQL de base, navegadores, build ni pruebas de entrega de correo para esta revisión. No hubo cambios de código funcional ni despliegues. El único archivo agregado es este diagnóstico.
