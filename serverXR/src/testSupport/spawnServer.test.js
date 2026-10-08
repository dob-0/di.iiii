// @vitest-environment node
//
// spawnServerUntilReady returns the child only when it says it is listening. When it does NOT — the 15 s guard fires on a
// slow, loaded machine — it used to throw and leave that server RUNNING: the caller gets an Error and no child handle, so
// nothing could stop it, and it kept going after the test run ended (an orphan serverXR seen running for 22 minutes on the
// laptop with the fan fault). The EADDRINUSE retry made it worse: it started the next server beside the one it had not stopped.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnServerUntilReady } from './spawnServer.mjs'

let dir
let pidFile

// A stand-in server: alive, writes its pid down, and never prints the line that says it is listening.
const STUB = `
import fs from 'node:fs'
fs.appendFileSync(process.env.PIDFILE, process.pid + '\\n')
if (process.env.STUB_SAYS) console.error(process.env.STUB_SAYS)
setInterval(() => {}, 1000)
`

const pidsSeen = () => (fs.existsSync(pidFile) ? fs.readFileSync(pidFile, 'utf8').split('\n').filter(Boolean).map(Number) : [])
const alive = (pid) => {
    try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}
const gone = async (pids, ms = 4000) => {
    const until = Date.now() + ms
    while (Date.now() < until) {
        if (pids.every((pid) => !alive(pid))) return true
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return pids.every((pid) => !alive(pid))
}

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-spawn-'))
    pidFile = path.join(dir, 'pids')
    fs.writeFileSync(path.join(dir, 'stub-server.mjs'), STUB)
})
afterEach(() => {
    // Whatever the test saw, never leave a stub running — a failing run must not leak either.
    for (const pid of pidsSeen()) { try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ } }
    fs.rmSync(dir, { recursive: true, force: true })
})

const spawnStub = (extraEnv = {}) => spawnServerUntilReady({
    entry: path.join(dir, 'stub-server.mjs'),
    cwd: dir,
    env: { ...process.env, PIDFILE: pidFile, ...extraEnv },
    readyTimeoutMs: 400
})

describe('spawnServerUntilReady when the server never says it is listening', () => {
    it('reports it with its logs and stops the server it started', async () => {
        await expect(spawnStub()).rejects.toThrow(/did not become ready in time/)
        const pids = pidsSeen()
        expect(pids).toHaveLength(1)
        expect(await gone(pids)).toBe(true)
    }, 15000)

    it('does not leave one server behind per EADDRINUSE retry', async () => {
        await expect(spawnStub({ STUB_SAYS: 'Error: listen EADDRINUSE: address already in use :::4000' }))
            .rejects.toThrow(/did not become ready in time/)
        const pids = pidsSeen()
        expect(pids).toHaveLength(3) // the three attempts the loop allows
        expect(await gone(pids)).toBe(true)
    }, 15000)

    it('still hands back a server that is listening (unchanged path)', async () => {
        fs.writeFileSync(path.join(dir, 'ready-server.mjs'), `
import fs from 'node:fs'
fs.appendFileSync(process.env.PIDFILE, process.pid + '\\n')
console.log('Server running. Listening on: http://127.0.0.1:' + process.env.PORT)
setInterval(() => {}, 1000)
`)
        const { child, port } = await spawnServerUntilReady({
            entry: path.join(dir, 'ready-server.mjs'),
            cwd: dir,
            env: { ...process.env, PIDFILE: pidFile },
            readyTimeoutMs: 5000
        })
        expect(Number.isInteger(port) && port > 0).toBe(true)
        expect(alive(child.pid)).toBe(true) // the caller owns it and stops it
        child.kill('SIGKILL')
    })
})
