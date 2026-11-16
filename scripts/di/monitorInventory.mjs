/**
 * What this machine runs: services, packages, listening ports, updates waiting, runtimes. The "inventory" panel of
 * `di monitor report` (monitorReport.mjs), read on the machine itself with fixed read-only commands.
 *
 * Rules the code keeps (tests in monitorInventory.test.mjs):
 *  - read-only: only list/show/query commands, a fixed list, never a shell, never a command from the network;
 *  - never a secret: no environment values, no unit ExecStart arguments (the binary's name only), no IP addresses
 *    (a port says WHO can reach it: all / lan / tailnet / loopback), no unit descriptions (they hold paths);
 *  - small: the whole body is capped (default 200 KB, the server takes up to 256 KB) and says what it cut;
 *  - quiet: collected at most every 6 hours, or when a package database changed (its mtime); a report carries the
 *    body only when its hash changed (or the server asks for it again, e.g. after a restart).
 *
 * Every parser is pure (text in, rows out). `collectInventory` wires them to an injectable `exec`.
 * Sources per system:  Arch (pacman, checkupdates, flatpak, npm -g), Debian family (dpkg), macOS (brew, launchctl);
 * systemd units and `ss` wherever they exist. UI contract: the owner's notes, UI-CONTRACT.md.
 */
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'

export const SCHEMA = 1
export const COLLECT_EVERY_MS = 6 * 60 * 60 * 1000
export const BODY_MAX_BYTES = 200 * 1024
const ROWS_MAX = { packages: 2500, units: 400, timers: 60, ports: 120, updates: 600, flatpak: 200, npm: 100, pip: 100, runtimes: 30, launchd: 300 }

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const clip = (v, n = 120) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n)

// ---- pure parsers: one per source ---------------------------------------------------------------------------------

