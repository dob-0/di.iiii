#!/usr/bin/env node
/**
 * scripts/rig/start-member.mjs — usage:
 *
 *   node scripts/rig/start-member.mjs --dir <checkoutDir> [--port 0] [--host 127.0.0.1]
 *     [--data-root <dir>] [--room <name>] [--key <secret>] [--name <machineName>]
 *   node scripts/rig/start-member.mjs --stop <pid>
 *
 * Starts a real serverXR (`<dir>/serverXR/src/index.js`) the way a plain
 * `di up` install does — see scripts/di/runner-node.mjs, which this mirrors:
 * DI_LOCAL=1, NODE_ENV=production, HOST/PORT, APP_BASE_PATH=/serverXR,
 * CLIENT_DIR when dist/ exists, a fresh temp DATA_ROOT unless one is given.
 * `<dir>` can be a git checkout/worktree root OR an unpacked `npm run
 * di:pack` tarball's stage directory (`di-runtime-<version>/`) — both put
 * the server at `<dir>/serverXR/src/index.js` (scripts/di/paths.mjs
 * versionLayout()), so the same launcher works for either.
 *
 * On the CLI this prints one JSON line `{ "base", "pid" }` once
 * `/serverXR/api/health` answers, then stays attached until SIGINT/SIGTERM
 * (which stops the child and removes an auto-created temp DATA_ROOT).
 * `--stop <pid>` sends SIGTERM to a pid started this way, best-effort.
 *
 * Imported (by compat-grid.mjs): `startMember(opts) -> { base, pid, dir,
 * port, host, dataRoot, stop() }` — `stop()` is the handle-friendly version
 * of `--stop`, and also cleans up the temp DATA_ROOT it created.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { freePort, waitForHealth } from './lib.mjs'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const readTail = (file, lines = 40) => {
    try {
        const raw = fs.readFileSync(file, 'utf8')
        return raw.split('\n').slice(-lines).join('\n')
    } catch {
        return '(no log)'
    }
}

/**
 * Starts one serverXR from `dir`. Returns a handle once /api/health answers,
 * or throws with the tail of the server's own log.
 */
