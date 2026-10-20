# Jugadores sueltos: resultado de la fase 1

Fecha: 16 de octubre de 2026.

Estado: base de datos y acceso nuevos implementados y validados localmente. Sin activación del directorio ni despliegue remoto. El cierre para activación sigue pendiente por los permisos heredados de perfiles y la validación autoritativa de términos/tenant, descritos abajo.

El agente de backend/Supabase trabajó con GPT-6.1 Sol y razonamiento `xhigh`, siguiendo el plan actualizado. Esta entrega no adelanta el emparejamiento competitivo de la fase 2 ni los comprobantes individuales del roadmap.

## Base nueva

La migración `20261016170034_solo_players_phase_one.sql` agrega publicaciones, solicitudes y notificaciones, más dos tablas privadas de contacto. Los RPC verifican identidad y autorización; los clientes no pueden escribir directamente en las tablas nuevas. Las vistas de directorio y solicitudes respetan RLS y calculan disponibilidad/vencimiento sin depender de una tarea periódica.

El [contrato de datos](contrato-jugadores-sueltos-fase-1.md) documenta filas, vistas, RPC, permisos, vencimientos, orden de bloqueos, bajas y comandos de verificación local. Los tipos están en `types/solo-players.ts`.

Una aceptación general comparte contacto entre los participantes y no crea parejas ni inscripciones. La aceptación de torneo devuelve una operación no disponible hasta implementar la transacción de la fase 2. La consulta administrativa de individuales históricos conserva todos sus IDs sin publicar avisos automáticamente.

## Cambios en la aplicación existente

- El endpoint de inscripciones filtra los perfiles antes de responder a usuarios sin gestión. Conserva nombres y datos deportivos; excluye teléfono, DNI, email y otros campos fuera de una lista explícita.
- La página de inscripciones aplica el mismo filtro a las parejas, individuales y catálogo de jugadores que envía como propiedades al navegador. Ocultar sólo la columna en la pantalla no bastaba.
- Los gestores conservan la información necesaria para administrar sus inscripciones.
- El endpoint normaliza relaciones de Supabase devueltas como objeto o arreglo, incluyendo relaciones anidadas vacías.

## Privacidad heredada: pendiente antes de activar el directorio

El nuevo contacto es independiente de `players.phone` y queda protegido en un esquema privado. Esto no cambia los permisos históricos de perfiles.

La base local aún conserva `players_public_select USING (true)` y permisos amplios de lectura/escritura sobre `players`. Existen otros Server Actions y vistas, entre ellos `getAllPlayersDTO`, `getPlayerById` y `user_details_v`, que requieren una revisión coordinada antes de prometer privacidad global. Los números/DNI ya guardados en perfiles pueden seguir accesibles por esos caminos. Esta entrega no los borra, no los copia a publicaciones ni altera el ranking.

Por lo tanto, el filtrado agregado cierra las dos respuestas de inscripciones revisadas, pero no debe presentarse como una corrección global de perfiles. Antes de habilitar el directorio hay que limitar las consultas directas, acciones y vistas antiguas, preservando registro, perfil propio y gestión autorizada. Los consumidores nuevos deben usar exclusivamente el contrato de publicaciones/contacto y no recuperar teléfonos desde `players`.

También falta comprobar autoritativamente la versión vigente de términos y las restricciones de cada tenant antes de activar el flujo. Las RPC actuales exigen consentimiento de contacto y una versión de términos no vacía; un wrapper de servidor no impide por sí solo llamadas directas de usuarios autenticados. Esa validación debe quedar dentro de las RPC o restringirse su ejecución al límite servidor autorizado, como detalla el contrato.

## Verificación

- Jest: 14 pruebas aprobadas en las suites de privacidad de perfiles, endpoint/SSR y visibilidad de inscripciones. Cubren espectadores, jugadores activos/eliminados, gestión y relaciones anidadas.
- TypeScript global: no pasa; la última ejecución produjo 375 diagnósticos del proyecto, sin diagnósticos en los archivos modificados o nuevos de esta fase. La normalización de relaciones resolvió el diagnóstico previo del endpoint. No se considera una compilación exitosa ni una garantía de ausencia de errores generales.
- Auditoría independiente de PostgreSQL local: RLS habilitado en cinco tablas; lectura anónima y escrituras de clientes denegadas; contactos sin lectura directa; vistas con `security_invoker`; RPC públicos revisados sin ejecución anónima y con `search_path` vacío.
- PostgreSQL: **83 assertions pgTAP y cuatro escenarios de concurrencia aprobados**, ejecutados nuevamente durante la integración. Cubren publicaciones duplicadas, solicitudes inversas, aceptación contra retiro y cierre de torneo durante envío sin deadlock. El runner `node scripts/test-solo-players-local.mjs` fija el contenedor local, detecta assertions fallidas y limpia sus fixtures.
- La referencia a inscripción usa `ON DELETE SET NULL`; una baja conserva la solicitud y no reactiva publicaciones. Los datos sociales dependientes se eliminan en cascada al borrar torneo, cuenta o perfil. No se borraron datos históricos durante la implementación.
- Advisors locales: el agente encontró 188 hallazgos heredados y ninguno sobre los objetos nuevos del módulo. No se ejecutó un reset completo de la cadena histórica de migraciones ni pruebas de UI/email; esas verificaciones no se declaran realizadas.

No se ejecutaron migraciones, mutaciones ni pruebas contra Supabase remoto. El propietario conserva el despliegue de migraciones mediante su CI/CD.
