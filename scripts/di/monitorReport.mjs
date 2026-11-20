/**
 * `di monitor report [--once] [--tier dev|prod|--to URL]` and `di monitor install-timer [--remove]`.
 * Sends THIS machine's monitor panels to the dev tier, where the owner's overview (Preferences → Monitor,
 * /admin#monitor) shows them next to every other machine's. Server side: serverXR/src/monitorHub.js and
 * routes/monitorRoutes.js (POST /api/monitor/report).
 *
 * The login is the one `di login` stored (resolveTarget picks the server, default dev; DI_TOKEN wins, as everywhere).
 * The token goes in a header only: never printed, never in argv, never in an error line. The account must be an admin;
 * anyone else is told so by the server (403) and nothing is stored.
 * The panels come from serverXR's own monitorStore (the same collectors the page uses); the commands that run come only
 * from ~/.di/monitor.json, never from the network.
 *
 * Pure parts are exported for tests: arg parsing, the ledger parser, the report body, the timer units.
 */
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readLogin } from './loginStore.mjs'
import { resolveTarget } from './login.mjs'
import { diHome, paths } from './paths.mjs'
import { runFeed } from './monitorFeed.mjs'

export const USAGE = [
    'di monitor report [--once] [--every N] [--tier dev|prod | --to URL]   send this machine\'s panels to the overview',
    'di monitor install-timer [--remove]                                  a user timer that does it every 30 seconds',
    '',
    'Needs `di login` as an admin. Without --once it keeps sending every 30 seconds (--every 10..300).',
    '',
    'di monitor feed add chats --command "<cmd>" [--check] [--dry-run]    set where this machine\'s chats come from (credits too)',
    'di monitor feed remove chats | di monitor feed list                  undo it | show what is set'
].join('\n')

export const EVERY_SECONDS = 30
const LEDGER_ROW = /^(N\d+(?:\.\d+)?)\s+(\d\d-\d\d \d\d:\d\d)\s+(\S+)\s+(\S+)\s+(.*)$/

/** { sub, once, every } or { error } from the parsed `di` args. */
export const parseMonitorArgs = (args) => {
    const sub = args._?.[1]
    const flags = args.flags || {}
    if (sub === 'feed') return { sub }
    if (sub !== 'report' && sub !== 'install-timer') return { error: USAGE }
    if (sub === 'install-timer') return { sub, remove: Boolean(flags.remove) }
    let every = EVERY_SECONDS
    if (flags.every !== undefined) {
        every = Number(flags.every)
        if (!Number.isInteger(every) || every < 10 || every > 300) return { error: '--every takes whole seconds from 10 to 300' }
    }
    return { sub, once: Boolean(flags.once), every }
}

/** The open rows of `ledger-open` output as the contract's asks; a machine without a ledger reports none. */
export const parseLedgerOpen = (text) => {
    const lines = String(text || '').split('\n')
    // the snapshot copy a machine without the ledger prints is aylmo's, not this machine's: aylmo reports it itself
    if (lines.slice(0, 3).some((l) => /has no ledger/i.test(l))) return []
    const rows = []
    for (const line of lines) {
        const m = LEDGER_ROW.exec(line)
        if (m) rows.push({ id: m[1], touched: m[2], state: m[4], text: m[5].trim().slice(0, 400) })
        if (rows.length >= 100) break
    }
    return rows
}

export const buildBody = ({ host, snapshot, asks = [], commit = null, builtAt = null }) => ({
    host,
    panels: snapshot?.panels || {},
    asks,
    ...(commit ? { commit } : {}),
    ...(builtAt ? { builtAt } : {})
})

const execText = (cmd, args, opts = {}) => new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000, maxBuffer: 1024 * 1024, ...opts }, (error, stdout) => resolve(error ? '' : String(stdout)))
})

const here = () => path.dirname(fileURLToPath(import.meta.url))

/**
 * The folder that holds serverXR/src/monitorStore.js. This file sits two levels below it in the repo (scripts/di/)
 * but one level below it in an installed di (cli/), so walk up until the collector is found.
 */
