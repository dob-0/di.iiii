// The venue profile: how one production's run binds to a place's machine and devices (gap G10).
//
// Precedence for every value: flag > DI_* env > venue file > built-in default
// (twelve-factor config; Ansible "one inventory per environment"; Kustomize base + overlays;
// RESEARCH-left-behind G15, RESEARCH-show-safety 15). The built-in defaults below carry no
// production name, address or id: `lintDefaults.mjs` fails the tests when one appears in this tree.
//
// Two safety properties, both fail closed:
//  - the device blocks (laser, light, midi, watch) must be stated by the venue file: an object
//    (present), false (none at this place) or null (unknown, allowed only while the profile is
//    not confirmed). A forgotten block is a refusal, never a silently skipped safety line.
//  - the machine's venue marker must name the same venue (`checkMarker`); a mismatch refuses.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SEED_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'venues')
export const DEVICE_BLOCKS = ['laser', 'light', 'midi', 'watch']

// Platform values only. `host: null` = not known: tools refuse; `host: "local"` = this machine.
export const DEFAULTS = Object.freeze({
    host: null,
    user: null,
    api: null,
    diHome: '~/.di',
    backupsDir: '~/di-backups',
    packsDir: null,
    markerPath: '~/.config/di/venue',
    pages: ['laser/', 'light/', 'show/'],
    thresholds: Object.freeze({
        tempWarnC: 85,            // the owner's written ">85 C wait" rule for his PC, reused; unvalidated on a stage machine
        tempNoGoC: 90,            // ours, unvalidated (the old GO stopped only at 95 C: G07)
        soakS: 60,                // ours, unvalidated: no source gives a soak time (RESEARCH-show-safety 3)
        soakIntervalS: 10,
        soakSlopeMaxCPerMin: null, // set from the first load-in data; until then printed, not gated
        kernelWindowS: 600,
        kernelErrorsMax: 0,
        watchFreshS: 15
    }),
    checkpoint: Object.freeze({
        data: ['laser', 'lighting'],
        states: ['laser/api/state', 'laser/desk/api/state', 'light/api/summary']
    }),
    ports: [],
    links: [],
    posture: null,
    release: Object.freeze({ required: true }),
    journal: Object.freeze({ persistent: true })
})

// Values a flag or a DI_* environment variable may set (granular, one per value).
export const KEYS = [
    { key: 'host', flag: 'host', env: 'DI_SHOW_HOST' },
    { key: 'user', flag: 'user', env: 'DI_SHOW_USER' },
    { key: 'api', flag: 'api', env: 'DI_SHOW_API' },
    { key: 'diHome', flag: 'di-home' },
    { key: 'backupsDir', flag: 'backups', env: 'DI_SHOW_BACKUPS' },
    { key: 'markerPath', flag: 'marker', env: 'DI_VENUE_MARKER' },
    { key: 'thresholds.soakS', flag: 'soak', env: 'DI_SHOW_SOAK_S', number: true },
    { key: 'thresholds.soakIntervalS', flag: 'interval', env: 'DI_SHOW_SOAK_INTERVAL_S', number: true },
    { key: 'thresholds.tempNoGoC', flag: 'temp-nogo', env: 'DI_SHOW_TEMP_NOGO_C', number: true }
]

