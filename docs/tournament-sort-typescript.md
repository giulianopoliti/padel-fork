# Orden de torneos en TypeScript

Cada base contiene un único tenant. `tenant_tournament_list_settings` se identifica
solo por `surface` (`panel` o `my-tournaments`). `organization_members` controla
quién puede modificar la configuración, sin seleccionar configuraciones distintas.

`lib/tournaments/tournament-sort-values.ts` calcula los valores en las escrituras:

- SINGLE: número de categoría.
- RANGE: menor de las dos categorías.
- MIXED_SUM: suma / 2; SUMA13 = 6.5, SUMA14 = 7.
- Estado: NOT_STARTED = 1, ZONE_PHASE = 2, BRACKET_PHASE = 3.
- Datos desconocidos: null, al final en ambos sentidos.

La base guarda columnas normales (`category_sort_value`, `status_sort_value`).
Los listados ordenan antes de paginar; los siguientes criterios y el ID resuelven
empates. No se introducen funciones ni triggers de cálculo en PostgreSQL.

## Despliegue por el propietario

AGENTS.md prohíbe ejecutar migraciones en remoto desde el agente. Estos cambios
deben desplegarse mediante el CI/CD del propietario, para FV y Elite por separado.

1. Aplicar `20261014225421_prepare_typescript_tournament_sort.sql`. Agrega las
   columnas normales y transforma la configuración a una fila por pantalla.
   Si existen varias configuraciones para una pantalla, conserva la más reciente.
2. Ejecutar el recálculo TypeScript antes de habilitar los nuevos listados:

   ```powershell
   npx tsx scripts/backfill-tournament-sort-values.ts --tenant=padel-fv
   npx tsx scripts/backfill-tournament-sort-values.ts --tenant=padel-fv --apply
   npx tsx scripts/backfill-tournament-sort-values.ts --tenant=padel-elite
   npx tsx scripts/backfill-tournament-sort-values.ts --tenant=padel-elite --apply
   ```

   Usar `--env-file=<archivo>` si el runner de CI utiliza un archivo distinto.
   El script verifica el project ref antes de conectar, recorre toda la base y
   actualiza solo filas cuya categoría y estado siguen coincidiendo con la lectura.
   Repetir `--apply` después del despliegue permite reconciliar cambios realizados
   durante la transición; no escribe filas que ya tienen el valor correcto.
3. Publicar el código TypeScript junto con el cambio de configuración. Coordinar
   este paso con la migración preparatoria: los consumidores anteriores esperaban
   `organization_id` en la tabla de configuración.
4. Aplicar `20261014225423_remove_database_tournament_sort_logic.sql` cuando ya no
   haya consumidores de las columnas anteriores. Elimina ambas columnas generadas
   y las funciones anteriores. No ejecutar la limpieza antes de actualizar el código.

La primera migración histórica se conserva porque ya fue aplicada; las dos nuevas
migraciones son su corrección. No borrar ni reescribir el historial desplegado.

## Verificación local

La lógica se verifica con Jest. También hay una validación local de migraciones
y RLS que no se conecta a Supabase ni requiere Docker:

```powershell
npm install --prefix "$env:TEMP\padel-sort-pg-validation" --no-audit --no-fund @electric-sql/pglite@0.5.10
npx tsx scripts/verify-tournament-sort-migrations.mjs --runtime-dir="$env:TEMP\padel-sort-pg-validation"
```

Este runtime es únicamente para verificación local y no es una dependencia de la app.
El test verifica conservación de preferencias, permisos y ausencia de las funciones
y columnas calculadas anteriores.

Las correcciones directas de categoría/estado por SQL no recalculan los valores.
Después de una importación externa, ejecutar el script TypeScript de recálculo.
