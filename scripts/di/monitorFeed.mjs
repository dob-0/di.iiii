/**
 * `di monitor feed add|remove|list` — where THIS machine's chats (and credits) come from, set by a command instead of a hand edit
 * of JSON. The Monitor server reads ~/.di/monitor.json (DI_MONITOR_CONFIG, or ~/.di/monitor.json; serverXR/src/monitorStore.js
 * readConfig) and runs the FIRST feed { panel: 'chats', kind: 'command', command } through /bin/sh -c; no such feed = "not
 * configured", and a machine without it never shows its chats in the overview.
 *
 * Method: read the file, change the one list, write the whole file back the way a package manager writes a lockfile (temp file in
 * the same folder, fsync, rename: ./atomicWrite.mjs), mode 0600 (the server ignores a file that others can write to, and the file
 * names shell commands). A changing write first keeps the old bytes in monitor.json.bak-<YYYYMMDD-HHMMSS> (exclusive create: two
 * writes in one second never overwrite each other's backup). The same feed again = no write and no backup. A file that is not a
 * JSON object is refused and stays byte for byte as it was. Everything else in the file (other keys, other feeds) is kept.
 * --check can run for seconds between the first read and the write, so the file is read again right before a changing write: other
 * bytes than the first read saw (an edit made meanwhile, a file that appeared or vanished) refuse the write and leave the file as the
 * other hand left it; the same bytes written again by an editor do not. Two feed commands at the same moment cannot both write:
 * the read-again, the backup and the rename run under a lock file (withWriteLock), and the one that finds it held is refused.
 *
 * --check runs the command once under the Monitor's own limit and reads its output with the Monitor's own reader
 * (serverXR/src/monitorChats.js, monitorCredits.js), so a command that passes is one the Monitor accepts: a chat list also needs a
 * "generatedAt" the reader keeps (a number of seconds since 1970), because without it the Monitor shows the list as stale. Without
 * --check the command is stored and never run here.
 *
 * Exit codes: 0 done or nothing to do, 1 refused (bad file, failed check, file changed meanwhile, another command writing, could not
 * write), 2 usage.
 * Pure parts are exported for tests: arg parsing, the file reader, the check.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { writeFileAtomicSync } from './atomicWrite.mjs'

export const PANELS = ['chats', 'credits']
const DEFAULT_TITLE = { chats: 'Chats', credits: 'Credits' }

// What the Monitor does with a feed command (serverXR/src/monitorStore.js): chats() runs it through run(), whose own limit is
// PANEL_TIMEOUT_MS = 4000 (the 6000 around it never fires first); credits() runs it under a limit of its own: a fixed 8000 in older
// trees, CREDITS_COMMAND_MS (30 s, exported by the store) once a cold probe of 12 s had to fit. --check uses the same limits, so a
// command it lets through is not killed by the server. CHECK_LIMIT_MS holds the fixed numbers; limitFor() takes the credits one from the
// store when the store states it, and a test reads the store's source so that no other number creeps in unseen.
export const CHECK_LIMIT_MS = { chats: 4000, credits: 8000 }

/** The limit the Monitor gives this panel's command in the tree at `root` (a folder that holds serverXR/). */
export const limitFor = (panel, root) => {
    if (panel !== 'credits') return CHECK_LIMIT_MS[panel]
    try {
        const stated = createRequire(import.meta.url)(path.join(root, 'serverXR', 'src', 'monitorStore.js')).CREDITS_COMMAND_MS
        if (Number.isFinite(stated) && stated > 0) return stated
    } catch { /* no store in this copy, or none that loads: the fixed limit of the older trees */ }
    return CHECK_LIMIT_MS.credits
}
const SERVER_READERS = { chats: ['monitorChats.js', 'sanitizeChats'], credits: ['monitorCredits.js', 'sanitizeCredits'] }
const SHOW_CHARS = 100
const MAX_OUTPUT = 4 * 1024 * 1024
const ALLOWED = { add: ['command', 'id', 'title', 'check', 'dry-run'], remove: ['id', 'dry-run'], list: [] }
const VALUE_FLAGS = ['command', 'id', 'title']

