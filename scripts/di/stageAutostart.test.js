// @vitest-environment node
//
// THE ONE THAT MATTERS: `di stage join` then `di stage leave` leaves the
// machine byte-for-byte as it was.
//
// A stage appliance writes into places nothing else in di touches — a systemd
// user unit outside DI_HOME, a line in di.env, a follow in the artist's data —
// and the promise the whole command rests on is that `leave` puts every one of
// them back. Not "removes a directory": puts back. So this walks a temp HOME
// before and after and compares path, mode and bytes.
//
// The autostart commands are RECORDED, not run: `systemctl --user enable` on
// the machine running the tests would install a real unit into the real
// session, which is the exact thing this feature is not allowed to do by
// accident. The commands themselves are held in stagePlan.test.js.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { addFollow, readFollows } from './follows.mjs'
import { installAutostart, joinStage, leaveStage, readManifest, stagePaths } from './stage.mjs'
import { STAGE } from './stagePlan.mjs'

// A port nothing on a developer's machine is on, and nothing di ever binds —
// the local install must be probed as DOWN for the whole of this file.
const DEAD_PORT = 45999

const temp = []
const tempDir = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    temp.push(dir)
    return dir
}

/** Every file under a directory, with its bytes and its mode. */
const walk = (root) => {
    const out = new Map()
    const visit = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const full = path.join(dir, entry.name)
            const rel = path.relative(root, full)
            if (entry.isDirectory()) { out.set(`${rel}/`, 'dir'); visit(full); continue }
            if (entry.isSymbolicLink()) { out.set(rel, `link:${fs.readlinkSync(full)}`); continue }
            const stat = fs.lstatSync(full)
            out.set(rel, `${(stat.mode & 0o777).toString(8)}:${crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')}`)
        }
    }
    visit(root)
    return out
}

const diff = (before, after) => {
    const lines = []
    for (const [key, value] of after) {
        if (!before.has(key)) lines.push(`+ ${key}`)
        else if (before.get(key) !== value) lines.push(`~ ${key}`)
    }
    for (const key of before.keys()) if (!after.has(key)) lines.push(`- ${key}`)
    return lines.sort()
}

/**
 * A di.iiii that answers exactly the two questions a follow asks: is anything
 * there, and may I read this space's ops. No key, no space of its own — the
 * follow is the only network this test wants.
 */
const fakeRemote = () => new Promise((resolve) => {
    const server = http.createServer((request, response) => {
        response.setHeader('Content-Type', 'application/json')
        if (request.url.startsWith('/serverXR/api/health')) {
            response.end(JSON.stringify({ ok: true, startedAt: 1, port: 1 }))
            return
        }
        if (/^\/serverXR\/api\/spaces\/[^/]+\/ops/.test(request.url)) {
            response.end(JSON.stringify({ ops: [], latestVersion: 0 }))
            return
        }
        response.statusCode = 404
        response.end('{}')
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }))
})

/**
 * A HOME that looks lived in: a version, an env file with a comment and a
 * hand-spaced key in it, an unrelated follow already recorded, a server log.
 * An empty directory would prove far less — the restore has to survive a file
 * di did not write in the first place.
 */
const livedInHome = () => {
    const home = tempDir('di-stage-home-')
    const version = '7.7.7-test'
    fs.mkdirSync(path.join(home, 'versions', version, 'cli'), { recursive: true })
    fs.symlinkSync(path.join(home, 'versions', version), path.join(home, 'current'))
    fs.writeFileSync(path.join(home, 'state.json'), `${JSON.stringify({ mode: 'node', version }, null, 2)}\n`)
    fs.writeFileSync(path.join(home, 'di.env'), `# written by hand\nPORT=${DEAD_PORT}\nADMIN_API_TOKEN = abc\n`, { mode: 0o600 })
    fs.mkdirSync(path.join(home, 'logs'), { recursive: true })
    fs.writeFileSync(path.join(home, 'logs', 'server.log'), 'an earlier evening\n')
    fs.mkdirSync(path.join(home, 'run'), { recursive: true })
    fs.mkdirSync(path.join(home, 'data'), { recursive: true })
    return home
}

