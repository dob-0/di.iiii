// Per-viewer look settings for walk mode: the mouse sensitivity in game units,
// field of view, invert-Y and head bob. One small store, no React in here —
// the Walker's input handlers read it on every event (`getLookRuntime`), the
// camera setup reads `getLookFov()`, the movement loop reads `getHeadBob()`,
// and the panel (LookSettingsPanel.jsx) writes it.
//
// Kept in this viewer's browser only (localStorage, key LOOK_STORAGE_KEY).
// Storage can throw (private window, blocked site data) or come back empty;
// every read and write is wrapped and the defaults always work without it.

import {
    DEFAULT_GAME,
    GAME_PRESETS,
    cmPer360,
    presetYaw,
    radiansPerCount
} from './lookSensitivity.js'
import {
    DEFAULT_LOOK_DPI,
    DEFAULT_LOOK_FOV,
    DEFAULT_LOOK_SENS,
    LOOK_FOV_MAX,
    LOOK_FOV_MIN
} from './walkModeConfig.js'

export const LOOK_STORAGE_KEY = 'di.iiii.look.v1'

export const LOOK_DEFAULTS = Object.freeze({
    game: DEFAULT_GAME,
    sens: DEFAULT_LOOK_SENS,
    dpi: DEFAULT_LOOK_DPI,
    fov: DEFAULT_LOOK_FOV,
    invertY: false,
    headBob: true
})

const finiteIn = (value, min, max, fallback) => {
    const n = typeof value === 'string' ? Number(value) : value
    if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, n))
}

// Anything read back from storage or typed into the panel goes through here:
// unknown games fall back, numbers are clamped to ranges a real setup can
// have (100–32000 DPI is the span of shipping mouse sensors).
export function sanitizeLookSettings(input) {
    const src = input && typeof input === 'object' ? input : {}
    return {
        game: Object.hasOwn(GAME_PRESETS, src.game) ? src.game : LOOK_DEFAULTS.game,
        sens: finiteIn(src.sens, 0.001, 1000, LOOK_DEFAULTS.sens),
        dpi: Math.round(finiteIn(src.dpi, 100, 32000, LOOK_DEFAULTS.dpi)),
        fov: finiteIn(src.fov, LOOK_FOV_MIN, LOOK_FOV_MAX, LOOK_DEFAULTS.fov),
        invertY: typeof src.invertY === 'boolean' ? src.invertY : LOOK_DEFAULTS.invertY,
        headBob: typeof src.headBob === 'boolean' ? src.headBob : LOOK_DEFAULTS.headBob
    }
}

function defaultStorage() {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null
    } catch {
        return null
    }
}

export function loadLookSettings(storage = defaultStorage()) {
    try {
        const raw = storage?.getItem(LOOK_STORAGE_KEY)
        return sanitizeLookSettings(raw ? JSON.parse(raw) : null)
    } catch {
        return { ...LOOK_DEFAULTS }
    }
}

function persist(settings, storage = defaultStorage()) {
    try {
        storage?.setItem(LOOK_STORAGE_KEY, JSON.stringify(settings))
    } catch {
        // Private window / quota / blocked storage: the setting still applies
        // for this visit, it just is not remembered.
    }
}

// Physical feel relative to the default: 2 = the look turns twice as far per
// centimetre of mouse travel as the default does. Drag-look, trackpad and
// touch are tuned in their own units at the default feel and scaled by this,
// so a viewer who slows the mouse down slows the whole family with it.
export function lookFeelScale(settings) {
    const s = sanitizeLookSettings(settings)
    const d = LOOK_DEFAULTS
    return cmPer360(d.sens, presetYaw(d.game), d.dpi) / cmPer360(s.sens, presetYaw(s.game), s.dpi)
}

function derive(settings) {
    return {
        settings,
        radPerCount: radiansPerCount(settings.sens, presetYaw(settings.game)),
        ySign: settings.invertY ? -1 : 1,
        feelScale: lookFeelScale(settings)
    }
}

let current = null
const listeners = new Set()

function ensure() {
    if (!current) current = derive(loadLookSettings())
    return current
}

export function getLookSettings() {
    return ensure().settings
}

// What the input handlers need, precomputed once per change rather than per
// mouse event.
export function getLookRuntime() {
    return ensure()
}

export function setLookSettings(patch) {
    const next = sanitizeLookSettings({ ...ensure().settings, ...patch })
    current = derive(next)
    persist(next)
    for (const fn of listeners) fn(next)
    return next
}

export function resetLookSettings() {
    return setLookSettings({ ...LOOK_DEFAULTS })
}

export function subscribeLookSettings(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

// -- Plain getters for the integrator (camera setup and movement loop) --
// Vertical field of view in degrees, for THREE.PerspectiveCamera.fov.
export function getLookFov() {
    return ensure().settings.fov
}
// Whether the walking head bob is on.
export function getHeadBob() {
    return ensure().settings.headBob
}

// Test seam: forget the cached value so the next read reloads from storage.
export function __resetLookSettingsCacheForTests() {
    current = null
    listeners.clear()
}
