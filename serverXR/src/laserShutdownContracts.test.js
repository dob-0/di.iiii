// @vitest-environment node

// The lasers when the server goes down. A real serverXR is booted with one LaserCube address — a UDP
// socket in this test standing in for the cube on 127.0.0.1:45457 — and then sent SIGTERM (and, in
// the second case, SIGINT). The cube must hear output-off twice before the process ends, and the
// process must still end by the signal, as it did before the lasers had a say.
// Spec of the stop: serverXR/src/laser/laserEngine.js (rule 8), index.js (stopLasersThenExit).
import dgram from 'node:dgram'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ENTRY = path.join(HERE, 'index.js')
const CMD_PORT = 45457

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.on('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address()
    probe.close((error) => (error ? reject(error) : resolve(port)))
  })
})

// The stand-in cube: records what reaches its command port.
const fakeCube = () => new Promise((resolve, reject) => {
  const heard = []
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  socket.on('error', reject)
  socket.on('message', (msg) => heard.push([...msg]))
  socket.bind(CMD_PORT, '127.0.0.1', () => resolve({ heard, close: () => new Promise((r) => socket.close(r)) }))
})

const cleanups = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()() })

const bootWithOneCube = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-laser-down-cwd-'))
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-laser-down-data-'))
  await mkdir(path.join(dataRoot, 'laser'), { recursive: true })
  await writeFile(path.join(dataRoot, 'laser', 'laser.json'), JSON.stringify({ cubes: [{ id: 'cube-1', ip: '127.0.0.1' }] }))
  const port = await getFreePort()
  const env = { ...process.env, PORT: String(port), DATA_ROOT: dataRoot, DI_LOCAL: '1', AUTH_SESSION_SECRET: 'laser-down-secret' }
  delete env.NODE_ENV
  delete env.SPACES_DIR
  delete env.UPLOADS_DIR
  const child = spawn(process.execPath, [SERVER_ENTRY], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  cleanups.push(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await rm(cwd, { recursive: true, force: true })
    await rm(dataRoot, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 25000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the server exited while booting (code ${child.exitCode})\n${logs}`)
    try { if ((await fetch(`${base}/api/health`)).ok) break } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`the server never became healthy\n${logs}`)
    await wait(200)
  }
  return { child, base, exited, logs: () => logs }
}

describe('the lasers when serverXR goes down', () => {
  for (const signal of ['SIGTERM', 'SIGINT']) {
    it(`${signal}: the cube hears output-off twice, then the process ends by the signal`, async () => {
      const cube = await fakeCube()
      cleanups.push(cube.close)
      const { child, base, exited, logs } = await bootWithOneCube()
      // First use builds the engine: the info question goes out, nothing else.
      const state = await (await fetch(`${base}/laser/api/state`)).json()
      expect(state).toMatchObject({ armed: false, sim: false })
      for (let i = 0; i < 20 && !cube.heard.length; i += 1) await wait(50)
      expect(cube.heard).toContainEqual([0x77])
      cube.heard.length = 0
      child.kill(signal)
      const end = await Promise.race([exited, wait(5000).then(() => null)])
      expect(end, `the server did not end on ${signal}\n${logs()}`).toEqual({ code: null, signal })
      expect(cube.heard.filter((m) => m[0] === 0x80)).toEqual([[0x80, 0], [0x80, 0]])
    }, 40000)
  }
})
