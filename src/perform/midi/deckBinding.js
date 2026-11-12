// MIDI → the VJ deck. Pure: a map is a list of
//   { match: { kind: 'cc' | 'note', number, channel }, action, args, relative? }
// and applyMidi(deck, message, map) answers the next deck, or the SAME object
// when nothing in the map takes the message. Every edit is the deck model's own
// function (src/project/tops/vjDeck.js); nothing of its logic is repeated here.
//
// `message` is what parseMidiMessage (raw/utils/midiCapture.js) gives:
//   { kind: 'cc', channel, cc, value } | { kind: 'noteOn', channel, note } | noteOff.
// Channels are 1-based, as in the K2 control sheet. layer / column are 0-based
// positions (layer 0 = "Layer 1", the bottom of the stack).
//
// There is deliberately NO light action and NO laser action here.

import {
    BLEND_MODES,
    MAX_BPM,
    MIN_BPM,
    clearLayer,
    normalizeDeck,
    setBlend,
    setBpm,
    effectNumericParams,
    setBypass,
    setCrossfade,
    setEffectMix,
    setEffectOn,
    setEffectParam,
    stackOf,
    MASTER_STACK,
    setMaster,
    setOpacity,
    setSide,
    setSolo,
    tapTempo,
    trigger,
    triggerColumn,
    updateClip
} from '../../project/tops/vjDeck.js'

/** Absolute 0..127 → 0..1. */
export const unit = (value) => Math.min(1, Math.max(0, Number(value) / 127))

/** A relative encoder tick, two's complement over 7 bits: 1..63 up, 127 = -1, 65..127 down. */
export const relativeDelta = (value) => {
    const v = Number(value) | 0
    if (v <= 0 || v === 64) return 0
    return v < 64 ? v : v - 128
}

const DEFAULT_STEP = { opacity: 0.02, crossfade: 0.02, master: 0.02, bpm: 0.5, clipSpeed: 0.05 }
const SIDE_CYCLE = { '': 'a', a: 'b', b: '' }
const isInt = (value) => Number.isInteger(value) && value >= 0

/** What a binding does and what it needs. `button` ones fire on a press only. */
export const ACTIONS = {
    opacity: { args: ['layer'], button: false, relativeOk: true },
    blend: { args: ['layer'], button: false, relativeOk: false },
    clipSpeed: { args: ['layer'], button: false, relativeOk: true },
    bypass: { args: ['layer'], button: true },
    solo: { args: ['layer'], button: true },
    side: { args: ['layer'], button: true },
    clip: { args: ['layer', 'column'], button: true },
    column: { args: ['column'], button: true },
    clearLayer: { args: ['layer'], button: true },
    crossfade: { args: [], button: false, relativeOk: true },
    master: { args: [], button: false, relativeOk: true },
    bpm: { args: [], button: false, relativeOk: true },
    tap: { args: [], button: true },
    // An effect's mix or one of its numeric main params. args { param: 'mix' | 0..2, layer?, effect? }:
    // no layer = the selected stack (ctx.fx.layer, -1 = master), no effect = its first.
    fx: { args: [], button: false, relativeOk: true },
    // Effect n (args.slot, 0-based) of the selected stack on / off.
    fxToggle: { args: [], button: true },
    // The next layer (with clips) whose effects the pots address; the view owns that choice (ctx.onFxLayer).
    fxLayerNext: { args: [], button: true },
    // The next effect of the selected stack that the pots turn (ctx.onFxEffect).
    fxNext: { args: [], button: true },
    // FREEZE while held: hold 1 on every Freeze effect of the master and the selected layer, 0 on release.
    hold: { args: [], button: false }
}

// --- the effects half of the K2: which stack, which effect, freeze ----------------

const stackFor = (base, layer) => (Number.isInteger(layer) && layer >= 0 ? base.layers[layer]?.effects : base.effects) || []