export class Refusal extends Error {
    constructor(message) { super(message); this.name = 'Refusal'; this.code = 2 }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
export const getPath = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
const hasPath = (obj, dotted) => getPath(obj, dotted) !== undefined
const setPath = (obj, dotted, value) => {
    const keys = dotted.split('.')
    let o = obj
    for (const k of keys.slice(0, -1)) { if (!isObj(o[k])) o[k] = {}; o = o[k] }
    o[keys.at(-1)] = value
}
const merge = (base, over) => {
    const out = structuredClone(base)
    for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : structuredClone(v)
    return out
}
export const expandHome = (p, home = os.homedir()) => (p === '~' ? home : String(p).startsWith('~/') ? path.join(home, p.slice(2)) : p)

const SAFE_WORD = /^[A-Za-z0-9._/~:-]+$/
const VIDPID = /^[0-9a-f]{4}:[0-9a-f]{4}$/
const IFACE = /^[A-Za-z0-9_.:-]{1,15}$/

/** Problems with a venue file, as plain sentences; [] = valid. */
export function validate(raw, id) {
    const p = []
    if (!isObj(raw)) return ['the file is not a JSON object']
    if (raw.venue !== id) p.push(`"venue" is ${JSON.stringify(raw.venue)}, the file name says ${JSON.stringify(id)}`)
    const confirmed = isObj(raw.confirmed) && typeof raw.confirmed.by === 'string' && typeof raw.confirmed.at === 'string'
    if (raw.confirmed !== false && !confirmed) p.push('"confirmed" must be false or { "by", "at" }')
    for (const b of DEVICE_BLOCKS) {
        if (!(b in raw)) p.push(`"${b}" must be stated: an object (present), false (none here) or null (unknown)`)
        else if (raw[b] === null && confirmed) p.push(`"${b}" is null (unknown) in a confirmed profile`)
        else if (raw[b] !== null && raw[b] !== false && !isObj(raw[b])) p.push(`"${b}" must be an object, false or null`)
    }
    if (raw.host != null && (typeof raw.host !== 'string' || !SAFE_WORD.test(raw.host))) p.push('"host" must be a plain host name, an address or "local"')
    for (const [i, port] of (raw.ports ?? []).entries()) {
        if (!isObj(port) || typeof port.role !== 'string') { p.push(`ports[${i}] needs a "role"`); continue }
        if (port.vidpid != null && !VIDPID.test(port.vidpid)) p.push(`ports[${i}].vidpid must look like 1a2b:3c4d`)
        if (port.path != null && !/^[0-9][0-9.-]*$/.test(port.path)) p.push(`ports[${i}].path must be a sysfs USB path like 1-2.4`)
        if (confirmed && (port.path == null || port.vidpid == null)) p.push(`ports[${i}] (${port.role}) has no path or vidpid in a confirmed profile`)
    }
    for (const [i, link] of (raw.links ?? []).entries()) {
        if (!isObj(link) || typeof link.role !== 'string') p.push(`links[${i}] needs a "role"`)
        else if (link.iface != null && !IFACE.test(link.iface)) p.push(`links[${i}].iface is not an interface name`)
    }
    for (const list of ['data', 'states']) {
        for (const w of raw.checkpoint?.[list] ?? []) if (!SAFE_WORD.test(w)) p.push(`checkpoint.${list}: ${JSON.stringify(w)} is not a plain path`)
    }
    for (const page of raw.pages ?? []) if (!SAFE_WORD.test(page)) p.push(`pages: ${JSON.stringify(page)} is not a plain path`)
    if (isObj(raw.midi) && raw.midi.statePath != null && !SAFE_WORD.test(raw.midi.statePath)) p.push('midi.statePath is not a plain path')
    if (isObj(raw.watch) && raw.watch.unit != null && !/^[A-Za-z0-9@._-]+$/.test(raw.watch.unit)) p.push('watch.unit is not a unit name')
    return p
}

/** The folders searched for <venue>.json, first hit wins. */
export function venueDirs({ flags = {}, env = process.env, home = os.homedir() } = {}) {
    const chosen = typeof flags['venues-dir'] === 'string' ? flags['venues-dir'] : env.DI_VENUES_DIR
    return [chosen, path.join(home, '.di', 'data', 'show', 'venues'), SEED_DIR].filter(Boolean).map((d) => expandHome(d, home))
}

export function listVenues(opts = {}) {
    const seen = new Map()
    for (const dir of venueDirs(opts)) {
        let names
        try { names = fs.readdirSync(dir) } catch { continue }
        for (const n of names) if (n.endsWith('.json') && !seen.has(n.slice(0, -5))) seen.set(n.slice(0, -5), path.join(dir, n))
    }
    return [...seen].map(([venue, file]) => ({ venue, file }))
}

/**
 * Resolve the profile. Throws Refusal (exit 2) when there is no venue, no file, bad JSON or a
 * schema problem. Returns the merged profile with `provenance` (flag | env | file | default per value).
 */
export function loadProfile({ flags = {}, env = process.env, home = os.homedir() } = {}) {
    const fromFlag = typeof flags.venue === 'string' ? flags.venue : null
    const venue = fromFlag ?? (env.DI_VENUE || null)
    if (!venue) throw new Refusal('no venue: pass --venue <id> or set DI_VENUE (see `di show profile --list`)')
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(venue)) throw new Refusal(`bad venue id: ${JSON.stringify(venue)}`)
    const dirs = venueDirs({ flags, env, home })
    const file = dirs.map((d) => path.join(d, `${venue}.json`)).find((f) => fs.existsSync(f))
    if (!file) throw new Refusal(`no profile for venue "${venue}" in ${dirs.join(', ')}`)
    let raw
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) { throw new Refusal(`profile ${file} is not readable JSON: ${error.message}`) }
    const problems = validate(raw, venue)
    if (problems.length) throw new Refusal(`profile ${file}: ${problems.join('; ')}`)

    const profile = merge(DEFAULTS, raw)
    const provenance = { venue: fromFlag ? 'flag' : 'env' }
    for (const key of Object.keys(profile)) if (!(key in provenance)) provenance[key] = key in raw ? 'file' : 'default'
    for (const k of KEYS) {
        const f = flags[k.flag]
        const e = k.env ? env[k.env] : undefined
        const src = typeof f === 'string' ? ['flag', f] : e !== undefined && e !== '' ? ['env', e] : null
        if (!src) { provenance[k.key] = hasPath(raw, k.key) ? 'file' : 'default'; continue }
        let value = src[1]
        if (k.number) {
            value = Number(value)
            if (!Number.isFinite(value) || value < 0) throw new Refusal(`${src[0] === 'flag' ? `--${k.flag}` : k.env}: not a number: ${src[1]}`)
        } else if (!SAFE_WORD.test(value)) throw new Refusal(`${src[0] === 'flag' ? `--${k.flag}` : k.env}: not a plain value: ${src[1]}`)
        setPath(profile, k.key, value)
        provenance[k.key] = src[0]
    }
    if (flags.local === true) { profile.host = 'local'; provenance.host = 'flag' }
    profile.venue = venue
    profile.file = file
    profile.provenance = provenance
    return profile
}

/** The machine's venue marker against the profile: { ok } or { ok: false, missing | mismatch, reason }. */
export function checkMarker(profile, marker, where = 'the machine') {
    const m = String(marker ?? '').trim()
    if (!m) return { ok: false, missing: true, reason: `no venue marker at ${profile.markerPath} on ${where}: run \`di show mark ${profile.venue}\` there` }
    if (m !== profile.venue) return { ok: false, mismatch: true, reason: `${where} is marked "${m}", the profile is "${profile.venue}": refused` }
    return { ok: true, reason: `${where} is marked "${m}"` }
}
