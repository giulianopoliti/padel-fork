# Jugadores sueltos: resultado de la fase 2

Fecha: 16 de octubre de 2026. Implementación y verificación **locales**. No se desplegó código, no se ejecutaron migraciones remotas y no se activó el directorio de fases 3–4. Los cambios locales anteriores de fase 1 se conservaron.

## Emparejamiento y cupos

`RegistrationService.convertIndividualToCouple` y `acceptTournamentRequest` usan una sola transacción PostgreSQL, `confirm_tournament_pair`. El emparejamiento administrativo existente y las conversiones LONG/AMERICAN delegan a ese servicio. El organizador también puede unir jugadores sin solicitud o inscripción individual previa.

La transacción comprueba gestión efectiva o destinatario, vínculos de cuentas/perfiles, estado actual, cupo, duplicados, género, categoría competitiva cuando corresponde, forma de pago y restricciones TPE. Registra actor y origen, reutiliza/crea la pareja, guarda la inscripción y consume los individuales históricos de esos jugadores, incluyendo duplicados, sin tocar otros torneos. La inicialización deportiva de perfiles no categorizados mantiene la regla existente; ocurre al confirmar y se revierte si falla el alta. No se cambia el ranking de perfiles ya categorizados ni al publicar.

La migración agrega `pairing_source` y `paired_by_user_id` a `inscriptions`. Los clientes no pueden falsificar esos campos al insertar ni modificarlos posteriormente. Un reintento de aceptación o del mismo emparejamiento administrativo devuelve la inscripción canónica. Si una aceptación ya fue cancelada, no vuelve a crearla automáticamente.

Los INSERT de pareja del formulario habitual también consumen sus individuales y cierran las publicaciones de ese torneo e invalidan las solicitudes incompatibles en la misma transacción. La publicación general y otros torneos se conservan. Al cancelar la pareja no se republica ningún aviso.

Bloqueos: fila del torneo → ámbito social 702 → cupo/pagos 701. El trigger `a_solo_pair_scope_lock` debe conservar su orden anterior a `inscription_payment_guard`; las actualizaciones de pagos mantienen sus bloqueos actuales. No se modifica la fila del torneo dentro de la confirmación: la sincronización visual del cupo se hace después del commit.

## Contrato para las fases siguientes

- `pairIndividualPlayers(tournamentId, player1Id, player2Id)` autentica y confirma mediante el servicio como organizador. Retorna `success`, `inscriptionId`, `coupleId`, `inscription` y `message`.
- `acceptSoloPlayerTournamentRequest(requestId, { termsAccepted, paymentMethod? })` es la entrada de aceptación competitiva. Lee la solicitud con la sesión/RLS, comprueba destinatario y vuelve a validar dentro de la transacción. `paymentMethod` admite `CASH` o `TRANSFER` cuando el torneo lo permite.
- Los wrappers de conversión anteriores aceptan opciones de términos, pago y alta administrativa. Sus permisos se verifican en base; enviar `isOrganizerRegistration=true` no concede gestión.
- `confirm_tournament_pair` y su implementación privada sólo permiten ejecución a `service_role`. El servicio obtiene actor y tenant en servidor; un navegador no puede llamar esta RPC con una identidad o tenant inventados. No usarla desde un cliente público.
- El RPC autenticado original `resolve_solo_player_request` conserva aceptación general para compartir contacto. La aceptación de torneo por ese RPC sigue deshabilitada expresamente; debe pasar por la entrada de servidor anterior.
- TPE AMERICAN comprueba términos `2026-08-28` y guarda la aceptación de ambos participantes en la misma transacción. Una nueva versión requiere actualizar esta comprobación junto con `lib/tpe/terms.ts`. El organizador conserva la excepción explícita de restricciones con su auditoría.
- Los tipos del RPC están en `types/solo-players.ts`. El resultado de aceptación conserva la inscripción para abrir el popup de pago en fase 4.

## Pagos, asignación e inicio

La inscripción queda guardada y reserva cupo antes de adjuntar la seña. Conserva aprobación del organizador, efectivo permitido y comprobante como requisitos separados. Se reutiliza el pago retomable: **una sola seña por pareja**. Un adjunto simultáneo no se transforma en reemplazo por un refresco; el perdedor recibe `409`, código `proof_already_attached` y «Tu compañero ya adjuntó un comprobante». Los reemplazos explícitos mantienen revisión y controles existentes. No se agregaron comprobantes individuales.