export const FEED_USAGE = [
    'di monitor feed add chats --command "<command>" [--id ID] [--title TEXT] [--check] [--dry-run]   set where this machine\'s chats come from',
    'di monitor feed remove chats [--id ID] [--dry-run]                                               undo it',
    'di monitor feed list                                                                             show what is set',
    'The panel is chats or credits. The command prints its list as JSON:',
    '  chats    { "generatedAt": <seconds since 1970>, "chats": [ ... ] }',
    '  credits  [ { "route": "<name>", "available": true or false, "meter": "...", "have": "...", "why": "..." } ]   (every row needs a route name)',
    '--check runs the command once, the way the Monitor does, and saves it only if the Monitor accepts what it prints.'
].join('\n')

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const oneLine = (text, max) => { const s = String(text ?? '').replace(/\s+/g, ' ').trim(); return s.length > max ? `${s.slice(0, max - 1)}…` : s }
const quote = (text) => `'${String(text).replace(/'/g, '\'\\\'\'')}'`
// a feed without an id is the panel's own feed: the server shows it under its panel, and `add chats` must find it
const idOf = (feed) => (typeof feed?.id === 'string' && feed.id ? feed.id : feed?.panel)
const sameFeed = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(b).every((key) => a[key] === b[key])
// the one feed of a panel the Monitor runs: the first command feed (monitorStore.js credits() and chats())
const readBy = (feeds, panel) => feeds.find((f) => isObj(f) && f.panel === panel && f.kind === 'command' && f.command)
const pad2 = (n) => String(n).padStart(2, '0')
export const stamp = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`

/** { action, panel, id, title, command, check, dryRun } or { error } (a usage mistake: exit 2). */
export const parseFeedArgs = (args) => {
    const [, , action, panel, ...rest] = args._ || []
    const flags = args.flags || {}
    if (!Object.hasOwn(ALLOWED, action || '')) return { error: `di monitor feed needs add, remove or list\n${FEED_USAGE}` }
    for (const name of Object.keys(flags)) {
        if (ALLOWED[action].includes(name)) continue
        const base = name.split('=')[0]
        return { error: name.includes('=') && VALUE_FLAGS.includes(base) ? `write --${base} "..." with a space, not =` : `${action} does not take --${name}` }
    }
    for (const name of VALUE_FLAGS) {
        if (name in flags && (typeof flags[name] !== 'string' || flags[name].startsWith('--'))) return { error: `--${name} needs its value right after it` }
    }
    if (action === 'list') return panel ? { error: 'list takes no other words' } : { action }
    if (!panel) return { error: `${action} needs the panel: chats or credits` }
    if (!PANELS.includes(panel)) return { error: `"${oneLine(panel, 30)}" is not a feed this command sets: use chats or credits` }
    if (rest.length) return { error: `unexpected word "${oneLine(rest[0], 30)}"` }
    const id = flags.id ?? panel
    if (!/^[A-Za-z0-9][\w.-]{0,59}$/.test(id)) return { error: '--id takes letters, digits, . _ - (up to 60, starting with a letter or digit)' }
    const parsed = { action, panel, id, dryRun: Boolean(flags['dry-run']) }
    if (action === 'remove') return parsed
    const { command, title } = flags
    if (typeof command !== 'string' || !command.trim()) return { error: 'add needs --command "<shell command>", the command that prints this machine\'s list as JSON' }
    // eslint-disable-next-line no-control-regex
    if (title !== undefined && (!title.trim() || title.length > 80 || /[\u0000-\u001f\u007f]/.test(title))) return { error: '--title takes a short text (up to 80 characters, one line)' }
    return { ...parsed, command, title, check: Boolean(flags.check) }
}

/**
 * Where JSON breaks: the offset of the first character that does not fit (text.length when the text just ends too soon), or -1 when
 * this scanner sees nothing wrong. JSON.parse names the place only for some errors (Node 22 says `Unexpected token 'o', ..."s": [` for
 * a stray word or a trailing comma, with no position), so the line and column of a refused file come from here, not from its message.
 */
export const jsonErrorOffset = (text) => {
    let i = 0
    const stop = () => { throw i }
    const skip = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i += 1 }
    const expect = (ch) => { skip(); if (text[i] !== ch) stop(); i += 1 }
    const word = (w) => { if (!text.startsWith(w, i)) stop(); i += w.length }
    const number = () => { const re = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y; re.lastIndex = i; if (!re.test(text)) stop(); i = re.lastIndex }
    const string = () => {
        expect('"')
        while (text[i] !== '"') {
            if (i >= text.length || text[i] < ' ') stop()
            if (text[i] !== '\\') { i += 1; continue }
            i += 1 // the character after the backslash must be one JSON knows
            if (text[i] === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) stop(); i += 5 } else if (i < text.length && '"\\/bfnrt'.includes(text[i])) i += 1
            else stop()
        }
        i += 1
    }
    const list = (close, item) => {
        i += 1
        skip()
        if (text[i] === close) { i += 1; return }
        for (;;) {
            item()
            skip()
            if (text[i] === ',') { i += 1; continue }
            if (text[i] !== close) stop()
            i += 1
            return
        }
    }
    const value = () => {
        skip()
        const c = text[i]
        if (c === '{') list('}', () => { string(); expect(':'); value() })
        else if (c === '[') list(']', value)
        else if (c === '"') string()
        else if (c === 't') word('true')
        else if (c === 'f') word('false')
        else if (c === 'n') word('null')
        else number()
    }
    try { value(); skip(); if (i < text.length) stop() } catch (at) { return typeof at === 'number' ? at : -1 }
    return -1
}

// a character the owner can see in a message: printable ASCII as it is, anything else (a byte-order mark, a control) as U+XXXX
const shown = (ch) => (ch >= ' ' && ch <= '~' ? JSON.stringify(ch) : `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)

