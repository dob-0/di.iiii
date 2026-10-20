// @vitest-environment node
//
// The installed server, supervised by systemd (service.mjs). Before this, the
// server `di up` started was a detached process nothing watched: it was killed
// from outside three times in September 2026 and stayed dead each time.
//
// systemctl is replaced by a fake that records what it was asked and keeps a
// tiny unit state, so these run on any machine (and in CI) without touching a
// real systemd. The real thing was proved on aylmo with a throwaway install —
// see docs/ai/known-fixes.md.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { activate } from './install.mjs'
import * as node from './runner-node.mjs'
import {
    activeService, envDelta, envFileText, envValue, installService, removeService,
    servicePaths, systemdUsable, unitText, validUnitName
} from './service.mjs'
import { paths } from './paths.mjs'
import { readState, writeState } from './state.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const NAME = 'di-test-unit'

const dirs = []
const tmp = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    dirs.push(dir)
    return dir
}

const savedEnv = {}
beforeEach(() => {
    for (const key of ['XDG_CONFIG_HOME', 'XDG_RUNTIME_DIR']) savedEnv[key] = process.env[key]
    process.env.XDG_CONFIG_HOME = tmp('di-svc-config-')
    process.env.XDG_RUNTIME_DIR = tmp('di-svc-run-')
})
afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
    }
    while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true })
})

/** An install with one version in it; `current` points at it. */
const installedHome = (version = '1.0.0') => {
    const home = tmp('di-svc-home-')
    fs.mkdirSync(path.join(home, 'versions', version, 'serverXR', 'src'), { recursive: true })
    fs.symlinkSync(path.join(home, 'versions', version), path.join(home, 'current'))
    fs.writeFileSync(path.join(home, 'state.json'), JSON.stringify({ mode: 'node', version }))
    return home
}

/** systemctl --user, faked: records every call, keeps one unit's state. */
const fakeSystemd = ({ crashOnStart = false } = {}) => {
    const calls = []
    const unit = { active: false, restarts: 0 }
    const run = (args) => {
        calls.push(args.join(' '))
        const [verb] = args
        if (verb === 'show') {
            // A server that dies on start: systemd has restarted it by the
            // time anyone looks again.
            if (crashOnStart && unit.active) unit.restarts += 1
            return {
                status: 0,
                stdout: [
                    `ActiveState=${unit.active ? 'active' : 'inactive'}`,
                    `SubState=${unit.active ? 'running' : 'dead'}`,
                    `MainPID=${unit.active ? 4242 : 0}`,
                    `NRestarts=${unit.restarts}`,
                    'Result=success',
                    'UnitFileState=enabled'
                ].join('\n')
            }
        }
        if (verb === 'restart' || verb === 'start') unit.active = true
        if (verb === 'stop' || (verb === 'disable' && args.includes('--now'))) unit.active = false
        return { status: 0, stdout: '', stderr: '' }
    }
    return { run, usable: true, calls, unit }
}

/** Something answering /serverXR/api/health, standing in for the server systemd started. */
const healthServer = async () => {
    const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}') })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    return { port: server.address().port, close: () => new Promise(resolve => server.close(resolve)) }
}

const supervise = async (home, sd, name = NAME) => installService({
    home, name, node: '/opt/node/bin/node', serverEnv: { PATH: '/usr/bin' }, run: sd.run
})

