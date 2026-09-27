#!/usr/bin/env node
// server-env.mjs — write the server's environment for a standby host, derived from the same
// docker-compose.yml prod runs, so the standby cannot drift from prod's variable list.
//
//   node server-env.mjs --compose <docker-compose.yml> [--compose <override.yml> ...] \
//                       --env <the tier's .env> --data-root <dir> [--set KEY=value ...] > server.env
//
// --compose may repeat, in the order `docker compose -f a -f b` takes them: a later file's key
// replaces an earlier one's, as Compose merges a service's environment mapping. The dev tier is
// docker-compose.yml + docker-compose.dev.yml (its DEV_* names); prod is docker-compose.yml alone
// (docker-compose.prod.yml sets no environment).
//
// Every key under services.server.environment is resolved exactly as Compose does it:
// `${VAR:-default}` takes the .env value, or the default when unset or empty; `${VAR:?message}`
// refuses (exit 1, Compose's message) when unset or empty; a literal stays literal. Then the standby's own facts replace three literals: DATA_ROOT is the given dir, HOST
// is 127.0.0.1 (the connector and nginx are on the same machine, nothing else may reach it), and
// NODE_ENV stays production. DI_LOCAL is never written: hosted mode only. --set replaces or
// adds one standby-specific value (e.g. MAX_UPLOAD_MB=95 below a proxy's own body limit).
// Output is `KEY=value` lines for `node --env-file`. Values are never printed anywhere else.
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const sets = []
const composes = []
const args = {}
for (let i = 0; i < argv.length; i += 2) {
  if (!argv[i].startsWith('--') || argv[i + 1] === undefined) { console.error(`bad argument: ${argv[i]}`); process.exit(2) }
  if (argv[i] === '--set') sets.push(argv[i + 1])
  else if (argv[i] === '--compose') composes.push(argv[i + 1])
  else args[argv[i].slice(2)] = argv[i + 1]
}
if (!composes.length) { console.error('missing --compose'); process.exit(2) }
for (const k of ['env', 'data-root']) {
  if (!args[k]) { console.error(`missing --${k}`); process.exit(2) }
}

// services.server.environment of one compose file — the compose files' own indentation: 2 (service),
// 4 (key), 6 (vars). Returns { KEY: raw text }.
function serverEnvironment(file) {
  const raw = {}
  let inServer = false, inEnv = false
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^[^\s#]/.test(line)) { inServer = false; inEnv = false; continue }   // a new top-level key
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(line)) { inServer = line.trim() === 'server:'; inEnv = false; continue }
    if (!inServer) continue
    if (/^ {4}[A-Za-z_]+:/.test(line)) { inEnv = line.trim() === 'environment:'; continue }
    if (!inEnv) continue
    const m = line.match(/^ {6}([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$/)
    if (m) raw[m[1]] = m[2]
  }
  return raw
}
const merged = {}
for (const f of composes) Object.assign(merged, serverEnvironment(f))

// .env: KEY=VALUE, optional surrounding quotes, # comments. Same subset Compose accepts in practice.
const dotenv = {}
for (const line of readFileSync(args.env, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (!m) continue
  let v = m[2].trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  dotenv[m[1]] = v
}

// resolve each merged key as Compose does: ${VAR:-default} (unset or empty → default),
// ${VAR:?message} (unset or empty → refuse, with Compose's own message), a literal stays literal
const env = {}
for (const [k, raw] of Object.entries(merged)) {
  const ref = raw.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:-|:\?)(.*))?\}$/)
  if (!ref) { env[k] = raw; continue }
  const v = dotenv[ref[1]] ?? ''
  if (v !== '') env[k] = v
  else if (ref[2] === ':?') { console.error(`${k}: ${ref[1]} is required (${ref[3]})`); process.exit(1) }
  else env[k] = ref[3] ?? ''
}
if (!env.NODE_ENV || !env.APP_BASE_PATH || !('AUTH_SESSION_SECRET' in env)) {
  console.error('did not find services.server.environment in the compose file'); process.exit(1)
}

env.NODE_ENV = 'production'
env.DATA_ROOT = args['data-root']
env.HOST = '127.0.0.1'
for (const kv of sets) {
  const m = kv.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (!m || ['NODE_ENV', 'DI_LOCAL', 'HOST'].includes(m[1])) { console.error(`--set refused: ${kv.split('=')[0]}`); process.exit(2) }
  env[m[1]] = m[2]
}
delete env.DI_LOCAL

const missing = ['AUTH_SESSION_SECRET'].filter((k) => !env[k])
if (missing.length) { console.error(`required and empty: ${missing.join(', ')}`); process.exit(1) }

for (const [k, v] of Object.entries(env)) {
  // node --env-file does not unescape \\ or \", so a value is written raw, quoted only when it
  // must be, and refused when no quoting could carry it unchanged
  if (/[\r\n]/.test(v)) { console.error(`${k} holds a newline; node --env-file cannot carry it`); process.exit(1) }
  let out = v
  if (/[\s#'"`$\\]/.test(v)) {
    if (!/["\\]/.test(v)) out = `"${v}"`
    else if (!/'/.test(v)) out = `'${v}'`
    else { console.error(`${k} holds both quote kinds; cannot write it unchanged`); process.exit(1) }
  }
  process.stdout.write(`${k}=${out}\n`)
}
console.error(`server-env: ${Object.keys(env).length} variables written (values not shown)`)
