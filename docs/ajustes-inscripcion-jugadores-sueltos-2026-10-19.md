# Inscripción y búsqueda de pareja — 19 de octubre de 2026

## Cambios

- La solicitud tiene una sola acción de aceptación, con las condiciones visibles y acceso al perfil del otro jugador y al torneo. Se quitó el segundo paso «Revisar y aceptar» y se acortó el encabezado.
- El texto «condiciones de búsqueda e inscripción» abre un diálogo al publicar, solicitar o aceptar pareja. Explica búsqueda, cupo, requisitos, datos de juego, contacto y avisos. Consultarlo no marca la casilla ni agrega una segunda aceptación.
- El selector se llama «Torneo para el que buscás pareja». Las búsquedas generales usan «Sin torneo definido» en formularios, directorios, filtros y notificaciones.
- El teléfono, lado y mano hábil se precargan desde el perfil. Se pueden ajustar para la búsqueda o la solicitud sin modificar el perfil. Las solicitudes guardan sus preferencias de juego de forma atómica.
- La preferencia de recibir correos está en Editar perfil → Personal → Correos y notificaciones, con guardado automático. Se quitaron las confirmaciones de correo de los formularios de búsqueda y solicitud. Desactivar correos conserva las notificaciones dentro de la aplicación.
- El diálogo detiene los clics que llegaban a la tarjeta del torneo a través del portal de React. Publicar una búsqueda conserva la página de origen.
- `/torneos`, `/torneos/[slug]` y `/panel` muestran el estado de búsqueda del jugador. También se contemplan inscripciones individuales anteriores. Una pareja formada reemplaza el estado de búsqueda.
- El organizador ve «Parejas por solicitud», filtradas por solicitudes aceptadas con inscripción. Las parejas administrativas y las inscripciones comunes no aparecen en esa lista.
- Los avisos y correos del organizador identifican a los dos jugadores y el torneo, e indican revisar inscripción, requisitos y zona. Las solicitudes y parejas incluyen enlaces al torneo.
- Se quitaron los botones «Actualizar listado» y «Actualizar avisos», los párrafos administrativos extensos y las advertencias repetidas sobre una sola seña. Se mantienen las validaciones de aprobación, comprobante, cupo y asignación de zona.

## Validación

- 109 pruebas Jest del flujo de solicitudes, preferencias de correo, notificaciones, inscripción y pagos.
- 14 nuevas comprobaciones pgTAP de preferencias, permisos, conservación del perfil, estados de correo y aislamiento de leases.
- 30 comprobaciones pgTAP del worker existente y 53 del emparejamiento, más los escenarios de concurrencia de aceptación, cupos y unión administrativa.
- HTTP contra Supabase local: publicar, duplicados, editar, pausar, reactivar, retirar, privacidad y preferencias de juego por solicitud.
- Consulta real PostgREST del filtro de parejas por solicitud aceptada.
- Navegador móvil local: apertura y permanencia de Busco pareja desde `/torneos`, precarga de datos, publicación, estado en listado/detalle/panel, guardado de preferencia de correos y cartel con una única aceptación.

El chequeo global de TypeScript sigue reportando errores fuera de este flujo; no reportó errores en los archivos del flujo modificados. El lint no pudo ejecutarse porque ESLint no está instalado en el entorno del proyecto.

## Migraciones

Se crearon y validaron exclusivamente en el contenedor local `supabase_db_padel-base-main-test`:

- `20261019141237_solo_email_preferences.sql`: estado terminal `SKIPPED` para correos desactivados, sin indicar un envío inexistente ni reintentarlos.
- `20261019141446_solo_request_game_preferences.sql`: preferencias del remitente por solicitud y RPC con controles de propiedad y permisos.

No se aplicaron migraciones remotas ni se habilitó la funcionalidad en producción. El propietario debe desplegar ambas migraciones mediante su CI/CD antes de publicar el código. El feature flag y la restricción al backend local siguen vigentes.

## Avisos de búsquedas y parejas duplicadas

- Al unir jugadores desde gestión, una pareja existente devuelve HTTP 409 con `PAIR_ALREADY_REGISTERED`, el mensaje «Esta pareja ya está inscripta en este torneo» y acceso a la inscripción existente. Se conservan la selección y el formulario. La comparación incluye ambos jugadores en cualquier orden.
- Si cualquiera de los jugadores ya integra otra pareja en ese torneo, la operación se bloquea atómicamente. Las búsquedas generales pueden seguir publicadas para otros torneos; repetir una inscripción no debe eliminarlas.
- Una publicación nueva para un torneo crea aviso en la campana y email pendiente para el club responsable y los organizadores activos de ese torneo.
- Una publicación general nueva crea aviso y email pendiente para los organizadores activos del circuito. El servidor obtiene el circuito de la configuración del sitio. Editar, pausar o reactivar no repite avisos ni se notifican retroactivamente publicaciones anteriores.
- El detalle permite ver perfil, categoría, lado, mano y estado vigente. Incluye enlace al torneo cuando corresponde. Los correos respetan la preferencia de Editar perfil y usan la cola persistente existente; un fallo del proveedor conserva el aviso y permite reintentar el email.

Se agregaron y validaron únicamente en el contenedor local:

- `20261019150908_solo_search_organizer_notifications.sql`: evento de publicación con referencia propia, unicidad y avisos de torneos.
- `20261019201837_solo_general_search_notifications.sql`: circuito por publicación, guardado atómico y avisos generales con acceso al detalle protegido por RLS.

Validación adicional: 92 pruebas Jest aprobadas; 20 comprobaciones pgTAP de avisos y 57 de emparejamiento aprobadas, más seis escenarios de concurrencia. HTTP real local y navegador confirmaron publicación general → aviso del organizador → detalle con perfil y preferencias de juego. El proveedor de correo se simuló; no se enviaron emails reales. TypeScript global conserva errores anteriores fuera de los archivos de este flujo. Estas dos migraciones también requieren despliegue por el propietario mediante CI/CD; no se ejecutaron contra ningún entorno remoto.
