# Investigación de comprobantes en TPE — 10 de octubre de 2026

> Actualización posterior: se corrigió localmente el cliente compartido de `RegistrationService`, manteniendo un cliente local por solicitud. La prueba concurrente ahora verifica el comportamiento correcto. Se ejecutaron 45 pruebas en 6 suites, todas aprobadas. No se desplegó. El resto del documento conserva los hallazgos de la investigación; los demás defectos siguen pendientes. Ver `docs/plan-comprobantes-conservador.md` para el plan actualizado.

## Conclusión y alcance

No se identificó la causa del reporte original: no hay mensaje exacto, horario, torneo ni dispositivo afectado. Sí se identificaron y reprodujeron fallos del código compatibles con errores en pantalla y ausencia de errores HTTP en Vercel. Android y conectividad son hipótesis; no se reprodujo el incidente en un teléfono real.

Se revisaron selección/preparación del archivo, formulario de compañero nuevo/existente, teléfonos, autenticación, endpoint multipart, servicio de inscripción, Storage, actualización de metadata, compensación de fallos y navegación final. Se consultaron Vercel y Supabase Elite de producción en modo lectura. No se modificó código funcional, no se desplegó ni se escribieron datos remotos.

Tenant investigado: **TPE / Padel Elite**, Supabase esperado `lzowflvgnspjdbvdxliy`. Vercel: `padel-elite`, proyecto `prj_lyPxitHElykJZWQTObZdo6QolWRs`.

## Evidencia de producción

- `tpepadel.com` y `www.tpepadel.com` apuntan al deployment `dpl_2ph7xKgkAYnEKcDip3ePwKBeJYxa`, estado READY, región `gru1`, runtime observado Node 24.
- Commit publicado: `02f9a9bf1749ae5eaab10734c70518f1e13e0dd7`. Coincide con HEAD local. No hay diferencias en los cuatro módulos de comprobantes ni en `register-couple-form.tsx` respecto de ese commit.
- La optimización de imágenes y el manejo de errores están publicados; provienen de `c79c1c6`, del 21 de septiembre.
- Consulta de logs: aproximadamente del **9/10 a las 12:59 al 10/10 a las 11:59**, hora Argentina. Se solicitaron hasta 100 registros y llegaron 14 eventos de comprobantes: siete `received`, siete `complete` con status 200. No hubo errores de comprobantes en los registros devueltos.
- Los siete tiempos entre `received` y `complete` fueron aproximadamente 2,3–3,0 segundos. Esto NO mide selección, compresión, subida del cuerpo hasta el servidor ni recepción completa de la respuesta por el cliente.

| Hora Argentina | Tipo recibido | Bytes recibidos | Resultado registrado |
| --- | --- | ---: | --- |
| 9/10 18:00:59 | JPEG | 3.275.962 | complete / 200 |
| 9/10 19:38:01 | PNG | 372.462 | complete / 200 |
| 9/10 19:53:44 | JPEG | 242.566 | complete / 200 |
| 9/10 20:11:26 | JPEG | 62.311 | complete / 200 |
| 10/10 10:01:02 | PNG | 654.538 | complete / 200 |
| 10/10 10:32:01 | JPEG | 62.250 | complete / 200 |
| 10/10 11:03:18 | JPEG | 24.053 | complete / 200 |

La consulta general de warning/error/fatal y la de errores agrupados devolvieron únicamente errores `PGRST103` de paginación en `/torneos` (offset mayor que cantidad de filas), sin vínculo demostrado con la subida. No deben confundirse con evidencia de este incidente.

Se intentó consultar tres días, pero Vercel rechazó ese rango por retención del plan. Se redujo a 23 horas. Ausencia de registros en esta ventana no descarta incidentes anteriores ni errores exclusivamente del navegador.

## Comprobación remota en Supabase Elite

El MCP específico `supabase-elite` quedó disponible durante la investigación. Su URL confirmó el proyecto `lzowflvgnspjdbvdxliy`. Se completaron consultas de solo lectura, sin utilizar el conector genérico.

