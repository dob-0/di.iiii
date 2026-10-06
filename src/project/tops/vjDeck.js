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
import { isTopType } from './topOperators.js'
import { DEFAULT_BPM, TAP_RESET_MS as CLOCK_TAP_RESET_MS, sanitizeEpoch, tapTempo as clockTapTempo } from '../../timeline/showClock.js'

export const VJ_DECK_TYPE = 'vj.deck'
export const DECK_INPUTS = ['in1', 'in2', 'in3', 'in4']
// Index order is what the shader reads (top.blend's `mode` choice).
export const BLEND_MODES = ['Mix', 'Add', 'Screen', 'Multiply', 'Difference']
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

// --- the shape ------------------------------------------------------------

/** A clip, defaults filled and every number in range. null for anything that is not one. */
export const normalizeClip = (clip) => {
    if (!isObject(clip)) return null
    const kind = clip.kind === 'input' ? 'input' : 'asset'
    if (kind === 'input' && !DECK_INPUTS.includes(clip.input)) return null
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
    else out.input = clip.input
    return out
}

const layerIdFor = (index) => `layer-${index + 1}`

export const createLayer = (index = 0, columns = DEFAULT_COLUMNS) => ({
    id: layerIdFor(index),
    name: `Layer ${index + 1}`,
    opacity: 1,
    blend: '0',
    active: -1,
    trigger: 0,
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
            clips
        }
    })
    return {
        bpm: clamp(raw.bpm, MIN_BPM, MAX_BPM, DEFAULT_BPM),
        epoch: sanitizeEpoch(raw.epoch),
        master: clamp(raw.master, 0, 1, 1),
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
    const merged = normalizeClip({ ...clip, ...patch, id: clip.id, kind: clip.kind, asset: clip.asset, input: clip.input })
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

/**
 * A deck node → the picture operators that make its picture.
 *
 *   deckNode       { id, type, values } (the engine's shape; `typeId` is read too)
 *   wiresIntoDeck  [{ from, to, port }] — wires whose `to` is this deck and
 *                  whose port is in1..in4; anything else is ignored
 *
 * Returns { nodes, wires, alias }:
 *   nodes  top.clip for each playing asset clip, top.blend per playing layer,
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
    let below = null
    deck.layers.forEach((layer, index) => {
        const clip = layer.active >= 0 ? layer.clips[layer.active] : null
        if (!clip) return
        let source
        if (clip.kind === 'input') {
            source = fedBy.get(clip.input)
            if (!source) return
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
        nodes.push({ id: blend, type: 'top.blend', values: { machine, mode: layer.blend, mix: layer.opacity } })
        if (below) wires.push({ from: below, to: blend, port: 'a' })
        wires.push({ from: source, to: blend, port: 'b' })
        below = blend
    })

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