/** `NAME=value` lines of /etc/os-release -> { id, name, version }. */
export const parseOsRelease = (text) => {
    const kv = {}
    for (const line of String(text || '').split('\n')) {
        const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
        if (m) kv[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    return { id: clip(kv.ID, 40), name: clip(kv.PRETTY_NAME || kv.NAME, 80), version: clip(kv.VERSION_ID || kv.BUILD_ID || '', 40) }
}

/** `pacman -Q` ("name version" per line) -> [{ name, version }]. */
export const parsePacmanQ = (text) => String(text || '').split('\n').map((l) => /^(\S+) (\S+)$/.exec(l.trim())).filter(Boolean).map((m) => ({ name: m[1], version: m[2] }))

/** `pacman -Qe` / `-Qm` / `-Qdtq`: the names of those lines (a version is optional). */
export const parsePacmanNames = (text) => new Set(String(text || '').split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean))

/** `pacman -Sl` ("repo name version [installed]") -> Map name -> repo, only for installed lines. */
export const parsePacmanSl = (text) => {
    const repos = new Map()
    for (const line of String(text || '').split('\n')) {
        const m = /^(\S+) (\S+) (\S+) \[installed/.exec(line)
        if (m) repos.set(m[2], m[1])
    }
    return repos
}

/** `pacman -Qo /usr/bin/a /usr/bin/b` -> Map path -> { pkg, version }. Lines: "/usr/bin/a is owned by pkg 1.2-3". */
export const parsePacmanQo = (text) => {
    const out = new Map()
    for (const line of String(text || '').split('\n')) {
        const m = /^(\S+) is owned by (\S+) (\S+)$/.exec(line.trim())
        if (m) out.set(m[1], { pkg: m[2], version: m[3] })
    }
    return out
}

/** `checkupdates` ("name old -> new" per line) -> [{ name, from, to }]. */
export const parseCheckupdates = (text) => String(text || '').split('\n').map((l) => /^(\S+) (\S+) -> (\S+)$/.exec(l.trim())).filter(Boolean).map((m) => ({ name: m[1], from: m[2], to: m[3] }))

/** `flatpak list --columns=application,version,origin,installation` (tab separated) -> unique [{ id, version, origin, scope }]. */
export const parseFlatpakList = (text) => {
    const seen = new Map()
    for (const line of String(text || '').split('\n')) {
        const cols = line.split('\t')
        if (cols.length < 2 || !/^[A-Za-z0-9_.-]+$/.test(cols[0].trim())) continue
        const row = { id: cols[0].trim(), version: clip(cols[1], 60), origin: clip(cols[2], 40), scope: clip(cols[3], 20) }
        const key = `${row.id}|${row.version}|${row.scope}`
        if (!seen.has(key)) seen.set(key, row)
    }
    return [...seen.values()]
}

/** `npm ls -g --depth=0 --json` -> [{ name, version }]. Bad JSON gives []. */
export const parseNpmGlobal = (text) => {
    try {
        const deps = JSON.parse(text)?.dependencies || {}
        return Object.entries(deps).map(([name, v]) => ({ name: clip(name, 80), version: clip(v?.version, 40) }))
    } catch { return [] }
}

/** `pip list --user --format=json` -> [{ name, version }]. */
export const parsePipList = (text) => {
    try { return JSON.parse(text).map((p) => ({ name: clip(p.name, 80), version: clip(p.version, 40) })) } catch { return [] }
}

/** `dpkg-query -W -f '${Package}\t${Version}\n'` -> [{ name, version }]. */
export const parseDpkg = (text) => String(text || '').split('\n').map((l) => l.split('\t')).filter((c) => c.length === 2 && c[0] && c[1]).map(([name, version]) => ({ name: name.trim(), version: version.trim() }))

/** `brew list --versions` ("name v1 v2") -> [{ name, version }] (the newest version listed last). */
export const parseBrewList = (text) => String(text || '').split('\n').map((l) => l.trim().split(/\s+/)).filter((c) => c.length >= 2).map((c) => ({ name: c[0], version: c[c.length - 1] }))

/** `brew outdated --verbose` ("name (old) < new") -> [{ name, from, to }]. */
export const parseBrewOutdated = (text) => String(text || '').split('\n').map((l) => /^(\S+) \(([^)]+)\) < (\S+)/.exec(l.trim())).filter(Boolean).map((m) => ({ name: m[1], from: m[2].split(',').pop().trim(), to: m[3] }))

/** `launchctl list` ("PID Status Label", header first) -> [{ label, pid|null, status }]; Apple's own labels are counted, not listed. */
export const parseLaunchctl = (text) => {
    const rows = []
    let apple = 0
    for (const line of String(text || '').split('\n')) {
        const m = /^(\S+)\s+(-?\d+)\s+(\S+)$/.exec(line.trim())
        if (!m) continue
        if (/^com\.apple\./.test(m[3])) { apple += 1; continue }
        rows.push({ label: clip(m[3], 100), pid: m[1] === '-' ? null : num(m[1]), status: num(m[2]) })
    }
    return { rows, apple }
}

/** Who can reach a listening address: all (0.0.0.0, ::, *), loopback, tailnet (100.64/10, fd7a:115c:a1e0), lan (private), other. No address leaves. */
export const bindClass = (addr) => {
    const a = String(addr || '').replace(/%.*$/, '').replace(/^\[|\]$/g, '')
    if (a === '*' || a === '0.0.0.0' || a === '::' || a === '') return 'all'
    if (a === '::1' || /^127\./.test(a)) return 'loopback'
    const m = /^100\.(\d+)\./.exec(a)
    if ((m && Number(m[1]) >= 64 && Number(m[1]) <= 127) || /^fd7a:115c:a1e0/i.test(a)) return 'tailnet'
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a) || /^(fe80|fd|fc)/i.test(a)) return 'lan'
    return 'other'
}

