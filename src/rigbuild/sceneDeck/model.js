// THE SCENE DECK — layer 1: the model and the four controls (docs/architecture/RIG_BUILD.md §21).
//
// A scene = one entry of the document's cue list (mappingState.cues, §16) joined with its look
// (components.rigLooks, §11.4) by the cue's desk look id; a look no cue plays is a scene OUTSIDE the loop
// (id `look:<look id>`). The four controls write EXISTING fields only:
//   intensity = levels[group] (a factor on the lit groups, or one group's level; clamped 0..1)
//   colour    = colours[group] hex — colour TEMPERATURE is not a field; a hex stands in for it
//   speed     = the cue's fade into the scene (s); a fade stays inside its hold
//   strobe    = on/off of the blinder group's level — a look has no strobe RATE; the 3 flashes/s cap is
//               enforced elsewhere (ground-scenes.mjs MAX_FLASHES_PER_S), not here
// Every control returns the ops looks.mjs / show-cues.mjs send (updateComponent rigLooks, setMappingCue),
// checked by guardSceneChange: no laser lit without requiresLaserSignOff, no aim moved (the ground-movers
// policy is proven on the aims), no loop pushed out of 60-90 s. Pure: no React, no network, no clock.
import { applyProjectOps } from '../../shared/projectSchema.js'
import { lookIdOfDesk } from '../looks.js'
import { showOf, showTimeline } from '../showClock.js'
import { SceneDeckError } from './errors.js'
import { canonicalJson, effectiveLevels } from './hash.js'

export const LOOP_RANGE_S = Object.freeze({ min: 60, max: 90 })
/** Rental type codes (the part after `/` in a look's group key). ground-movers.mjs isLaser: UP-LA40WF. */
export const LASER_TYPES = Object.freeze(['up-la40wf'])
/** ground-scenes.mjs BLINDER_GROUP (cob-cut-curtain) is the UP-COB200, the one strobe-capable group. */
export const BLINDER_TYPES = Object.freeze(['up-cob200'])
/** The plain marker ground-scenes.mjs writes into a laser look's intent (a look has no sign-off field). */
export const SIGN_OFF_MARKER = 'requiresLaserSignOff'
export const SPARE_PREFIX = 'look:'
export const CONTROLS = Object.freeze(['intensity', 'colour', 'speed', 'strobe'])
const MAX_FADE_S = 60 // showClock.js clamps a fade to 60 s
const HEX = /^#[0-9a-f]{6}$/i

const typeOfKey = (key) => String(key).split('/')[1] || ''
export const isLaserKey = (key) => LASER_TYPES.includes(typeOfKey(key))
export const isBlinderKey = (key) => BLINDER_TYPES.includes(typeOfKey(key))
export const spareSceneId = (lookId) => `${SPARE_PREFIX}${lookId}`
const round3 = (n) => Math.round(n * 1000) / 1000 // normalizeRigLooks keeps 3 decimals (planNum)
const clamp01 = (n) => Math.min(1, Math.max(0, n))
const clone = (v) => JSON.parse(JSON.stringify(v))

/** The entity that holds the show's looks (RIG_SHOW_ID when looks.mjs wrote it), or null. */
export const showEntityOf = (document) => (document?.entities || []).find((e) => Array.isArray(e?.components?.rigLooks?.looks)) || null

/** The op that writes a look list (the op looks.mjs sends). The schema has no per-look op: the list goes whole. */
export const looksOp = (entityId, looks) => ({ type: 'updateComponent', payload: { entityId, component: 'rigLooks', patch: { looks } } })

const sceneOfLook = (look) => {
    const levels = effectiveLevels(look)
    return {
        lookId: look.id,
        levels,
        colours: { ...(look.colours || {}) },
        flags: {
            requiresLaserSignOff: String(look.intent || '').includes(SIGN_OFF_MARKER),
            strobe: Object.entries(levels).some(([g, v]) => isBlinderKey(g) && v > 0)
        },
        look: clone({ title: look.title || '', intent: look.intent || '', aims: look.aims || {}, colours: look.colours || {}, ...(look.levels ? { levels: look.levels } : {}) })
    }
}

