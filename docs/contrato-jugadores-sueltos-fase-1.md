# Contrato de datos: Jugadores sueltos, Fase 1

16 de octubre de 2026. Base preparada y probada **sólo localmente**. No hay rutas nuevas, UI, envío de correo ni despliegue remoto. El plan acordado sigue prevaleciendo.

Actualización de fase 2: este documento conserva el contrato original. La aceptación competitiva ahora usa el servicio y RPC de servidor descritos en [el resultado de fase 2](resultado-jugadores-sueltos-fase-2.md). El RPC autenticado `resolve_solo_player_request(..., 'ACCEPT')` sigue sin habilitar altas competitivas directas; para torneos usar `acceptSoloPlayerTournamentRequest`.

## Modelo y acceso

La fase 4 agrega la UI/API de solicitudes y bandeja, más RPC exclusivos de servidor para vencimiento y entrega de email. Ver [su resultado](resultado-jugadores-sueltos-fase-4.md); los contratos originales de contacto y la separación de inscripciones se conservan.

| Objeto | Contrato |
| --- | --- |
| `solo_player_posts` | Propietario de cuenta y perfil, categoría declarada, Drive/Revés, mano, ámbito general/torneo, estado, consentimiento y fechas. Sin teléfono, email, DNI o dirección. Una publicación abierta (`ACTIVE`/`PAUSED`) general por cuenta y otra por cuenta/torneo. Publicar no modifica perfil, ranking, pareja, inscripción ni cupo. |
| `solo_player_requests` | Emisor/destinatario de cuenta y perfil, publicación, ámbito, estado y resolución. Un pendiente por par de cuentas y ámbito, incluyendo el orden inverso. `inscription_id` se reserva para Fase 2. |
| `solo_player_notifications` | Avisos por destinatario y solicitud, evento, lectura y estado de email/reintento. Eventos fijos con referencias; sin direcciones o texto privado. Un evento por destinatario/solicitud/tipo. No hay worker de email en esta fase. |
| `solo_player_private.post_contacts` / `request_contacts` | Teléfonos independientes del perfil, sin permiso de lectura de tablas para `anon`, `authenticated` o `service_role`; RLS habilitado. Sólo las funciones autorizadas los consultan. |
| `solo_player_directory` | Vista `security_invoker` con datos deportivos y nombre/avatar del perfil, sin teléfonos. Oculta publicaciones pausadas, retiradas, vencidas o cerradas; un torneo lleno sigue visible con `is_actionable=false`. |
| `solo_player_request_inbox` | Vista `security_invoker`: solicitud más `effective_status` e `is_actionable`. **Usar esta vista para listar activas**, no filtrar sólo el estado almacenado. |

Todas las tablas nuevas tienen RLS. `anon` no accede al módulo. Las cuentas autenticadas leen avisos visibles y sus propias publicaciones; sólo las partes y gestores efectivos del torneo leen solicitudes. Las notificaciones sólo las lee su destinatario. No hay INSERT/UPDATE/DELETE directo para clientes. Los gestores no reciben teléfonos ocultos por su rol.

Los tipos de filas, vistas y parámetros RPC están en `types/solo-players.ts`. `database.types.ts` ya era un fallback `any`; no se reemplazó por una regeneración global con cambios ajenos.

## RPC para las fases siguientes

Los puntos de entrada públicos son `SECURITY INVOKER`; los privados verifican `auth.uid()`, propiedad o gestión, tienen `search_path=''` y grants expresos. No usar `service_role` para suplantar al usuario.

| RPC | Resultado y autorización |
| --- | --- |
| `save_solo_player_post` | Crea/edita la publicación propia. Requiere perfil vinculado, categoría del catálogo, teléfono internacional y `solo-players-contact-v1`, incluso con teléfono oculto. General: duración `1_DAY`, `1_WEEK`, `2_WEEKS`, `1_MONTH` (mes calendario). Torneo: versión de términos no vacía y fecha de aceptación del servidor. No cambia propietario, perfil ni ámbito al editar. No reabre retirados/vencidos/emparejados. |
| `set_solo_player_post_status` | Propietario: `ACTIVE`, `PAUSED`, `WITHDRAWN`. Pausar impide nuevas solicitudes y aceptación; conserva pendientes. Retirar invalida su aceptabilidad. Volver a publicar requiere un alta expresa. |
| `send_solo_player_request` | Emisor autenticado y perfil propio. Requiere teléfono y consentimiento; términos también si es torneo. No permite autosolicitud, pares pendientes duplicados/inversos ni jugadores que ya tengan pareja inscripta en ese torneo. Sin cupo disponible no admite una nueva solicitud. No crea inscripción. |
| `resolve_solo_player_request` | Destinatario: `ACCEPT`/`REJECT`; emisor: `WITHDRAW`; gestor efectivo del torneo: `INVALIDATE`. Reintentos devuelven el estado final existente. **`ACCEPT` de torneo retorna `0A000` hasta Fase 2**, sin confirmar falsamente una pareja. General acepta contacto únicamente. Comprobar siempre el estado retornado: una carrera o vencimiento puede devolver otro resultado. |
| `get_solo_player_contact` | Recibe exactamente publicación o solicitud. Publicación: dueño, o usuario autenticado si el teléfono es público y las acciones siguen habilitadas. Solicitud aceptada: sólo sus dos participantes. Al aceptar se usa el teléfono vigente del destinatario; el del emisor es el consentido al enviar. No revela email, DNI ni otros datos de perfil. |
| `mark_solo_player_notification_read` | Sólo destinatario; idempotente. El cliente no puede alterar estado de correo ni destinatarios. |
| `get_legacy_solo_players` | Sólo gestor efectivo del torneo. Agrupa inscripciones individuales por perfil, devuelve todos sus IDs y `already_in_couple`. Incluye perfiles sin cuenta. No publica, duplica, cambia ni borra registros históricos. |

