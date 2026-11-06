# Plan de acción: panel general de fechas y horarios con copias vinculadas

Fecha: 5 de noviembre de 2026.
Revisión: 3, panel general aprobado y arquitectura confirmada de un tenant por base de datos.
Estado al 6 de noviembre de 2026. Panel, asistente y accesos desde el torneo implementados. La creación, adopción, ampliación de grupos, compleción de faltantes y desvinculación tienen validación local. Quedan pendientes la propagación de cambios comunes, la verificación integrada con sesiones reales y el contraste remoto de la migración candidata. Ver [avance y validación](implementacion-fechas-horarios-compartidos-2026-11-05.md).
Pantalla principal nueva: `/schedules`, exclusiva de gestión.
Acceso contextual conservado: `/tournaments/[id]/schedules`, vista de organizador; los jugadores conservan su vista actual.
Destino previsto: Padel FV. Las verificaciones remotas futuras deben usar exclusivamente `supabase-fv`, proyecto `bfmaqrythlwbfjuqumom`.

Arquitectura confirmada por el propietario: una base/proyecto Supabase por tenant. FV y Elite comparten código, pero sus datos están en bases separadas. El proyecto configurado ya fija el tenant; esta feature no requiere resolverlo dinámicamente ni agregar aislamiento por fila entre FV y Elite. Se conservan los permisos de usuario, organización, club y torneo.

Este documento reemplaza el enfoque inicial centrado en crear desde un torneo. Es el contexto de implementación para el próximo chat. La conversación tuvo un desvío a otra feature de la matriz de programación de partidos: sus cambios no forman parte de este plan y deben preservarse como trabajo independiente.

## 1. Resultado esperado

Desde un panel general, el organizador podrá ver las fechas y horarios de los torneos que administra, elegir uno o varios clubes, crear una fecha y configurar libremente sus franjas en varios días. Podrá aplicarla a varios torneos, reconocer en cuáles ya existe, incorporar destinos y completar horarios pendientes sin duplicar los anteriores.

El panel general será la entrada principal de gestión masiva. La pantalla de cada torneo seguirá disponible para consultas, ajustes locales y creación contextual. Ambas entradas usarán los mismos componentes de edición, contratos, validaciones y operaciones del servidor. Crear desde el panel no requerirá elegir un torneo que funcione como origen obligatorio.

Cada torneo conservará su propia fecha, sus horarios, las respuestas de sus parejas y sus partidos. Una relación persistente permitirá reconocer las copias y propagar cambios de forma explícita. Editar una copia no modificará automáticamente las demás.

El editor permitirá cualquier cantidad de franjas por día, pausas, horarios diferentes entre días, división de rangos y ajustes mediante campos y arrastre. El caso 08:00–15:00 / 15:00–22:00 será una configuración posible, sin imponer esa cantidad ni esas horas.

## 2. Alcance de la entrega

Incluido:

- Panel general `/schedules`, con navegación de escritorio y móvil, filtros, listado y detalle de configuraciones.
- Visualizar tanto configuraciones vinculadas como fechas existentes independientes desde el primer día.
- Acceso contextual desde cada torneo al mismo flujo y a su configuración compartida.
- Crear una fecha en uno o varios torneos desde el mismo flujo.
- Crear fechas sin horarios y agregar los horarios después.
- Compartir una fecha existente y vincular explícitamente fechas creadas manualmente.
- Crear y editar múltiples franjas y días en un formulario, con vista previa.
- Aplicar al mismo club por defecto; ampliar a otros clubes administrados dentro del mismo organizador/tenant.
- Seleccionar torneos individualmente, todos los del club o todos los destinos elegibles del alcance elegido.
- Conservar la referencia entre copias, mostrar diferencias y completar faltantes.
- Editar localmente o aplicar cambios a destinos elegidos, con control de conflictos.
- Proteger disponibilidades y partidos existentes.
- Usar el flujo en escritorio, celular y con teclado.

Fuera de esta entrega:

- Sincronización automática de todos los cambios entre torneos.
- Incorporación automática de torneos creados en el futuro.
- Cruce de información entre las bases independientes de FV y Elite.
- Asignación automática de partidos o una nueva agenda de reservas de canchas entre torneos.
- Plantillas recurrentes semanales y una agenda gráfica completa de ocupación de canchas del club. El panel general incluido será una herramienta para gestionar fechas y disponibilidad.
- Ampliar este modelo de fechas y disponibilidad a torneos que hoy no usan LONG.

## 3. Punto de partida verificado

