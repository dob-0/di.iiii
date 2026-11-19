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
const REAL_KEYS = new Set(['spaceId', 'projectId', 'dir', 'path', 'file'])

/** Removes every real id and path from a result (the default view). */
export function redact(value) {
    if (Array.isArray(value)) return value.map(redact)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !REAL_KEYS.has(k)).map(([k, v]) => [k, redact(v)]))
    return value
}

/** The counting on another machine: the core goes in on stdin of bash, which hands it to node on that machine. */
export async function countRemote({ transport, options }) {
    const script = [
        assignments({ CORE: fs.readFileSync(CORE_FILE, 'utf8'), OPTS: JSON.stringify(options) }),
        'command -v node >/dev/null 2>&1 || { echo "no node on this machine" >&2; exit 127; }',
        'node --input-type=module -e "$CORE" "$OPTS"'
    ].join('\n')
    const r = await transport.run(script)
    if (r.code !== 0) throw new Refusal(`the count could not run on ${transport.where} (exit ${r.code}): ${tail(r.stderr)}`)
    try { return JSON.parse(r.stdout.toString('utf8')) } catch { throw new Refusal(`${transport.where} did not answer with one JSON object`) }
}

// 5. the per-browser stores, by name, from the code: the string key at each storage call, with file:line
const STORE_CALL = /\b(localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*(['"`])([^'"`$]+)\2|\bindexedDB\s*\.\s*open\s*\(\s*(['"`])([^'"`$]+)\4|\b([A-Z][A-Z0-9_]*_(?:KEY|STORE|DB|STORAGE))\s*=\s*(['"`])([^'"`$]+)\7/
const SHOWISH = /show|desk|project|rig|light|laser|cue|scene|perform|mapping/i
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
            if (!/localStorage|sessionStorage|indexedDB/.test(text)) continue
            text.split('\n').forEach((line, i) => {
                const m = STORE_CALL.exec(line)
                if (!m) return
                const key = m[3] || m[5] || m[8]
                const kind = m[1] || (m[5] ? 'indexedDB' : 'key constant')
                const where = path.relative(repo, p).split(path.sep).join('/')
                if (SHOWISH.test(key) || SHOWISH.test(where)) out.push({ key, kind, at: `${where}:${i + 1}` })
            })
        }
    }
    walk(src)
    const seen = new Set()
    return out.filter((r) => { const k = `${r.key}|${r.at}`; if (seen.has(k)) return false; seen.add(k); return true }).sort((a, b) => a.key.localeCompare(b.key) || a.at.localeCompare(b.at))
}

