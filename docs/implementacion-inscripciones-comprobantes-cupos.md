# Inscripciones, comprobantes y cupos

Implementación local, corregida según el acuerdo final del 28 de octubre de 2026: cupo definido únicamente por la política de pago y aprobación manual retirada. Código compartido por FV y TPE. No se modificaron datos ni se desplegaron migraciones en proyectos remotos.

## Qué cambia para el organizador

En creación y en Configuración → Inscripciones se usa el mismo bloque **Seña y reserva de cupo**. Sin seña, la pareja obtiene lugar al inscribirse, mientras las inscripciones estén abiertas y haya disponibilidad. Al pedir seña aparecen alias, importe y las opciones **Reserva apenas se inscribe** / **No reserva hasta que carga el comprobante**. En settings se guardan juntas mediante **Guardar configuración**; al crear, con **Crear torneo**. Se retiró el control de aprobación manual de ambas pantallas.

| Solicitar seña | Reservar al anotarse | Resultado |
|---|---|---|
| No | Sí | Reserva lugar sin comprobante; se puede cobrar más adelante. |
| Sí | Sí | Inscripción confirmada con cupo; el comprobante de la seña puede seguir pendiente. |
| Sí | No | El comprobante requerido asigna lugar según disponibilidad. |
| No | No | Esta combinación ya no se ofrece; se normaliza a reserva al inscribirse. |

El efectivo no exige archivo y reserva al inscribirse, aunque la transferencia espere al comprobante. Elegir efectivo no marca dinero cobrado. La aprobación manual de inscripciones está retirada; revisar el comprobante continúa siendo una acción independiente del cupo y del dinero recibido.

El cartel del organizador ofrece **Paga en efectivo**, **Cargar comprobante** y, cuando falta lugar, **Asignar cupo sin comprobante**. Los datos bancarios y el selector de archivo aparecen al elegir cargarlo. El organizador puede indicar efectivo para una pareja aunque esté deshabilitado para los jugadores; esta decisión no habilita efectivo para el resto del torneo. La ruta verifica el permiso de gestión y la excepción de base queda limitada a esa inscripción y a esa operación. Un comprobante existente se quita únicamente después de confirmar el cambio a efectivo.

Todas las parejas conservan su registro en Inscripciones. La columna Estado muestra si tienen cupo; Comprobante muestra únicamente el archivo y su revisión. Una pareja con lugar no necesita una segunda admisión por carecer de archivo. **Asignar cupo sin comprobante** se ofrece exclusivamente a gestión para las parejas que todavía no tienen lugar, como excepción explícita a la espera por pago.

El panel del organizador, Inscripciones y las vistas para organizar muestran los pendientes. Un comprobante recibido sin cupo tiene un aviso específico. Antes de organizar se puede revisar cada pareja o confirmar **Continuar sin estas N parejas**. El servidor vuelve a comprobar que la revisión corresponda al listado actual; cambios de inscripciones, requisitos, capacidad o cierre la invalidan. La revisión dura como máximo diez minutos, para completar las operaciones de organización que usan varias peticiones.

## Comportamiento

| Caso | Registro y comprobante | Cupo y participación |
|---|---|---|
| No se requiere comprobante | Inscripción confirmada; no se ofrece un popup vacío | Reserva al inscribirse |
| Transferencia sin archivo, reserva activada | Inscripción confirmada; seña pendiente | Tiene lugar y puede incorporarse a zonas, partidos y llaves |
| Transferencia sin archivo, reserva desactivada | Registrada sin cupo | Visible en Inscripciones; no resta lugares ni participa todavía |
| Primer archivo y lugar disponible | Se actualiza la misma inscripción | Obtiene lugar, sin aprobación adicional |
| Archivo recibido con torneo completo o admisiones cerradas | El archivo se guarda y el caso queda señalado | Sigue sin lugar; no se promete participación |
| Revisar/aprobar el archivo | Cambia solamente su revisión | No admite una pareja ni registra dinero cobrado |
| Aprobar solicitud | Acción retirada de las pantallas; se mantiene la operación antigua por compatibilidad | No concede un cupo por sí sola |
| Asignar cupo sin comprobante | Registra autorización, responsable, fecha y motivo | Otorga lugar; exige disponibilidad y fase permitida |
| Efectivo habilitado | No se pide comprobante | Reserva al inscribirse. No marca el cobro como recibido |
| Se elimina o reemplaza un archivo | Se conserva el historial mediante los mecanismos de archivos existentes | No libera un lugar ya obtenido ni borra partidos/resultados |
| Cambia la preferencia de reserva | Se aplica a altas posteriores | No asigna ni retira lugares anteriores |
| Se desactiva el requisito de archivo | Ya no falta comprobante | Las parejas sin cupo siguen necesitando asignación explícita |
| Se libera o aumenta capacidad | Pendientes siguen visibles | El organizador asigna el lugar; no hay promoción automática |
| Jugador individual | Estado individual y aprobación administrativa | Nunca ocupa un lugar de pareja |
| Baja de una pareja que nunca tuvo cupo | Se elimina su solicitud | No se registra una baja tardía por esa mera solicitud |

