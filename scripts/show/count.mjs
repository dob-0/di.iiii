// `di show count`: READ-ONLY count of what the project documents and the desk files of a machine hold
// (docs/architecture/SHOW_IN_THE_PROJECT.md, step 1). Counts, sizes and key names only; never a value.
//
//   di show count [--venue <id> | --host <ssh name>] [--data-dir <dir>] [--di-home <dir>] [--ids] [--json]
//
// The counting is done by lib/countCore.mjs (Node built-ins only): here, or piped to another machine through the
// same transport as `di show go`. The per-browser stores (5) and the save time (6) need the repo, so they run here only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Refusal, loadProfile } from './lib/profile.mjs'
import { assignments, makeTransport, tail } from './lib/transport.mjs'
import { count } from './lib/countCore.mjs'

const CORE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'countCore.mjs')
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const REAL_KEYS = new Set(['spaceId', 'projectId', 'dir', 'path', 'file', 'real'])
const VALUE_FLAGS = ['venue', 'venues-dir', 'host', 'user', 'data-dir', 'di-home']
const SWITCHES = ['local', 'ids', 'json']
const FLAGS = [...VALUE_FLAGS, ...SWITCHES]

/** Removes every real id and path from a result (the default view). */
export function redact(value) {
    if (Array.isArray(value)) return value.map(redact)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !REAL_KEYS.has(k)).map(([k, v]) => [k, redact(v)]))
    return value
}

/**
 * The counting on another machine: the core goes in on stdin of bash, which finds node the way di's own shim does
 * (di's runtime first, then PATH) and hands it the core as ONE argument (the core is well under Linux's 131,072 bytes).
 */
export async function countRemote({ transport, options }) {
    const script = [
        assignments({ CORE: fs.readFileSync(CORE_FILE, 'utf8'), OPTS: JSON.stringify(options) }),
        'if [ -z "$DI_HOME" ]; then DI_HOME="$HOME/.di"; fi',
        'NODE="$DI_HOME/runtime/node/bin/node"',
        'if [ ! -x "$NODE" ]; then NODE=$(command -v node 2>/dev/null); fi',
        'if [ -z "$NODE" ]; then echo "no node on this machine" >&2; exit 127; fi',
        'DI_SHOW_COUNT_RUN=1 "$NODE" --input-type=module -e "$CORE" "$OPTS"'
    ].join('\n')
    const r = await transport.run(script)
    if (r.code !== 0) throw new Refusal(`the count could not run on the other machine (exit ${r.code}): ${tail(r.stderr)}`)
    try { return JSON.parse(r.stdout.toString('utf8')) } catch { throw new Refusal('the other machine did not answer with one JSON object') }
}

// 5. the per-browser stores, from the code: every file under src/ that uses localStorage, sessionStorage or indexedDB
const SHOWISH = /show|desk|project|rig|light|laser|cue|scene|perform|mapping/i
const CALL = /\b(localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*([^,)]*)|\b(indexedDB)\s*\.\s*open\s*\(\s*([^,)]*)/g
export function browserStores(repo = REPO) {
    const src = path.join(repo, 'src')
    if (!fs.existsSync(src)) return null
    const out = []
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name)
            if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue }
            if (!/\.(js|jsx|mjs|cjs|ts|tsx)$/.test(e.name) || /\.test\./.test(e.name)) continue
            const text = fs.readFileSync(p, 'utf8')
            const mention = /localStorage|sessionStorage|indexedDB/.exec(text)
            if (!mention) continue
            const where = path.relative(repo, p).split(path.sep).join('/')
            const lineOf = (i) => text.slice(0, i).split('\n').length
            const rows = new Map()
            const add = (key, name, kind, index) => {
                const id = key ?? name
                if (rows.has(id)) return
                rows.set(id, { key, ...(key === null ? { name } : {}), kind, at: `${where}:${lineOf(index)}`, show: SHOWISH.test(id) || SHOWISH.test(where) })
            }
            for (const m of text.matchAll(CALL)) {
                const store = m[1] || m[3]
                const arg = (m[2] ?? m[4] ?? '').trim()
                const lit = /^(['"`])([^'"`$\\]*)\1$/.exec(arg)
                if (lit) { add(lit[2], null, store, m.index); continue }
                if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
                    const c = new RegExp(`\\b(?:const|let|var)\\s+${arg.replace(/\$/g, '\\$')}\\s*=\\s*(['"\`])([^'"\`$\\\\]*)\\1`).exec(text)
                    if (c) { add(c[2], null, 'key constant', m.index); continue }
                    add(null, arg, 'key built at run time', m.index); continue
                }
                add(null, arg.slice(0, 40), 'key built at run time', m.index)
            }
            if (rows.size === 0) add(null, '', 'store used through a helper', mention.index)
            out.push(...rows.values())
        }
    }
    walk(src)
    return out.sort((a, b) => String(a.key ?? a.name).localeCompare(String(b.key ?? b.name)) || a.at.localeCompare(b.at))
}

