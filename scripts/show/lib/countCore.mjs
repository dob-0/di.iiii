// The counting core of `di show count` (docs/architecture/SHOW_IN_THE_PROJECT.md, step 1).
//
// ONE file, Node built-ins only, so it also runs on another machine with nothing installed there. `di show count --host`
// sends it to `bash -s` there, which starts it as
//     DI_SHOW_COUNT_RUN=1 "$NODE" --input-type=module -e "$CORE" '<options as one JSON argument>'
// and by hand it is
//     DI_SHOW_COUNT_RUN=1 node --input-type=module - '<json>' < countCore.mjs
// Without DI_SHOW_COUNT_RUN=1 the file only exports `count` and prints nothing. It prints ONE JSON object. READ-ONLY: files are opened for reading, nothing is created, changed or deleted.
// No value is kept in the result: only counts, sizes and the schema's own key names. A file's `output` key (the wire) is
// dropped the moment the file is parsed; the laser rig file (laser.json) is never opened, only `stat`ed. Real ids and
// paths enter the result only with `ids: true`.
// Syntax: Node 20 and older; `node:path` and `os.homedir()` only, so it also runs on macOS and Windows.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const COPY_PREFIX = 'rig-' // src/rigbuild/looks.js:31 DESK_LOOK_PREFIX
const deskLookId = (id) => `${COPY_PREFIX}${id}`.slice(0, 40) // src/rigbuild/looks.js:32
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const sizeOf = (v) => (Array.isArray(v) || isObj(v) ? (Array.isArray(v) ? v.length : Object.keys(v).length) : 0)
const records = (v) => (Array.isArray(v) ? v.filter(isObj) : isObj(v) ? Object.values(v).filter(isObj) : [])
const chars = (v) => JSON.stringify(v).length
const errClass = (e) => (e && e.code) || (e instanceof SyntaxError ? 'ParseError' : (e && e.name) || 'Error')

// The light show file: the kinds the plan names, by their key in the file. Every other key is counted under its own name.
const LIGHT_KINDS = [['fixtures', 'lamps'], ['looks', 'looks'], ['scenes', 'light scenes'], ['layers', 'layers'], ['sets', 'sets'],
    ['fx', 'effect settings (keys of fx)'], ['lfos', 'LFOs'], ['customProfiles', 'custom fixture types'], ['groups', 'groups'], ['strips', 'strips']]
const LASER_KINDS = [['looks', 'looks'], ['palette', 'palette entries']]
const SCOPES = ['each', 'type', 'global'] // serverXR/src/lighting/looks.js:44

const notThere = (e) => e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')
const expand = (p, home) => (p === '~' ? home : /^~[\\/]/.test(p) ? path.join(home, p.slice(2)) : p)
const realOrNull = (d) => { try { return fs.realpathSync(d) } catch { return null } }

/**
 * The data folder the way the server finds it. A folder that was NAMED (--data-dir, --di-home, DATA_ROOT, DI_HOME) and is not
 * there stops the count; only the unnamed defaults fall through. Order: the flags, then the environment, then the defaults.
 */