| Área | Estado actual | Trabajo necesario |
|---|---|---|
| Panel general | No existe `app/(main)/schedules` | Crear una ruta de gestión independiente del layout de torneo |
| Ruta contextual activa | `tournaments/[id]/schedules/layout.tsx` entrega `@organizer/page.tsx` a usuarios con permisos | Conservar esta vista y conectarla al mismo módulo compartido |
| Navegación global | `config/permissions.ts` define enlaces y autorización; FV usa `fvMainLinks` en `components/navbar.tsx` en lugar de todos los enlaces autenticados | Incorporar el destino también en la rama FV; comprobar escritorio y menú móvil sin alterar enlaces de jugadores |
| Autorización de ruta | `utils/supabase/middleware.ts` consume `checkRoutePermission` | Dar acceso a CLUB, ORGANIZADOR y ADMIN con validación adicional de recursos en página/acciones |
| Clubes administrados | Existe `getUserManagedClubs`; no incluye un caso específico ADMIN y su alcance no sustituye permisos por torneo | Reutilizar lo válido y calcular clubes/torneos administrables en la base seleccionada |
| Tenant por base | El propietario confirmó que cada proyecto Supabase contiene un único tenant | Usar la base configurada. Mantener los permisos existentes; no agregar resolución dinámica de tenant ni tratarla como trabajo pendiente |
| Creación de fecha | `CreateFechaDialog.tsx` llama a `dates/actions.ts` mediante `schedule-management/actions.ts` | Extraer reglas reutilizables y agregar creación transaccional en lote |
| Creación de horario | `CreateTimeSlotDialog.tsx` crea una sola fila | Reemplazar la entrada principal por un editor de múltiples días y franjas |
| Lectura de horarios | `TimeSlotManager.tsx` consume las acciones de schedules | Agregar resumen por día y estado de distribución |
| Clonado | `cloneTimeSlots` copia filas entre dos fechas | Sustituir su uso futuro por un servicio que controle permisos, identidad, conflictos y reintentos |
| Numeración | La UI usa `fechas.length + 1`; la acción rechaza números repetidos; una migración permite repetirlos | Calcular el siguiente número en servidor; tratarlo como dato de presentación |
| Rondas y copas | Se validan `round_type` y `bracket_key`; las opciones dependen del bracket de cada torneo | Validar cada destino y permitir una selección compatible explícita |
| Disponibilidad | `couple_time_availability` depende del ID del horario | Conservar IDs cuando corresponde y bloquear cambios que invaliden respuestas existentes |
| Partidos | `fecha_matches` puede referenciar un horario y también guarda programación propia | Revisar referencias y programación concreta antes de editar o eliminar |
| Fecha libre | Un trigger crea un horario de sistema `FREE_DATE` por fecha LONG | Excluirlo del editor, de las copias y de los contadores de franjas jugables |
| Estado del torneo | Crear la primera fecha ZONE puede llevar LONG de `NOT_STARTED` a `ZONE_PHASE` | Mantener la regla dentro de la operación y mostrar su efecto en la revisión |
| Permisos | Las acciones de schedules y el helper central no resuelven todos los roles de la misma manera | Unificar las verificaciones de gestión y contrastarlas con RLS |
| Tipado | `database.types.ts` contiene actualmente `Database = any` | Definir contratos estrictos para el módulo y generar/comprobar los tipos de su esquema local |

La revisión se realizó sobre código y migraciones locales. La implementación debe verificar el esquema y las políticas del destino con acceso de solo lectura antes de preparar su migración final. Esta revisión no confirma el estado desplegado de la base remota.

## 4. Flujo de producto

### 4.1 Panel general `/schedules`

Navegación: enlace **Fechas y horarios** visible solo para roles de gestión cuando la feature esté habilitada. Verificar que aparezca tanto en FV como en el menú móvil. El enlace se agrega al patrón de navegación existente; no crear un sidebar global nuevo ni rediseñar el resto de la aplicación.

Contenido inicial:

- Encabezado con título y acción principal **Nueva fecha**.
- Filtros de club, período, torneo, ronda/copa y estado de distribución. URL como fuente de los filtros relevantes; refrescar o volver conserva el contexto.
- Un solo club administrado: preseleccionarlo. Varios: permitir ver todos los autorizados y filtrar; exigir un alcance explícito al iniciar una creación masiva.
- Listado paginado con nombre, período, clubes, torneos visibles asociados, cantidad de franjas y estado de distribución.
- Cada grupo compartido aparece una sola vez aunque abarque varios clubes; sus cifras y enlaces se calculan solo sobre destinos autorizados.
- Las fechas antiguas no vinculadas aparecen como **Individual**, con su torneo y acciones **Abrir**, **Editar** y **Compartir**. No forzar una migración ni agrupar por coincidencia de nombre o día.
- No presentar un estado “completo” solo por contar filas: distinguir datos iguales, faltantes, cambios disponibles y cambios locales.
- Sin fechas: mostrar **Crear primera fecha**. Sin torneos elegibles: explicar el requisito y ofrecer acceso a la gestión de torneos, sin una acción de creación que falle al final.
- Carga, error y resultados vacíos por filtro diferenciados. Los registros sin período deben ser localizables mediante un filtro explícito y nunca desaparecer sin explicación.

Al abrir una configuración, navegar a `/schedules/[groupId]`. El detalle tendrá dos pestañas: **Días y horarios** y **Torneos**. La primera muestra el editor/calendario de días; la segunda, copias, estado y diferencias. Es un detalle de configuración, sin convertirse en una agenda de partidos.

En fechas individuales, **Abrir** lleva inicialmente a su pantalla contextual. **Compartir** permite adoptar esa fecha en un grupo estable y luego usar el detalle general. Una nueva configuración creada con este módulo tendrá un grupo incluso con un solo torneo, de modo que se pueda ampliar después sin cambiar su identidad.

No guardar grupos vacíos ni borradores remotos en esta entrega. Se requiere al menos un destino confirmado; abandonar el formulario no deja fechas o grupos huérfanos.

### 4.2 Accesos y flujo de creación comunes

Flujo principal del panel general:

1. Elegir alcance de club(es) y torneos. Este paso precede a las rondas porque cada torneo puede tener un bracket diferente.
2. Definir nombre, descripción y período de la fecha; elegir ronda/copa compatibles para cada destino. Aplicar una selección común solo a los que la admiten.
3. Configurar días y franjas, o elegir crear solo la fecha.
4. Revisar por destino, resolver conflictos y confirmar.