let remote = null
let previousConfigHome
beforeEach(async () => {
    remote = await fakeRemote()
    previousConfigHome = process.env.XDG_CONFIG_HOME
    // The systemd unit lands OUTSIDE DI_HOME by design. XDG_CONFIG_HOME is the
    // standard way to say where that outside is, and pointing it at a temp
    // directory is what keeps this test off the machine running it.
    process.env.XDG_CONFIG_HOME = tempDir('di-stage-config-')
})
afterEach(() => {
    remote?.server.close()
    if (previousConfigHome === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousConfigHome
    while (temp.length) fs.rmSync(temp.pop(), { recursive: true, force: true })
})

const recorder = () => {
    const calls = []
    return { calls, run: (command) => { calls.push(`${command.command} ${command.args.join(' ')}`); return { ok: true, output: '' } } }
}

const join = (home, extra = {}) => {
    const { calls, run } = recorder()
    return joinStage({
        home, spaceId: 'stage', from: remote.base, browser: '/bin/true', run, ...extra
    }).then((result) => ({ ...result, calls }))
}

describe('join, then leave', () => {
    it('leaves the HOME and the config directory byte-identical', async () => {
        const home = livedInHome()
        const config = process.env.XDG_CONFIG_HOME
        const homeBefore = walk(home)
        const configBefore = walk(config)

        const joined = await join(home)
        expect(joined.ok, JSON.stringify(joined)).toBe(true)

        // It really did do something — otherwise the comparison below proves
        // only that nothing happened.
        expect(diff(homeBefore, walk(home)).length).toBeGreaterThan(3)
        expect(diff(configBefore, walk(config))).toEqual([
            '+ systemd/', '+ systemd/user/', `+ systemd/user/${STAGE.unit}`
        ])

        const left = await leaveStage({ home, run: recorder().run })
        expect(left.ok).toBe(true)

        expect(diff(homeBefore, walk(home))).toEqual([])
        expect(diff(configBefore, walk(config))).toEqual([])
    })

    it('puts an unrelated follow back exactly as it was, and takes only its own away', async () => {
        const home = livedInHome()
        await addFollow(path.join(home, 'data'), 'other-space', { remote: 'https://elsewhere', token: 'k' })
        const before = walk(home)

        await join(home)
        expect(Object.keys(readFollows(path.join(home, 'data'))).sort()).toEqual(['other-space', 'stage'])

        await leaveStage({ home, run: recorder().run })
        expect(Object.keys(readFollows(path.join(home, 'data')))).toEqual(['other-space'])
        expect(diff(before, walk(home))).toEqual([])
    })

    it('puts an earlier follow of the SAME space back, rather than deleting it', async () => {
        const home = livedInHome()
        await addFollow(path.join(home, 'data'), 'stage', { remote: 'https://earlier', token: 'old-key' })
        const before = walk(home)

        await join(home, { into: 'stage' })
        expect(readFollows(path.join(home, 'data')).stage.remote).toContain('127.0.0.1')

        await leaveStage({ home, run: recorder().run })
        expect(readFollows(path.join(home, 'data')).stage).toMatchObject({ remote: 'https://earlier', token: 'old-key' })
        expect(diff(before, walk(home))).toEqual([])
    })

    it('puts a DI_PART that was already set back to what it said', async () => {
        const home = livedInHome()
        fs.writeFileSync(path.join(home, 'di.env'), `PORT=${DEAD_PORT}\nDI_PART=studio\n`, { mode: 0o600 })
        const before = fs.readFileSync(path.join(home, 'di.env'), 'utf8')

        await join(home)
        expect(fs.readFileSync(path.join(home, 'di.env'), 'utf8')).toContain('DI_PART=stage')

        await leaveStage({ home, run: recorder().run })
        expect(fs.readFileSync(path.join(home, 'di.env'), 'utf8')).toBe(before)
    })

    it('sets the machine name only when one was given, and unsets exactly that', async () => {
        const home = livedInHome()
        const before = fs.readFileSync(path.join(home, 'di.env'), 'utf8')
        await join(home, { name: 'win' })
        const env = fs.readFileSync(path.join(home, 'di.env'), 'utf8')
        expect(env).toContain('DI_MACHINE_NAME=win')
        expect(env).toContain('# written by hand')
        expect(env).toContain('ADMIN_API_TOKEN = abc')   // the hand-spaced line is not rewritten
        await leaveStage({ home, run: recorder().run })
        expect(fs.readFileSync(path.join(home, 'di.env'), 'utf8')).toBe(before)
    })

    it('keeps the follow when leave is told to', async () => {
        const home = livedInHome()
        await join(home)
        await leaveStage({ home, keepSpace: true, run: recorder().run })
        expect(Object.keys(readFollows(path.join(home, 'data')))).toEqual(['stage'])
        expect(readManifest(home)).toBe(null)
    })
})

describe('the manifest is the contract', () => {
    it('records every path it created, and the commands that take the OS entry away', async () => {
        const home = livedInHome()
        await join(home)
        const manifest = readManifest(home)
        const sp = stagePaths(home)

        expect(manifest.format).toBe('di.stage')
        expect(manifest.space).toBe('stage')
        const recorded = new Set(manifest.installed.map((entry) => entry.path))
        expect(recorded.has(sp.stage)).toBe(true)
        expect(recorded.has(sp.stagePid)).toBe(true)
        expect(recorded.has(sp.stageStatus)).toBe(true)
        expect(recorded.has(manifest.autostart.path)).toBe(true)
        expect(manifest.autostart.remove[0].command).toBe('systemctl')
        expect(manifest.envSet.map((entry) => entry.key)).toEqual(['DI_PART'])

        // The two directories that were already there are NOT recorded, so
        // leave cannot remove them.
        expect(recorded.has(path.join(home, 'logs'))).toBe(false)
        expect(recorded.has(path.join(home, 'run'))).toBe(false)
    })

    it('removes a path only because it is written down', async () => {
        const home = livedInHome()
        await join(home)
        // Somebody else's file, put where leave walks. It has to survive.
        const stranger = path.join(home, 'run', 'somebody-elses.pid')
        fs.writeFileSync(stranger, '999')
        await leaveStage({ home, run: recorder().run })
        expect(fs.existsSync(stranger)).toBe(true)
    })

    it('says so rather than guessing when it was never joined', async () => {
        expect(await leaveStage({ home: tempDir('di-stage-empty-'), run: recorder().run }))
            .toEqual({ ok: false, reason: 'not-joined' })
    })
})

describe('the autostart install', () => {
    it('writes the unit and then asks the OS to notice it, in that order', async () => {
        const home = livedInHome()
        const { calls, run } = recorder()
        const result = await installAutostart({ home, run })
        expect(result.spec.kind).toBe('systemd-user')
        expect(fs.existsSync(result.spec.path)).toBe(true)
        expect(calls).toEqual(['systemctl --user daemon-reload', 'systemctl --user enable --now di-stage.service'])
        expect(result.fallback).toBe(false)
    })

    it('falls back, and takes the refused entry back off the machine first', async () => {
        const home = livedInHome()
        const calls = []
        const run = (command) => {
            calls.push(`${command.command} ${command.args.join(' ')}`)
            // Every systemctl refuses — a box with no user session, which is
            // the case the fallback exists for.
            return command.command === 'systemctl'
                ? { ok: false, output: 'Failed to connect to bus' }
                : { ok: true, output: '' }
        }
        const result = await installAutostart({ home, run })
        expect(result.spec.kind).toBe('xdg-autostart')
        expect(result.fallback).toBe(true)
        expect(result.spec.restartsOnFailure).toBe(false)
        // and the systemd unit it could not enable is gone again
        expect(fs.existsSync(path.join(process.env.XDG_CONFIG_HOME, 'systemd', 'user', STAGE.unit))).toBe(false)
        expect(fs.existsSync(result.spec.path)).toBe(true)
        expect(calls.filter((call) => call.startsWith('systemctl')).length).toBeGreaterThan(0)
    })

    it('leaves a fallback entry behind exactly as cleanly', async () => {
        const home = livedInHome()
        const config = process.env.XDG_CONFIG_HOME
        const homeBefore = walk(home)
        const configBefore = walk(config)
        const run = (command) => (command.command === 'systemctl' ? { ok: false, output: 'no bus' } : { ok: true, output: '' })
        const joined = await joinStage({ home, spaceId: 'stage', from: remote.base, browser: '/bin/true', run })
        expect(joined.autostart.kind).toBe('xdg-autostart')
        await leaveStage({ home, run })
        expect(diff(homeBefore, walk(home))).toEqual([])
        expect(diff(configBefore, walk(config))).toEqual([])
    })
})

describe('join refuses before it writes', () => {
    it('will not join with no Chromium on the machine, and writes nothing', async () => {
        const home = livedInHome()
        const before = walk(home)
        // A candidate list that cannot match anything on any machine.
        const result = await joinStage({ home, spaceId: 'stage', from: remote.base, browser: null, run: recorder().run })
        if (result.ok) {
            // This machine HAS a Chromium — then the refusal cannot be tested
            // here, but the join must still be undoable.
            await leaveStage({ home, run: recorder().run })
            expect(diff(before, walk(home))).toEqual([])
            return
        }
        expect(result.reason).toBe('no-browser')
        expect(diff(before, walk(home))).toEqual([])
    })

    it('will not join a remote that is not answering, and writes nothing', async () => {
        const home = livedInHome()
        const before = walk(home)
        const result = await joinStage({
            home, spaceId: 'stage', from: 'http://127.0.0.1:1', browser: '/bin/true', run: recorder().run
        })
        expect(result).toMatchObject({ ok: false, reason: 'follow', why: 'unreachable' })
        expect(diff(before, walk(home))).toEqual([])
    })
})
