// The database must never live inside a git checkout by accident.
//
// serverXR's default DATA_ROOT is `./data` next to the code. In a checkout that
// is <checkout>/serverXR/data/di.db — a database nobody else sees. 24 checkouts
// on aylmo each started that way (2026-10-02 measurement), and real work
// (WCC student projects, Cascade Club, mapfile) was saved only there.
//
// Decision: ~/work/di-atlas-hosting/decisions/2026-10-02-local-hosting.md, step H4.
// Fires only when ALL hold: DATA_ROOT unset or relative, the code runs from a git
// checkout (.git file or dir at the repo root), and it is not under test.
// The installed `di`, Docker and cPanel set an absolute DATA_ROOT and are untouched.

const fs = require('node:fs')
const path = require('node:path')

const isUnderTest = (env) => String(env.NODE_ENV || '').toLowerCase() === 'test' || Boolean(env.VITEST)

const refusal = (reason) => [
  `serverXR refuses to start: ${reason}`,
  'A database inside a git checkout is saved where nobody else sees it, and the work is lost with the folder.',
  'Fix, one of:',
  '  - set an absolute DATA_ROOT (the installed di uses ~/.local/share/di.iiii/data; never write to it from a dev copy)',
  '  - DI_SCRATCH=1 for a throwaway database (wiped by you, never the real one)',
  '  - on aylmo: `di-dev up <tree>` (di-atlas tools/di-dev)',
].join('\n')

/**
 * @returns {{action:'ok'|'scratch'|'refuse', message?:string, dataRoot?:string}}
 */
const evaluateDataRoot = ({ env = process.env, repoRoot, exists = fs.existsSync } = {}) => {
  if (isUnderTest(env)) return { action: 'ok' }
  const raw = String(env.DATA_ROOT || '').trim()
  if (raw && path.isAbsolute(raw)) return { action: 'ok' }
  if (!exists(path.join(repoRoot, '.git'))) return { action: 'ok' }
  const resolved = path.resolve(repoRoot, 'serverXR', raw || 'data')
  if (String(env.DI_SCRATCH || '') === '1') {
    return { action: 'scratch', dataRoot: resolved, message: `SCRATCH database at ${resolved}` }
  }
  const reason = raw
    ? `DATA_ROOT is relative ("${raw}") and this is a git checkout (${repoRoot}).`
    : `DATA_ROOT is not set and this is a git checkout (${repoRoot}), so the default is ${resolved}.`
  return { action: 'refuse', message: refusal(reason) }
}

/** Startup entry: exits 1 with the message, or warns for scratch. */
const enforceDataRoot = (opts = {}) => {
  const repoRoot = opts.repoRoot || path.resolve(__dirname, '..', '..')
  const result = evaluateDataRoot({ ...opts, repoRoot })
  if (result.action === 'refuse') {
    console.error(result.message)
    ;(opts.exit || process.exit)(1)
  } else if (result.action === 'scratch') {
    console.warn(result.message)
  }
  return result
}

module.exports = { evaluateDataRoot, enforceDataRoot }
