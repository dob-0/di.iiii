// @vitest-environment node
//
// The no-hands job: timer text, heat guard, one log line per run.
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
    HEAT_LIMIT_C, HUB_DOWN_LOUD_AFTER, isHubDown, enable, disable, logFile, parsePackageTemp, readPackageTemp, refreshTimer, runAutoUpdate, statusLines, statusOf, unitTexts
} from './autoupdate.mjs'
import { readState, writeState } from './state.mjs'

const homes = []
const makeHome = async (state = {}) => {
    const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-auto-'))
    homes.push(home)
    await writeState(home, state)
    return home
}
afterEach(async () => { while (homes.length) await fsp.rm(homes.pop(), { recursive: true, force: true }) })

const at = new Date('2026-10-05T10:00:00Z')
const logLines = (home) => fs.readFileSync(logFile(home), 'utf8').trim().split('\n')

describe('the timer unit text', () => {
    const { service, timer } = unitTexts({ home: '/home/x/.di', shim: '/home/x/.di/bin/di' })
    it('runs every 5 minutes, spread by a random delay, and catches up after a reboot or sleep', () => {
        expect(timer).toContain('OnCalendar=*:0/5')
        expect(timer).toContain('RandomizedDelaySec=60')
        expect(timer).toContain('Persistent=true')
        expect(timer).toContain('WantedBy=timers.target')
    })
    it('runs the install\'s own shim, niced, one shot, pointed at its DI_HOME', () => {
        expect(service).toContain('Type=oneshot')
        expect(service).toContain('Nice=10')
        expect(service).toContain('Environment=DI_HOME=/home/x/.di')
        expect(service).toContain('ExecStart=/home/x/.di/bin/di autoupdate run')
    })
    it('puts the node that enabled it first on PATH, so systemd never picks /usr/bin/node (10-05: di stayed down after every update)', () => {
        const { service: s } = unitTexts({ home: '/home/x/.di', shim: '/home/x/.di/bin/di', nodeDir: '/home/x/.local/opt/node-v22/bin' })
        expect(s).toContain('Environment=PATH=/home/x/.local/opt/node-v22/bin:/usr/local/bin:/usr/bin:/bin')
        expect(service).toMatch(/^Environment=PATH=[^:\n]+:\/usr\/local\/bin/m)
    })
})

describe('refreshTimer', () => {
    const setup = async (text) => {
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-units-'))
        homes.push(dir)
        const home = await makeHome()
        if (text !== null) await fsp.writeFile(path.join(dir, 'di-autoupdate.timer'), text)
        const calls = []
        return { dir, home, calls, run: (args) => { calls.push(args.join(' ')); return { ok: true, output: '' } } }
    }
    it('rewrites an old 15-minute timer and restarts it', async () => {
        const t = await setup('[Timer]\nOnCalendar=*:0/15\n')
        const result = await refreshTimer({ home: t.home, run: t.run, dir: t.dir })
        expect(result).toEqual({ changed: true, ok: true })
        expect(fs.readFileSync(path.join(t.dir, 'di-autoupdate.timer'), 'utf8')).toContain('OnCalendar=*:0/5')
        expect(t.calls).toEqual(['daemon-reload', 'restart di-autoupdate.timer'])
    })
    it('leaves a current timer alone, and an install with automatic updates off', async () => {
        const home = await makeHome()
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-units-'))
        homes.push(dir)
        const t = await setup(null)
        expect(await refreshTimer({ home: t.home, run: t.run, dir: t.dir })).toEqual({ changed: false })
        await enable({ home, run: t.run, dir })
        t.calls.length = 0
        expect(await refreshTimer({ home, run: t.run, dir })).toEqual({ changed: false })
        expect(t.calls).toEqual([])
    })
})

