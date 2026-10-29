# Plan de acción: inscripciones, comprobantes y cupos

**Acuerdo final del 28 de octubre:** este documento conserva el análisis anterior. La aprobación manual fue retirada; sin seña se reserva al inscribirse, y con seña se elige entre reservar al inscribirse o al cargar el comprobante. Tener el comprobante pendiente no excluye una pareja con lugar. El comportamiento vigente y sus verificaciones están en [implementación actual](implementacion-inscripciones-comprobantes-cupos.md).

Fecha: 27 de octubre de 2026. Ampliado el 28 de octubre con la seña y la reserva como decisiones independientes.

Estado: implementación local completada y validada. Ver [resultado y verificaciones](implementacion-inscripciones-comprobantes-cupos.md). La matriz de 100 escenarios es el alcance de revisión, no una declaración de 100 pruebas ejecutadas. No se aplican migraciones remotas desde este trabajo.

Destino funcional: TPE Padel / Padel Elite, proyecto `lzowflvgnspjdbvdxliy`. El código es compartido con FV; incluir verificación de compatibilidad en ambos tenants.

## 1. Resultado acordado

- El organizador elige por separado si solicita una seña por transferencia y si reserva lugar al anotarse. Las cuatro combinaciones están disponibles en el mismo bloque de configuración.
- Esa elección está disponible tanto al crear el torneo (`/tournaments/create`) como al editar su configuración (`/tournaments/[id]/settings`, sección de inscripciones), dentro del mismo grupo de opciones de inscripción y pago.
- Cuando elige no reservar, la inscripción existe y aparece en `Inscripciones`, pero no ocupa lugar ni puede incorporarse a zonas, partidos o llaves.
- Cuando se exige comprobante, al adjuntarlo se intenta obtener cupo; no hace falta aprobar el archivo para obtenerlo. Si no se pide seña ni se reserva inicialmente, el organizador admite la pareja expresamente. La aprobación manual de la inscripción sigue siendo independiente.
- Si el torneo está completo, se conserva el comprobante y la inscripción sigue sin cupo. El organizador recibe una indicación específica de que debe revisar el caso.
- El organizador puede admitir expresamente una pareja sin comprobante, siempre que haya cupo y que la fase del torneo permita incorporarla. La excepción queda registrada y es reconocida por todas las validaciones deportivas.
- Antes de organizar el torneo se muestran las parejas excluidas y se ofrece revisarlas o continuar expresamente sin ellas.
- Adjuntar, reemplazar, revisar un comprobante o admitir una pareja actualiza la misma inscripción. No crea otra inscripción de esa pareja.
- Efectivo sigue siendo una elección del organizador y no equivale a dinero cobrado. Respeta la preferencia de reserva inicial; si está desactivada, espera la admisión del organizador.
- Las inscripciones vigentes conservan los lugares que tenían antes del cambio.

No se incorporan reservas temporales, vencimientos de cupo, devoluciones automáticas ni una lista de espera con adjudicación automática. Las inscripciones pendientes siguen en la lista actual.

## 2. Diagnóstico comprobado

### Torneo de referencia

Consulta de lectura por MCP de TPE: `54a1cbff-b068-4297-8e5a-b701f845655a`, `AMERICANO CABALLEROS 7MA`.

- Siete parejas, todas aprobadas administrativamente.
- Ninguna con comprobante ni método de pago guardado; sin registros en `inscription_payments`.
- `enable_transfer_proof = false`, `allow_cash_payment = false`, `validate_inscriptions = false`.
- `max_participants = null`: no hay límite de lugares.
- Inscripciones no bloqueadas, listado público oculto.
- Estado `ZONE_PHASE`, sin zonas ni partidos al momento de la consulta.

Estas siete parejas no deben convertirse en pendientes por carecer de un archivo que el torneo no exige. El diagnóstico es una fotografía de la consulta; no constituye un supuesto sobre futuras modificaciones del torneo.

### Problemas actuales

1. El contador y el trigger de capacidad cuentan todas las parejas no consideradas de prueba, sin distinguir aprobación, comprobante o reserva.
2. `is_pending` representa aprobación manual; no representa falta de comprobante ni falta de cupo.
3. La columna `Estado` puede decir `Aprobada` mientras `Comprobante` dice `Pendiente de comprobante`.
4. La columna de comprobante se muestra siempre a gestión y abre detalles incluso cuando no hay datos de pago.
5. El popup promete siempre que conserva el cupo y muestra un mensaje histórico sin comprobar si existe información histórica.
6. Distintas pantallas y correos no usan el mismo criterio para anunciar una inscripción confirmada.
7. `require_complete_registrations()` y `reconcileCompleteInscriptions()` contienen bloqueos globales por comprobantes faltantes. Ocultar filas en la UI no resuelve esos bloqueos.
8. `confirm_tournament_pair` vuelve a comprobar capacidad: cambiar solamente el contador de React o un helper de servidor sería insuficiente.
9. En TPE hay permisos DML y políticas de escritura permisivas sobre `inscriptions`; existen triggers de protección específicos. Los nuevos campos privilegiados necesitan protección efectiva en base de datos, además de comprobaciones de rutas. No se realizaron escrituras para probar su explotación.

## 3. Reglas e invariantes

### 3.1 Conceptos separados

| Concepto | Fuente | Efecto |
| --- | --- | --- |
| Inscripción guardada | Fila existente en `inscriptions` | Se puede consultar y completar |
| Aprobación manual | `is_pending` existente | Indica revisión pendiente del organizador |
| Lugar ocupado | Nuevo `occupies_slot` | Reduce la disponibilidad del torneo |
| Comprobante | Método, archivo, revisión y eventual excepción | Indica si falta un requisito y si el archivo fue revisado |
| Dinero cobrado | Seguimiento manual existente | No se deduce del método ni de la presencia del archivo |

Definir un criterio compartido de elegibilidad para **nuevas** incorporaciones deportivas:

`pareja real + inscripción vigente + occupies_slot + aprobación manual resuelta + requisito de comprobante satisfecho + restricciones deportivas y de fase existentes`.

El comprobante satisface el requisito por archivo adjunto o por una excepción expresa del organizador. La revisión del archivo no se convierte en un nuevo requisito deportivo.

### 3.2 Invariantes obligatorios

