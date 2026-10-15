// The scene editor's logic, pure (ScenePicker's SceneEditor.jsx draws it). A scene = a rig look + its cue (vocabulary.md). A change to
// the scene's SOURCE (parts, motion, heads, …) is rebuilt with src/shared/buildLook.js — the function scripts/rigbuild/epic-build.mjs
// builds with — and leaves as ops for the Studio's normal path (applyLocalOps: undo in history, saved, followed). 2026-10-15.
import { buildLook, sourceOf } from '../../shared/buildLook.js'
import { MOTION_MODES, MOTION_SPATIAL, HEAD_PATTERNS, HEAD_SPATIAL } from '../../shared/projectSchema.js'

export { MOTION_MODES, MOTION_SPATIAL, HEAD_PATTERNS, HEAD_SPATIAL }
export const SHOW_ID_OF = (document) => (document?.entities || []).find((e) => Array.isArray(e?.components?.rigLooks?.looks))
export const HEX = /^#[0-9a-fA-F]{6}$/

// THE FLASH RULE (scenes-design-report.md "Decisions": ≤ 3 flashes a second per lamp; flashrate.cjs on fx.js): glitch never, sparkle only
// at 20 bpm, every other mode at most 132 bpm. The UI enforces it; the line says what it is.
export const FLASH = Object.freeze({ glitch: 'never', sparkleBpm: 20, maxBpm: 132 })
export const modeAllowed = (mode) => mode !== 'glitch'
export const bpmRange = (mode) => (mode === 'sparkle' ? [20, 20] : [20, FLASH.maxBpm])
export const clampBpm = (mode, bpm) => { const [lo, hi] = bpmRange(mode); return Math.max(lo, Math.min(hi, Math.round(Number(bpm) || lo))) }
export const flashLine = (motion) => {
    if (!motion) return 'no motion: the level and colour hold'
    if (motion.mode === 'glitch') return 'glitch is never allowed: it can flash more than 3 times a second'
    const hz = Math.round((motion.bpm / 60) * 100) / 100
    return motion.mode === 'sparkle' ? `sparkle at 20 bpm: at most 3 flashes a second per lamp` : `${motion.mode} at ${motion.bpm} bpm (${hz} Hz): inside the 3 a second rule up to ${FLASH.maxBpm} bpm`
}
// pan-only patterns show nothing from a vertical rest (a head pointing straight up/down turns on its own axis): warn, never block.
export const PAN_ONLY = ['sweep', 'cross']
export const headsWarning = (heads) => (heads && PAN_ONLY.includes(heads.pattern)
    ? `${heads.pattern} only pans: a head resting vertical shows nothing. Use nod, wave, circle or figure8 for those heads`
    : '')

// Units as buildLook takes them: every light with a key in the look's aims (the key as epic-build writes it).
export const unitsOfDocument = (entities, look) => {
    const out = []
    for (const e of entities || []) {
        const f = e?.components?.fixture
        if (e?.type !== 'spotLight' || !f?.position || !f?.type) continue
        const laser = /^rig-laser-(.+)$/.exec(e.id)
        const own = `${laser ? `named-v1-laser-${laser[1]}` : `named-v1-${e.id}`}`.slice(0, 40) + `/${f.type}`
        const shared = `${f.position.replace(/\s+/g, '-')}/${f.type}`
        const key = look?.aims?.[own] ? own : look?.aims?.[shared] ? shared : null
        if (key) out.push({ id: e.id, key, colour: e.components?.appearance?.color || e.components?.light?.color, aim: look.aims[key] })
    }
    return out
}

// The parts of a project: rigParts on the show entity; else each unit's fixture.part if it has one; else none (each unit its own part).
export const rigPartsOf = (document) => {
    const stored = SHOW_ID_OF(document)?.components?.rigParts?.parts
    if (stored && Object.keys(stored).length) return stored
    const out = {}
    for (const e of document?.entities || []) {
        const part = e?.components?.fixture?.part
        if (typeof part === 'string' && part) (out[part] ||= []).push(e.id)
    }
    return out
}

// The rows of the parts list: one per part of the project; with no parts, one per unit that the look lights (the migration path).
export const partRows = (document, look) => {
    const rigParts = rigPartsOf(document)
    const keys = Object.keys(rigParts)
    const names = keys.length ? keys : (document?.entities || []).filter((e) => e?.type === 'spotLight' && e?.components?.fixture).map((e) => e.id)
    const parts = look?.parts || {}
    return names.map((name) => ({ part: name, units: keys.length ? rigParts[name].length : 1, hex: parts[name]?.[0] || '', level: parts[name] ? parts[name][1] : null }))
}

// A look made before it kept a source (the migration path): per part of the project the first lamp's built colour and level; with no
// parts, each unit its own part, named by its id. Level 0 = off = left out.
export const seedParts = (look, units, rigParts = {}) => {
    const parts = {}
    const partNames = Object.keys(rigParts || {})
    const byId = new Map(units.map((u) => [u.id, u]))
    if (partNames.length) {
        for (const name of partNames) {
            const u = rigParts[name].map((id) => byId.get(id)).find(Boolean)
            if (u && (look.levels?.[u.key] ?? 0) > 0) parts[name] = [look.colours?.[u.key] || null, look.levels[u.key]]
        }
        return parts
    }
    for (const u of units) if ((look.levels?.[u.key] ?? 0) > 0) parts[u.id] = [look.colours?.[u.key] || null, look.levels[u.key]]
    return parts
}
/** The look with its source in hand: its own `parts`, else seeded from what was built. */
export const withSource = (document, look) => (look.parts ? look : { ...look, parts: seedParts(look, unitsOfDocument(document.entities, look), rigPartsOf(document)) })