describe('on / off', () => {
    it('writes both units, enables the timer, and off removes every file', async () => {
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-units-'))
        homes.push(dir)
        const calls = []
        const run = (args) => { calls.push(args.join(' ')); return { ok: true, output: '' } }
        const home = await makeHome()
        expect((await enable({ home, run, dir })).ok).toBe(true)
        expect(fs.readdirSync(dir).sort()).toEqual(['di-autoupdate.service', 'di-autoupdate.timer'])
        expect(calls).toEqual(['daemon-reload', 'enable --now di-autoupdate.timer'])
        await disable({ run, dir })
        expect(fs.readdirSync(dir)).toEqual([])
        expect(calls).toContain('disable --now di-autoupdate.timer')
    })
    it('says why when systemd refuses, rather than claiming it is on', async () => {
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-units-'))
        homes.push(dir)
        const home = await makeHome()
        const out = await enable({ home, dir, run: () => ({ ok: false, output: 'Failed to connect to bus' }) })
        expect(out).toEqual({ ok: false, why: 'Failed to connect to bus' })
    })
})

describe('the heat guard', () => {
    it('reads Package id from sensors output', () => {
        expect(parsePackageTemp('Package id 0:  +62.0°C  (high = +100.0°C, crit = +100.0°C)')).toBe(62)
        expect(parsePackageTemp('nothing here')).toBeNull()
    })
    it('falls back to the kernel thermal zone when sensors is missing', async () => {
        const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-therm-'))
        homes.push(root)
        await fsp.mkdir(path.join(root, 'thermal_zone0'))
        await fsp.writeFile(path.join(root, 'thermal_zone0', 'type'), 'x86_pkg_temp\n')
        await fsp.writeFile(path.join(root, 'thermal_zone0', 'temp'), '71000\n')
        expect(readPackageTemp({ exec: () => { throw new Error('no sensors') }, thermalRoot: root })).toBe(71)
    })
    it('skips the update above 85 C and logs why — one line, no update attempted', async () => {
        const home = await makeHome({ channel: 'dev' })
        let ran = false
        const out = await runAutoUpdate({ home, now: () => at, temp: () => 91, update: async () => { ran = true; return { code: 0, output: '' } } })
        expect(ran).toBe(false)
        expect(out.outcome).toBe('skipped-heat')
        const lines = logLines(home)
        expect(lines).toHaveLength(1)
        expect(lines[0]).toContain('skipped-heat')
        expect(lines[0]).toContain(`> ${HEAT_LIMIT_C} C`)
        expect(readState(home).autoupdate.lastOutcome).toBe('skipped-heat')
    })
})