export const repoRoot = (start = here()) => {
    let dir = start
    for (let i = 0; i < 4; i += 1) {
        if (fs.existsSync(path.join(dir, 'serverXR', 'src', 'monitorStore.js'))) return dir
        dir = path.dirname(dir)
    }
    return path.resolve(start, '..', '..')
}

/** This machine's panels, from the server's own collectors. */
export const collectSnapshot = async ({ root = repoRoot() } = {}) => {
    const require = createRequire(import.meta.url)
    const { createMonitorStore } = require(path.join(root, 'serverXR', 'src', 'monitorStore.js'))
    // no realtime hub in this process: nobody is "connected" here
    const store = createMonitorStore({ connections: { spaces: new Map(), projects: new Map() }, repoDir: root })
    return store.getMonitor({ selfBase: null })
}

export const readRelease = async ({ root = repoRoot() } = {}) => {
    try {
        const file = [path.join(root, 'serverXR', 'release.json'), path.join(root, 'release.json')].find((f) => fs.existsSync(f))
        const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
        const commit = manifest.gitCommit || manifest.git?.commit
        if (commit) return { commit: String(commit), builtAt: manifest.generatedAt || null }
    } catch { /* not a staged release: ask git */ }
    const commit = (await execText('git', ['-C', root, 'rev-parse', 'HEAD'])).trim()
    return { commit: /^[0-9a-f]{40}$/.test(commit) ? commit : null, builtAt: null }
}