Desde cada torneo, el mismo flujo comienza con ese torneo y su club preseleccionados. Podrán ampliarse los destinos desde el selector. Las operaciones disponibles son:

- **Nueva fecha**: alcance/torneos → datos de fecha y ronda/copa → horarios opcionales → revisión → guardar.
- **Agregar horarios** dentro de una fecha: días y franjas → destinos → revisión → guardar.
- **Compartir** sobre una fecha existente: seleccionar qué copiar → destinos → resolver coincidencias → revisión → guardar.
- **Ver torneos vinculados**: consultar cobertura, diferencias y acciones pendientes.

El orden de los pasos se adapta a la entrada, sin duplicar reglas: si se abre **Agregar horarios** sobre una fecha conocida, el editor puede abrir directamente y revisar destinos antes de guardar. Al volver entre pasos se conservará el borrador en memoria. Cerrar con cambios pendientes pedirá confirmar el descarte; cancelar no escribirá datos.

En una creación nueva, los destinos necesitan una fecha propia. Al compartir sobre datos existentes, cada destino podrá crear una fecha o usar una compatible ya existente. No se guardarán fechas intermedias mientras se recorre el formulario.

En el torneo se conserva su vista enfocada en sus datos: fechas, franjas y ajustes locales. Agregar el indicador de distribución y **Ver configuración compartida**, con regreso al torneo. No rediseñar toda la pantalla ni cambiar la vista de disponibilidad de jugadores. Los enlaces al detalle global se autorizan en servidor; no basta con conocer el groupId.

### 4.3 Editor de días y franjas

Composición propuesta: el editor ocupa la pestaña Días y horarios del detalle general; durante creación y acceso contextual puede abrir en un popup amplio en escritorio y pantalla adaptada en celular. Lista/calendario de días y panel del día seleccionado, con selección múltiple para aplicar una configuración común. Un único componente y estado de borrador para ambas presentaciones.

Acciones del editor:

1. Seleccionar uno o varios días dentro del período de la fecha.
2. Agregar franjas con campos de inicio y fin; ninguna cantidad fija.
3. Dividir una franja en una hora elegida. La división conserva exactamente la cobertura original.
4. Mover o redimensionar una franja en una línea horaria, con ajuste de 15 minutos al arrastrar.
5. Escribir cualquier minuto válido en los campos para ajustes precisos; el paso de arrastre no restringe los datos guardables.
6. Eliminar franjas y dejar pausas entre ellas.
7. Copiar la configuración del día a otros días seleccionados.
8. Elegir **agregar** a lo existente o **reemplazar el borrador** de los días destino. Reemplazar nunca elimina horarios guardados sin pasar por revisión y protección de dependencias.
9. Configurar cancha y descripción opcionales por franja. Conservar la capacidad existente; editar una hora no debe reiniciar `max_matches` a 1.

Ejemplo ilustrativo:

| Día | Franjas |
|---|---|
| Viernes | 18:00–22:00 |
| Sábado | 08:00–12:00 · 12:00–16:00 · 18:00–22:00 |
| Domingo | 09:00–15:00 · 15:00–21:00 |

La representación visual y los campos modificarán un único estado. Ninguna operación dependerá exclusivamente del arrastre, el hover o una pantalla grande. Dividir, mover y redimensionar también tendrán controles accesibles mediante teclado/campos.

Los horarios representan disponibilidad de parejas. Dividir una franja cambia las opciones que podrán responder las parejas; la duración estimada de los partidos seguirá siendo un dato independiente de la fecha.

### 4.4 Selector de torneos

- En el panel general no hay un torneo de origen obligatorio: se parte del alcance elegido y se exige al menos un destino.
- En la entrada contextual, el torneo actual estará incluido por defecto y se mostrará identificado.
- Dentro del club seleccionado, mostrar los torneos elegibles del mismo `club_id` antes de ampliar a otros clubes.
- Opción explícita para ampliar a otros clubes administrados del mismo ámbito de organización/tenant.
- Búsqueda y agrupación por club, con nombre, categoría cuando esté disponible, estado y fecha destino.
- Selección individual, selección de todo un club y selección de todos los elegibles del alcance elegido.
- Mostrar el número total seleccionado, incluso si la búsqueda oculta algunos. La acción de seleccionar todos indicará si afecta al resultado filtrado o al alcance completo.
- Por defecto: torneos LONG no finalizados ni cancelados. Los históricos podrán consultarse sin sumarlos automáticamente a una nueva aplicación.
- Los torneos incompatibles se mostrarán con una explicación cuando sea útil; no se incorporarán silenciosamente.
- Canchas de texto copiadas a otro club requerirán revisión: conservar, cambiar o dejar sin cancha. No asumir que “Cancha 1” representa el mismo recurso físico entre clubes.

“Todos” se refiere a los destinos elegidos en esa operación. Los torneos futuros se incorporarán desde el panel de vinculados.

### 4.5 Revisión antes de guardar

Mostrar un resumen por destino:

- Fecha que se creará o fecha existente que se vinculará.
- Número local previsto, ronda y copa.
- Días, franjas nuevas, coincidencias que se reutilizarán y cambios propuestos.
- Diferencias locales, disponibilidades o partidos que bloquean cambios.
- Cambios de estado del torneo derivados de la regla actual de primera fecha ZONE.

Los conflictos deberán resolverse o los destinos afectados deberán excluirse antes de confirmar. No saltar destinos en silencio. El botón indicará la cantidad real de torneos y franjas que se modificarán.

### 4.6 Cobertura y copias vinculadas

