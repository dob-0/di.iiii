// The counting core of `di show count` (docs/architecture/SHOW_IN_THE_PROJECT.md, step 1).
//
// ONE file, Node built-ins only, so it also runs on another machine with nothing installed there:
//     ssh <host> node --input-type=module - '<options as one JSON argument>' < countCore.mjs
// It prints ONE JSON object. READ-ONLY: files are opened for reading, nothing is created, changed or deleted.
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
    ['fx', 'effects (keys of fx)'], ['lfos', 'LFOs'], ['customProfiles', 'custom fixture types'], ['groups', 'groups'], ['strips', 'strips']]
const LASER_KINDS = [['looks', 'looks'], ['palette', 'palette entries']]
const SCOPES = ['each', 'type', 'global'] // serverXR/src/lighting/looks.js:44

/** The data folder the way the server finds it, with every other candidate. */
function findData(o) {
    const home = o.home || os.homedir()
    const env = o.env || process.env
    const cands = []
    const add = (rule, p) => { if (p) cands.push({ rule, dir: path.resolve(p) }) }
    add('--data-dir', o.dataDir)
    add('DATA_ROOT (serverXR/src/config.js)', env.DATA_ROOT)
    const diHome = o.diHome || env.DI_HOME || path.join(home, '.di')
    add(o.diHome ? '--di-home, then data (scripts/di/paths.mjs)' : 'DI_HOME or ~/.di, then data (scripts/di/paths.mjs)', path.join(diHome, 'data'))
    add('the install folder of di.iiii (older path)', path.join(home, '.local', 'share', 'di.iiii', 'data'))
    if (o.repo) add('data beside the server (serverXR/src/config.js)', path.join(o.repo, 'serverXR', 'data'))
    const seen = []
    let chosen = null
    const others = []
    for (const c of cands) {
        let real = null
        try { real = fs.realpathSync(c.dir) } catch { real = null }
        const entry = { rule: c.rule, dir: c.dir, real }
        if (real === null) { if (c.rule.startsWith('--') || c.rule.startsWith('DATA_ROOT')) others.push({ ...entry, state: 'named, not there' }); continue }
        const twin = seen.find((s) => s.real === real)
        if (twin) { others.push({ ...entry, state: 'there, the same folder as the one read' }); continue }
        seen.push(entry)
        if (!chosen) chosen = entry
        else others.push({ ...entry, state: 'there, not read' })
    }
    return { chosen, others, spacesEnv: env.SPACES_DIR || null }
}

