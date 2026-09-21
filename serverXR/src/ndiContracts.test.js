// @vitest-environment node

// The contract that matters most about this whole lane: it costs the server NOTHING.
// A real serverXR is booted as a child process with `require('koffi')` rigged to throw —
// the state of a machine that has never installed the optional FFI, which is every CI
// runner and most installs — and it must boot, answer /api/health, and answer /ndi
// honestly without ever loading a native library.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ENTRY = path.join(HERE, 'index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.on('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address()
    probe.close((error) => (error ? reject(error) : resolve(port)))
  })
})

// A --require preload that makes koffi unfindable, whatever is in node_modules.
const NO_KOFFI = `
const Module = require('module')
const load = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'koffi' || request.startsWith('koffi/')) {
    const error = new Error("Cannot find module 'koffi'")
    error.code = 'MODULE_NOT_FOUND'
    throw error
  }
  return load.apply(this, arguments)
}
const resolve = Module._resolveFilename
Module._resolveFilename = function (request) {
  if (request === 'koffi' || request.startsWith('koffi/')) {
    const error = new Error("Cannot find module 'koffi'")
    error.code = 'MODULE_NOT_FOUND'
    throw error
  }
  return resolve.apply(this, arguments)
}
`

let server = null

const startServer = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-ndi-cwd-'))
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-ndi-data-'))
  const preload = path.join(cwd, 'no-koffi.cjs')
  await writeFile(preload, NO_KOFFI)
  const port = await getFreePort()

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'test',
    APP_BASE_PATH: '/serverXR',
    DATA_ROOT: dataRoot,
    API_TOKEN: 'test-token',
    CORS_ORIGINS: '*',
    AUTH_SESSION_SECRET: 'test-session-secret',
    REQUIRE_AUTH: ''
  }
  delete env.SPACES_DIR
  delete env.UPLOADS_DIR

  const child = spawn(process.execPath, ['--require', preload, SERVER_ENTRY], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stdout.on('data', (c) => { logs += c.toString() })
  child.stderr.on('data', (c) => { logs += c.toString() })

  const baseUrl = `http://127.0.0.1:${port}/serverXR`
  const deadline = Date.now() + 20000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the server exited while booting (code ${child.exitCode})\n${logs}`)
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) break
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`the server never became healthy\n${logs}`)
    await wait(200)
  }

  return {
    baseUrl,
    getLogs: () => logs,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM')
        const exited = await Promise.race([new Promise((r) => child.once('exit', r)), wait(3000).then(() => false)])
        if (exited === false && child.exitCode === null) {
          child.kill('SIGKILL')
          await new Promise((r) => child.once('exit', r))
        }
      }
      await rm(cwd, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  }
}

describe('serverXR with no koffi installed', () => {
  beforeAll(async () => { server = await startServer() }, 40000)
  afterAll(async () => { if (server) await server.stop() })

  it('boots and answers /api/health', async () => {
    const res = await fetch(`${server.baseUrl}/api/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status ?? body.ok ?? 'ok').toBeTruthy()
  })

  it('never loaded a native library on the way up', () => {
    // Mounting the lane must not touch koffi. If it did, the preload above would have
    // thrown inside a require the server does not guard, and the boot would be in the log.
    expect(server.getLogs()).not.toMatch(/Cannot find module 'koffi'/)
  })

  it('still answers /ndi/api/summary — honestly, with 200 and available:false', async () => {
    const res = await fetch(`${server.baseUrl}/ndi/api/summary`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(body.reason).toBe('no-koffi')
    expect(body.how).toMatch(/npm install/)
  })

  it('is mounted at the bare /ndi too, the address a wall page uses', async () => {
    const bare = server.baseUrl.replace(/\/serverXR$/, '')
    const res = await fetch(`${bare}/ndi/api/summary`)
    expect(res.status).toBe(200)
    expect((await res.json()).available).toBe(false)
  })

  it('refuses the picture routes without pretending to have a picture', async () => {
    const still = await fetch(`${server.baseUrl}/ndi/api/still?name=td`)
    expect(still.status).toBe(503)
    expect((await still.json()).reason).toBe('no-koffi')

    const mjpg = await fetch(`${server.baseUrl}/ndi/in.mjpg?name=td`)
    expect(mjpg.status).toBe(503)
  })

  it('refuses to SEND a picture without pretending it went anywhere', async () => {
    // A page may post frames to a di.iiii that has no runtime — it cannot know before it
    // asks. The refusal has to name the reason, because "install the NDI runtime" is the
    // whole fix and a bare 503 sends someone hunting through a firewall instead.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01])
    const res = await fetch(`${server.baseUrl}/ndi/out.jpg?name=wall`, {
      method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: jpeg
    })
    expect(res.status).toBe(503)
    expect((await res.json()).reason).toBe('no-koffi')
  })

  it('still lists its outputs — an empty list, honestly', async () => {
    const res = await fetch(`${server.baseUrl}/ndi/api/outputs`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(body.reason).toBe('no-koffi')
    expect(body.outputs).toEqual([])
  })

  it('leaves the rest of the server exactly as it was — /api/config still answers', async () => {
    const res = await fetch(`${server.baseUrl}/api/config`)
    expect(res.status).toBe(200)
  })
})
