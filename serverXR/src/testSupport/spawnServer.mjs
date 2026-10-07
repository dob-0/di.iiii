// Boot a real serverXR child for a contract test and return only when THAT child
// says it is listening.
//
// Why not "ask a free port, then poll /api/health": the port is released before
// the child binds it, so a sibling test file (vitest runs files in parallel) can
// take it in between -- and then the health poll is answered by the SIBLING's
// server, the test talks to the wrong instance (other token, other REQUIRE_AUTH)
// and fails with a 401 where a 201 was expected. Waiting for the child's own
// listen line proves it owns the port; a child that lost the race dies with
// EADDRINUSE, and only that is retried, on a fresh port.
import net from 'node:net'
import { spawn } from 'node:child_process'

const READY_LINE = 'Server running. Listening on:'

export const getFreePort = () => new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        server.close((error) => (error ? reject(error) : resolve(port)))
    })
})

// A child that is still running. Only an exit ends one on its own; a server that never said it was listening has not exited.
const stopChild = (child) => {
    if (child.exitCode !== null || child.signalCode !== null) return
    try { child.kill('SIGKILL') } catch { /* already gone */ }
}

const waitForReady = (child, state, readyTimeoutMs) => new Promise((resolve, reject) => {
    const cleanup = () => {
        clearTimeout(guard)
        child.stdout.off('data', check)
        child.off('exit', onExit)
    }
    const check = () => {
        if (state.stdout.includes(READY_LINE)) { cleanup(); resolve() }
    }
    const onExit = () => { cleanup(); reject(new Error(`Server exited early.\n${state.logs()}`)) }
    // A failure guard, not a wait: a server that never binds is reported with its logs.
    const guard = setTimeout(() => { cleanup(); reject(new Error(`Server did not become ready in time.\n${state.logs()}`)) }, readyTimeoutMs)
    child.stdout.on('data', check)
    child.once('exit', onExit)
    check()
})

export const spawnServerUntilReady = async ({ entry, cwd, env, readyTimeoutMs = 15000 }) => {
    const state = { stdout: '', stderr: '', logs: () => `STDOUT:\n${state.stdout}\nSTDERR:\n${state.stderr}` }
    for (let attempt = 1; ; attempt += 1) {
        const port = await getFreePort()
        state.stdout = ''
        state.stderr = ''
        const child = spawn(process.execPath, [entry], {
            cwd,
            env: { ...env, PORT: String(port) },
            stdio: ['ignore', 'pipe', 'pipe']
        })
        child.stdout.on('data', (chunk) => { state.stdout += chunk.toString() })
        child.stderr.on('data', (chunk) => { state.stderr += chunk.toString() })
        try {
            await waitForReady(child, state, readyTimeoutMs)
            return { child, port, logs: state.logs }
        } catch (error) {
            // The guard fired on a server that is still running: the caller gets an Error and no child handle, so nothing
            // would ever stop it — it outlived the test run (an orphan serverXR seen running for 22 minutes), and the retry
            // below would start the next one beside it.
            stopChild(child)
            if (attempt < 3 && /EADDRINUSE/.test(`${state.stdout}${state.stderr}`)) continue
            throw error
        }
    }
}