describe('one log line per run, failures included', () => {
    it('runs the update on the remembered channel and records an update', async () => {
        const home = await makeHome({ channel: 'dev', version: '0.4.16-dev.aaaaaaaa' })
        let seen
        const out = await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async ({ channel }) => { seen = channel; return { code: 0, output: 'installing\n0.4.16-dev.aaaaaaaa → 0.4.16-dev.cccccccc' } } })
        expect(seen).toBe('dev')
        expect(out.outcome).toBe('updated')
        expect(logLines(home)).toHaveLength(1)
        expect(readState(home).autoupdate.lastUpdate).toBe(at.toISOString())
    })
    it('defaults to stable and calls "already the newest" up-to-date', async () => {
        const home = await makeHome()
        let seen
        const out = await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async ({ channel }) => { seen = channel; return { code: 0, output: 'x — already the newest.' } } })
        expect(seen).toBe('stable')
        expect(out.outcome).toBe('up-to-date')
    })
    it('records a hub that is ahead of CI as pending, not as an error', async () => {
        const home = await makeHome({ channel: 'dev' })
        const out = await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 0, output: 'the hub serves abcd1234 and no dev build of it is published yet — try again in a few minutes' }) })
        expect(out.outcome).toBe('pending')
        expect(readState(home).autoupdate.lastError).toBeNull()
    })
    it('a failed update is a log line and a lastError, never silence', async () => {
        const home = await makeHome({ channel: 'dev' })
        const out = await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 1, output: 'checksum mismatch — refusing to install' }) })
        expect(out.outcome).toBe('failed')
        expect(logLines(home)[0]).toContain('checksum mismatch')
        expect(readState(home).autoupdate.lastError.message).toContain('checksum mismatch')
    })
    it('logs the reason a failed update gave, not the boilerplate line after it', async () => {
        const home = await makeHome({ channel: 'dev' })
        const output = ['installing 0.5.0', '\u001b[31mUnknown system error -122: Unknown system error -122, cp\u001b[0m', 'update failed, still on 0.4.16. your work was not touched.'].join('\n')
        const out = await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 1, output }) })
        expect(out.outcome).toBe('failed')
        expect(logLines(home)[0]).toContain('Unknown system error -122')
        expect(logLines(home)[0]).not.toContain('update failed')
        expect(readState(home).autoupdate.lastError.message).toBe('Unknown system error -122: Unknown system error -122, cp')
    })
    it('a hub that is down (5xx / no network) is "hub-down", a logged wait with exit 0 - not a failure of this install', async () => {
        const home = await makeHome({ channel: 'dev' })
        const hubDown = ['could not read the hub\'s health (https://dev.diiii.xyz: 503; server cloudflare; after 3 retries; no body)', 'fetch failed', 'getaddrinfo ENOTFOUND dev.diiii.xyz']
        for (const output of hubDown) {
            const out = await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 1, output }) })
            expect(out.outcome).toBe('hub-down')
            expect(out.failed).toBe(false)
        }
        expect(logLines(home)[0]).toContain('hub-down')
        expect(logLines(home)[0]).toContain('503')
        expect(readState(home).autoupdate.lastError.message).toContain('ENOTFOUND')
    })
    it('a hub answer that is NOT an outage (404, checksum, EACCES) stays a failure', async () => {
        const home = await makeHome({ channel: 'dev' })
        for (const output of ['could not read the hub\'s health (https://dev.diiii.xyz: 404; no body)', 'checksum mismatch', 'EACCES: permission denied']) {
            const out = await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 1, output }) })
            expect(out.outcome).toBe('failed')
            expect(out.failed).toBe(true)
        }
    })
    it('a hub down for 12 runs in a row (one hour) turns loud: failed, with the count', async () => {
        const home = await makeHome({ channel: 'dev' })
        const down = () => runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 1, output: 'fetch failed' }) })
        for (let i = 1; i < HUB_DOWN_LOUD_AFTER; i++) expect((await down()).failed).toBe(false)
        const loud = await down()
        expect(loud.outcome).toBe('failed')
        expect(loud.failed).toBe(true)
        expect(loud.detail).toContain(`hub unreachable for ${HUB_DOWN_LOUD_AFTER} runs`)
    })
    it('one good run resets the hub-down count', async () => {
        const home = await makeHome({ channel: 'dev' })
        await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 1, output: 'fetch failed' }) })
        await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 0, output: 'already the newest' }) })
        expect(readState(home).autoupdate.hubDownRuns).toBe(0)
    })
    it.each([['a string', 'abc'], ['a numeric string', '5'], ['null (NaN is stored as null)', null], ['a negative number', -50], ['a float', 2.5], ['an object', { x: 1 }], ['an array', [3]]])(
        'a garbage hubDownRuns in the state file (%s) still turns loud at the limit', async (_name, garbage) => {
            const home = await makeHome({ channel: 'dev', autoupdate: { hubDownRuns: garbage } })
            const down = () => runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 1, output: 'fetch failed' }) })
            for (let i = 1; i < HUB_DOWN_LOUD_AFTER; i++) expect((await down()).failed).toBe(false)
            expect(Number.isInteger(readState(home).autoupdate.hubDownRuns)).toBe(true)
            const loud = await down()
            expect(loud.failed).toBe(true)
            expect(loud.detail).toContain(`hub unreachable for ${HUB_DOWN_LOUD_AFTER} runs`)
        })
    it('a heat skip does not reset the hub-down count: down, hot, down ... still reaches the limit', async () => {
        const home = await makeHome({ channel: 'dev' })
        const down = () => runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 1, output: 'fetch failed' }) })
        const hot = () => runAutoUpdate({ home, now: () => at, temp: () => HEAT_LIMIT_C + 5, update: async () => { throw new Error('must not run while hot') } })
        for (let i = 0; i < 6; i++) await down()
        expect((await hot()).outcome).toBe('skipped-heat')
        expect(readState(home).autoupdate.hubDownRuns).toBe(6)
        for (let i = 0; i < 4; i++) await down()
        await hot()
        const eleventh = await down()
        expect(eleventh.failed).toBe(false)
        expect((await down()).failed).toBe(true)
    })
    // The classifier, every branch. Table: [reason text, outcome]. Choices that are not obvious are commented.
    const health = (code) => `could not read the hub's health (https://dev.diiii.xyz: ${code}; no body)`
    it.each([
        // status codes inside the hub-health message: 429 (rate limit) and every 5xx are the hub's state
        [health(429), 'hub-down'],
        // 500 is hub-down ON PURPOSE here (regex 5\d\d): a deploy restarts the hub, so a 500 is an outage for a few ticks; the 12-run limit keeps it loud if it lasts
        [health(500), 'hub-down'],
        [health(502), 'hub-down'],
        [health(503), 'hub-down'],
        [health(504), 'hub-down'],
        [health(530), 'hub-down'], // Cloudflare: origin unreachable
        // network errors: the machine cannot reach the hub right now (no network, DNS, refused, reset, timeout)
        ['fetch failed', 'hub-down'],
        ['getaddrinfo ENOTFOUND dev.diiii.xyz', 'hub-down'], // DNS name not found: no network or DNS is down on this machine, a wait like EAI_AGAIN
        ['getaddrinfo EAI_AGAIN dev.diiii.xyz', 'hub-down'], // DNS temporary failure
        ['connect ECONNREFUSED 127.0.0.1:4000', 'hub-down'],
        ['read ECONNRESET', 'hub-down'],
        ['connect ETIMEDOUT 1.2.3.4:443', 'hub-down'],
        // everything else is a real fault of this install or of the request and stays loud at once
        [health(401), 'failed'], // we are not allowed: needs a person, never a wait
        [health(403), 'failed'],
        [health(404), 'failed'], // the hub answers but the thing is gone: not an outage
        [health(400), 'failed'],
        [health(200), 'failed'],
        ['checksum mismatch', 'failed'],
        ['EACCES: permission denied', 'failed'],
        ['something unexpected', 'failed']
    ])('classifies "%s" as %s', async (output, expected) => {
        const home = await makeHome({ channel: 'dev' })
        const out = await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 1, output }) })
        expect(out.outcome).toBe(expected)
        expect(out.failed).toBe(expected === 'failed')
        expect(isHubDown(output)).toBe(expected === 'hub-down')
    })
    it('status shows how many hub-down runs are counted', async () => {
        const home = await makeHome({ channel: 'dev' })
        for (let i = 0; i < 3; i++) await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 1, output: 'fetch failed' }) })
        const text = statusLines(statusOf({ home, dir: home, run: () => ({ ok: false, output: '' }) })).join('\n')
        expect(text).toContain(`hub-down, 3 of ${HUB_DOWN_LOUD_AFTER} runs`)
    })
    it('says so when it could not read the temperature', async () => {
        const home = await makeHome()
        await runAutoUpdate({ home, now: () => at, temp: () => null, update: async () => ({ code: 0, output: 'already the newest.' }) })
        expect(logLines(home)[0]).toContain('heat guard not applied')
    })
    it('di status shows last check, last update and last error', async () => {
        const home = await makeHome({ channel: 'dev' })
        await runAutoUpdate({ home, now: () => at, temp: () => 50, update: async () => ({ code: 1, output: 'boom' }) })
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-units-'))
        homes.push(dir)
        const text = statusLines(statusOf({ home, dir, run: () => ({ ok: false, output: '' }) })).join('\n')
        expect(text).toContain('off · channel dev')
        expect(text).toContain('last check   2026-10-05T10:00:00.000Z (failed)')
        expect(text).toContain('last error   2026-10-05T10:00:00.000Z boom')
    })
})
