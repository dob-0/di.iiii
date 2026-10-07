/**
 * Running di.iiii as one plain Node process — the default path.
 *
 * One process, one port: serverXR serves both the API and the built app via
 * CLIENT_DIR. No Vite, no second port, no build on the artist's machine.
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { isWindows, paths, versionLayout } from './paths.mjs'
import { probeHealth } from './probe.mjs'
import * as service from './service.mjs'
import { currentVersionDir, ONE_LOCAL_NAME, readCert, readEnv, readState } from './state.mjs'

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

/**
 * Is this install's server up — asked of the supervisor when there is one,
 * else of the pid file.
 */
export const isRunning = (home, { systemd = null } = {}) => {
    const svc = service.activeService(home, systemd || {})
    if (svc) return service.unitStatus(svc, systemd || {}).active
    return pidAlive(readPid(home))
}

/**
 * Everything the server process is started with. One function for both the
 * detached start and the systemd unit, so the two can never drift: what is in
 * here is what the server sees, whichever way it was started.
 */
export const serverEnv = ({ home, port, host = '127.0.0.1', guests = false, base = process.env }) => {
    const p = paths(home)
    const layout = versionLayout(p.current)
    // `di up --lan` binds every interface. That is the one deliberate act that
    // also opens the device routes (the lighting desk's Touch page, OSC) to the
    // room, and the guard's own flag is how the server hears it. A loopback
    // start leaves whatever di.env says about it alone.
    const wildcard = host === '0.0.0.0' || host === '::'
    const cert = readCert(home)
    return {
        // The one local address (docs/ai/one-local-address.md): the server
        // opens http://diiii.localhost/ on loopback :80 when it may, and
        // stands aside when it may not. Before di.env, so a machine can say
        // DI_LOCAL_NAME=off there (a machine whose dev-router owns :80).
        DI_LOCAL_NAME: ONE_LOCAL_NAME,
        ...base,
        ...readEnv(home),
        PORT: String(port),
        HOST: host,
        APP_BASE_PATH: '/serverXR',
        // Through `current`, not the resolved version: the systemd unit keeps
        // this file between an update's stop and its start, and must then
        // serve the NEW build's app.
        CLIENT_DIR: layout.client,
        DATA_ROOT: p.data,
        // A local install is one person on their own machine. Auth off is
        // what makes it usable without an account; the loopback bind
        // above — the default — is what keeps that from meaning "the café
        // can edit it", and `--lan` says the opposite out loud first.
        //
        // `--guests` turns it on for everyone EXCEPT the person at the
        // machine: the server reads a loopback request on a DI_LOCAL
        // install as the owner (serverXR getPublicAuthState), so the owner
        // never meets a sign-in card on their own laptop, and everyone on
        // the network arrives as a guest with their own sandbox.
        REQUIRE_AUTH: guests ? 'true' : 'false',
        // Session cookies marked Secure are dropped by the browser over
        // plain http — which is every guest, on an install with no
        // certificate. Follow the certificate, not NODE_ENV.
        AUTH_SESSION_COOKIE_SECURE: cert ? 'true' : 'false',
        NODE_ENV: 'production',
        // NODE_ENV=production would otherwise close the local-operator
        // gate (agent board, local claude chat, the model on this box) on
        // a personal install. Those gates check the request's own address
        // and stay loopback-only under --lan.
        DI_LOCAL: '1',
        // The certificate, if this install has one. Handed over as paths:
        // the server reads them itself and falls back to http if either is
        // unreadable, so a half-installed pair can never stop a start.
        ...(cert ? { TLS_CERT: cert.cert, TLS_KEY: cert.key } : {}),
        ...(wildcard ? { DI_ALLOW_LAN_DEVICES: '1' } : {})
    }
}

/**
 * The environment a systemd unit starts from: not the shell that typed
 * `di up` (a unit restarted at 3 a.m. has no shell), only a PATH that finds
 * this node and the user's own tools, as the hand-written di-up.service did.
 */
export const unitBaseEnv = (home) => ({
    PATH: [path.dirname(nodeBinary(home)), path.join(os.homedir(), '.local', 'bin'), '/usr/local/bin', '/usr/bin', '/bin'].join(':')
})

