// @vitest-environment node

// H4 (audit 2026-10-09): a signal used to end the server mid-write. A real server is
// booted on a temp data folder, written to, sent SIGTERM, and must exit 0 inside the
// deadline leaving a database that opens clean with no write-ahead file behind
// (SQLite WAL: https://sqlite.org/wal.html#ckpt).
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createShutdown, createInflight } = require('./gracefulShutdown')
const http = require('node:http')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.on('error', reject)
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)) })
})
const findDb = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.db')) return path.join(entry.parentPath || entry.path, entry.name)
  }
  return null
}

describe('serverXR stops in order on SIGTERM', () => {
  it('exits 0 within the deadline and leaves a clean database', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-shutdown-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-shutdown-data-'))
    const port = await freePort()
    const env = { ...process.env, PORT: String(port), APP_BASE_PATH: '/serverXR', DATA_ROOT: dataRoot, REQUIRE_AUTH: 'false' }
    for (const k of ['API_TOKEN', 'SPACES_DIR', 'UPLOADS_DIR', 'ADMIN_API_TOKEN', 'VIEWER_API_TOKEN']) delete env[k]
    const child = spawn(process.execPath, [path.join(HERE, 'index.js')], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let logs = ''
    child.stdout.on('data', (c) => { logs += c })
    child.stderr.on('data', (c) => { logs += c })
    const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })))
    try {
      const deadline = Date.now() + 30000
      for (;;) {
        if (child.exitCode !== null) throw new Error(`exited while booting\n${logs}`)
        try { const r = await fetch(`http://127.0.0.1:${port}/serverXR/api/health`); if (r.ok) break } catch { /* not up */ }
        if (Date.now() > deadline) throw new Error(`never became healthy\n${logs}`)
        await wait(150)
      }
      const dbPath = await findDb(dataRoot)
      expect(dbPath).toBeTruthy()
      // a write that lands in the write-ahead log
      const other = new DatabaseSync(dbPath)
      other.exec('PRAGMA busy_timeout = 5000')
      other.prepare('INSERT OR REPLACE INTO migrations (key, completed_at) VALUES (?, ?)').run('shutdown-test', Date.now())
      other.close()
      const t0 = Date.now()
      child.kill('SIGTERM')
      const result = await Promise.race([exited, wait(12000).then(() => ({ code: 'timeout' }))])
      const took = Date.now() - t0
      expect(result, logs).toEqual({ code: 0, signal: null })
      expect(took).toBeLessThan(10000)
      const files = await readdir(path.dirname(dbPath))
      const wal = files.filter((f) => f.endsWith('.db-wal'))
      for (const f of wal) expect((await stat(path.join(path.dirname(dbPath), f))).size, `${f} not empty`).toBe(0)
      const reopened = new DatabaseSync(dbPath)
      expect(reopened.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok')
      expect(reopened.prepare('SELECT key FROM migrations WHERE key = ?').get('shutdown-test')).toBeTruthy()
      reopened.close()
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL')
      await rm(cwd, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  }, 60000)
})

describe('createShutdown (unit)', () => {
  const quiet = { info() {}, warn() {}, error() {} }
  it('closes the server, checkpoints, closes the db, exits 0, once', async () => {
    const calls = []
    const server = { close: (cb) => { calls.push('close'); setImmediate(cb) } }
    const done = new Promise((resolve) => {
      const run = createShutdown({
        server, logger: quiet,
        checkpoint: () => calls.push('checkpoint'), closeDb: () => calls.push('closeDb'),
        exit: (code) => { calls.push(`exit ${code}`); resolve() }
      })
      run('SIGTERM'); run('SIGTERM')
    })
    await done
    expect(calls).toEqual(['close', 'checkpoint', 'closeDb', 'exit 0'])
  })
  it('exits non-zero and says why when the stop hangs', async () => {
    const errors = []
    const code = await new Promise((resolve) => {
      createShutdown({
        server: { close: () => {} }, logger: { ...quiet, error: (m) => errors.push(m) },
        hardTimeoutMs: 50, drainMs: 5000, exit: resolve
      })('SIGTERM')
    })
    expect(code).toBe(1)
    expect(errors.join()).toContain('still running 50 ms')
  })
  it('exits 1 when the checkpoint fails', async () => {
    const code = await new Promise((resolve) => {
      createShutdown({
        server: { close: (cb) => cb() }, logger: quiet,
        checkpoint: () => { throw new Error('locked') }, exit: resolve
      })('SIGINT')
    })
    expect(code).toBe(1)
  })
})

describe('a request in flight at SIGTERM finishes before the database closes', () => {
  it('lands its write, then exits 0 with an intact database', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-inflight-'))
    const dbPath = path.join(dir, 'x.db')
    const db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL; CREATE TABLE t (n INTEGER)')
    const inflight = createInflight()
    const server = http.createServer((req, res) => {
      inflight.middleware(req, res, async () => {
        db.prepare('INSERT INTO t VALUES (1)').run()
        await wait(1500) // async work continues after the signal
        db.prepare('INSERT INTO t VALUES (2)').run() // throws if the db was closed under it
        res.end('ok')
      })
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address()
    const quiet = { info() {}, warn() {}, error() {} }
    let exitCode
    const exited = new Promise((resolve) => {
      const run = createShutdown({
        server, inflight, logger: quiet,
        checkpoint: () => db.exec('PRAGMA wal_checkpoint(TRUNCATE)'),
        closeDb: () => db.close(),
        exit: (c) => { exitCode = c; resolve() }
      })
      setTimeout(() => run('SIGTERM'), 300)
    })
    const response = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.text()).catch((e) => `ERR ${e.message}`)
    await exited
    expect(response).toBe('ok')
    expect(exitCode).toBe(0)
    const check = new DatabaseSync(dbPath)
    expect(check.prepare('SELECT count(*) AS c FROM t').get().c).toBe(2)
    expect(check.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok')
    check.close()
    await rm(dir, { recursive: true, force: true })
  }, 20000)

  it('exits 1 and logs how many were in flight when the deadline hits', async () => {
    const errors = []
    const code = await new Promise((resolve) => {
      createShutdown({
        server: { close: () => {} }, inflight: { count: () => 3 },
        logger: { info() {}, warn() {}, error: (m) => errors.push(m) },
        hardTimeoutMs: 100, drainMs: 20, exit: resolve
      })('SIGTERM')
    })
    expect(code).toBe(1)
    expect(errors.join()).toContain('3 request(s) in flight')
  })
})