// 6. the save time of the largest document, without the disk write: read, parse, normalise, serialise as the server does
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
export function format(r) {
    const L = []
    if (!r.data || !r.data.rule) { L.push(`!! ${r.reason || 'no data folder found'}`); for (const c of r.data?.others || []) L.push(`   ${c.rule}: ${c.state}`); return L.join('\n') }
    L.push(`data folder read: ${r.data.label} by rule "${r.data.rule}"${r.data.dir ? ` (${r.data.dir})` : ''}; spaces: ${r.data.spacesRule}`)
    for (const c of r.data.others) L.push(`  candidate ${c.n}: ${c.rule}: ${c.state}${c.dir ? ` (${c.dir})` : ''}`)
    const d = r.documents
    L.push(`=== 1. project documents: ${n(d.total)} in ${d.spaces} spaces; ${d.holdingShow} hold a show (in ${d.spacesHoldingShow} spaces; ${d.largestShare.inOneSpace} of ${d.largestShare.of} in one space)`)
    L.push(`totals: ${n(d.totals.lamps)} lamps, ${n(d.totals.designedLooks)} designed looks, ${n(d.totals.cues)} cues, ${n(d.totals.laserObjects)} laser objects; cues naming a light look ${d.cuesNaming.lightLook}, a light scene ${d.cuesNaming.lightScene}, a laser look ${d.cuesNaming.laserLook} (of ${n(d.cuesTotal)} cues)`)
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
    const m = r.names
    L.push('=== 3. what names a project')
    L.push(`  desk lamps with a key to a project's lamp: ${m.lampsWithKey}; that lamp exists today for ${m.lampsKeyFound}; without a key: ${m.lampsNoKey}`)
    L.push(`  desk looks named as copies of a designed look: ${m.copies}; the designed look exists for ${m.copiesFound}, missing for ${m.copiesMissing}; not named as copies: ${m.notCopies}`)
    L.push(`  laser desk file: ${m.laser.deskFile}; bank looks named by a cue: ${m.laser.looksNamedByACue}; laser looks that cues name: ${m.laser.looksNamedByCues}, of them not in the desk file: ${m.laser.missingLookIds}, named by ${m.laser.cuesNamingAMissingLook} cues; laser rig file: ${m.laser.rigFile}`)
    L.push('=== 4. sizes (document holding a show: saved bytes | compact characters, whole / lamps / looks / cues / laser | gzip with / without the show part)')
    for (const x of d.list) L.push(`  document ${x.n} in space ${x.space}: ${n(x.bytes)} | ${n(x.compactChars)} / ${n(x.partChars.lamps)} / ${n(x.partChars.looks)} / ${n(x.partChars.cues)} / ${n(x.partChars.lasers)} | ${n(x.gzipWith)} / ${n(x.gzipWithout)}`)
    if (r.stores !== undefined) {
        L.push('=== 5. per-browser stores named in the code (keys built at run time can be missed)')
        if (r.stores === null) L.push('  code not on this machine')
        else for (const s of r.stores) L.push(`  ${s.key} (${s.kind}) ${s.at}`)
    }
    if (r.saveTime !== undefined) {
        L.push('=== 6. save time of the largest document, median of 5, without the disk write')
        L.push(r.saveTime ? `  read ${r.saveTime.read} ms, parse ${r.saveTime.parse} ms, normalise ${r.saveTime.normalise} ms, serialise ${r.saveTime.serialise} ms` : '  not measured (the repo is not on this machine, or no document holds a show)')
    }
    if (r.unread.length) {
        L.push(`!! ${r.unread.length} not read:`)
        r.unread.forEach((u, i) => L.push(`  ${i + 1}. ${u.label}, ${n(u.bytes)} bytes: ${u.error}`))
    }
    return L.join('\n')
}

/** Returns the exit code: 0 counted, 1 something it should read could not be read, 2 refused. */
export async function runCount(args, { env = process.env, print, home = os.homedir(), transportFactory = makeTransport, repo = REPO } = {}) {
    const f = args.flags
    let host = typeof f.host === 'string' ? f.host : null
    let user = typeof f.user === 'string' ? f.user : null
    if (f.venue && !host) { const p = loadProfile({ flags: f, env, home }); host = p.host; user = user || p.user }
    if (typeof f.venue === 'string' && !host) throw new Refusal(`profile ${f.venue} names no machine: set "host" (or "local"), or pass --host`)
    const ids = f.ids === true
    const options = { ids: host && host !== 'local' ? ids : true, home: undefined, env: undefined }
    if (typeof f['data-dir'] === 'string') options.dataDir = path.resolve(f['data-dir'])
    if (typeof f['di-home'] === 'string') options.diHome = path.resolve(f['di-home'])
    const remote = host && host !== 'local'
    let r
    if (remote) {
        r = await countRemote({ transport: transportFactory({ host, user, timeoutMs: 120000 }), options: { ids, ...(options.dataDir ? { dataDir: options.dataDir } : {}), ...(options.diHome ? { diHome: options.diHome } : {}) } })
        if (!ids) r = redact(r)
    } else {
        r = count({ ...options, home, env: { DATA_ROOT: env.DATA_ROOT, SPACES_DIR: env.SPACES_DIR, DI_HOME: env.DI_HOME }, repo })
        r.stores = browserStores(repo)
        const biggest = (r.documents?.list || []).reduce((a, x) => (!a || x.bytes > a.bytes ? x : a), null)
        r.saveTime = biggest && biggest.file ? saveTime(biggest.file, repo) : null
        r.ids = ids
        if (!ids) r = redact(r)
    }
    print(f.json === true ? JSON.stringify(r) : format(r))
    return r.ok === false || (r.unread && r.unread.length) ? 1 : 0
}
