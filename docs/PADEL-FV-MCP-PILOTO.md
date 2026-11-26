# Piloto de fixture por MCP — Padel FV

El organizador adjunta a ChatGPT su Excel de canchas y consulta las ligas desde `https://www.padelfv.com/api/mcp`. ChatGPT devuelve una propuesta en texto. El MCP no crea, modifica ni publica partidos.

## Activación

1. El propietario despliega por su CI/CD la migración `supabase/migrations/20261117153906_padel_fv_mcp_organizer_grants.sql` en **FV**, proyecto `bfmaqrythlwbfjuqumom`. No ejecutar migraciones remotas desde el agente. La tabla almacena hashes de autorizaciones y tokens, con RLS habilitada y acceso exclusivo de `service_role`.
2. En el proyecto de FV en Vercel, configurar dos variables de servidor: `PADEL_FV_MCP_ALLOWED_USER_ID`, con el UUID real de Supabase Auth de la cuenta `eventosdeportivosfv@gmail.com`, y `PADEL_FV_MCP_CLIENT_SECRET`, con un secreto aleatorio de al menos 32 bytes generado con un gestor de secretos. Conservar el secreto para la configuración OAuth de ChatGPT. No es el UUID ni una clave de Supabase. Nunca usar un prefijo `NEXT_PUBLIC_` ni pegar el secreto en un chat.
3. Desplegar la aplicación con la configuración habitual de FV. Las herramientas privadas solo se anuncian cuando están configurados el secreto y un UUID válido, y el deployment corresponde a `padel-fv`. Si falta la tabla y se activa la configuración, el acceso privado fallará; por eso la migración debe estar desplegada primero. Una modificación de variables de Vercel requiere un nuevo deployment para que se utilice.
4. Actualizar o recrear la conexión de ChatGPT con autenticación **OAuth** y los siguientes valores. No hace falta túnel.

| Campo | Valor |
| --- | --- |
| URL del servidor | `https://www.padelfv.com/api/mcp` |
| ID de cliente OAuth | `padelfv-chatgpt` |
| Secreto de cliente OAuth | El valor privado configurado en Vercel |
| URL de autorización | `https://www.padelfv.com/api/mcp/oauth/authorize` |
| URL de token | `https://www.padelfv.com/api/mcp/oauth/token` |
| Scope | `padelfv.organizer.read` |
| Resource | `https://www.padelfv.com/api/mcp` |

Los endpoints se descubren automáticamente mediante los documentos OAuth; usar la configuración avanzada solo si la interfaz lo solicita. Es un cliente predefinido, no registro dinámico.

Para generar un secreto de 32 bytes en Windows y copiarlo al portapapeles, ejecutar en una terminal propia:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | Set-Clipboard
```

Pegar el resultado en `PADEL_FV_MCP_CLIENT_SECRET` del proyecto FV en Vercel (Production, tipo Secret) y conservarlo en un gestor de contraseñas para el campo de secreto de cliente OAuth de ChatGPT. No enviarlo en el chat. No se agrega esa variable al proyecto Elite. Para desarrollo usar un secreto distinto. El UUID autorizado se configura por separado en `PADEL_FV_MCP_ALLOWED_USER_ID`.

La callback predeterminada es `https://chatgpt.com/connector_platform_oauth_redirect`. Copiar la URL exacta que muestre ChatGPT; si es distinta, configurar `PADEL_FV_MCP_REDIRECT_URI` en Vercel y volver a desplegar. Solo se admiten la callback predeterminada o `https://chatgpt.com/connector/oauth/{callback_id}`, mediante comparación exacta.

## Autorización y permisos

El organizador inicia sesión en Padel FV y acepta una pantalla de consentimiento. El código dura cinco minutos y solo se puede canjear una vez, usando PKCE S256 y el secreto del cliente. El token vence a las ocho horas de su emisión y no tiene refresh token. Para continuar hay que volver a autorizar; si la sesión de FV sigue activa, puede no pedir la contraseña de nuevo.

El consentimiento exige que el usuario de la sesión real coincida con `PADEL_FV_MCP_ALLOWED_USER_ID` y tenga un rol habilitado para gestionar. Otra cuenta se rechaza aunque sea ADMIN, CLUB u ORGANIZADOR. El correo identifica a qué cuenta pertenece el UUID; no se utiliza un correo enviado por ChatGPT como prueba de identidad.

