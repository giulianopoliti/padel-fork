# Preparación de publicación: Jugadores sueltos — FV y Elite

El código habilita el módulo en los dos proyectos de producción correspondientes:

| Sitio | Proyecto Supabase |
| --- | --- |
| Padel FV | `bfmaqrythlwbfjuqumom` |
| TPE / Elite | `lzowflvgnspjdbvdxliy` |

Se rechaza una configuración que mezcle marca y proyecto. `NEXT_PUBLIC_SOLO_PLAYERS_ENABLED=false` desactiva el módulo; al cambiar una variable pública hay que reconstruir el sitio. El backend local conserva su opt-in `NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW=true`.

## Entrega

Incluye búsquedas generales y de torneo, solicitudes, inscripción atómica, gestión, perfiles deportivos, estados en torneos/panel, notificaciones y correo. La vista del jugador muestra primero a los jugadores disponibles y después sus propias publicaciones y parejas. Se mantiene la aprobación del organizador y el comprobante cuando corresponde.

Hay nueve migraciones de esta entrega, desde `20261016170034_solo_players_phase_one.sql` hasta `20261020145054_solo_players_release_guards.sql`, en orden de versión. La última valida los términos actuales según el emisor firmado de la sesión y las restricciones de Elite en las operaciones de publicación/solicitud. Es adicional a los controles de aceptación e inscripción. No se admite seleccionar el tenant mediante `user_metadata`.

## Orden de publicación por el propietario

El agente no ejecutó migraciones remotas ni hizo push. `AGENTS.md` reserva el despliegue de las migraciones al propietario mediante CI/CD.

1. Publicar la rama de entrega para que el workflow pueda leer las migraciones. Mantener producción en su versión anterior.
2. Ejecutar manualmente **Deploy Supabase migrations** seleccionando esa rama y `tenant=both`. Verificar que FV y Elite terminaron correctamente. El workflow comprueba los refs de destino.
3. Revisar las variables de cada proyecto Vercel: marca, URL/keys de su propia base, organización del circuito, URL pública, remitente, `RESEND_API_KEY` y `CRON_SECRET`. No reutilizar valores de FV en Elite. Los archivos `.env.*.example` son ejemplos, no configuran Vercel.
4. Publicar el código en producción para ambos sitios. El push a `main` también dispara el workflow de migraciones; tras el paso 2 no debería haber pendientes de esta entrega. Evitar publicar el código antes del esquema: el servicio habitual de inscripción también usa la nueva RPC.
5. Comprobar en cada sitio con cuentas de prueba controladas: publicar una búsqueda, aviso del organizador, envío/aceptación de solicitud, inscripción existente, pago/aprobación y recepción real del email.

## Correos

En producción, el worker usa automáticamente el proveedor configurado para el proyecto. Respeta `EMAIL_ENABLED` y la preferencia de Editar perfil. `SOLO_PLAYERS_EMAIL_DELIVERY=disabled` detiene los envíos del módulo. En local o previews sigue haciendo falta el opt-in `resend` para enviar mensajes reales. Un fallo conserva el evento y permite reintento; el cron requiere su bearer `CRON_SECRET`.

No se enviaron correos reales durante la verificación. Falta comprobar entrega y remitente en cada entorno remoto.

## Evidencia local del 20/10

- Builds optimizados FV y Elite completados, usando Supabase local y correo deshabilitado. La configuración heredada omite lint y validación de tipos durante el build; compilar no certifica esos dos chequeos.
- 251 pruebas Jest aprobadas en 26 suites, incluyendo navegación para ambas marcas, privacidad de respuestas, inscripción, comprobantes, preferencias y correo.
- pgTAP: 83 comprobaciones de publicaciones/solicitudes, 57 de emparejamiento, 30 de cola de correo, 14 de preferencias, 20 de avisos y 11 nuevas de validación de términos/restricciones; escenarios de concurrencia aprobados.
- Contra ambos builds, HTTP real local: publicar/editar/pausar/retirar, duplicados, contacto oculto, aceptar/rechazar/retirar solicitudes, lectura de avisos, aceptación LONG/AMERICAN, comprobante/aprobación, asignación de zona y rechazo de parejas ya inscriptas en ambos órdenes.
- Navegador Elite: navegación, orden de secciones, formulario precargado y términos TPE. Los datos de prueba temporales se eliminaron.
- La revisión separada de TypeScript sigue registrando errores heredados fuera de los archivos del módulo, sin diagnósticos en Jugadores sueltos ni en su servicio de inscripción modificado.

Las proyecciones y el almacenamiento privado del módulo se verificaron; esto no modifica ni certifica todos los permisos históricos sobre `players` y vistas antiguas. La superficie heredada descrita en `resultado-jugadores-sueltos-fase-1.md` requiere una revisión independiente antes de prometer privacidad global de datos previamente guardados en perfiles.

## Reversión

Para ocultar el módulo, establecer `NEXT_PUBLIC_SOLO_PLAYERS_ENABLED=false` en ambos proyectos y reconstruir. No borrar tablas ni revertir las migraciones como primera medida: contienen inscripciones y evidencia de consentimientos. Conservar el esquema permite seguir administrando las parejas ya creadas.