/**
 * Wait for the server to answer, the way a browser on this machine would.
 * `gone()` says the process died while we waited; `tail()` is what it said.
 */
const waitForHealth = async ({ home, port, host, gone, tail, pid = null }) => {
    const wildcard = host === '0.0.0.0' || host === '::'
    const cert = readCert(home)
    // A wildcard bind answers on loopback as well, and 0.0.0.0 is not an
    // address every OS lets a client connect to — probe what a browser on this
    // machine would use.
    // With a certificate the server answers https and only https, and the
    // certificate is for a NAME — 127.0.0.1 would fail the hostname check even
    // though the server is perfectly up. So the wait asks on the same terms a
    // browser will.
    const probeHost = cert ? cert.name : (wildcard ? '127.0.0.1' : host)
    const scheme = cert ? 'https' : 'http'
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
        if (await probeHealth(port, probeHost, '/serverXR', scheme)) return { pid: pid ?? undefined, port, host }
        // A certificate this build cannot use (an app older than the https
        // support) answers http and is perfectly alive — believe the server,
        // not our expectation of it.
        if (cert && await probeHealth(port, wildcard ? '127.0.0.1' : host)) return { pid: pid ?? undefined, port, host, insecure: true }
        if (gone()) {
            const said = await tail()
            // Below 1024 the kernel refuses the bind unless the binary carries
            // the capability, and the log says EACCES and nothing a person can
            // act on. Say the one line that fixes it, naming the very node this
            // install runs — a general "use sudo" would send someone to grant
            // it to the wrong binary.
            if (port < 1024 && /EACCES|permission denied/i.test(said)) {
                throw new Error(
                    `port ${port} needs one permission this install does not have yet.\n`
                    + 'run this once, then start again:\n\n'
                    + `  pkexec setcap cap_net_bind_service=+ep ${nodeBinary(home)}\n`
                )
            }
            throw new Error(`the server stopped while starting.\n${said}`)
        }
        await wait(300)
    }
    return null
}

/**
 * The supervised start: systemd runs the server, this only writes what it is
 * started with and asks. A start that does not come up is stopped again, so a
 * failed `di up` leaves nothing behind — the same promise the detached start
 * keeps — and the journal lines are the error.
 */
const startSupervised = async ({ home, svc, port, host, guests, verbose, systemd }) => {
    const opts = systemd || {}
    const nodeBin = service.pinnedNode(home) || nodeBinary(home)
    const base = { PATH: [path.dirname(nodeBin), path.join(os.homedir(), '.local', 'bin'), '/usr/local/bin', '/usr/bin', '/bin'].join(':') }
    const loopback = serverEnv({ home, port, host: '127.0.0.1', guests: false, base })
    const wanted = serverEnv({ home, port, host, guests, base })
    await service.writeUnit({
        svc, home, node: nodeBin,
        serverEnv: loopback,
        startEnv: service.envDelta(wanted, loopback),
        ...opts
    })
    service.startUnit(svc, opts)
    const first = service.unitStatus(svc, opts)
    if (verbose) process.stdout.write(`[di] ${svc.unit} (systemd), pid ${first.mainPid}, log: journalctl --user -u ${svc.unit}\n`)
    try {
        const up = await waitForHealth({
            home, port, host,
            pid: first.mainPid,
            // Died while starting: systemd has either given up, or already
            // started it again — a restart counted during OUR start is a crash.
            gone: () => {
                const now = service.unitStatus(svc, opts)
                return now.state === 'failed' || now.restarts > first.restarts
            },
            tail: async () => service.journalTail(svc, 20)
        })
        if (up) return { ...up, pid: service.unitStatus(svc, opts).mainPid, supervisor: svc.unit }
        throw new Error(`the server did not answer in time — see: journalctl --user -u ${svc.unit}`)
    } catch (error) {
        try { await service.stopUnit(svc, opts) } catch { /* reported below */ }
        throw error
    }
}