/** `ss -ltnup` (or -lntup) -> [{ proto, port, bind, process|null }], de-duplicated per proto/port/bind. */
export const parseSs = (text) => {
    const seen = new Map()
    for (const line of String(text || '').split('\n')) {
        const cols = line.trim().split(/\s+/)
        const proto = cols[0]
        if (proto !== 'tcp' && proto !== 'udp') continue
        const local = cols[4] || ''
        const m = /^(.*):(\d+)$/.exec(local)
        if (!m) continue
        const proc = /\(\("([^"]+)"/.exec(line)
        const row = { proto, port: Number(m[2]), bind: bindClass(m[1]), process: proc ? clip(proc[1], 40) : null }
        const key = `${proto}/${row.port}/${row.bind}`
        const held = seen.get(key)
        if (!held || (!held.process && row.process)) seen.set(key, row)
    }
    return [...seen.values()].sort((a, b) => a.port - b.port || a.proto.localeCompare(b.proto))
}

const SHOW_KEYS = ['Id', 'LoadState', 'ActiveState', 'SubState', 'UnitFileState', 'Result', 'NRestarts', 'MemoryCurrent', 'CPUUsageNSec', 'ExecMainPID', 'ExecMainStatus', 'ExecStart', 'NextElapseUSecRealtime', 'LastTriggerUSec', 'Unit']
export const SYSTEMCTL_PROPS = SHOW_KEYS.join(',')
const NONE = new Set(['[not set]', 'n/a', 'infinity', '18446744073709551615', ''])

/** The path of the first `path=/x/y` in an ExecStart value, as a bare binary name (arguments never leave). */
export const execBinary = (value) => {
    const m = /path=([^ ;]+)/.exec(String(value || ''))
    return m ? { name: clip(path.basename(m[1]), 60), path: m[1] } : null
}

/** `lsof -nP -iTCP -sTCP:LISTEN` (macOS has no `ss`) -> the same rows as parseSs. NAME is `*:5000`, `127.0.0.1:80` or `[::1]:8080`. */
export const parseLsofListen = (text) => {
    const seen = new Map()
    for (const line of String(text || '').split('\n')) {
        const c = line.trim().split(/\s+/)
        const name = c.find((w) => /^(\*|\[?[0-9a-fA-F:.]+\]?):\d+$/.test(w))
        if (!name || !/LISTEN/.test(line)) continue
        const m = /^(.*):(\d+)$/.exec(name)
        const row = { proto: 'tcp', port: Number(m[2]), bind: bindClass(m[1]), process: clip(c[0], 40) }
        seen.set(`${row.port}/${row.bind}`, row)
    }
    return [...seen.values()].sort((a, b) => a.port - b.port)
}

/** `systemctl show '*.service' '*.timer' -p …` (blocks of Key=Value, blank line between) -> [{ name, kind, load, active, sub, enabled, … }]. */
export const parseSystemctlShow = (text) => {
    const rows = []
    for (const block of String(text || '').split(/\n\s*\n/)) {
        const kv = {}
        for (const line of block.split('\n')) {
            const i = line.indexOf('=')
            if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1)
        }
        if (!kv.Id) continue
        const bin = execBinary(kv.ExecStart)
        const mem = NONE.has(kv.MemoryCurrent) ? null : num(kv.MemoryCurrent)
        const cpu = NONE.has(kv.CPUUsageNSec) ? null : num(kv.CPUUsageNSec)
        rows.push({
            name: clip(kv.Id, 100),
            kind: kv.Id.endsWith('.timer') ? 'timer' : 'service',
            load: clip(kv.LoadState, 20),
            active: clip(kv.ActiveState, 20),
            sub: clip(kv.SubState, 20),
            enabled: clip(kv.UnitFileState, 20),
            result: clip(kv.Result, 20),
            restarts: num(kv.NRestarts) || 0,
            memBytes: mem,
            cpuSec: cpu === null ? null : Math.round(cpu / 1e9),
            pid: num(kv.ExecMainPID) || null,
            binary: bin?.name || null,
            binaryPath: bin?.path || null, // used to look up the owning package, then dropped by `unitRows`
            exitStatus: num(kv.ExecMainStatus),
            next: kv.NextElapseUSecRealtime && !NONE.has(kv.NextElapseUSecRealtime) ? clip(kv.NextElapseUSecRealtime, 40) : null,
            last: kv.LastTriggerUSec && !NONE.has(kv.LastTriggerUSec) ? clip(kv.LastTriggerUSec, 40) : null,
            triggers: kv.Unit ? clip(kv.Unit, 100) : null
        })
    }
    return rows
}

