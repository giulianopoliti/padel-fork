# Ajustes de QA — Jugadores sueltos

17 de octubre de 2026. Cambios locales, sin despliegue ni migraciones remotas.

## Navegación y notificaciones

- «En general» ahora se muestra como **«Me es indistinto»** en el formulario, los filtros y las publicaciones.
- La campana abre un popover con las notificaciones **no leídas**. Abrir un aviso muestra una ventana con su solicitud, sus jugadores y las acciones permitidas; también lo marca como leído. «Ver todas las notificaciones» lleva a **`/notificaciones`**.
- La página completa distingue el contexto del organizador y el del jugador, permite consultar todas/no leídas, abre detalles en ventana y enlaza a la gestión de Jugadores sueltos.
- Las solicitudes y contactos están dentro de **`/jugadores-sueltos?vista=solicitudes`**. Los enlaces antiguos de `/jugadores-sueltos/solicitudes` redirigen conservando el identificador de solicitud.
- Los títulos de avisos y nuevos emails incluyen torneo, modalidad y categoría, o categoría + «Me es indistinto». Los emails ya congelados conservan su contenido para respetar la idempotencia de los reintentos.
- «Actualizar avisos» espera la revalidación, conserva la lista, muestra progreso, confirma el resultado y presenta errores recuperables. Leer un aviso sólo revalida las cachés de notificaciones.

## Diseño y perfiles

Se reutilizan los temas FV/TPE existentes para encabezados, acentos, tarjetas y ventanas. El contacto compartido tiene una superficie destacada, teléfono visible y enlace WhatsApp. El contacto continúa consultándose sólo después de la autorización en base; no se agrega a listados ni perfiles.

Se creó **`/players/[id]`**: en este checkout no existía una página en esa ruta. La ficha muestra nombre, lado/mano, torneos efectivamente jugados y victorias/derrotas. Cuenta partidos `COMPLETED`/`FINISHED` con ganador válido y dos parejas; excluye BYEs y pruebas. Pagina las consultas y deduplica resultados. No consulta teléfono, DNI ni email. Los nombres en publicaciones, solicitudes y avisos enlazan a la ficha. Abrir el perfil desde la ventana cierra esa ventana.

Las solicitudes muestran lado y mano de ambos jugadores; para el destinatario se usa la preferencia declarada en la publicación cuando está disponible. El perfil deportivo conserva sus preferencias de perfil, sin sobrescribirlas al publicar.

## Vista del organizador

Los roles CLUB, ORGANIZADOR y ADMIN reciben una pantalla de gestión con:

1. **Publicaciones:** filtros y selección de dos jugadores para formar pareja y elegir un torneo de destino.
2. **Solicitudes:** pendientes e historial de los torneos que el usuario gestiona. No permite aceptar en nombre del destinatario ni consultar contactos ocultos de los participantes.
3. **Uniones y parejas:** integrantes, requisitos pendientes, estado de zona, acceso a la inscripción y asignación de esa pareja a otro torneo.

El endpoint de gestión verifica la sesión y el rol; el destino se autoriza con `checkTournamentPermissions`. El alta llama a `RegistrationService.convertIndividualToCouple` con identidad derivada en servidor y tratamiento administrativo existente. No inserta directamente en `inscriptions`, `zone_positions` ni `zone_couples`: el servicio transaccional y la reconciliación existentes comprueban cupo, categoría, restricciones, pagos y asignación. No admite un override de restricciones enviado por el navegador. La aprobación administrativa conserva su regla actual; el comprobante no queda eximido implícitamente.

Las solicitudes generales de contacto conservan su privacidad entre participantes; no se publica su relación privada en el tablero del organizador. El organizador puede formar parejas desde las publicaciones disponibles y consultar las uniones/inscripciones de sus torneos.

## QA con build local

Se corrigió un bloqueo demasiado amplio: `NODE_ENV=production` ocultaba el módulo incluso cuando se ejecutaba `build/start` contra Supabase local. Ahora **el flag y un backend HTTP(S) de loopback** determinan su disponibilidad. Se permite `next build/start` local; las URL remotas FV/Elite siguen deshabilitadas aunque el flag sea `true`.

Los valores `NEXT_PUBLIC_*` se incorporan al build. Un `.next` generado antes del ajuste requiere reconstrucción y reinicio:

```powershell
pnpm run build:fv
pnpm run start:fv
```

Esto exige `NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW=true` y las URL/claves locales en `.env.padel-fv.local`. Para QA sin correos reales: `EMAIL_ENABLED=false` y `SOLO_PLAYERS_EMAIL_DELIVERY=`. No habilita el módulo con las bases remotas. El propietario conserva el despliegue después de su QA manual.

## Verificación

- 123 pruebas Jest en 14 suites sobre el rediseño, API, privacidad, emparejamiento y regresiones. Ocho casos adicionales del gate verifican desarrollo/producción local, flag ausente y rechazo de URL remotas o inválidas.
- HTTP + PostgreSQL local: avisos con contexto, filtro no leídas, permisos del gestor, creación de pareja administrativa, idempotencia y asignación LONG a zona. AMERICAN conserva aprobación/comprobante y el popup existente. Ficha deportiva sin contacto privado.
- Runner HTTP anterior del directorio aprobado: publicar, editar, pausar, retirar, duplicados y privacidad.
- Navegador FV: campana → no leídas → ventana → aceptación general → contacto; navegación al perfil; «Ver todas» a `/notificaciones`; recarga sin vaciar lista; vista del organizador → selección de dos publicaciones → inscripción → «En zona». Revisión visual móvil de 390 × 844 y escritorio de 1280 × 900.
- Los estilos TPE reutilizan sus tokens existentes; queda pendiente el recorrido manual completo TPE con su base local preparada y la comprobación de correo real.
- No se declara resuelta la deuda global de TypeScript/ESLint ni los pendientes de seguridad y activación de fase 5.

## Correcciones del último recorrido manual

- El formulario dice **«Tipo de torneo»**. Explica que publicar significa querer jugar sin pareja, que no inscribe ni reserva cupo y que la categoría declarada sólo se usa en esa publicación.
- El caso informado en `/tournaments/a7efb3dc-2eb3-4e07-8fdd-0b76af737bd8/inscriptions` tenía el listado público deshabilitado. El stack de React #310 corresponde al router de Next y el flujo anterior redirigía desde esa vista restringida. Los enlaces de jugadores ahora van a la página pública del torneo. El acceso directo a un listado privado muestra una explicación y enlace de regreso, sin enviar jugadores/contactos al cliente. La gestión conserva su ruta. El recorrido de navegación del usuario debe repetirse manualmente con el nuevo build; la corrección se comprobó por HTTP y pruebas de render/permisos, sin inspección de su pestaña existente.
- La exigencia de comprobante se calcula con **la configuración actual del torneo**, en Jugadores sueltos, pagos del torneo/panel, avisos por email, confirmación de solicitudes y reconciliación de zonas. Un método histórico `TRANSFER` sin archivo ya no equivale a requisito pendiente cuando el organizador lo desactiva. Los archivos, instantáneas, revisión del pago y aprobación administrativa se conservan. La caché del navegador se revalida al guardar los ajustes.
- Desactivar el requisito dispara la reconciliación de las parejas elegibles. Se corrigió también el guard de PostgreSQL para zonas/partidos/avance del torneo: respeta el flag actual y `NEW.enable_transfer_proof` cuando se cambia junto al estado.
- Migración nueva **`20261017213549_solo_proof_setting_gate.sql`**, creada con CLI y validada/ejecutada únicamente contra el contenedor FV local. Su ejecución remota queda a cargo del propietario mediante CI/CD; no se aplicó a FV/Elite remotos.

Verificación adicional: **169 pruebas Jest en 16 suites**, **10 aserciones pgTAP** con rollback y runner HTTP completo. El runner verifica listado privado sin redirect, desactivación de comprobante con aprobación aún pendiente, estado actualizado en directorio/gestor/popup y asignación LONG a zona tras desactivar el requisito. Usa jugadores y torneos sintéticos con limpieza final; no modifica el torneo del usuario ni envía correos reales.

El build FV final terminó con código 0 en `.next-solo-build-check` (sin reemplazar el build/servidor del usuario en 3000). El proyecto omite TypeScript y ESLint durante el build por su configuración existente. Se ejecutó TypeScript por separado: sigue fallando globalmente, sin diagnósticos en las superficies de esta corrección. `tsconfig.json` quedó restaurado sin incluir las carpetas temporales de verificación.