/** One send. Returns { ok, status, error }. Never prints the token. */
export const sendOnce = async ({ target, token, body, fetchImpl = globalThis.fetch }) => {
    try {
        const response = await fetchImpl(`${target.base}/api/monitor/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000)
        })
        const answer = await response.json().catch(() => ({}))
        return { ok: response.ok, status: response.status, error: response.ok ? null : (answer?.error || `failed (${response.status})`) }
    } catch {
        return { ok: false, status: 0, error: `${target.host} is not reachable` }
    }
}

const SERVICE = 'di-monitor-report.service'
const TIMER = 'di-monitor-report.timer'

/** One word of an ExecStart line, quoted for systemd: \\ and " escaped, % and $ doubled (specifiers, variables). */
export const systemdQuote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%').replace(/\$/g, '$$$$')}"`

/** The two unit files. `node` and `cli` are absolute paths so the timer does not depend on a login shell. */
export const timerUnits = ({ node, cli, every = EVERY_SECONDS }) => ({
    [SERVICE]: [
        '[Unit]',
        'Description=Send this machine to the di.iiii overview (di monitor report --once)',
        '',
        '[Service]',
        'Type=oneshot',
        `ExecStart=${systemdQuote(node)} ${systemdQuote(cli)} monitor report --once`,
        'TimeoutStartSec=60',
        ''
    ].join('\n'),
    [TIMER]: [
        '[Unit]',
        'Description=Every few seconds, tell the di.iiii overview how this machine is',
        '',
        '[Timer]',
        'OnBootSec=30',
        `OnUnitActiveSec=${every}`,
        'AccuracySec=5',
        '',
        '[Install]',
        'WantedBy=timers.target',
        ''
    ].join('\n')
})

/**
 * The cli.mjs a timer should run. An installed di keeps one folder per version (paths.mjs); `di update` keeps the new version and the
 * one before it (`pruneVersions`) and removes the rest, so a unit that names a version folder runs through one update and stops at the
 * second (aylmo, 2026-11-19: updates at 21:55 and 23:30; every run after the second failed with "Cannot find module
 * .../versions/<old>/cli/cli.mjs"). `current` is the link the `di` shim itself follows: use it when it leads to THIS copy. A source
 * tree has no such link, and a link that leads to another copy is not swapped in: the running file stays (and `installTimer` says so).
 */
const FILE_NOT_THERE = new Set(['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES'])
export const stableCliPath = ({ cli, diRoot = diHome() } = {}) => {
    // a call without `cli` is a bug in the caller, and it must stay loud: a unit must never name `undefined`
    if (typeof cli !== 'string' || !cli) throw new TypeError('stableCliPath needs `cli`, the file that is running')
    const viaCurrent = path.join(paths(diRoot).current, 'cli', 'cli.mjs')
    try {
        if (fs.realpathSync(viaCurrent) === fs.realpathSync(cli)) return viaCurrent
    } catch (error) {
        // no installed di here (no `current` link, or one that leads nowhere): the running file is the only path there is.
        // Any other error is not "no installed di": it stays loud.
        if (!FILE_NOT_THERE.has(error?.code)) throw error
    }
    return cli
}

export const installTimer = async ({ home = os.homedir(), diRoot = diHome(), node = process.execPath, cliFile = path.join(here(), 'cli.mjs'), cli = stableCliPath({ cli: cliFile, diRoot }), remove = false, exec = execText, say = console.log, fail = console.error } = {}) => {
    const dir = path.join(home, '.config', 'systemd', 'user')
    const units = timerUnits({ node, cli })
    if (remove) {
        await exec('systemctl', ['--user', 'disable', '--now', TIMER])
        for (const name of Object.keys(units)) fs.rmSync(path.join(dir, name), { force: true })
        await exec('systemctl', ['--user', 'daemon-reload'])
        say('the monitor timer is off and its two unit files are removed')
        return 0
    }
    fs.mkdirSync(dir, { recursive: true })
    for (const [name, text] of Object.entries(units)) fs.writeFileSync(path.join(dir, name), text, { mode: 0o644 })
    await exec('systemctl', ['--user', 'daemon-reload'])
    const out = await exec('systemctl', ['--user', 'enable', '--now', TIMER])
    const active = (await exec('systemctl', ['--user', 'is-active', TIMER])).trim()
    if (active !== 'active') { fail(`the timer files are in ${dir} but systemd did not start it${out ? `: ${out.trim()}` : ''}`); return 1 }
    say(`monitor timer on: ${TIMER}, every ${EVERY_SECONDS} s. undo: di monitor install-timer --remove`)
    // a unit that names a source tree or a version folder dies with that folder (a removed worktree, the second `di update`): say so
    const link = path.join(paths(diRoot).current, 'cli', 'cli.mjs')
    if (cli !== link) say(`note: the timer runs ${cli}, not the installed di (${link}), and stops when that folder is removed. To follow updates, install di and run di monitor install-timer from it.`)
    return 0
}

/** Runs `di monitor …`; returns the exit code. deps are injectable for tests. */
export const runMonitor = async (args, deps = {}) => {
    const { env = process.env, home = os.homedir(), hostname = os.hostname(), fetchImpl = globalThis.fetch, say = console.log, fail = console.error,
        collect = collectSnapshot, release = readRelease, ledger = () => execText('ledger-open', []), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), loops = Infinity } = deps
    const parsed = parseMonitorArgs(args)
    if (parsed.error) { fail(parsed.error); return 1 }
    if (parsed.sub === 'install-timer') return installTimer({ home, remove: parsed.remove, say, fail, ...(deps.timer || {}) })

    if (parsed.sub === 'feed') return runFeed(args, { env, home, say, fail, root: repoRoot(), ...(deps.feed || {}) })

    const target = resolveTarget(args.flags || {})
    if (target.error) { fail(target.error); return 1 }
    const token = String(env.DI_TOKEN || '').trim() || readLogin({ home, key: target.key })?.token || ''
    if (!token) { fail(`not signed in to ${target.host}: run di login`); return 1 }

    let round = 0
    for (;;) {
        round += 1
        let snapshot
        try { snapshot = await collect() } catch (error) { fail(`could not read this machine: ${String(error?.message || error).split('\n')[0]}`); return 1 }
        const { commit, builtAt } = await release()
        const asks = parseLedgerOpen(await ledger())
        const result = await sendOnce({ target, token, body: buildBody({ host: String(hostname).split('.')[0], snapshot, asks, commit, builtAt }), fetchImpl })
        if (!result.ok) {
            const why = result.status === 401 ? `not signed in to ${target.host}: run di login`
                : result.status === 403 ? `${target.host} says this login is not an admin`
                : result.error
            fail(why)
            if (parsed.once || result.status === 401 || result.status === 403) return 1
        } else if (parsed.once) {
            say(`sent to ${target.host}: ${Object.keys(snapshot.panels || {}).length} panels, ${asks.length} asks`)
            return 0
        }
        if (round >= loops) return 0
        await sleep(parsed.every * 1000)
    }
}
