# Padel FV: conexión de ChatGPT mediante CIMD

## Resultado

La conexión nueva utiliza OAuth con PKCE S256 y el cliente público CIMD de
ChatGPT. El organizador agrega la URL de FV, selecciona OAuth/CIMD e inicia
sesión en FV. No copia un client ID ni un client secret.

El cliente anterior `padelfv-chatgpt` conserva su secret y su callback configurada.
Ambos métodos pueden coexistir. No se implementan DCR, Gemini, refresh tokens ni
publicación en el directorio en esta etapa. Los límites de cada plan de ChatGPT
siguen aplicándose.

## Despliegue, en este orden

1. El propietario despliega mediante su CI/CD la migración
   `supabase/migrations/20261127190000_mcp_cimd_client_binding.sql` en **FV**, proyecto
   `bfmaqrythlwbfjuqumom`. Nunca ejecutar migraciones remotas desde el agente.
   La migración agrega `client_id` con valor predeterminado `padelfv-chatgpt`, por
   lo que los códigos y tokens existentes mantienen su asociación con el cliente
   anterior. No modifica RLS ni permisos.
2. Desplegar la aplicación. **La migración debe existir antes de desplegar este
   código incluso si CIMD continúa apagado**, porque los códigos de ambos métodos
   se guardan y canjean con `client_id`.
3. Mantener `PADEL_FV_MCP_CLIENT_SECRET` para la conexión anterior. No cambiar
   `PADEL_FV_MCP_REDIRECT_URI` para activar CIMD: esa variable corresponde a la
   callback del cliente anterior.
4. Configurar `PADEL_FV_MCP_CIMD_ENABLED=true` en FV y desplegar nuevamente. La
   configuración predeterminada es `false`. CIMD también puede funcionar sin
   secret configurado; en ese caso solo se anuncia `none` y el cliente anterior
   queda deshabilitado.
5. Crear una conexión nueva en ChatGPT y validar el recorrido completo antes de
   retirar cualquier conexión anterior.

La configuración de Elite no activa estas rutas, aunque tenga la variable CIMD.

## Configuración nueva en ChatGPT

| Campo | Valor |
| --- | --- |
| Nombre | Padel FV - Organizadores |
| URL MCP | `https://www.padelfv.com/api/mcp` |
| Autenticación | OAuth |
| Registro | Documento de metadatos del identificador del cliente (CIMD) |
| Client ID y secret manuales | Vacíos; no usar cliente definido por el usuario |
| Método de autenticación del token | `none` (cliente público, dentro de OAuth) |
| Scope predeterminado | `padelfv.organizer.read` |
| Scope base adicional | Ninguno |
| OIDC | Desactivado |

Si una conexión vieja conserva metadatos anteriores, crear una nueva o actualizar
los metadatos. No reutilizar un enlace de autorización de un intento anterior.
La disponibilidad de crear MCP privados depende de la cuenta y el plan.

## Identificación y autorización

El único identificador CIMD admitido es
`https://chatgpt.com/oauth/client.json`. El servidor consulta ese documento por
HTTPS sin seguir redirecciones, con timeout de cinco segundos y límite de 16 KiB.
Comprueba `client_id`, callbacks y compatibilidad con `none`. Si el documento
incluye los métodos admitidos en plural, se utiliza esa lista, aunque el método
singular preferido sea `private_key_jwt`.

En esta etapa solo se admite la callback estable anunciada por ese documento:
`https://chatgpt.com/connector_platform_oauth_redirect`. Otras URLs de cliente o
callback se rechazan sin consultar la red. La caché de metadatos válidos dura
como máximo cinco minutos, respeta `max-age` más corto y `no-cache`/`no-store`.
Un fallo de descubrimiento no autoriza al cliente usando metadatos vencidos.

CIMD con `none` identifica un cliente público; su URL no prueba por sí sola que
una petición provenga de OpenAI. La autorización de datos depende de la sesión
FV, el consentimiento explícito, PKCE y los permisos actuales del usuario.

Cada código queda asociado al usuario, cliente, callback, recurso y desafío PKCE.
Se utiliza una sola vez y vence a los cinco minutos. El canje público rechaza
Basic, secrets y assertions; el cliente anterior sigue exigiendo su secret.
Los tokens duran ocho horas, no tienen refresh token y mantienen las validaciones
actuales de rol y acceso a cada liga. Las herramientas siguen siendo de lectura.

## Validación

- Cuenta sin sesión: login de FV conserva la solicitud, luego muestra el
  consentimiento y vuelve a ChatGPT con `code`, `state` e `iss` correctos.
- Cuenta con sesión: autorizar y cancelar funcionan sin pasar por el panel.
- Conexión CIMD sin credenciales manuales: puede consultar las ligas autorizadas.
- Cliente anterior: sigue funcionando con secret; sin secret se rechaza.
- Un código de CIMD no puede canjearse como cliente anterior ni viceversa, incluso
  con callback y verificador correctos. Callback, recurso o PKCE incorrectos,
  parámetros duplicados y códigos vencidos o reutilizados se rechazan.
- Dos conexiones de una misma cuenta FV obtienen tokens independientes.
- La revocación conserva su comportamiento: elimina todos los accesos de ChatGPT
  de la cuenta FV autenticada, incluidas sus conexiones de ambos métodos.
- Metadata ajena, inválida, redirigida o demasiado grande no habilita el cliente.

Los tests usan una base en memoria y respuestas de metadatos simuladas. La
validación con ChatGPT real se realiza después del despliegue por el propietario.

## Desactivación

Para detener nuevas conexiones CIMD, establecer `PADEL_FV_MCP_CIMD_ENABLED=false`
y desplegar. Conservar el secret del cliente anterior para que siga activo.
Los tokens ya emitidos continúan hasta vencer o revocarse, mientras el MCP siga
habilitado. No eliminar `client_id` de la tabla al desactivar CIMD.

## Referencias

- [Autenticación de plugins de OpenAI](https://developers.openai.com/plugins/build/auth)
- [Documento CIMD de ChatGPT](https://chatgpt.com/oauth/client.json)
- [Conexión de un MCP personalizado](https://developers.openai.com/api/docs/guides/custom-mcp-server)