/** Freeze effects a held button acts on: the master's and the selected layer's. [{ where, effect }]. */
export const holdTargets = (deck, fxLayer = -1) => {
    const base = normalizeDeck(deck)
    const out = base.effects.filter((effect) => effect.type === 'top.freeze').map((effect) => ({ where: MASTER_STACK, effect }))
    if (Number.isInteger(fxLayer) && fxLayer >= 0) {
        for (const effect of base.layers[fxLayer]?.effects || []) if (effect.type === 'top.freeze') out.push({ where: fxLayer, effect })
    }
    return out
}

/** The deck with `hold` (1 / 0) set on those Freeze effects, or the same object when nothing changes. */
export const setFreezeHold = (deck, fxLayer, hold) => {
    let next = deck
    for (const { where, effect } of holdTargets(deck, fxLayer)) {
        if (Number(effect.params.hold) === hold) continue
        next = setEffectParam(next, where, effect.id, 'hold', hold)
    }
    return next
}

/** The next layer, after `fxLayer` (-1 = master: start at the first), that has a clip; wraps; null when none. */
export const nextFxLayer = (deck, fxLayer = -1) => {
    const base = normalizeDeck(deck)
    const count = base.layers.length
    const start = Number.isInteger(fxLayer) && fxLayer >= 0 ? fxLayer : -1
    for (let step = 1; step <= count; step += 1) {
        const index = (start + step + count) % count
        if (base.layers[index].clips.some(Boolean)) return index
    }
    return null
}

/** The next effect index in the stack of `fxLayer` (-1 = master), wrapping; null for an empty stack. */
export const nextFxIndex = (deck, fxLayer = -1, current = 0) => {
    const count = stackFor(normalizeDeck(deck), fxLayer).length
    return count ? (Math.min(Math.max(0, current | 0), count - 1) + 1) % count : null
}

// --- reading a message ------------------------------------------------------

/** The control a parsed message came from: { kind, number, channel, value, press } or null. */
export const controlOf = (message) => {
    if (!message) return null
    if (message.kind === 'cc') return { kind: 'cc', number: message.cc, channel: message.channel, value: message.value, press: message.value > 0 }
    if (message.kind === 'noteOn') return { kind: 'note', number: message.note, channel: message.channel, value: message.velocity ?? 127, press: true }
    if (message.kind === 'noteOff') return { kind: 'note', number: message.note, channel: message.channel, value: 0, press: false }
    return null
}

const sameMatch = (a, b) => Boolean(a && b) && a.kind === b.kind && a.number === b.number && (a.channel || 0) === (b.channel || 0)
const matches = (entry, control) => entry?.match && entry.match.kind === control.kind && entry.match.number === control.number
    && (!entry.match.channel || entry.match.channel === control.channel)

/** A stable key for "what this binding does", so a learned one can replace it. */
export const actionKey = (action, args = {}) => [action, args.layer ?? '', args.column ?? ''].join(':')
    + (args.param !== undefined ? `:${args.param}:${args.effect ?? ''}` : '')

// --- the actions ------------------------------------------------------------

const layerAt = (deck, index) => (isInt(index) ? deck.layers[index] : undefined)

/** Soft takeover: how close (0..1 of the control's travel) counts as "arrived". */
export const PICKUP_WINDOW = 3 / 127

/**
 * Soft takeover (pickup), pure. An absolute control only takes over its target
 * once its incoming value has come within `window` of the target's current
 * value, or crossed it since the last message; until then it is ignored, so a
 * fader sitting elsewhere does not make the target jump on first touch.
 *
 *   state     { engaged, last, expected } | undefined — the control's own memory
 *   current   the target's current value, 0..1 of the control's travel
 *   incoming  the control's new value, 0..1
 * Returns { pass, state }. When the target was changed from elsewhere (it is no
 * longer where this control last put it, `expected`) pickup starts over.
 */
export const softTakeover = (state, current, incoming, window = PICKUP_WINDOW) => {
    let engaged = Boolean(state?.engaged)
    let last = state?.last
    if (engaged && Math.abs(current - state.expected) > Math.max(window / 2, 1e-6)) { engaged = false; last = undefined }
    if (!engaged) {
        const near = Math.abs(incoming - current) <= window
        const crossed = last !== undefined && (last - current) * (incoming - current) <= 0
        if (!near && !crossed) return { pass: false, state: { engaged: false, last: incoming, expected: undefined } }
    }
    return { pass: true, state: { engaged: true, last: incoming, expected: incoming } }
}

