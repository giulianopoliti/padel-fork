# Clonar un torneo de producción a Supabase local

El script `clone_tournament_to_local.mjs` reconstruye el grafo operativo de un torneo puntual conservando sus UUIDs. Sirve tanto para formatos American como LONG: detecta por datos y no por `format_type`.

```powershell
npx tsx scripts/clone_tournament_to_local.mjs `
  --tournament-id=<UUID_DEL_TORNEO> `
  --source-env=.env.padel-fv.local

# Si el resumen es correcto:
npx tsx scripts/clone_tournament_to_local.mjs `
  --tournament-id=<UUID_DEL_TORNEO> `
  --source-env=.env.padel-fv.local `
  --apply
```

El destino es exclusivamente el Postgres del Docker local. El comando aborta si el UUID del torneo ya existe, y toda la escritura se ejecuta dentro de una única transacción.

Además del torneo, copia jugadores, parejas, inscripciones, zonas, posiciones, seeds, llaves, partidos, sets, resultados, programación, disponibilidad, pagos, ranking, descalificaciones y resolución de placeholders. También incorpora las dependencias mínimas de club, categoría, organización y servicios.

No copia `auth.users`, identidades ni hashes de contraseñas: la API de Auth no permite recuperar hashes de forma segura. Por eso las referencias a usuarios en auditoría/aprobaciones se guardan como `NULL`; los jugadores, parejas y todo el grafo deportivo se conservan con sus IDs reales. Para probar login local, crear usuarios locales y asociarlos a los jugadores después del clonado.

Usá siempre el env del tenant fuente de este repositorio (`.env.padel-fv.local` o el env del tenant TPE); no se admite ningún proyecto externo. El script no usa el proyecto actualmente linkeado por el CLI para leer producción.
