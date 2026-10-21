import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

// Fixed local services only. Fixtures and regression tests never reach the main DB.
const container = 'supabase_db_padel-base-main-test'
const database = `americano_format_${randomUUID().replaceAll('-', '')}`
assert.match(database, /^americano_format_[a-f0-9]{32}$/)
const exec = (command, input = '') => execFileSync('docker', ['exec', '-i', container, 'bash', '-o', 'pipefail', '-c',
  `export PGPASSWORD="$POSTGRES_PASSWORD"; ${command}`], { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
const sql = (input) => exec(`psql -X -qAt -U supabase_admin -d ${database} -v ON_ERROR_STOP=1`,
  `set statement_timeout='15s'; set client_min_messages=warning; ${input}`)
const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')
let created = false
try {
  exec(`createdb -U supabase_admin ${database}`)
  created = true
  exec(`pg_dump -U supabase_admin -d postgres --schema-only --no-owner --no-publications --no-subscriptions | psql -X -q -U supabase_admin -d ${database} -v ON_ERROR_STOP=1`)
  sql(`begin; ${read('../supabase/migrations/20261021202643_americano_libre_allow_format_switch_before_bracket.sql')} commit;`)
  const originalOutput = sql(read('../supabase/tests/americano_libre_phase_one.test.sql'))
  console.log(originalOutput)
  assert.doesNotMatch(originalOutput, /(?:^|\n)not ok\b/, originalOutput)
  const prelude = read('../supabase/tests/americano_libre_phase_one.test.sql').split('\nselect ok(not has_function_privilege')[0]
    .replace('select no_plan();', '').replaceAll('pg_temp.', 'american_free_test.')
    .replace('begin;', 'begin; create schema american_free_test; grant usage on schema american_free_test to authenticated,service_role;')
  sql(`${prelude} commit;`)
  const output = sql(read('../supabase/tests/americano_libre_format_switch.test.sql'))
  console.log(output)
  assert.doesNotMatch(output, /(?:^|\n)not ok\b/, output)
} finally {
  if (created) exec(`dropdb -U supabase_admin ${database}`)
}