- Una inscripción sin cupo nunca entra por una ruta alternativa a zonas, partidos, seeds, llaves o cálculos deportivos.
- Una inscripción con cupo puede seguir pendiente de aprobación o comprobante. `Con cupo` no significa `Confirmada`.
- Tener comprobante aprobado no permite superar la capacidad ni omitir aprobación manual.
- Las parejas sin cupo no bloquean el armado de las parejas habilitadas.
- Tampoco se incluyen silenciosamente las parejas con cupo pero con requisitos pendientes: se muestran entre las excluidas del armado.
- No se excede un máximo finito. Para admitir más parejas se modifica el máximo mediante la configuración autorizada.
- La base de datos decide el cupo; el cliente no proporciona un valor confiable de `occupies_slot`, autor de excepción o aprobación.
- Se mantienen las validaciones de identidad, pareja duplicada, jugador repetido, categoría, género, restricciones TPE, términos y fase deportiva.
- La política nueva controla la **reserva inicial**, no provoca la pérdida automática de un lugar ya adquirido al corregir o eliminar un archivo.
- Ninguna edición de archivo, configuración o caché desarma zonas, partidos, resultados ni brackets existentes.
- Un fallo de correo, caché o asignación posterior no revierte una inscripción o un cupo ya confirmado en la base.
- La ausencia de límite se representa como `Sin límite`, no como cero o una capacidad artificial.

## 4. Modelo de datos propuesto

### 4.1 Campos de negocio

| Tabla | Campo | Uso |
| --- | --- | --- |
| `tournaments` | `reserve_slot_without_proof boolean not null default true` | Política para nuevas reservas por transferencia sin archivo |
| `inscriptions` | `occupies_slot boolean not null` | Estado real de ocupación; calculado y protegido por DB |
| `inscriptions` | `proof_waived_at timestamptz null` | Excepción de comprobante decidida por gestión |
| `inscriptions` | `proof_waived_by uuid null` | Autor verificado de la excepción |
| `inscriptions` | `proof_waiver_reason text null` | Motivo o procedencia, incluido ingreso manual/importación autorizado |

Los dos primeros campos implementan la elección de cupo. Los de excepción son necesarios por la acción posterior acordada `Admitir sin comprobante`: no alcanza con asignar cupo si el resto del sistema continúa exigiendo el archivo.

No agregar un booleano redundante `proof_waived`: la presencia de la excepción se determina por su fecha y sus metadatos válidos. No reutilizar `payment_proof_status = APPROVED` para inventar un archivo aprobado.

Conservar `is_pending`, método de pago, snapshots de alias/importe, datos de revisión del archivo y seguimiento manual de cobro.

Validaciones de datos:

- Una inscripción individual no consume un cupo de pareja. Al formar una pareja se evalúa la política del torneo.
- No permitir fechas/motivos de excepción incoherentes ni atribución libre desde el navegador.
- Definir FK del autor sin borrado en cascada de la inscripción. Si se elimina una cuenta, preservar la trazabilidad disponible sin bloquear al torneo.
- Auditar `NULL` históricos en `is_pending` y `es_prueba` antes de cualquier normalización. No cambiar inadvertidamente qué filas cuentan durante la migración.
- Indexar el conteo de parejas con cupo por torneo y la consulta de pendientes sin cupo. Verificar índices con las consultas finales.
- Extender la revisión concurrente existente a los cambios de cupo, aprobación y excepción, además de los de pago. Toda decisión basada en una revisión vieja debe refrescarse.

### 4.2 Auditoría y avisos durables

Registrar eventos de asignación de cupo, admisión excepcional, liberación/baja y recepción de archivo sin cupo, con actor, fecha, torneo, inscripción y transición. No guardar bytes del archivo ni datos bancarios innecesarios en logs.

Para que los avisos no dependan de que la ruta termine sin errores, registrar el evento y la necesidad de notificación dentro de la transacción. Reutilizar un mecanismo durable compatible si existe; el flujo general de correos actual usa idempotencia del proveedor, pero eso por sí solo no garantiza reintentar un envío que nunca llegó al proveedor.

Si hace falta una nueva tabla de eventos/entregas, mantenerla privada con permisos mínimos y lectura de gestión autorizada. Aplicar claims, reintentos limitados y una clave única por evento/destinatario. La cola de limpieza de comprobantes conserva exclusivamente su responsabilidad de archivos.

### 4.3 Migración de datos y compatibilidad

- Parejas existentes que hoy cuentan para el cupo: conservar `occupies_slot = true`, incluso pendientes administrativas o sin archivo.
- Inscripciones individuales: `occupies_slot = false`.
- Tratar filas de prueba y valores históricos nulos según el inventario previo, preservando el conteo real de partida.
- No inferir métodos de pago, dinero cobrado, revisiones de archivo ni excepciones inexistentes.
- Mantener la política de reserva inicial activada por defecto para torneos existentes y nuevos, hasta que el organizador elija otra cosa.
- Fotografiar inscripciones y membresías deportivas existentes; detectar anomalías antes de activar nuevas restricciones. No reparar ni expulsar automáticamente participantes históricos.
- Actualizar tipos generados, DTOs privados y RPCs. Los nuevos campos no deben filtrar comprobantes ni metadatos internos al público.

## 5. Transiciones de inscripción y cupo

### 5.1 Alta y archivo inicial

| Acción/situación | Resultado |
| --- | --- |
| Alta sin requisito de archivo | Obtiene cupo si hay disponibilidad; aprobación manual según configuración |
| Alta por efectivo permitido | Obtiene cupo si hay disponibilidad; no se marca cobrada |
| Transferencia sin archivo, reserva inicial activada | Obtiene cupo si queda lugar; pendiente de comprobante |
| Transferencia sin archivo, reserva inicial desactivada | Se guarda sin cupo; pendiente de comprobante |
| Archivo inicial, inscripción sin cupo, hay disponibilidad | Guarda archivo e intenta asignar cupo en la misma decisión transaccional |
| Archivo inicial, inscripción sin cupo, torneo completo | Guarda archivo, conserva `occupies_slot = false`, genera atención al organizador |
| Archivo inicial, ya tenía cupo | Conserva ese cupo; no cuenta dos veces |
| Archivo con cupo, falta aprobación manual | Sigue pendiente de aprobación; no se incorpora deportivamente todavía |
| Archivo revisado/aprobado, sin cupo | Conserva la falta de cupo; aprobar archivo no equivale a admitir |

Un torneo completo no admite altas nuevas de jugadores en esta primera versión. Las inscripciones ya guardadas siguen accesibles. No convertir el cambio en una lista de espera abierta ilimitadamente.

