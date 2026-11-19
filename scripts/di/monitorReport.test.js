// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseArgs, COMMANDS } from './cli.mjs'
import { repoRoot, parseMonitorArgs, parseLedgerOpen, buildBody, systemdQuote, timerUnits, installTimer, stableCliPath, runMonitor, sendOnce } from './monitorReport.mjs'
import { writeLogin } from './loginStore.mjs'

const homes = []
const tmpHome = () => { const h = fs.mkdtempSync(path.join(os.tmpdir(), 'di-mon-')); homes.push(h); return h }
afterEach(() => { while (homes.length) fs.rmSync(homes.pop(), { recursive: true, force: true }) })

const entry = (token) => ({ token, base: 'https://dev.diiii.xyz/serverXR', site: 'https://dev.diiii.xyz', user: { id: 'u', name: 'u' }, expiresAt: Date.now() + 1e9, savedAt: Date.now() })
const quiet = () => { const out = []; const err = []; return { out, err, say: (l) => out.push(l), fail: (l) => err.push(l) } }

describe('arguments', () => {
    it('registers `monitor` and parses its subcommands', () => {
        expect(typeof COMMANDS.monitor).toBe('function')
        expect(parseMonitorArgs(parseArgs(['monitor', 'report', '--once']))).toMatchObject({ sub: 'report', once: true, every: 30 })
        expect(parseMonitorArgs(parseArgs(['monitor', 'report', '--every', '60']))).toMatchObject({ once: false, every: 60 })
        expect(parseMonitorArgs(parseArgs(['monitor', 'install-timer', '--remove']))).toEqual({ sub: 'install-timer', remove: true })
    })
    it('refuses a missing subcommand and a silly interval', () => {
        expect(parseMonitorArgs(parseArgs(['monitor'])).error).toMatch(/di monitor report/)
        expect(parseMonitorArgs(parseArgs(['monitor', 'report', '--every', '2'])).error).toMatch(/10 to 300/)
        expect(parseMonitorArgs(parseArgs(['monitor', 'report', '--every', 'x'])).error).toMatch(/10 to 300/)
    })
})

describe('ledger rows', () => {
    const text = [
        'ledger-open: warning line',
        'id       touched     who   state          the ask (newest first)',
        'N4365    11-13 20:59 agent NEW            relayed: fix the laser sizes',
        'N4364.1  11-13 20:58 owner WAITING        second ask',
        '(2 more not shown)'
    ].join('\n')
    it('parses id, touched, state and text', () => {
        expect(parseLedgerOpen(text)).toEqual([
            { id: 'N4365', touched: '11-13 20:59', state: 'NEW', text: 'relayed: fix the laser sizes' },
            { id: 'N4364.1', touched: '11-13 20:58', state: 'WAITING', text: 'second ask' }
        ])
    })
    it('a machine without the ledger (the snapshot copy) reports no asks', () => {
        expect(parseLedgerOpen(`ledger-open: this machine has no ledger; this is the read-only snapshot\n${text}`)).toEqual([])
        expect(parseLedgerOpen('')).toEqual([])
    })
})