// A continuous value: absolute from a pot or fader, or nudged by an encoder.
// scale.to maps the current value back to 0..1 for pickup (ctx.pickup, a Map the
// caller keeps per control; without it an absolute control jumps as before).
const continuous = (current, control, entry, scale, ctx = {}) => {
    if (entry.relative) {
        const delta = relativeDelta(control.value)
        if (!delta) return null
        const step = Number.isFinite(entry.args?.step) ? entry.args.step : scale.step
        return current + delta * step
    }
    const incoming = unit(control.value)
    if (ctx.pickup && scale.to) {
        const key = `${control.kind}:${control.number}:${control.channel}:${actionKey(entry.action, entry.args)}`
        const result = softTakeover(ctx.pickup.get(key), scale.to(current), incoming, scale.window)
        ctx.pickup.set(key, result.state)
        if (!result.pass) return null
        // remember where we put the target, in its own (rounded) terms
        ctx.pickup.set(key, { ...result.state, expected: scale.to(scale.from(incoming)) })
    }
    return scale.from(incoming)
}

const run = (deck, control, entry, ctx) => {
    const args = entry.args || {}
    const spec = ACTIONS[entry.action]
    if (!spec) return deck
    if (spec.button && !control.press) return deck
    const base = normalizeDeck(deck)
    const layer = layerAt(base, args.layer)
    if (spec.args.includes('layer') && !layer) return deck
    const nextOr = (value, make) => (value === null ? deck : make(value))
    switch (entry.action) {
        case 'opacity':
            return nextOr(continuous(layer.opacity, control, entry, { step: DEFAULT_STEP.opacity, from: (x) => x, to: (x) => x }, ctx), (v) => setOpacity(base, args.layer, v))
        case 'blend': {
            const count = BLEND_MODES.length
            const index = Math.min(count - 1, Math.floor(unit(control.value) * count))
            if (ctx.pickup) {
                // the current mode is the middle of its bin; "arrived" is landing in that bin
                const key = `${control.kind}:${control.number}:${control.channel}:${actionKey(entry.action, entry.args)}`
                const result = softTakeover(ctx.pickup.get(key), (Number(layer.blend) + 0.5) / count, unit(control.value), Math.max(PICKUP_WINDOW, 0.5 / count))
                ctx.pickup.set(key, { ...result.state, expected: result.pass ? (index + 0.5) / count : undefined })
                if (!result.pass) return deck
            }
            return layer.blend === String(index) ? deck : setBlend(base, args.layer, String(index))
        }
        case 'clipSpeed': {
            if (layer.active < 0) return deck
            const clip = layer.clips[layer.active]
            return nextOr(continuous(clip.speed, control, entry, { step: DEFAULT_STEP.clipSpeed, from: (x) => x * 4, to: (x) => x / 4 }, ctx), (v) => updateClip(base, args.layer, layer.active, { speed: v }))
        }
        case 'bypass': return setBypass(base, layer.id, !layer.bypass)
        case 'solo': return setSolo(base, layer.id, !layer.solo)
        case 'side': return setSide(base, layer.id, SIDE_CYCLE[layer.side] ?? '')
        case 'clip':
            if (!isInt(args.column) || !layer.clips[args.column]) return deck
            return trigger(base, args.layer, args.column)
        case 'column':
            return isInt(args.column) && args.column < base.columns ? triggerColumn(base, args.column) : deck
        case 'clearLayer': return layer.active < 0 ? deck : clearLayer(base, args.layer)
        case 'crossfade':
            return nextOr(continuous(base.crossfade, control, entry, { step: DEFAULT_STEP.crossfade, from: (x) => x, to: (x) => x }, ctx), (v) => setCrossfade(base, v))
        case 'master':
            return nextOr(continuous(base.master, control, entry, { step: DEFAULT_STEP.master, from: (x) => x, to: (x) => x }, ctx), (v) => setMaster(base, v))
        case 'bpm':
            return nextOr(continuous(base.bpm, control, entry, { step: DEFAULT_STEP.bpm, from: (x) => MIN_BPM + x * (MAX_BPM - MIN_BPM), to: (x) => (x - MIN_BPM) / (MAX_BPM - MIN_BPM) }, ctx), (v) => setBpm(base, v))
        case 'fx': {
            const where = args.layer === undefined ? ctx.fx?.layer : args.layer
            if (!Number.isInteger(where)) return deck
            const master = where < 0
            // no layer given = the selected stack, and then the selected effect of it (K2 encoder 6 push)
            const slot = args.effect ?? (args.layer === undefined ? ctx.fx?.effect : 0) ?? 0
            const effect = (master ? base.effects : base.layers[where]?.effects)?.[slot]
            if (!effect) return deck
            const stack = master ? 'master' : where
            if (args.param === 'mix') {
                return nextOr(continuous(effect.mix, control, entry, { step: 0.02, from: (x) => x, to: (x) => x }, ctx), (v) => setEffectMix(base, stack, effect.id, v))
            }
            const p = effectNumericParams(effect.type)[args.param]
            if (!p) return deck
            const span = p.max - p.min
            return nextOr(continuous(effect.params[p.name], control, entry, { step: span / 50, from: (x) => p.min + x * span, to: (x) => (x - p.min) / span }, ctx), (v) => setEffectParam(base, stack, effect.id, p.name, v))
        }
        case 'fxToggle': {
            const where = ctx.fx?.layer
            if (!Number.isInteger(where) || !Number.isInteger(args.slot)) return deck
            const effect = stackFor(base, where)[args.slot]
            return effect ? setEffectOn(base, where < 0 ? MASTER_STACK : where, effect.id, !effect.on) : deck
        }
        case 'fxLayerNext': {
            const to = nextFxLayer(base, ctx.fx?.layer)
            if (to !== null) ctx.onFxLayer?.(to)
            return deck
        }
        case 'fxNext': {
            const to = nextFxIndex(base, ctx.fx?.layer, ctx.fx?.effect)
            if (to !== null) ctx.onFxEffect?.(to)
            return deck
        }
        case 'hold': return setFreezeHold(deck, ctx.holdLayer ?? ctx.fx?.layer, control.press ? 1 : 0)
        case 'tap': {
            // The view owns the clock (the show clock, or the deck's own taps).
            if (typeof ctx.onTap === 'function') { ctx.onTap(); return deck }
            const state = tapTempo(ctx.tapState?.taps || [], Number(ctx.now ?? Date.now()))
            if (ctx.tapState) ctx.tapState.taps = state.taps
            return state.bpm === null ? deck : setBpm(base, state.bpm, state.epoch)
        }
        default: return deck
    }
}