function findData(o) {
    const home = o.home || os.homedir()
    const env = o.env || process.env
    const at = (p) => path.resolve(expand(String(p), home))
    const cands = []
    const add = (name, rule, p, named) => { if (p) cands.push({ name, rule, dir: at(p), named }) }
    add('--data-dir', '--data-dir', o.dataDir, true)
    add('--di-home', '--di-home, then data (scripts/di/paths.mjs)', o.diHome && path.join(at(o.diHome), 'data'), true)
    add('DATA_ROOT', 'DATA_ROOT (serverXR/src/config.js)', env.DATA_ROOT, true)
    add('DI_HOME', 'DI_HOME, then data (scripts/di/paths.mjs)', env.DI_HOME && path.join(at(env.DI_HOME), 'data'), true)
    add('~/.di', '~/.di, then data (scripts/di/paths.mjs)', path.join(home, '.di', 'data'), false)
    add('older path', 'the install folder of di.iiii (older path)', path.join(home, '.local', 'share', 'di.iiii', 'data'), false)
    if (o.repo) add('beside the server', 'data beside the server (serverXR/src/config.js)', path.join(o.repo, 'serverXR', 'data'), false)
    const entries = cands.map((c) => ({ ...c, real: realOrNull(c.dir) }))
    const first = entries.find((e) => e.named)
    const chosen = first ? (first.real === null ? null : first) : entries.find((e) => e.real !== null) || null
    const seen = []
    const others = []
    for (const e of entries) {
        if (e === chosen) { seen.push(e); continue }
        if (e.real === null) { if (e.named) others.push({ rule: e.rule, dir: e.dir, state: 'named, not there' }); continue }
        if (chosen === null) { others.push({ rule: e.rule, dir: e.dir, state: 'there, not read' }); continue }
        others.push({ rule: e.rule, dir: e.dir, state: seen.some((s) => s.real === e.real) ? 'there, the same folder as the one read' : 'there, not read' })
        seen.push(e)
    }
    const reason = first && first.real === null ? `the folder named by ${first.name} is not there` : chosen ? null : 'no data folder found'
    return { chosen, others, reason, spacesEnv: env.SPACES_DIR ? at(env.SPACES_DIR) : null }
}

