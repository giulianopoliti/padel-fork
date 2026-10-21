# Americano libre: interfaz, resultados y reversiones

20 de octubre de 2026.

## Comportamiento

- Las tarjetas muestran jugadores, marcador por pareja, ganador y estado, con carga o modificación de resultado desde cada partido.
- Se reutiliza `BracketSingleSetResultDialog` del americano actual con su validación de un set; americano libre guarda mediante su operación deportiva transaccional.
- Canchas, agenda, BYEs y descalificaciones se gestionan sobre el partido elegido, sin un selector global de todos los partidos.
- Crear llave vacía explica el orden: crear zonas, elegir cantidad, crear la estructura, ubicar parejas y guardar. Se puede preparar antes de terminar las zonas, sin asignación automática por posiciones.
- El formulario existente de zonas ahora guarda resultados en BRACKET_PHASE mediante `mutateFreeSports`: resultado, set, historial, posiciones y revisión se confirman juntos. No ejecuta el escritor legacy ni reasigna entradas de la llave. Mantiene la corrección de orden fila/columna de la matriz.
- Revertir a zonas elimina metadatos, ramas activas e inactivas, seeds, jerarquía, resultados, historial, operaciones, agenda y descalificaciones de llave. Conserva zonas y sus datos.
- Volver a No iniciado elimina también partidos de zona, zonas, posiciones, asignaciones y agenda restante; conserva inscripciones y restablece indicadores de generación.
- Ambas reversiones usan una RPC con permisos verificados, bloqueo del torneo y control de revisión. Un fallo revierte toda la operación; una edición concurrente exige recarga.

## Validación

- 110 pruebas Jest: 87 de americano libre y 23 del guardado de resultados de zona, incluyendo el formulario existente, orden invertido, permisos y conflictos.
- 166 comprobaciones SQL en una base Docker desechable: 60 de persistencia, 66 deportivas y 40 de reversión. Incluyen rollback deliberado, zonas conservadas, ramas inactivas, descalificaciones, agenda, regeneración e inscripciones conservadas.
- Carreras reales de generación, edición, resultados y BYEs; también editor/reversión en ambos órdenes.
- Navegador autenticado contra Supabase local: diálogo compartido, guardado de llave, edición de zona en BRACKET_PHASE y comprobación de la revisión y set en la base. Interfaz revisada a 1440 y 390 píxeles.
- Navegador con un torneo temporal local: creación de llave vacía, reversión de llave a zonas y reversión de zonas a No iniciado. Comprobación final en la base: cero partidos, metadatos de llave, zonas y posiciones. El torneo temporal se eliminó después de la prueba.
- El chequeo global de TypeScript sigue fallando por errores en áreas ajenas a estos cambios y tipos generados previos. No se reportaron diagnósticos en los archivos de implementación modificados para esta tarea. `git diff --check` pasó.

## Migración

`supabase/migrations/20261020161721_americano_libre_reset.sql` fue validada y aplicada solamente en Supabase local para la verificación. No se aplicó ninguna migración remota. El propietario debe desplegarla por Supabase CI/CD junto con estos cambios de aplicación.

Reproducir SQL y concurrencia: `node scripts/test-americano-libre-local.mjs`. El runner usa exclusivamente `supabase_db_padel-base-main-test`, clona solo el esquema en una base temporal y la elimina al terminar.

## Interfaz compartida con Multizone — 21 de octubre