El listado general, el detalle y la fecha contextual mostrarán **“Aplicada en N torneos”**, contando solo los destinos que el usuario puede consultar. Usarán el mismo cálculo de cobertura. Un usuario que pierda permisos no podrá seguir viendo nombres, cantidades o detalles de otros clubes a través del grupo.

Estados calculados a partir de relaciones y contenido:

| Estado | Significado | Acción |
|---|---|---|
| Completo | La fecha y los elementos compartidos coinciden con la versión aplicada | Ver destino |
| Pendiente | El torneo está en la selección previa y todavía no recibió la fecha | Crear o vincular |
| Faltan horarios | Tiene la fecha y falta parte de los elementos elegidos | Completar faltantes |
| Modificado localmente | Una copia cambió después de aplicarla | Revisar diferencias |
| Hay cambios compartidos | El grupo tiene una versión posterior todavía no aplicada aquí | Comparar y aplicar |
| Desvinculado o eliminado | Se retiró explícitamente una copia | Volver a vincular o restaurar de forma explícita |

El detalle se abrirá desde el panel general y desde cualquier copia autorizada. Si el grupo nació desde un torneo, ese origen será una referencia opcional; si nació desde el panel, el origen puede ser nulo. No habrá un torneo principal obligatorio ni se perderá el grupo por borrar su origen.

## 5. Modelo de datos propuesto

Mantener `tournament_fechas`, `tournament_time_slots`, `couple_time_availability` y `fecha_matches` como datos operativos de cada torneo. Agregar tablas de vínculo y seguimiento, sin reemplazar IDs existentes.

Nombres orientativos; se cerrarán al validar el esquema local:

| Entidad | Responsabilidad | Invariantes |
|---|---|---|
| `schedule_share_groups` | Identidad estable del conjunto, contexto de permisos, autor, nombre/período común, origen nullable y versión de los datos comunes | Permite creación sin torneo de origen; todos sus destinos están en la base seleccionada y deben ser administrables por el actor |
| `schedule_share_members` | Relación grupo–torneo–fecha, configuración de ronda/copa local y última versión de metadatos aplicada | Un miembro activo por grupo y torneo; una fecha no pertenece a dos grupos activos |
| `schedule_share_items` | Identidad lógica y contenido versionado de cada franja compartida | Su ID no depende de una fila del torneo de origen; las bajas conservan referencia histórica |
| `schedule_share_item_targets` | Relación entre franja lógica y horario físico de cada miembro; snapshot aplicado y estado | Un vínculo activo por elemento y miembro; un horario no se adopta dos veces |
| `schedule_share_operations` | Clave de operación, actor, huella del pedido, estado y resultado recuperable | Repetir una clave con el mismo pedido devuelve el resultado previo; con otro pedido se rechaza |

La versión común guardará los datos necesarios para comparar y volver a aplicar. No contendrá respuestas de parejas. Ronda, copa, número, estado, duración de partido y límites locales seguirán perteneciendo a cada fecha; compartir esos campos requerirá selección explícita y compatibilidad por destino.

El grupo es la configuración compartida que administra el panel. Sus miembros siguen siendo las fechas reales del sistema actual. No se necesita una columna `tenant_id` para separar FV de Elite: ya están en bases independientes. Un estado de distribución derivado no es el estado competitivo de todas las fechas; por ejemplo, una copia puede estar en progreso y otra pendiente sin que el panel las iguale. El listado general combina grupos visibles y fechas sin vínculo activo, omitiendo las fechas ya representadas por su grupo para evitar filas duplicadas.

Guardar el snapshot de lo último aplicado, además de su versión. Así se puede comparar: contenido actual de la copia, última configuración aplicada y nueva configuración propuesta. Una versión por sí sola no detecta cambios hechos desde formularios anteriores.

Restricciones e índices:

- Claves foráneas y validación de pertenencia: la fecha del miembro corresponde a su torneo; el horario del vínculo corresponde a su fecha; elemento y miembro pertenecen al mismo grupo.
- Índices sobre claves foráneas y columnas usadas para listar grupos, destinos y elementos por fecha.
- Unicidad de las identidades de distribución para impedir duplicados por reintentos y concurrencia.
- Unicidad de la clave de operación por actor y ámbito, con huella del contenido.
- Checks para franjas válidas y cantidades positivas en elementos `TIME_RANGE`.
- Unicidad exacta de horarios físicos: revisar duplicados existentes antes de proponer un índice adicional. La primera garantía obligatoria será la identidad de distribución; no agregar una restricción global que falle sobre datos históricos sin diagnóstico.
- Bajas de origen/copia no deben borrar en cascada horarios de otros torneos. Los vínculos conservarán estado de eliminación o se desvincularán sin afectar las copias restantes.

No identificar una fecha por su nombre, número o coincidencia de período. No unir automáticamente fechas existentes porque “parecen la misma”.

## 6. Operaciones del servidor y consistencia

Contratos tipados previstos:

- `getScheduleWorkspaceScope`: obtener rol, clubes y torneos administrables desde la sesión actual, dentro de la base ya configurada.
- `listScheduleWorkspace`: listado paginado de grupos y fechas individuales con filtros y cobertura autorizada.
- `getScheduleGroupDetail`: datos comunes, días, copias autorizadas y diferencias para el detalle general.
- `getScheduleShareTargets`: listar destinos autorizados, compatibilidad y fechas candidatas.
- `previewScheduleBatch`: validar borrador y devolver el detalle de operaciones/conflictos sin escribir.
- `commitScheduleBatch`: crear/vincular fechas, aplicar franjas y registrar vínculos con clave de operación.
- `getScheduleShareCoverage`: devolver cobertura y diferencias visibles para el usuario actual.
- `previewSchedulePropagation` / `commitSchedulePropagation`: revisar y aplicar cambios explícitos sobre copias seleccionadas.
- `unlinkScheduleMember`: retirar el vínculo manteniendo los datos del torneo, cuando no se solicita borrarlos.