export const startMember = async ({
    dir,
    port,
    host = '127.0.0.1',
    dataRoot,
    room,
    key,
    name,
    part,
    extraEnv = {},
    timeoutMs = 30000
} = {}) => {
    if (!dir) throw new Error('startMember: dir is required')
    const resolvedDir = path.resolve(dir)
    const serverEntry = path.join(resolvedDir, 'serverXR', 'src', 'index.js')
    if (!fs.existsSync(serverEntry)) {
        throw new Error(`no serverXR/src/index.js under ${resolvedDir} — not a checkout or a di:pack stage dir`)
    }
    const clientDir = path.join(resolvedDir, 'dist')
    const hasClientDir = fs.existsSync(path.join(clientDir, 'index.html'))

    const resolvedPort = port && port !== 0 ? port : await freePort()
    let ownsDataRoot = false
    let resolvedDataRoot = dataRoot
    if (!resolvedDataRoot) {
        resolvedDataRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-rig-member-'))
        ownsDataRoot = true
    } else {
        await fsp.mkdir(resolvedDataRoot, { recursive: true })
    }
    const logFile = path.join(resolvedDataRoot, 'rig-member.log')
    const logFd = fs.openSync(logFile, 'a')

    const rawEnv = {
        ...process.env,
        PORT: String(resolvedPort),
        HOST: host,
        APP_BASE_PATH: '/serverXR',
        DATA_ROOT: resolvedDataRoot,
        DI_LOCAL: '1',
        NODE_ENV: 'production',
        REQUIRE_AUTH: 'false',
        AUTH_SESSION_COOKIE_SECURE: 'false',
        ...(hasClientDir ? { CLIENT_DIR: clientDir } : {}),
        ...(room !== undefined && room !== null ? { DI_RIG_ROOM: String(room) } : {}),
        ...(key ? { DI_RIG_KEY: String(key) } : {}),
        ...(name ? { DI_MACHINE_NAME: String(name) } : {}),
        ...(part ? { DI_PART: String(part) } : {}),
        ...extraEnv
    }
    // spawn() rejects undefined env values on some platforms — strip them.
    const env = Object.fromEntries(Object.entries(rawEnv).filter(([, v]) => v !== undefined))

    const child = spawn(process.execPath, [serverEntry], {
        cwd: path.join(resolvedDir, 'serverXR'),
        stdio: ['ignore', logFd, logFd],
        env
    })

    const base = `http://${host}:${resolvedPort}/serverXR`
    const healthUrl = `${base}/api/health`
    const deadline = Date.now() + timeoutMs
    let started = false
    let startError = null
    child.once('exit', (code, signal) => {
        if (!started) startError = new Error(`server exited before answering health (code=${code} signal=${signal})`)
    })
    while (Date.now() < deadline) {
        if (startError) break
        try {
            await waitForHealth(healthUrl, { timeoutMs: 1000, intervalMs: 250 })
            started = true
            break
        } catch {
            // keep polling until the outer deadline
        }
    }
    if (!started) {
        try { child.kill('SIGKILL') } catch { /* already gone */ }
        throw new Error(`${startError ? startError.message : 'server did not answer /api/health in time'}\n${readTail(logFile)}`)
    }

    const stop = async () => {
        if (!child.killed && child.exitCode === null) {
            try { child.kill('SIGTERM') } catch { /* already gone */ }
            const stopDeadline = Date.now() + 8000
            while (child.exitCode === null && Date.now() < stopDeadline) await wait(200)
            if (child.exitCode === null) {
                try { child.kill('SIGKILL') } catch { /* already gone */ }
            }
        }
        try { fs.closeSync(logFd) } catch { /* already closed */ }
        if (ownsDataRoot) await fsp.rm(resolvedDataRoot, { recursive: true, force: true })
    }

    return { base, pid: child.pid, dir: resolvedDir, port: resolvedPort, host, dataRoot: resolvedDataRoot, logFile, stop, child }
}

export const stopByPid = async (pid) => {
    try {
        process.kill(pid, 'SIGTERM')
        return true
    } catch {
        return false
    }
}

const isMain = () => {
    try {
        return import.meta.url === `file://${process.argv[1]}`
    } catch {
        return false
    }
}

if (isMain()) {
    const { values: cli } = parseArgs({
        options: {
            dir: { type: 'string' },
            port: { type: 'string', default: '0' },
            host: { type: 'string', default: '127.0.0.1' },
            'data-root': { type: 'string' },
            room: { type: 'string' },
            key: { type: 'string' },
            name: { type: 'string' },
            part: { type: 'string' },
            stop: { type: 'string' }
        }
    })

    if (cli.stop) {
        const ok = await stopByPid(Number(cli.stop))
        process.stdout.write(`${JSON.stringify({ stopped: ok, pid: Number(cli.stop) })}\n`)
        process.exit(ok ? 0 : 1)
    }

    if (!cli.dir) {
        process.stderr.write('usage: node scripts/rig/start-member.mjs --dir <checkoutDir> [--port 0] [--host 127.0.0.1] [--data-root <dir>] [--room <name>] [--key <secret>] [--name <machineName>]\n')
        process.exit(2)
    }

    let handle
    try {
        handle = await startMember({
            dir: cli.dir,
            port: Number(cli.port || 0),
            host: cli.host,
            dataRoot: cli['data-root'],
            room: cli.room,
            key: cli.key,
            name: cli.name,
            part: cli.part
        })
    } catch (err) {
        process.stderr.write(`[start-member] failed: ${String(err && err.message || err)}\n`)
        process.exit(1)
    }

    process.stdout.write(`${JSON.stringify({ base: handle.base, pid: handle.pid })}\n`)
    process.stderr.write(`[start-member] ${handle.base} (pid ${handle.pid}, data ${handle.dataRoot})\n`)

    const shutdown = async () => {
        await handle.stop()
        process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}