/** The map entry that takes a message, or undefined. */
export const entryFor = (message, map) => {
    const control = controlOf(message)
    return control && Array.isArray(map) ? map.find((item) => matches(item, control)) : undefined
}

/** Continuous actions (faders, pots, encoders): the ones a caller may coalesce. */
export const CONTINUOUS_ACTIONS = new Set(['opacity', 'blend', 'clipSpeed', 'crossfade', 'master', 'bpm', 'fx'])
export const isContinuousEntry = (entry) => Boolean(entry) && CONTINUOUS_ACTIONS.has(entry.action)

/**
 * The next deck for one MIDI message, or the same object when no entry in the
 * map takes it (or the entry changes nothing).
 * ctx: { onTap?, tapState?: { taps }, now?, pickup?: Map } — tap reads the first three,
 * absolute controls read `pickup` (soft takeover; the caller keeps the Map per deck).
 */
export const applyMidi = (deck, message, map, ctx = {}) => {
    const control = controlOf(message)
    if (!control || !Array.isArray(map)) return deck
    const entry = map.find((item) => matches(item, control))
    return entry ? run(deck, control, entry, ctx) : deck
}

// --- the map: defaults plus the user's overrides --------------------------------

/** What a project stores in values.midiMap: { bindings: [...] }, anything else is empty. */
export const normalizeOverrides = (stored) => {
    const list = Array.isArray(stored?.bindings) ? stored.bindings : []
    return list.filter((entry) => entry && ACTIONS[entry.action] && entry.match
        && (entry.match.kind === 'cc' || entry.match.kind === 'note') && isInt(entry.match.number))
        .map((entry) => ({ match: { kind: entry.match.kind, number: entry.match.number, channel: entry.match.channel || 0 }, action: entry.action, args: entry.args || {}, ...(entry.relative ? { relative: true } : {}) }))
}

