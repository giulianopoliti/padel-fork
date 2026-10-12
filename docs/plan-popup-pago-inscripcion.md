# Plan para el próximo chat: popup único de pago y limpieza de comprobantes

Actualizado: 12 de octubre de 2026. Plan ejecutado en el directorio de trabajo, sin despliegue remoto. Ver [implementación y verificación](resultado-popup-pago-inscripcion.md). Se conserva debajo el alcance original.

## Objetivo

Reemplazar el formulario de comprobante visible en las páginas por un estado compacto y un botón que abra siempre el mismo popup. Permitir seleccionar un archivo y confirmar su subida, cambiar de efectivo a transferencia, modificar archivos pendientes y limpiar el archivo cuando se elimina la inscripción.

Conservar la inscripción recuperable ya implementada: una sola inscripción, reserva de cupo antes del archivo, sin vencimiento automático y sin perder la inscripción por una falla de red.

## Aclaraciones del usuario e interpretación para implementar

- El acceso al popup va debajo de «Ya estás inscripto», en el bloque existente del torneo. El popup se abre superpuesto a la página; no se deja un formulario expandido debajo del mensaje.
- El mismo acceso debe existir en detalle del torneo, /panel del jugador y /torneos. El alta inicial también debe usar el mismo popup.
- Comprobante pendiente: el jugador puede modificarlo. Interpreto la aceptación de la recomendación anterior como: comprobante aprobado, cambios a cargo del organizador; el jugador puede verlo.
- El organizador puede cargar un comprobante en nombre de la pareja.
- «No se tiene que ver en inscriptions»: siguiendo el pedido anterior de mostrar sólo «Pendiente de comprobante», se interpreta como no mostrar el formulario ni el panel grande de carga dentro de esa página. La fila conserva únicamente el estado/botón que abre el popup. Si el usuario se refiere a quitar también ese botón, confirmar dónde quiere el acceso del organizador antes de implementarlo.
- No marcar cobrado al elegir efectivo. Mantener separadas aprobación de inscripción, revisión del comprobante y casillas de pago.

## Estado de partida: no rehacer lo terminado

- Cambios previos están en el directorio de trabajo, sin despliegue remoto. Hay también cambios anteriores ajenos a este plan: revisar git status/diff y preservarlos.
- Existe `components/tournament/inscription-payment-panel.tsx`: actualmente muestra el formulario en línea y sube inmediatamente al elegir archivo. Debe convertirse en presentación compacta + popup compartido.
- Existe `app/api/tournaments/[id]/inscriptions/payment/route.ts`: reserva, consulta, subida y cambio a efectivo. Comprueba propiedad/gestión y recupera resultados inciertos. Comparte la consulta del listado del organizador.
- La API y la migración actual permiten pasar de transferencia incompleta a efectivo; no permiten efectivo → transferencia, reemplazar un archivo existente ni eliminarlo por separado.
- La migración `20261011172839_resumable_inscription_payments.sql` fue aplicada y registrada sólo en TPE local. Crear una migración nueva para las reglas adicionales; no editar silenciosamente la ya aplicada.
- Las pruebas anteriores suman 92 casos, más SQL local y concurrencia por el último cupo. Build TPE pasó; el chequeo global de TypeScript tiene errores previos. No asumir que esas pruebas cubren los cambios de este documento.
- Documentación anterior: `docs/plan-reservas-comprobantes-efectivo.md` y `docs/plan-comprobantes-conservador.md`.

## 1. Una presentación coherente en todas las pantallas

| Estado | Texto del jugador | Botón |
| --- | --- | --- |
| No inscripto | Disponibilidad actual del torneo | Inscribirme, si está permitido |
| Transferencia sin archivo | Ya estás inscripto · Falta subir el comprobante | Subir comprobante |
| Efectivo | Ya estás inscripto · Abonás en efectivo | Modificar pago |
| Archivo pendiente | Ya estás inscripto · Comprobante enviado | Ver comprobante |
| Archivo aprobado | Ya estás inscripto · Comprobante aprobado | Ver comprobante |
| Sin obligación de comprobante | Ya estás inscripto | Ver detalles; no inventar un pago pendiente |

La aprobación pendiente del organizador se muestra como aclaración independiente. «Ver detalles» se conserva en las tarjetas. Una inscripción existente prevalece sobre «Cupos completos» o inscripción cerrada: poder completar el pago no es volver a inscribirse.