/** One pass of the loop in seconds, exactly as the show clock lays it out (the holds; a hold 0 stops it). */
export const loopSecondsOf = (document) => {
    // showOf wants an epoch before it lays the list out; the length does not depend on it.
    const show = showOf({ mappingState: { ...(document?.mappingState || {}), showEpoch: 1 } })
    const timeline = show && showTimeline(show)
    return timeline ? timeline.lengthMs / 1000 : 0
}

/** The scenes of a document: the loop in cue order, then the looks outside it. `unjoined` = cues whose look is missing. */
export const readScenes = (document) => {
    const entity = showEntityOf(document)
    const looks = entity ? entity.components.rigLooks.looks : []
    const byId = new Map(looks.map((l) => [l.id, l]))
    const scenes = []
    const unjoined = []
    const played = new Set()
    for (const [index, cue] of (document?.mappingState?.cues || []).entries()) {
        const lookId = lookIdOfDesk(cue.lightLook)
        const look = lookId ? byId.get(lookId) : null
        if (!look) {
            if (lookId) unjoined.push(cue.id)
            continue
        }
        played.add(lookId)
        scenes.push({ id: cue.id, name: cue.name || look.title || lookId, inLoop: true, index, fade: cue.fade, hold: cue.hold, cue: { key: cue.key || '', surfaces: clone(cue.surfaces || {}) }, ...sceneOfLook(look) })
    }
    for (const look of looks) {
        if (played.has(look.id)) continue
        scenes.push({ id: spareSceneId(look.id), name: look.title || look.id, inLoop: false, index: null, fade: null, hold: null, cue: null, ...sceneOfLook(look) })
    }
    return { scenes, loopSeconds: loopSecondsOf(document), showEntityId: entity ? entity.id : null, unjoined }
}

/** The scene's intensity as the deck shows it: its brightest group's level. */
export const intensityOf = (scene) => Math.max(0, ...Object.values(scene?.levels || {}))

/**
 * Throws when `ops` would light a laser without the sign-off, move any lamp's aim, or take the loop out of
 * 60-90 s (a loop already outside may stay where it is; a change may not move it outside). Returns the
 * document after the ops.
 */
export const guardSceneChange = (document, ops, sceneId) => {
    const before = readScenes(document)
    const afterDocument = applyProjectOps(document, ops)
    const after = readScenes(afterDocument)
    const now = after.scenes.find((s) => s.id === sceneId)
    if (now) {
        const lit = Object.entries(now.levels).filter(([g, v]) => isLaserKey(g) && v > 0).map(([g]) => g)
        if (lit.length && !now.flags.requiresLaserSignOff) {
            throw new SceneDeckError('laser-sign-off', `"${now.name}" would light a laser (${lit.join(', ')}) without ${SIGN_OFF_MARKER}: a Class 4 laser needs a certified laser safety officer first`, { groups: lit })
        }
    }
    for (const was of before.scenes) {
        const is = after.scenes.find((s) => s.lookId === was.lookId)
        if (is && canonicalJson(is.look.aims) !== canonicalJson(was.look.aims)) {
            throw new SceneDeckError('mover-policy', `"${was.name}": a scene control never changes an aim — the ground-movers policy (scripts/rigbuild/ground-movers.mjs) is proven on these aims`, { lookId: was.lookId })
        }
    }
    const { min, max } = LOOP_RANGE_S
    if (after.loopSeconds !== before.loopSeconds && (after.loopSeconds < min || after.loopSeconds > max)) {
        throw new SceneDeckError('loop-length', `the loop would be ${after.loopSeconds} s, outside ${min}-${max} s`, { before: before.loopSeconds, after: after.loopSeconds })
    }
    return afterDocument
}

const finite = (value, what) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new SceneDeckError('bad-value', `${what} must be a finite number`)
    return value
}
const namedGroup = (scene, group) => {
    if (typeof group !== 'string' || !(group in scene.levels)) throw new SceneDeckError('unknown-group', `"${scene.name}" has no group "${group}"`)
    return group
}

