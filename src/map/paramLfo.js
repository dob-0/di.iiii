// LFO ON A SETTING — Resolume's BPM-synced parameter animation, on the mapper.
//
// Any number setting (an effect's, a clip's own, the clip's opacity) can
// swing by itself in time with the desk's beat (deskBeat.js). What is stored
// is the same shape the laser desk uses (laserLook.cjs, 2026-11-07), so a
// person who learned one desk knows the other:
//
//   lfo = { [settingKey]: { on, wave, beats, depth } }
//
//   wave   sine · tri · saw · square · random — every one is at its TOP on
//          beat one of its round, so a hit lands on the one
//   beats  how long one round is, in beats (¼ … 64)
//   depth  how far it swings, as a part of the whole slider (0 … 1)
//
// Where it swings: a stretch of the slider `depth` long that holds the
// slider's own value — centred on it when there is room, pushed inwards at
// the ends — so a swing is never flattened against an end, and a setting
// pulled right up to its top swings down from there (an Invert at 1 with
// depth 1 goes 1 → 0 → 1).
//
// What never takes an LFO: settings that are themselves a RATE (a hue's
// speed, a spin, a strobe's Hz). Their phase is rate × the wall clock, so
// moving the rate would throw the picture about rather than swing it; the
// effect spec marks them `rate: true`. Choices, colours and switches stay put.

import { paramValue } from './visualParams.js'

export const LFO_WAVES = [
    ['sine', 'Sine'],
    ['tri', 'Triangle'],
    ['saw', 'Saw'],
    ['square', 'Square'],
    ['random', 'Random']
]
export const LFO_BEATS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]
export const LFO_DEFAULT = Object.freeze({ on: true, wave: 'sine', beats: 4, depth: 0.5 })

const WAVE_IDS = new Set(LFO_WAVES.map(([id]) => id))
const TAU = Math.PI * 2
const frac = (value) => value - Math.floor(value)
const hash = (n) => frac(Math.sin(n * 127.1) * 43758.5453)

export const beatsLabel = (beats) => {
    if (beats === 0.25) return '¼'
    if (beats === 0.5) return '½'
    return String(beats)
}

// A setting's own random seed, so two random LFOs never move together.
const seedOf = (key = '') => {
    let n = 7
    for (let index = 0; index < key.length; index += 1) n = ((n * 31) + key.charCodeAt(index)) % 100003
    return n
}

export const readLfo = (raw) => {
    if (!raw || typeof raw !== 'object') return null
    const beats = Number(raw.beats)
    const depth = Number(raw.depth)
    return {
        on: raw.on === true,
        wave: WAVE_IDS.has(raw.wave) ? raw.wave : 'sine',
        beats: Number.isFinite(beats) ? Math.min(64, Math.max(0.0625, beats)) : LFO_DEFAULT.beats,
        depth: Number.isFinite(depth) ? Math.min(1, Math.max(0, depth)) : LFO_DEFAULT.depth
    }
}

export const lfoMoving = (raw) => {
    const lfo = readLfo(raw)
    return Boolean(lfo?.on && lfo.depth > 0)
}

// A clip's own settings carry no `rate` flag, so a speed is known by its
// name too: the op-art loops scale their whole pattern time by "Speed"
// (bar-show op-art.js uSB), and "Wave speed" is a speed as well.
const RATE_NAME = /\b(speed|rate|spin|bpm|tempo)\b/i
export const takesLfo = (spec) => Boolean(spec)
    && (spec.kind === 'number' || spec.type === 'number')
    && !spec.rate
    && !RATE_NAME.test(`${spec.label || ''} ${spec.key || ''}`)

