# Plan de acción: inscripción guardada y comprobante después

Estado al 11 de octubre de 2026: implementado en el código y probado localmente. No desplegado ni aplicado a bases remotas. Requerimiento: TPE / Elite. Se mantiene la corrección del cliente Supabase por solicitud.

## Decisiones confirmadas

- Crear una sola inscripción al guardar la pareja. Desde ese momento ocupa cupo, aunque falte el comprobante.
- Adjuntar el comprobante después, sobre esa misma inscripción. Una falla del archivo no cancela la inscripción.
- No vence automáticamente. El cupo se libera cuando el jugador o el organizador cancelan.
- Permitir efectivo sólo cuando el organizador lo habilita para ese torneo.
- Mantener la aprobación según la configuración actual del torneo. Elegir efectivo o adjuntar un archivo no evita esa aprobación.
- Antes de armar zonas o iniciar el torneo, resolver las inscripciones que requieren comprobante y aún no lo tienen: completarlas o cancelarlas.
- Se descarta agregar una opción para permitir participar sin comprobante, tanto por torneo como por pareja.

## Así lo usa el jugador

1. Elige compañero y, cuando corresponda, transferencia o efectivo habilitado.
2. Pulsa **Guardar inscripción**. El servidor valida y guarda; recién después se confirma que tiene el lugar reservado.
3. Para transferencia, ve alias, importe y **Subir comprobante**, junto a **Tu inscripción está guardada. Falta subir el comprobante.**
4. Puede salir al banco y volver. Si el teléfono recargó la página, recupera la inscripción desde el torneo o Mis torneos y adjunta allí.
5. Para efectivo, termina este paso y ve **Efectivo**. Si el torneo exige aprobación, sigue esperando al organizador.

Si el teléfono pierde el archivo seleccionado al cerrar o recargar la pestaña, debe elegirlo otra vez. La pareja y el cupo ya guardados permanecen.

En torneos que hoy permiten inscribirse sin comprobante, se conserva ese camino. No se etiqueta automáticamente como efectivo.

## Así lo ve el organizador

| Situación | Qué muestra la inscripción |
| --- | --- |
| Eligió efectivo permitido | **Efectivo** |
| Corresponde transferencia y no hay archivo | **Falta comprobante** |
| Hay archivo adjunto | **Ver comprobante** y **Pendiente / Aprobado**, como hoy |

**Pendiente** debajo del archivo indica revisión. No significa que falte subirlo. La aprobación de la inscripción conserva su funcionamiento actual.

Las casillas de pagado siguen siendo opcionales. Elegir efectivo no significa que ya se cobró y no marca esas casillas automáticamente. No se agrega un paso obligatorio de confirmar cobro.

Mantener visibles los comprobantes y elecciones guardadas aunque después cambie la configuración. Desactivar efectivo impide nuevas elecciones; no invalida inscripciones que ya lo eligieron cuando estaba permitido. No convertir inscripciones históricas en incompletas por suposición.

## Orden de implementación

### 1. Registrar errores y corregir fallas puntuales

- Asignar un código a cada intento y mostrarlo cuando haya un error.
- Registrar en el servidor paso, resultado, duración, torneo y tenant. Cubrir rechazos normales y excepciones, incluso cuando la respuesta actual sea HTTP 200.
- Cubrir sesión/perfil, compañero, teléfonos, validaciones del torneo, guardado de inscripción, subida, asociación y consulta del archivo.
- Reportar los errores del navegador: lectura/preparación del archivo, envío y lectura de respuesta. Limitar tamaño y frecuencia; excluir archivos, datos bancarios y credenciales.
- Conservar el formulario ante fallas recuperables; limitar la espera al preparar una imagen; comprobar que el guardado modificó la inscripción esperada.
- Separar errores de avisos o actualización de pantalla de errores de guardado. Nunca borrar un comprobante asociado porque falle un paso posterior.

Si no hay conexión o el navegador se cierra de golpe, puede no llegar ningún reporte. Al volver se consulta lo guardado; no se depende de que siempre haya un log.

### 2. Guardar primero y permitir retomar