/** Overrides first; a default is dropped when an override takes its control or its action. */
export const effectiveMap = (defaults, overrides = []) => {
    const taken = new Set(overrides.map((entry) => actionKey(entry.action, entry.args)))
    const kept = (defaults || []).filter((entry) => !taken.has(actionKey(entry.action, entry.args)) && !overrides.some((o) => sameMatch(o.match, entry.match)))
    return [...overrides, ...kept]
}

/** Add one learned entry to the stored overrides, replacing what it collides with. */
export const withOverride = (stored, entry) => {
    const list = normalizeOverrides(stored)
    const key = actionKey(entry.action, entry.args)
    const rest = list.filter((item) => actionKey(item.action, item.args) !== key && !sameMatch(item.match, entry.match))
    return { bindings: [...rest, entry] }
}

/** The stored overrides without the learned binding(s) of one target; the default (if any) returns. */
export const withoutOverride = (stored, target) => {
    const key = actionKey(target?.action, target?.args)
    return { bindings: normalizeOverrides(stored).filter((item) => actionKey(item.action, item.args) !== key) }
}

/** What takes a target now: { entry, learned } (learned = the user's own override), or null. */
export const bindingFor = (defaults, overrides, target) => {
    if (!target) return null
    const key = actionKey(target.action, target.args)
    const own = (overrides || []).find((item) => actionKey(item.action, item.args) === key)
    if (own) return { entry: own, learned: true }
    const base = effectiveMap(defaults, overrides).find((item) => actionKey(item.action, item.args) === key)
    return base ? { entry: base, learned: false } : null
}

/** A match in plain words: "CC 4 · ch 15", "Note 36 · ch 15" (no channel = any). */
export const describeMatch = (match) => {
    if (!match) return ''
    const what = match.kind === 'note' ? `Note ${match.number}` : `CC ${match.number}`
    return match.channel ? `${what} \u00b7 ch ${match.channel}` : `${what} \u00b7 any ch`
}

/** The short form for a tag on a control: "CC 4" / "N 36". */
export const shortMatch = (match) => (match ? `${match.kind === 'note' ? 'N' : 'CC'} ${match.number}` : '')

/**
 * The deck with one control put back to its start value, or null where the control has
 * none (buttons, clip tiles, blend, tap). opacity -> 1, crossfade -> centre, master -> 1,
 * effect mix -> 1, effect param -> the operator's own default.
 */
export const resetDeckValue = (deck, key) => {
    const [name, a, b, c] = String(key || '').split(':')
    const target = targetFromKey(key)
    if (!target) return null
    switch (name) {
        case 'opacity': return setOpacity(deck, target.args.layer, 1)
        case 'crossfade': return setCrossfade(deck, 0.5)
        case 'master': return setMaster(deck, 1)
        case 'fxmix': case 'fxp': {
            const where = a === 'm' ? MASTER_STACK : Number(a)
            const effect = (stackOf(deck, where) || [])[Number(b)]
            if (!effect) return null
            if (name === 'fxmix') return setEffectMix(deck, where, effect.id, 1)
            const param = effectNumericParams(effect.type)[Number(c)]
            return param && Number.isFinite(param.value) ? setEffectParam(deck, where, effect.id, param.name, param.value) : null
        }
        default: return null
    }
}

// --- learn ---------------------------------------------------------------------