Si el torneo está lleno no se aceptan nuevas altas, incluso sin reserva. Quienes ya tenían una inscripción pueden adjuntar evidencia. Se advierte que no transfieran si no hay lugar; si ya transfirieron, el organizador debe resolver el caso. No se implementan devoluciones automáticas.

Una pareja con lugar puede participar aunque no haya cargado comprobante. Quitar, reemplazar o revisar el archivo no cambia esa condición. Las parejas sin cupo siguen excluidas del armado. Las parejas virtuales existentes mantienen su tratamiento deportivo.

## Persistencia y permisos

- Una fila de `inscriptions` durante todo el recorrido. `occupies_slot` distingue solicitud y lugar adquirido. `is_pending` y `validate_inscriptions` se mantienen en falso por compatibilidad; las operaciones anteriores no pueden reintroducir aprobación manual.
- `reserve_slot_without_proof` en `tournaments`; autorización excepcional en `proof_waived_at/by/reason`.
- El nombre histórico `reserve_slot_without_proof` se conserva. Solo se puede elegir cuando se pide seña; sin seña queda en verdadero. La migración final retira las aprobaciones pendientes, conserva los lugares otorgados y no asigna automáticamente solicitudes históricas sin cupo. No inventa archivos, revisiones ni cobros, y no genera notificaciones históricas por ese ajuste.
- Las altas explícitas del organizador, incluidas las importaciones, siguen siendo admisiones y respetan capacidad y fase. Los jugadores individuales siguen sin ocupar un lugar de pareja.
- Las parejas anteriores conservan sus lugares; las filas individuales pasan a no ocupar cupo. No se inventan pagos ni exenciones históricas.
- La asignación se serializa en PostgreSQL. Dos comprobantes por el último lugar se conservan, pero solamente uno obtiene cupo.
- Las operaciones de admisión usan revisión de la inscripción y actor autenticado. Las RPC de pago y admisión se ejecutan únicamente desde el servidor con `service_role`; funciones privadas con `search_path` vacío. El navegador no puede escribir capacidad o autorizaciones, apropiarse de otra inscripción ni cambiar el medio de pago por un UPDATE directo.
- El máximo no puede reducirse por debajo de los lugares ocupados. Las solicitudes sin lugar no elevan ese mínimo.
- Los nuevos cálculos de cobros excluyen parejas que todavía no obtuvieron lugar. Se conserva el tratamiento previo de jugadores individuales y de datos históricos sin el nuevo campo.
- Los listados y triggers deportivos excluyen parejas sin cupo. Tener la seña pendiente no excluye una pareja que ya tiene lugar. La revisión de exclusiones se valida también en base de datos.
- La respuesta de preparación incluye nombres, motivos y presencia de archivo, sin rutas de Storage. Su endpoint requiere permisos de gestión.
- Los avisos se registran dentro de la transacción y se intentan después del commit. Se conserva el contenido del primer intento y una clave de entrega por evento. Los fallos se reintentan por el cron existente de limpieza (diario, hasta ocho intentos); no invalidan una inscripción. Se respetan las preferencias al crear el evento y al entregarlo. El aviso persistente del panel funciona aunque los correos estén deshabilitados.
- Los conflictos de revisión usan `PT409`. Se evita generar `40001` por un conflicto de negocio: puede provocar reintentos indefinidos en ciertas versiones de PostgREST, según la [documentación oficial de Supabase](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions). Se comprobó el rechazo real por HTTP, además del SQL directo.

## Validación local

