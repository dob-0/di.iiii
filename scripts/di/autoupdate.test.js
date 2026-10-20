// @vitest-environment node
//
// The no-hands job: timer text, heat guard, one log line per run.
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
    HEAT_LIMIT_C, enable, disable, logFile, parsePackageTemp, readPackageTemp, runAutoUpdate, statusLines, statusOf, unitTexts
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
    it('runs every 15 minutes and catches up after a reboot or sleep', () => {
        expect(timer).toContain('OnCalendar=*:0/15')
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
