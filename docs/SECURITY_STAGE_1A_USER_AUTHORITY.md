# Seguridad: etapa 1A — autoridad de users

Fecha: 13/10/2026. Aplicada y verificada en FV (bfmaqrythlwbfjuqumom) y Elite (lzowflvgnspjdbvdxliy).

## Alcance

La migración 20261013161646_guard_user_authority instala un trigger BEFORE INSERT/UPDATE
en public.users y una función privada SECURITY INVOKER, con search_path vacío.

- Clientes no autorizados no pueden crear ADMIN ni cambiar el rol de una cuenta existente.
- Se bloquea reasignar users.id desde clientes.
- Se permite repetir el rol actual, guardar avatar con UPSERT y completar el perfil propio
  con role NULL a PLAYER. Esto preserva los flujos existentes sin una nueva lectura.
- postgres, service_role, supabase_admin y supabase_auth_admin mantienen su camino confiable.
  No se consulta user_metadata para decidir autoridad.
- Las políticas, grants, lecturas y tablas de torneos/inscripciones no se modifican.
- No se cambiaron roles ni cuentas reales. Las pruebas remotas usan una tabla temporal y ROLLBACK.

También se preparó en el repositorio una validación de roles del registro público:
solo PLAYER, CLUB, COACH y ORGANIZADOR; ADMIN y valores malformados se rechazan antes
de crear el cliente o usuario Auth. Este cambio de aplicación **todavía no se desplegó**.
La protección en base ya opera independientemente de ese despliegue.

## Lo que esta etapa NO resuelve

No es el cierre completo de asignación de privilegios: organization_members sigue abierto,
y se conservan las altas legacy CLUB/COACH/ORGANIZADOR para compatibilidad.
El alta/activación de organizadores, las propiedades de clubes y la autorización de
membresías requieren la etapa 1B. Funciones privilegiadas, datos privados y escrituras
abiertas de torneos/pagos siguen en sus etapas posteriores.

## Verificación

- 16 tests Jest: parser de rol y acción real register rechazando ADMIN/entradas malformadas
  sin invocar clientes ni crear cuentas.
- Suite SQL en bases locales aisladas PostgreSQL 15 y 17.
- La misma suite SQL contra el guard real de FV y Elite, con tabla temporal, RLS equivalente
  y roles anon/authenticated/service_role, seguida de ROLLBACK.
- Cubierto: UPDATE de perfil con mismo PLAYER, avatar UPSERT, rechazo de cambios a
  ADMIN/ORGANIZADOR/CLUB/COACH/NULL, ADMIN por INSERT y UPSERT, cambio de id, propio NULL
  a PLAYER, avatar de ADMIN, perfil ORGANIZADOR, altas normales sin sesión y backend confiable.
- Ambos proyectos tienen exactamente un trigger activo, la misma función
  (md5 b8a1f674bd62000fecd54b0e05481214) y la misma versión de migración.
  La versión registrada por MCP en Elite se alineó con FV y el archivo del repositorio,
  sin reaplicar ni cambiar el guard.
- Asesores de seguridad: sin hallazgos nuevos respecto de la auditoría; los pendientes
  anteriores persisten. Los asesores no reemplazan la prueba del comportamiento del trigger.
- git diff --check: correcto.
- TypeScript global: 376 errores antes y después, ninguno en los archivos de esta etapa.
  Se comparó con register/actions.ts de HEAD mediante un compiler host en memoria, sin
  modificar archivos para obtener la línea base.

No se hizo un recorrido real de Google OAuth/email ni un despliegue de la aplicación:
se validaron las operaciones de base usadas por esos flujos y los rechazos del registro.
No se considera certificado todo el funcionamiento de la app por pasar esta suite.

## Ejecutar pruebas

Jest:

```powershell
npx --no-install jest lib/auth/__tests__/public-registration-role.test.ts 'app/(main)/register/__tests__/role-authorization.test.ts' --runTestsByPath --runInBand
```

SQL: ejecutar supabase/tests/user_authority_guard.sql con psql y ON_ERROR_STOP=1 en una
base aislada donde exista el esquema de la app y esté aplicada esta migración.
Todas las operaciones de datos apuntan a pg_temp.user_authority_probe, nunca a users.
No es una prueba pgTAP ni debe interpretarse como un script para crear usuarios reales.

## Operación y recuperación

La migración no depende de desplegar primero una UI nueva: permite repetir valores del
rol existente y las altas actuales excepto ADMIN público. Una operación administrativa
de cambio de rol debe usar un camino confiable autorizado, no el cliente de sesión normal.

Si aparece una regresión, identificar la operación exacta y corregir su camino/guard de
forma puntual, conservando el rechazo de ADMIN público y de cambios no autorizados.
No desactivar toda la RLS ni abrir el rol como mecanismo general de recuperación.
El trigger es independiente de los algoritmos de torneos y no añade consultas recursivas.