- Americano libre usa directamente `ImprovedBracketRenderer`, `GranularMatchCard` y `DraggableCoupleSlot`, los mismos componentes de Multizone. Comparte barra de estadísticas, acciones, árbol de escritorio y rondas apiladas en móvil.
- El adaptador de presentación respeta las conexiones persistidas, entradas directas, BYEs y ramas inactivas. No usa las operaciones legacy de Multizone: los movimientos y resultados siguen pasando por la persistencia transaccional de libre.
- El panel de zonas aparece durante Reorganizar, permanece visible al guardar y ante conflictos, y se cierra al guardar con éxito, cancelar o terminar la edición. Las ramas inactivas se muestran solo en edición.
- Se ajustaron los espacios del renderizador compartido para evitar superposición entre títulos de ronda y tarjetas, y para mostrar completos los marcadores.
- Pasaron 96 pruebas de americano libre y del árbol compartido. Chequeo de tipos de los archivos modificados: cero diagnósticos; se mantienen errores previos en otras dependencias del proyecto.
- Navegador local: guardado de un resultado con avance, intercambio manual guardado, cierre del panel después del guardado y cierre sin cambios mediante Terminar edición. Se utilizó un torneo temporal independiente del original.
- No se agregaron migraciones ni se realizaron cambios remotos para esta unificación visual.

## Navegación sin scrolls anidados — 21 de octubre

- Americano libre abre en Por rondas: botones para cambiar de ronda y tarjetas que se ajustan al ancho disponible. Llave completa conserva el árbol y su desplazamiento horizontal cuando hace falta. Multizone mantiene su vista predeterminada.
- El panel de parejas dejó de tener altura máxima y scroll vertical propio. Un selector permite consultar una zona a la vez o todas las zonas, con un único desplazamiento vertical general.
- La selección y el borrador se conservan al cambiar de ronda o zona. El aviso compartido Ya jugaron en zona detecta partidos de zona finalizados entre las dos parejas y se actualiza con los movimientos del borrador; no bloquea el cruce.
- Validación: 14 pruebas de presentación, árbol, navegación opcional y aviso de revancha; cero diagnósticos de tipos en los archivos tocados (59 errores previos en dependencias). Navegador a 390 y 1440 píxeles: sin scrolls verticales internos ni desbordes horizontales en Por rondas, intercambio en borrador, cancelación y cambio al árbol completo.
- Se usó una página temporal con una llave en memoria e historial local real; se eliminó después de verificar. No se modificaron datos del torneo ni entornos remotos.

## Zonas completas y referencias persistentes — 21 de octubre

- Llave completa es la primera opción y la vista inicial; Por rondas sigue disponible.
- Durante Reorganizar se muestran todas las zonas juntas. La tabla separa Pos., Pareja, PG, PP y DG, con divisores verticales/horizontales, nombres en líneas separadas y encabezados fijos. En escritorio, ambos paneles comparten altura acotada al viewport y scroll interno; en móvil se apilan con altura natural.
- Cada pareja puede mostrar su posición actual en formato `1°A`. Ocultar/Mostrar referencia de zona guarda `tournaments.show_bracket_zone_references`; la preferencia es global por torneo, visible también para espectadores y editable solo mediante permisos de gestión verificados. No modifica formato, resultados ni revisión deportiva, y queda fuera de los datos eliminados por las reversiones.
- Nueva migración: `20261021150850_americano_libre_zone_references.sql`, aplicada solo localmente. Debe desplegarse por CI/CD antes de publicar la aplicación que selecciona esta columna. Los tipos generados del repositorio son actualmente un fallback `Database = any`; la respuesta de la aplicación tiene su tipo explícito en `FreeBracketView`.
- Verificación local: guardado real de ocultación desde navegador y lectura en PostgreSQL; se restauró la preferencia visible tras la prueba. Pruebas HTTP cubren autenticación, autorización, formato, payload, errores y lectura pública; renderizado cubre referencias actuales/ocultas y todas las zonas; SQL valida default, persistencia y conservación de configuración deportiva. La revisión visual final quedó pendiente porque el navegador local se deshabilitó durante la verificación. La página temporal de QA fue retirada.
- Resultado final: 125 pruebas Jest (incluida separación de tarjetas con referencias), 6 comprobaciones SQL y cero diagnósticos de tipos en los archivos de implementación y pruebas revisados. Persisten 59 diagnósticos previos en dependencias del proyecto. `git diff --check` pasó.

## Altura natural y estados de parejas — 21 de octubre

