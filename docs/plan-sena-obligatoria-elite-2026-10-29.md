# Plan de seña y reserva de cupo — Padel Elite

## Ejecución completada el 29/10/2026

Tras la instrucción del propietario de implementar el plan, se actualizaron por MCP los 11 torneos revisados en `lzowflvgnspjdbvdxliy`. Una transacción de actualización de datos verificó previamente su identidad, organización, estado y configuración, y comprobó la política resultante antes de confirmar. No se ejecutaron migraciones ni cambios de esquema.

- Los 11 quedaron con `enable_transfer_proof=true`, `reserve_slot_without_proof=false` y `allow_cash_payment=false`.
- CABALLEROS 6TA del 31/10 quedó con alias `padelelite2026` e importe $35.000 por pareja. En los otros 10 se conservaron alias e importes.
- La lectura posterior confirmó la configuración de los 11 y la conservación por torneo de los cupos existentes: 31 parejas, incluidas 14 con cupo sin comprobante.
- Se guardaron instantáneas locales en `elite-sena-config-antes-2026-10-29.json` y `elite-sena-config-despues-2026-10-29.json`, en esta misma carpeta.
- La nueva política se aplica a nuevas inscripciones de esos torneos. Se conservan las excepciones administrativas ya previstas y no se modificaron valores predeterminados para torneos que se creen después.
- Verificación realizada: lecturas remotas antes/después y validación de configuración y conteos. No se crearon inscripciones de prueba en producción ni se ejecutó una prueba de navegador con pago real.

El resto del documento conserva el diagnóstico previo y el plan que se implementó.

Revisión: 29/10/2026, fechas en America/Argentina/Buenos_Aires.
Fuente: consultas de solo lectura por MCP `supabase-elite`, proyecto `lzowflvgnspjdbvdxliy`, y revisión del código local. No se modificaron datos remotos ni se ejecutaron migraciones. El código local puede incluir cambios todavía no publicados; la lógica de cupos indicada abajo también se verificó en las funciones remotas.

## Alcance

11 torneos publicados, no de prueba, con estado `NOT_STARTED` y fecha local de inicio desde el 29/10/2026. Todos pertenecen a la organización `f274a0d7-b5c1-4c87-992b-bd66dcec77db`.

Se excluye el torneo cancelado AMERICANO CABALLEROS 6TA/7MA del 29/10. Existen torneos con fechas anteriores que conservan `NOT_STARTED`: no deben entrar en una actualización basada solamente en el estado. No aparecieron torneos posteriores al 01/11 en esta consulta.

## Configuración e inscripciones actuales

Todos los 11 torneos tienen `reserve_slot_without_proof=true`, `allow_cash_payment=false` y `validate_inscriptions=false`.
En los 10 que solicitan seña, el alias es `padelelite2026`. Los importes son por pareja según el formulario del proyecto.

| Inicio local | Torneo | Solicita seña | Importe configurado | Parejas con cupo | Con comprobante | Con cupo sin comprobante |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 29/10 22:30 | CABALLEROS 7MA/8VA | Sí | $30.000 | 2 | 1 | 1 |
| 29/10 22:30 | MIXTO SUMA 11/12 | Sí | $35.000 | 5 | 3 | 2 |
| 30/10 22:30 | CABALLEROS 5TA / 6TA | Sí | $35.000 | 1 | 1 | 0 |
| 31/10 16:00 | CABALLEROS 6TA | No | Sin configurar | 1 | 0 | 1 |
| 31/10 16:00 | DAMAS 6TA | Sí | $35.000 | 9 | 6 | 3 |
| 31/10 17:00 | CABALLEROS 7MA | Sí | $35.000 | 2 | 1 | 1 |
| 01/11 15:30 | DAMAS 5TA | Sí | $35.000 | 3 | 1 | 2 |
| 01/11 17:00 | DAMAS 7MA/8VA | Sí | $35.000 | 4 | 2 | 2 |
| 01/11 19:30 | CABALLEROS 4TA | Sí | $35.000 | 1 | 1 | 0 |
| 01/11 19:30 | CABALLEROS 7MA / 8VA | Sí | $30.000 | 3 | 1 | 2 |
| 01/11 21:00 | CABALLEROS 6TA / 7MA | Sí | $35.000 | 0 | 0 | 0 |
| **Total** | | | | **31** | **17** | **14** |

No hay inscripciones individuales, pagos marcados como efectivo ni excepciones de comprobante entre estas 31 parejas. La pareja de CABALLEROS 6TA del 31/10 tiene `payment_method=null`; las otras 30 tienen medio de pago definido.

## Comportamiento ya disponible

- `enable_transfer_proof=true`, `reserve_slot_without_proof=false` y `allow_cash_payment=false` implementan el flujo público solicitado: guardar la inscripción sin cupo y asignarlo al subir el comprobante, si queda disponibilidad y la fase permite admitir parejas.
- Adjuntar comprobante no verifica el movimiento bancario. La revisión del comprobante es una operación distinta; no se exige su aprobación previa para obtener cupo.
- Cambiar la configuración no retira cupos existentes. La función remota `inscription_private.guard_registration_capacity` conserva `occupies_slot=true` en actualizaciones, incluso si después se elimina el comprobante.
- El organizador conserva excepciones: altas administrativas, admisión sin comprobante y efectivo gestionado por el organizador. La política pública no elimina estas facultades.
- La aplicación permite guardar la solicitud antes del comprobante. Impedir incluso guardar una solicitud sería una modificación adicional del producto.