Usar Server Actions para la interacción del formulario y una función transaccional de base para cada confirmación. No encadenar en el navegador la acción actual una vez por torneo y horario.

Política de guardado:

1. Validar forma, límites, alcance y permisos en servidor, independientemente de la pantalla de entrada.
2. Crear una vista previa con versiones de los datos relevantes; es orientativa y puede quedar vieja.
3. Al confirmar, volver a comprobar permisos, versiones, dependencias y conflictos dentro de la transacción.
4. Bloquear los registros necesarios en orden estable para evitar dos creaciones concurrentes del mismo destino o numeración asignada de forma inconsistente.
5. Aplicar las escrituras de todos los destinos confirmados de forma atómica. Si aparece un conflicto nuevo, no guardar una parte y devolver la diferencia para revisar.
6. Registrar el resultado junto con las escrituras. Si se pierde la respuesta de red, reintentar con la misma clave recupera el resultado sin duplicar.
7. Invalidar `/schedules`, el detalle `/schedules/[groupId]` y las rutas concretas afectadas de cada torneo: schedules, dates, programación de partidos y página del torneo cuando corresponda; refrescar lecturas cliente y contadores.

Medir el volumen proyectado antes de guardar. Definir un límite técnico de filas/destinos tras pruebas; si se supera, solicitar reducir la selección antes de escribir. Evitar dividir silenciosamente una operación atómica en lotes parciales.

Para numeración nueva, calcular en servidor `max(fecha_number) + 1` por torneo y serializar la asignación necesaria. Conservar los números existentes y la posibilidad admitida por el esquema de tener huecos o repeticiones. El UUID y los vínculos serán la identidad.

Mantener transacciones breves, escrituras en lote y consultas de cobertura sin una consulta por fila. Usar contexto autenticado y `SECURITY INVOKER` como punto de partida; cualquier excepción necesaria exige justificación y autorización interna explícita, sin usar service role para evitar permisos.

## 7. Validaciones y protección de información existente

### Franjas y días

- Fecha civil `YYYY-MM-DD` y horas locales normalizadas; usar el criterio de Argentina para “hoy”, sin convertir días a medianoche UTC.
- Inicio anterior a fin. Los intervalos contiguos 08–15 y 15–22 son válidos.
- Validar el lote contra sí mismo y contra los horarios existentes, no solo una fila contra la base.
- Rechazar duplicados exactos; detectar solapamientos en la misma fecha y recurso. Con cancha vacía, tratar los rangos como del mismo recurso sin asignar dentro de esa fecha. Distintas canchas pueden superponerse.
- Mantener libres las pausas; no fusionar automáticamente franjas contiguas porque representan opciones de disponibilidad diferentes.
- Si hay período configurado, los días deben estar dentro de él. Permitir ampliar el período desde el flujo mediante revisión explícita.
- Los históricos se pueden consultar; el editor no crea nuevas franjas en días pasados. Una edición de metadatos que conserve fechas pasadas no debe fallar únicamente por ser histórica.
- Cruces de medianoche: representar con dos rangos en días distintos; admitir un límite final “24:00” en el editor y convertirlo de forma consistente al tipo de hora local validado, sin truncarlo a “23:59”. Confirmar la compatibilidad de los consumidores y cubrirla antes de habilitar ese límite.
- Excluir siempre `FREE_DATE` y `is_system` de las acciones de copiar/dividir/borrar y del conteo de franjas normales.

### Datos ya creados

| Situación | Comportamiento |
|---|---|
| Fecha ya vinculada al grupo | Reutilizarla; nunca crear otra por reintento |
| Fecha manual candidata | Mostrarla y pedir selección explícita; validar ronda/copa/período |
| Horario manual exactamente equivalente | Reutilizarlo y registrar el vínculo, informándolo en la revisión; mantener ID y respuestas |
| Más de un equivalente manual | Marcar ambigüedad y pedir elegir; no seleccionar el primero arbitrariamente |
| Copia con cambio local | Preservar por defecto; permitir revisión explícita antes de aplicar otro valor |
| Horario sin respuestas ni partidos | Permitir edición, división y eliminación con revisión del alcance |
| Horario con respuestas | Conservarlas al cambiar solo texto compatible; bloquear cambios de día, horas o cancha y la división/eliminación que invaliden su significado |
| Horario o fecha con partidos programados | Bloquear cambios incompatibles y dirigir a reprogramación; comprobar tanto referencias como programación concreta vinculada a la fecha |
| Copia borrada o desvinculada explícitamente | No recrearla con “completar faltantes”; ofrecer restauración/reincorporación explícita |

En esta entrega no se copiarán respuestas de parejas ni se trasladarán automáticamente a franjas divididas o ampliadas. Las operaciones destructivas ya existentes deberán usar las mismas protecciones cuando afecten datos vinculados.

“Completar faltantes” agrega lo ausente. No restablece personalizaciones, no cambia el estado de una fecha y no borra horarios locales adicionales. La cobertura debe distinguir cambios locales, bajas voluntarias y elementos realmente pendientes.