- Pasaron 273 casos en 30 suites sobre una copia exacta del contenido preparado para el commit, sin el selector independiente de semanas de Cobros. Cubren política de pago, normalización sin seña, guardado conjunto, retiro de aprobación, permisos, cupos, continuidad deportiva, mensajes, cobros, jugadores sueltos y torneos largos. Se actualizaron los casos existentes que todavía esperaban aprobación manual y los dobles de prueba de preparación deportiva.
- La ejecución ampliada también detectó ocho suites ajenas a esta funcionalidad con fallos que se reprodujeron en el `HEAD` anterior: permisos generales, análisis/validación/estadísticas de zonas, enlaces de organizador y archivos auxiliares reconocidos como suites vacías. No se corrigieron esos trabajos en este commit; no se afirma que la suite completa del repositorio esté en verde.
- `supabase/tests/independent_registration_policy.sql`: matriz final, reserva inicial, comprobante, efectivo inicial y cambio de medio, rechazo del requisito administrativo antiguo, altas explícitas del organizador y conservación de lugares.
- `supabase/tests/payment_policy_sports.sql`: inserción real de una pareja con cupo y sin comprobante en una zona; rechazo de una pareja sin lugar y ausencia de cobros inventados.
- `supabase/tests/payment_policy_compatibility.sql`: aplica la migración final dentro de rollback; verifica conservación de lugares y solicitudes, retiro de aprobación y ausencia de nuevos eventos de notificación históricos.
- `supabase/tests/independent_policy_compatibility.sql`: ejecuta la migración de ajuste dentro de una transacción y verifica la conservación de la configuración equivalente, lugares existentes y solicitudes pendientes.
- `supabase/tests/inscription_capacity_policy.sql`: transacción con rollback en una copia local aislada. Incluye el rol real `service_role`, reserva activada/desactivada, efectivo sin marcar cobro, ausencia de sobrecupo, archivo sin lugar, excepción atómica, revisión desactualizada, conservación de lugares, límites y permisos.
- `supabase/tests/inscription-capacity-concurrency.mjs`: competencia real de dos archivos por el último lugar, de dos asignaciones por un lugar liberado y de dos inscripciones sin seña por el último lugar. Un solo ganador, dos archivos conservados y ninguna excepción huérfana.
- `supabase/tests/inscription-capacity-browser.mjs`: pasó en TPE local, en escritorio y celular: borrador sin guardado automático, guardado conjunto en settings, creación real sin seña con cupo inmediato, retiro del control de aprobación, conservación de lugares anteriores, subida de archivo, evidencia con torneo lleno, asignación bloqueada sin lugar, asignación explícita tras una baja, revisión desactualizada, permisos y ausencia de popup vacío. Verificó específicamente que una pareja con cupo y sin comprobante está habilitada, no recibe alerta de exclusión ni necesita otra admisión, y ve una sola indicación de seña pendiente. Usa cuentas sintéticas, notificaciones deshabilitadas y limpieza de sus propios datos; rechaza un Supabase remoto.
- Compilaciones de producción FV y TPE completadas con configuración de Supabase local. Advertencias existentes de Supabase en Edge Runtime. La configuración del repositorio omite tipos/lint durante el build; se ejecutaron esos controles por separado y se dejan sus limitaciones a continuación.
- TypeScript amplio sigue señalando errores anteriores en usuarios, llaves y servicios de zonas. Se corrigieron los errores introducidos por esta funcionalidad. `npm run lint` no puede completarse porque falta ESLint en las dependencias instaladas.

No se afirma que cada fila de la matriz de cien escenarios tenga una prueba automatizada independiente.

## Entrega de base de datos

Las migraciones, en orden, son `20261027182429_inscription_capacity_policy.sql`, `20261028164312_independent_registration_policy.sql`, `20261028175135_registration_capacity_on_approval.sql` y `20261028183626_payment_only_registration_capacity.sql`, dentro de `supabase/migrations/`. La última contiene el acuerdo final y reemplaza las reglas anteriores sin reescribir migraciones ya registradas. Se ejecutaron exclusivamente en PostgreSQL local. El propietario realiza el despliegue remoto por su CI/CD.

Después se incorpora `20261028232854_organizer_cash_payment_override.sql` para la excepción de efectivo desde gestión. Se validó localmente con el rol real `service_role`, configuración de jugadores deshabilitada, torneo completo, revisión vieja, restauración del permiso temporal y rechazo del rol `authenticated`. `supabase/tests/organizer-payment-dialog-browser.mjs` verifica el componente real en escritorio y celular con servicios aislados: las tres acciones, revisión del archivo, confirmación previa al cambio a efectivo y cupo completo. La vista previa no modifica torneos ni envía mensajes.

Publicar esquema compatible y aplicación antes de activar altas sin reserva. Una vez que existan filas sin cupo, no volver a una versión que las cuente como plazas ocupadas. Para detener nuevas altas de ese tipo, volver a activar la reserva inicial y conservar los estados existentes. No se requiere borrar filas ni archivos.
