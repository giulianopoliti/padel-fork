# Plan conservador para detectar errores de inscripción y comprobantes

> Plan vigente y decisiones confirmadas: `docs/plan-reservas-comprobantes-efectivo.md`. Se crea una sola inscripción al guardar la pareja, ocupa cupo y permite adjuntar el comprobante después. Efectivo configurable por torneo. Antes de zonas/inicio se resuelven las inscripciones con comprobante requerido y faltante; se descartó agregar una opción para omitir esa regla. Este documento conserva el diagnóstico y los arreglos acotados. No se implementará un sistema separado de reservas.

## Ya realizado en el código local

El servicio de inscripciones conserva su cliente Supabase en una variable propia de cada llamada. No cambia cookies ni login. La prueba de dos solicitudes superpuestas verifica que cada usuario conserve su cliente. Al 11 de octubre se implementaron también los logs, la inscripción recuperable y el efectivo configurable: 14 suites y 92 pruebas pasan, además de pruebas SQL y del recorrido local con PDF. El detalle actualizado, las limitaciones y los pasos de publicación están en el plan vigente enlazado arriba. No se desplegó. Las etapas siguientes conservan el diagnóstico original y ya no representan una lista de trabajo íntegramente pendiente.

## Caminos que debemos observar

Estos son los puntos encontrados en el flujo revisado. Que exista una posibilidad no significa que haya sido la causa del reclamo. No podemos garantizar registrar un cierre forzado del navegador o una página cuyo código nunca cargó.

| Momento | Por qué puede fallar | Qué queremos saber |
| --- | --- | --- |
| Abrir página | Mala conexión, parte de la página no carga o error al mostrarla | Página, versión y error de carga cuando sea posible reportarlo |
| Cargar cuenta | Sesión vencida, perfil incompleto o servicio sin responder | Si faltó sesión, perfil o respuesta del servicio |
| Seleccionar archivo | Selector cancelado, archivo vacío, archivo de nube no disponible | Si se seleccionó algo y si se pudo leer; cancelar no es un error |
| Reconocer archivo | El navegador no informa bien el tipo, o es un formato no admitido | Tipo informado, tamaño y motivo del rechazo |
| Preparar imagen | Imagen dañada, poca memoria o preparación que no termina | Inicio, fin, duración y causa de preparación fallida |
| Revisar tamaño | PDF demasiado pesado o imagen que no se pudo reducir lo suficiente | Tamaño original y tamaño que se iba a enviar |
| Salir al banco o cerrar formulario | Pestaña recargada, cerrada o descartada por el teléfono | Si había un envío iniciado cuyo resultado falta comprobar |
| Buscar compañero | Falla la búsqueda o realmente no hay coincidencias | Distinguir ambos casos |
| Crear compañero | Datos inválidos, falla de guardado o respuesta perdida | Si llegó a crearse el jugador, aunque falle la inscripción |
| Revisar teléfonos | No aparecen ambos jugadores o falla la consulta | Resultado de negocio, incluso si el HTTP es 200 |
| Guardar teléfonos | Falla la consulta o no se modifica el jugador esperado | Confirmación de que se guardó |
| Validar torneo y pareja | Cupo lleno, inscripción cerrada, jugador ya inscrito, restricciones, género o términos | Motivo concreto; no llamarlo error de archivo |
| Configurar transferencia | Alias/monto ausente o cambiado mientras el formulario estaba abierto | Configuración válida al momento de confirmar, sin registrar datos bancarios |
| Enviar comprobante | Corte de internet, espera excesiva o rechazo por tamaño | Si llegó la petición; si no sabemos, no asegurar que no llegó |
| Guardar inscripción | Falla el guardado o un paso posterior como términos/zona | Último paso confirmado y si quedó inscripción parcial |
| Guardar archivo | Falla Storage o se pierde su respuesta | Causa original y si se conoce el resultado del guardado |
| Vincular archivo e inscripción | Falla la actualización o no modifica ninguna fila | Fila realmente actualizada |
| Recuperarse de un fallo | No se puede borrar lo incompleto o falla también la recuperación | Resultado comprobado; nunca ocultar un segundo fallo |
| Avisar y actualizar página | Falla un aviso o la actualización posterior al guardado | Separar fallo de aviso/pantalla de fallo de inscripción |
| Leer respuesta | El servidor terminó, pero el teléfono pierde la respuesta | Guardado confirmado por servidor frente a confirmación recibida por cliente |
| Reintentar | Doble toque, otra pestaña o respuesta anterior perdida | Relacionar intentos; no repetir escrituras automáticamente todavía |
| Ir a página siguiente | La inscripción terminó pero falla la navegación | Mantener la confirmación de inscripción separada |
| Abrir comprobante guardado | Falta permiso, vence enlace, falla red o navegador bloquea ventana | Error de visualización, no pedir otra inscripción |