// 6. the save time of the largest document that holds a show, without the disk write: read, parse, normalise, serialise as the server does
export function saveTime(file, repo = REPO) {
    const schema = path.join(repo, 'shared', 'projectSchema.cjs')
    if (!fs.existsSync(schema)) return null
    const { normalizeProjectDocument } = createRequire(import.meta.url)(schema)
    const ms = { read: [], parse: [], normalise: [], serialise: [] }
    const clock = () => Number(process.hrtime.bigint()) / 1e6
    for (let i = 0; i < 5; i += 1) {
        let t = clock()
        const raw = fs.readFileSync(file, 'utf8'); ms.read.push(clock() - t); t = clock()
        const doc = JSON.parse(raw); ms.parse.push(clock() - t); t = clock()
        const norm = normalizeProjectDocument(doc); ms.normalise.push(clock() - t); t = clock()
        JSON.stringify(norm, null, 2); ms.serialise.push(clock() - t)
    }
    const med = (a) => Math.round([...a].sort((x, y) => x - y)[2])
    return { read: med(ms.read), parse: med(ms.parse), normalise: med(ms.normalise), serialise: med(ms.serialise), runs: 5, note: 'without the disk write' }
}

const n = (v) => Number(v).toLocaleString('en-US')
const bytesOf = (u) => (u.bytes === null || u.bytes === undefined ? '' : `, ${n(u.bytes)} bytes`)
export function format(r) {
    const L = []
    if (!r.data || !r.data.rule) { L.push(`!! ${r.reason || 'no data folder found'}`); for (const c of r.data?.others || []) L.push(`   ${c.rule}: ${c.state}${c.dir ? ` (${c.dir})` : ''}`); return L.join('\n') }
    L.push(`counted on ${r.ranOn || 'this machine'} (node ${String(r.node || '?').replace(/^v/, '')}, ${r.platform || '?'})`)
    L.push(`data folder read: ${r.data.label} by rule "${r.data.rule}"${r.data.dir ? ` (${r.data.dir})` : ''}; spaces: ${r.data.spacesRule}`)
    if (r.data.spacesState === 'not there') L.push('  spaces folder: not there (no document and no space show file could be counted)')
    for (const c of r.data.others) L.push(`  candidate ${c.n}: ${c.rule}: ${c.state}${c.dir ? ` (${c.dir})` : ''}`)
    const d = r.documents
    L.push(`=== 1. project documents: ${n(d.total)} in ${d.spaces} spaces; ${d.holdingShow} hold a show: ${d.withRig.documents} with a lamp, a designed look or a laser object (${n(d.withRig.cues)} cues), ${d.cuesOnly.documents} with cues only (${n(d.cuesOnly.cues)} cues); in ${d.spacesHoldingShow} spaces; ${d.largestShare.inOneSpace} of ${d.largestShare.of} in one space`)
    L.push(`totals: ${n(d.totals.lamps)} lamps, ${n(d.totals.designedLooks)} designed looks, ${n(d.totals.cues)} cues, ${n(d.totals.laserObjects)} laser objects; cues naming a light look ${d.cuesNaming.lightLook}, a light scene ${d.cuesNaming.lightScene}, a laser look ${d.cuesNaming.laserLook} (of ${n(d.cuesTotal)} cues)`)
    L.push(`  of the lamps ${n(d.totals.lampsNotDmx)} are off DMX (the mark a network laser carries)`)
    if (d.totals.fixtureNoType > 0) L.push(`  fixture marks without a type: ${n(d.totals.fixtureNoType)}, not counted as lamps`)
    if (d.withoutDocument > 0) L.push(`  project folders without a document file: ${d.withoutDocument} (of ${n(d.projectFolders)})`)
    for (const x of d.list) {
        L.push(`  document ${x.n} in space ${x.space}: lamps ${x.lamps}, designed looks ${x.looks}, cues ${x.cues}, laser objects ${x.lasers}${x.projectId ? ` [${x.spaceId}/${x.projectId}]` : ''}`)
    }
    L.push('=== 2. desk files')
    for (const f of r.deskFiles) {
        const where = f.path ? ` (${f.path})` : ''
        L.push(`  desk file ${f.n}: ${f.kind} ${f.label}${where}, ${n(f.bytes)} bytes${f.output ? `, output: ${f.output}` : ''}${f.unread ? ', NOT READ' : ''}`)
        if (f.counts) L.push(`    ${Object.entries(f.counts).map(([k, v]) => `${k} ${v}`).join(' | ')}`)
        if (f.lookScopes) L.push(`    looks by scope: ${Object.entries(f.lookScopes).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`)
        if (f.link) L.push(`    link to a light scene: ${f.link.followLight}; looks that follow a scene ${f.link.looksThatFollowALightScene}`)
        const other = Object.entries(f.otherKeys || {})
        if (other.length) L.push(`    other keys: ${other.map(([k, v]) => `${k} ${v}`).join(', ')}`)
    }
    L.push('=== 2b. other files in the desk folders (not opened)')
    if (!r.deskFolders.length) L.push('  none')
    for (const f of r.deskFolders) L.push(`  ${f.label}: ${Object.entries(f.kinds).map(([k, v]) => `${k} ${v.files} files, ${n(v.bytes)} bytes`).join(' | ')}`)
    const m = r.names
    L.push('=== 3. what names a project')
    L.push(`  desk lamps with a key to a project's lamp: ${m.lampsWithKey}; that lamp exists today for ${m.lampsKeyFound}; without a key: ${m.lampsNoKey}`)
    L.push(`  desk looks named as copies of a designed look: ${m.copies}; the designed look exists for ${m.copiesFound}, missing for ${m.copiesMissing}; not named as copies: ${m.notCopies}; found in the file's own space: ${m.copiesFoundInOwnSpace}`)
    L.push(`  desk cue lists that name a project: ${m.cueListsNamingAProject}; that project is on this machine for ${m.cueListProjectHere}; cues marked missing: ${m.cueListMissing}`)
    L.push(`  laser desk file: ${m.laser.deskFile}; bank looks named by a cue: ${m.laser.looksNamedByACue}; laser looks that cues name: ${m.laser.looksNamedByCues}, of them not in the desk file: ${m.laser.missingLookIds}, named by ${m.laser.cuesNamingAMissingLook} cues; laser rig file: ${m.laser.rigFile}`)
    L.push('=== 4. sizes (document holding a show: saved bytes (spaces and line breaks) | compact characters, whole / lamps / looks / cues / laser | gzip with / without the show part)')
    for (const x of d.list) L.push(`  document ${x.n} in space ${x.space}: ${n(x.bytes)} (${n(x.blankBytes)} spaces and line breaks) | ${n(x.compactChars)} / ${n(x.partChars.lamps)} / ${n(x.partChars.looks)} / ${n(x.partChars.cues)} / ${n(x.partChars.lasers)} | ${n(x.gzipWith)} / ${n(x.gzipWithout)}`)
    if (r.remote) {
        L.push('=== 5. per-browser stores: not listed for another machine (they come from this code tree)')
        L.push('=== 6. save time: not measured on another machine (it needs the code tree there)')
    } else {
        if (r.stores !== undefined) {
            if (r.stores === null) L.push('=== 5. per-browser stores in the code: code not on this machine')
            else {
                const files = new Set(r.stores.map((s) => s.at.slice(0, s.at.lastIndexOf(':'))))
                L.push(`=== 5. per-browser stores in the code: ${r.stores.length} rows in ${files.size} files; ${r.stores.filter((s) => s.key === null && s.kind === 'key built at run time').length} with a key built at run time (* = on show ground)`)
                for (const s of r.stores) L.push(`  ${s.show ? '*' : ' '} ${s.key !== null ? s.key : s.name ? `(${s.name})` : '(none)'} [${s.kind}] ${s.at}`)
            }
        }
        if (r.saveTime !== undefined) {
            L.push('=== 6. save time of the largest document that holds a show, median of 5, without the disk write')
            L.push(r.saveTime ? `  read ${r.saveTime.read} ms, parse ${r.saveTime.parse} ms, normalise ${r.saveTime.normalise} ms, serialise ${r.saveTime.serialise} ms` : '  not measured (the repo is not on this machine, or no document holds a show)')
        }
    }
    if (r.unread.length) {
        L.push(`!! ${r.unread.length} not read:`)
        r.unread.forEach((u, i) => L.push(`  ${i + 1}. ${u.label}${bytesOf(u)}: ${u.error}`))
    }
    return L.join('\n')
}