- Separar guardar la inscripción de adjuntar el archivo, reutilizando la inscripción y las pantallas existentes.
- Guardar la forma de pago y distinguir comprobante faltante de aprobación del organizador. No usar un mismo indicador para ambas cosas.
- Al volver, buscar la inscripción existente y ofrecer **Subir comprobante** cuando corresponda.
- Si se pierde la respuesta de guardado o subida, consultar el estado antes de repetir. Un doble toque u otra pestaña no deben crear otra inscripción.
- Mantener las validaciones del servidor: torneo, pareja, cupo, sesión y permisos. Al adjuntar, comprobar que la inscripción sigue activa y el archivo cumple las reglas.
- Si falla el archivo o su asociación, conservar la inscripción. Limpiar sólo archivos nuevos que se sepa que no quedaron asociados; no usar la cancelación del jugador como limpieza técnica.
- Revisar los envíos simultáneos por el último cupo y pasos posteriores al alta, como términos y avisos, para no presentar un guardado parcial como una inscripción inexistente.

No crear otra tabla de reservas, otro contador ni un proceso de conversión a inscripción.

### 3. Agregar efectivo y ajustar la presentación

- Añadir **Permitir efectivo** en creación y edición del torneo, desactivado inicialmente.
- Mostrarlo al jugador sólo cuando esté permitido y validarlo también en el servidor.
- Mostrar **Efectivo**, **Falta comprobante** o el archivo existente. Cubrir efectivo habilitado con transferencia desactivada.
- Conservar revisión del archivo, aprobación de la inscripción y casillas opcionales de pago actuales.
- Cubrir el alta del organizador, sin asignar efectivo ni dar un pago por cobrado de manera implícita.

### 4. Aplicar la misma regla antes de jugar

- Una inscripción con comprobante requerido pero faltante ocupa cupo, pero no se incorpora a zonas o partidos.
- Antes de armar zonas o iniciar, mostrar las inscripciones incompletas con acceso para resolverlas. Completar puede ser adjuntar el archivo o confirmar efectivo si está permitido; aprobar la inscripción por sí solo no reemplaza el comprobante.
- Revisar LONG, que asigna zona durante el alta, y AMERICAN, que puede crear una zona general. Deben esperar a que la inscripción esté completa y cumpla la aprobación habitual.
- Aplicar la misma comprobación en armado manual, movimientos de parejas, inicio, llaves y reemplazos. Comprobarlo en el servidor, además de la pantalla.
- No confundir archivo pendiente de revisión con archivo faltante. Efectivo permitido y torneos sin comprobante requerido no se bloquean por falta de archivo.
- No retirar parejas ni borrar partidos de torneos iniciados por cambios de configuración. Conservar registros anteriores y el flujo individual existente.

## Pruebas para darlo por terminado

| Prueba | Resultado esperado |
| --- | --- |
| Guardar y volver del banco con la página recargada | Misma inscripción, mismo cupo, puede adjuntar |
| Archivo inválido, preparación trabada o corte durante la subida | Mensaje concreto; inscripción conservada |
| El servidor guarda pero el teléfono pierde la respuesta | Al consultar aparece lo guardado, sin duplicarlo |
| Doble envío, dos pestañas y dos parejas por el último cupo | Sin duplicados ni superar el cupo |
| Falla la asociación del archivo o la actualización de pantalla | Se distingue el resultado; no se borra un archivo asociado |
| Efectivo y aprobación activados/desactivados | Se respetan ambas configuraciones; no se marca cobrado |
| LONG, AMERICAN, armado manual, inicio y reemplazos | Ningún camino incorpora una inscripción incompleta |
| Cancelar una inscripción incompleta | Libera cupo; una falla de subida nunca simula una cancelación |
| Históricas, individuales y torneos sin comprobante requerido | Conservan su comportamiento |
| Acceso desde otra cuenta o tenant | No puede modificar ni consultar comprobantes ajenos sin permiso |

Probar la vuelta del banco y los cortes de conexión en Android real, incluyendo navegador dentro de otra app cuando esté disponible. Si no se puede realizar esa prueba, dejar explícita la limitación. Verificar los cambios compartidos para FV y TPE, sin activar efectivo por defecto.

