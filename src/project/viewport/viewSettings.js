// VIEW SETTINGS — every number that decides how the camera moves and how a scene is drawn for ONE viewer, in one list the panel
// draws from and the camera reads (owner, 2026-10-08: "I want all settings accessible — it feels so unprofessional; I want unlimited
// zoom"). Before this the speeds, smoothing, distance limits, auto depth and near/far were literals inside StudioViewport.jsx and
// SmartView.jsx. Per browser (localStorage), never written to the project; Reset restores the shipped values.
//
// Why these and why these names: Blender Preferences > Navigation (zoom to mouse position, auto depth, orbit/pan/zoom speeds) and
// Unreal's viewport Camera Speed are the established places a pro tool lets a person tune navigation. Unlimited zoom is
// camera-controls' own `infinityDolly` ("keep the distance and push the target instead" once min/max distance is reached) with
// maxDistance = Infinity; a camera that can leave a 100 m hall for 5 km needs its clip planes scaled with the distance (clipFor).
import { useSyncExternalStore } from 'react'

export const VIEW_SETTINGS = Object.freeze([
    // Names and grouping follow the Blender 5.2 manual: Preferences > Navigation (Orbit & Pan, Zoom) and the 3D Viewport sidebar > View
    // (Clip Start / End). The manual gives no numeric defaults; the defaults below are di.iiii's, measured on its own scenes.
    { key: 'orbitSpeed', group: 'Orbit & Pan', label: 'Orbit Sensitivity', type: 'range', min: 0.1, max: 3, step: 0.05, def: 1, hint: 'Left-drag turning speed' },
    { key: 'panSpeed', group: 'Orbit & Pan', label: 'Pan Speed', type: 'range', min: 0.1, max: 5, step: 0.05, def: 1, hint: 'Right-drag sideways speed' },
    { key: 'smoothViewMs', group: 'Orbit & Pan', label: 'Smooth View', type: 'range', min: 0, max: 800, step: 10, def: 150, unit: 'ms', hint: 'Animation time of a move; 0 = the camera follows the mouse exactly' },
    { key: 'autoDepth', group: 'Orbit & Pan', label: 'Auto Depth', type: 'toggle', def: true, hint: 'The surface under the pointer sets the pace of pan and zoom' },
    { key: 'zoomToCursor', group: 'Zoom', label: 'Zoom to Mouse Position', type: 'toggle', def: true, hint: 'Off = zoom toward the middle of the view' },
    { key: 'zoomSpeed', group: 'Zoom', label: 'Zoom Speed', type: 'range', min: 0.1, max: 5, step: 0.05, def: 1, hint: 'How far one scroll notch moves you' },
    { key: 'invertWheel', group: 'Zoom', label: 'Invert Zoom Direction (Wheel)', type: 'toggle', def: false },
    { key: 'unlimitedZoom', group: 'Zoom', label: 'Dolly through (never stops)', type: 'toggle', def: true, hint: 'Blender\'s Dolly View: scrolling in at the closest distance keeps moving you through the scene. Inside mode keeps the camera in the building' },
    { key: 'minDistance', group: 'Zoom', label: 'Closest distance', type: 'range', min: 0.01, max: 5, step: 0.01, def: 0.35, unit: 'm' },
    { key: 'clipStart', group: 'Clip', label: 'Clip Start', type: 'range', min: 0.01, max: 5, step: 0.01, def: 0.05, unit: 'm', hint: 'Nothing nearer than this is drawn' },
    { key: 'clipEnd', group: 'Clip', label: 'Clip End', type: 'range', min: 100, max: 1000000, step: 100, def: 20000, unit: 'm', hint: 'Nothing farther is drawn. The farthest you can zoom out is a quarter of it' },
    { key: 'autoClip', group: 'Clip', label: 'Clip follows the distance', type: 'toggle', def: true, hint: 'Near and far move with the zoom so depth keeps its precision (the manual warns a huge fixed range causes artifacts)' }
])

export const VIEW_SETTING_DEFAULTS = Object.freeze(Object.fromEntries(VIEW_SETTINGS.map((s) => [s.key, s.def])))
export const VIEW_SETTINGS_KEY = 'di.view.settings'

const byKey = Object.fromEntries(VIEW_SETTINGS.map((s) => [s.key, s]))

/** One value, made valid: clamped to its range, a toggle to a boolean, junk to the default. */
export const settingOf = (key, value) => {
    const spec = byKey[key]
    if (!spec) return undefined
    if (spec.type === 'toggle') return typeof value === 'boolean' ? value : spec.def
    const n = Number(value)
    if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return spec.def
    return Math.min(spec.max, Math.max(spec.min, n))
}

/** A stored object, made valid key by key (unknown keys dropped, missing ones defaulted). */
export const settingsOf = (raw) => {
    const src = raw && typeof raw === 'object' ? raw : {}
    return Object.fromEntries(VIEW_SETTINGS.map((s) => [s.key, settingOf(s.key, src[s.key])]))
}

/**
 * The camera-controls props these settings ask for. `preset` is the navigation preset (mappings.js): its own dollyToCursor still has to
 * be on. truckSpeed's shipped value is camera-controls' default 2; dollySpeed and the rotate speeds default 1; a negative dollySpeed
 * inverts the wheel. The farthest zoom-out is a quarter of Clip End, always finite: "unlimited" is about never stopping going IN.
 */
export const controlsPropsFor = (s, preset = {}) => ({
    dollySpeed: s.zoomSpeed * (s.invertWheel ? -1 : 1),
    truckSpeed: 2 * s.panSpeed,
    azimuthRotateSpeed: s.orbitSpeed,
    polarRotateSpeed: s.orbitSpeed,
    smoothTime: s.smoothViewMs / 1000,
    dollyToCursor: Boolean(s.zoomToCursor && preset.dollyToCursor !== false),
    // camera-controls' infinityDolly acts at BOTH ends (it also pushes the target away once maxDistance is reached, which flew the camera
    // 100 km out in a test). "Dolly through" is about going IN, so the hook (useCameraNavigation) turns it on per wheel notch, zoom-in only.
    infinityDolly: false,
    minDistance: s.minDistance,
    maxDistance: Math.max(s.clipEnd / 4, s.minDistance + 1)
})

/** Near/far for a camera `distance` metres from its target. Fixed at Clip Start / Clip End, or (autoClip) following the distance inside them. */
export const clipFor = (distance, s = VIEW_SETTING_DEFAULTS, { baseFar = 400 } = {}) => {
    if (!s.autoClip) return { near: s.clipStart, far: s.clipEnd }
    const d = Number.isFinite(distance) && distance > 0 ? distance : 1
    return { near: Math.min(100, Math.max(s.clipStart, d * 0.0005)), far: Math.min(s.clipEnd, Math.max(baseFar, d * 4)) }
}

const read = () => {
    try { return settingsOf(JSON.parse(window.localStorage.getItem(VIEW_SETTINGS_KEY) || 'null')) } catch { return settingsOf(null) }
}
const write = (s) => {
    try { window.localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(s)) } catch { /* private window: lives for this page only */ }
}

let state = null
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn())
export const getViewSettings = () => (state ||= read())
export const setViewSetting = (key, value) => {
    if (!byKey[key]) return
    const next = settingOf(key, value)
    if (getViewSettings()[key] === next) return
    state = { ...getViewSettings(), [key]: next }
    write(state)
    emit()
}
export const resetViewSettings = () => { state = settingsOf(null); write(state); emit() }
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
export const useViewSettings = () => useSyncExternalStore(subscribe, getViewSettings, getViewSettings)
export const resetViewSettingsForTests = () => { state = null; listeners.clear() }
