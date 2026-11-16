// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseArgs, COMMANDS } from './cli.mjs'
import { parseMonitorArgs, parseLedgerOpen, buildBody, parseRules, rulesPanel, hookName, hooksPanel, readHelpers, withKnowledge, systemdQuote, timerUnits, installTimer, runMonitor, sendOnce } from './monitorReport.mjs'
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

describe('rules, hooks and helpers panels (made-up files)', () => {
    const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i} of a made-up rule`)
    const claudeHome = (home, files) => { const d = path.join(home, '.claude'); fs.mkdirSync(d, { recursive: true }); for (const [n, t] of Object.entries(files)) fs.writeFileSync(path.join(d, n), t); return d }

    it('parseRules: one row per heading, the date from the heading or null, body lines, capped text', () => {
        const text = ['preface is ignored', '# First rule (2026-01-02)', 'a', '', 'b', '', '# Undated rule', ...lines(60), '## sub stays in the body'].join('\n')
        const rows = parseRules(text)
        expect(rows.map((r) => [r.title, r.date])).toEqual([['First rule (2026-01-02)', '2026-01-02'], ['Undated rule', null]])
        expect(rows[0]).toMatchObject({ lines: 3, text: 'a\n\nb' })
        expect(rows[1].lines).toBe(61)
        expect(rows[1].text.length).toBeLessThanOrEqual(400)
        expect(parseRules('')).toEqual([])
    })
    it('rulesPanel reads the file, and fails loudly when it is missing', () => {
        const home = tmpHome()
        expect(rulesPanel({ home })).toEqual({ ok: false, why: expect.stringMatching(/could not be read/) })
        claudeHome(home, { 'CLAUDE.md': '# A (2026-02-03)\nbody\n# B\nmore' })
        expect(rulesPanel({ home })).toMatchObject({ ok: true, file: '~/.claude/CLAUDE.md', count: 2, rows: [{ title: 'A (2026-02-03)' }, { title: 'B' }] })
    })
    it('hookName keeps the tool and subcommand only, never a path, env value, redirect or flag value', () => {
        expect(hookName('python3 -I -B /home/x/secret-dir/di-hooks resume-guard')).toBe('di-hooks resume-guard')
        expect(hookName('TOKEN=hunter2 /opt/a/b/tool 2>/dev/null || true')).toBe('tool')
        expect(hookName('env KEY=abc node /p/q/run.mjs intake --token abc')).toBe('run.mjs intake')
        expect(hookName('/p/q/script /etc/passwd')).toBe('script')
        expect(hookName('')).toBe('unknown')
        for (const c of ['TOKEN=hunter2 /opt/a/b/tool', 'python3 /home/x/secret-dir/t sub --token abc']) expect(hookName(c)).not.toMatch(/hunter2|secret-dir|abc|\//)
    })
    it('hooksPanel: user and repo scope, per-event counts, and a missing user file is ok:false', () => {
        const home = tmpHome()
        const root = tmpHome()
        expect(hooksPanel({ home }).ok).toBe(false)
        claudeHome(home, { 'settings.json': JSON.stringify({ env: { SECRET: 'x' }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'python3 /a/b/guard check' }] }], Stop: [{ hooks: [{ command: '/a/b/end' }, { command: '/a/b/end2 x' }] }] } }) })
        claudeHome(root, { 'settings.json': JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ command: 'node /r/start.mjs' }] }] } }) })
        const panel = hooksPanel({ home, root })
        expect(panel).toMatchObject({ ok: true, count: 4, events: { PreToolUse: 1, Stop: 2, SessionStart: 1 } })
        expect(panel.rows[0]).toEqual({ scope: 'user', event: 'PreToolUse', matcher: 'Bash', name: 'guard check' })
        expect(panel.rows.at(-1)).toMatchObject({ scope: 'repo', name: 'start.mjs' })
        expect(JSON.stringify(panel)).not.toMatch(/SECRET|\/a\/b/)
    })
    it('readHelpers lists recent helpers from file names, mtimes and the label only', () => {
        const home = tmpHome()
        const dir = path.join(home, '.claude', 'projects', 'p1', 'abcdef1234567890', 'subagents')
        fs.mkdirSync(dir, { recursive: true })
        const now = Date.now()
        const make = (id, ageMs, meta) => { const f = path.join(dir, `agent-${id}.jsonl`); fs.writeFileSync(f, 'TRANSCRIPT-NEVER-READ'); fs.utimesSync(f, (now - ageMs) / 1000, (now - ageMs) / 1000); if (meta) fs.writeFileSync(path.join(dir, `agent-${id}.meta.json`), JSON.stringify(meta)) }
        make('aaa', 30 * 1000, { agentType: 'general-purpose', description: 'a made-up label' })
        make('bbb', 10 * 60 * 1000, null)
        make('ccc', 3 * 3600 * 1000, { description: 'too old' })
        const rows = readHelpers({ home, now })
        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({ parent: 'abcdef12', label: 'a made-up label', type: 'general-purpose', model: null, busy: true })
        expect(rows[1]).toMatchObject({ label: null, busy: false })
        expect(JSON.stringify(rows)).not.toContain('TRANSCRIPT')
        expect(readHelpers({ home: tmpHome() })).toEqual([])
    })
    it('withKnowledge adds the panels; a 40-rule file and 100 asks keep the whole body under the server cap', () => {
        const home = tmpHome()
        const big = Array.from({ length: 40 }, (_, i) => `# Rule ${i} (2026-03-0${(i % 9) + 1})\n${'x'.repeat(900)}`).join('\n')
        const hooks = { hooks: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`Event${i}`, [{ matcher: 'Bash', hooks: Array.from({ length: 10 }, (_, j) => ({ command: `python3 -I /p/tool${j} sub-${j}` }))}]])) }
        claudeHome(home, { 'CLAUDE.md': big, 'settings.json': JSON.stringify(hooks) })
        const snap = withKnowledge({ panels: { agents: { rows: [] } } }, { home })
        expect(snap.panels.rules.count).toBe(40)
        expect(snap.panels.hooks.count).toBe(120)
        expect(snap.panels.agents.helpers).toEqual([])
        const asks = Array.from({ length: 100 }, (_, i) => ({ id: `N${i}`, touched: '11-16 00:00', state: 'NEW', text: 'y'.repeat(400) }))
        const body = JSON.stringify(buildBody({ host: 'h', snapshot: snap, asks }))
        expect(Buffer.byteLength(body)).toBeLessThan(256 * 1024)
    })
})
