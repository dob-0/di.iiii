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

export const USAGE = [
    'di monitor report [--once] [--every N] [--tier dev|prod | --to URL]   send this machine\'s panels to the overview',
    'di monitor install-timer [--remove]                                  a user timer that does it every 30 seconds',
    '',
    'Needs `di login` as an admin. Without --once it keeps sending every 30 seconds (--every 10..300).'
].join('\n')

export const EVERY_SECONDS = 30
const LEDGER_ROW = /^(N\d+(?:\.\d+)?)\s+(\d\d-\d\d \d\d:\d\d)\s+(\S+)\s+(\S+)\s+(.*)$/

/** { sub, once, every } or { error } from the parsed `di` args. */
export const parseMonitorArgs = (args) => {
    const sub = args._?.[1]
    const flags = args.flags || {}
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

// ---- rules, hooks and helpers: what guards and drives the agents --------------
// Read from this machine's own files; the panels carry titles, dates, counts and a short body cap, never a
// command line, an env value or a path beyond a file's basename. A file that cannot be read says so ({ ok:false, why }).

const RULE_TEXT_MAX = 400
const RULES_MAX = 80
const HOOKS_MAX = 120
const HELPERS_MAX = 40
const HELPER_RECENT_MS = 15 * 60 * 1000
const HELPER_BUSY_MS = 2 * 60 * 1000
const INTERPRETERS = new Set(['python', 'python3', 'node', 'bash', 'sh', 'zsh', 'env', 'nice', 'timeout'])

const mtimeIso = (file) => { try { return fs.statSync(file).mtime.toISOString() } catch { return null } }

/** One row per `# ` heading of a CLAUDE.md text: { title, date|null, lines, text }, in file order. */
export const parseRules = (text) => {
    const rows = []
    let current = null
    for (const line of String(text || '').split(/\r?\n/)) {
        const m = /^# +(.+?)\s*$/.exec(line)
        if (m) {
            current = { title: m[1].slice(0, 160), date: /\b(\d{4}-\d\d-\d\d)\b/.exec(m[1])?.[1] || null, body: [] }
            rows.push(current)
        } else if (current) current.body.push(line)
    }
    return rows.slice(0, RULES_MAX).map((r) => {
        while (r.body.length && !r.body[r.body.length - 1].trim()) r.body.pop()
        return { title: r.title, date: r.date, lines: r.body.length, text: r.body.join('\n').trim().slice(0, RULE_TEXT_MAX) }
    })
}

export const rulesPanel = ({ home = os.homedir() } = {}) => {
    const file = path.join(home, '.claude', 'CLAUDE.md')
    try {
        const rows = parseRules(fs.readFileSync(file, 'utf8'))
        return { ok: true, file: '~/.claude/CLAUDE.md', changed: mtimeIso(file), count: rows.length, rows }
    } catch { return { ok: false, why: 'the standing-rules file could not be read here' } }
}

/** The tool and its subcommand only: `python3 -I -B /x/di-hooks resume-guard 2>/dev/null` -> `di-hooks resume-guard`. */
export const hookName = (command) => {
    // quotes are stripped from every word first, so a quoted `bash -c "KEY=value …"` cannot carry a value past skipEnv
    const words = String(command || '').trim().split(/\s+/).map((w) => w.replace(/^["']+|["']+$/g, '')).filter(Boolean)
    let i = 0
    const skipEnv = () => { while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i += 1 } // env values never leave
    skipEnv()
    while (i < words.length && INTERPRETERS.has(path.basename(words[i]))) {
        i += 1
        while (i < words.length && (words[i].startsWith('-') || /^\d+$/.test(words[i]))) i += 1 // flags and their numbers (nice -n 19)
        skipEnv()
    }
    if (i >= words.length) return 'unknown'
    const tool = path.basename(words[i]).slice(0, 60)
    if (!tool || tool.includes('=')) return 'unknown' // never a value, whatever the shape
    const sub = words[i + 1]
    return /^[a-z][a-z0-9-]{0,30}$/.test(sub || '') ? `${tool} ${sub}` : tool
}

/** hook rows { scope, event, matcher|null, name } from a parsed settings object. */
export const hookRows = (settings, scope) => {
    const rows = []
    const hooks = settings && typeof settings === 'object' ? settings.hooks : null
    if (!hooks || typeof hooks !== 'object') return rows
    for (const [event, groups] of Object.entries(hooks)) {
        for (const group of Array.isArray(groups) ? groups : []) {
            for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
                rows.push({ scope, event: String(event).slice(0, 40), matcher: typeof group.matcher === 'string' ? group.matcher.slice(0, 80) : null, name: hookName(hook?.command) })
            }
        }
    }
    return rows
}

export const hooksPanel = ({ home = os.homedir(), root = null } = {}) => {
    const rows = []
    const files = [[path.join(home, '.claude', 'settings.json'), 'user'], ...(root ? [[path.join(root, '.claude', 'settings.json'), 'repo']] : [])]
    let userOk = false
    let changed = null
    for (const [file, scope] of files) {
        try {
            rows.push(...hookRows(JSON.parse(fs.readFileSync(file, 'utf8')), scope))
            if (scope === 'user') { userOk = true; changed = mtimeIso(file) }
        } catch { /* a repo without settings is normal; the user file is checked below */ }
    }
    if (!userOk) return { ok: false, why: 'the user hook settings could not be read here' }
    const events = {}
    for (const r of rows) events[r.event] = (events[r.event] || 0) + 1
    return { ok: true, changed, count: rows.length, events, rows: rows.slice(0, HOOKS_MAX) }
}

// ---- skills: what the agents can be told to do --------------------------------
// Only the SKILL.md frontmatter `name:` and `description:` (description capped); the body is never read past the
// closing `---` and never sent, and no path leaves except a plugin's name.

const SKILLS_MAX = 300
const SKILL_DESC_MAX = 200
const SKILL_NAME_MAX = 80

const unquote = (v) => v.replace(/^(["'])(.*)\1$/, '$2')

/** { name, description } from a SKILL.md text's frontmatter only; null when there is none or no name. */
export const parseSkillFrontmatter = (text) => {
    const lines = String(text || '').split(/\r?\n/)
    if (lines[0]?.trim() !== '---') return null
    const end = lines.indexOf('---', 1)
    if (end < 0) return null
    const fm = lines.slice(1, end)
    const field = (key) => {
        const i = fm.findIndex((l) => l.startsWith(`${key}:`))
        if (i < 0) return ''
        let v = fm[i].slice(key.length + 1).trim()
        if (/^[>|][+-]?$/.test(v)) { // folded or literal block: the indented lines that follow
            const parts = []
            for (let j = i + 1; j < fm.length && /^\s+\S/.test(fm[j]); j += 1) parts.push(fm[j].trim())
            v = parts.join(' ')
        } else if (v === '') { // plain multi-line scalar
            const parts = []
            for (let j = i + 1; j < fm.length && /^\s+\S/.test(fm[j]); j += 1) parts.push(fm[j].trim())
            v = parts.join(' ')
        }
        return unquote(v).replace(/\s+/g, ' ').trim()
    }
    const name = field('name').slice(0, SKILL_NAME_MAX)
    if (!name) return null
    return { name, description: field('description').slice(0, SKILL_DESC_MAX) }
}

const readSkillDir = (dir, scope, plugin) => {
    let names
    try { names = fs.readdirSync(dir) } catch { return [] }
    const rows = []
    for (const entry of names.sort()) {
        let text
        try { text = fs.readFileSync(path.join(dir, entry, 'SKILL.md'), 'utf8') } catch { continue }
        const fm = parseSkillFrontmatter(text.slice(0, 8192))
        if (fm) rows.push({ scope, plugin, name: fm.name, description: fm.description })
    }
    return rows
}

/** skills/*\/SKILL.md directories under ~/.claude/plugins/cache, with the plugin's name from the path (depth <= 5). */
const pluginSkillDirs = (cache) => {
    const found = []
    const walk = (dir, parts, depth) => {
        let entries
        try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
        for (const e of entries) {
            if (!e.isDirectory()) continue
            if (e.name === 'skills') { found.push({ dir: path.join(dir, e.name), parts }); continue }
            if (depth < 5 && e.name !== 'node_modules' && !e.name.startsWith('.')) walk(path.join(dir, e.name), [...parts, e.name], depth + 1)
        }
    }
    walk(cache, [], 0)
    return found
}

/** One row per skill: user, repo and plugin scope; a plugin cached in several versions counts once. */
export const skillsPanel = ({ home = os.homedir(), root = null } = {}) => {
    const claude = path.join(home, '.claude')
    try { fs.accessSync(claude, fs.constants.R_OK) } catch { return { ok: false, why: 'the skills folder could not be read here' } }
    const rows = readSkillDir(path.join(claude, 'skills'), 'user', null)
    if (root) rows.push(...readSkillDir(path.join(root, '.claude', 'skills'), 'repo', null))
    const seen = new Set()
    for (const { dir, parts } of pluginSkillDirs(path.join(claude, 'plugins', 'cache'))) {
        // cache/<marketplace>/<plugin>/<version>/skills: the plugin is the folder two above `skills` when there are 3 parts
        const plugin = (parts.length >= 3 ? parts[parts.length - 2] : parts[parts.length - 1] || 'plugin').slice(0, 60)
        for (const r of readSkillDir(dir, 'plugin', plugin)) {
            const key = `${r.plugin}\u0000${r.name}`
            if (seen.has(key)) continue
            seen.add(key)
            rows.push(r)
        }
    }
    const counts = { user: 0, repo: 0, plugin: 0 }
    for (const r of rows) counts[r.scope] += 1
    return { ok: true, count: rows.length, counts, rows: rows.slice(0, SKILLS_MAX) }
}

/**
 * Helpers (subagents) of the chats here, from file names, sizes-free mtimes and the small meta file's type and label only;
 * never a transcript. Recent = touched within 15 min; busy = touched within 2 min. The model is not in these files: owed.
 */
export const readHelpers = ({ home = os.homedir(), now = Date.now() } = {}) => {
    const rows = []
    const base = path.join(home, '.claude', 'projects')
    let projects
    try { projects = fs.readdirSync(base) } catch { return rows }
    for (const project of projects) {
        let sessions
        try { sessions = fs.readdirSync(path.join(base, project)) } catch { continue }
        for (const session of sessions) {
            const dir = path.join(base, project, session, 'subagents')
            let names
            try { names = fs.readdirSync(dir) } catch { continue }
            for (const name of names) {
                if (!/^agent-[A-Za-z0-9]+\.jsonl$/.test(name)) continue
                let mtime
                try { mtime = fs.statSync(path.join(dir, name)).mtimeMs } catch { continue }
                if (now - mtime > HELPER_RECENT_MS) continue
                let meta = {}
                try { meta = JSON.parse(fs.readFileSync(path.join(dir, name.replace(/\.jsonl$/, '.meta.json')), 'utf8')) } catch { /* no label */ }
                rows.push({
                    parent: session.slice(0, 8),
                    label: typeof meta.description === 'string' ? meta.description.slice(0, 80) : null,
                    type: typeof meta.agentType === 'string' ? meta.agentType.slice(0, 40) : null,
                    model: null,
                    since: new Date(mtime).toISOString(),
                    busy: now - mtime <= HELPER_BUSY_MS
                })
            }
        }
    }
    return rows.sort((a, b) => b.since.localeCompare(a.since)).slice(0, HELPERS_MAX)
}

/** Adds rules, hooks, skills and the agents' helpers to a snapshot's panels (a copy). */
export const withKnowledge = (snapshot, { home = os.homedir(), root = null, now = Date.now() } = {}) => {
    const panels = { ...(snapshot?.panels || {}) }
    panels.rules = rulesPanel({ home })
    panels.hooks = hooksPanel({ home, root })
    panels.skills = skillsPanel({ home, root })
    if (panels.agents && typeof panels.agents === 'object') panels.agents = { ...panels.agents, helpers: readHelpers({ home, now }) }
    return { ...(snapshot || {}), panels }
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

const repoRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

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
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'serverXR', 'release.json'), 'utf8'))
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

export const installTimer = async ({ home = os.homedir(), node = process.execPath, cli = path.join(repoRoot(), 'scripts', 'di', 'cli.mjs'), remove = false, exec = execText, say = console.log, fail = console.error } = {}) => {
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
    return 0
}

/** Runs `di monitor …`; returns the exit code. deps are injectable for tests. */
export const runMonitor = async (args, deps = {}) => {
    const { env = process.env, home = os.homedir(), hostname = os.hostname(), fetchImpl = globalThis.fetch, say = console.log, fail = console.error,
        collect = collectSnapshot, release = readRelease, ledger = () => execText('ledger-open', []), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), loops = Infinity } = deps
    const parsed = parseMonitorArgs(args)
    if (parsed.error) { fail(parsed.error); return 1 }
    if (parsed.sub === 'install-timer') return installTimer({ home, remove: parsed.remove, say, fail, ...(deps.timer || {}) })

    const target = resolveTarget(args.flags || {})
    if (target.error) { fail(target.error); return 1 }
    const token = String(env.DI_TOKEN || '').trim() || readLogin({ home, key: target.key })?.token || ''
    if (!token) { fail(`not signed in to ${target.host}: run di login`); return 1 }

    let round = 0
    for (;;) {
        round += 1
        let snapshot
        try { snapshot = withKnowledge(await collect(), { home, root: repoRoot() }) } catch (error) { fail(`could not read this machine: ${String(error?.message || error).split('\n')[0]}`); return 1 }
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