const where = (text, error) => {
    const at = jsonErrorOffset(text)
    if (at < 0) return `: ${String(error?.message || error).split('\n')[0]}`
    const before = text.slice(0, at)
    return ` at line ${before.split('\n').length}, column ${before.length - before.lastIndexOf('\n')} (${at >= text.length ? 'the file ends too soon' : `unexpected ${shown(text[at])}`})`
}

/** The file as { exists, raw, config }, or { error } when it cannot be used. A missing file is an empty config. */
export const readFeedConfig = (file) => {
    let raw
    try { raw = fs.readFileSync(file) } catch (error) {
        if (error?.code === 'ENOENT') return { exists: false, raw: null, config: {} }
        return { error: `cannot read ${file}: ${error?.code || String(error?.message || error).split('\n')[0]}` }
    }
    const text = raw.toString('utf8')
    let config
    try { config = JSON.parse(text) } catch (error) {
        return { error: `${file} is not valid JSON${where(text, error)}` }
    }
    if (!isObj(config)) return { error: `${file} holds ${Array.isArray(config) ? 'a list' : config === null ? 'null' : `a ${typeof config}`}, not a JSON object { ... }` }
    if (config.feeds !== undefined && !Array.isArray(config.feeds)) return { error: `"feeds" in ${file} is not a list` }
    return { exists: true, raw, config }
}

// the server ignores a config that anyone but its owner can write to (monitorStore.js readConfig): say so instead of "all set"
const modeWarning = (file) => {
    if (process.platform === 'win32') return null
    try {
        const { mode } = fs.statSync(file)
        if (mode & 0o022) return `warning: the Monitor ignores ${file} while others can write to it (mode ${(mode & 0o777).toString(8)}). Fix: chmod 600 ${quote(file)}`
    } catch { /* no file: nothing to warn about */ }
    return null
}

const keepBackup = (file, raw, now) => {
    const base = `${file}.bak-${stamp(now())}`
    for (let n = 0; n < 100; n += 1) {
        const target = n ? `${base}-${n}` : base
        try { fs.writeFileSync(target, raw, { flag: 'wx', mode: 0o600 }); return target } catch (error) { if (error?.code !== 'EEXIST') throw error }
    }
    throw new Error(`100 backups with one time stamp are already in ${path.dirname(file)}`)
}

