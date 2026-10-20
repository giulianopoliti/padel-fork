# Jugadores sueltos: resultado de la fase 3

Fecha: 16 de octubre de 2026. Implementación local sobre el contrato de fases 1–2. **Accesos nuevos desactivados en producción hasta integrar la fase 4 y resolver los límites de activación existentes.** No se crearon ni ejecutaron migraciones nuevas, ni se realizaron operaciones contra Supabase remoto.

## Pantalla y publicaciones

La ruta `/jugadores-sueltos` muestra publicaciones generales y de torneo con filtros por categoría, lado, mano y torneo. Incluye estados vacíos, carga, error recuperable y actualización manual. SWR revalida al volver a la pantalla y cada minuto; su caché se separa por cuenta. El menú compartido de escritorio/móvil incluye el enlace para visitantes y todos los roles en ambos tenants cuando el modo de prueba está habilitado. Los visitantes deben iniciar sesión para recuperar datos.

El formulario reutilizable permite publicar, editar y seleccionar categoría declarada, Drive/Revés, zurdo/diestro, teléfono y consentimiento de exposición opcional. Precarga únicamente datos deportivos del perfil propio. Los avisos generales duran 1 día, 1 semana, 2 semanas o 1 mes. Al editar se informa que la duración comienza nuevamente; el ámbito permanece fijo y se vuelve a ingresar el contacto. Se puede pausar, reactivar y retirar una publicación, con explicación previa del retiro. No se modifica el perfil, ranking, pareja ni inscripción.

Se distingue «Buscando pareja», «Solicitud pendiente», cupos llenos y pareja pendiente de aprobación/comprobante o confirmada. Los interesados están en un directorio separado de las parejas inscriptas. Las parejas enlazan al flujo existente para completar sus requisitos y recuerdan que corresponde una sola seña por pareja.

En el modo de prueba, el launcher de inscripción reemplaza el alta individual por «Busco pareja», también cuando se exige comprobante. Permite publicar interés o gestionar una búsqueda existente y evita presentarlo como inscripción. Mantiene la inscripción habitual en pareja y el pago retomable. El flujo actual de producción se conserva mientras esté deshabilitado el acceso nuevo.

## Servidor y privacidad

`/api/solo-players` autentica con `getUser`, obtiene el perfil por la cuenta de sesión y valida el teléfono mediante `libphonenumber-js`, los valores del formulario y los consentimientos antes de llamar los RPC existentes. Comprueba el origen de las escrituras. El cliente no puede elegir propietario, perfil ni versión de términos. FV registra `solo-players-tournament-v1` para las condiciones de búsqueda mostradas en el formulario; TPE registra `2026-08-28` y enlaza sus términos vigentes, además de mostrar las condiciones de búsqueda.

Las consultas y respuestas usan listas explícitas de campos. El directorio y las publicaciones propias no contienen teléfonos de jugadores, DNI, email, fecha de nacimiento ni archivos de pago. El teléfono público sólo se consulta mediante `/api/solo-players/contact`, que vuelve a autenticar y delega en `get_solo_player_contact`. El contacto oculto no se obtiene desde `players.phone`. Las respuestas usan `Cache-Control: private, no-store`; los errores no devuelven detalles internos de SQL.

Según la aclaración del usuario, **el WhatsApp de ayuda se lee de `organizaciones.phone`**, consultando el ID resuelto por `getTenantOrganization` con la configuración del tenant. Se normaliza y valida antes de construir el enlace. Si la organización no tiene un número válido, se muestra que el contacto no está disponible; no se inventa un número ni se usa el de otro organizador.

## Modo de prueba y reproducción

Se necesita `NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW=true` para mostrar los nuevos accesos. Después del ajuste de QA del 17/10 se admite desarrollo y `build/start` contra Supabase local; no se bloquea por el modo de compilación. La página y las API exigen que `NEXT_PUBLIC_SUPABASE_URL` apunte a `localhost`, `127.0.0.1` o `::1`; el modo de prueba no permite usar ninguna de las bases remotas. Configurar también las claves **locales** y la organización local del tenant para verificar su WhatsApp.

Con Next en `http://localhost:3043`, Supabase local en `http://127.0.0.1:8011` y las migraciones de fases 1–2 ya instaladas localmente:

```powershell
node scripts/test-solo-directory-local.mjs
```

El runner fija el contenedor `supabase_db_padel-base-main-test`, la URL local y el puerto del servidor. Crea usuarios y datos ficticios aleatorios y elimina exclusivamente sus fixtures al finalizar. Verifica HTTP → sesión → RPC/PostgreSQL → respuesta, incluyendo LONG y AMERICAN sin crear inscripciones. No acepta una URL remota ni envía emails reales.

## Verificación

- **68 pruebas Jest aprobadas en siete suites**, entre las nuevas y las regresiones de privacidad/emparejamiento/formulario existente. Cubren consentimiento, teléfono, duración, versiones por tenant, identidad, origen, autorización, contactos, campos privados, estados y navegación para todos los roles FV/TPE.
- **Prueba HTTP/PostgreSQL local aprobada:** publicación, duplicados, edición, pausa/reactivación, retiro, propiedad, contacto público/oculto y disponibilidad de torneo LONG/AMERICAN sin inscripciones.
- **Navegador FV:** ingreso con cuenta ficticia, publicación y retiro en escritorio y móvil de 390 × 844, edición de lado/duración/consentimiento, pausa, datos deportivos precargados, menú móvil, contacto oculto y enlace WhatsApp desde la organización configurada. Vista móvil revisada visualmente, sin desborde. No se ejecutó un segundo recorrido completo de navegador TPE; sus variantes de navegación y términos se verificaron mediante Jest.
- TypeScript global conserva **374 diagnósticos ajenos a esta fase**; ningún diagnóstico en los archivos nuevos/modificados de fase 3. No se declara build de producción exitoso.
- El intento de lint focalizado no pudo ejecutarse: Next informa `ESLint must be installed`. No se instalaron dependencias para resolver esa deuda ajena al alcance.
- `git diff --check` sin errores de whitespace. Revisión de componentes con las pautas de React: autenticación en servidor, consultas independientes concurrentes, caché por cuenta, formularios etiquetados, controles de teclado y estados recuperables.

El servidor temporal se detuvo y las fixtures del navegador se eliminaron. La revisión automática rechazó la eliminación recursiva de `.next-solo-phase3`; la carpeta generada y el log de TypeScript quedaron conservados y excluidos localmente de Git. `tsconfig.json` se restauró a su contenido anterior a la prueba.

## Continuación: fase 4 y publicación

Quedan pendientes envío/aceptación/rechazo/retiro de solicitudes desde UI, bandeja persistente, emails y reintentos. La interfaz lo indica y no presenta botones de solicitud que aún no funcionen. La fase 4 debe conectar la aceptación competitiva al servicio de fase 2 y su popup de pago.

Antes de habilitar en producción siguen siendo obligatorios los pendientes documentados en fase 1: permisos históricos de perfiles y validación autoritativa de términos/restricciones en la RPC o mediante un límite de ejecución restringido. La validación agregada en esta API no elimina la posibilidad de llamar directamente a las RPC autenticadas existentes. La fase 5 conserva su revisión integrada de ambos tenants y correos reales. El propietario despliega migraciones mediante su CI/CD.