### 5.2 Acciones del organizador

- `Aprobar solicitud`: resuelve solamente la aprobación manual. No inventa comprobante, no supera capacidad y no anuncia confirmación si quedan otros requisitos pendientes.
- `Asignar cupo`: para una inscripción sin cupo cuyo requisito de archivo está satisfecho o no existe. Revalida disponibilidad; mantiene la aprobación manual si sigue pendiente.
- `Admitir sin comprobante`: revalida fase y disponibilidad, obtiene/conserva cupo, registra excepción y resuelve aprobación manual en una única operación. Autoriza participación, no dinero cobrado.
- Con archivo ya presente, usar `Admitir pareja` cuando se quieran resolver cupo y aprobación de una vez. No registrar una dispensa innecesaria del archivo.
- Alta manual o importación: mostrar que es una admisión por gestión. Si omite un requisito de archivo, registrar esa procedencia expresamente. La capacidad y las restricciones deportivas siguen vigentes.
- Volver a ejecutar una acción completada devuelve el estado guardado; no duplica cupo, eventos ni notificaciones.

Si se libera un lugar, no adjudicarlo automáticamente por antigüedad. Mostrar que vuelve a haber disponibilidad y permitir que el organizador elija una pendiente.

### 5.3 Cambios de archivo y método

- Reemplazar un archivo conserva el lugar obtenido; el archivo nuevo vuelve a revisión pendiente y se conservan las reglas actuales de limpieza segura.
- Eliminar un archivo conserva el lugar ya obtenido. Si sigue siendo obligatorio y no hay excepción, la inscripción vuelve a pendiente de comprobante para futuras incorporaciones deportivas.
- Si ya participa en zonas/partidos, eliminar o reemplazar no borra esas relaciones ni altera resultados. Mostrar el pendiente y mantener la continuidad deportiva existente.
- Eliminar un archivo que nunca obtuvo cupo mantiene `occupies_slot = false`.
- Transferencia a efectivo: solo si está habilitado; si no tenía cupo se intenta adquirirlo y puede seguir sin cupo si está completo. No es una vía para sobrepasar el límite.
- Efectivo a transferencia: conservar el lugar obtenido; aplicar el requisito de archivo vigente y su revisión. El cambio no implica liberar una inscripción válida.
- Una excepción explícita no desaparece por subir o reemplazar un archivo. Su eventual revocación debe ser una acción autorizada separada, no un efecto lateral del editor.
- No incorporar UI de revocación en la primera versión salvo que sea necesaria; impedir que los clientes la fabriquen mediante escrituras directas.
- Una URL firmada vencida, un error de lectura de Storage o un archivo que dejó de existir no cancela automáticamente la inscripción ni libera el lugar. Mostrar el error, permitir renovar el acceso o regularizar el archivo y registrar la inconsistencia.

### 5.4 Cambios de configuración

- Cambiar `reserve_slot_without_proof` afecta altas futuras; no libera ni adjudica retroactivamente lugares existentes.
- Desactivar el requisito de comprobante deja de exigirlo, conserva archivos/métodos/snapshots y no asigna cupos silenciosamente a todas las pendientes. Las que sigan sin lugar muestran `Pendiente de asignación de cupo`.
- Reactivar transferencia no convierte métodos históricos `NULL` en transferencias. Si reactiva requisitos para transferencias ya guardadas, mostrar el alcance antes de guardar; conservar cupos y actividad deportiva existentes. Las excepciones expresas continúan vigentes.
- Desactivar efectivo impide elecciones nuevas; conserva la elección histórica y no la convierte en transferencia.
- Desactivar aprobación manual conserva el comportamiento actual de resolver las aprobaciones pendientes, pero no otorga cupos inexistentes ni omite archivo obligatorio.
- Activar aprobación manual afecta nuevas inscripciones, sin volver pendientes las ya aprobadas.
- Editar alias/importe conserva snapshots de elecciones existentes según el comportamiento actual; hacer explícito qué datos rigen para cada pareja. No reescribir una transferencia histórica.
- Aumentar capacidad vuelve a ofrecer lugares, sin adjudicar pendientes en silencio.
- Propuesta: impedir reducir capacidad por debajo de los lugares ocupados; nunca expulsar parejas para cumplir un máximo nuevo. Si ya existe sobrecupo histórico, mostrarlo y bloquear nuevas adjudicaciones.
- Sin máximo no existe el caso `Torneo completo`; siguen siendo válidos los estados sin cupo mientras se completa el requisito inicial.

### 5.5 Cierre, fases, bajas y cambios de pareja

- Diferenciar cierre manual, cierre por capacidad y cierre deportivo. Liberar un cupo no reabre un torneo cerrado manualmente o por fase.
- Tras el cierre, permitir consultar y adjuntar evidencia a inscripciones existentes; no asignar automáticamente participación en una fase que ya no admite ingresos.
- Torneo cancelado o finalizado: consulta y gestión de evidencia con permisos existentes; no nuevas admisiones deportivas ni correos de confirmación de ingreso.
- Baja/rechazo de una inscripción sin cupo no libera un lugar que nunca tuvo.
- Baja de una que tenía cupo libera exactamente uno. No adjudica automáticamente ese lugar a otra pendiente.
- Eliminación deportiva o descalificación no equivale a baja administrativa: no libera automáticamente un lugar para introducir un reemplazo en una competencia en marcha.
- Mantener la política TPE de baja tardía. Antes de implementar, definir que una pareja nunca admitida y sin cupo no se trate como participante confirmado a efectos de penalización; validar el cambio con las reglas vigentes.
- Estar completo no elimina ni rechaza pendientes automáticamente.
- Rechazo/baja con archivo: requiere acción explícita y explicar la política actual de eliminación del comprobante. Nunca tomarlo como prueba de una devolución; esa gestión es manual y debe resolverse antes de descartar evidencia necesaria.
- Preservar la cola actual de limpieza para archivos realmente desvinculados. Nunca borrar un archivo asociado por una respuesta de red incierta.
- Convertir individuales o aceptar una propuesta de jugadores sueltos conserva el flujo atómico existente. Puede crear la inscripción de pareja y consumir individuales; la promesa de mantener el mismo ID aplica al pago de una pareja ya inscripta, no obliga a cambiar ese modelo de conversión.
- Una inscripción pendiente sin cupo sigue contando para evitar duplicaciones del mismo jugador o pareja en ese torneo.
- Al cambiar integrantes, revalidar identidad, género, categoría, restricciones y alcance de la autorización. No modificar una pareja global usada en otros torneos ni trasladar una excepción a integrantes nuevos sin decisión de gestión.

