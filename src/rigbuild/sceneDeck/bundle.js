// THE SCENE DECK — the carried file, `di.scenes/1` (docs/architecture/RIG_BUILD.md §21).
//
// When the two copies cannot reach each other, one exports its scenes with their hashes and the
// last-common hashes it holds; the other reads the file and runs the same compare (sync.js). Reading
// changes nothing. parseBundle is strict: it refuses rather than guesses — wrong format, oversize,
// unknown fields, duplicate ids, non-finite numbers, and a hash that does not match its scene.
// `exportedAt` is a label for a person; nothing ever reads it to decide which copy is newer.
import { SceneDeckError } from './errors.js'
import { MAX_NUMBER, sceneContent, sceneHash } from './hash.js'
import { readScenes } from './model.js'

export const BUNDLE_FORMAT = 'di.scenes/1'
export const BUNDLE_LIMITS = Object.freeze({ bytes: 512 * 1024, scenes: 200, groups: 100, lastSync: 400 })

/** The carried file of a document's scenes. `lastSync` = { [scene id]: last-common hash } from the ledger. */
export const exportBundle = (document, { project = '', exportedAt = '', lastSync = {} } = {}) => ({
    format: BUNDLE_FORMAT,
    project: String(project),
    exportedAt: String(exportedAt),
    scenes: readScenes(document).scenes.map((s) => ({ id: s.id, name: s.name, hash: sceneHash(s), scene: sceneContent(s) })),
    lastSync: { ...lastSync }
})

const fail = (code, message) => {
    throw new SceneDeckError(`bundle-${code}`, message)
}
const isPlain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const exactKeys = (v, keys, where) => {
    if (!isPlain(v)) fail('bad-field', `${where} is not an object`)
    const extra = Object.keys(v).filter((k) => !keys.includes(k))
    const missing = keys.filter((k) => !(k in v))
    if (extra.length || missing.length) fail('bad-field', `${where}: ${extra.length ? `unknown ${extra.join(', ')}` : ''}${missing.length ? ` missing ${missing.join(', ')}` : ''}`.trim())
}
const text = (v, max, where) => {
    if (typeof v !== 'string' || v.length > max) fail('bad-field', `${where} is not a string of at most ${max}`)
}
const MAX_DEPTH = 12 // a scene nests about 6 deep; a deeper file is refused typed, not by a stack overflow
const walkFinite = (v, where, depth = 0) => {
    if (typeof v === 'number' && !Number.isFinite(v)) fail('non-finite', `${where} holds ${v}`)
    if (typeof v === 'number' && Math.abs(v) > MAX_NUMBER) fail('non-finite', `${where} holds ${v}, outside what a scene can hold (${MAX_NUMBER})`)
    if (v && typeof v === 'object') {
        if (depth >= MAX_DEPTH) fail('bad-field', `${where} is nested deeper than ${MAX_DEPTH}`)
        for (const [k, x] of Object.entries(v)) walkFinite(x, `${where}.${k}`, depth + 1)
    }
}
const ID = /^[\w:.-]{1,80}$/
const LOOK_ID = /^[a-z0-9][a-z0-9-]{0,35}$/
const GROUP = /^[\w:.-]{1,40}\/[\w.-]{1,40}$/
const HEX = /^#[0-9a-f]{6}$/
const HASH = /^[0-9a-f]{64}$/
const groupMap = (v, where, check) => {
    if (!isPlain(v) || Object.keys(v).length > BUNDLE_LIMITS.groups) fail('bad-field', `${where} is not a map of at most ${BUNDLE_LIMITS.groups} groups`)
    for (const [k, x] of Object.entries(v)) if (!GROUP.test(k) || !check(x)) fail('bad-field', `${where}["${k}"] is not valid`)
}