export function count(o = {}) {
    const ids = o.ids === true
    const t0 = Date.now()
    const { chosen, others, spacesEnv } = findData(o)
    const result = { v: 1, node: process.version, platform: process.platform, ids, notes: [] }
    if (!chosen) { result.data = { read: null, others }; result.ok = false; result.reason = 'no data folder found'; return result }
    const data = chosen.dir
    const spacesDir = spacesEnv ? path.resolve(spacesEnv) : path.join(data, 'spaces')
    const rel = (p) => `<data>/${path.relative(data, p)}`.replace(/\\/g, '/')
    result.data = {
        rule: chosen.rule, label: '<data>', ...(ids ? { dir: data } : {}), spacesRule: spacesEnv ? 'SPACES_DIR' : '<data>/spaces',
        others: others.map((c, i) => ({ n: i + 1, rule: c.rule, state: c.state, ...(ids ? { dir: c.dir } : {}) }))
    }
    const unread = []
    const readJson = (file, label, bytes) => {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'))
        } catch (e) { unread.push({ label, bytes, error: errClass(e) }); return undefined }
    }
    const listDirs = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() } catch { return [] } }
    const statSize = (file) => { try { const s = fs.statSync(file); return s.isFile() ? s.size : null } catch { return null } }

    // ---- 1 and 4: the project documents, one in memory at a time
    const spaceIds = listDirs(spacesDir)
    const lampsOf = new Map() // projectId -> Set(entity ids): for the desk lamps' keys
    const designed = new Set() // desk ids of every designed look: for the copies
    const designedBySpace = new Set()
    const laserNamed = new Map() // laser looks that a cue names
    const cue = { total: 0, naming: { lightLook: 0, lightScene: 0, laserLook: 0 } }
    const docs = []
    let docTotal = 0
    const spaceCounts = new Map()
    spaceIds.forEach((sid, si) => {
        for (const pid of listDirs(path.join(spacesDir, sid, 'projects'))) {
            const file = path.join(spacesDir, sid, 'projects', pid, 'document.json')
            const bytes = statSize(file)
            if (bytes === null) continue
            docTotal += 1
            const n = docTotal
            spaceCounts.set(si, (spaceCounts.get(si) || 0) + 1)
            const label = `document ${n} in space ${si + 1}`
            const d = readJson(file, label, bytes)
            if (d === undefined) continue
            if (!isObj(d)) { unread.push({ label, bytes, error: 'NotAnObject' }); continue }
            let lamps = 0; let looks = 0; let lasers = 0
            const cl = { lamps: 0, looks: 0, cues: 0, lasers: 0 }
            const ents = Array.isArray(d.entities) ? d.entities : []
            const lampSet = new Set()
            for (const e of ents) {
                const comp = isObj(e) ? e.components : null
                if (!isObj(comp)) continue
                if (isObj(comp.fixture)) { lamps += 1; cl.lamps += chars(comp.fixture); if (e.id !== undefined) lampSet.add(String(e.id)) }
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
            if (lampSet.size) lampsOf.set(pid, lampSet)
            const row = { n, space: si + 1, ...(ids ? { spaceId: sid, projectId: pid, file } : {}), bytes, holdsShow: lamps + looks + cues.length + lasers > 0, lamps, looks, cues: cues.length, lasers }
            if (row.holdsShow) {
                const whole = JSON.stringify(d)
                row.compactChars = whole.length
                row.partChars = cl
                row.gzipWith = zlib.gzipSync(whole).length
                // the document without its show part: the lamps, designed looks, laser objects and the cue list
                if (Array.isArray(d.entities)) {
                    for (const e of d.entities) {
                        if (!isObj(e) || !isObj(e.components)) continue
                        delete e.components.fixture; delete e.components.rigLooks
                        if (isObj(e.components.beam)) delete e.components.beam.laser
                    }
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
    const sum = (k) => holding.reduce((a, r) => a + r[k], 0)
    result.documents = {
        total: docTotal, spaces: spaceCounts.size, spacesFound: spaceIds.length, holdingShow: holding.length, spacesHoldingShow: perSpace.size,
        largestShare: { inOneSpace: top, of: holding.length },
        totals: { lamps: sum('lamps'), designedLooks: sum('looks'), cues: sum('cues'), laserObjects: sum('lasers') },
        cuesNaming: cue.naming, cuesTotal: cue.total,
        list: holding, withoutShow: docTotal - holding.length - unread.filter((u) => u.label.startsWith('document')).length
    }

    // ---- 2 and 3: the desk files
    const deskFiles = []
    const link = { lampsWithKey: 0, lampsKeyFound: 0, lampsNoKey: 0, copies: 0, copiesFound: 0, copiesMissing: 0, copiesFoundInOwnSpace: 0, notCopies: 0 }
    let fileNo = 0
    const lightFile = (file, label, si) => {
        const bytes = statSize(file)
        if (bytes === null) return
        fileNo += 1
        const row = { n: fileNo, kind: 'light show file', label, ...(ids ? { path: file } : {}), ...(si === null ? {} : { space: si + 1 }), bytes }
        const d = readJson(file, `desk file ${fileNo}`, bytes)
        if (d === undefined) { row.unread = true; deskFiles.push(row); return }
        if (!isObj(d)) { unread.push({ label: `desk file ${fileNo}`, bytes, error: 'NotAnObject' }); return }
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
        row.names = { lamps: lamps.length, lampsWithKey: withKey, lampsKeyFound: found, lampsNoKey: lamps.length - withKey, looksCopies: copies, copiesFound, copiesMissing: copies - copiesFound, copiesFoundInOwnSpace: si === null ? null : own, looksNotCopies: lookRows.length - copies }
        link.lampsWithKey += withKey; link.lampsKeyFound += found; link.lampsNoKey += lamps.length - withKey
        link.copies += copies; link.copiesFound += copiesFound; link.copiesMissing += copies - copiesFound; link.notCopies += lookRows.length - copies
        deskFiles.push(row)
    }
    lightFile(path.join(data, 'lighting', 'show.json'), '<data>/lighting/show.json', null)
    spaceIds.forEach((sid, si) => lightFile(path.join(spacesDir, sid, 'lighting', 'show.json'), `<spaces>/space ${si + 1}/lighting/show.json`, si))

    const laserFile = path.join(data, 'laser', 'desk.json')
    const laserBytes = statSize(laserFile)
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
        } else unread.push({ label: `desk file ${fileNo}`, bytes: laserBytes, error: 'NotAnObject' })
        deskFiles.push(row)
    }
    // cues that name a laser look the desk file does not hold (a cue counted once per cue)
    const missing = [...laserNamed].filter(([id]) => !(laser.have && laser.have.has(id)))
    laser.missingLookIds = missing.length
    laser.cuesNamingAMissingLook = missing.reduce((a, [, c]) => a + c, 0)
    if (!laser.have) laser.looksNamedByACue = 0
    laser.looksNamedByCues = laserNamed.size
    delete laser.have
    const rigBytes = statSize(path.join(data, 'laser', 'laser.json')) // the rig file: stat only, never opened
    laser.rigFile = rigBytes === null ? 'not there' : `there, ${rigBytes} bytes (not opened)`
    result.deskFiles = deskFiles
    result.names = { ...link, laser }
    result.unread = unread
    result.ok = unread.length === 0
    result.ms = Date.now() - t0
    return result
}

// Piped through `node --input-type=module - '<options json>'`: run, print one JSON object.
if (typeof import.meta.url === 'string' && import.meta.url.includes('[eval')) {
    const opts = (() => { try { return JSON.parse(process.argv[process.argv.length - 1]) } catch { return {} } })()
    process.stdout.write(`${JSON.stringify(count(opts))}\n`)
}