export function count(o = {}) {
    const ids = o.ids === true
    const t0 = Date.now()
    const { chosen, others, reason, spacesEnv } = findData(o)
    const result = { v: 1, node: process.version, platform: process.platform, ids }
    const mapOthers = () => others.map((c, i) => ({ n: i + 1, rule: c.rule, state: c.state, ...(ids ? { dir: c.dir } : {}) }))
    const stop = (why) => { result.data = { read: null, others: mapOthers() }; result.ok = false; result.reason = why; result.unread = []; return result }
    if (!chosen) return stop(reason)
    const data = chosen.dir
    if (spacesEnv && realOrNull(spacesEnv) === null) return stop('the folder named by SPACES_DIR is not there')
    const spacesDir = spacesEnv || path.join(data, 'spaces')
    const rel = (p) => `<data>/${path.relative(data, p)}`.replace(/\\/g, '/')
    result.data = {
        rule: chosen.rule, label: '<data>', ...(ids ? { dir: data } : {}), spacesRule: spacesEnv ? 'SPACES_DIR' : '<data>/spaces',
        spacesState: realOrNull(spacesDir) === null ? 'not there' : 'there', others: mapOthers()
    }
    const unread = []
    // only "not there" (ENOENT, ENOTDIR) is silent; any other error is listed, numbered, with its code
    const listDirs = (dir, label) => {
        try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() } catch (e) {
            if (!notThere(e)) unread.push({ label, bytes: null, error: errClass(e) })
            return []
        }
    }
    const statSize = (file, label) => {
        try { const s = fs.statSync(file); return s.isFile() ? s.size : null } catch (e) {
            if (!notThere(e)) unread.push({ label, bytes: null, error: errClass(e) })
            return null
        }
    }
    const readBuf = (file, label, bytes) => {
        try { return fs.readFileSync(file) } catch (e) { unread.push({ label, bytes, error: errClass(e) }); return undefined }
    }
    const parse = (buf, label, bytes) => {
        try { return JSON.parse(buf.toString('utf8')) } catch (e) { unread.push({ label, bytes, error: errClass(e) }); return undefined }
    }
    const readJson = (file, label, bytes) => { const buf = readBuf(file, label, bytes); return buf === undefined ? undefined : parse(buf, label, bytes) }

    // ---- 1 and 4: the project documents, one in memory at a time
    const spaceIds = listDirs(spacesDir, 'folder <spaces>')
    const lampsOf = new Map() // projectId -> Set(entity ids), a union over every space: for the desk lamps' keys
    const projectFolderIds = new Set() // every project folder on this machine, any space: for the desk cue lists
    const designed = new Set() // desk ids of every designed look: for the copies
    const designedBySpace = new Set()
    const laserNamed = new Map() // laser looks that a cue names
    const cue = { total: 0, naming: { lightLook: 0, lightScene: 0, laserLook: 0 } }
    const docs = []
    let docTotal = 0
    let projectFolders = 0
    let withoutDocument = 0
    let fixtureNoType = 0
    const spaceCounts = new Map()
    spaceIds.forEach((sid, si) => {
        for (const pid of listDirs(path.join(spacesDir, sid, 'projects'), `folder <spaces>/space ${si + 1}/projects`)) {
            projectFolders += 1
            projectFolderIds.add(pid)
            const file = path.join(spacesDir, sid, 'projects', pid, 'document.json')
            const listed = unread.length
            const bytes = statSize(file, `document of project folder ${projectFolders} in space ${si + 1}`)
            if (bytes === null) { if (unread.length === listed) withoutDocument += 1; continue } // an error other than "not there" is in the unread list, not here
            docTotal += 1
            const n = docTotal
            spaceCounts.set(si, (spaceCounts.get(si) || 0) + 1)
            const label = `document ${n} in space ${si + 1}`
            const buf = readBuf(file, label, bytes)
            if (buf === undefined) continue
            const d = parse(buf, label, bytes)
            if (d === undefined) continue
            if (!isObj(d)) { unread.push({ label, bytes, error: 'NotAnObject' }); continue }
            if (d.entities !== undefined && !Array.isArray(d.entities)) { unread.push({ label, bytes, error: 'EntitiesNotAList' }); continue }
            let lamps = 0; let looks = 0; let lasers = 0; let notDmx = 0
            const cl = { lamps: 0, looks: 0, cues: 0, lasers: 0 }
            const ents = Array.isArray(d.entities) ? d.entities : []
            const lampSet = new Set()
            for (const e of ents) {
                const comp = isObj(e) ? e.components : null
                if (!isObj(comp)) continue
                if (isObj(comp.fixture)) {
                    // the code's rule (src/rigbuild/autoPatch.js:16 isLamp): a lamp has a fixture type that is a non-empty string
                    if (typeof comp.fixture.type === 'string' && comp.fixture.type !== '') {
                        lamps += 1; cl.lamps += chars(comp.fixture); if (e.id !== undefined) lampSet.add(String(e.id))
                        if (comp.fixture.dmx === false) notDmx += 1 // off DMX: one of the marks of a network laser (src/rigbuild/laserShowState.js:32)
                    } else fixtureNoType += 1
                }
                if (isObj(comp.beam) && isObj(comp.beam.laser)) { lasers += 1; cl.lasers += chars(comp.beam.laser) }
                if (isObj(comp.rigLooks)) {
                    const ls = records(comp.rigLooks.looks)
                    looks += ls.length; cl.looks += chars(comp.rigLooks)
                    for (const l of ls) { const k = deskLookId(l.id); designed.add(k); designedBySpace.add(`${si}\t${k}`) }
                }
            }
            const cues = isObj(d.mappingState) ? records(d.mappingState.cues) : []
            if (cues.length) cl.cues = chars(d.mappingState.cues)
            for (const q of cues) {
                cue.total += 1
                if (q.lightLook) cue.naming.lightLook += 1
                if (q.lightScene) cue.naming.lightScene += 1
                if (typeof q.laserLook === 'string' && q.laserLook) { cue.naming.laserLook += 1; laserNamed.set(q.laserLook, (laserNamed.get(q.laserLook) || 0) + 1) }
            }
            if (lampSet.size) { const set = lampsOf.get(pid) || new Set(); for (const x of lampSet) set.add(x); lampsOf.set(pid, set) }
            const row = { n, space: si + 1, ...(ids ? { spaceId: sid, projectId: pid, file } : {}), bytes, holdsShow: lamps + looks + cues.length + lasers > 0, rig: lamps + looks + lasers > 0, lamps, lampsNotDmx: notDmx, looks, cues: cues.length, lasers }
            if (row.holdsShow) {
                let blank = 0
                for (let i = 0; i < buf.length; i += 1) { const c = buf[i]; if (c === 32 || c === 9 || c === 10 || c === 13) blank += 1 }
                row.blankBytes = blank
                const whole = JSON.stringify(d)
                row.compactChars = whole.length
                row.partChars = cl
                row.gzipWith = zlib.gzipSync(whole).length
                // the document without its show part: the lamps, designed looks, laser objects and the cue list
                for (const e of ents) {
                    if (!isObj(e) || !isObj(e.components)) continue
                    delete e.components.fixture; delete e.components.rigLooks
                    if (isObj(e.components.beam)) delete e.components.beam.laser
                }
                if (isObj(d.mappingState)) delete d.mappingState.cues
                row.gzipWithout = zlib.gzipSync(JSON.stringify(d)).length
            }
            docs.push(row)
        }
    })
    const holding = docs.filter((r) => r.holdsShow)
    const perSpace = new Map()
    for (const r of holding) perSpace.set(r.space, (perSpace.get(r.space) || 0) + 1)
    const top = [...perSpace.values()].sort((a, b) => b - a)[0] || 0
    const sum = (k, rows = holding) => rows.reduce((a, r) => a + r[k], 0)
    const withRig = holding.filter((r) => r.rig)
    const cuesOnly = holding.filter((r) => !r.rig)
    result.documents = {
        total: docTotal, spaces: spaceCounts.size, spacesFound: spaceIds.length, holdingShow: holding.length, spacesHoldingShow: perSpace.size,
        withRig: { documents: withRig.length, cues: sum('cues', withRig) }, cuesOnly: { documents: cuesOnly.length, cues: sum('cues', cuesOnly) },
        projectFolders, withoutDocument,
        largestShare: { inOneSpace: top, of: holding.length },
        totals: { lamps: sum('lamps'), lampsNotDmx: sum('lampsNotDmx'), fixtureNoType, designedLooks: sum('looks'), cues: sum('cues'), laserObjects: sum('lasers') },
        cuesNaming: cue.naming, cuesTotal: cue.total,
        list: holding, withoutShow: docTotal - holding.length - unread.filter((u) => u.label.startsWith('document')).length
    }

    // ---- 2 and 3: the desk files
    const deskFiles = []
    const link = { lampsWithKey: 0, lampsKeyFound: 0, lampsNoKey: 0, copies: 0, copiesFound: 0, copiesMissing: 0, copiesFoundInOwnSpace: 0, notCopies: 0, cueListsNamingAProject: 0, cueListProjectHere: 0, cueListMissing: 0 }
    let fileNo = 0
    const lightFile = (file, label, si) => {
        const bytes = statSize(file, `desk file ${fileNo + 1}`)
        if (bytes === null) return
        fileNo += 1
        const row = { n: fileNo, kind: 'light show file', label, ...(ids ? { path: file } : {}), ...(si === null ? {} : { space: si + 1 }), bytes }
        const d = readJson(file, `desk file ${fileNo}`, bytes)
        if (d === undefined) { row.unread = true; deskFiles.push(row); return }
        if (!isObj(d)) { unread.push({ label: `desk file ${fileNo}`, bytes, error: 'NotAnObject' }); row.unread = true; deskFiles.push(row); return }
        row.output = 'output' in d ? 'there' : 'not there'
        delete d.output // the wire: dropped unread
        const counts = {}
        const known = new Set()
        for (const [k, name] of LIGHT_KINDS) { if (k in d) { counts[name] = sizeOf(d[k]); known.add(k) } }
        counts['cue list'] = isObj(d.cues) ? sizeOf(d.cues.list) : sizeOf(d.cues); known.add('cues')
        counts['MIDI map entries'] = isObj(d.midi) ? sizeOf(d.midi.maps) : 0; known.add('midi')
        const lookRows = records(d.looks)
        const scope = {}
        for (const l of lookRows) { const s = SCOPES.includes(l.scope) ? l.scope : 'not set'; scope[s] = (scope[s] || 0) + 1 }
        row.counts = counts
        row.lookScopes = scope
        const other = {}
        for (const [k, v] of Object.entries(d)) if (!known.has(k)) other[k] = Array.isArray(v) || isObj(v) ? sizeOf(v) : 'a single value'
        row.otherKeys = other
        // what names a project
        const lamps = records(d.fixtures)
        let withKey = 0; let found = 0
        for (const f of lamps) {
            const k = typeof f.rigKey === 'string' ? f.rigKey : ''
            const at = k.indexOf(':')
            if (at < 1) continue
            withKey += 1
            const set = lampsOf.get(k.slice(0, at))
            if (set && set.has(k.slice(at + 1))) found += 1
        }
        let copies = 0; let copiesFound = 0; let own = 0
        for (const l of lookRows) {
            if (typeof l.id !== 'string' || !l.id.startsWith(COPY_PREFIX)) continue
            copies += 1
            if (designed.has(l.id)) copiesFound += 1
            if (si !== null && designedBySpace.has(`${si}\t${l.id}`)) own += 1
        }
        const cueProject = isObj(d.cues) && typeof d.cues.project === 'string' && d.cues.project !== '' ? d.cues.project : null
        const cueMissing = isObj(d.cues) ? sizeOf(d.cues.missing) : 0
        row.names = { cueListProject: cueProject === null ? 'none' : projectFolderIds.has(cueProject) ? 'here' : 'not here', cueListMissing: cueMissing, lamps: lamps.length, lampsWithKey: withKey, lampsKeyFound: found, lampsNoKey: lamps.length - withKey, looksCopies: copies, copiesFound, copiesMissing: copies - copiesFound, copiesFoundInOwnSpace: si === null ? null : own, looksNotCopies: lookRows.length - copies }
        link.lampsWithKey += withKey; link.lampsKeyFound += found; link.lampsNoKey += lamps.length - withKey
        if (cueProject !== null) { link.cueListsNamingAProject += 1; if (projectFolderIds.has(cueProject)) link.cueListProjectHere += 1 }
        link.cueListMissing += cueMissing
        if (si !== null) link.copiesFoundInOwnSpace += own
        link.copies += copies; link.copiesFound += copiesFound; link.copiesMissing += copies - copiesFound; link.notCopies += lookRows.length - copies
        deskFiles.push(row)
    }
    lightFile(path.join(data, 'lighting', 'show.json'), '<data>/lighting/show.json', null)
    spaceIds.forEach((sid, si) => lightFile(path.join(spacesDir, sid, 'lighting', 'show.json'), `<spaces>/space ${si + 1}/lighting/show.json`, si))

    const laserFile = path.join(data, 'laser', 'desk.json')
    const laserBytes = statSize(laserFile, 'desk file (laser)')
    const laser = { deskFile: laserBytes === null ? 'not there' : 'there', label: rel(laserFile) }
    if (laserBytes !== null) {
        fileNo += 1
        const row = { n: fileNo, kind: 'laser desk file', label: rel(laserFile), ...(ids ? { path: laserFile } : {}), bytes: laserBytes }
        const d = readJson(laserFile, `desk file ${fileNo}`, laserBytes)
        if (d === undefined) row.unread = true
        else if (isObj(d)) {
            const counts = {}
            const known = new Set()
            for (const [k, name] of LASER_KINDS) { if (k in d) { counts[name] = sizeOf(d[k]); known.add(k) } }
            known.add('followLight')
            const lookRows = records(d.looks)
            row.counts = counts
            row.link = { followLight: d.followLight === true ? 'on' : 'off', looksThatFollowALightScene: lookRows.filter((l) => typeof l.follows === 'string' && l.follows !== '').length }
            const other = {}
            for (const [k, v] of Object.entries(d)) if (!known.has(k)) other[k] = Array.isArray(v) || isObj(v) ? sizeOf(v) : 'a single value'
            row.otherKeys = other
            const have = new Set(lookRows.map((l) => String(l.id)))
            let named = 0
            for (const id of laserNamed.keys()) if (have.has(id)) named += 1
            laser.looksNamedByACue = named
            laser.bankLooks = lookRows.length
            laser.have = have
        } else { unread.push({ label: `desk file ${fileNo}`, bytes: laserBytes, error: 'NotAnObject' }); row.unread = true }
        deskFiles.push(row)
    }
    // cues that name a laser look the desk file does not hold (a cue counted once per cue)
    const missing = [...laserNamed].filter(([id]) => !(laser.have && laser.have.has(id)))
    laser.missingLookIds = missing.length
    laser.cuesNamingAMissingLook = missing.reduce((a, [, c]) => a + c, 0)
    if (!laser.have) laser.looksNamedByACue = 0
    laser.looksNamedByCues = laserNamed.size
    delete laser.have
    const rigBytes = statSize(path.join(data, 'laser', 'laser.json'), 'laser rig file (stat only)') // the rig file: stat only, never opened
    laser.rigFile = rigBytes === null ? 'not there' : `there, ${rigBytes} bytes (not opened)`
    // ---- 2b: what else is in the desk folders: lstat only, nothing opened, no file name printed for "other"
    const deskFolders = []
    const folderOf = (dir, label, role, isData) => {
        const kinds = {}
        const visit = (d, relDir) => {
            let ents
            try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch (e) {
                if (!notThere(e)) unread.push({ label: `folder ${label}`, bytes: null, error: errClass(e) })
                return
            }
            for (const e of ents) {
                const p = path.join(d, e.name)
                const r = relDir ? `${relDir}/${e.name}` : e.name
                if (e.isDirectory()) { visit(p, r); continue }
                if ((role === 'lighting' && r === 'show.json') || (role === 'laser' && (r === 'desk.json' || r === 'laser.json'))) continue
                let kind = 'other'
                if (r === 'show.prev.json') kind = 'previous copy'
                else if (r === 'show.json.tmp') kind = 'unfinished write'
                else if (r.startsWith('backups/')) kind = 'backups'
                else if (r.startsWith('library/')) kind = 'fixture library'
                else if (isData && role === 'lighting' && r === 'desk.json') kind = 'loaded-show pointer'
                else if (isData && role === 'show' && r === 'control.json') kind = 'show page control file'
                else if (isData && role === 'show' && r.startsWith('venues/')) kind = 'venue profiles'
                let size
                try { size = fs.lstatSync(p).size } catch (err) { unread.push({ label: `folder ${label}`, bytes: null, error: errClass(err) }); continue }
                const k = kinds[kind] || (kinds[kind] = { files: 0, bytes: 0 })
                k.files += 1; k.bytes += size
            }
        }
        visit(dir, '')
        if (Object.keys(kinds).length) deskFolders.push({ label, kinds })
    }
    for (const role of ['lighting', 'laser', 'show']) folderOf(path.join(data, role), `<data>/${role}`, role, true)
    spaceIds.forEach((sid, si) => { for (const role of ['lighting', 'laser']) folderOf(path.join(spacesDir, sid, role), `<spaces>/space ${si + 1}/${role}`, role, false) })
    result.deskFolders = deskFolders
    result.deskFiles = deskFiles
    result.names = { ...link, laser }
    result.unread = unread
    result.ok = unread.length === 0
    result.ms = Date.now() - t0
    return result
}

// Started with DI_SHOW_COUNT_RUN=1 (see the top): run, print one JSON object.
if (process.env.DI_SHOW_COUNT_RUN === '1') {
    // the last argument is the options, one JSON object; none (nothing, or the "-" of a piped run) means the defaults;
    // anything else stops the run, so options that did not arrive whole never count the default folder instead
    const arg = process.argv.length > 1 ? process.argv[process.argv.length - 1] : '-'
    let opts = {}
    if (arg !== '-') { try { opts = JSON.parse(arg) } catch { opts = null } }
    if (!isObj(opts)) { process.stderr.write('the options are not one JSON object\n'); process.exitCode = 2 } else process.stdout.write(`${JSON.stringify(count(opts))}\n`)
}