describe('body and timer units', () => {
    it('the body carries host, panels, asks and only a known commit', () => {
        expect(buildBody({ host: 'a', snapshot: { panels: { x: 1 } }, asks: [], commit: 'abc1234' })).toEqual({ host: 'a', panels: { x: 1 }, asks: [], commit: 'abc1234' })
        expect(buildBody({ host: 'a', snapshot: null })).toEqual({ host: 'a', panels: {}, asks: [] })
    })
    it('the units run `monitor report --once` every 30 s', () => {
        const units = timerUnits({ node: '/usr/bin/node', cli: '/x/cli.mjs' })
        expect(units['di-monitor-report.service']).toContain('ExecStart="/usr/bin/node" "/x/cli.mjs" monitor report --once')
        expect(units['di-monitor-report.timer']).toContain('OnUnitActiveSec=30')
    })
    it('quotes the ExecStart paths for systemd: spaces kept, quote and backslash escaped, % and $ doubled', () => {
        expect(systemdQuote('/Users/a b/node')).toBe('"/Users/a b/node"')
        expect(systemdQuote('/x/"y"\\z')).toBe('"/x/\\"y\\"\\\\z"')
        expect(systemdQuote('/a%h/$HOME')).toBe('"/a%%h/$$HOME"')
        expect(timerUnits({ node: '/n d/node', cli: '/c d/cli.mjs' })['di-monitor-report.service']).toContain('ExecStart="/n d/node" "/c d/cli.mjs" monitor')
    })
    it('install writes both files and starts the timer; --remove undoes it', async () => {
        const home = tmpHome()
        const calls = []
        const exec = async (cmd, args) => { calls.push(args.join(' ')); return args.includes('is-active') ? 'active\n' : '' }
        const io = quiet()
        expect(await installTimer({ home, node: '/n', cli: '/c', exec, ...io })).toBe(0)
        const dir = path.join(home, '.config', 'systemd', 'user')
        expect(fs.readdirSync(dir).sort()).toEqual(['di-monitor-report.service', 'di-monitor-report.timer'])
        expect(calls).toContain('--user enable --now di-monitor-report.timer')
        expect(await installTimer({ home, node: '/n', cli: '/c', exec, remove: true, ...io })).toBe(0)
        expect(fs.readdirSync(dir)).toEqual([])
    })
    // aylmo 2026-11-19 23:30: the unit named .../versions/<old>/cli/cli.mjs, `di update` removed that folder, and 153 runs in a row
    // failed with "Cannot find module". An installed di is versions/<v>/ plus a `current` link (paths.mjs): the unit must name the link.
    const fakeVersion = (diRoot, name) => {
        const dir = path.join(diRoot, 'versions', name, 'cli')
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'cli.mjs'), `// ${name}\n`)
        return path.join(dir, 'cli.mjs')
    }
    const pointCurrent = (diRoot, name) => {
        fs.rmSync(path.join(diRoot, 'current'), { force: true })
        fs.symlinkSync(path.join('versions', name), path.join(diRoot, 'current'))
    }
    it('an installed di: the unit names the `current` link, so it still runs after `di update` removed the old version folder', async () => {
        const home = tmpHome()
        const diRoot = path.join(home, '.di')
        const v1 = fakeVersion(diRoot, '0.4.4-dev.aaaa1111')
        pointCurrent(diRoot, '0.4.4-dev.aaaa1111')
        const exec = async (cmd, args) => (args.includes('is-active') ? 'active\n' : '')
        expect(await installTimer({ home, diRoot, node: '/n', cliFile: v1, exec, ...quiet() })).toBe(0)
        const unit = fs.readFileSync(path.join(home, '.config', 'systemd', 'user', 'di-monitor-report.service'), 'utf8')
        const stable = path.join(diRoot, 'current', 'cli', 'cli.mjs')
        expect(unit).toContain(`ExecStart="/n" "${stable}" monitor report --once`)
        expect(unit).not.toContain('0.4.4-dev.aaaa1111')
        // `di update`: the next version arrives, the link moves, the old folder goes.
        fakeVersion(diRoot, '0.4.4-dev.bbbb2222')
        pointCurrent(diRoot, '0.4.4-dev.bbbb2222')
        fs.rmSync(path.join(diRoot, 'versions', '0.4.4-dev.aaaa1111'), { recursive: true })
        expect(fs.existsSync(v1)).toBe(false) // what the old unit named: this is what failed on aylmo
        expect(fs.readFileSync(stable, 'utf8')).toContain('bbbb2222') // what the unit names now reaches the new version
    })
    it('a source tree (no ~/.di/current) keeps the running file; a link to another copy is not swapped in', () => {
        const home = tmpHome()
        const diRoot = path.join(home, '.di')
        const running = path.join(home, 'src', 'cli.mjs')
        fs.mkdirSync(path.dirname(running), { recursive: true })
        fs.writeFileSync(running, '//\n')
        expect(stableCliPath({ cli: running, diRoot })).toBe(running)
        const other = fakeVersion(diRoot, 'other')
        pointCurrent(diRoot, 'other')
        expect(stableCliPath({ cli: running, diRoot })).toBe(running)
        expect(stableCliPath({ cli: other, diRoot })).toBe(path.join(diRoot, 'current', 'cli', 'cli.mjs'))
    })
    it('install fails loudly when systemd did not start the timer', async () => {
        const io = quiet()
        expect(await installTimer({ home: tmpHome(), exec: async () => 'inactive', ...io })).toBe(1)
        expect(io.err[0]).toMatch(/did not start/)
    })
})