## Plan de ejecución

1. **Cerrar las dos decisiones de negocio pendientes.** Confirmar alias e importe para CABALLEROS 6TA del 31/10; propuesta: alias `padelelite2026` e importe $35.000 por pareja, en línea con los otros torneos de esa categoría. Conservar los importes ya configurados en los otros 10. Definir si las 14 parejas previas conservan su lugar o si se requiere un tratamiento retroactivo. Recomendación operativa: conservar sus cupos y aplicar la nueva regla a las nuevas inscripciones; cualquier retiro necesita un plan específico porque hay lugares ya confirmados.
2. **Tomar una nueva instantánea antes de ejecutar.** Releer los 11 IDs y guardar su configuración anterior para reversión. Revalidar organización, estado, fecha local, borrador/prueba y cambios ocurridos desde esta revisión. Separar cualquier torneo que ya haya comenzado.
3. **Actualizar solamente la configuración de los torneos vigentes.** Establecer `enable_transfer_proof=true`, `reserve_slot_without_proof=false`, `allow_cash_payment=false`; completar alias e importe faltantes en el torneo señalado. Usar la operación existente de configuración para aprovechar validación y revalidación de páginas. Si se elige una actualización administrativa de datos, conservar validación equivalente y refrescar la aplicación. No tocar comprobantes, estados de revisión ni inscripciones existentes en esta etapa.
4. **Resolver por separado el alcance retroactivo, si se solicita.** No alcanza con editar el torneo ni con intentar bajar `occupies_slot` directamente: el guard remoto conserva los lugares ya obtenidos. Diseñar y validar localmente una operación autorizada que contemple zonas, partidos, pagos existentes, concurrencia y notificaciones. Revisar además el medio de pago nulo de la pareja del 31/10 antes de exigirle comprobante. Si esa operación requiere migración, prepararla localmente; el propietario la despliega por CI/CD conforme a AGENTS.md.
5. **Verificar.** Reconsultar que los torneos elegibles tienen la configuración objetivo y los importes correctos. En pruebas locales: inscripción pública sin comprobante no consume cupo; subida con lugar disponible lo asigna; dos subidas simultáneas no exceden capacidad; comprobante sin disponibilidad no promete lugar; el jugador no puede elegir efectivo; las excepciones del organizador siguen el alcance acordado. Revisar mensajes de inscripción y disponibilidad en la aplicación de Elite.
6. **Reversión y continuidad.** Restaurar únicamente configuraciones desde la instantánea si fuera necesario; restaurar la política anterior no reasigna cupos automáticamente. Cambiar los torneos existentes tampoco establece un valor predeterminado para los que se creen después: si se desea esa continuidad, preparar aparte un cambio limitado a Elite en creación/duplicación, con verificación de que FV conserva su comportamiento.

No hace falta una migración para ajustar la configuración de las nuevas inscripciones: los campos y la lógica necesarios ya existen en Elite.

## Identificadores de los torneos revisados

| ID | Torneo e inicio |
| --- | --- |
| `a0bff299-c214-4c18-aae9-c8954cba6e88` | CABALLEROS 7MA/8VA — 29/10 22:30 |
| `8c4b81bb-f956-4ae5-bed0-d9b745f83ab5` | MIXTO SUMA 11/12 — 29/10 22:30 |
| `069e1597-b317-4af7-8863-9131cb21559c` | CABALLEROS 5TA / 6TA — 30/10 22:30 |
| `ac47a4e1-9ef8-42d8-ac35-c2071046fb02` | CABALLEROS 6TA — 31/10 16:00 |
| `66905470-7715-4ec5-9d00-213e1fb73b5f` | DAMAS 6TA — 31/10 16:00 |
| `2802b487-0670-48e6-8aa1-6f334a393b1b` | CABALLEROS 7MA — 31/10 17:00 |
| `74025631-dc5b-4915-bfff-620336dcae2e` | DAMAS 5TA — 01/11 15:30 |
| `9818601a-a0ed-4197-9e24-4e53f387ce76` | DAMAS 7MA/8VA — 01/11 17:00 |
| `c00a84bb-91cc-48c2-a8e9-5a6859c6042d` | CABALLEROS 4TA — 01/11 19:30 |
| `c27c3c18-91a1-4afb-b610-67243dc6292f` | CABALLEROS 7MA / 8VA — 01/11 19:30 |
| `eeaa12ae-96b8-4d70-bb0e-c3feac19fd1a` | CABALLEROS 6TA / 7MA — 01/11 21:00 |

## Referencias de implementación

- `components/tournament/registration-policy-fields.tsx`: opciones públicas, importe por pareja y aviso de conservación de cupos.
- `app/api/tournaments/[id]/inscription-settings/route.ts`: validación, actualización y revalidación.
- `lib/tournaments/inscription-state.ts`: presentación de inscripción, comprobante y cupo.
- Funciones remotas inspeccionadas: `inscription_private.normalize_registration_policy` y `inscription_private.guard_registration_capacity`.