Mientras se consulta la inscripción, no mostrar «Inscribirme» como respuesta provisional. Si falla la consulta, ofrecer reintentar; no tratar el error como ausencia de inscripción. Identificar al jugador en cualquiera de los dos lugares de la pareja y conservar el flujo individual.

## 2. Popup compartido

Usar Dialog y componentes existentes, con diseño pensado primero para celular. Fondo claro, separación cómoda, etiquetas visibles y un botón principal; evitar cajas anidadas. En móvil puede ocupar casi toda la pantalla con contenido desplazable y acciones accesibles.

- Título: «Pago de la inscripción», nombre del torneo y «Tu inscripción está guardada y conserva el cupo».
- Selector de forma de pago con las opciones actualmente habilitadas. Conservar visible la elección existente aunque luego el organizador la deshabilite; deshabilitarla no cambia retroactivamente la inscripción.
- Transferencia: importe, alias y Copiar; selector de archivo con formatos/límite actuales.
- Seleccionar archivo sólo prepara una vista previa. Imagen: miniatura; PDF: nombre/tamaño. Mostrar «Cambiar archivo» y quitar selección local sin tocar el comprobante guardado.
- Botón «Subir comprobante» para el envío inicial y «Reemplazar comprobante» cuando corresponda. Deshabilitar doble envío y mostrar «Subiendo…»; no inventar un porcentaje si no hay progreso real.
- Para cambiar solamente la forma de pago: «Guardar cambios». Si pasa a transferencia sin adjuntar archivo, queda «Falta comprobante». Cerrar sin guardar no modifica el pago.
- Con archivo existente: Ver, estado de revisión, Reemplazar y Eliminar según permisos. Diferenciar quitar una selección todavía no enviada de eliminar un comprobante ya guardado.
- Eliminar un comprobante pide confirmación: «Tu inscripción conserva el cupo y quedará pendiente de comprobante».
- En un error conservar selección y estado útil mientras el navegador siga abierto. Al recargar, consultar lo guardado; no prometer recuperar un archivo local que aún no se envió.
- Al volver de la app bancaria, recuperar forma de pago/inscripción del servidor. Cerrar el popup no cancela la inscripción ni debe dar una subida en curso por revertida.
- Para el organizador, mismo componente con texto adaptado («La inscripción de esta pareja…») y permisos de gestión comprobados por el servidor.
- Manejar foco inicial, Escape, devolución del foco al botón de origen, etiquetas accesibles y mensajes de error anunciados.

## 3. Ubicación y archivos a revisar

### Detalle del torneo

- `app/(main)/tournaments/[id]/page.tsx`: quitar el panel suelto agregado por encima del contenido.
- `components/player/AmericanPlayerDashboard.tsx`: integrar estado y botón justo debajo de «¡Estás inscripto!».
- `components/player/PlayerTournamentDashboard.tsx`, `components/tournament/player/player-tournament-client.tsx` y `app/(main)/tournaments/[id]/components/LongTournamentView.tsx`: cubrir los detalles LONG y variantes que realmente estén en uso, sin duplicar el bloque.
- `app/(main)/torneos/[slug]/page.tsx` ya reutiliza `TournamentPageById`; debe heredar el mismo comportamiento.
- Rutas mencionadas por el usuario: torneo/slug, torneos/id y tournaments/id. En el código revisado existen `/torneos/[slug]` y `/tournaments/[id]`; no se encontró `/torneo/[slug]` singular y el resolvedor de slug no trata automáticamente un UUID como slug. Verificar aliases/redirecciones antes de crear rutas o cambiar URLs. No inventar tres implementaciones distintas.

### Panel del jugador

- `app/api/panel/actions.ts`: las consultas actuales conocen si está inscripto, pero no incluyen el estado completo del comprobante. Añadir sólo los datos necesarios.
- Revisar las cuatro variantes bajo `app/(main)/panel/@player/components/`: `player-upcoming-tournaments-section.tsx`, `player-inscribed-tournaments-section.tsx`, `player-fv-upcoming-tournaments-section.tsx`, `player-fv-inscribed-tournaments-section.tsx`.
- Integrar el acceso debajo del mensaje existente; no obligar a entrar al detalle ni a buscar otra sección para cargar.

### Listado /torneos