export const start = async ({ home, port, host = '127.0.0.1', guests = false, verbose = false, systemd = null }) => {
    const p = paths(home)
    const versionDir = currentVersionDir(home)
    if (!versionDir) throw new Error('not installed')
    const layout = versionLayout(versionDir)

    await fsp.mkdir(p.data, { recursive: true })
    await fsp.mkdir(p.logs, { recursive: true })
    await fsp.mkdir(p.run, { recursive: true })

    // `di service install` was run on this machine: systemd starts it, and
    // restarts it if it dies. Otherwise the detached start below, unchanged.
    // `systemd` is only ever passed by tests: { run, usable } stand in for the machine.
    const svc = service.activeService(home, systemd || {})
    if (svc) return startSupervised({ home, svc, port, host, guests, verbose, systemd })

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
        env: { ...serverEnv({ home, port, host, guests }), CLIENT_DIR: layout.client }
    })

    child.unref()
    await fsp.writeFile(p.pidFile, String(child.pid))

    if (verbose) process.stdout.write(`[di] pid ${child.pid}, log ${p.serverLog}\n`)

    const up = await waitForHealth({
        home, port, host,
        pid: child.pid,
        gone: () => !pidAlive(child.pid),
        tail: () => readLog(home, 20)
    })
    if (up) return up
    throw new Error('the server did not answer in time — see: di logs')
}

/**
 * Any server of THIS install still running, whatever the pid file says.
 *
 * The pid file is written once per start and lost whenever a start races, a
 * crash beats the write, or an update swaps the version under a running
 * process. Twice in one evening that left a server from a deleted version
 * holding the port: `di up` saw a healthy port and said "already running",
 * `di down` killed nothing, and the address answered 404 from a dist that no
 * longer existed. A process running out of this install's own versions
 * directory is this install's server, whether or not we wrote its number down.
 */
const strayServers = (home) => {
    if (isWindows) return []
    const versions = paths(home).versions
    try {
        const listed = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' })
        return String(listed.stdout || '')
            .split('\n')
            .filter(line => line.includes(versions) && line.includes('serverXR/src/index.js'))
            .map(line => Number(line.trim().split(/\s+/)[0]))
            .filter(pid => Number.isFinite(pid) && pid !== process.pid)
    } catch {
        return []
    }
}

export const stop = async ({ home, systemd = null }) => {
    // The unit first: systemd never restarts a unit it was asked to stop, so
    // `di down` lasts. Then the detached path as before, which also ends a
    // server this install started before it had a unit.
    const svc = service.activeService(home, systemd || {})
    const supervised = svc ? await service.stopUnit(svc, systemd || {}) : false
    const detached = await stopDetached({ home })
    return supervised || detached
}

const stopDetached = async ({ home }) => {
    const pid = readPid(home)
    const strays = strayServers(home).filter(other => other !== pid)
    for (const other of strays) {
        try { process.kill(other, 'SIGTERM') } catch { /* already gone */ }
    }
    if (!pidAlive(pid)) {
        await fsp.rm(paths(home).pidFile, { force: true })
        return strays.length > 0
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
    // Supervised, the server writes to the journal; that is the log.
    const svc = service.activeService(home)
    if (svc) return service.journalTail(svc, lines)
    try {
        const raw = await fsp.readFile(paths(home).serverLog, 'utf8')
        return raw.split('\n').slice(-lines).join('\n')
    } catch {
        return ''
    }
}

export const followLog = (home) => {
    const svc = service.activeService(home)
    if (svc) return spawn('journalctl', ['--user', '-u', svc.unit, '-n', '200', '-f', '-o', 'short-iso'], { stdio: 'inherit' })
    const file = paths(home).serverLog
    const child = spawn(isWindows ? 'powershell' : 'tail',
        isWindows ? ['-Command', `Get-Content -Path "${file}" -Wait -Tail 200`] : ['-n', '200', '-f', file],
        { stdio: 'inherit' })
    return child
}

export const describe = (home) => ({
    mode: 'node',
    version: readState(home).version || null,
    dataDir: paths(home).data,
    // Which systemd unit keeps it up, or null when nothing does.
    supervisor: service.activeService(home)?.unit || null
})