/** Returns the exit code: 0 counted, 1 something it should read could not be read, 2 refused. */
export async function runCount(args, { env = process.env, print, home = os.homedir(), transportFactory = makeTransport, repo = REPO } = {}) {
    const f = args.flags
    // a mistyped flag must never fall back to the default folder without a word: the count refuses what it does not know
    const unknown = Object.keys(f).find((k) => !FLAGS.includes(k))
    if (unknown !== undefined) throw new Refusal(`di show count does not know --${unknown}; it takes ${FLAGS.map((k) => `--${k}`).join(', ')}`)
    if (args._.length > 1) throw new Refusal(`di show count takes no word after it (${args._.length - 1} given)`)
    const bare = VALUE_FLAGS.find((k) => f[k] === '' || f[k] === true)
    if (bare !== undefined) throw new Refusal(`--${bare} needs a value`)
    const valued = SWITCHES.find((k) => k in f && f[k] !== true)
    if (valued !== undefined) throw new Refusal(`--${valued} takes no value`)
    let host = f.local === true ? 'local' : typeof f.host === 'string' ? f.host : null
    let user = typeof f.user === 'string' ? f.user : null
    if (f.venue && !host) { const p = loadProfile({ flags: f, env, home }); host = p.host; user = user || p.user }
    if (typeof f.venue === 'string' && !host) throw new Refusal(`profile ${f.venue} names no machine: set "host" (or "local"), or pass --host`)
    const ids = f.ids === true
    // the folders are passed as typed: the machine that runs the core resolves them (and a leading ~/) against ITS home
    const given = { ...(typeof f['data-dir'] === 'string' ? { dataDir: f['data-dir'] } : {}), ...(typeof f['di-home'] === 'string' ? { diHome: f['di-home'] } : {}) }
    const remote = Boolean(host) && host !== 'local'
    let r
    if (remote) {
        let transport
        try { transport = transportFactory({ host, user, timeoutMs: 120000 }) } catch (error) { throw new Refusal(`no way to reach the other machine: ${error.message}`) }
        r = await countRemote({ transport, options: { ids, ...given } })
        r.remote = true
        r.ranOn = ids ? transport.where : 'another machine'
        if (!ids) r = redact(r)
        r.ids = ids
    } else {
        r = count({ ids: true, ...given, home, env: { DATA_ROOT: env.DATA_ROOT, SPACES_DIR: env.SPACES_DIR, DI_HOME: env.DI_HOME }, repo })
        if (r.data && r.data.rule) {
            r.stores = browserStores(repo)
            const biggest = (r.documents?.list || []).reduce((a, x) => (!a || x.bytes > a.bytes ? x : a), null)
            r.saveTime = biggest && biggest.file ? saveTime(biggest.file, repo) : null
        }
        r.ranOn = 'this machine'
        r.ids = ids
        if (!ids) r = redact(r)
    }
    print(f.json === true ? JSON.stringify(r) : format(r))
    return r.ok === false || (r.unread && r.unread.length) ? 1 : 0
}