const intensityLevels = (scene, value) => {
    if (typeof value === 'number') {
        const factor = finite(value, 'intensity')
        if (factor < 0) throw new SceneDeckError('bad-value', 'intensity is a factor of 0 or more')
        return Object.fromEntries(Object.entries(scene.levels).filter(([, v]) => v > 0).map(([g, v]) => [g, round3(clamp01(v * factor))]))
    }
    if (value && typeof value === 'object') return { [namedGroup(scene, value.group)]: round3(clamp01(finite(value.level, 'level'))) }
    throw new SceneDeckError('bad-value', 'intensity takes a factor (number) or { group, level }')
}

const hexOf = (value) => {
    if (typeof value !== 'string' || !HEX.test(value.trim())) throw new SceneDeckError('bad-value', `colour must be a #rrggbb hex, not ${JSON.stringify(value)}`)
    return value.trim().toLowerCase()
}
const colourValues = (scene, value) => {
    if (typeof value === 'string') {
        const hex = hexOf(value)
        return Object.fromEntries(Object.entries(scene.levels).filter(([, v]) => v > 0).map(([g]) => [g, hex]))
    }
    if (value && typeof value === 'object') return { [namedGroup(scene, value.group)]: hexOf(value.hex) }
    throw new SceneDeckError('bad-value', 'colour takes a hex (every lit group) or { group, hex }')
}

const strobeLevels = (scene, value) => {
    if (typeof value !== 'boolean') throw new SceneDeckError('bad-value', 'strobe is on or off (true / false)')
    const blinders = Object.keys(scene.levels).filter(isBlinderKey)
    if (!blinders.length) throw new SceneDeckError('no-blinder', `"${scene.name}" names no blinder group (${BLINDER_TYPES.join(', ')})`)
    return Object.fromEntries(blinders.map((g) => [g, value ? 1 : 0]))
}

const speedOps = (scene, value) => {
    if (!scene.inLoop) throw new SceneDeckError('not-in-loop', `"${scene.name}" is outside the loop: it has no cue, so no fade`)
    const fade = finite(value, 'speed (the fade into the scene, s)')
    if (fade < 0 || fade > MAX_FADE_S) throw new SceneDeckError('bad-value', `a fade is 0-${MAX_FADE_S} s`)
    if (scene.hold > 0 && fade > scene.hold) throw new SceneDeckError('fade-longer-than-hold', `a fade stays inside its hold: ${fade} s > ${scene.hold} s`, { fade, hold: scene.hold })
    return fade === scene.fade ? [] : [{ type: 'setMappingCue', payload: { cueId: scene.id, patch: { fade } } }]
}

const lookOps = (document, scene, field, values) => {
    const entity = showEntityOf(document)
    let changed = false
    const looks = entity.components.rigLooks.looks.map((look) => {
        if (look.id !== scene.lookId) return look
        const current = field === 'levels' ? effectiveLevels(look) : look[field] || {}
        const next = { ...(look[field] || {}) }
        for (const [k, v] of Object.entries(values)) {
            if (current[k] === v) continue
            next[k] = v
            changed = true
        }
        return { ...look, [field]: next }
    })
    return changed ? [looksOp(entity.id, looks)] : []
}

/** The minimal ops for one control on one scene, or [] when nothing changes. Throws SceneDeckError. */
export const applyControl = (document, sceneId, control, value) => {
    const { scenes } = readScenes(document)
    const scene = scenes.find((s) => s.id === sceneId)
    if (!scene) throw new SceneDeckError('unknown-scene', `no scene "${sceneId}" in this show`)
    if (!CONTROLS.includes(control)) throw new SceneDeckError('unknown-control', `"${control}" is not one of ${CONTROLS.join(', ')}`)
    if (control !== 'speed' && scenes.filter((s) => s.lookId === scene.lookId).length > 1) {
        throw new SceneDeckError('shared-look', `"${scene.name}" shares its look with another cue: a change would move both`, { lookId: scene.lookId })
    }
    const ops = control === 'speed' ? speedOps(scene, value)
        : control === 'intensity' ? lookOps(document, scene, 'levels', intensityLevels(scene, value))
            : control === 'colour' ? lookOps(document, scene, 'colours', colourValues(scene, value))
                : lookOps(document, scene, 'levels', strobeLevels(scene, value))
    if (ops.length) guardSceneChange(document, ops, sceneId)
    return ops
}