## 6. Operaciones atómicas y protección de base de datos

### 6.1 Operaciones a unificar

Crear o extender operaciones de servidor/DB para alta, archivo inicial, cambio de método, aprobación, asignación de cupo, admisión excepcional, baja y configuración de capacidad. Todas deben usar el mismo criterio de ocupación y elegibilidad.

Integrar, como mínimo:

- `inscription_private.guard_registration_payment`.
- `public.change_inscription_payment` y `approve_inscription_proof`.
- `solo_player_private.confirm_tournament_pair` y su wrapper público.
- Triggers de atribución y locks de parejas, revisión de archivo, revisión concurrente y limpieza de archivos.
- `inscription_private.require_complete_registrations`.
- Guardas de elegibilidad de americano libre y operaciones de membresía deportiva.

Contar únicamente las inscripciones de parejas que efectivamente ocupan lugar y que correspondan al conteo real, conservando la semántica validada de datos de prueba.

### 6.2 Concurrencia

- Reutilizar el lock transaccional por torneo existente para capacidad; no inventar un segundo mecanismo independiente.
- Respetar el orden de locks usado por jugadores sueltos: torneo/scope de pareja/capacidad, antes de la fila de inscripción según el recorrido común acordado.
- Inventariar locks de configuración y sincronización de cierre para evitar que una operación tome locks en orden inverso. Mantener la sincronización derivada posterior al commit donde corresponda.
- Revalidar configuración, máximo, ocupación, revisión, fase y autoridad al decidir la transición.
- Dos archivos que compiten por el último lugar: exactamente uno obtiene cupo; el otro archivo también queda guardado con atención por falta de lugar.
- Archivo, admisión manual, cambio a efectivo, importación y reducción del máximo deben competir por la misma capacidad.
- Reintentos con respuesta perdida consultan el resultado guardado antes de repetir; devolver también ocupación y elegibilidad, no solo la ruta de archivo.

### 6.3 Seguridad

- Revisar permisos efectivos y RLS de `inscriptions`; no confiar en que ocultar un botón protege campos nuevos.
- Solo una operación autorizada de gestión puede conceder excepción, aprobar administrativamente o anotar su autor.
- El servidor deriva actor/tenant; no confiar en `p_manager`, `p_actor_id`, `p_organizer` o tenant suministrados por un cliente público.
- Ningún jugador puede autoasignarse cupo modificando directamente la fila, ni limpiar una revisión de forma indebida.
- Comprobar permisos de ambos integrantes y gestión; impedir acceso entre torneos y entre tenants.
- Mantener comprobantes privados, URLs firmadas y respuestas de pago privadas sin caché pública.
- Revocar permisos por defecto en nuevas funciones privilegiadas y proteger sus tablas auxiliares. No ampliar permisos como solución rápida a errores.

## 7. Pantallas y mensajes

### 7.1 Configuración del organizador

- Ubicación obligatoria en ambas pantallas: `/tournaments/create` y la sección de inscripciones de `/tournaments/[id]/settings`. Compartir nombres, explicación, valores iniciales y validación; no agregar una pantalla o paso separado.
- Colocar la elección de reserva junto a `Transferencia con comprobante` y `Permitir efectivo`, en el mismo bloque y en orden equivalente en escritorio y móvil.
- Renombrar `Validar inscripciones` a `Requerir aprobación del organizador`.
- Mantener `Transferencia con comprobante` y `Permitir efectivo`, explicando que elegir efectivo no registra un cobro.
- Mostrar la nueva opción dentro de transferencia: `Reservar cupo al inscribirse, antes de adjuntar el comprobante`.
- Activada: `La pareja conserva un lugar mientras completa el comprobante`. Desactivada: `La pareja queda pendiente, sin lugar reservado, hasta adjuntar el comprobante; la confirmación depende de la disponibilidad`.
- Si no se exige comprobante, dejar claro que la elección de reserva previa no aplica. Se puede mostrar deshabilitada con esa explicación; conservar su valor al apagar/encender transferencia, sin modificar lugares existentes.
- La creación actual expone efectivo pero todavía no toda la configuración de transferencia. Incorporar sus opciones dependientes, alias e importe, para que la elección de reserva sea utilizable al crear el torneo; no dejar un control sin efecto hasta visitar settings.
- Extender el esquema del formulario, sus valores iniciales, el payload y la acción de creación para persistir la elección desde el alta. Validar alias/importe si transferencia está activa, con la misma regla de settings.
- Abrir settings después de crear debe mostrar exactamente la elección guardada. Los presets, cambios de formato y pasos del formulario no deben restablecerla accidentalmente.
- Explicar que las reservas existentes se conservan al cambiar esa opción.
- Mostrar impacto de cambios que afecten requisitos de inscripciones existentes; no crear dispensas o adjudicaciones invisibles.
- Mostrar `Sin límite` y suprimir alertas de torneo completo cuando no hay máximo.

### 7.2 Lista única de inscripciones

Un estado principal: `Confirmada` o `Pendiente`, con motivos concretos. Mostrar todos los motivos aplicables; no ocultar una aprobación pendiente porque también falta cupo.

| Situación | Estado y detalle | Acción principal |
| --- | --- | --- |
| Requisitos resueltos, con lugar | Confirmada | Ver inscripción |
| Falta aprobación manual | Pendiente de aprobación | Aprobar solicitud |
| Falta archivo, tiene lugar | Pendiente de comprobante · Cupo reservado | Gestionar comprobante |
| Falta archivo, no tiene lugar | Pendiente de comprobante · Sin cupo reservado | Revisar / Admitir sin comprobante |
| Tiene archivo, no tiene lugar y está completo | Comprobante recibido · Sin cupo · Requiere atención | Revisar caso |
| Requisito desactivado, sigue sin lugar | Pendiente de asignación de cupo | Asignar cupo, si hay disponibilidad |
| Excepción del organizador | Admitida sin comprobante | Ver autorización y sus metadatos |
| Efectivo elegido | Pago en efectivo | Seguimiento de cobro independiente |
| No se requiere archivo y no hay historia | No requiere comprobante | Texto simple, sin popup vacío |

La confirmación principal también considera aprobación, cupo y fase: un archivo recibido no autoriza por sí solo a mostrar `Confirmada`.