/** A tool's own `--version` first line -> a short version string (the first number-like word), or the line. */
export const parseVersionLine = (text) => {
    const line = String(text || '').split('\n')[0] || ''
    const m = /v?(\d+(?:\.\d+)+(?:[-+.][0-9A-Za-z.]+)?)/.exec(line)
    return m ? m[1].slice(0, 60) : clip(line, 60)
}

/** `df -P -k <path>` -> { totalKb, usedKb, usedPct } of the last line. */
export const parseDf = (text) => {
    const lines = String(text || '').trim().split('\n')
    const c = (lines[lines.length - 1] || '').trim().split(/\s+/)
    if (c.length < 5 || !/^\d+$/.test(c[1])) return null
    return { totalKb: Number(c[1]), usedKb: Number(c[2]), usedPct: num(String(c[4]).replace('%', '')) }
}

// ---- body shaping --------------------------------------------------------------------------------------------------

/** Unit rows for the body: services that run, fail, restart or are enabled; the rest only as a count. Highest memory first. */
export const unitRows = (parsed, owners = new Map()) => {
    const services = parsed.filter((u) => u.kind === 'service' && u.load !== 'not-found')
    const keep = services.filter((u) => u.active === 'active' || u.active === 'failed' || u.restarts > 0 || (u.enabled === 'enabled'))
    const rows = keep.map((u) => {
        const owner = u.binaryPath ? owners.get(u.binaryPath) : null
        const { binaryPath: _p, next: _n, last: _l, triggers: _t, ...rest } = u
        return { ...rest, owner: owner ? { pkg: owner.pkg, version: owner.version } : null, home: Boolean(u.binaryPath && /^\/(home|root|tmp|var\/tmp)\b/.test(u.binaryPath)) }
    })
    rows.sort((a, b) => (b.memBytes || 0) - (a.memBytes || 0))
    return { rows, total: services.length }
}

export const timerRows = (parsed) => {
    const services = new Map(parsed.filter((u) => u.kind === 'service').map((u) => [u.name, u]))
    return parsed.filter((u) => u.kind === 'timer' && u.load !== 'not-found').map((t) => {
        const svc = services.get(t.triggers || t.name.replace(/\.timer$/, '.service'))
        return { name: t.name, active: t.active, enabled: t.enabled, next: t.next, last: t.last, result: svc?.result || t.result || null, exitStatus: svc ? svc.exitStatus : null, service: svc?.name || null }
    })
}

const stableKey = (k) => !['collectedAt', 'memBytes', 'cpuSec', 'pid', 'next', 'last', 'diskUsedPct', 'usedKb', 'usedPct'].includes(k)
const canonical = (v) => {
    if (Array.isArray(v)) return v.map(canonical)
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).filter(stableKey).sort().map((k) => [k, canonical(v[k])]))
    return v
}
/** sha256 of the body without what moves on its own (clock, memory, cpu, pids, next/last run, disk use). */
export const stableHash = (body) => crypto.createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex')

/** Counts the page shows without opening the body. */
export const summarize = (body) => ({
    units: { total: body.units?.total ?? 0, running: (body.units?.rows || []).filter((u) => u.active === 'active' && u.sub === 'running').length, failed: (body.units?.rows || []).filter((u) => u.active === 'failed').length, restarting: (body.units?.rows || []).filter((u) => u.restarts > 0).length },
    ports: { total: (body.ports || []).length, exposed: (body.ports || []).filter((p) => p.bind === 'all' || p.bind === 'lan').length },
    packages: { manager: body.packages?.manager || (body.packages?.brew ? 'brew' : null), total: body.packages?.count ?? (body.packages?.brew || []).length, explicit: (body.packages?.explicit || []).length, foreign: (body.packages?.foreign || []).length, orphans: (body.packages?.orphans || []).length, flatpak: (body.flatpak || []).length, npmGlobal: (body.npmGlobal || []).length },
    updates: (body.updates?.rows || []).length,
    runtimes: (body.runtimes || []).length
})