/**
 * A screen control's key → what it would bind. Keys: opacity:L blend:L speed:L bypass:L solo:L
 * side:L clip:L:C column:C clear:L crossfade master bpm tap  (L, C 0-based),
 * fxmix:L:E fxp:L:E:P (L = layer or m for the master, E effect, P numeric param, 0-based).
 */
export const targetFromKey = (key) => {
    const [name, a, b, c] = String(key || '').split(':')
    const n = (value) => (value === undefined || value === '' ? NaN : Number(value))
    const layer = (action) => (isInt(n(a)) ? { action, args: { layer: n(a) } } : null)
    switch (name) {
        case 'opacity': return layer('opacity')
        case 'blend': return layer('blend')
        case 'speed': return layer('clipSpeed')
        case 'bypass': return layer('bypass')
        case 'solo': return layer('solo')
        case 'side': return layer('side')
        case 'clear': return layer('clearLayer')
        case 'clip': return isInt(n(a)) && isInt(n(b)) ? { action: 'clip', args: { layer: n(a), column: n(b) } } : null
        case 'column': return isInt(n(a)) ? { action: 'column', args: { column: n(a) } } : null
        case 'fxmix': case 'fxp': {
            // fxmix:<layer|m>:<effect>   fxp:<layer|m>:<effect>:<param>
            const where = a === 'm' ? -1 : n(a)
            const param = name === 'fxmix' ? 'mix' : n(c)
            if (!(where === -1 || isInt(where)) || !isInt(n(b)) || !(param === 'mix' || isInt(param))) return null
            return { action: 'fx', args: { layer: where, effect: n(b), param } }
        }
        case 'crossfade': case 'master': case 'bpm': case 'tap': return { action: name, args: {} }
        default: return null
    }
}

/**
 * The entry a learned message makes for a target, or null if the message is not
 * a control (a note-off, or a button target given a fader still moving).
 * hints.relative(match) → true when the device's sheet says that control is an encoder.
 */
export const learnEntry = (target, message, hints = {}) => {
    const control = controlOf(message)
    if (!target || !control || (control.kind === 'note' && !control.press)) return null
    const match = { kind: control.kind, number: control.number, channel: control.channel }
    const spec = ACTIONS[target.action]
    const relative = Boolean(spec?.relativeOk && control.kind === 'cc' && hints.relative?.(match))
    return { match, action: target.action, args: { ...target.args }, ...(relative ? { relative: true } : {}) }
}

// --- LED feedback ------------------------------------------------------------------

/** Which colour (red | amber | green | null) a bound control shows for this deck. */
export const ledColour = (deck, entry, ctx = {}) => {
    const base = normalizeDeck(deck)
    const args = entry.args || {}
    const layer = layerAt(base, args.layer)
    switch (entry.action) {
        case 'clip':
            if (!layer || !layer.clips[args.column]) return null
            return layer.active === args.column ? 'green' : 'amber'
        case 'column': {
            if (!isInt(args.column) || args.column >= base.columns) return null
            const has = base.layers.filter((item) => item.clips[args.column])
            if (!has.length) return null
            return has.every((item) => item.active === args.column) ? 'green' : 'amber'
        }
        case 'bypass': return layer?.bypass ? 'red' : null
        case 'solo': return layer?.solo ? 'green' : null
        case 'side': return layer?.side === 'a' ? 'amber' : layer?.side === 'b' ? 'green' : null
        case 'fxToggle': {
            if (!Number.isInteger(ctx.fx?.layer) || !Number.isInteger(args.slot)) return null
            const effect = stackFor(base, ctx.fx.layer)[args.slot]
            return effect ? (effect.on ? 'green' : 'red') : null
        }
        case 'hold': return holdTargets(base, ctx.fx?.layer).some(({ effect }) => effect.on && Number(effect.params.hold) > 0) ? 'amber' : null
        default: return null
    }
}

/**
 * The whole LED picture for a deck: for each bound button the device can light
 * (`ledTable[note] = { red, amber, green }` note numbers), three messages — the
 * wanted colour at velocity 127, the others at 0. [{ channel, note, velocity }].
 */