- Bucket `inscription-proofs`: privado, límite de **10.485.760 bytes (10 MiB)** y tipos permitidos JPEG/JPG/PNG/WEBP/PDF, coincidentes con la aplicación. Su límite no es más restrictivo que los 4 MB de la app.
- **176 inscripciones PENDING_REVIEW y 55 APPROVED**: las 231 tienen path y todas encuentran un registro correspondiente en `storage.objects`. **Cero referencias a objetos inexistentes** en esta comprobación.
- Otras 1.493 inscripciones están en NOT_REQUIRED y no tienen path. Ese estado por sí solo no permite distinguir altas del organizador, históricas o posibles altas parciales; no se consideran automáticamente errores.
- **241 objetos en el bucket; 10 sin referencia actual**. Para los diez, el ID de inscripción contenido en la ruta ya no existe en `inscriptions`. Distribución: mayo 1, junio 1, septiembre 6 y octubre 2; uno corresponde a la ventana reciente. Es compatible con bajas/pruebas sin limpieza del archivo, pero no se pudo establecer la causa histórica. No son evidencia del caso simulado de UPDATE silencioso con inscripción aún existente.
- Los torneos con transferencia habilitada consultados tienen alias no vacío y monto positivo.
- Se inspeccionaron las políticas de inscriptions: UPDATE es permisiva (`USING true`); SELECT permite, entre otros, acceso al solicitante y a los integrantes de la pareja. No se encontró una política UPDATE que explique un bloqueo general de este flujo. No se ejecutaron mutaciones impersonando al usuario afectado.
- Logs de Storage del 9/10 15:59 UTC al 10/10 15:10 UTC, filtrados por bucket en URL/ruta/recursos: seis eventos de upload con 200, tres de lectura firmada con 200 y uno de firma con 200, sin eventos de error en el resultado. Los conteos de eventos de ambos proveedores no se asumieron exhaustivos ni equivalentes a una trazabilidad uno a uno.

La integridad se comprobó por metadata de Storage. No se descargaron ni se examinaron imágenes bancarias; tampoco se comprobó visualmente su legibilidad.

## Hallazgos que explican los HTTP 200

### 1. Validación exclusivamente por MIME antes de hacer la petición

`lib/tournaments/prepare-inscription-proof.ts:24` y `inscription-proof.ts:15` rechazan cualquier `file.type` fuera de la lista exacta. Un archivo denominado JPG/PDF con tipo vacío, `application/octet-stream` o `application/x-pdf` recibe “Formato no permitido”. HEIC tampoco está admitido. El código no examina el contenido para recuperar un tipo válido.