- Se retiraron la altura fija de la grilla y el scroll vertical interno de ambos paneles. La llave y las zonas crecen con su contenido y se recorren con la página. El árbol conserva únicamente el desplazamiento horizontal si no cabe a lo ancho.
- Las parejas de zona se presentan como botones con borde, indicación de arrastre, estado de selección y texto de acción. Rojo + badge Ubicada tiene prioridad para entradas ya asignadas; las restantes aparecen verdes al completar sus partidos y amarillas mientras tengan pendientes. Una leyenda y el progreso numérico permiten comprender los estados sin depender solo del color.
- El objetivo de partidos se obtiene del formato resuelto del torneo, limitado por el tamaño de la zona. Por ejemplo, un formato de tres partidos requiere dos en una zona de tres parejas. Los partidos jugados provienen de PG + PP; el color no bloquea asignar una pareja con partidos pendientes, siempre que siga habilitada.
- Se conserva la preferencia persistente de referencias. No se agregaron migraciones ni cambios de datos para esta modificación. La revisión visual sigue pendiente mientras el navegador local esté deshabilitado en Work.
- Validación: 142 pruebas Jest y cero diagnósticos en los archivos modificados; continúan 59 errores previos en dependencias. Las pruebas incluyen objetivos de dos/tres partidos, zonas de tres parejas, todos contra todos, lectura del objetivo configurado, estados de color y ausencia de scroll vertical interno.

## Acciones por partido — 21 de octubre

- Se retiró el diálogo genérico Gestionar partido. Los tres puntitos de un cruce con ambas parejas y sin ganador contienen solo Descalificar pareja; su diálogo muestra selección de pareja, motivo y confirmación.
- Un pase libre explícito con pareja y sin ganador muestra Procesar BYE. Una entrada sin asignar o un ganador pendiente de otra ronda no se procesa como BYE. Los BYEs procesados tienen Revertir BYE con confirmación específica.
- Inicio, carga/modificación y reversión de resultado tienen flujos separados. Cancha y horario tiene un botón propio; iniciar no despliega agenda ni descalificaciones. No hay procesamiento masivo de otros BYEs dentro del partido seleccionado.
- Se preservan las operaciones deportivas transaccionales y las comprobaciones de revisión del servidor. Pasaron 29 pruebas de tarjetas, BYEs y operaciones deportivas; cero diagnósticos en los archivos modificados (59 previos en dependencias). Verificación visual pendiente por navegador deshabilitado.

## Tarjetas compactas y BYE en un clic — 21 de octubre

- Se retiró Cancha y horario. Las referencias de zona se ubican junto a los nombres, sin agregar una fila por pareja; se retiraron los 80 px de reserva del árbol de lectura y el marcador duplicado al pie. Los valores y ganador se siguen mostrando en cada pareja.
- Procesar BYE actúa directamente desde la tarjeta cuando hay una sola pareja y el otro lugar es una entrada inicial vacía o un pase libre. Ya no requiere entrar a Reorganizar, asignar BYE, guardar y procesar. Un WINNER pendiente sigue protegido para no eliminar un rival que todavía juega otra ronda.
- La operación ASSIGN_AND_PROCESS_BYE usa una única RPC, process_american_free_bye. Dentro de la misma transacción verifica permisos, revisión y bloqueos, asigna el BYE mediante el escritor de distribución y procesa el avance mediante el escritor deportivo existente. Una falla revierte ambas escrituras. Se bloquean clics duplicados mientras la solicitud está en curso.
- Migración 20261021163545_americano_libre_process_bye_direct.sql aplicada solo localmente, pendiente de CI/CD remoto. Requiere la migración previa de edición de BYEs. El runner local valida en una base desechable y la elimina al finalizar.
- Pasaron 152 pruebas Jest y 182 comprobaciones SQL (16 nuevas para BYE directo), además de las carreras existentes de edición/resultados/BYEs/reversión. Las nuevas SQL incluyen autorización, revisión, doble envío, rollback provocado, avance por el parent_slot correcto y preservación de rivales WINNER. Cero errores de tipos en los archivos modificados; se mantienen 59 previos en dependencias. Verificación visual final pendiente por navegador deshabilitado.