Una modificación aplicada solo al torneo actual queda registrada como diferencia local. Cuando el usuario elija compartir una modificación, la nueva versión común se aplicará únicamente a los destinos revisados; las copias no seleccionadas mostrarán que hay cambios disponibles.

## 8. Permisos y aislamiento

- Reutilizar y unificar el modelo de gestión de `checkTournamentPermissions`, comprobando su equivalencia con las políticas de base para CLUB, ORGANIZADOR y ADMIN.
- Autorizar el panel general en `config/permissions.ts`, la página/acciones y las políticas de base. Ocultar el enlace es solo presentación; probar también acceso directo a `/schedules` y `/schedules/[groupId]`.
- Usar `getUserManagedClubs` como una entrada a verificar; actualmente no resuelve ADMIN y su consulta de clubes debe contrastarse con los permisos por `organization_id` del torneo. Construir un ámbito efectivo coherente y evitar que esa diferencia oculte destinos válidos o exponga otros.
- Comprobar acceso al origen cuando exista y a cada destino en cada escritura. En creación general no exigir un origen ficticio; recibir IDs válidos desde la UI no implica autorización.
- “Todos” estará limitado a los torneos que el usuario puede administrar dentro de la base seleccionada. El tenant ya está fijado por esa base.
- Para torneos con `organization_id` nulo, aplicar los permisos existentes de propiedad/gestión de club o ADMIN según corresponda. Resolver cualquier diferencia de autorización entre helpers sin tratarla como un problema de identidad o aislamiento de tenant.
- RLS en todas las tablas nuevas; políticas de lectura y escritura por recurso y ámbito. Incluir `USING` y `WITH CHECK` cuando correspondan.
- Las relaciones de destinos y resultados de operaciones no deben filtrar nombres, IDs o cantidades de torneos que el solicitante ya no puede consultar.
- Los jugadores conservan su vista de disponibilidad y no reciben acceso a metadatos de distribución ni a listas de otros torneos.
- Validar que una función transaccional sea segura también cuando se invoca directamente, sin pasar por la Server Action.

## 9. Plan de implementación y entregables

| Etapa | Trabajo | Entregable y criterio de salida |
|---|---|---|
| 0. Contrato y diagnóstico | Confirmar esquema/políticas, permisos efectivos de clubes/torneos, navegación FV, tratamiento de históricos y numeración; tomar baseline de checks | Contratos de panel, editor y operaciones cerrados; diferencias de esquema registradas; ningún cambio remoto |
| 1. Base transaccional | Preparar migración local con tablas, índices, RLS e idempotencia; implementar validación y confirmación atómica | Casos de permisos, reintentos, concurrencia y rollback verificados localmente |
| 2. Panel y navegación | Crear `/schedules`, listado filtrado/paginado de grupos e individuales, detalle y enlaces globales de gestión | El panel es localizable en escritorio/móvil, respeta permisos y permite encontrar fechas antiguas sin agruparlas automáticamente |
| 3. Editor y distribución | Implementar editor reutilizable, varios días, filas libres, división, pausas, copia entre días, arrastre, selector por clubes y vista previa | Crear una configuración desde el panel, sin torneo de origen, y aplicarla en uno o varios destinos |
| 4. Acceso contextual | Conectar las acciones de cada torneo al mismo módulo; adoptar fechas manuales y añadir retorno al detalle general | Ambas entradas crean/editan los mismos datos y sus cambios se reflejan mutuamente |
| 5. Cobertura y mantenimiento | Agregar completar faltantes, diferencias locales, propagación explícita y desvinculación en el detalle general | Se puede volver desde cualquier entrada, agregar destinos y aplicar cambios seleccionados |
| 6. Compatibilidad y QA | Integrar las protecciones con editar/borrar existentes; revisar jugador, fechas libres, rondas, copas, navegación y recomendaciones | Flujos existentes y nuevos verificados en escritorio/celular y con teclado |
| 7. Entrega y activación | Documentar migración, checks, instrucciones y control de activación por tenant; preparar reversión de interfaz | Código revisable y migración local entregados; el propietario despliega la base por su CI/CD |

Las etapas 2 y 3 permiten validar el núcleo del flujo temprano. La entrega completa incluye también las etapas 4 y 5: acceso contextual, referencia entre copias y mantenimiento de pendientes son requisitos centrales. La creación y distribución básica debe funcionar antes de pulir el arrastre, pero la entrega final incluye ambos mecanismos.

## 10. Archivos y organización previstos

Modificar los puntos de integración reales:

- `config/permissions.ts`, `components/navbar.tsx` y, solo si hace falta por el icono/menú, `components/navbar-client.tsx` y `components/icons.tsx`.
- `utils/supabase/middleware.ts` solo si la integración de `checkRoutePermission` necesita ajustes; no reescribir el manejo de sesiones.
- `app/(main)/tournaments/[id]/schedules/@organizer/page.tsx`.
- `app/(main)/tournaments/[id]/schedules/components/organizer/OrganizerScheduleView.tsx`.
- `FechaManager.tsx`, `TimeSlotManager.tsx`, `CreateFechaDialog.tsx` y `CreateTimeSlotDialog.tsx` del mismo directorio.
- Diálogos de edición/eliminación de fecha y horario para compartir validaciones y mostrar el alcance local.
- `schedules/actions.ts`, `dates/actions.ts` y reexportaciones de `schedule-management/actions.ts` para evitar lógica duplicada.
- `utils/tournament-permissions.ts` únicamente en lo necesario para una autorización consistente.
- `lib/services/tenant-organization.service.ts` solo como referencia de configuración ya existente cuando un helper la necesite. El tenant está definido por la base; no crear un mecanismo nuevo de resolución ni ampliar privilegios.
- Configuración de activación en servidor y tenant, siguiendo los patrones disponibles del proyecto.