// the file's bytes as they are right now, null when it is not there; any other failure to read is thrown as it is
const bytesNow = (file) => {
    try { return fs.readFileSync(file) } catch (error) {
        if (error?.code === 'ENOENT') return null
        throw error
    }
}

/**
 * Runs `section` while this command holds `<file>.lock`. The read-again, the backup and the rename (saveConfig) must not run in two
 * commands at once: both would read the same bytes, both would pass, and the second rename would drop what the first wrote, with
 * exit 0 for both. Method: git's lock file (lockfile.c, `config.lock`): open(2) with O_CREAT|O_EXCL is atomic on a local disk, so
 * one command makes the file, does the section (milliseconds; --check is never inside it) and removes it. A command that finds the
 * lock neither waits nor takes it over: it throws code ELOCKED, writes nothing, and is run again (git: "Unable to create
 * 'config.lock': File exists"). The lock is only removed by the command that made it. A program that does not use the lock, an
 * editor, is covered by the read-again alone, so an edit that lands between that read and the rename is still lost.
 */
const withWriteLock = (file, section) => {
    const lock = `${file}.lock`
    fs.mkdirSync(path.dirname(file), { recursive: true })
    let fd
    try { fd = fs.openSync(lock, 'wx', 0o600) } catch (error) {
        if (error?.code === 'EEXIST') throw Object.assign(new Error(`${lock} exists`), { code: 'ELOCKED', lock })
        throw error
    }
    try { return section() } finally {
        try { fs.closeSync(fd) } catch { /* closed already */ }
        try { fs.unlinkSync(lock) } catch { /* gone already */ }
    }
}

/**
 * Writes the config; returns the backup path (null for a new file). `config` was made from `read`, and --check can have run for
 * seconds since: if the file is not what `read` saw (other bytes, appeared, vanished) the write is refused with code ECHANGED before
 * anything is made, so what the other hand wrote is neither overwritten nor hidden in a backup. The same bytes pass. The read-again
 * is inside the lock: before it, two commands would both pass it (see withWriteLock).
 */
