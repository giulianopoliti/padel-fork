param(
  [string]$DatabaseName = ('schedule_sharing_qa_' + (Get-Date -Format 'yyyyMMddHHmmss')),
  [switch]$BootstrapOnly
)
$ErrorActionPreference = 'Stop'
$containerName = 'supabase_db_padel-base-main-test'
if ($DatabaseName -notmatch '^schedule_sharing_qa_[a-z0-9_]+$') { throw 'Use a dedicated schedule_sharing_qa_* database.' }
$existingDatabase = & docker exec $containerName psql -X -U postgres -d postgres -At -c "select 1 from pg_database where datname = '$DatabaseName'"
if ($LASTEXITCODE -ne 0) { throw 'Local Postgres is not available.' }
if ($existingDatabase -eq '1') { throw 'The QA database already exists; choose a new name. Existing databases are never reset.' }
$schemaFile = Join-Path $env:TEMP ($DatabaseName + '_schema.sql')
$restoreLog = Join-Path $env:TEMP ($DatabaseName + '_restore.log')
# Schema only. Never copy tournament/player/auth data into the test database.
& docker exec $containerName pg_dump -U postgres -d postgres --schema-only --no-owner |
  Set-Content -LiteralPath $schemaFile -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Could not read the local reference schema.' }
& docker exec $containerName createdb -U postgres --template template0 $DatabaseName
if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated local QA database.' }
# Some Supabase dumps omit public because an extension owns it. Keep the empty
# template schema unless the dump explicitly recreates it.
if ((Get-Content -Raw -LiteralPath $schemaFile) -match '(?m)^CREATE SCHEMA public;\r?$') {
  & docker exec $containerName psql -X -U postgres -d $DatabaseName -v ON_ERROR_STOP=1 -c 'drop schema public;'
  if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the newly created empty QA database.' }
}
Get-Content -Raw -LiteralPath $schemaFile |
  & docker exec -i $containerName sh -c 'env PGPASSWORD="$POSTGRES_PASSWORD" psql -X -w -U supabase_admin -d "$1" -v ON_ERROR_STOP=1' sh $DatabaseName *> $restoreLog
if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath $restoreLog -Tail 20; throw 'Schema-only restore failed.' }
# Platform auth/realtime functions carry superuser-only settings. The local
# bootstrap role owns the clone; tests explicitly SET ROLE authenticated/anon.
Write-Output "Isolated local database: $DatabaseName"
if ($BootstrapOnly) { exit 0 }
$repoRoot = Split-Path -Parent $PSScriptRoot
$installedSchema = & docker exec $containerName psql -X -U postgres -d $DatabaseName -At -c "select to_regprocedure('public.schedule_sharing_schema_version()') is not null"
if ($LASTEXITCODE -ne 0) { throw 'Could not check the cloned schema.' }
$migrationFiles = @()
if ($installedSchema -eq 'f') { $migrationFiles += '20261105170244_schedule_sharing_atomic_create.sql' }
$migrationFiles += '20261106184355_schedule_workspace_destination_filters.sql'
foreach ($migrationFile in $migrationFiles) {
  Get-Content -Raw -LiteralPath (Join-Path $repoRoot "supabase/migrations/$migrationFile") |
    & docker exec -i $containerName sh -c 'env PGPASSWORD="$POSTGRES_PASSWORD" psql -X -w -U supabase_admin -d "$1" -v ON_ERROR_STOP=1 -q' sh $DatabaseName
  if ($LASTEXITCODE -ne 0) { throw "Local migration validation failed for $migrationFile." }
}
$testPath = Join-Path $repoRoot 'supabase/tests/schedule_sharing.sql'
Get-Content -Raw -LiteralPath $testPath |
  & docker exec -i $containerName sh -c 'env PGPASSWORD="$POSTGRES_PASSWORD" psql -X -w -U supabase_admin -d "$1" -v ON_ERROR_STOP=1 -q' sh $DatabaseName
if ($LASTEXITCODE -ne 0) { throw 'Local schedule-sharing tests failed.' }
Write-Output 'Schedule-sharing database checks passed. The isolated QA database is preserved for inspection.'