const checkScene = (s, where) => {
    exactKeys(s, ['name', 'inLoop', 'fade', 'hold', 'lookId', 'look', 'cue'], where)
    text(s.name, 200, `${where}.name`)
    if (typeof s.inLoop !== 'boolean') fail('bad-field', `${where}.inLoop is not true/false`)
    if (!LOOK_ID.test(s.lookId)) fail('bad-field', `${where}.lookId is not a look id`)
    if (s.inLoop) {
        for (const k of ['fade', 'hold']) if (typeof s[k] !== 'number' || s[k] < 0 || s[k] > 3600) fail('bad-field', `${where}.${k} is not 0-3600 s`)
        exactKeys(s.cue, ['key', 'surfaces'], `${where}.cue`)
        if (!/^[1-9]?$/.test(s.cue.key) || !isPlain(s.cue.surfaces)) fail('bad-field', `${where}.cue is not valid`)
    } else if (s.fade !== null || s.hold !== null || s.cue !== null) fail('bad-field', `${where}: a scene outside the loop has no fade, hold or cue`)
    exactKeys(s.look, ['title', 'intent', 'aims', 'colours', 'levels'], `${where}.look`)
    text(s.look.title, 60, `${where}.look.title`)
    text(s.look.intent, 480, `${where}.look.intent`)
    groupMap(s.look.aims, `${where}.look.aims`, (a) => isPlain(a) && typeof a.rule === 'string' && a.rule.length <= 32 && Object.entries(a).every(([k, n]) => k === 'rule' || (/^[a-z_]{1,16}$/.test(k) && typeof n === 'number')))
    groupMap(s.look.colours, `${where}.look.colours`, (c) => typeof c === 'string' && HEX.test(c))
    groupMap(s.look.levels, `${where}.look.levels`, (n) => typeof n === 'number' && n >= 0 && n <= 1)
}

/** A carried file's text → the bundle, validated. Throws SceneDeckError `bundle-*`. */
export const parseBundle = (json) => {
    if (typeof json !== 'string') fail('not-text', 'a scenes bundle is read from its text')
    if (new TextEncoder().encode(json).length > BUNDLE_LIMITS.bytes) fail('oversize', `a scenes bundle is at most ${BUNDLE_LIMITS.bytes} bytes`)
    let b
    try {
        b = JSON.parse(json)
    } catch {
        fail('not-json', 'this file is not JSON')
    }
    if (!isPlain(b)) fail('bad-field', 'a scenes bundle is an object')
    if (b.format !== BUNDLE_FORMAT) fail('wrong-format', `expected ${BUNDLE_FORMAT}, found ${JSON.stringify(b.format)}`)
    exactKeys(b, ['format', 'project', 'exportedAt', 'scenes', 'lastSync'], 'bundle')
    walkFinite(b, 'bundle')
    text(b.project, 120, 'project')
    text(b.exportedAt, 40, 'exportedAt')
    if (!Array.isArray(b.scenes) || b.scenes.length > BUNDLE_LIMITS.scenes) fail('bad-field', `scenes is not a list of at most ${BUNDLE_LIMITS.scenes}`)
    const seen = new Set()
    b.scenes.forEach((entry, i) => {
        exactKeys(entry, ['id', 'name', 'hash', 'scene'], `scenes[${i}]`)
        if (typeof entry.id !== 'string' || !ID.test(entry.id)) fail('bad-field', `scenes[${i}].id is not an id`)
        if (seen.has(entry.id)) fail('duplicate-id', `the id "${entry.id}" is carried twice`)
        seen.add(entry.id)
        text(entry.name, 200, `scenes[${i}].name`)
        if (typeof entry.hash !== 'string' || !HASH.test(entry.hash)) fail('bad-field', `scenes[${i}].hash is not a sha-256`)
        checkScene(entry.scene, `scenes[${i}].scene`)
        if (entry.scene.inLoop === entry.id.startsWith('look:')) fail('bad-field', `scenes[${i}]: the id and the loop disagree`)
        if (sceneHash(entry.scene) !== entry.hash) fail('hash-mismatch', `scenes[${i}] ("${entry.name}") does not match its hash: the file was changed after it was written`)
        const again = sceneContent(entry.scene)
        if (JSON.stringify(again) !== JSON.stringify(entry.scene)) fail('bad-field', `scenes[${i}].scene is not in canonical form`)
    })
    if (!isPlain(b.lastSync) || Object.keys(b.lastSync).length > BUNDLE_LIMITS.lastSync) fail('bad-field', 'lastSync is not a map of scene ids')
    for (const [k, h] of Object.entries(b.lastSync)) if (!ID.test(k) || !(h === null || (typeof h === 'string' && HASH.test(h)))) fail('bad-field', `lastSync["${k}"] is not a hash`)
    return b
}