export const ledsFor = (deck, map, ledTable = {}, channel = 15, ctx = {}) => {
    const out = []
    const seen = new Set()
    for (const entry of map || []) {
        if (entry.match?.kind !== 'note') continue
        const notes = ledTable[entry.match.number]
        if (!notes || seen.has(entry.match.number)) continue
        seen.add(entry.match.number)
        const colour = ledColour(deck, entry, ctx)
        for (const name of ['red', 'amber', 'green']) out.push({ channel, note: notes[name], velocity: name === colour ? 127 : 0 })
    }
    return out
}

/** Only the LED messages that differ from `previous` (a Map note → velocity); updates it. */
export const ledChanges = (leds, previous) => {
    const changed = []
    for (const led of leds) {
        if (previous.get(led.note) === led.velocity) continue
        previous.set(led.note, led.velocity)
        changed.push(led)
    }
    return changed
}

/**
 * LED messages that switch off every lit note the new picture no longer mentions
 * (a button that lost its binding would otherwise keep its last colour). `sent` is the
 * Map note -> velocity that ledChanges keeps; updates it.
 */
export const ledClears = (leds, sent, channel = 15) => {
    const now = new Set(leds.map((led) => led.note))
    const off = []
    for (const [note, velocity] of sent) {
        if (now.has(note) || velocity === 0) continue
        sent.set(note, 0)
        off.push({ channel, note, velocity: 0 })
    }
    return off
}

/** The raw bytes of one LED message: a note-on, velocity 0 = off. */
export const ledBytes = (led) => [0x90 | ((led.channel - 1) & 0x0f), led.note & 0x7f, led.velocity & 0x7f]

/**
 * What a map entry does, in the short words the K2 panel prints on a control:
 * "Layer 2 level", "L1 clip 3", "Bypass L1", "BPM". No entry = "free".
 */
export const describeAction = (entry, ctx = {}) => {
    if (!entry?.action) return 'free'
    const args = entry.args || {}
    const layer = Number.isInteger(args.layer) && args.layer >= 0 ? args.layer + 1 : 0
    const column = Number.isInteger(args.column) ? args.column + 1 : 0
    switch (entry.action) {
        case 'opacity': return layer ? `Layer ${layer} level` : 'Layer level'
        case 'blend': return layer ? `L${layer} blend` : 'Blend'
        case 'clipSpeed': return layer ? `L${layer} speed` : 'Clip speed'
        case 'bypass': return layer ? `Bypass L${layer}` : 'Bypass'
        case 'solo': return layer ? `Solo L${layer}` : 'Solo'
        case 'side': return layer ? `L${layer} side A/B` : 'Side A/B'
        case 'clip': return layer && column ? `L${layer} clip ${column}` : 'Clip'
        case 'column': return column ? `Play column ${column}` : 'Play column'
        case 'clearLayer': return layer ? `Clear L${layer}` : 'Clear layer'
        case 'crossfade': return 'Crossfade'
        case 'master': return 'Master'
        case 'bpm': return 'BPM'
        case 'tap': return 'Tap tempo'
        case 'fxToggle': return Number.isInteger(args.slot) ? `FX ${args.slot + 1} on/off` : 'Effect on/off'
        case 'fxLayerNext': return 'Next FX layer'
        case 'fxNext': return 'Next effect'
        case 'hold': return 'Freeze (hold)'
        case 'fx': {
            if (args.layer === undefined && args.effect === undefined && Number.isInteger(ctx.fxEffect)) {
                const name = `FX ${ctx.fxEffect + 1}`
                return args.param === 'mix' ? `${name} MIX` : Number.isInteger(args.param) ? `${name} PARAM ${args.param + 1}` : name
            }
            const scope = args.layer === -1 ? 'Master fx' : layer ? `L${layer} fx` : 'Fx'
            return args.param === 'mix' ? `${scope} mix` : Number.isInteger(args.param) ? `${scope} param ${args.param + 1}` : scope
        }
        default: return 'free'
    }
}
