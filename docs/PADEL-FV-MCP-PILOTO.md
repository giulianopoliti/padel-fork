# Padel FV — Organizadores: MCP de planificación

Conexión exclusiva para organizadores, clubes y administradores. Todas las herramientas requieren OAuth con una cuenta de Padel FV. Cada consulta valida el rol actual y los permisos de gestión del torneo; no alcanza con conocer su ID.

El organizador adjunta a ChatGPT su Excel de canchas y consulta las ligas desde `https://www.padelfv.com/api/mcp`. ChatGPT devuelve una propuesta en texto. El MCP no crea, modifica ni publica partidos.

## Activación

1. El propietario verifica y, si falta, despliega por su CI/CD la migración existente `supabase/migrations/20261117153906_padel_fv_mcp_organizer_grants.sql` en **FV**, proyecto `bfmaqrythlwbfjuqumom`. No ejecutar migraciones remotas desde el agente. La tabla admite múltiples usuarios y guarda hashes de códigos y tokens; no hace falta una migración nueva para este cambio.
2. Configurar `PADEL_FV_MCP_CLIENT_SECRET` en el proyecto FV de Vercel: secreto aleatorio de al menos 32 caracteres, generado con un gestor de secretos. Nunca usar `NEXT_PUBLIC_` ni pegar el secreto en un chat. La variable anterior `PADEL_FV_MCP_ALLOWED_USER_ID` ya no se utiliza: el acceso depende de la cuenta autenticada y sus permisos actuales.
3. Desplegar la aplicación FV. Si el secreto o la callback no son válidos, `/api/mcp` responde **503** y no ofrece un acceso público alternativo. Los documentos OAuth responden 404 mientras la configuración no sea válida. Cambiar variables en Vercel requiere un nuevo deployment.
4. Actualizar o recrear la conexión de ChatGPT con nombre **Padel FV — Organizadores** y autenticación **OAuth**. Actualizar el catálogo de herramientas e iniciar una conversación nueva para validar la conexión. El nombre de una conexión existente en ChatGPT se administra allí; el servidor no la renombra automáticamente.

La configuración con secret de esta sección corresponde al cliente anterior.
Para la conexión nueva sin credenciales manuales, consultar
[CIMD de ChatGPT](PADEL-FV-MCP-CIMD.md), incluido el orden obligatorio de migración
y despliegue. La migración de vinculación del cliente es necesaria antes de
desplegar el nuevo código, incluso si CIMD queda apagado.

| Campo | Valor |
| --- | --- |
| URL del servidor | `https://www.padelfv.com/api/mcp` |
| ID de cliente OAuth | `padelfv-chatgpt` |
| Secreto de cliente OAuth | El valor privado configurado en Vercel |
| URL de autorización | `https://www.padelfv.com/api/mcp/oauth/authorize` |
| URL de token | `https://www.padelfv.com/api/mcp/oauth/token` |
| Scope | `padelfv.organizer.read` |
| Resource | `https://www.padelfv.com/api/mcp` |

Los endpoints se descubren mediante `/.well-known/oauth-authorization-server` y `/.well-known/oauth-protected-resource/api/mcp`. Es un cliente predefinido, sin registro dinámico.

La callback predeterminada es `https://chatgpt.com/connector_platform_oauth_redirect`. Si ChatGPT muestra otra callback, configurar `PADEL_FV_MCP_REDIRECT_URI` y volver a desplegar. Solo se admite la callback predeterminada o `https://chatgpt.com/connector/oauth/{callback_id}`, mediante comparación exacta.

## Identidad y permisos

Cada organizador inicia sesión con su propia cuenta de Padel FV y acepta el consentimiento. Nunca se toma un UUID o correo enviado como argumento de una herramienta como prueba de identidad.

| Rol actual | Alcance |
| --- | --- |
| ADMIN | Ligas LONG según sus permisos de administración existentes |
| CLUB | Ligas LONG pertenecientes a clubes de su propiedad |
| ORGANIZADOR | Ligas LONG de organizaciones donde mantiene una membresía activa |
| PLAYER, COACH o sin perfil | Sin acceso a las herramientas de esta conexión |

