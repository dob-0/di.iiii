/**
 * Running di.iiii as one plain Node process — the default path.
 *
 * One process, one port: serverXR serves both the API and the built app via
 * CLIENT_DIR. No Vite, no second port, no build on the artist's machine.
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { isWindows, paths, versionLayout } from './paths.mjs'
import { probeHealth } from './probe.mjs'
import { currentVersionDir, readEnv, readState } from './state.mjs'

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/** The node binary to run the server with: the one we vendored, else the system one. */
export const nodeBinary = (home) => {
    const p = paths(home)
    const vendored = isWindows
        ? path.join(p.nodeRuntime, 'node.exe')
        : path.join(p.nodeRuntime, 'bin', 'node')
    if (fs.existsSync(vendored)) return vendored
    return process.execPath
}

const readPid = (home) => {
    try {
        const pid = Number(fs.readFileSync(paths(home).pidFile, 'utf8').trim())
        return Number.isFinite(pid) && pid > 0 ? pid : null
    } catch {
        return null
    }
}

const pidAlive = (pid) => {
    if (!pid) return false
    try {
        // Signal 0 tests for existence without touching the process.
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

export const isRunning = (home) => pidAlive(readPid(home))

export const start = async ({ home, port, host = '127.0.0.1', verbose = false }) => {
    const p = paths(home)
    const versionDir = currentVersionDir(home)
    if (!versionDir) throw new Error('not installed')
    const layout = versionLayout(versionDir)

    await fsp.mkdir(p.data, { recursive: true })
    await fsp.mkdir(p.logs, { recursive: true })
    await fsp.mkdir(p.run, { recursive: true })

    const logStream = fs.openSync(p.serverLog, 'a')
    // Detached on every OS, and unref'd on every OS. Windows was the exception
    // here and that is exactly what hung `di up`: without detach+unref the
    // parent node keeps a handle on the child, so the CLI never exits, so cmd
    // never gives the artist their prompt back — the server is up and the
    // terminal looks frozen. windowsHide stops the detached child from opening
    // a console window of its own.
    const child = spawn(nodeBinary(home), [layout.serverEntry], {
        cwd: layout.server,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', logStream, logStream],
        env: {
            ...process.env,
            ...readEnv(home),
            PORT: String(port),
            HOST: host,
            APP_BASE_PATH: '/serverXR',
            CLIENT_DIR: layout.client,
            DATA_ROOT: p.data,
            // A local install is one person on their own machine. Auth off is
            // what makes it usable without an account; loopback-only binding
            // above is what keeps that from meaning "the café can edit it".
            REQUIRE_AUTH: 'false',
            NODE_ENV: 'production',
            // NODE_ENV=production would otherwise close the local-operator
            // gate (agent board, local claude chat) on a personal install.
            // Loopback binding above is still what keeps it local-only.
            DI_LOCAL: '1'
        }
    })

    child.unref()
    await fsp.writeFile(p.pidFile, String(child.pid))

    if (verbose) process.stdout.write(`[di] pid ${child.pid}, log ${p.serverLog}\n`)

    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
        if (await probeHealth(port, host)) return { pid: child.pid, port, host }
        if (!pidAlive(child.pid)) {
            const tail = await readLog(home, 20)
            throw new Error(`the server stopped while starting.\n${tail}`)
        }
        await wait(300)
    }
    throw new Error('the server did not answer in time — see: di logs')
}

export const stop = async ({ home }) => {
    const pid = readPid(home)
    if (!pidAlive(pid)) {
        await fsp.rm(paths(home).pidFile, { force: true })
        return false
    }
    try {
        if (isWindows) {
            spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'])
        } else {
            process.kill(pid, 'SIGTERM')
        }
    } catch {
        // already gone
    }
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
        if (!pidAlive(pid)) break
        await wait(200)
    }
    if (pidAlive(pid)) {
        try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
    }
    await fsp.rm(paths(home).pidFile, { force: true })
    return true
}

export const readLog = async (home, lines = 200) => {
    try {
        const raw = await fsp.readFile(paths(home).serverLog, 'utf8')
        return raw.split('\n').slice(-lines).join('\n')
    } catch {
        return ''
    }
}

export const followLog = (home) => {
    const file = paths(home).serverLog
    const child = spawn(isWindows ? 'powershell' : 'tail',
        isWindows ? ['-Command', `Get-Content -Path "${file}" -Wait -Tail 200`] : ['-n', '200', '-f', file],
        { stdio: 'inherit' })
    return child
}

export const describe = (home) => ({
    mode: 'node',
    version: readState(home).version || null,
    dataDir: paths(home).data
})