Nuevos módulos propuestos:

- `app/(main)/schedules/page.tsx`, `loading.tsx`, `error.tsx` y `app/(main)/schedules/[groupId]/page.tsx`: listado y detalle general como Server Components, con formularios cliente acotados.
- Acciones de entrada del panel general que consuman el mismo servicio que las acciones contextuales. Las reglas de dominio no deben quedar dentro de una ruta de torneo.
- `components/scheduling/` para editor de días/franjas, línea horaria, selector de destinos, revisión y cobertura reutilizables desde ambas rutas.
- Hook/reducer local para el borrador, con operaciones puras de agregar, dividir, mover y copiar.
- `lib/services/schedule-sharing/` para contratos, normalización, diferencias y validaciones reutilizables.
- Funciones transaccionales y políticas en una migración nueva de `supabase/migrations/`, creada con el flujo de CLI del repositorio al implementar.
- Pruebas de dominio e integración local de base; documentación de validación y activación.

Evitar reescribir vistas de jugador, el sistema de brackets o la agenda de partidos. Solo adaptar sus lecturas/revalidaciones si el nuevo flujo lo requiere.

El working tree contiene cambios de otra feature en `match-scheduling` y documentos de cobros/inscripciones. Inventariarlos antes de comenzar; no restaurar, sobrescribir ni incorporar esos diffs a esta feature. El usuario aclaró que la petición sobre pelotitas/simetría pertenecía a otro trabajo.

## 11. Verificación y criterios de aceptación

Pruebas de dominio:

- División conserva cobertura y genera dos franjas contiguas válidas.
- Un día acepta una, dos o más franjas y pausas.
- Copiar días respeta modos agregar/reemplazar y detecta conflictos.
- Normalización de horas/canchas detecta coincidencias aunque el formato textual difiera.
- Cálculo de diferencias detecta cambios locales incluso si ocurrieron desde acciones antiguas.
- Los días no cambian por conversiones de zona horaria.

Pruebas de integración con Postgres local:

- Creación de grupo desde el panel sin torneo de origen y con un único destino ampliable después.
- Listado general con grupos e individuales: cada fecha representada una sola vez y datos históricos intactos.
- CLUB/ORGANIZADOR/ADMIN con permisos correctos e intentos directos sobre destinos ajenos.
- Cruce autorizado entre clubes del mismo ámbito; rechazo de otro ámbito.
- Creación de varias fechas y franjas con vínculo correcto y `FREE_DATE` individual.
- Misma operación dos veces, respuesta perdida y dos guardados concurrentes: sin filas duplicadas.
- Cambio de permisos o versión entre vista previa y confirmación: fallo consistente, sin escrituras parciales.
- Error en un destino: rollback de la operación completa.
- Adopción de fecha/horario manual conserva IDs y disponibilidades.
- No se mezclan parejas, partidos ni disponibilidad entre torneos.
- Edición/borrado de origen no elimina las copias restantes.
- Baja voluntaria no reaparece al completar pendientes.

Pruebas funcionales en navegador:

1. Entrar al panel general desde la navegación de CLUB/ORGANIZADOR/ADMIN en FV. PLAYER/COACH/invitado no ven el enlace ni acceden por URL.
2. Filtrar club/período/torneo, abrir un registro y volver: conservar los filtros. Consultar también registros individuales antiguos y sin período.
3. Crear desde el panel una fecha con franjas diferentes para varios días; seleccionar Caballito 4ta, otras categorías del club y un club adicional autorizado, sin elegir un origen artificial.
4. Revisar que la vista previa coincida con las filas guardadas y el resumen final; el grupo aparece una vez en el listado.
5. Entrar a la fecha de uno de los torneos: comprobar mismos datos, vínculo al grupo y regreso contextual.
6. Desde una fecha antigua de torneo, compartir y adoptar datos sin reemplazar IDs ni perder respuestas.
7. Agregar otro torneo desde el detalle general y completar únicamente los elementos faltantes.
8. Editar solo una copia; comprobar diferencia local en el panel y conservación de las demás.
9. Aplicar un cambio a destinos elegidos; comprobar bloqueo de los que tengan respuestas o partidos incompatibles.
10. Quitar permisos a un destino entre consultas: su información no sigue apareciendo en listado, detalle ni contadores.
11. Marcar disponibilidad como jugador y programar un partido usando los horarios creados.
12. Repetir el recorrido principal en celular y con teclado, incluyendo errores, carga, doble envío y descarte del borrador.

Checks del proyecto: tests relevantes con Jest, TypeScript y build del tenant correspondiente. Verificar primero las herramientas reales: `npm run lint` apunta a `next lint`, cuya disponibilidad debe comprobarse con la versión instalada. Registrar fallas previas y no ocultar omisiones.

Objetivo inicial de volumen para medir: 30 torneos × 7 días × 4 franjas = 840 horarios físicos más sus vínculos. Registrar tiempos de vista previa y guardado, número de consultas y comportamiento del editor. Ajustar límites con esta medición antes de habilitar selección masiva.

Se considera completa la feature cuando el organizador puede crear, compartir, consultar cobertura, extender y mantener la configuración desde el panel general y desde un torneo, con cualquier cantidad de franjas válidas, sin duplicaciones, pérdida de respuestas ni necesidad de repetir la carga torneo por torneo. La navegación, los filtros y la consulta de fechas previas forman parte de la entrega.