Se reprodujeron los rechazos con objetos File sintéticos. Eso demuestra el comportamiento de la validación; no demuestra que el selector de un Android concreto entregue esos valores. [MDN documenta que el tipo puede ser vacío o inesperado y desaconseja usarlo como única validación](https://developer.mozilla.org/en-US/docs/Web/API/Blob/type).

No hay petición al endpoint ni registro remoto. El error de preparación se presenta en el formulario, sin telemetría. El filtro `accept` del selector no garantiza el valor de `file.type`.

### 2. Respuesta 200 incompleta: error visible con inscripción potencialmente guardada

En `lib/tournaments/submit-inscription-proof.ts:39`, después de recibir las cabeceras se espera `response.json()`. Si se interrumpe la lectura del cuerpo, el catch devuelve error aunque `response.status` ya sea 200. Se reprodujo inyectando una respuesta con status 200 cuya lectura falla.

El usuario ve “No se pudo confirmar la inscripción. Revisá Mis torneos…”. El formulario lo titula “Error al enviar el comprobante”, aunque el fallo podría haber sucedido después del guardado. Los logs del navegador no se envían a Vercel.

No hay reintento automático, lo cual evita duplicar una mutación de resultado incierto. Tampoco hay una consulta posterior de reconciliación ni clave de idempotencia para recuperar el resultado.

### 3. Un paso previo devuelve error de negocio con HTTP 200

`app/api/players/check-phones/route.ts` devuelve `NextResponse.json(result)` sin derivar el status de `result.success`. Si no encuentra ambos jugadores, puede devolver **200 + success:false**. El formulario muestra “Error de verificación” y no llega al endpoint del comprobante.

Se reprodujo con el servicio de teléfonos simulado devolviendo error. La rama “No se encontraron ambos jugadores” tampoco emite un log de error en el servicio. Por eso filtrar exclusivamente HTTP 4xx/5xx o errores del endpoint de comprobantes deja un punto ciego.

## Preparación y comportamiento del navegador

- Las imágenes mayores de 1.000.000 bytes se decodifican antes de reducirlas. Se prueban hasta nueve codificaciones JPEG, con dimensiones máximas de 3200, 2560 y 2048. Reducir el canvas no evita la decodificación inicial de la imagen completa. En un dispositivo con poca memoria, los megapíxeles importan además del peso comprimido. No se midió el consumo en Android.
- `loadImage` y `canvas.toBlob` no tienen plazo máximo. La prueba con eventos de imagen suspendidos siguió pendiente tras 60 segundos simulados. Si el navegador no completa esos eventos, el formulario queda “Preparando comprobante…” y bloquea la confirmación, sin petición al servidor.
- `URL.createObjectURL` y la creación del canvas están fuera del bloque que recupera la imagen original. Se reprodujo que un fallo de blob URL rechaza un original de 2 MB que sí cabría en el límite. En cambio, los fallos de codificación dentro del try ya tienen fallback al original si cabe.
- El formulario y el File viven en memoria React. No hay recuperación del borrador frente a recarga, cierre o descarte de pestaña al alternar con la app bancaria. Que eso haya ocurrido a estos usuarios sigue sin comprobarse.
- Al terminar con éxito, `public-registration-launcher.tsx:128` hace `window.location.assign(...)`. Un fallo de red/carga de la página siguiente puede percibirse como fallo de inscripción después de haber recibido éxito.
- El límite efectivo del archivo es 4.000.000 bytes; las imágenes grandes pueden reducirse antes de enviarse. Los PDF no se comprimen. Probar un original pesado no implica enviar el mismo peso a Vercel. [Vercel documenta un límite de payload de 4,5 MB](https://vercel.com/docs/functions/limitations); el `serverActions.bodySizeLimit: 50mb` del proyecto no elimina ese límite y este flujo usa un Route Handler.

## Riesgos del servidor reproducidos, sin evidencia de ocurrencia remota

En `app/api/tournaments/[id]/inscriptions/couple-with-proof/route.ts`:

1. **Éxito sin verificar filas actualizadas** (líneas 165–175). El UPDATE de metadata sólo revisa `error`. Una operación que no afecte ninguna fila puede terminar en 200/success:true. Se reprodujo una respuesta de actualización con `error:null` y cero filas. RLS o una eliminación concurrente son posibles desencadenantes; no se comprobó ninguno en TPE.
2. **Excepción después de registrar, antes de guardar el path** (líneas 144–150 y 201–206). Si la lectura de bytes o el helper de upload lanza una excepción, el catch general no revierte la inscripción. Se reprodujo con el helper lanzando una excepción; no implica que todos los errores habituales del SDK se comporten así.
3. **Rollback fallido ignorado** (líneas 152–160 y 176–184). Se llama a `removeCoupleFromTournament`, pero no se comprueba su resultado. Se reprodujo devolución de error al borrar y aun así el mensaje sugiere otro archivo. Un reintento puede encontrar la inscripción existente.
4. **Borrado del comprobante después de guardar la metadata** (líneas 187–206). Si `revalidatePath` lanza una excepción, el catch elimina el objeto aunque la inscripción ya guarde su path. Se reprodujo por inyección de fallo. No hay evidencia de una excepción real de revalidación.

Además, la compensación reutiliza la baja normal de pareja. Ese servicio dispara avisos de cancelación y ejecuta `recordTpeLateWithdrawal`; en AMERICAN/TPE, una baja dentro de las tres horas previas puede registrarse como tardía. Es un riesgo deducido del código, no ejecutado contra datos reales. El alta también realiza efectos secundarios antes de que el endpoint termine de guardar el comprobante. La recuperación técnica debería estar separada de las acciones de negocio del jugador.

Los logs del endpoint omiten el mensaje/código original del error de Storage y de la actualización de metadata; su catch tampoco registra la excepción capturada. Registran etapa, tamaño y tipo, pero no alcanzan para distinguir todas las causas.

## Validación realizada

Se agregaron 12 pruebas de caracterización en `lib/tournaments/__tests__/inscription-proof-investigation.test.ts`. Documentan defectos actuales deliberadamente: que pasen no significa que el comportamiento sea deseable. Al corregirlo deben convertirse en expectativas del comportamiento corregido.

Comando:

```powershell
npm test -- --runInBand --runTestsByPath lib/tournaments/__tests__/inscription-proof.test.ts lib/tournaments/__tests__/prepare-inscription-proof.test.ts lib/tournaments/__tests__/inscription-proof-investigation.test.ts 'app/api/tournaments/[id]/inscriptions/couple-with-proof/__tests__/route.test.ts'
```

Resultado: **4 suites, 34 pruebas aprobadas**. Son pruebas unitarias con mocks, no una prueba de red móvil ni de Storage real. No se ejecutó un build porque no hubo cambios funcionales.

## Límites y próximos pasos concretos

Se completó la inspección remota con el MCP específico de Elite. El archivo `.env.padel-elite.local` apunta a `127.0.0.1` y no se usó para acceder a producción. Siguen faltando el mensaje exacto del incidente, el usuario/dispositivo afectado, una reproducción real en Android y correlación entre eventos del navegador y servidor.

Orden recomendado:

1. Instrumentar selección, preparación, teléfonos, envío y lectura de respuesta con un identificador común; registrar código de error, etapa, duración, bytes, MIME y contexto de navegador. Mostrar un código copiable junto al error. No enviar imagen, nombre del archivo, datos bancarios ni datos personales a los logs. Los eventos deben ser limitados y nunca bloquear la inscripción; contemplar que sin red tampoco llega la telemetría inmediatamente.
2. Corregir MIME desconocido con detección de contenido de los formatos soportados y validación también en servidor. No aceptar ciegamente por extensión ni tratar HEIC como JPEG.
3. Agregar salida recuperable ante preparación que no termina; conservar original cuando es admisible. Distinguir error de preparación, sesión, negocio y resultado no confirmado.
4. Confirmar la fila actualizada y separar guardado definitivo de revalidación. Implementar compensación técnica comprobable, sin penalizaciones ni avisos de baja. Consultar el resultado antes de permitir reintentos de una operación incierta.
5. Separar la limpieza de los 10 objetos sin inscripción como mantenimiento posterior, investigando primero su origen. No confundirlos con comprobantes rotos ni concluir una falla de RLS a partir del test simulado.
6. Reproducir en un Android real: Chrome y navegador embebido, archivo de Descargas vs proveedor de documentos, PNG/JPG/PDF, cambio a la app bancaria, vuelta al formulario y pérdida de conexión antes/durante/después del envío. Usar un entorno de prueba con efectos secundarios deshabilitados.

Para el próximo reporte basta con capturar el texto completo del error y la hora. Si la pantalla dice “No se pudo confirmar”, verificar primero Mis torneos antes de volver a enviar. Un mensaje de formato o “Preparando…” orienta al navegador; “Error de verificación” orienta al paso de teléfonos; una página completa de error después de confirmar exige revisar también la navegación final.

## Ampliación: mapa de fallos y diseño de recuperación

Esta ampliación responde a cómo puede fallar cada etapa y cómo implementar su detección/recuperación. Es una propuesta técnica, no una implementación. Los fallos de infraestructura/dispositivo enumerados son posibilidades, no incidentes demostrados en producción.

### Hallazgo nuevo prioritario: sesión mutable en un servicio compartido

`RegistrationService` es una instancia compartida (`registrationServiceInstance`, líneas 770–782). `prepareContext`, línea 373, guarda el cliente de Supabase en `this.supabase` y lo vuelve a leer después de varios `await`.

Intercalado reproducido con el código real del servicio y clientes simulados:

1. Solicitud A asigna el cliente A y espera su autenticación.
2. Solicitud B asigna el cliente B a la misma propiedad.
3. A recibe su usuario A, pero las consultas siguientes leen `this.supabase`, que ahora contiene B.
4. El contexto resultante conserva `user.id = A` y `supabase = cliente B`.

Prueba: `lib/tournaments/__tests__/registration-context-investigation.test.ts`, ejecutada y aprobada. Es una prueba de caracterización del defecto; el comportamiento correcto debe ser mantener cliente A para A. El módulo coincide con el commit de producción inspeccionado. El intercalado requiere solicitudes concurrentes que compartan instancia; no se demostró que el reclamo real haya tenido esta causa.

Puede provocar consultas bajo una sesión incorrecta y rechazos por permisos/perfil, además de un riesgo de aislamiento entre usuarios. La corrección directa es un cliente **local a cada invocación** (`const supabase = await createClient()`), pasado en el contexto sin almacenarlo en la instancia. No requiere cambiar Supabase ni agregar una migración. Verificar con dos solicitudes superpuestas que A nunca usa B.

### Matriz por etapa

| Etapa | Cómo puede fallar | Qué queda / qué ve el jugador | Detección y recuperación propuestas |
| --- | --- | --- | --- |
| Cargar página/formulario | Falla un recurso JavaScript, el render o la red; perfil aún sin resolver | Formulario ausente, página de error o cuenta todavía cargando; sin intento de inscripción | Captura de errores de render y carga dentro del alcance de inscripción; versión del despliegue; acción de recargar. No prometer captura si ni siquiera carga el código de diagnóstico |
| Abrir sesión | Sesión expirada, cookies de otro navegador, validación de Auth no disponible | UI puede tener datos previos; endpoint responde 401, o 404/403 al faltar perfil | Distinguir sesión vencida de servicio no disponible; conservar selección mientras sea posible; volver a autenticar y consultar estado antes de reintentar |
| Elegir archivo | Se cancela selector, proveedor de documentos no entrega archivo, archivo vacío o ilegible | No aparece archivo, error de formato o lectura; sin solicitud de upload | Registrar selección cuando exista; mensaje local específico; no tratar cancelación como fallo del servidor |
| Validar formato | Tipo vacío/genérico/no permitido; HEIC no soportado | Rechazo local incluso con nombre JPG/PDF | Identificar formatos soportados por contenido, también en servidor; error específico para formato realmente no admitido |
| Validar peso | PDF mayor de 4 MB; imagen que sigue excediendo límite tras preparación | Error local o 413 si llega al servidor/hosting | Mostrar tamaño preparado y límite efectivo; PDF no se comprime; no aumentar sólo `serverActions.bodySizeLimit` |
| Decodificar/comprimir | Imagen corrupta, falta de memoria, APIs de imagen que fallan o callbacks que no llegan | “Preparando…” indefinido, rechazo o cierre del navegador | Plazo máximo, límites de dimensiones/píxeles, descarte de resultados tardíos y fallback al original si cabe; un timeout no puede evitar un proceso del navegador terminado por el sistema |
| Cambiar de app/cerrar modal | El usuario vuelve del banco, recarga, cierra el modal o el sistema descarta la pestaña | Se pierde estado en memoria; una operación enviada puede seguir en servidor | Guardar un ID mínimo de operación; proteger cierre accidental mientras se envía; al volver consultar resultado. No guardar el comprobante bancario en localStorage |
| Buscar compañero | Error de Edge Function/red tratado como lista vacía | “Sin resultados” puede confundirse con jugador inexistente | Separar búsqueda fallida de búsqueda sin coincidencias; reintento de lectura |
| Crear compañero | Falla autenticación, identidad, categoría, inserción o recepción de la respuesta | Puede existir el jugador aunque no haya inscripción; algunos errores llaman `onComplete(false)` y cierran el modal | Conservar formulario, resolver identidad de forma segura, recuperar resultado de creación; no crear otro jugador por un timeout sin comprobar el primero |
| Verificar teléfonos | Jugador inexistente/no visible o error de consulta | `success:false` con HTTP 200; no llega al comprobante | Código `PLAYERS_NOT_FOUND`/`PHONE_CHECK_FAILED`, estado HTTP coherente y evento de negocio explícito |
| Actualizar teléfono | Error de validación, permisos, transporte o UPDATE sin filas | Mensaje de error, o éxito aparente si sólo se inspecciona `error` | Confirmar fila actualizada; no repetir automáticamente una mutación incierta sin consultar |
| Aceptar términos/configuración | No aceptados; alias/monto ausentes; configuración cambió con formulario abierto | Se bloquea botón o el servidor rechaza | Mensaje de validación próximo al campo; volver a leer configuración crítica al confirmar |
| Enviar multipart | Sin red, corte durante subida, gateway rechaza cuerpo, petición incompleta | Error de red; según cuándo se corte puede no haber ejecución o puede continuar | ID de operación previo al envío; duración/etapa; si no se conoce el resultado, marcar pendiente de verificación y consultar al recuperar red |
| Procesar dos solicitudes | Cliente Supabase almacenado en singleton se reemplaza entre awaits | Perfil y sesión inconsistentes; error aparentemente aleatorio | Cliente local por request; prueba concurrente reproducida descrita arriba |
| Validar inscripción | Torneo cerrado/lleno/cancelado, jugador bloqueado, género no compatible, pareja ya inscrita | Rechazo legítimo que no corresponde al archivo | Códigos de negocio y mensajes específicos; no titular todos los fallos como error de comprobante |
| Competir por cupo/pareja | Dos solicitudes leen disponibilidad antes de insertar | Una puede chocar con una restricción o ambas avanzar según las garantías de DB | Resolver capacidad, unicidad y finalización bajo transacción/bloqueos; la secuencia de lecturas por sí sola no garantiza exclusión. No se afirmó sobrecupo real |
| Crear inscripción y pasos posteriores | Se guarda la fila, luego falla aceptación de términos, zona LONG, actualización relacionada o revalidación del servicio | Error aunque ya exista parte de los datos; al reintentar puede decir “ya inscrito” | Finalización transaccional de escrituras de DB; estado explícito de proceso; compensación comprobada. LONG captura excepciones del DELETE pero no revisa el `error` retornado |
| Guardar en Storage | Timeout, error del proveedor, tamaño/formato rechazado, configuración incorrecta | Inscripción creada antes del archivo; puede fallar la compensación | Guardar código/status original; verificar existencia del objeto tras resultado incierto; staging y recuperación técnica sin baja de negocio |
| Guardar referencia al archivo | Error de DB, fila borrada concurrentemente, UPDATE sin filas | Archivo sin referencia o falso éxito | UPDATE con retorno de fila y comprobación explícita; no basta `error:null` |
| Revertir un fallo | La eliminación es rechazada, lanza excepción o retorna error ignorado | Inscripción parcial y nuevo intento bloqueado; posible baja tardía/avisos incorrectos | Compensación propia por ID de operación, comprobada y sin efectos de cancelación voluntaria |
| Notificar/revalidar | Avisos antes de completar comprobante; fallo tras guardado | Notificación prematura o error pese al guardado; catch puede borrar archivo ya referenciado | Notificaciones posteriores a finalización, reintentables e independientes; fallo de caché nunca elimina comprobante confirmado |
| Recibir respuesta | Cabeceras 200, pero cuerpo cortado/no JSON | Error aunque esté guardado | Consultar operación por ID; distinguir “falló” de “no pude confirmar” |
| Reintentar/doble envío | Doble toque, dos pestañas, recarga o reintento después de respuesta perdida | Duplicado, conflictos o mensajes “ya inscrito” | Clave de idempotencia persistente por intento, validada contra usuario/torneo/payload; la protección de un componente no cubre otras pestañas |
| Volver a la página | `location.assign` carga otra página y falla su red/render | Error posterior al éxito de inscripción | Confirmación visible antes de navegar; recuperar estado al volver; distinguir error de navegación de error de inscripción |
| Ver comprobante como organizador | Permisos, URL firmada vencida, red o bloqueo de nueva pestaña | “No abre” aunque el objeto exista | Nueva URL al reabrir; enlace visible con clic explícito y posibilidad de descargar; código de error de visualización separado |

La apertura actual hace `window.open` después de esperar una petición. Puede perder la activación del usuario y ser bloqueada por el navegador; [MDN documenta la exigencia de interacción directa](https://developer.mozilla.org/en-US/docs/Web/API/Window/open). Es una hipótesis de visualización, no de subida. Con `noopener` el retorno también puede ser null aunque abra, por lo que no debe diagnosticarse bloqueo únicamente por ese retorno.

### Implementación propuesta por fases

**Fase 1 — Corregir defectos acotados y hacer visible el fallo.** Cliente Supabase local por solicitud; status/código correcto en teléfonos; no cerrar el formulario por fallos recuperables; registrar causas originales de errores de DB/Storage sin datos bancarios; verificar filas actualizadas; sacar revalidación del bloque que elimina archivos ya confirmados. Añadir ID de intento, eventos por etapa y mensajes específicos. No agregar reintentos de escritura automáticos todavía.

**Fase 2 — Recuperar operaciones de resultado incierto.** Un registro de operación persistente, asociado al tenant/usuario/torneo, con clave única de idempotencia y estado. El servidor es la autoridad: una consulta autenticada permite saber si terminó, sigue procesando o falló. El cliente guarda el ID mínimo para consultar después de perder red o recargar. Un abort/timeout del navegador no se interpreta como cancelación del servidor. Reutilizar una clave con otros jugadores/archivo debe rechazarse, no devolver un éxito ajeno.

**Fase 3 — Evitar inscripciones parciales.** Subir a almacenamiento temporal vinculado a la operación y finalizar, dentro de una transacción de DB, la inscripción, referencia al comprobante, términos y asignación de zona que corresponda. Revalidar cupos/restricciones al finalizar. Storage y Postgres no forman una única transacción: si falla la finalización, conservar estado recuperable y limpiar temporales mediante una tarea idempotente posterior. Notificaciones sólo después de finalizar, mediante un mecanismo que no duplique avisos al reintentar.

No es obligatorio pasar a subida directa al navegador para empezar. Se puede conservar el endpoint actual y el límite de 4 MB. Si más adelante se requieren archivos grandes o subidas reanudables, evaluarlo como una mejora independiente.

**Fase 4 — Resistencia del navegador.** Detección segura de formato, preparación con plazo máximo, resultados tardíos descartados, fallback admisible y mensajes distintos para archivo incompatible, falta de red y resultado pendiente. Tras completar, mantener confirmación visible y ofrecer navegación. Para abrir comprobantes, ofrecer un enlace explícito en lugar de depender exclusivamente de una pestaña abierta tras un await.

### Qué registrar

Cada intento debe producir eventos correlacionados como `selected`, `prepare_failed`, `prepared`, `phones_failed`, `submit_started`, `server_received`, `storage_saved`, `registration_finalized`, `client_confirmed` o `result_unknown`.

Campos: ID de intento y request, versión del despliegue, tenant, etapa, código de error normalizado, status HTTP, duración, tamaño original/preparado, MIME declarado/detectado y contexto mínimo de navegador. El servidor asocia internamente la operación a la cuenta autorizada. No aceptar el usuario indicado por un evento cliente como prueba de identidad.

No registrar imagen, contenido PDF, nombre del archivo, alias de transferencia, teléfonos, DNI, cookies, tokens ni respuestas completas. Endpoint de diagnóstico con esquema cerrado, tamaño/rate limit y retención definida. Sus fallos nunca deben bloquear la inscripción. Sin conexión puede guardarse una cola pequeña y temporal de eventos sanitizados para enviarlos al reconectar; si se cierra o se termina el navegador, aun así no hay garantía de recibirlos.

Ejemplos de interpretación:

- `selected → prepare_failed`: no se intentó subir.
- `prepared → phones_failed`: falló un paso previo, aunque su HTTP fuera 200.
- `submit_started`, sin evento de servidor: resultado desconocido; no alcanza para asegurar que no llegó.
- `registration_finalized`, sin `client_confirmed`: el servidor terminó; falta confirmación del cliente o se perdió su telemetría. No implica automáticamente mala red.
- `result_unknown → consulta: completed`: mostrar éxito existente; no repetir inscripción.

### Verificación de la futura corrección

Las 34 pruebas previas más la prueba concurrente adicional pasan documentando el estado actual. No se modificó código funcional. Para una corrección, cambiar las expectativas de caracterización a invariantes correctas y probar:

1. Dos usuarios simultáneos nunca comparten cliente/sesión.
2. Mismo intento repetido, en dos pestañas o con respuesta perdida, produce una sola inscripción final y una sola notificación de cada tipo.
3. Dos intentos distintos por el último cupo respetan el límite; dos parejas con un jugador compartido respetan la unicidad definida.
4. Corte antes de enviar, durante multipart, después de guardar archivo, durante finalización y después de respuesta 200: estado consistente y recuperable.
5. UPDATE sin filas, fallo de términos/zona, error de Storage, limpieza fallida y fallo de revalidación: nunca falso éxito ni borrado de un comprobante confirmado.
6. Error técnico nunca genera penalización de baja tardía.
7. Archivo de tipo desconocido, vacío, corrupto, enorme en píxeles, PDF fuera de límite y callback suspendido: mensajes específicos y salida recuperable.
8. Android real: Chrome, navegador embebido, selector local/proveedor de documentos, cambio a banco y regreso, pérdida de conexión, cierre y recarga. Emular el tamaño de pantalla no sustituye esta prueba.
9. Sesión vencida, perfil ausente y torneo cerrado mientras el formulario está abierto: rechazo claro, sin perder innecesariamente el trabajo.
10. Comprobante guardado pero visualización bloqueada/vencida: mostrar una alternativa de apertura, sin pedir otra inscripción.