describe('the unit: systemd watches the server itself', () => {
    const text = unitText({ name: NAME, home: '/home/a/.di', node: '/opt/node/bin/node' })

    it('makes node the main process, through `current` — never a version', () => {
        expect(text).toMatch(/^Type=exec$/m)
        expect(text).toContain('ExecStart="/opt/node/bin/node" "/home/a/.di/current/serverXR/src/index.js"')
        expect(text).toContain('WorkingDirectory=/home/a/.di/current/serverXR')
        expect(text).not.toMatch(/versions\//)
    })

    it('restarts it on ANY unasked exit — a SIGTERM from pkill is clean to on-failure', () => {
        expect(text).toMatch(/^Restart=always$/m)
        expect(text).toMatch(/^RestartSec=2$/m)
        expect(text).toMatch(/^TimeoutStopSec=10$/m)
    })

    it('gives up on a server that cannot start, with the limit in [Unit] where systemd reads it', () => {
        const unitSection = text.slice(text.indexOf('[Unit]'), text.indexOf('[Service]'))
        expect(unitSection).toMatch(/^StartLimitIntervalSec=300$/m)
        expect(unitSection).toMatch(/^StartLimitBurst=10$/m)
    })

    it('reads its environment from two files, the per-start one optional and in the runtime dir', () => {
        expect(text).toContain('EnvironmentFile=/home/a/.di/run/server.env')
        expect(text).toContain(`EnvironmentFile=-%t/${NAME}.start.env`)
        expect(text).toMatch(/^WantedBy=default\.target$/m)
    })

    it('escapes a % in a path, which systemd would otherwise read as a specifier', () => {
        const odd = unitText({ name: NAME, home: '/home/100%/.di', node: '/opt/node' })
        expect(odd).toContain('WorkingDirectory=/home/100%%/.di/current/serverXR')
    })

    it('refuses unit names that are not one plain unit', () => {
        for (const bad of ['', 'a/b', 'di@x', 'di.service', '-x', 'x y']) expect(validUnitName(bad)).toBe(false)
        for (const good of ['di-server', 'di-up-test', 'di_2.local']) expect(validUnitName(good)).toBe(true)
    })
})

describe('the environment file systemd reads back unchanged', () => {
    it('single-quotes a value, and double-quotes one that holds a single quote', () => {
        expect(envValue('plain value')).toBe("'plain value'")
        expect(envValue('it\'s $HOME "x" \\')).toBe('"it\'s \\$HOME \\"x\\" \\\\"')
    })

    it('leaves out names systemd refuses and values it cannot hold', () => {
        const text = envFileText({ GOOD: 'a', 'BAD-NAME': 'b', '1X': 'c', MULTI: 'x\ny', NONE: null })
        expect(text).toBe("GOOD='a'\n")
    })

    it('keeps --lan and --guests out of the persistent file: only the delta goes to the runtime one', () => {
        const home = installedHome()
        const base = { PATH: '/usr/bin' }
        const loopback = node.serverEnv({ home, port: 4391, base })
        const lan = node.serverEnv({ home, port: 4391, host: '0.0.0.0', guests: true, base })
        expect(loopback.HOST).toBe('127.0.0.1')
        expect(envDelta(lan, loopback)).toEqual({ HOST: '0.0.0.0', REQUIRE_AUTH: 'true', DI_ALLOW_LAN_DEVICES: '1' })
        expect(envDelta(loopback, loopback)).toEqual({})
    })

    it('points the app at `current`, so the unit serves the new build after an update', () => {
        const home = installedHome()
        expect(node.serverEnv({ home, port: 4391, base: {} }).CLIENT_DIR).toBe(path.join(home, 'current', 'dist'))
    })
})

describe('which path a command takes', () => {
    it('is the detached path, untouched, when this install has no unit', () => {
        const sd = fakeSystemd()
        expect(activeService(installedHome(), sd)).toBeNull()
        expect(sd.calls).toEqual([])
    })

    it('is the detached path when the unit file is gone, or systemd is', async () => {
        const home = installedHome()
        const sd = fakeSystemd()
        const svc = await supervise(home, sd)
        expect(activeService(home, sd)?.unit).toBe(`${NAME}.service`)
        expect(activeService(home, { ...sd, usable: false })).toBeNull()
        fs.rmSync(svc.unitFile)
        expect(activeService(home, sd)).toBeNull()
    })

    it('never asks systemctl on macOS or Windows, or on a machine not booted with systemd', () => {
        let asked = 0
        const run = () => { asked += 1; return { status: 0 } }
        expect(systemdUsable({ run, platform: 'darwin' })).toBe(false)
        expect(systemdUsable({ run, platform: 'win32' })).toBe(false)
        expect(systemdUsable({ run, platform: 'linux', exists: () => false })).toBe(false)
        expect(asked).toBe(0)
        expect(systemdUsable({ run, platform: 'linux', exists: () => true })).toBe(true)
    })
})

describe('up / down drive the unit when it is installed', () => {
    it('keeps the node the install ran with, first on PATH, when a later `di up` runs under another node', async () => {
        // /opt/node/bin/node is what `supervise` installs with; this test
        // process (a different node) stands in for the system v26 on a shell PATH.
        const home = installedHome()
        const sd = fakeSystemd()
        const pinned = path.join(tmp('di-svc-node-'), 'node')
        fs.writeFileSync(pinned, '')
        await installService({ home, name: NAME, node: pinned, serverEnv: { PATH: '/usr/bin' }, run: sd.run })
        expect(readState(home).service.node).toBe(pinned)
        const health = await healthServer()
        try { await node.start({ home, port: health.port, systemd: sd }) } finally { await health.close() }
        const sp = servicePaths(home, NAME)
        expect(fs.readFileSync(sp.unitFile, 'utf8')).toContain(`ExecStart="${pinned}" `)
        const envText = fs.readFileSync(sp.serverEnv, 'utf8')
        expect(envText).toContain(`PATH='${path.dirname(pinned)}:`)
        expect(process.execPath).not.toBe(pinned)
    })

    it('`di up` writes the env, (re)starts the unit and spawns nothing itself', async () => {
        const home = installedHome()
        const sd = fakeSystemd()
        await supervise(home, sd)
        const health = await healthServer()
        try {
            const up = await node.start({ home, port: health.port, systemd: sd })
            expect(up.supervisor).toBe(`${NAME}.service`)
            expect(up.pid).toBe(4242)
        } finally { await health.close() }

        expect(sd.calls).toContain(`reset-failed ${NAME}.service`)
        expect(sd.calls).toContain(`restart ${NAME}.service`)
        // No detached child, so no pid file of its own.
        expect(fs.existsSync(paths(home).pidFile)).toBe(false)
        const sp = servicePaths(home, NAME)
        const envText = fs.readFileSync(sp.serverEnv, 'utf8')
        expect(envText).toContain(`PORT='${health.port}'`)
        expect(envText).toContain("HOST='127.0.0.1'")
        expect(envText).toContain(`DATA_ROOT='${paths(home).data}'`)
        expect(fs.statSync(sp.serverEnv).mode & 0o777).toBe(0o600)
        expect(fs.existsSync(sp.startEnv)).toBe(false)
    })

    it('`di up --lan` puts the wildcard bind in the runtime file only, and a loopback start takes it away', async () => {
        const home = installedHome()
        const sd = fakeSystemd()
        await supervise(home, sd)
        const sp = servicePaths(home, NAME)
        const health = await healthServer()
        try {
            await node.start({ home, port: health.port, host: '0.0.0.0', systemd: sd })
            expect(fs.readFileSync(sp.startEnv, 'utf8')).toContain("HOST='0.0.0.0'")
            expect(fs.readFileSync(sp.serverEnv, 'utf8')).toContain("HOST='127.0.0.1'")
            await node.start({ home, port: health.port, systemd: sd })
            expect(fs.existsSync(sp.startEnv)).toBe(false)
        } finally { await health.close() }
    })

    it('a server that dies while starting is reported and the unit stopped, not left looping', async () => {
        const home = installedHome()
        const sd = fakeSystemd({ crashOnStart: true })
        await supervise(home, sd)
        // Nothing answers on this port: only the restart count can say it died.
        await expect(node.start({ home, port: 1, systemd: sd })).rejects.toThrow(/stopped while starting/)
        expect(sd.calls.at(-1)).toBe(`stop ${NAME}.service`)
        expect(sd.unit.active).toBe(false)
    })

    it('`di down` stops the unit — which systemd never restarts — and says whether it was up', async () => {
        const home = installedHome()
        const sd = fakeSystemd()
        await supervise(home, sd)
        sd.unit.active = true
        expect(await node.stop({ home, systemd: sd })).toBe(true)
        expect(sd.calls).toContain(`stop ${NAME}.service`)
        expect(await node.stop({ home, systemd: sd })).toBe(false)
    })

    it('`di status` reads the unit, not the pid file', async () => {
        const home = installedHome()
        const sd = fakeSystemd()
        await supervise(home, sd)
        expect(node.isRunning(home, { systemd: sd })).toBe(false)
        sd.unit.active = true
        expect(node.isRunning(home, { systemd: sd })).toBe(true)
    })
})

describe('`di update` swaps the version under the unit', () => {
    it('stop → flip `current` → start: the same unit runs the new build, unrewritten', async () => {
        const home = installedHome('1.0.0')
        const sd = fakeSystemd()
        const svc = await supervise(home, sd)
        const health = await healthServer()
        try {
            await node.start({ home, port: health.port, systemd: sd })
            const unitBefore = fs.readFileSync(svc.unitFile, 'utf8')
            const reloadsBefore = sd.calls.filter(call => call === 'daemon-reload').length

            // What cmdUpdate does, in its order.
            await node.stop({ home, systemd: sd })
            const partialDir = path.join(home, 'versions', '2.0.0.partial')
            fs.mkdirSync(path.join(partialDir, 'serverXR', 'src'), { recursive: true })
            await activate({ home, partialDir, finalDir: path.join(home, 'versions', '2.0.0'), version: '2.0.0', mode: 'node' })
            await node.start({ home, port: health.port, systemd: sd })

            expect(fs.readFileSync(svc.unitFile, 'utf8')).toBe(unitBefore)
            expect(sd.calls.filter(call => call === 'daemon-reload').length).toBe(reloadsBefore)
            const stopAt = sd.calls.lastIndexOf(`stop ${NAME}.service`)
            const restartAt = sd.calls.lastIndexOf(`restart ${NAME}.service`)
            expect(stopAt).toBeGreaterThan(-1)
            expect(restartAt).toBeGreaterThan(stopAt)
            // The path the unit names now lands in the new version.
            expect(fs.realpathSync(path.join(home, 'current', 'serverXR'))).toBe(fs.realpathSync(path.join(home, 'versions', '2.0.0', 'serverXR')))
            // activate() merged into state.json; the unit's name survived it.
            expect(readState(home).service?.name).toBe(NAME)
        } finally { await health.close() }
    })

    it('cmdUpdate still stops through the runner before the flip and starts after it', () => {
        const source = fs.readFileSync(path.join(HERE, 'cli.mjs'), 'utf8')
        const body = source.slice(source.indexOf('const cmdUpdate = async'), source.indexOf('\n}\n', source.indexOf('const cmdUpdate = async')))
        const stopAt = body.indexOf('await runner.stop({ home })')
        const flipAt = body.indexOf('await activate(')
        const startAt = body.lastIndexOf('await cmdUp(')
        expect(stopAt).toBeGreaterThan(-1)
        expect(flipAt).toBeGreaterThan(stopAt)
        expect(startAt).toBeGreaterThan(flipAt)
    })
})

describe('`di service install` / `remove`', () => {
    it('install writes and enables the unit and records its name; remove undoes exactly that', async () => {
        const home = installedHome()
        const sd = fakeSystemd()
        const svc = await supervise(home, sd)
        expect(fs.existsSync(svc.unitFile)).toBe(true)
        expect(sd.calls).toContain(`enable ${NAME}.service`)
        expect(readState(home).service).toEqual({ name: NAME, unitFile: svc.unitFile, node: "/opt/node/bin/node" })

        fs.writeFileSync(svc.startEnv, "HOST='0.0.0.0'\n")
        const removed = await removeService({ home, run: sd.run })
        expect(removed.unit).toBe(`${NAME}.service`)
        expect(sd.calls).toContain(`disable --now ${NAME}.service`)
        for (const file of [svc.unitFile, svc.serverEnv, svc.startEnv]) expect(fs.existsSync(file)).toBe(false)
        expect(readState(home).service).toBeNull()
        expect(activeService(home, sd)).toBeNull()
    })

    it('the CLI refuses a unit name that is not one plain unit, before touching anything', () => {
        const home = installedHome()
        const result = spawnSync(process.execPath, [path.join(HERE, 'cli.mjs'), 'service', 'install', '--name', 'a/b'], {
            encoding: 'utf8',
            timeout: 15000,
            env: { ...process.env, DI_HOME: home, DI_NO_COLOR: '1' },
            stdio: ['ignore', 'pipe', 'pipe']
        })
        expect(result.status).toBe(1)
        expect(`${result.stdout}${result.stderr}`).toMatch(/not a name di will give a unit/)
        expect(readState(home).service).toBeUndefined()
    })

    it('`di service` on an unsupervised install says so, and how', async () => {
        const home = installedHome()
        await writeState(home, {})
        const result = spawnSync(process.execPath, [path.join(HERE, 'cli.mjs'), 'service'], {
            encoding: 'utf8', timeout: 15000, env: { ...process.env, DI_HOME: home, DI_NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe']
        })
        expect(result.status).toBe(0)
        expect(result.stdout).toMatch(/nothing supervises this install/)
    })
})