/** Drops rows (least useful first) until the JSON fits `max` bytes; says what it cut in `truncated`. */
export const capBody = (body, max = BODY_MAX_BYTES) => {
    const size = () => Buffer.byteLength(JSON.stringify(body))
    const truncated = {}
    const steps = [
        ['packages.system', () => body.packages?.system, (n) => { body.packages.system = body.packages.system.slice(0, n) }],
        ['updates', () => body.updates?.rows, (n) => { body.updates.rows = body.updates.rows.slice(0, n) }],
        ['units', () => body.units?.rows, (n) => { body.units.rows = body.units.rows.slice(0, n) }],
        ['ports', () => body.ports, (n) => { body.ports = body.ports.slice(0, n) }],
        ['packages.explicit', () => body.packages?.explicit, (n) => { body.packages.explicit = body.packages.explicit.slice(0, n) }]
    ]
    for (const [name, get, set] of steps) {
        const list = get()
        if (size() <= max || !Array.isArray(list)) continue
        let keep = list.length
        while (size() > max && keep > 0) { keep = Math.floor(keep / 2); set(keep) }
        truncated[name] = { kept: keep, of: list.length }
    }
    if (Object.keys(truncated).length) body.truncated = truncated
    return body
}

// ---- collection -------------------------------------------------------------------------------------------------------

const RUNTIMES = [['node', ['--version']], ['python3', ['--version']], ['git', ['--version']], ['claude', ['--version']], ['ollama', ['--version']], ['tailscale', ['--version']], ['docker', ['--version']], ['chromium', ['--version']], ['npm', ['--version']], ['go', ['version']], ['cargo', ['--version']], ['brew', ['--version']]]

/** Read-only command runner: file + args, no shell, timeout, output cap. Resolves '' on any failure. */
export const execText = (cmd, args = [], { timeout = 8000, maxBuffer = 16 * 1024 * 1024 } = {}) => new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer, env: { ...process.env, LC_ALL: 'C' } }, (error, stdout) => resolve(error && !stdout ? '' : String(stdout || '')))
})

const readText = (file) => { try { return fs.readFileSync(file, 'utf8') } catch { return '' } }
const mtime = (file) => { try { return fs.statSync(file).mtimeMs } catch { return null } }

/** Which package databases exist here and when they last changed: a change means "collect again". */
export const dbMtimes = ({ home = os.homedir(), platform = process.platform } = {}) => {
    const files = platform === 'darwin'
        ? ['/opt/homebrew/Cellar', '/usr/local/Cellar']
        : ['/var/lib/pacman/local', '/var/lib/dpkg/status', path.join(home, '.local/share/flatpak/repo/refs'), '/var/lib/flatpak/repo/refs']
    return Object.fromEntries(files.map((f) => [f, mtime(f)]).filter(([, t]) => t !== null))
}

/** Due when: never collected, 6 h old, or a package database changed. */
export const isDue = ({ cache, now = Date.now(), mtimes = {} }) => {
    if (!cache?.collectedAt || !cache.hash) return 'first'
    if (now - Date.parse(cache.collectedAt) >= COLLECT_EVERY_MS) return 'six-hours'
    const before = cache.mtimes || {}
    for (const [k, t] of Object.entries(mtimes)) if (before[k] !== t) return 'package-db'
    return null
}

const lines = (text) => String(text || '').split('\n').filter(Boolean)
const hasCmd = async (exec, cmd) => Boolean((await exec('sh', ['-c', `command -v ${cmd}`])).trim())