Agregar filtros por sin cupo, falta de archivo, aprobación manual y casos que requieren atención. Mantener un único registro por inscripción.

Contadores separados y con nombres claros: lugares ocupados/máximo, parejas habilitadas para organizar, pendientes sin cupo y solicitudes que requieren revisión. No usar el total de filas como si fuera ocupación.

### 7.3 Panel del organizador y preparación deportiva

- Tarjeta del torneo y lista: aviso persistente `Torneo completo: 16/16 lugares. Hay 3 inscripciones pendientes sin cupo`.
- Si se adjuntó evidencia sin poder admitir: distinguirlo con `Comprobante recibido sin cupo: requiere revisión`.
- Antes de generar zonas/partidos/llaves, obtener una preparación de servidor con elegibles y excluidas por motivo. Incluir las pendientes con cupo, no solo las sin cupo.
- Ofrecer `Revisar pendientes` y `Continuar sin estas N parejas`, identificándolas.
- La confirmación vale para esa operación y ese conjunto de revisiones. Si cambió alguna pareja o regla antes de ejecutar, actualizar el resumen y volver a confirmar el alcance.
- Una llamada directa no puede omitir la comprobación. No resolverlo únicamente en el modal del frontend.
- Después de excluir pendientes, volver a validar mínimos de parejas, tamaños de zona, partidos por pareja y restricciones del formato. La confirmación no permite generar una estructura inválida por falta de participantes.
- Los selectores y drag and drop ofrecen solo parejas habilitadas. La sección de pendientes permanece visible para que el organizador pueda admitirlas.
- Admitir no significa insertar automáticamente en una llave ya disputada. Respetar restricciones de incorporación tardía y capacidad de cada zona/llave.

### 7.4 Jugador

Unificar detalle público, paneles, `/torneos`, torneos propios, dashboard, modales y correos con el mismo estado de servidor.

- Sin lugar: `Tu inscripción está guardada, pero todavía no tenés cupo reservado. La confirmación depende de la disponibilidad al adjuntar el comprobante`.
- Torneo completo y sin lugar: `El torneo está completo. No transfieras. Si ya transferiste, podés adjuntar el comprobante para que el organizador revise tu caso`.
- Con lugar y sin archivo: `Tu inscripción está pendiente de comprobante. Tenés el cupo reservado`.
- Si falta aprobación, mostrarla además del otro requisito.
- Si no se exige archivo y no existe historia, no abrir un popup de pago sin acciones útiles.
- En archivos históricos, conservar lectura/gestión autorizada y explicar el requisito actual sin afirmar que siempre hubo una configuración anterior.
- No mostrar provisionalmente `Inscribirme` mientras falla o carga la consulta de una inscripción existente.
- Ambos integrantes conservan acceso a la misma inscripción, aunque el listado público esté oculto o el torneo completo.
- Aclarar que una consulta de disponibilidad antes de ir al banco no reserva lugar; el riesgo aceptado de una transferencia fuera de la plataforma sigue existiendo.

### 7.5 Privacidad y accesibilidad

- Mantener la opción de ocultar cantidad/listado al público. Las alertas con nombres o cantidades privadas solo se muestran a gestión o a los propios integrantes según permisos.
- Mantener foco, teclado, lectores de pantalla, errores anunciados, estado de carga, reintento y acciones utilizables en móvil.
- Colores, iconos y textos deben distinguir pendiente/confirmada/atención sin depender solamente del color.

## 8. Zonas, partidos, llaves y rankings

Centralizar el criterio de nuevas incorporaciones en servidor/DB y consumirlo desde todos los recorridos:

- AMERICAN de zona única y multizona.
- LONG y Zona General.
- Americano libre: slots manuales, validaciones, bracket y avance.
- Generación automática y manual de zonas, matrices y posiciones.
- Asignación y cambios mediante drag and drop.
- Generación de seeding, brackets con placeholders, BYEs y recorridos legacy habilitados.
- Inicio/cambio de fase, regeneración, resets y reparación de estructuras.
- Importaciones, altas manuales y aceptación/conversión de jugadores sueltos.
- Métricas, estadísticas, puntos y rankings: una inscripción sin participación deportiva habilitada no gana puntos por figurar en una lista.

Reemplazar el veto global `hay cualquier inscripción sin archivo` por controles sobre las parejas que efectivamente se intentan incorporar. Mantener el aviso y la confirmación de exclusiones para operaciones de organización.

No borrar ni reconstruir automáticamente estructuras existentes por una modificación de pago. Una pareja incorporada previamente puede necesitar regularizar un archivo; la continuidad de partidos/resultados no se confunde con la habilitación para introducir una pareja nueva.

Separar errores: `sin cupo`, `pendiente de aprobación`, `falta comprobante`, `fase no habilitada`, `zona sin lugar`, `bracket bloqueado` y `fallo de asignación`. Un fallo técnico no debe anunciar falsamente que falta un comprobante.

## 9. Avisos al organizador y al jugador

Eventos a cubrir:

1. Nueva inscripción: indicar cupo real y motivos pendientes; reemplazar la promesa fija de cupo reservado del correo actual.
2. Transición de no completo a completo con pendientes sin cupo: un aviso de resumen a gestión.
3. Archivo adjuntado que no obtiene lugar: aviso específico a gestión y respuesta clara a la pareja.
4. Inscripción que pasa de pendiente a plenamente confirmada: aviso al jugador, incluyendo admisión por excepción cuando corresponda.
5. Baja/liberación de lugar: actualizar panel; si se notifica disponibilidad, no prometer adjudicación automática a una pendiente.

Reglas de entrega:

- Respetar `messages_enabled` y preferencias vigentes; el aviso de pantalla permanece aunque el correo esté apagado o falle.
- Deduplicar por evento, inscripción/revisión y destinatario. Recargar una pantalla no crea eventos.
- Si el torneo vuelve a abrir y después vuelve a llenarse, distinguir el nuevo evento sin reenviar por consultas repetidas.
- Cambio de máximo a completo también dispara el resumen cuando corresponda.
- No reenviar el mismo conflicto por reemplazar un archivo pendiente sin que cambie su situación de cupo. Una transición nueva debe quedar identificada explícitamente.
- No enviar confirmación al jugador solamente por aprobar el archivo si todavía falta lugar o aprobación administrativa.
- Si la entrega se reintenta después de una baja, cancelación del torneo o cambio que vuelve obsoleto el mensaje, verificar la situación antes de enviar una confirmación atrasada. No confundir una revisión de archivo más nueva con la desaparición de una confirmación aún válida.
- Intentar entrega después del commit, con reintento durable; nunca deshacer el cupo por un error del proveedor.
- No enviar correos de prueba a cuentas reales durante desarrollo.