La comparación vigente de gestión conserva el patrón del proyecto: rol CLUB propietario del club, ORGANIZADOR con membresía activa en la organización, o ADMIN si existe en ese entorno. No se autorizan decisiones por `user_metadata`.

## Vencimiento, cierre y concurrencia

General: la solicitud hereda el vencimiento **actual de su publicación**, sin un plazo independiente. AMERICAN: `created_at + 24 horas`. LONG: sin plazo arbitrario, vence al cerrar la operación, incluyendo entrada a `BRACKET_PHASE`. Las vistas y operaciones calculan vencimiento aunque aún no se haya materializado; un trigger de cierre del torneo lo guarda para que una reapertura no reactive avisos/solicitudes. La capacidad completa deshabilita acciones sin expirar permanentemente los avisos ni consumir cupo.

Las operaciones usan transacciones cortas, índices únicos y orden de bloqueo **fila del torneo → advisory 702 por ámbito**. Las generales comparten un ámbito de bloqueo. No se envía email dentro de estas transacciones. Fase 2 deberá integrar su bloqueo de cupo existente (701) y la creación/reutilización de inscripción respetando ese orden; deberá cerrar sólo las publicaciones del torneo e invalidar solicitudes incompatibles. Esta fase no valida la atomicidad de altas competitivas.

Los avisos recibidos/enviados/resueltos se guardan con la solicitud. Los de torneo alcanzan también a club/organizadores efectivos; los generales no inventan organizador. El futuro worker debe reutilizar Resend por tenant, reclamar/reintentar emails de forma atómica y mantener la bandeja aunque falle la entrega. No está activado ni hay cron nuevo. Un contacto ya aceptado conserva su evidencia compartida aunque se retire luego el aviso.

Las bajas actuales de inscripción siguen funcionando: su FK usa `ON DELETE SET NULL`, conservando la solicitud. Al eliminar torneo, cuenta o perfil, los nuevos datos sociales dependientes se eliminan en cascada; la migración no borra ningún registro existente. La Fase 2 debe bloquear y reutilizar los IDs individuales históricos, ignorar los ya emparejados y no convertirlos en publicaciones sin consentimiento.

## Límites de activación

**Privacidad heredada pendiente:** `players.phone`/DNI y vistas o permisos históricos de perfil siguen siendo una superficie independiente. Los nuevos contactos no se copian allí. Los consumidores de este módulo deben usar estas vistas/RPC y nunca unir `players.phone`, `users.email`, `user_details_v` ni `select('*')` de perfiles para completar tarjetas. La privacidad global heredada debe resolverse antes de activar públicamente el flujo; el esquema nuevo no afirma corregirla. Los cambios de filtrado en los listados existentes se documentan en el resultado de la fase.

**Términos y teléfono:** SQL exige evidencia explícita del consentimiento de contacto y registra una versión no vacía de términos del torneo. Todavía no comprueba que esa versión sea la vigente de FV/TPE. Como las RPC permiten `EXECUTE authenticated`, un wrapper de servidor por sí solo no impide su llamada directa: **antes de activar el flujo, la validación autoritativa de versión/tenant/restricciones debe incorporarse a la RPC o deben restringirse sus permisos de ejecución al límite servidor autorizado**. La UI debe mostrar los avisos acordados (interés sin inscripción/cupo, solicitudes/email, consentimiento y WhatsApp correcto). El límite servidor debe validar/normalizar el teléfono con `libphonenumber-js`; SQL aplica actualmente formato E.164 de 8–15 dígitos, sin comprobar asignación o titularidad del número. No hay UI/API nueva activada en esta fase.

## Validación reproducible local

Migración creada con `npx supabase migration new solo_players_phase_one` y compilada con PostgreSQL local existente. No se ejecutó reset completo de todas las migraciones históricas ni se alteró su historial.

Para una base **local** que todavía no tenga esta migración, desde PowerShell:

```powershell
Get-Content -Raw supabase/migrations/20261016170034_solo_players_phase_one.sql | docker exec -i supabase_db_padel-base-main-test psql -U postgres -d postgres --single-transaction -v ON_ERROR_STOP=1
node scripts/test-solo-players-local.mjs
```

El runner fija ese contenedor local, falla ante errores SQL o assertions `not ok`, revierte las fixtures pgTAP y borra únicamente sus fixtures aleatorias de concurrencia. La suite instala pgTAP localmente si falta. Resultado: **83 assertions pgTAP y cuatro escenarios concurrentes aprobados** (doble publicación, solicitudes inversas, aceptación frente a retiro y cierre de torneo durante envío). Cubre roles/permisos, contacto oculto/público/aceptado, consentimiento, pausa, vencimiento, histórico y bajas. El contrato TypeScript pasó su comprobación estricta aislada y el runner pasó `node --check`. La comprobación real de email, UI y aceptación competitiva pertenece a fases posteriores. La migración remota la aplica exclusivamente el propietario mediante su CI/CD.

Documentación Supabase revisada: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [funciones y privilegios](https://supabase.com/docs/guides/database/functions), [changelog](https://supabase.com/changelog). `supabase db advisors --local --type all --level warn` informó deuda previa de la base local y ningún hallazgo sobre objetos nuevos del módulo.