- `components/tournaments/public-tournament-cards.tsx`, `components/public/public-tournament-list.tsx`, `app/(main)/tournaments/components/public-tournaments-page.tsx` y `types/public-tournament.ts`.
- Causa observada: las tarjetas públicas muestran disponibilidad del torneo, pero no la inscripción del usuario actual. No basta con cambiar el texto del botón.
- Consultar las inscripciones propias de los torneos visibles en conjunto, no una llamada por tarjeta. No incorporar datos privados del jugador a una caché pública compartida.
- Mantener el listado público para invitados. Tras iniciar sesión o inscribirse, recuperar el estado correcto.

### Organizador e inscripción inicial

- `components/tournament/tournament-couples-tab.tsx`: quitar el panel/formulario dentro de las filas. Si falta el archivo, sólo botón «Pendiente de comprobante». Con archivo, botón Ver comprobante y revisión debajo. Efectivo: etiqueta/botón compacto.
- `app/(main)/tournaments/[id]/inscriptions/page.tsx`: quitar el bloque de carga fuera de la tabla. Puede conservarse un aviso compacto sobre reservas incompletas si ayuda a explicar por qué no se pueden armar zonas.
- `components/tournament/player/register-couple-form.tsx`: al guardar correctamente, ofrecer/abrir el mismo popup. Evitar dos diálogos superpuestos; cerrar o reemplazar el de inscripción antes de abrir pago, conservando el ID guardado.
- Compartir estado y actualización entre popup, filas, tarjetas y resumen. Refrescar también las rutas públicas por slug, no sólo `/tournaments/[id]`.

## 4. Servidor: cambiar forma de pago y gestionar archivos

Extender el flujo existente, sin crear otra inscripción ni otra tabla de reservas.

- Efectivo → transferencia: validar que se acepta transferencia y guardar alias/importe vigentes para esa nueva elección. Si falla el archivo después del cambio, conservar la inscripción como transferencia pendiente.
- Transferencia → efectivo: validar que efectivo está habilitado y los permisos sobre el comprobante existente. Si se confirma el cambio y había archivo, limpiar ese archivo después de retirar su asociación. No eliminarlo sólo por tocar el selector.
- Reemplazar: subir el nuevo, confirmar que reemplaza al archivo que se estaba viendo y recién entonces eliminar el anterior. Si falla, conservar el anterior. Un archivo nuevo vuelve a pendiente de revisión; no hereda la aprobación anterior.
- Eliminar sólo comprobante: quitar su asociación/fecha/revisión, conservar inscripción, cupo y aprobación de inscripción; después borrar el objeto en Storage.
- Validar en servidor: usuario, pertenencia a pareja o gestión del torneo, archivo, configuración de pago, estado actual y si el comprobante fue aprobado mientras el popup estaba abierto.
- Proteger conflictos: dos pestañas, ambos compañeros, organizador contra jugador, borrado durante subida y respuesta perdida. No borrar un archivo que otro envío acaba de asociar ni repetir escrituras a ciegas.
- Mantener los códigos de intento y logs por paso, sin datos bancarios ni archivos.

Regla conservadora propuesta para un torneo con zonas/partidos ya armados: permitir reemplazar sin dejarlo sin archivo; no permitir al jugador eliminar el archivo o pasar de efectivo a transferencia incompleta dejando una pareja ya asignada sin cumplir la regla. No borrar zonas/partidos automáticamente. Confirmar esta excepción si ese caso aparece en el flujo, porque el usuario confirmó explícitamente la distinción aprobado/pendiente, no esta restricción adicional.

## 5. Limpiar comprobantes al borrar la inscripción

No alcanza con agregar una llamada sólo al botón visible. Revisar cancelación del jugador, eliminación del organizador, rechazo, eliminación desde zonas, borrado de torneo y eliminaciones en cascada.

Puntos conocidos:

- `lib/services/registration/american-tournament-strategy.ts` y `long-tournament-strategy.ts`: hoy borran inscripción sin borrar archivo.
- `app/api/tournaments/actions.ts`, `rejectInscription`: hoy intenta borrar el archivo antes de borrar inscripción; corregir el orden.
- `lib/services/tournament-zone-membership.ts`: también tiene un camino con `deleteInscription`.
- `lib/services/inscription-proofs.ts`: reutilizar eliminación por la API de Storage. No borrar directamente `storage.objects` por SQL.