La emisión del código, su canje y cada lectura están limitados al UUID configurado. Cambiarlo bloquea los códigos pendientes y tokens de la cuenta anterior en los deployments que ya utilizan el nuevo valor. Cada lectura también comprueba el recurso, el vencimiento y los permisos actuales del usuario sobre la liga; no se agrega una selección manual de ligas. Se mantienen los permisos existentes de ADMIN, CLUB propietario y ORGANIZADOR miembro activo.

El endpoint MCP y las rutas OAuth están deshabilitados en el deployment Elite/TPE, incluso si se copian las variables del piloto. Los lectores usan exclusivamente el cliente Supabase configurado en el deployment FV, sin selector de base ni argumentos de tenant. La separación de bases es una propiedad del servidor y de su configuración, no una instrucción que la IA deba respetar. Las instrucciones del MCP también identifican explícitamente esta conexión como Padel FV.

Para revocar antes del vencimiento, el usuario abre `https://www.padelfv.com/api/mcp/oauth/connections` con su sesión de FV y pulsa **Revocar accesos de ChatGPT**. Esto invalida todos sus tokens y códigos pendientes de este recurso, sin afectar a otros usuarios. No borra información ya entregada a un chat. Al emitir un código se limpian códigos y tokens vencidos; un código vencido no elimina un token todavía vigente.

## Herramientas y contexto

| Herramienta | Acceso | Información |
| --- | --- | --- |
| `buscar_torneos` | Público | Búsqueda de ligas públicas por nombre, sede o categoría |
| `consultar_fecha` | Público | Resultados publicados de una fecha, o datos ficticios si se pide explícitamente `torneo-demo` |
| `consultar_resultados` | Público | Resultados publicados del torneo, con filtro de fecha opcional |
| `consultar_fechas` | Organizador | Todas las jornadas creadas, con sus IDs, números, estados, período, duración y límites, aunque todavía no tengan resultados |
| `consultar_horarios_fecha` | Organizador | Franjas, duración, límites y partidos cargados, incluidos borradores |
| `consultar_disponibilidad_fecha` | Organizador | Parejas, zonas, estado de eliminación, marcas, notas completas, preferencias, pedidos de fecha libre y suplencias registradas |
| `consultar_historial_partidos` | Organizador | Totales, rivales, formaciones reales, programación registrada y cruces de zona reservados |

Para las herramientas privadas de fecha, usar `tournamentId` y exactamente uno entre `fechaNumero` o `fechaId`. El historial permite `jugadorId` o `parejaId`, nunca ambos, y `pagina`. Sus resúmenes cubren todo el torneo; los detalles se paginan de a 30 partidos y señalan `hayMas`.

Las descripciones de herramientas y las instrucciones del servidor explican cómo combinar las fuentes. Las notas se devuelven como datos, sin ejecutarlas ni convertirlas en instrucciones. ChatGPT debe señalar ambigüedades y conflictos. Estas indicaciones orientan al modelo; la autenticación y el alcance de los datos se imponen en el servidor.

El Excel es la fuente de canchas disponibles. Una franja de la app no confirma capacidad real. Ausencia de marcas no significa disponibilidad total y `FREE_DATE` no es una franja para jugar. Los horarios usan `America/Argentina/Buenos_Aires`. La propuesta conserva partidos cargados y contempla restricciones, zonas, suplencias, duración y cruces previos; cualquier excepción requiere revisión del organizador.

## Prueba piloto

Adjuntar el Excel y pedir, por ejemplo:

> Usá Padel FV para proponer los partidos de la Fecha 4 del Clausura C4 de Lasaigues Caballito/Almagro. Consultá horarios, disponibilidades con notas e historial completo. Usá este Excel para las canchas. Conservá los partidos cargados, evitá repetir rivales de zona y solapar jugadores o canchas. Mostrame la propuesta en una tabla y aparte las parejas pendientes con sus motivos. No guardes cambios.

Verificar con una fecha real: notas y preferencias fieles a la web, parejas sin marcas diferenciadas de las que piden libre, rivales y conteos correctos, suplencias y borradores contemplados. Comparar la propuesta con el fixture del organizador antes de considerar herramientas de escritura.

Probar también: usuario anónimo, cuenta sin gestión de esa liga, pérdida de membresía, token vencido y revocación. Ninguno debe poder leer notas privadas. Los resultados públicos deben seguir funcionando.

Los tests locales cubren el protocolo, los filtros, las lecturas y los límites OAuth con dobles de base de datos. La conexión completa ChatGPT–FV requiere la migración y configuración anteriores; esos tests no sustituyen una prueba real después del deploy.

Referencia del contrato de autenticación: https://developers.openai.com/plugins/build/auth
