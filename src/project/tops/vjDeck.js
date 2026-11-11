// The VJ deck — Resolume's clip grid, as ONE Raw node.
//
// A deck is layers of clip slots. Tapping a slot plays that clip on its
// layer; layers stack bottom-up through blend and opacity; a master level
// sits on top. Everything a person does is plain JSON in node.values.deck,
// so it syncs, undoes and survives a reload like any other value.
//
// The deck never draws a picture itself. `expandDeck` turns it into the
// operators the picture engine already knows (top.clip, top.blend,
// top.level) — there is never a second WebGL engine. It is pure: the network
// runner calls it, and every route through it is testable without a GPU.
//
// Nothing here touches React or the DOM.

import { generateId } from '../../shared/projectSchema.js'
import { TOP_OPERATORS, isTopType, resolveTopParams } from './topOperators.js'
import { DEFAULT_BPM, TAP_RESET_MS as CLOCK_TAP_RESET_MS, sanitizeEpoch, tapTempo as clockTapTempo } from '../../timeline/showClock.js'

export const VJ_DECK_TYPE = 'vj.deck'
export const DECK_INPUTS = ['in1', 'in2', 'in3', 'in4']
// Index order is what the shader reads (top.blend's `mode` choice).
export const BLEND_MODES = ['Mix', 'Add', 'Screen', 'Multiply', 'Difference', 'Subtract', 'Lighten', 'Darken', 'Overlay']
// Index order is what top.clip reads.
export const CLIP_MODES = ['Loop', 'Bounce', 'Once']
export const DEFAULT_COLUMNS = 6
export const MAX_COLUMNS = 16
export const MAX_LAYERS = 8
export const MIN_BPM = 20
export const MAX_BPM = 300