Confirmar primero el borrado real de la inscripción; luego eliminar su archivo. La inscripción no debe quedar apuntando a un archivo ya eliminado porque falló el DELETE. Si falla la limpieza, guardar un pendiente durable con la ruta mínima necesaria y un reintento definido: un console.warn solo pierde el archivo de vista cuando ya se borró la fila. Preferir un mecanismo existente; si no hay, una cola mínima de limpieza separada del modelo de inscripción, que cubra también cascadas. Documentar cómo se ejecuta el reintento y cómo se verifica que no siga asociado a una inscripción.

Si se cancela mientras se sube, el archivo recién subido y no asociado también debe limpiarse. Una falla de Storage no debe volver a ocupar el cupo ni simular una cancelación nueva. La limpieza de archivos viejos ya huérfanos queda fuera del borrado nuevo: no ejecutar un barrido histórico sin revisar antes sus candidatos.

## 6. Orden de implementación y pruebas

1. Leer AGENTS.md y skills aplicables; revisar cambios existentes y estas interpretaciones. No reiniciar el trabajo anterior ni sobrescribirlo.
2. Implementar permisos y operaciones de archivo/cambio de pago, incluyendo limpieza durable y nueva migración. Probar antes de conectar UI.
3. Construir el popup compartido y el bloque compacto de estado/acción. Reutilizar componentes existentes y branding FV/TPE.
4. Integrar detalle por ID/slug, alta, panel, listado público y organizador.
5. Probar refrescos entre vistas y casos de red; documentar resultados y límites reales.

Casos mínimos:

- Elegir archivo no hace una subida; confirmar la realiza una sola vez.
- Abrir desde todas las entradas lleva al mismo popup y la misma inscripción.
- Ambos miembros de la pareja ven el estado; una cuenta ajena no puede consultar o modificar.
- Efectivo habilitado/deshabilitado, transferencia habilitada/deshabilitada, cambio en ambas direcciones y cierre sin guardar.
- Pendiente editable por jugador; aprobado sólo gestión, incluyendo aprobación concurrente.
- Reemplazo fallido conserva original; reemplazo exitoso elimina original y vuelve a revisión pendiente.
- Eliminar comprobante conserva cupo; cancelar/rechazar/borrar inscripción limpia archivo. Fallo en limpieza queda recuperable.
- Borrado durante subida y dos cambios simultáneos no dejan un archivo vigente eliminado.
- /torneos no vuelve a ofrecer Inscribirme a quien ya está inscripto, aunque esté pendiente o el torneo esté lleno/cerrado.
- No mostrar carga en línea en inscriptions ni repetir un popup por fila.
- Individuales, históricas y torneos sin comprobante conservan su comportamiento; aprobación de inscripción y pago cobrado no cambian por accidente.
- Navegador real: celular/escritorio, PDF/imagen, recarga, volver del banco y respuesta perdida. Android real sigue pendiente si no se dispone de dispositivo.
- Build del tenant, pruebas focalizadas y SQL local; separar fallas previas de nuevas. No declarar limpio TypeScript global si no lo está.

## Destino y publicación

El pedido corresponde a TPE / Elite: remoto `lzowflvgnspjdbvdxliy`, exclusivamente herramientas nombradas para Elite. El código también sirve a FV, por lo que verificar compatibilidad sin activar efectivo por defecto. No usar el proyecto histórico Padel Para Todos.

Este plan no autoriza por sí mismo despliegues, barridos de archivos históricos ni cambios remotos. Preparar implementación y pruebas locales; informar las migraciones necesarias y coordinar publicación. El plan anterior advierte que la primera migración y la aplicación deben publicarse coordinadamente, porque el código viejo no conoce las reservas incompletas.

## Texto para iniciar el otro chat

Implementá `docs/plan-popup-pago-inscripcion.md` sobre los cambios actuales del repositorio. Reutilizá la inscripción recuperable y los logs existentes. Queremos un popup único de pago abierto desde el bloque «Ya estás inscripto», el panel del jugador, /torneos y los botones compactos del organizador; carga explícita con botón, cambios efectivo/transferencia, edición de comprobantes pendientes y limpieza de archivos al borrar la inscripción. Preservá cambios ajenos y las inscripciones anteriores. Leé las interpretaciones y la excepción propuesta para torneos ya armados antes de cerrar los permisos. Probá localmente y no despliegues ni hagas limpieza histórica sin una instrucción posterior.
