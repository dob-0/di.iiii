// @vitest-environment node

// The catalogue must describe the server as it IS. A real serverXR is booted,
// its live router is walked, and every route must have exactly one entry and
// every entry a route. This is what makes the agent door grow with the
// platform: adding a route and forgetting to describe it fails here, the same
// day, and not months later when an agent cannot find it.
//
// Spec: docs/architecture/SPEC_agent_door.md §4.
import { mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ENTRY = path.join(HERE, 'index.js')
const ADMIN = 'catalogue-admin-token'
const VIEWER = 'catalogue-viewer-token'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.on('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address()
    probe.close((error) => (error ? reject(error) : resolve(port)))
  })
})

let server

beforeAll(async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-catalogue-cwd-'))
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-catalogue-data-'))
  const port = await getFreePort()
  const env = {
    ...process.env,
    PORT: String(port),
    APP_BASE_PATH: '/serverXR',
    DATA_ROOT: dataRoot,
    ADMIN_API_TOKEN: ADMIN,
    VIEWER_API_TOKEN: VIEWER,
    AUTH_SESSION_SECRET: 'catalogue-session-secret',
    REQUIRE_AUTH: 'true',
    CORS_ORIGINS: '*'
  }
  delete env.API_TOKEN
  delete env.SPACES_DIR
  delete env.UPLOADS_DIR
  const child = spawn(process.execPath, [SERVER_ENTRY], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })
  const baseUrl = `http://127.0.0.1:${port}/serverXR`
  const deadline = Date.now() + 25000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the server exited while booting (code ${child.exitCode})\n${logs}`)
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) break
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`the server never became healthy\n${logs}`)
    await wait(200)
  }
  server = {
    baseUrl,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM')
        await Promise.race([new Promise((r) => child.once('exit', r)), wait(3000)])
        if (child.exitCode === null) child.kill('SIGKILL')
      }
      await rm(cwd, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  }
}, 40000)

afterAll(async () => { await server?.stop() })

const get = (route, token) => fetch(`${server.baseUrl}${route}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {}
})

describe('the catalogue describes the live server', () => {
  it('has an entry for every live route and a route for every entry', async () => {
    const res = await get('/api/catalogue?all=1', ADMIN)
    expect(res.status).toBe(200)
    const coverage = (await res.json())['x-di-coverage']
    // Named lists, not counts, so a failure says WHICH route to describe.
    expect(coverage.undeclared, 'live routes with no catalogue entry — describe them in serverXR/src/catalogue/entries/').toEqual([])
    expect(coverage.stale, 'entries for routes the server no longer answers — delete them').toEqual([])
    expect(coverage.invalid, 'entries that break the rules in serverXR/src/catalogue/index.js').toEqual([])
    expect(coverage.counts.live).toBeGreaterThan(100)
  })

  it('refuses the full list, and the coverage, to anyone but an admin', async () => {
    expect((await get('/api/catalogue?all=1', VIEWER)).status).toBe(403)
  })

  it('shows a viewer only what the agent door is open for, at their role', async () => {
    const res = await get('/api/catalogue', VIEWER)
    expect(res.status).toBe(200)
    const doc = await res.json()
    expect(doc.openapi).toBe('3.1.0')
    expect(doc['x-di-coverage']).toBeUndefined()
    const ops = Object.values(doc.paths).flatMap((methods) => Object.values(methods))
    expect(ops.length).toBeGreaterThan(0)
    for (const op of ops) {
      expect(op['x-di-agent']).toBe(true)
      expect(['guest', 'viewer']).toContain(op['x-di-role'])
    }
  })
})