## 10. Orden de implementación y archivos afectados

| Etapa | Trabajo | Entregable / condición para avanzar |
| --- | --- | --- |
| 1 | Inventario de esquema, RPCs, triggers, consultas, permisos y datos históricos; fijar reglas de esta propuesta | Mapa de recorridos y casos de prueba, sin cambios remotos |
| 2 | Modelo, backfill conservador, guards, locks, operaciones atómicas, auditoría/eventos e índices | Migraciones nuevas y pruebas SQL únicamente locales |
| 3 | Criterio común de cupo/elegibilidad, APIs, acciones, registros e importaciones | Ningún recorrido concede o consume cupo con reglas distintas |
| 4 | Integración de zonas, LONG, americano libre y brackets; preparación y confirmación de excluidas | Pendientes visibles sin incorporación accidental ni veto global |
| 5 | Creación y settings con la misma elección de reserva; lista, paneles, modales, jugador y textos compartidos | Elección guardada desde el alta, estados coherentes y acceso útil en escritorio/móvil |
| 6 | Avisos persistentes, correos y entrega durable | Atención visible, idempotente y recuperable |
| 7 | Matriz funcional, concurrencia, seguridad, regresión y builds | Evidencia local y revisión de diferencias de tenant |
| 8 | Preparación de publicación coordinada y operación de recuperación | Instrucciones para despliegue del propietario por CI/CD |

Puntos principales del repositorio:

- `lib/services/tournament-capacity.service.ts`, `lib/tournaments/registration-availability.ts`, métricas y listados que derivan cantidades.
- `lib/tournaments/inscription-requirements.ts`, `payment-types.ts`, `player-inscription-copy.ts` y un módulo común propuesto de estado/elegibilidad.
- `lib/services/registration/*`, `app/api/tournaments/actions.ts`, rutas de inscripciones/pago/configuración/control y consultas conjuntas de pagos propios.
- `lib/services/tournament-zone-membership.ts`, `lib/services/zone-position/*`, `lib/services/tournaments/american-single-zone.ts`, `long-general-zone.ts`, orquestación deportiva y utilidades de seeding.
- `components/tournament/inscription-payment-*`, `organizer-inscription-payment-dialog.tsx`, `tournament-couples-tab.tsx`, alta pública y formularios de registro.
- `components/tournaments/tournament-create-form.tsx`, el contrato `CreateTournamentData` y la acción de creación en `app/api/tournaments/actions.ts`: configuración completa, defaults, validación y persistencia al crear.
- `app/(main)/tournaments/[id]/settings/*`, `/inscriptions/*`, `/zones/*`, vistas del torneo, paneles TPE/FV y dashboard de jugador.
- `lib/services/organizer-panel*`, `lib/services/messages/*`, notificaciones/entregas y limpieza de comprobantes.
- `database.types.ts`, contratos de RPC y nuevas migraciones bajo `supabase/migrations/` creadas mediante el flujo del proyecto.

No editar migraciones históricas ya aplicadas. Preservar los cambios ajenos que ya existen en el directorio de trabajo, incluidos puntos, cobros y recategorización.

## 11. Matriz de casos límite y verificación

Cada fila debe tener una prueba automatizada apropiada o una comprobación manual documentada. Los casos de concurrencia requieren base local real y sesiones separadas; los de permisos requieren roles reales, no solo mocks de interfaz.