describe('sending', () => {
    const snapshot = { panels: { agents: { ok: true, rows: [] } } }
    const deps = (home, fetchImpl, extra = {}) => ({
        home, env: {}, hostname: 'studio.local', fetchImpl, collect: async () => snapshot, release: async () => ({ commit: 'abc1234', builtAt: null }), ledger: async () => '', ...extra
    })

    it('without a login it says so and sends nothing', async () => {
        const io = quiet()
        let sent = false
        const code = await runMonitor(parseArgs(['monitor', 'report', '--once']), { ...deps(tmpHome(), async () => { sent = true }), ...io })
        expect(code).toBe(1)
        expect(sent).toBe(false)
        expect(io.err[0]).toMatch(/run di login/)
    })

    it('posts the body to the dev tier with the stored token in a header only', async () => {
        const home = tmpHome()
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_SECRET.value') })
        const seen = []
        const io = quiet()
        const fetchImpl = async (url, init) => { seen.push({ url, init }); return { ok: true, status: 200, json: async () => ({ ok: true }) } }
        const code = await runMonitor(parseArgs(['monitor', 'report', '--once']), { ...deps(home, fetchImpl, { ledger: async () => 'N1  11-16 01:00 agent NEW   an ask' }), ...io })
        expect(code).toBe(0)
        expect(seen[0].url).toBe('https://dev.diiii.xyz/serverXR/api/monitor/report')
        expect(seen[0].init.headers.Authorization).toBe('Bearer dii_cli_SECRET.value')
        const body = JSON.parse(seen[0].init.body)
        expect(body).toMatchObject({ host: 'studio', commit: 'abc1234', asks: [{ id: 'N1', text: 'an ask' }] })
        expect(JSON.stringify(io.out) + JSON.stringify(io.err) + seen[0].init.body).not.toContain('SECRET')
    })

    it('a 403 says the login is not an admin and stops; an unreachable server is one line', async () => {
        const home = tmpHome()
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_A.b') })
        const io = quiet()
        const code = await runMonitor(parseArgs(['monitor', 'report']), { ...deps(home, async () => ({ ok: false, status: 403, json: async () => ({ error: 'admins only' }) })), ...io })
        expect(code).toBe(1)
        expect(io.err[0]).toMatch(/not an admin/)
        const res = await sendOnce({ target: { base: 'https://x', host: 'x' }, token: 't', body: {}, fetchImpl: async () => { throw new Error('boom') } })
        expect(res).toEqual({ ok: false, status: 0, error: 'x is not reachable' })
    })

    it('without --once it repeats every N seconds', async () => {
        const home = tmpHome()
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_A.b') })
        let sends = 0
        const waits = []
        const io = quiet()
        await runMonitor(parseArgs(['monitor', 'report', '--every', '45']), { ...deps(home, async () => { sends += 1; return { ok: true, status: 200, json: async () => ({}) } }, { loops: 3, sleep: async (ms) => { waits.push(ms) } }), ...io })
        expect(sends).toBe(3)
        expect(waits).toEqual([45000, 45000])
    })
})

describe('repoRoot', () => {
    const make = (layout) => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'di-root-'))
        fs.mkdirSync(path.join(base, 'serverXR', 'src'), { recursive: true })
        fs.writeFileSync(path.join(base, 'serverXR', 'src', 'monitorStore.js'), '')
        fs.mkdirSync(path.join(base, ...layout), { recursive: true })
        return base
    }
    it('finds serverXR from the repo layout (scripts/di)', () => {
        const base = make(['scripts', 'di'])
        expect(repoRoot(path.join(base, 'scripts', 'di'))).toBe(base)
    })
    it('finds serverXR from the installed layout (cli)', () => {
        const base = make(['cli'])
        expect(repoRoot(path.join(base, 'cli'))).toBe(base)
    })
})