## 12. Migración, activación y reversión

- Crear una migración aditiva y validarla exclusivamente en una base local. No desplegar, aplicar, push ni ejecutar migraciones contra ningún Supabase remoto.
- Mantener registros existentes operativos sin backfill automático de supuestas equivalencias.
- Verificar documentación y changelog actuales de Supabase antes de implementar funciones, políticas o comandos dependientes de versión.
- Entregar al propietario la migración, validaciones, orden de activación y requisitos. Su despliegue remoto se realiza por el CI/CD del propietario.
- Activar la nueva interfaz solo cuando el esquema requerido esté disponible. Preparar control de activación explícito por tenant que también se compruebe en servidor.
- Validar primero el flujo local completo; la comprobación posterior en producción debe ser un caso controlado y autorizado, sin crear datos de prueba por iniciativa propia.
- Ante una regresión, desactivar la nueva interfaz/operaciones y conservar los datos creados como fechas y horarios normales. No borrar tablas ni eliminar fechas para revertir la UI.
- Conservar y permitir diagnosticar grupos y operaciones ya guardadas; reactivar tras corregir no debe recrear lo existente.

## 13. Decisiones propuestas para ejecutar

1. Copias vinculadas con cambios explícitos, manteniendo disponibilidad y partidos locales.
2. Rangos libres y cualquier cantidad de franjas; campos de hora como mecanismo completo y arrastre como atajo.
3. Panel general como entrada principal y acceso contextual conservado por torneo; un único módulo de edición y operaciones para ambas entradas.
4. Confirmación atómica de los destinos revisados y reintentos idempotentes.
5. Adopción de datos manuales solo tras selección/revisión explícita.
6. Protección conservadora de horarios que ya recibieron disponibilidad o se usaron para programar partidos.
7. Cobertura y diferencias persistentes desde la primera entrega completa.
8. Migración local preparada para despliegue separado por el propietario.
9. Configuración compartida con identidad propia, origen opcional y al menos un destino confirmado.
10. Fechas antiguas visibles individualmente, adoptables sin agrupación automática ni backfill obligatorio.

El plan deja definido el comportamiento funcional. Los puntos técnicos a confirmar en la etapa 0 son el estado real de esquema/RLS, la consistencia de los helpers de autorización, el soporte existente de límite 24:00 y los límites de volumen. La arquitectura de un tenant por base ya está confirmada y no es una investigación pendiente.

## 14. Consigna para comenzar en otro chat

Copiar esta consigna en un chat abierto sobre el mismo repositorio:

```text
Implementá la feature de fechas y horarios siguiendo este plan completo:
C:\Users\54116\Downloads\padel-fv\docs\plan-fechas-horarios-compartidos-2026-11-05.md

Leé el documento entero y el AGENTS.md antes de trabajar. La versión vigente del plan es la revisión 3: panel general /schedules como entrada principal de gestión masiva, conservando /tournaments/[id]/schedules como acceso contextual. Ambas entradas deben reutilizar editor, validaciones y operaciones, sin requerir un torneo de origen al crear desde el panel.

Arquitectura ya confirmada por el propietario y documentada en AGENTS.md: cada base/proyecto Supabase tiene exactamente un tenant. FV y Elite están en bases independientes. Usá la base configurada; no agregues selector de tenant, tenant_id ni resolución dinámica o aislamiento entre FV/Elite dentro de una misma base. Mantené los permisos existentes de usuarios, organizaciones, clubes y torneos.

El usuario ya aprobó: copias vinculadas con datos locales por torneo; compartir con torneos del mismo club y ampliar a otros clubes administrados; rangos libres por día sin fijar dos franjas; agregar/dividir/mover/redimensionar, pausas y copia entre días; leyenda de cobertura por torneo, completar faltantes y propagación explícita de cambios. Conservar respuestas de parejas, partidos existentes y slots de sistema FREE_DATE. Incluir fechas antiguas individuales en el panel y permitir vincularlas explícitamente.

Empezá por la etapa 0 y avanzá con la implementación y verificación local de las etapas definidas. Resolvé las decisiones rutinarias según el plan; consultá solo si aparece una contradicción real o falta información imprescindible. No publiques ni despliegues sin una instrucción específica.

Este workspace es FV. Si necesitás inspección remota, usá únicamente supabase-fv, ref bfmaqrythlwbfjuqumom, y solo lectura durante esta implementación. Está prohibido ejecutar, aplicar, desplegar o hacer push de migraciones a cualquier Supabase remoto: preparalas y validalas localmente; el propietario las despliega por su CI/CD. No uses MCP genéricos supabase/supabase-develop ni el proyecto histórico vulusxqgknaejdxnhiex.

Antes de editar, inventariá git status y preservá los cambios ajenos. Hay trabajo independiente en match-scheduling (matriz, pelotitas, contactos y tests) y documentación de cobros/inscripciones. No lo reviertas ni lo mezcles con esta feature. La solicitud de simetría/pelotitas fue un desvío de otra feature, no un requisito visual de este panel.

Entregá implementación revisable, migración local, pruebas adecuadas, verificación de los flujos en navegador para escritorio/celular y un resumen claro de lo que quede pendiente de despliegue por el propietario. Si no hay entorno local de base disponible, indicá exactamente qué no se pudo verificar sin sustituirlo por escrituras remotas.
```

No se creó un chat nuevo ni se implementó la feature al preparar esta revisión. Este archivo es el traspaso de contexto y el plan de ejecución.