## Alcance y seguimiento

Implementar en ese orden y comprobar cada entrega antes de continuar. Un solo flujo de inscripción, sin vencimientos, contabilidad nueva, estados de archivos temporales visibles ni reintentos automáticos a ciegas.

El flujo aprobado está implementado, con una sola inscripción y sin tabla de reservas. La investigación no confirmó la causa del reclamo original; los logs nuevos permiten seguir el intento si vuelve a ocurrir y el navegador consigue enviarlo.

### Comprobaciones realizadas

- 92 pruebas de aplicación pasan: guardado y recuperación, permisos, efectivo, errores de archivo, asociación con resultado incierto, compatibilidad con pestañas antiguas, apertura de comprobantes, preparación de imágenes, avisos y pantallas.
- `npm run build:elite` finaliza correctamente con la implementación final.
- Pruebas SQL sobre TPE local: cupo, duplicados, efectivo permitido, acceso del jugador, rechazo de comprobantes inventados y cambios de importe, bloqueo de zonas/inicio. Los registros anteriores conservan su forma de pago y un archivo pendiente de revisión no se considera faltante.
- La conversión individual a pareja conserva su orden actual: puede crear la pareja antes de quitar la inscripción individual. La protección de duplicados impide repetir jugadores entre parejas, sin bloquear esa conversión.
- Dos conexiones reales a PostgreSQL compitieron por un cupo: se guardó exactamente una inscripción. Script reproducible: `supabase/tests/resumable-payment-concurrency.mjs`, limitado a TPE local.
- La migración y las pruebas SQL también pasaron en FV local dentro de una transacción revertida.
- Cuenta ficticia en la app local: guardar sin archivo por la API real, recargar el torneo, recuperar «Falta comprobante», subir un PDF desde el navegador, ver «Comprobante adjunto / Pendiente» y abrir el archivo. Se eliminaron la cuenta, el torneo y el archivo de prueba.
- Los avisos de confirmación esperan el comprobante cuando es requerido y siguen respetando la aprobación del organizador.
- La lista del organizador comparte una consulta de pagos entre sus filas, en lugar de hacer una solicitud por cada pareja.

### Pendiente para producción

1. Aplicar `supabase/migrations/20261011172839_resumable_inscription_payments.sql` al destino TPE / Elite `lzowflvgnspjdbvdxliy`, y publicar el código coordinadamente. Durante ese cambio, pausar las altas: la versión anterior no conoce la reserva incompleta y puede intentar asignarle zona. No se ejecutó ninguna de estas acciones remotas.
2. Comprobar con una inscripción controlada el guardado, recarga, subida, efectivo y revisión en el despliegue. Efectivo queda desactivado por defecto hasta que el organizador lo habilite.
3. Probar Android real y navegador dentro de WhatsApp/Instagram, volver del banco y cortar la conexión. La prueba de escritorio no reemplaza esa comprobación.

El proyecto tiene errores generales de TypeScript anteriores a este trabajo y su build omite esa validación; compilar no equivale a tener un chequeo de tipos global limpio.

### Cómo encontrar el próximo error

El mensaje al jugador muestra un código de intento. Buscar ese código y `[registration]` en los logs del servidor; los campos `tenant`, `operation`, `step`, `code`, `elapsedMs` y el tipo general de navegador permiten ubicar dónde se detuvo. Los pasos incluyen autenticación, teléfonos, guardado, Storage, asociación y apertura del archivo. Los reportes del navegador llegan a `/api/inscriptions/diagnostics` con tamaño y frecuencia limitados, sin archivo ni datos bancarios.

Si no hay conexión o Android cierra el navegador, el reporte puede no llegar. La recuperación consulta la inscripción guardada, sin depender de esos logs. Una espera agotada tampoco demuestra que el servidor no guardó: se consulta antes de repetir.

Detalle de fallas: `docs/plan-comprobantes-conservador.md`. Evidencia: `docs/investigacion-comprobantes-tpe-2026-10-10.md`.
