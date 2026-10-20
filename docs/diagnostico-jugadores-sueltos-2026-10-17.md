# Diagnóstico de Jugadores sueltos — 17/10/2026

**Listo para QA local. Todavía no listo para producción.** Las fases 1–4 tienen implementación y pruebas locales. Falta la revisión integrada de fase 5 y cerrar los límites de activación documentados desde fase 1. No se desplegó código ni se ejecutaron migraciones remotas. El propietario hace QA manual y luego despliega por su procedimiento.

**Actualización posterior al QA:** se remodelaron las pantallas, la campana y la gestión del organizador, y se agregó `/notificaciones` y el perfil deportivo `/players/[id]`. El build local ya no se bloquea por `NODE_ENV=production`: exige flag habilitado y Supabase local. Ver [ajustes y verificación](ajustes-jugadores-sueltos-qa-2026-10-17.md).

## Qué ya funciona y se verificó

- Publicar, editar, pausar y retirar búsquedas generales o de torneo; filtros y consentimiento de contacto.
- Enviar, aceptar, rechazar y retirar solicitudes; bandeja, historial, contador y lectura.
- Aceptación general: sólo comparte contacto entre participantes. Aceptación competitiva: usa el servicio de inscripción existente, controla cupo y conserva aprobación/comprobante/efectivo y una sola seña por pareja.
- Avisos persistentes, worker de email con reservas y reintentos y una tarea periódica compartida. La notificación permanece si falla el proveedor.
- 109 pruebas Jest en 12 suites; 30 assertions SQL nuevas; regresiones de fases 1–2 con 136 assertions SQL y diez escenarios concurrentes; pruebas HTTP contra PostgreSQL local y recorrido FV en escritorio/móvil.
- En navegador se comprobó envío y retiro, aceptación general, contacto autorizado y aceptación AMERICAN con apertura del popup pendiente de comprobante/aprobación.

El detalle y las limitaciones están en [resultado de fase 4](resultado-jugadores-sueltos-fase-4.md). Estos resultados no equivalen a una certificación de producción ni a QA manual completo de ambos tenants.

## Qué falta antes de producción

1. **Privacidad heredada de perfiles.** La base local conserva `players_public_select USING (true)` y caminos antiguos como `user_details_v`, `getAllPlayersDTO` y `getPlayerById`. El nuevo contacto está protegido, pero falta revisar y limitar esos caminos sin romper perfil propio ni gestión autorizada.
2. **Términos y restricciones autoritativos.** El servidor valida versión/tenant, pero las RPC autenticadas heredadas siguen requiriendo revisión para que una llamada directa no pueda evitar esas reglas. La validación debe quedar en base o en un límite servidor cuya ejecución esté restringida.
3. **Revisión integrada de fase 5.** Ambos tenants; LONG, AMERICAN de una/múltiples zonas; todas las combinaciones de aprobación/comprobante/efectivo; últimos cupos, bajas, cierre, individuales históricos y asignación de zonas. Ya hay pruebas de varios casos, pero falta cerrar el conjunto como entrega integrada.
4. **Correos reales.** Verificar remitente, enlaces y recepción en cuentas de prueba controladas FV/TPE. Se probaron fallos y reintentos con proveedor simulado y persistencia real; no hubo envíos reales.
5. **Preparación de publicación.** Revisar configuración por tenant, frecuencia de cron y habilitación del módulo. El bloqueo de backend remoto sigue activo: cambiar el flag no basta para publicar. Sí se admite `build/start` contra Supabase local para QA.

El chequeo TypeScript final del 17/10 arroja **374 errores heredados**, sin diagnósticos en el módulo nuevo. ESLint sigue sin estar instalado. No hay un build de producción exitoso declarado para esta entrega.

## QA local recomendado ahora

Supabase local FV está en el puerto 8011; las migraciones de las tres fases de base están instaladas en ese contenedor de pruebas. Las cuentas ficticias de verificación se eliminan al terminar. Los archivos de entorno locales de FV/Elite apuntan a backend local y se habilitó el flag de preview para el QA del propietario. Elite usa su instancia local separada y requiere preparar allí las migraciones antes de probar el módulo.

En el archivo de entorno del tenant que se quiera probar (`.env.padel-fv.local` o `.env.padel-elite.local`), conservar las URL/claves **locales** y configurar:

```dotenv
NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW=true
EMAIL_ENABLED=false
SOLO_PLAYERS_EMAIL_DELIVERY=
```

Reiniciar Next después de modificar el flag. Para FV:

```powershell
npm run dev:fv -- -p 3043
```

Para Elite, detener FV y ejecutar `npm run dev:elite -- -p 3043`. Abrir `http://localhost:3043/jugadores-sueltos`. Las notificaciones están en `/notificaciones`; las solicitudes en `/jugadores-sueltos?vista=solicitudes`. Usar dos cuentas locales de jugador en sesiones separadas y una cuenta local de organizador. Las cuentas de prueba temporales del agente ya no existen.

Recorrido mínimo:

1. Publicar con teléfono oculto; desde otra cuenta comprobar que no se ve antes de aceptar. Confirmar WhatsApp de ayuda desde `organizaciones.phone` del tenant.
2. Solicitar contacto general, revisar campana/email deshabilitado, aceptar y ver contacto sólo entre ambas cuentas; comprobar que no se crea inscripción.
3. Repetir con rechazo y retiro; revisar activos, historial y lectura de notificaciones.
4. Publicar para torneo y aceptar: comprobar una sola inscripción y la combinación esperada de aprobación, comprobante y efectivo. Completar los requisitos y verificar asignación de zona.
5. Repetir en móvil y en el otro tenant. Revisar cupo lleno, torneo cerrado y bajas sin republicación automática.

Con Next en el puerto 3043 también se pueden repetir los runners HTTP:

```powershell
node scripts/test-solo-directory-local.mjs
node scripts/test-solo-requests-local.mjs
```

Ambos fijan el backend local y eliminan únicamente sus propias fixtures. Mantener el envío de email deshabilitado durante esos runners.

**Decisión recomendada:** empezar el QA local y cerrar fase 5 antes de considerar el despliegue manual. La fase 6 (comprobantes individuales por jugador) sigue fuera de esta entrega.