const saveConfig = ({ file, read, config, now }) => withWriteLock(file, () => {
    const current = bytesNow(file)
    if (read.exists ? current === null || !current.equals(read.raw) : current !== null) {
        throw Object.assign(new Error(`${file} changed after it was read`), { code: 'ECHANGED' })
    }
    const backup = read.exists ? keepBackup(file, read.raw, now) : null
    // through a symlink to the real file: a rename over the link would replace the link with a plain file
    writeFileAtomicSync(read.exists ? fs.realpathSync(file) : file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
    return backup
})

const execShell = (command, { timeout, env }) => new Promise((resolve) => {
    execFile('/bin/sh', ['-c', command], { timeout, env, maxBuffer: MAX_OUTPUT }, (error, stdout, stderr) => resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') }))
})
const seconds = (ms) => `${Number((ms / 1000).toFixed(2))} s`

/** Runs the feed command once the way the Monitor will and reads its output with the Monitor's own reader: { line } or { error }. */
export const checkFeedCommand = async ({ panel, command, root, limitMs = limitFor(panel, root), exec = execShell, env = process.env }) => {
    const [file, name] = SERVER_READERS[panel]
    let reader
    try { reader = createRequire(import.meta.url)(path.join(root, 'serverXR', 'src', file))[name] } catch {
        return { error: `cannot check here: serverXR/src/${file}, the Monitor's own reader, is not in this copy of di` }
    }
    const { error, stdout, stderr } = await exec(command, { timeout: limitMs, env })
    if (error?.killed) return { error: `the command did not finish in ${seconds(limitMs)}: the Monitor stops it there` }
    // di-credits exits 1 when no route is ready and still prints the list; the Monitor keeps that list (monitorStore.js credits())
    const listed = panel === 'credits' && stdout.trim().startsWith('[')
    if (error && !listed) {
        const how = typeof error.code === 'number' ? `exit ${error.code}` : (error.signal || error.code || 'error')
        if (error.code === 'ENOENT') return { error: 'the command could not start: /bin/sh is not here (a feed command needs a POSIX shell)' }
        return { error: `the command failed (${how})${stderr.trim() ? `: ${oneLine(stderr, SHOW_CHARS)}` : ''}` }
    }
    let parsed
    try { parsed = JSON.parse(stdout) } catch {
        return { error: stdout.trim() ? `the command did not print JSON, it printed ${JSON.stringify(oneLine(stdout, 40))}` : 'the command printed nothing' }
    }
    if (panel === 'chats') {
        const kept = reader(parsed, '')
        if (!kept) return { error: 'the command printed JSON, but not a chat list: it must print { "generatedAt": <seconds since 1970>, "chats": [ ... ] }' }
        // sanitizeChats keeps generatedAt only as a number above 0; chatsBlock ages a list without it as stale and not ok
        if (kept.generatedAt === null) return { error: 'the chat list has no "generatedAt" as a number of seconds since 1970 (for example 1795137071), so the Monitor would show the list as stale' }
        const n = parsed.chats.length
        return { line: `the command printed ${n} chat${n === 1 ? '' : 's'}${kept.chats.length === n ? '' : ` (the Monitor keeps ${kept.chats.length})`}` }
    }
    const rows = reader(parsed)
    if (!rows) return { error: 'the command printed JSON, but not a list of credit routes: it must print [ { "route": ... } ]' }
    if (rows.dropped) return { error: `${rows.dropped} of the rows have no route name: the Monitor would grey the Credits box` }
    return { line: `the command printed ${rows.length} credit route${rows.length === 1 ? '' : 's'}, ${rows.filter((r) => r.available).length} ready` }
}

const listFeeds = ({ file, read, feeds, say, fail }) => {
    if (!feeds.length) say(read.exists ? `no feeds in ${file}` : `no feeds (${file} does not exist)`)
    for (const feed of feeds) {
        if (!isObj(feed)) { say(`(not a feed) ${oneLine(JSON.stringify(feed), 60)}`); continue }
        const what = feed.kind === 'file' ? `file ${feed.path ?? ''}` : feed.kind === 'url' ? `url ${feed.url ?? ''}` : (feed.command ?? '')
        const ignored = PANELS.includes(feed.panel) && feed.kind === 'command' && feed.command && readBy(feeds, feed.panel) !== feed
        say(`${String(feed.panel ?? '-').padEnd(8)} ${String(idOf(feed) ?? '-').padEnd(12)} ${oneLine(what, SHOW_CHARS)}${ignored ? `  (ignored: the Monitor runs only the first ${feed.panel} feed)` : ''}`)
    }
    const warning = modeWarning(file)
    if (warning) fail(warning)
    return 0
}

const addFeed = async ({ cmd, file, read, feeds, say, fail, info, now, root, limits, exec, env }) => {
    if (cmd.check) {
        const result = await checkFeedCommand({ panel: cmd.panel, command: cmd.command, root, limitMs: limits[cmd.panel], exec, env })
        if (result.error) { fail(`${result.error}. Nothing was saved.`); return 1 }
        info(result.line)
    }
    const at = feeds.flatMap((f, i) => (isObj(f) && f.panel === cmd.panel && idOf(f) === cmd.id ? [i] : []))
    const old = at.length ? feeds[at[0]] : null
    // a title that was not asked for stays as it is; the default is only for a new feed
    const title = cmd.title ?? (typeof old?.title === 'string' && old.title ? old.title : DEFAULT_TITLE[cmd.panel])
    const next = { id: cmd.id, title, panel: cmd.panel, kind: 'command', command: cmd.command }
    const unchanged = at.length === 1 && sameFeed(old, next)
    const list = []
    feeds.forEach((f, i) => { if (i === at[0]) list.push(next); else if (!at.includes(i)) list.push(f) })
    if (!at.length) list.push(next)
    const config = { ...read.config, feeds: list }
    // the Monitor runs only the first command feed of a panel: an earlier one under another id makes this one dead
    const first = readBy(list, cmd.panel)
    const note = first && idOf(first) !== cmd.id ? `note: the Monitor runs only the first ${cmd.panel} feed, and that is "${idOf(first)}", not this one. To use this one: di monitor feed remove ${cmd.panel} --id ${idOf(first)}` : null
    const already = `the ${cmd.panel} feed is already set, nothing changed`
    if (cmd.dryRun) {
        say(JSON.stringify(config, null, 2))
        info(unchanged ? already : 'dry run: nothing was written')
        if (note) info(note)
        return 0
    }
    if (unchanged) {
        say(already)
        const warning = modeWarning(file)
        if (warning) fail(warning)
        if (note) say(note)
        return 0
    }
    const backup = saveConfig({ file, read, config, now })
    say(`${old ? 'replaced' : 'added'} the ${cmd.panel} feed (id ${cmd.id}): ${oneLine(cmd.command, SHOW_CHARS)}`)
    say(`file: ${file}`)
    say(`backup: ${backup || 'none, the file is new'}`)
    say(`undo: ${old ? `cp ${quote(backup)} ${quote(file)}` : `di monitor feed remove ${cmd.panel}${cmd.id === cmd.panel ? '' : ` --id ${cmd.id}`}`}`)
    if (note) say(note)
    return 0
}

const removeFeed = ({ cmd, file, read, feeds, say, fail, info, now }) => {
    const list = feeds.filter((f) => !(isObj(f) && f.panel === cmd.panel && idOf(f) === cmd.id))
    const removed = feeds.length - list.length
    if (!removed) {
        say(read.exists ? `nothing to remove: no ${cmd.panel} feed with id ${cmd.id} in ${file}` : `nothing to remove: ${file} does not exist`)
        const warning = modeWarning(file)
        if (warning) fail(warning)
        return 0
    }
    const config = { ...read.config, feeds: list }
    if (cmd.dryRun) { say(JSON.stringify(config, null, 2)); info('dry run: nothing was written'); return 0 }
    const backup = saveConfig({ file, read, config, now })
    say(`removed ${removed} ${cmd.panel} feed${removed === 1 ? '' : 's'} (id ${cmd.id})`)
    say(`file: ${file}`)
    say(`backup: ${backup}`)
    say(`undo: cp ${quote(backup)} ${quote(file)}`)
    return 0
}

/**
 * Runs `di monitor feed …`; returns the exit code. deps are injectable for tests. `root` is the folder that holds serverXR/ (only
 * --check needs it: the Monitor's own reader of the list). A dry run keeps stdout for the JSON and says the rest on stderr.
 */
export const runFeed = async (args, deps = {}) => {
    const { env = process.env, home = os.homedir(), say = console.log, fail = console.error, now = () => new Date(), root, limits = {}, exec = execShell } = deps
    const cmd = parseFeedArgs(args)
    if (cmd.error) { fail(cmd.error); return 2 }
    const file = env.DI_MONITOR_CONFIG || path.join(home, '.di', 'monitor.json')
    const read = readFeedConfig(file)
    if (read.error) { fail(`${read.error}. Nothing was changed.`); return 1 }
    const ctx = { cmd, file, read, feeds: read.config.feeds || [], say, fail, info: cmd.dryRun ? fail : say, now, root, limits, exec, env }
    try {
        if (cmd.action === 'list') return listFeeds(ctx)
        return await (cmd.action === 'remove' ? removeFeed(ctx) : addFeed(ctx))
    } catch (error) {
        if (error?.code === 'ECHANGED') fail(`${file} changed while this command ran, so nothing was written. Run the command again.`)
        else if (error?.code === 'ELOCKED') {
            fail(`another di monitor feed command is writing ${file} (${error.lock} exists), so nothing was written. Run the command again. If this stays and no other command is running, delete the lock: rm ${quote(error.lock)}`)
        } else fail(`could not change ${file}: ${error?.code || String(error?.message || error).split('\n')[0]}. The file was not changed.`)
        return 1
    }
}