/** The whole inventory of this machine. `exec(cmd, args, opts)` returns stdout text; everything is read-only. */
export const collectInventory = async ({ exec = execText, platform = process.platform, home = os.homedir(), now = new Date() } = {}) => {
    const body = { schema: SCHEMA, collectedAt: now.toISOString(), platform, arch: os.arch(), kernel: os.release(), uptimeS: Math.round(os.uptime()), cpus: os.cpus().length, memTotalMb: Math.round(os.totalmem() / 1048576), packages: {}, flatpak: [], npmGlobal: [], pip: [], updates: { tool: null, rows: [] }, runtimes: [], ports: [], units: { total: 0, rows: [] }, timers: [], disk: null }
    const osr = parseOsRelease(readText('/etc/os-release'))
    body.os = platform === 'darwin' ? { id: 'macos', name: `macOS ${clip((await exec('sw_vers', ['-productVersion'])).trim(), 20)}`, version: '' } : osr

    if (platform === 'darwin') {
        if (await hasCmd(exec, 'brew')) {
            body.packages.brew = parseBrewList(await exec('brew', ['list', '--versions'], { timeout: 20000 })).slice(0, ROWS_MAX.packages)
            body.updates = { tool: 'brew', rows: parseBrewOutdated(await exec('brew', ['outdated', '--verbose'], { timeout: 30000 })).slice(0, ROWS_MAX.updates) }
        }
        const launch = parseLaunchctl(await exec('launchctl', ['list']))
        body.launchd = { rows: launch.rows.slice(0, ROWS_MAX.launchd), apple: launch.apple }
    } else {
        if (osr.id === 'arch' || await hasCmd(exec, 'pacman')) {
            const all = parsePacmanQ(await exec('pacman', ['-Q']))
            const explicit = parsePacmanNames(await exec('pacman', ['-Qqe']))
            const foreign = parsePacmanNames(await exec('pacman', ['-Qqm']))
            const orphans = parsePacmanNames(await exec('pacman', ['-Qdtq']))
            const repos = parsePacmanSl(await exec('pacman', ['-Sl']))
            const tag = (p) => ({ name: p.name, version: p.version, repo: foreign.has(p.name) ? 'aur' : (repos.get(p.name) || null) })
            body.packages.manager = 'pacman'
            body.packages.count = all.length
            body.packages.explicit = all.filter((p) => explicit.has(p.name)).map(tag)
            body.packages.system = all.filter((p) => !explicit.has(p.name)).map(tag)
            body.packages.foreign = [...foreign]
            body.packages.orphans = [...orphans]
            body.updates = { tool: 'checkupdates', rows: parseCheckupdates(await exec('checkupdates', [], { timeout: 25000 })).slice(0, ROWS_MAX.updates) }
        } else if (await hasCmd(exec, 'dpkg-query')) {
            const all = parseDpkg(await exec('dpkg-query', ['-W', '-f', '${Package}\t${Version}\n']))
            body.packages.manager = 'dpkg'
            body.packages.count = all.length
            body.packages.system = all.slice(0, ROWS_MAX.packages)
            const up = lines(await exec('apt-get', ['-s', 'upgrade'])).filter((l) => l.startsWith('Inst ')).map((l) => /^Inst (\S+) \[([^\]]+)\] \((\S+)/.exec(l)).filter(Boolean)
            body.updates = { tool: 'apt-get -s', rows: up.map((m) => ({ name: m[1], from: m[2], to: m[3] })).slice(0, ROWS_MAX.updates) }
        }
        if (await hasCmd(exec, 'flatpak')) body.flatpak = parseFlatpakList(await exec('flatpak', ['list', '--columns=application,version,origin,installation'])).slice(0, ROWS_MAX.flatpak)
        if (await hasCmd(exec, 'systemctl')) {
            const parsed = parseSystemctlShow(await exec('systemctl', ['show', '*.service', '*.timer', '-p', SYSTEMCTL_PROPS, '--no-pager'], { timeout: 15000 }))
            const parsedUser = parseSystemctlShow(await exec('systemctl', ['--user', 'show', '*.service', '*.timer', '-p', SYSTEMCTL_PROPS, '--no-pager'], { timeout: 15000 }))
            const paths = [...new Set([...parsed, ...parsedUser].map((u) => u.binaryPath).filter((p) => p && p.startsWith('/usr/')))].slice(0, 200)
            const owners = (osr.id === 'arch' && paths.length) ? parsePacmanQo(await exec('pacman', ['-Qo', ...paths])) : new Map()
            const system = unitRows(parsed, owners)
            const user = unitRows(parsedUser, owners)
            body.units = { total: system.total + user.total, rows: [...system.rows.map((r) => ({ ...r, scope: 'system' })), ...user.rows.map((r) => ({ ...r, scope: 'user' }))].slice(0, ROWS_MAX.units) }
            body.timers = [...timerRows(parsed).map((r) => ({ ...r, scope: 'system' })), ...timerRows(parsedUser).map((r) => ({ ...r, scope: 'user' }))].slice(0, ROWS_MAX.timers)
        }
        body.ports = parseSs(await exec('ss', ['-ltnup'])).slice(0, ROWS_MAX.ports)
    }
    if (platform === 'darwin') body.ports = parseLsofListen(await exec('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { timeout: 10000 })).slice(0, ROWS_MAX.ports)
    if (await hasCmd(exec, 'npm')) body.npmGlobal = parseNpmGlobal(await exec('npm', ['ls', '-g', '--depth=0', '--json'])).slice(0, ROWS_MAX.npm)
    if (await hasCmd(exec, 'pip')) body.pip = parsePipList(await exec('pip', ['list', '--user', '--format=json'])).slice(0, ROWS_MAX.pip)
    for (const [cmd, args] of RUNTIMES) {
        const out = await exec(cmd, args, { timeout: 4000 })
        if (out.trim()) body.runtimes.push({ name: cmd, version: parseVersionLine(out) })
    }
    try {
        const current = fs.readlinkSync(path.join(home, '.di', 'current'))
        body.runtimes.push({ name: 'di', version: clip(path.basename(current), 60) })
    } catch { /* di is not installed through ~/.di here */ }
    body.disk = parseDf(await exec('df', ['-P', '-k', '/']))
    return capBody(body)
}

// ---- the panel: cache, trigger, hash ---------------------------------------------------------------------------------

export const cachePath = (home = os.homedir()) => path.join(home, '.cache', 'di', 'monitor-inventory.json')
const readCache = (home) => { try { return JSON.parse(fs.readFileSync(cachePath(home), 'utf8')) } catch { return null } }
const writeCache = (home, cache) => {
    try {
        fs.mkdirSync(path.dirname(cachePath(home)), { recursive: true })
        fs.writeFileSync(cachePath(home), JSON.stringify(cache), { mode: 0o600 })
    } catch { /* a read-only home only costs a re-collect */ }
}

/**
 * The "inventory" panel for one report: { hash, collectedAt, os, counts, body? }. The body rides along only when
 * its hash is not the one already sent (`sentHash`) or the server asked for it (`wanted`). `sent()` records the send.
 * Collection runs only when due (or `force`); otherwise the cached body answers.
 */
export const inventoryPanel = async ({ home = os.homedir(), exec = execText, platform = process.platform, now = Date.now(), force = false, wanted = false, collect = collectInventory } = {}) => {
    let cache = readCache(home)
    const mtimes = dbMtimes({ home, platform })
    const due = force ? 'forced' : isDue({ cache, now, mtimes })
    if (due) {
        const body = await collect({ exec, platform, home, now: new Date(now) })
        cache = { collectedAt: body.collectedAt, hash: stableHash(body), mtimes, sentHash: cache?.sentHash || null, body, reason: due }
        writeCache(home, cache)
    }
    const withBody = wanted || cache.sentHash !== cache.hash
    const panel = { schema: SCHEMA, hash: cache.hash, collectedAt: cache.collectedAt, os: cache.body.os, kernel: cache.body.kernel, counts: summarize(cache.body), ...(withBody ? { body: cache.body } : {}) }
    return { panel, due, withBody, sent: () => writeCache(home, { ...cache, sentHash: cache.hash }) }
}