| ID | Caso | Resultado requerido |
| --- | --- | --- |
| A01 | Referencia TPE: siete parejas sin requisito ni archivo | Siguen con lugar y confirmadas; sin popup vacío |
| A02 | Sin comprobante exigido; efectivo apagado | Alta válida sin inventar pago ni transferencia |
| A03 | Transferencia, reserva inicial activada | Lugar ocupado y motivo pendiente correcto |
| A04 | Transferencia, reserva inicial desactivada | Fila guardada, sin lugar, sin membresía deportiva |
| A05 | Efectivo permitido | Obtiene lugar disponible; dinero no marcado cobrado |
| A06 | Efectivo deshabilitado por llamada directa | Rechazo autorizado sin alterar inscripción |
| A07 | Sin máximo | No aparece torneo completo ni cantidad libre falsa |
| A08 | Último cupo ocupado por alguien pendiente de aprobación | Ese lugar ya cuenta; no se duplica disponibilidad |
| A09 | Alta nueva con torneo completo | No se crea una nueva lista de espera implícita |
| A10 | `NONE` o método nulo intentando eludir transferencia activa | La DB aplica la configuración válida del alta |
| A11 | Datos históricos `is_pending`/`es_prueba` nulos | Conteos revisados sin cambios silenciosos |
| A12 | Inscripciones individuales y parejas de prueba | No consumen accidentalmente cupos reales de pareja |
| B01 | Archivo inicial con disponibilidad y sin reserva previa | Mismo ID, archivo guardado y un solo cupo adquirido |
| B02 | Archivo inicial sin disponibilidad | Mismo ID, archivo guardado, sin cupo, aviso específico |
| B03 | Archivo con cupo previamente reservado | No adquiere otro lugar |
| B04 | Archivo aprobado, sin lugar | No queda confirmada ni obtiene cupo por esa revisión |
| B05 | Archivo y aprobación manual pendiente | Conserva ese pendiente aunque obtenga cupo |
| B06 | Formato inválido, vacío, PDF grande o imagen imposible de preparar | No se concede lugar ni se pierde inscripción |
| B07 | Storage falla antes de asociar | No se concede lugar por una subida inexistente |
| B08 | Storage sube pero asociación falla | Ticket de limpieza y recuperación sin borrar archivo vigente |
| B09 | Respuesta perdida después de commit | Consulta recupera archivo y cupo; no duplica |
| B10 | Ambos integrantes adjuntan al mismo tiempo | Un archivo inicial ganador; respuesta coherente al otro |
| B11 | Reemplazo con revisión vieja | Conflicto explícito; no sobrescribe cambios recientes |
| B12 | Eliminar archivo después de obtener lugar | Conserva lugar; requisito vuelve a pendiente cuando corresponde |
| B13 | Editar archivo con zonas o partidos existentes | No elimina membresías, resultados ni llaves |
| B14 | Archivo aprobado editado por jugador | Se conserva la restricción actual de gestión |
| B15 | Elegir/quitar archivo local o cerrar sin guardar | No modifica DB, reserva ni archivo guardado |
| B16 | Alias/importe cambiaron durante la visita al banco | Muestra snapshot aplicable y estado actual sin falsificar historia |
| B17 | URL firmada vencida, archivo ausente o permiso Storage cambiado | Error recuperable/diagnosticable, sin pérdida automática de lugar |
| B18 | Ruta legacy `couple-with-proof` con fallo en la segunda etapa | Mismo criterio de cupo; inscripción recuperable, sin duplicar ni prometer reserva falsa |
| C01 | Admitir sin archivo y con disponibilidad | Cupo + excepción auditada + aprobación en una operación |
| C02 | Admitir sin archivo con torneo completo | No concede lugar ni excepción parcialmente aplicada |
| C03 | Admitir dos veces / respuesta perdida | Resultado idempotente; una sola atribución y aviso |
| C04 | Aprobar solicitud sin archivo y sin lugar | No se muestra confirmada si siguen faltando requisitos |
| C05 | Excepción explícita y archivo posterior | Mantiene trazabilidad; archivo con revisión propia |
| C06 | Alta manual/importación sin archivo | Procedencia expresa; no bypass oculto de capacidad |
| C07 | Importación parcial, filas repetidas o reintento | Reporte por fila, sin doble inscripción/cupo ni excepciones falsas |
| C08 | Una pareja sin cupo intenta duplicarse o cambiar de compañero | Se conserva control por jugador/torneo y flujo autorizado |
| C09 | Conversión de individuales y aceptación simultánea de propuestas | Una pareja ganadora; consumo atómico de individuales |
| C10 | Cambio de integrantes tras dispensa | Revalida autorización y restricciones; no transfiere permisos ciegamente |
| C11 | Archivo equivocado, ilegible o transferencia discutida | Revisión de gestión y resolución explícita; no dinero cobrado ni baja automática por inferencia |
| D01 | Dos parejas adjuntan por el último lugar | Una obtiene cupo; ambas evidencias quedan tratadas correctamente |
| D02 | Archivo compite con admisión manual o efectivo | Mismo lock y máximo respetado |
| D03 | Importación compite con alta pública | No supera máximo ni duplica jugadores |
| D04 | Cambio de máximo compite con adjudicación | Decisión serializada, sin sobrecupo nuevo |
| D05 | Cierre manual/fase compite con archivo | Evidencia conservada; no incorporación deportiva no autorizada |
| D06 | Baja compite con subida o revisión | No resucita una inscripción eliminada ni borra archivo ajeno |
| D07 | Configuración compite con conversión de individuales | Orden de locks uniforme, sin deadlocks evitables |
| D08 | Reintento simultáneo por ambos integrantes | Una transición durable y mensajes sin duplicados |
| E01 | Cambiar política de reserva | Solo altas futuras; lugares actuales intactos |
| E02 | Desactivar requisito con pendientes sin cupo | Dejan de deber archivo; siguen pendientes de asignación |
| E03 | Reactivar requisito con métodos nulos/históricos | No inventa transferencia ni dispensa; informa alcance |
| E04 | Desactivar efectivo con elecciones previas | Conserva historia; bloquea nuevas elecciones |
| E05 | Desactivar aprobación manual | Resuelve aprobación, no capacidad ni archivo pendiente |
| E06 | Aumentar máximo o volver a sin límite | Lugares disponibles; sin adjudicación automática |
| E07 | Reducir por debajo de ocupados / sobrecupo histórico | Rechazo de reducción nueva o diagnóstico de anomalía existente |
| E08 | Liberar lugar estando cerrado manualmente | No reabre automáticamente |
| E09 | Transferencia a efectivo o viceversa | No duplica/libera cupos adquiridos; valida método y requisitos |
| E10 | Cambio de privacidad | No publica nombres, pagos ni cantidad privada de pendientes |
| E11 | Crear con reserva activada o desactivada y luego abrir settings | Mismo valor persistido y comportamiento desde la primera inscripción |
| E12 | Apagar/encender transferencia en create/settings | Conserva la preferencia de reserva e indica cuándo aplica, sin afectar cupos existentes |
| E13 | Crear con transferencia activa y alias/importe incompletos | Misma validación que settings; no crea una configuración inválida |
| E14 | Bloque de opciones en escritorio y móvil | Reserva junto a transferencia/efectivo; controles y explicación accesibles |
| E15 | Cambiar pasos o preset/formato antes de crear | No restablece silenciosamente la elección del organizador |
| E16 | Cliente de creación anterior omite el campo nuevo | Default compatible y validación de servidor; no interpreta ausencia como desactivar reserva |
| F01 | Generar zonas con pendientes sin cupo | Aviso nominal y revisión/exclusión explícita |
| F02 | Generar con pendientes con cupo pero sin requisitos | También aparecen excluidas; no se incluyen por tener lugar |
| F03 | Cambian pendientes después del resumen | Se invalida la confirmación anterior y se refresca |
| F04 | POST directo, drag and drop o RPC alternativa | No incorpora pareja no habilitada |
| F05 | LONG / zona única / multizona | Mismo criterio; sin membresías o posiciones duplicadas |
| F06 | Americano libre y slots manuales | Misma regla de elegibilidad; respeta límites y avance deportivo |
| F07 | Seeds, placeholders y BYEs | Ninguna pendiente se transforma en participante por un recorrido indirecto |
| F08 | Llave en marcha, resultados, resets y reparaciones | No reconstruye ni invalida actividad por cambios de archivo |
| F09 | Reconciliación automática falla tras admisión | Conserva inscripción/cupo y permite reintento de asignación |
| F10 | Torneo finalizado/cancelado o inscripción tardía | Respeta fase; evidencia no genera alta deportiva automática |
| F11 | Puntos, estadísticas, ranking | No suma por una inscripción guardada sin participación válida |
| F12 | Baja tardía de pareja nunca admitida | Política explícita; no sanción accidental por mera solicitud |
| F13 | Eliminada deportivamente o descalificada | No libera cupo administrativo ni crea un reemplazo deportivo automático |
| F14 | Excluir pendientes deja insuficientes parejas para el formato | Bloquea estructura inválida y explica el mínimo necesario |
| G01 | Primer llenado con pendientes sin cupo | Aviso persistente y un evento de correo si corresponde |
| G02 | Recargar, reintentar o abrir varias pestañas | No duplica eventos de atención |
| G03 | Se libera y vuelve a completarse | Nuevo evento distinguible; no repetición por consultas |
| G04 | Correo apagado, sin destinatarios o proveedor caído | Aviso UI intacto; estado DB correcto; entrega según preferencias |
| G05 | Archivo sin cupo y reemplazos posteriores | Atención visible, sin tormenta de correos repetidos |
| G06 | Confirmación del jugador con requisitos pendientes | No envía una confirmación falsa |
| G07 | Recarga, retorno del banco, pérdida de conexión | Recupera estado de servidor y presenta resultado incierto con reintento seguro |
| G08 | Ambos integrantes, listado privado, torneo completo | Acceden a su propia fila y evidencia sin acceso ajeno |
| G09 | Móvil, teclado, foco, lectores de pantalla | Flujo completo utilizable y mensajes anunciados |
| G10 | Notificación en cola tras baja/cancelación o cambio de estado | No entrega una confirmación obsoleta; registra el motivo del descarte |
| H01 | `anon` o jugador fuerza `occupies_slot` o excepción | DB lo impide aunque llame directamente a Data API |
| H02 | Jugador modifica `is_pending`/autor/revisión protegida | No puede autoaprobarse ni atribuir decisiones a otro |
| H03 | Gestión de otro torneo/organización/tenant | No puede admitir, leer archivos ni confirmar exclusiones |
| H04 | Payload manipula actor, tenant o bandera de manager | Servidor deriva autoridad y rechaza la manipulación |
| H05 | Nuevas tablas/RPCs y cachés públicas | Sin permisos por defecto ni exposición de datos privados |
| H06 | Retiro de permisos mientras el modal está abierto | Operación final vuelve a autorizar en servidor |
| H07 | Eliminación de usuario o inscripción con eventos | Integridad y auditoría conservadas según FK/retención definida |
| H08 | Build FV y tenant sin activación nueva | Conserva flujo vigente; no errores por esquema incompatible |
| H09 | Aplicación vieja coexistiendo durante publicación | Política nueva aún desactivada; nuevas guardas no permiten bypass |
| H10 | Recuperación tras activar y crear filas sin cupo | No vuelve a contarlas todas ni promete lugares por rollback |
| H11 | Muchas pendientes y listado paginado | Conteos y resumen de exclusiones usan el conjunto real, no solo la página visible; consultas indexadas |

