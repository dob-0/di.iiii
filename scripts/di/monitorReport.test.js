// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs, COMMANDS } from './cli.mjs'
import { repoRoot, parseMonitorArgs, parseLedgerOpen, buildBody, systemdQuote, timerUnits, installTimer, launchdPlist, installLaunchAgent, stableCliPath, runMonitor, sendOnce, localBase } from './monitorReport.mjs'
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
    // aylmo 2026-11-19: the unit named .../versions/<old>/cli/cli.mjs; `di update` keeps the new version and the one before it, so the
    // folder went at the SECOND update (23:30) and 161 runs in a row failed with "Cannot find module". An installed di is versions/<v>/
    // plus a `current` link (paths.mjs): the unit must name the link.
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
    // an install root for the code under test to find through DI_HOME (what `diHome()` reads), put back afterwards
    const withDiHome = async (diRoot, run) => {
        const before = process.env.DI_HOME
        process.env.DI_HOME = diRoot
        try { return await run() } finally {
            if (before === undefined) delete process.env.DI_HOME
            else process.env.DI_HOME = before
        }
    }
    // an install whose `current` leads to a version whose `cli` folder IS this running copy: the link then leads to the file running now
    const installWithThisCopy = (diRoot, name) => {
        const version = path.join(diRoot, 'versions', name)
        fs.mkdirSync(version, { recursive: true })
        fs.symlinkSync(path.dirname(fileURLToPath(import.meta.url)), path.join(version, 'cli'))
        pointCurrent(diRoot, name)
        return path.join(diRoot, 'current', 'cli', 'cli.mjs')
    }
    it('an installed di: the unit names the `current` link, which still reaches the new version after `di update` removed the old folder', async () => {
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
        // the second `di update` after the install (the first keeps this folder as "the one before"): the link moves, the old folder goes.
        fakeVersion(diRoot, '0.4.4-dev.bbbb2222')
        pointCurrent(diRoot, '0.4.4-dev.bbbb2222')
        fs.rmSync(path.join(diRoot, 'versions', '0.4.4-dev.aaaa1111'), { recursive: true })
        expect(fs.existsSync(v1)).toBe(false) // what the old unit named: this is what failed on aylmo
        expect(fs.readFileSync(stable, 'utf8')).toContain('bbbb2222') // what the unit names now reaches the new version
    })
    it('installTimer with no `cli` and no `diRoot` (only DI_HOME set): the unit names that install\'s `current` link and prints no note', async () => {
        const home = tmpHome()
        const diRoot = path.join(home, 'elsewhere', '.di')
        const link = installWithThisCopy(diRoot, '0.4.4-dev.cccc3333')
        const exec = async (cmd, args) => (args.includes('is-active') ? 'active\n' : '')
        await withDiHome(diRoot, async () => {
            const io = quiet()
            expect(await installTimer({ home, node: '/n', exec, ...io })).toBe(0)
            const unit = fs.readFileSync(path.join(home, '.config', 'systemd', 'user', 'di-monitor-report.service'), 'utf8')
            expect(unit).toContain(`ExecStart="/n" "${link}" monitor report --once`)
            expect(io.out.join('\n')).not.toMatch(/note: the timer runs/) // it follows the installed di: nothing to warn about
        })
    })
    it('`di monitor install-timer` through the command entry (runMonitor) names the installed di\'s link, and --remove takes the units away', async () => {
        // the production call site: it passes no `cli` (that was the bug: it named the running file's physical path) and passes `remove` on
        const home = tmpHome()
        const diRoot = path.join(home, 'elsewhere', '.di')
        const link = installWithThisCopy(diRoot, '0.4.4-dev.ffff6666')
        const exec = async (cmd, args) => (args.includes('is-active') ? 'active\n' : '')
        const dir = path.join(home, '.config', 'systemd', 'user')
        await withDiHome(diRoot, async () => {
            expect(await runMonitor(parseArgs(['monitor', 'install-timer']), { home, timer: { node: '/n', exec }, ...quiet() })).toBe(0)
            expect(fs.readFileSync(path.join(dir, 'di-monitor-report.service'), 'utf8')).toContain(`ExecStart="/n" "${link}" monitor report --once`)
            expect(await runMonitor(parseArgs(['monitor', 'install-timer', '--remove']), { home, timer: { node: '/n', exec }, ...quiet() })).toBe(0)
            expect(fs.readdirSync(dir)).toEqual([])
        })
    })
    it('the default install root is DI_HOME: a running copy that is that install\'s `current` gets the link without `diRoot` being passed', async () => {
        const diRoot = path.join(tmpHome(), 'custom-root')
        const running = fakeVersion(diRoot, '0.4.4-dev.eeee5555')
        pointCurrent(diRoot, '0.4.4-dev.eeee5555')
        await withDiHome(diRoot, async () => {
            expect(stableCliPath({ cli: running })).toBe(path.join(diRoot, 'current', 'cli', 'cli.mjs'))
        })
    })
    it('a call without `cli` throws: a unit must never name `undefined`, and a real bug must not look like "no installed di"', () => {
        expect(() => stableCliPath({ diRoot: path.join(tmpHome(), '.di') })).toThrow()
    })
    it('a running copy reached through a symlink to its version folder still matches `current`', () => {
        const home = tmpHome()
        const diRoot = path.join(home, '.di')
        const real = fakeVersion(diRoot, '0.4.4-dev.dddd4444')
        pointCurrent(diRoot, '0.4.4-dev.dddd4444')
        const alias = path.join(home, 'alias-to-version')
        fs.symlinkSync(path.dirname(path.dirname(real)), alias)
        expect(stableCliPath({ cli: path.join(alias, 'cli', 'cli.mjs'), diRoot })).toBe(path.join(diRoot, 'current', 'cli', 'cli.mjs'))
    })
    it('a unit that has to name a source tree or another version says it will stop when that folder goes', async () => {
        const home = tmpHome()
        const exec = async (cmd, args) => (args.includes('is-active') ? 'active\n' : '')
        const io = quiet()
        const diRoot = path.join(home, '.di')
        expect(await installTimer({ home, diRoot, node: '/n', cli: '/work/tree/scripts/di/cli.mjs', exec, ...io })).toBe(0)
        // the whole line: the path it runs, the link it is not, why that matters, and what to do (a person reads exactly this)
        expect(io.out.filter((line) => line.startsWith('note:'))).toEqual([
            `note: the timer runs /work/tree/scripts/di/cli.mjs, not the installed di (${path.join(diRoot, 'current', 'cli', 'cli.mjs')}), and stops when that folder is removed. To follow updates, install di and run di monitor install-timer from it.`
        ])
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

describe('PATH for the timer and macOS launch agent', () => {
    it('the systemd service carries the caller\'s PATH so `ledger-open` is found', () => {
        const svc = timerUnits({ node: '/n', cli: '/c', envPath: '/h/.local/bin:/usr/bin' })['di-monitor-report.service']
        expect(svc).toContain('Environment="PATH=/h/.local/bin:/usr/bin"')
        expect(timerUnits({ node: '/n', cli: '/c' })['di-monitor-report.service']).not.toContain('Environment=')
    })
    it('the plist runs `monitor report --once` every 30 s and at login, escapes paths, carries PATH', () => {
        const text = launchdPlist({ node: '/n&d/node', cli: '/c/cli.mjs', logDir: '/h/.di', envPath: '/h/.local/bin:/usr/bin' })
        expect(text).toContain('<string>/n&amp;d/node</string>')
        expect(text).toContain('<string>monitor</string><string>report</string><string>--once</string>')
        expect(text).toContain('<key>StartInterval</key><integer>30</integer>')
        expect(text).toContain('<key>RunAtLoad</key><true/>')
        expect(text).toContain('<key>PATH</key><string>/h/.local/bin:/usr/bin</string>')
    })
    it('install writes the file and loads it; --remove undoes it', async () => {
        const home = tmpHome()
        const calls = []
        const exec = async (cmd, args) => { calls.push(`${cmd} ${args.join(' ')}`); return args[0] === 'print' ? 'xyz.diiii.monitor-report = {' : '' }
        const io = quiet()
        expect(await installLaunchAgent({ home, cli: '/c', node: '/n', uid: 501, exec, ...io })).toBe(0)
        const file = path.join(home, 'Library', 'LaunchAgents', 'xyz.diiii.monitor-report.plist')
        expect(fs.existsSync(file)).toBe(true)
        expect(calls).toContain('launchctl bootstrap gui/501 ' + file)
        expect(await installLaunchAgent({ home, uid: 501, exec, remove: true, ...io })).toBe(0)
        expect(fs.existsSync(file)).toBe(false)
    })
    it('install fails loudly when launchd did not load it', async () => {
        const io = quiet()
        expect(await installLaunchAgent({ home: tmpHome(), cli: '/c', uid: 501, exec: async () => '', ...io })).toBe(1)
        expect(io.err[0]).toMatch(/did not load/)
    })
    it('on darwin `install-timer` takes the launch-agent road', async () => {
        const io = quiet()
        const calls = []
        const code = await runMonitor({ _: ['monitor', 'install-timer'], flags: {} }, { home: tmpHome(), platform: 'darwin', timer: { node: '/n', cli: '/c', uid: 1, exec: async (c) => { calls.push(c); return 'xyz.diiii.monitor-report' } }, ...io })
        expect(code).toBe(0)
        expect(calls.every((c) => c === 'launchctl')).toBe(true)
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

describe('localBase (11-24)', () => {
    it('is the di command\'s own address from di.env, or null when di is not installed', () => {
        const home = tmpHome()
        expect(localBase({ home })).toBe(null)
        fs.writeFileSync(path.join(home, 'di.env'), 'PORT=4321\n')
        expect(localBase({ home })).toBe('http://localhost:4321')
    })
})