// 0 … 1, where in its swing the setting is at `beat`.
export const lfoWave = (wave, beat, beats, key = '') => {
    const round = beat / Math.max(0.0625, beats)
    const phase = frac(round)
    switch (wave) {
        case 'tri': return 1 - (2 * Math.min(phase, 1 - phase))
        case 'saw': return 1 - phase
        case 'square': return phase < 0.5 ? 1 : 0
        case 'random': return hash(Math.floor(round) + seedOf(key))
        default: return 0.5 + (0.5 * Math.cos(phase * TAU))
    }
}

// The stretch of the slider [low, high] the setting swings over.
export const lfoRange = (spec, value, raw) => {
    const lfo = readLfo(raw)
    const min = Number(spec.min ?? 0)
    const max = Number(spec.max ?? 1)
    const span = Math.max(0, max - min)
    const reach = (lfo ? lfo.depth : 0) * span
    const at = Math.min(max, Math.max(min, Number(value)))
    const low = Math.min(Math.max(at - (reach / 2), min), max - reach)
    return [low, low + reach]
}

export const lfoValueAt = (spec, value, raw, beat, key = spec?.key || '') => {
    const lfo = readLfo(raw)
    if (!lfo?.on || !(lfo.depth > 0) || !takesLfo(spec)) return value
    const [low, high] = lfoRange(spec, value, lfo)
    return low + ((high - low) * lfoWave(lfo.wave, beat, lfo.beats, key))
}

// A whole set of values with their LFOs applied: `specs` are the settings'
// specs (each with a `key`), `values` what they are set to.
export const valuesAt = (specs, values, lfoMap, beat) => {
    if (!lfoMap || typeof lfoMap !== 'object') return values
    let out = values
    specs.forEach((spec) => {
        const raw = lfoMap[spec.key]
        if (!lfoMoving(raw) || !takesLfo(spec)) return
        if (out === values) out = { ...values }
        out[spec.key] = lfoValueAt(spec, values[spec.key], raw, beat, spec.key)
    })
    return out
}

export const anyLfoMoving = (lfoMap) => Boolean(lfoMap) && typeof lfoMap === 'object'
    && Object.values(lfoMap).some(lfoMoving)

// The map with one setting's LFO changed (null removes it). An empty map is
// stored as nothing (the schema drops `{}`), but it is still sent as `{}` so
// a patch can clear the last one.
export const withLfo = (lfoMap, key, next) => {
    const out = { ...(lfoMap && typeof lfoMap === 'object' ? lfoMap : {}) }
    if (next) out[key] = readLfo(next)
    else delete out[key]
    return out
}

// --- a clip's own moving parts: its opacity and its settings ---------------

export const OPACITY_SPEC = Object.freeze({ key: 'opacity', label: 'Opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 })

const settingSpecs = (visual) => (Array.isArray(visual?.paramSpec) ? visual.paramSpec : [])
    .map((entry) => ({ ...entry, kind: entry.type }))

// Every setting the clip has, at its value (its default when unset), so a
// page always hears the whole set — an LFO stopping puts back the real value.
export const clipParams = (visual) => {
    const specs = settingSpecs(visual)
    if (!specs.length) return visual?.params || null
    const out = {}
    specs.forEach((entry) => { out[entry.key] = paramValue(entry, visual.params || {}) })
    return out
}

// What of a clip moves by itself, or null when nothing does.
export const clipMotion = (visual) => {
    const lfo = visual?.lfo
    if (!anyLfoMoving(lfo)) return null
    const specs = settingSpecs(visual)
    const opacity = typeof visual.opacity === 'number' ? visual.opacity : 1
    const still = clipParams(visual)
    const movesOpacity = lfoMoving(lfo.opacity)
    const movesParams = specs.some((spec) => takesLfo(spec) && lfoMoving(lfo[spec.key]))
    return {
        movesOpacity,
        movesParams,
        opacityAt: (beat) => (movesOpacity ? lfoValueAt(OPACITY_SPEC, opacity, lfo.opacity, beat, 'opacity') : opacity),
        paramsAt: (beat) => (movesParams ? valuesAt(specs, still, lfo, beat) : still)
    }
}