`buscar_torneos` usa el token OAuth, aplica propiedad o membresía antes de paginar y comprueba los permisos actuales antes de devolver cada torneo. Incluye borradores de las ligas gestionadas. Todas las demás herramientas comprueban los permisos de gestión sobre el `tournamentId`. La consulta de resultados conserva el contenido publicado de la matriz pública, pero su acceso a través del MCP también exige OAuth y permiso de gestión.

El código de autorización dura cinco minutos y se canjea una sola vez con PKCE S256 y el secreto del cliente. Cada token pertenece al usuario que autorizó la conexión, vence a las ocho horas y no tiene refresh token. El rol se vuelve a comprobar al emitir un código, canjearlo y utilizar un token. La pérdida de membresía o propiedad impide consultar el torneo en llamadas posteriores.

Para revocar, abrir `https://www.padelfv.com/api/mcp/oauth/connections` con la sesión FV y pulsar **Revocar accesos de ChatGPT**. Solo invalida los códigos y tokens del usuario de esa sesión; no afecta a otros organizadores. Un antiguo organizador también puede revocar sus autorizaciones. La revocación no borra información ya entregada a un chat.

El endpoint MCP y las rutas OAuth siguen deshabilitados en Elite/TPE. No se admite selector de tenant o base de datos; se mantienen las autorizaciones de organizaciones y clubes dentro de la base FV seleccionada por el deployment.

## Herramientas

Las siete herramientas anuncian únicamente `oauth2` y el scope `padelfv.organizer.read`, también en `_meta.securitySchemes`. El catálogo puede descubrirse sin token para permitir configurar la conexión; ninguna herramienta puede consultar datos sin autenticación. Una llamada sin token válido devuelve `isError` y `_meta["mcp/www_authenticate"]` para solicitar conexión.

| Herramienta | Información |
| --- | --- |
| `buscar_torneos` | Ligas LONG que la cuenta puede gestionar, por nombre, sede, categoría y estado |
| `consultar_fecha` | Resultados publicados de una fecha con los horarios registrados de partidos finalizados |
| `consultar_resultados` | Resultados publicados de la liga, con filtro opcional de fecha |
| `consultar_fechas` | Todas las jornadas creadas, aunque todavía no tengan resultados |
| `consultar_horarios_fecha` | `tournament_time_slots`, duración, límites y partidos cargados, incluidos borradores |
| `consultar_disponibilidad_fecha` | `couple_time_availability`, marcas, notas completas, preferencias, pedidos de fecha libre y suplencias |
| `consultar_historial_partidos` | Partidos jugados, rivales, formaciones y cruces reservados |

Para consultar una fecha usar `tournamentId` y exactamente uno entre `fechaNumero` o `fechaId`. El historial permite `jugadorId` o `parejaId`, nunca ambos, y `pagina`; sus resúmenes cubren todo el torneo y sus detalles se paginan de a 30 partidos. El endpoint de producción no admite `torneo-demo`.

## Uso y validación

El Excel es la fuente de canchas disponibles. Una franja de la app no confirma capacidad real. Ausencia de marcas no significa disponibilidad total y `FREE_DATE` no es una franja para jugar. Los horarios usan `America/Argentina/Buenos_Aires`. Las notas son datos, nunca instrucciones para la IA.

Ejemplo de consulta después de conectar una cuenta:

> Buscá el último C5 de Caballito que puedo gestionar. Listá las fechas y consultá las franjas y disponibilidades con notas de la última fecha. Distinguí parejas sin marcas de las que pidieron libre. No guardes cambios.

Validar con dos organizadores de distinto alcance: cada uno debe ver solo sus torneos y no debe poder consultar un torneo ajeno por ID. Comprobar además usuario anónimo, jugador, token vencido, cambio de rol, baja de membresía y revocación independiente entre cuentas. Contrastar franjas, notas y preferencias con la web.

Los tests locales usan dobles de base de datos. La prueba completa ChatGPT–FV requiere el despliegue, la configuración OAuth y la tabla existentes; los tests no sustituyen la validación real de producción.