La aprobación y el pago llaman a `reconcileCompleteInscriptions`, igual que la confirmación. LONG usa membresía canónica y espejo `zone_couples`; AMERICAN de zona única usa `ensureAmericanSingleZone`; multizona conserva el pool para armado. También se considera diferida una falla del espejo. No se regeneran partidos ni resultados.

Si la asignación falla, la inscripción, su aprobación y el comprobante se conservan. Las respuestas y avisos muestran «Pendiente de asignación». Una actualización administrativa del listado reintenta; también existe el botón «Reintentar asignaciones», protegido por permisos. Las fases cerradas no reciben nuevas membresías desde la reconciliación.

Se eliminaron los bloqueos por individuales de ambos botones y del endpoint de inicio. Un individual histórico sin archivo tampoco bloquea el trigger SQL ni los contadores de comprobantes. Se conserva el bloqueo global por **parejas** TRANSFER sin archivo, los mínimos de parejas y los controles existentes de cupo/llaves. No se altera la revisión independiente de comprobantes ni las casillas de cobro.

## Verificación ejecutada

- **127 pruebas Jest, 16 suites aprobadas.** Incluyen servicio/autenticación, aprobación/comprobante en ambos órdenes, recuperación de membresía y espejo, LONG, ambos modos AMERICAN con el resolver real, inicio con sueltos, pagos, capacidad, categorías, mensajes y privacidad de fase 1.
- **53 assertions pgTAP de fase 2 y seis carreras PostgreSQL aprobadas.** Último cupo administrativo, doble aceptación, aceptación contra organizador en ambos órdenes, alta habitual contra aceptación y cierre durante confirmación. También cubren restricciones/términos TPE, pausa, vencimiento, categoría, rollback deportivo, bajas y falsificación de auditoría.
- **Regresión de fase 1: 83 assertions y cuatro carreras aprobadas**, con el esquema de fase 2 instalado.
- **Concurrencia de pagos real en PostgreSQL local aprobada:** un adjunto ganador, rechazo de adjunto posterior y reemplazo explícito con revisión vigente; también competencia de reemplazos y tickets de limpieza.
- `git diff --check`: sin errores. TypeScript global sigue fallando con **374 diagnósticos** en archivos ajenos a esta fase; no hay diagnósticos en los archivos modificados/nuevos de fase 2. No se declara build exitoso.
- Advisors locales: 188 advertencias heredadas, ninguna sobre objetos nuevos del módulo. La revisión de código independiente detectó y se corrigieron tratamiento de error tras commit, altas administrativas sin históricos, inicialización deportiva y falsificación del actor de auditoría.

No se ejecutaron recorrido de navegador, build de producción, entrega real de emails ni reset completo de la cadena histórica de migraciones. Las verificaciones de UI, emails y publicación integradas siguen en fases 3–5. Los límites de privacidad heredada y validación autoritativa de publicación/solicitud descritos en fase 1 siguen pendientes antes de activar públicamente el directorio; la entrada de confirmación de fase 2 sí tiene su límite de servidor restringido.

## Reproducción local

Después de aplicar **localmente** fase 1, aplicar fase 2 al contenedor de pruebas ya existente:

```powershell
Get-Content -Raw supabase/migrations/20261016172951_solo_players_phase_two.sql | docker exec -i supabase_db_padel-base-main-test psql -X -U postgres -d postgres --single-transaction -v ON_ERROR_STOP=1
node scripts/test-solo-pairing-local.mjs
node scripts/test-solo-players-local.mjs
node supabase/tests/payment-popup-concurrency.mjs
```

Los dos primeros runners fijan `supabase_db_padel-base-main-test`; el de pagos fija `supabase_db_padel-elite-local`. No aceptan URL remota. Sus fixtures aleatorias se revierten/eliminan. La migración fue creada con `supabase migration new`; el propietario conserva exclusivamente su despliegue remoto por CI/CD.

Referencias revisadas: [funciones y privilegios](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [changelog](https://supabase.com/changelog).