## Etapa 1: registros completos, con pocos cambios de comportamiento

1. Dar un código al intento y acompañarlo por todo el flujo. Mostrarlo junto a los errores.
2. En cada endpoint, registrar llegada, paso actual y resultado final. Cubrir todos los retornos, no sólo excepciones. Incluir duración y motivo concreto.
3. Conservar la causa original de los errores de Supabase y Storage en campos controlados, sin volcar respuestas completas ni datos personales.
4. Hacer que el navegador reporte los fallos anteriores al envío y los de lectura de respuesta. El servidor guarda esos reportes con el mismo código.
5. Usar códigos fijos para distinguir sesión, perfil, archivo, teléfonos, torneo, guardado y resultado desconocido. No clasificar por texto libre.
6. Crear una búsqueda guardada/documentada en Vercel por código de intento y por paso fallido.

Los reportes del navegador necesitan tamaño limitado, frecuencia limitada y campos permitidos. Si no llegan por falta de red, el proceso de inscripción no debe fallar por eso. Puede conservarse una cola pequeña de reportes sanitizados para reconexión, sin imágenes ni información bancaria. Los eventos del navegador son indicios, no prueba de que la base guardó algo.

## Etapa 2: arreglos pequeños, cada uno con su prueba

- Corregido: cliente Supabase local por solicitud.
- Teléfonos: estado HTTP coherente con el resultado y mensaje que diga qué falló.
- Formulario: no cerrarlo ni borrar sus datos por un error recuperable.
- Preparación: dejar de esperar indefinidamente y ofrecer elegir otro archivo; mantener el original si es válido y cabe. Descartar resultados tardíos.
- Guardado: comprobar que se actualizó la inscripción esperada; un resultado sin error no basta.
- Error después de guardar: no borrar un comprobante confirmado porque falle la actualización de la página.
- Recuperación: registrar y comprobar si funcionó. Si no se conoce el resultado, pedir verificar la inscripción, no sugerir simplemente otro archivo.

El arreglo de formato desconocido debe verificar el contenido y mantener la validación del servidor. No basta con confiar en que el nombre termine en .jpg. Separarlo en un cambio probado.

## Etapa 3: cambios que requieren más cuidado

Diseñar recuperación de intentos después de perder respuesta, protección frente a dos envíos del mismo intento y finalización consistente entre inscripción, términos, zona y archivo. Separar la limpieza técnica de la baja voluntaria para que un problema de guardado nunca provoque avisos o penalizaciones por retirarse. Revisar la competencia por el último cupo.

Estos cambios pueden requerir base de datos y no deben mezclarse con el primer cambio de logs. No agregar reintentos automáticos de escritura antes de tener esta protección. Los cambios comunes del repositorio deben verificarse para FV y Elite; las futuras modificaciones remotas deben seleccionar explícitamente el tenant.

## Pruebas y salida a producción

- Reproducir cada fallo controlable y verificar mensaje al jugador, estado guardado y código localizable en logs.
- Revisar que los logs no incluyan archivos, nombres de archivos, alias, cookies, tokens, DNI ni teléfonos.
- Probar cuentas separadas enviando al mismo tiempo, archivos permitidos y rechazados, errores antes y después de guardar, y resultado 200 cuya lectura falla.
- Probar en Android real, tanto navegador normal como navegador dentro de otra app, al volver del banco y con cortes de conexión. La vista móvil de una computadora no reemplaza esta prueba.
- Probar primero en un entorno sin inscripciones reales ni avisos a jugadores. Desplegar en lotes pequeños y verificar que un error intencional aparezca con su código.
- Mantener explícito qué está corregido, qué sólo está observado y qué sigue pendiente.