## 12. Verificación, publicación y recuperación

### Antes de implementar

- Este plan es la propuesta concreta a revisar; en particular, confirmar las reglas de reserva inicial, eliminación de archivo, cambios de requisitos, baja tardía y tratamiento manual de transferencias sin lugar.
- Inventariar cambios ajenos en `git status`; trabajar sobre ellos sin sobrescribirlos.
- Capturar baseline local de tests/TypeScript/build y esquema de ambos tenants para separar errores previos.
- Verificar documentación vigente de Supabase antes de escribir migraciones o nuevas RPCs. Crear migraciones mediante el CLI según el flujo del repositorio, nunca inventar nombres o modificar historial aplicado.

### Evidencia requerida

- Tests de reglas compartidas y presentación de estados.
- Integración SQL local con roles/permisos reales y restricciones; fixtures revertidos o aislados.
- Concurrencia local real de último cupo, mismo archivo/revisión, cierre/configuración y bajas.
- Pruebas de rutas y Server Actions para todas las entradas, incluidos importación y jugadores sueltos.
- Navegador en TPE y regresión FV; escritorio y móvil; ambos integrantes y organizador.
- Verificar explícitamente la referencia TPE en copia local, sin escribir en el torneo real.
- `npm run lint`, chequeo TypeScript y builds pertinentes de TPE/FV; informar errores previos y limitaciones si los hay. El build no sustituye controles que la configuración omita.
- Revisar diferencias, permisos y consultas de conteo; comprobar que no hay nuevas operaciones remotas ejecutadas durante desarrollo.

### Publicación

- Preparar una secuencia compatible: migración aditiva y guards, aplicación compatible, verificación, habilitación posterior de la opción por organizador.
- Mantener reserva inicial activada mientras conviven instancias viejas y nuevas. No activar registros sin cupo hasta que todos los caminos estén preparados.
- Verificar el esquema disponible antes de permitir la opción nueva; no interpretar un error de columna/RPC ausente como falta de inscripción ni caer en escrituras inseguras.
- El propietario despliega las migraciones remotas mediante su CI/CD. **El agente no aplica, ejecuta ni empuja migraciones contra ningún proyecto remoto**, conforme a `AGENTS.md`.
- Asegurar que la publicación compartida no active comportamiento nuevo en FV sin su configuración/migraciones correspondientes.
- Validar después de publicación con lecturas y un procedimiento autorizado de pruebas, sin modificar parejas reales como fixtures.

### Recuperación

- Ante una incidencia, detener la creación de nuevas reservas sin cupo conservando las filas, evidencias y ocupaciones existentes.
- No establecer `occupies_slot = true` para todas las pendientes como forma de volver atrás.
- No bajar a una versión que ignore las filas sin cupo después de activar la función. Preparar una versión compatible que deshabilite nuevas altas de ese tipo y siga interpretando sus datos correctamente.
- Conservar auditoría/eventos y herramientas de consulta de discrepancias de capacidad y elegibilidad. Evitar correcciones automáticas destructivas.

## 13. Criterios para dar el trabajo por terminado

1. El organizador entiende cuántos lugares están ocupados y cuántas inscripciones siguen pendientes sin lugar.
2. No se le ocultan las parejas excluidas al organizar; puede revisarlas/admitirlas o continuar expresamente sin ellas.
3. No hay filas nuevas de inscripción por adjuntar o revisar un comprobante de una pareja ya guardada.
4. Una admisión excepcional funciona hasta la asignación deportiva y queda atribuida correctamente.
5. Una transferencia sin lugar permanece visible y genera atención, sin confirmación de participación ni devolución ficticia.
6. Todos los recorridos respetan capacidad, permisos y elegibilidad en servidor/DB, incluso bajo concurrencia.
7. Las siete inscripciones del torneo de referencia conservan su situación válida y su interfaz deja de ofrecer detalles vacíos.
8. Las inscripciones y estructuras deportivas vigentes se conservan; las regresiones FV/TPE quedan verificadas.
9. Los tests críticos y las limitaciones quedan documentados; la publicación remota queda en manos del propietario.