const clamp = (value, min, max, fallback) => {
    const n = Number(value)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
const choiceOf = (value, count, fallback = '0') => {
    const n = Number(value)
    return Number.isInteger(n) && n >= 0 && n < count ? String(n) : fallback
}
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const sideOf = (value, fallback = '') => (value === 'a' || value === 'b' || value === '' ? value : fallback)

// --- the shape ------------------------------------------------------------

/** A clip, defaults filled and every number in range. null for anything that is not one. */
export const normalizeClip = (clip) => {
    if (!isObject(clip)) return null
    const kind = clip.kind === 'input' ? 'input' : clip.kind === 'camera' ? 'camera' : 'asset'
    if (kind === 'input' && !DECK_INPUTS.includes(clip.input)) return null
    // A camera clip is a device by its label (what a person and another machine
    // can read); `device` is the id this page last saw for it, only a hint.
    if (kind === 'camera' && !(typeof clip.camera === 'string' && clip.camera.trim())) return null
    if (kind === 'asset' && !(typeof clip.asset === 'string' && clip.asset)) return null
    let start = clamp(clip.in, 0, 1, 0)
    let end = clamp(clip.out, 0, 1, 1)
    if (end <= start) { start = 0; end = 1 }
    const out = {
        id: typeof clip.id === 'string' && clip.id ? clip.id : generateId('clip'),
        kind,
        speed: clamp(clip.speed, 0, 4, 1),
        mode: choiceOf(clip.mode, CLIP_MODES.length),
        in: start,
        out: end,
        label: typeof clip.label === 'string' ? clip.label : ''
    }
    if (kind === 'asset') out.asset = clip.asset
    else if (kind === 'camera') {
        out.camera = clip.camera.trim()
        out.device = typeof clip.device === 'string' ? clip.device : ''
    } else out.input = clip.input
    return out
}

// --- effects ---------------------------------------------------------------
// An effect is one of the existing picture operators on a stack (a layer's, or
// the master's). `main` is what the panel and MIDI show first: numeric params
// become sliders, a colour param a colour input. See PROGRESS.md (the feat-deck-effects entry).

// One of every effect fits on a stack (20 kinds). It was 8, and the 9th was refused without a word (N3600, N3604).
export const MAX_EFFECTS = 20
export const EFFECT_TYPES = {
    'top.level': { main: ['gain', 'brightness', 'gamma'] },
    'top.tint': { main: ['amount', 'bright'] },
    'top.blur': { main: ['size'] },
    'top.edge': { main: ['strength'] },
    'top.feedback': { main: ['trail'] },
    'top.transform': { main: ['scale', 'rotate', 'moveX'] },
    'top.freeze': { main: ['hold'] },
    'top.silhouette': { main: ['threshold', 'soft', 'invert', 'colour', 'back', 'drift', 'flash'] },
    'top.lineart': { main: ['bands', 'width', 'colour'] },
    'top.matte': { main: ['soft', 'drift', 'echo', 'colour', 'back', 'shade', 'fill', 'invert'] },
    'top.glitch': { main: ['amount', 'speed', 'split'] },
    'top.blocks': { main: ['amount', 'size', 'rate', 'shift', 'hold'] },
    'top.pixelate': { main: ['size', 'levels', 'grey'] },
    'top.displace': { main: ['source', 'amountX', 'amountY', 'scale', 'speed'] },
    'top.hsvadj': { main: ['hue', 'sat', 'value'] },
    'top.mirror': { main: ['mode', 'flipX', 'flipY'] },
    'top.key': { main: ['mode', 'colour', 'tolerance', 'soft'] },
    'top.lookup': { main: ['shadows', 'mids', 'highs', 'amount'] },
    'top.slope': { main: ['strength', 'angle', 'size', 'keep'] },
    'top.glow': { main: ['threshold', 'radius', 'amount'] }
}
export const EFFECT_TYPE_IDS = Object.keys(EFFECT_TYPES)
export const effectLabel = (type) => TOP_OPERATORS[type]?.label || type

/** The main params of an effect type, as the operator defines them (label, range, step, colour?). */
export const effectMainParams = (type) => (EFFECT_TYPES[type]?.main || [])
    .map((name) => TOP_OPERATORS[type]?.params.find((p) => p.name === name))
    .filter(Boolean)
/** Only the numeric ones: what a slider or a MIDI pot can drive. */
export const effectNumericParams = (type) => effectMainParams(type).filter((p) => !p.colour && !p.text)

/** One effect, defaults filled and in range. null when its type is not offered. */
export const normalizeEffect = (raw, taken = new Set()) => {
    if (!isObject(raw) || !Object.prototype.hasOwnProperty.call(EFFECT_TYPES, raw.type) || !isTopType(raw.type)) return null
    let id = typeof raw.id === 'string' && raw.id ? raw.id : ''
    if (!id || taken.has(id)) { do { id = generateId('fx') } while (taken.has(id)) }
    taken.add(id)
    return { id, type: raw.type, on: raw.on !== false, mix: clamp(raw.mix, 0, 1, 1), params: resolveTopParams(raw.type, isObject(raw.params) ? raw.params : {}) }
}

/** Any stored value -> a safe stack: unknown types dropped, at most MAX_EFFECTS. */
export const normalizeEffects = (raw) => {
    if (!Array.isArray(raw)) return []
    const taken = new Set()
    return raw.map((item) => normalizeEffect(item, taken)).filter(Boolean).slice(0, MAX_EFFECTS)
}

const layerIdFor = (index) => `layer-${index + 1}`

export const createLayer = (index = 0, columns = DEFAULT_COLUMNS) => ({
    id: layerIdFor(index),
    name: `Layer ${index + 1}`,
    opacity: 1,
    blend: '0',
    active: -1,
    trigger: 0,
    // Resolume's B / S buttons and the crossfader side ('' = not on the fader).
    bypass: false,
    solo: false,
    side: '',
    effects: [],
    clips: Array.from({ length: columns }, () => null)
})

/** A fresh deck. Layer ids are stable per position, so every new deck reads the same. */
export const createDeck = ({ layers = 3, columns = DEFAULT_COLUMNS, bpm = DEFAULT_BPM } = {}) => {
    const cols = Math.round(clamp(columns, 1, MAX_COLUMNS, DEFAULT_COLUMNS))
    return {
        bpm: clamp(bpm, MIN_BPM, MAX_BPM, DEFAULT_BPM),
        // Where the deck's own beat is (ms, the tapping machine's clock): the
        // phase anchor of src/timeline/showClock.js. 0 = never tapped.
        epoch: 0,
        master: 1,
        // The master's effect stack: after the last layer, before the master level.
        effects: [],
        // The crossfader, 0 = all A, 1 = all B; layers with side '' ignore it.
        crossfade: 0.5,
        columns: cols,
        layers: Array.from({ length: Math.round(clamp(layers, 1, MAX_LAYERS, 3)) }, (_, index) => createLayer(index, cols))
    }
}

/**
 * Any stored value → a deck that is safe to draw and expand. A hand-edited or
 * half-synced value never throws: bad clips drop out, numbers clamp, a missing
 * deck becomes a fresh one.
 */
export const normalizeDeck = (raw) => {
    if (!isObject(raw)) return createDeck()
    const columns = Math.round(clamp(raw.columns, 1, MAX_COLUMNS, DEFAULT_COLUMNS))
    const sourceLayers = Array.isArray(raw.layers) ? raw.layers.filter(isObject).slice(0, MAX_LAYERS) : []
    const seen = new Set()
    const layers = sourceLayers.map((layer, index) => {
        let id = typeof layer.id === 'string' && layer.id ? layer.id : layerIdFor(index)
        while (seen.has(id)) id = `${id}-b`
        seen.add(id)
        const clips = Array.from({ length: columns }, (_, column) => normalizeClip(Array.isArray(layer.clips) ? layer.clips[column] : null))
        const active = Number(layer.active)
        return {
            id,
            name: typeof layer.name === 'string' && layer.name ? layer.name : `Layer ${index + 1}`,
            opacity: clamp(layer.opacity, 0, 1, 1),
            blend: choiceOf(layer.blend, BLEND_MODES.length),
            active: Number.isInteger(active) && active >= 0 && active < columns && clips[active] ? active : -1,
            trigger: Math.max(0, Math.floor(clamp(layer.trigger, 0, Number.MAX_SAFE_INTEGER, 0))),
            bypass: layer.bypass === true,
            solo: layer.solo === true,
            side: sideOf(layer.side),
            effects: normalizeEffects(layer.effects),
            clips
        }
    })
    return {
        bpm: clamp(raw.bpm, MIN_BPM, MAX_BPM, DEFAULT_BPM),
        epoch: sanitizeEpoch(raw.epoch),
        master: clamp(raw.master, 0, 1, 1),
        effects: normalizeEffects(raw.effects),
        crossfade: clamp(raw.crossfade, 0, 1, 0.5),
        columns,
        layers: layers.length ? layers : createDeck({ columns }).layers
    }
}

// --- edits: each takes a deck and returns a new one ------------------------

const withLayer = (deck, layerIndex, change) => {
    const next = normalizeDeck(deck)
    const layer = next.layers[layerIndex]
    if (!layer) return next
    next.layers = next.layers.map((item, index) => (index === layerIndex ? change({ ...item, clips: [...item.clips] }) : item))
    return next
}

// --- effect edits: `where` is a layer index, or 'master' ----------------------

export const MASTER_STACK = 'master'
export const stackOf = (deck, where) => (where === MASTER_STACK ? deck.effects : deck.layers[where]?.effects || null)
const withStack = (deck, where, change) => {
    const next = normalizeDeck(deck)
    const stack = stackOf(next, where)
    if (!stack) return next
    const changed = normalizeEffects(change([...stack]))
    if (where === MASTER_STACK) next.effects = changed
    else next.layers = next.layers.map((layer, index) => (index === where ? { ...layer, effects: changed } : layer))
    return next
}
const withEffect = (deck, where, effectId, change) => withStack(deck, where, (stack) => stack.map((effect) => (effect.id === effectId ? change(effect) : effect)))

/** Put an effect of `type` on the end of a stack (nothing past MAX_EFFECTS, nothing for an unknown type). */
export const addEffect = (deck, where, type) => withStack(deck, where, (stack) => {
    const taken = new Set(stack.map((effect) => effect.id))
    const made = stack.length < MAX_EFFECTS ? normalizeEffect({ type }, taken) : null
    return made ? [...stack, made] : stack
})
export const removeEffect = (deck, where, effectId) => withStack(deck, where, (stack) => stack.filter((effect) => effect.id !== effectId))
/** Move an effect one place: direction -1 = earlier (runs sooner), +1 = later. */
export const moveEffect = (deck, where, effectId, direction) => withStack(deck, where, (stack) => {
    const from = stack.findIndex((effect) => effect.id === effectId)
    const to = from + (direction < 0 ? -1 : 1)
    if (from < 0 || to < 0 || to >= stack.length) return stack
    ;[stack[from], stack[to]] = [stack[to], stack[from]]
    return stack
})
export const setEffectOn = (deck, where, effectId, on) => withEffect(deck, where, effectId, (effect) => ({ ...effect, on: Boolean(on) }))
export const setEffectMix = (deck, where, effectId, mix) => withEffect(deck, where, effectId, (effect) => ({ ...effect, mix: clamp(mix, 0, 1, effect.mix) }))
/** One param by name; clamped to the operator's range by normalisation. */
export const setEffectParam = (deck, where, effectId, name, value) => withEffect(deck, where, effectId, (effect) => ({ ...effect, params: { ...effect.params, [name]: value } }))

/** A new layer on TOP of the stack (the end of the array). */
export const addLayer = (deck) => {
    const next = normalizeDeck(deck)
    if (next.layers.length >= MAX_LAYERS) return next
    const taken = new Set(next.layers.map((layer) => layer.id))
    let n = next.layers.length
    while (taken.has(layerIdFor(n))) n += 1
    next.layers = [...next.layers, { ...createLayer(n, next.columns), name: `Layer ${next.layers.length + 1}` }]
    return next
}

/** Remove a layer. The last one stays: a deck with no layers has nowhere to put a clip. */
export const removeLayer = (deck, layerIndex) => {
    const next = normalizeDeck(deck)
    if (next.layers.length <= 1 || !next.layers[layerIndex]) return next
    next.layers = next.layers.filter((_, index) => index !== layerIndex)
    return next
}

/** One more column of slots on every layer. */
export const addColumn = (deck) => {
    const next = normalizeDeck(deck)
    if (next.columns >= MAX_COLUMNS) return next
    next.columns += 1
    next.layers = next.layers.map((layer) => ({ ...layer, clips: [...layer.clips, null] }))
    return next
}

/** Put a clip in a slot, or empty it with null. Emptying the playing slot stops the layer. */
export const setClip = (deck, layerIndex, column, clip) => withLayer(deck, layerIndex, (layer) => {
    if (column < 0 || column >= layer.clips.length) return layer
    const normalized = clip === null ? null : normalizeClip(clip)
    layer.clips[column] = normalized
    if (!normalized && layer.active === column) layer.active = -1
    return layer
})

/** Change settings of the clip in a slot (speed, mode, in/out, label). */
export const updateClip = (deck, layerIndex, column, patch) => withLayer(deck, layerIndex, (layer) => {
    const clip = layer.clips[column]
    if (!clip || !isObject(patch)) return layer
    const merged = normalizeClip({ ...clip, ...patch, id: clip.id, kind: clip.kind, asset: clip.asset, input: clip.input, camera: clip.camera })
    // An in point dragged past the out point keeps the clip it had.
    if (merged && (patch.in !== undefined || patch.out !== undefined)) {
        const start = clamp(patch.in ?? clip.in, 0, 1, clip.in)
        const end = clamp(patch.out ?? clip.out, 0, 1, clip.out)
        if (end <= start) return layer
    }
    layer.clips[column] = merged
    return layer
})

/**
 * Play the clip in a slot on its layer. Triggering the one already playing
 * restarts it — the trigger counter is what top.clip watches.
 * An empty slot does nothing.
 */
export const trigger = (deck, layerIndex, column) => withLayer(deck, layerIndex, (layer) => {
    if (!layer.clips[column]) return layer
    layer.active = column
    layer.trigger += 1
    return layer
})

/**
 * Move the clip in slot `from` to slot `to` ({ layer, column } each). An empty
 * target takes it; a filled target swaps. A playing clip stays playing: the
 * layer's `active` column follows it, and on another layer the old layer stops
 * (or plays the swapped-in clip if that one was playing) and the new layer
 * plays it only if it was playing, with a trigger so the engine starts it.
 * The same slot, an empty source or a slot out of range returns `deck` itself.
 */
export const moveClip = (deck, from, to) => {
    const fl = Number(from?.layer)
    const fc = Number(from?.column)
    const tl = Number(to?.layer)
    const tc = Number(to?.column)
    if (![fl, fc, tl, tc].every(Number.isInteger)) return deck
    if (fl === tl && fc === tc) return deck
    const next = normalizeDeck(deck)
    const source = next.layers[fl]
    const target = next.layers[tl]
    if (!source || !target || fc < 0 || tc < 0 || fc >= source.clips.length || tc >= target.clips.length) return deck
    const clipA = source.clips[fc]
    if (!clipA) return deck
    const clipB = target.clips[tc]
    const playingA = source.active === fc
    const playingB = Boolean(clipB) && target.active === tc
    if (fl === tl) {
        const clips = [...source.clips]
        clips[fc] = clipB
        clips[tc] = clipA
        const active = playingA ? tc : playingB ? fc : source.active
        next.layers = next.layers.map((layer, index) => (index === fl ? { ...layer, clips, active } : layer))
        return next
    }
    next.layers = next.layers.map((layer, index) => {
        if (index === fl) {
            const clips = [...layer.clips]
            clips[fc] = clipB
            const active = playingB ? fc : playingA ? -1 : layer.active
            return { ...layer, clips, active, trigger: playingB ? layer.trigger + 1 : layer.trigger }
        }
        if (index === tl) {
            const clips = [...layer.clips]
            clips[tc] = clipA
            const active = playingA ? tc : playingB ? -1 : layer.active
            return { ...layer, clips, active, trigger: playingA ? layer.trigger + 1 : layer.trigger }
        }
        return layer
    })
    return next
}

/** Play a whole column: every layer takes its clip there, a layer with nothing there goes empty. */
export const triggerColumn = (deck, column) => {
    const next = normalizeDeck(deck)
    next.layers = next.layers.map((layer) => (layer.clips[column]
        ? { ...layer, active: column, trigger: layer.trigger + 1 }
        : { ...layer, active: -1 }))
    return next
}

export const clearLayer = (deck, layerIndex) => withLayer(deck, layerIndex, (layer) => ({ ...layer, active: -1 }))

export const setOpacity = (deck, layerIndex, opacity) => withLayer(deck, layerIndex, (layer) => ({ ...layer, opacity: clamp(opacity, 0, 1, layer.opacity) }))

export const setBlend = (deck, layerIndex, blend) => withLayer(deck, layerIndex, (layer) => ({ ...layer, blend: choiceOf(blend, BLEND_MODES.length, layer.blend) }))

export const renameLayer = (deck, layerIndex, name) => withLayer(deck, layerIndex, (layer) => ({ ...layer, name: String(name || '').trim() || layer.name }))

// Edits by layer id (the B / S / A-B buttons know the layer, not its index).
const withLayerId = (deck, layerId, change) => {
    const next = normalizeDeck(deck)
    next.layers = next.layers.map((layer) => (layer.id === layerId ? change({ ...layer }) : layer))
    return next
}

/** Bypass a layer: it makes no picture, but keeps its playing clip for when it comes back. */
export const setBypass = (deck, layerId, on) => withLayerId(deck, layerId, (layer) => ({ ...layer, bypass: on === true }))

/** Solo a layer: while any layer is solo, only solo layers make a picture. */
export const setSolo = (deck, layerId, on) => withLayerId(deck, layerId, (layer) => ({ ...layer, solo: on === true }))

/** Put a layer on the crossfader's A or B side, or '' to take it off. */
export const setSide = (deck, layerId, side) => withLayerId(deck, layerId, (layer) => ({ ...layer, side: sideOf(side, layer.side) }))

export const setCrossfade = (deck, value) => {
    const next = normalizeDeck(deck)
    next.crossfade = clamp(value, 0, 1, next.crossfade)
    return next
}

/**
 * How much of a layer the crossfader lets through: 1 off the fader, and for a
 * linear fade with both sides full in the middle, A = min(1, 2 (1 - x)),
 * B = min(1, 2 x).
 */
export const crossfadeGain = (side, crossfade) => {
    const x = clamp(crossfade, 0, 1, 0.5)
    if (side === 'a') return Math.min(1, 2 * (1 - x))
    if (side === 'b') return Math.min(1, 2 * x)
    return 1
}

export const setMaster = (deck, master) => {
    const next = normalizeDeck(deck)
    next.master = clamp(master, 0, 1, next.master)
    return next
}

/** The deck's own tempo, and (when given) where its beat is. */
export const setBpm = (deck, bpm, epoch = undefined) => {
    const next = normalizeDeck(deck)
    next.bpm = Math.round(clamp(bpm, MIN_BPM, MAX_BPM, next.bpm) * 10) / 10
    if (epoch !== undefined) next.epoch = sanitizeEpoch(epoch)
    return next
}

// --- tap tempo --------------------------------------------------------------
//
// The show clock's own tap (src/timeline/showClock.js), so the deck and the
// Clock window count taps by one rule. Until 2026-09-24 the deck had its own,
// which averaged a double click in: two taps 100 ms apart are 600 bpm,
// clamped to 300 — the 300.0 the owner saw on his screen.
export const TAP_RESET_MS = CLOCK_TAP_RESET_MS
export const tapTempo = (taps = [], now = 0) => clockTapTempo(taps, now)

// --- the macro ----------------------------------------------------------------

export const clipNodeId = (deckId, layerIndex) => `${deckId}::L${layerIndex}::clip`
export const blendNodeId = (deckId, layerIndex) => `${deckId}::L${layerIndex}::blend`
export const masterNodeId = (deckId) => `${deckId}::master`
// Effect ids come from the effect's own id, not its place in the stack: a param
// change or a reorder never changes the id set, so the engine never rebuilds.
export const layerEffectNodeId = (deckId, layerIndex, effectId) => `${deckId}::L${layerIndex}::fx::${effectId}`
export const layerEffectMixNodeId = (deckId, layerIndex, effectId) => `${deckId}::L${layerIndex}::fxmix::${effectId}`
export const masterEffectNodeId = (deckId, effectId) => `${deckId}::fx::${effectId}`
export const masterEffectMixNodeId = (deckId, effectId) => `${deckId}::fxmix::${effectId}`
// One camera operator per camera label in a deck: two clips of the same camera
// share it (one getUserMedia). The key is a short hash so any label is a safe id.
// The device id (when a clip carries one) is part of the key, so two cameras with the
// same label are two operators; a clip with no device hint hashes the label alone,
// exactly as before, so old saved clips keep their id.
export const cameraNodeId = (deckId, label, device = '') => {
    let h = 5381
    const key = device ? `${label}\u0000${device}` : String(label)
    for (const ch of key) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0
    return `${deckId}::cam-${h.toString(36)}`
}

/**
 * A deck node → the picture operators that make its picture.
 *
 *   deckNode       { id, type, values } (the engine's shape; `typeId` is read too)
 *   wiresIntoDeck  [{ from, to, port }] — wires whose `to` is this deck and
 *                  whose port is in1..in4; anything else is ignored
 *
 * Returns { nodes, wires, alias }:
 *   nodes  top.clip / top.camera for each layer with an active clip, top.blend per
 *          such layer (mix 0 when silenced, never dropped),
 *          and one top.level master — always there, so an empty deck is black
 *   wires  bottom layer's blend reads nothing on `a` (black), each layer above
 *          reads the one below; `b` is the layer's source
 *   alias  { [deck.id]: master id } — a wire FROM the deck reads the master
 *
 * An input clip's source is whatever is wired into its port, unexpanded: if
 * that is another deck, the caller's alias pass resolves it. A wire from the
 * deck into itself becomes the master — a feedback loop the engine already
 * handles by reading last frame.
 */
export const expandDeck = (deckNode, wiresIntoDeck = []) => {
    const deckId = deckNode?.id
    if (!deckId) return { nodes: [], wires: [], alias: {} }
    const deck = normalizeDeck(deckNode.values?.deck)
    const machine = typeof deckNode.values?.machine === 'string' ? deckNode.values.machine : ''
    const master = masterNodeId(deckId)
    const fedBy = new Map()
    for (const wire of wiresIntoDeck || []) {
        if (wire?.to !== deckId || !DECK_INPUTS.includes(wire.port) || !wire.from) continue
        fedBy.set(wire.port, wire.from === deckId ? master : wire.from)
    }

    const nodes = []
    const wires = []
    // A stack after `input`: each ON effect is the operator plus a Blend (Mix mode:
    // a = what came in, b = the effect, Amount = the effect's mix = dry/wet).
    // Off or empty adds nothing. Returns the id the next stage reads.
    const runStack = (stack, input, effectIdOf, mixIdOf, unseen = false) => {
        let current = input
        for (const effect of stack) {
            if (!effect.on) continue
            const fx = effectIdOf(effect.id)
            const wet = mixIdOf(effect.id)
            const matte = Boolean(TOP_OPERATORS[effect.type]?.matte)
            // A Body on a silent layer keeps its node (so the model stays loaded and nothing
            // restarts when the fader comes up) but is told nobody sees it: the engine then
            // does not run the model for it. Three Body layers with two faders down cost
            // three model runs a frame (17 frames a second on the show machine, 2026-11-11).
            nodes.push({ id: fx, type: effect.type, values: { machine, ...effect.params, ...(matte && unseen ? { unseen: true } : {}) } })
            wires.push({ from: current, to: fx, port: 'a' })
            // Body looks for the person in what the stack started from (the layer's
            // own picture, before its other effects), and paints over `a`.
            if (matte) wires.push({ from: input, to: fx, port: 'b' })
            nodes.push({ id: wet, type: 'top.blend', values: { machine, mode: '0', mix: effect.mix } })
            wires.push({ from: current, to: wet, port: 'a' })
            wires.push({ from: fx, to: wet, port: 'b' })
            current = wet
        }
        return current
    }
    let below = null
    const anySolo = deck.layers.some((layer) => layer.solo)
    deck.layers.forEach((layer, index) => {
        // Bypass, solo, the crossfader and opacity 0 silence a layer by its blend's
        // mix, NEVER by dropping its nodes: a dropped source is destroyed and made
        // again (a camera closes and reopens, a video restarts). The source and the
        // blend keep their ids; only `mix` goes to 0.
        const silenced = layer.bypass || (anySolo && !layer.solo)
        const opacity = silenced ? 0 : layer.opacity * crossfadeGain(layer.side, deck.crossfade)
        const clip = layer.active >= 0 ? layer.clips[layer.active] : null
        if (!clip) return
        let source
        if (clip.kind === 'input') {
            source = fedBy.get(clip.input)
            if (!source) return
        } else if (clip.kind === 'camera') {
            source = cameraNodeId(deckId, clip.camera, clip.device)
            // top.camera resolves device id first, then label (useTopNetwork.js).
            if (!nodes.some((node) => node.id === source)) {
                nodes.push({ id: source, type: 'top.camera', values: { machine, device: clip.device, deviceLabel: clip.camera, mirror: false } })
            }
        } else {
            source = clipNodeId(deckId, index)
            nodes.push({
                id: source,
                type: 'top.clip',
                values: {
                    machine,
                    asset: clip.asset,
                    speed: clip.speed,
                    mode: clip.mode,
                    in: clip.in,
                    out: clip.out,
                    trigger: layer.trigger,
                    playing: true
                }
            })
        }
        const blend = blendNodeId(deckId, index)
        nodes.push({ id: blend, type: 'top.blend', values: { machine, mode: layer.blend, mix: opacity } })
        if (below) wires.push({ from: below, to: blend, port: 'a' })
        wires.push({ from: runStack(layer.effects, source, (id) => layerEffectNodeId(deckId, index, id), (id) => layerEffectMixNodeId(deckId, index, id), opacity <= 0), to: blend, port: 'b' })
        below = blend
    })

    if (below) below = runStack(deck.effects, below, (id) => masterEffectNodeId(deckId, id), (id) => masterEffectMixNodeId(deckId, id))
    nodes.push({
        id: master,
        type: 'top.level',
        values: { machine, threshold: 0, gain: 1, brightness: 0, gamma: 1, invert: false, opacity: deck.master }
    })
    if (below) wires.push({ from: below, to: master, port: 'a' })

    return { nodes, wires, alias: { [deckId]: master } }
}

/** Follow an alias chain (a deck feeding a deck) to the id that really has the picture. */
export const resolveAlias = (id, alias = {}) => {
    let current = id
    const seen = new Set()
    while (Object.prototype.hasOwnProperty.call(alias, current) && !seen.has(current)) {
        seen.add(current)
        current = alias[current]
    }
    return current
}

/** Rewrite the `from` of every wire through the alias map. */
export const aliasWires = (wires = [], alias = {}) => wires.map((wire) => {
    const from = resolveAlias(wire.from, alias)
    return from === wire.from ? wire : { ...wire, from }
})

/** A node that makes a picture on the GPU: a picture operator, or a deck. */
export const isPictureType = (typeId) => isTopType(typeId) || typeId === VJ_DECK_TYPE

/**
 * The engine id whose picture a node's card shows: an operator's own id, a
 * deck's master. A card thumbnail registers under this.
 */
export const pictureIdOf = (node) => (node?.typeId === VJ_DECK_TYPE || node?.type === VJ_DECK_TYPE
    ? masterNodeId(node.id)
    : node?.id)

/**
 * Every deck of a network, expanded into operators, with the wires out of
 * each deck rewritten to read its master.
 *
 *   nodes  the operators ({ id, type, values }) — decks may be among them
 *   wires  [{ from, to, port }] — wires INTO a deck carry port in1..in4
 *
 * Order matters and is fixed here: EVERY deck expands first, THEN the wires
 * alias, so a deck wired into a deck reads the upstream deck's master.
 * Returns { nodes, wires, alias } — no deck and no wire into a deck survive.
 */
export const expandDecks = ({ nodes = [], wires = [] } = {}) => {
    const decks = nodes.filter((node) => node?.type === VJ_DECK_TYPE)
    if (!decks.length) return { nodes, wires, alias: {} }
    const deckIds = new Set(decks.map((deck) => deck.id))
    const expandedNodes = nodes.filter((node) => !deckIds.has(node.id))
    let expandedWires = wires.filter((wire) => !deckIds.has(wire.to))
    const alias = {}
    for (const deck of decks) {
        const expanded = expandDeck(deck, wires.filter((wire) => wire.to === deck.id))
        expandedNodes.push(...expanded.nodes)
        expandedWires = expandedWires.concat(expanded.wires)
        Object.assign(alias, expanded.alias)
    }
    return { nodes: expandedNodes, wires: aliasWires(expandedWires, alias), alias }
}

// --- the node type ---------------------------------------------------------------

/** The deck as a node type, for nodeRegistry.js — registered beside the picture operators. */
export const buildVjDeckNodeTypes = () => ({
    [VJ_DECK_TYPE]: {
        id: VJ_DECK_TYPE,
        label: 'VJ Deck',
        category: 'picture',
        runtime: 'web',
        singleton: false,
        keywords: ['picture', 'vj', 'deck', 'resolume', 'clip', 'clips', 'layer', 'footage', 'video', 'mix', 'perform', 'live'],
        inputs: DECK_INPUTS.map((id, index) => ({ id, type: 'texture', label: `In ${index + 1}` })),
        outputs: [{ id: 'out', type: 'texture', label: 'Picture' }],
        defaultValues: { machine: '', deck: createDeck() },
        // The grid is the deck's face: a window you play, not a card of settings.
        defaultFrame: { width: 760, height: 520 },
        render: 'panel-2d'
    }
})
