import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

// No configurable target: cannot run against a remote database.
const child = spawn('docker', ['exec', '-i', 'supabase_db_padel-base-main-test', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'])
let stdout = '', stderr = ''
child.stdout.on('data', data => { stdout += data })
child.stderr.on('data', data => { stderr += data })
const completed = new Promise(resolve => child.on('close', code => resolve(code)))
child.stdin.end(await readFile(new URL('../supabase/tests/solo_players_phase_four.test.sql', import.meta.url), 'utf8'))
assert.equal(await completed, 0, stderr)
assert.doesNotMatch(stdout, /(?:^|\n)not ok\b/, stdout)
const total = stdout.match(/(?:^|\n)1\.\.(\d+)/)?.[1]
assert.ok(total, stdout)
console.log(`Phase 4 PostgreSQL: ${total} pgTAP assertions passed`)