const withLook = (document, look) => {
    const show = SHOW_ID_OF(document)
    const rl = show.components.rigLooks
    return { entityId: show.id, component: 'rigLooks', patch: { ...rl, looks: rl.looks.map((l) => (l.id === look.id ? look : l)) } }
}

/** The ops for a change to a scene's source: `change` is a partial of {title, intent, act, parts, motion, heads, laser_colour, desk_caps}
 * (null removes motion/heads/laser_colour/desk_caps). The look is rebuilt with buildLook; returns [] when the look is not there. */
export function changeSceneOps(document, lookId, change) {
    const show = SHOW_ID_OF(document)
    const look = show?.components?.rigLooks?.looks.find((l) => l.id === lookId)
    if (!look) return []
    const units = unitsOfDocument(document.entities, look)
    const rigParts = rigPartsOf(document)
    let next = { ...look }
    // a look from before sources existed: seed per unit, no parts in rigParts → each unit is its own part
    next = withSource(document, next)
    for (const [k, v] of Object.entries(change)) { if (v === null || v === undefined) delete next[k]; else next[k] = v }
    if (next.motion && next.motion.mode === 'glitch') return []
    if (next.motion) next.motion = { ...next.motion, bpm: clampBpm(next.motion.mode, next.motion.bpm) }
    const built = buildLook({ ...sourceOf(next) }, rigParts, units)
    next = { ...next, aims: { ...look.aims, ...built.aims }, colours: { ...look.colours, ...built.colours }, levels: { ...look.levels, ...built.levels } }
    return [{ type: 'updateComponent', payload: withLook(document, next) }]
}

const slug = (s) => String(s || 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'scene'
const freeId = (taken, base) => { let id = base; for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`.slice(0, 36); return id }

/** New scene: a dark look (everything off) and a cue at the end of the list. */
export function newSceneOps(document, title = 'New scene') {
    const show = SHOW_ID_OF(document)
    if (!show) return { ops: [], lookId: '' }
    const rl = show.components.rigLooks
    const proto = rl.looks.find((l) => l.id === 'black') || rl.looks[0]
    const id = freeId(new Set(rl.looks.map((l) => l.id)), slug(title))
    const look = { ...proto, id, title, intent: '', parts: {}, levels: Object.fromEntries(Object.keys(proto.levels || proto.colours || {}).map((k) => [k, 0])) }
    delete look.motion; delete look.heads; delete look.laser_colour; delete look.desk_caps
    const cue = { id: `cue-${id}`, name: title, key: '', fade: 2, hold: 20, lightLook: `rig-${id}`, surfaces: {} }
    return { lookId: id, ops: [{ type: 'updateComponent', payload: { entityId: show.id, component: 'rigLooks', patch: { ...rl, looks: [...rl.looks, look] } } }, { type: 'createMappingCue', payload: { cue } }] }
}

/** Duplicate: the look copied under a new id, its cue after the original. */
export function duplicateSceneOps(document, cueId) {
    const show = SHOW_ID_OF(document)
    const cues = document?.mappingState?.cues || []
    const cue = cues.find((c) => c.id === cueId)
    const rl = show?.components?.rigLooks
    const look = rl?.looks.find((l) => l.id === String(cue?.lightLook || '').replace(/^rig-/, ''))
    if (!cue || !look) return { ops: [], lookId: '' }
    const id = freeId(new Set(rl.looks.map((l) => l.id)), `${look.id}-copy`.slice(0, 36))
    const title = `${look.title} copy`.slice(0, 60)
    const copy = JSON.parse(JSON.stringify({ ...look, id, title }))
    const newCue = { ...JSON.parse(JSON.stringify(cue)), id: freeId(new Set(cues.map((c) => c.id)), `cue-${id}`), name: `${cue.name || look.title} copy`.slice(0, 80), lightLook: `rig-${id}` }
    const order = cues.map((c) => c.id)
    order.splice(order.indexOf(cueId) + 1, 0, newCue.id)
    return { lookId: id, ops: [
        { type: 'updateComponent', payload: { entityId: show.id, component: 'rigLooks', patch: { ...rl, looks: [...rl.looks, copy] } } },
        { type: 'createMappingCue', payload: { cue: newCue } },
        { type: 'reorderMappingCues', payload: { cueIds: order } }
    ] }
}

/** Delete: the cue; the look too unless another cue still uses it. */
export function deleteSceneOps(document, cueId) {
    const show = SHOW_ID_OF(document)
    const cues = document?.mappingState?.cues || []
    const cue = cues.find((c) => c.id === cueId)
    if (!cue || !show) return []
    const ops = [{ type: 'deleteMappingCue', payload: { cueId } }]
    const lookId = String(cue.lightLook || '').replace(/^rig-/, '')
    const rl = show.components.rigLooks
    if (!cues.some((c) => c.id !== cueId && String(c.lightLook || '').replace(/^rig-/, '') === lookId) && rl.looks.length > 1) {
        ops.push({ type: 'updateComponent', payload: { entityId: show.id, component: 'rigLooks', patch: { ...rl, looks: rl.looks.filter((l) => l.id !== lookId) } } })
    }
    return ops
}

/** Move a scene one place in the cue list (-1 up, +1 down). */
export function moveSceneOps(document, cueId, delta) {
    const order = (document?.mappingState?.cues || []).map((c) => c.id)
    const i = order.indexOf(cueId)
    const j = i + delta
    if (i < 0 || j < 0 || j >= order.length) return []
    ;[order[i], order[j]] = [order[j], order[i]]
    return [{ type: 'reorderMappingCues', payload: { cueIds: order } }]
}

export const cueOps = (cueId, patch) => [{ type: 'setMappingCue', payload: { cueId, patch } }]
