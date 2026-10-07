// The viewer's camera settings for Studio, kept per device in localStorage (a
// convenience, not shared state — same rule as preference.js). Every storage
// touch is in try/catch: blocked storage must still give the defaults.
//
// What lives here is HOW the camera moves (speeds, where it orbits). What the
// camera SEES — the lens (field of view) — belongs to the view and is saved with
// it by "save view", so it is not stored here.
//
// Lens maths: the full-frame convention photographers and Blender's camera panel
// use, 36 x 24 mm sensor, applied to the VERTICAL angle (three.js `fov` is vertical):
//   fov = 2 * atan(12 / focal_mm)         (ISO 12232 / any optics text, thin lens)
import { useCallback, useEffect, useState } from 'react'

export const CAMERA_SETTINGS_KEY = 'di.studio.camera'
export const CAMERA_SETTINGS_EVENT = 'di:studio-camera-settings-change'

export const DEFAULT_CAMERA_SETTINGS = Object.freeze({
    // Multipliers on camera-controls' own speeds. 1 = the baseline below.
    zoomSpeed: 1,
    orbitSpeed: 1,
    panSpeed: 1,
    // Orbit and zoom around the surface under the pointer, not the point the view
    // was last aimed at. Off, a zoom-out then a drag swings the whole room around a
    // point that may be a hundred metres away.
    pointerPivot: true,
    // Zooming out glides up instead of through the floor: the camera never goes
    // below the floor plane (y = 0). Off for work that is meant to be seen from below.
    keepAboveFloor: true,
})

export const SPEED_RANGE = Object.freeze({ min: 0.2, max: 3 })

// camera-controls baseline per 1.0 multiplier. Measured on the MOXIR hall
// (2026-10-07, 1700x950, wheel notch = deltaY 100): its default dollySpeed 1 changed
// the distance by x1.29 per notch (x13.8 for ten) and the whole room left the
// frustum within ten notches. 0.6 is x1.17 per notch (x4.6 for ten).
export const BASE_SPEED = Object.freeze({ dolly: 0.6, orbit: 1, truck: 1 })

// Perspective lens limits. Below 20 degrees Studio treats the view as orthographic
// (StudioViewport `isOrtho`), so the perspective range stays above it.
export const FOV_RANGE = Object.freeze({ min: 22, max: 110 })
export const LENS_PRESETS_MM = Object.freeze([15, 24, 35, 50])

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback)

export function normalizeCameraSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {}
    const speed = (v, d) => clamp(num(v, d), SPEED_RANGE.min, SPEED_RANGE.max)
    return {
        zoomSpeed: speed(r.zoomSpeed, DEFAULT_CAMERA_SETTINGS.zoomSpeed),
        orbitSpeed: speed(r.orbitSpeed, DEFAULT_CAMERA_SETTINGS.orbitSpeed),
        panSpeed: speed(r.panSpeed, DEFAULT_CAMERA_SETTINGS.panSpeed),
        pointerPivot: typeof r.pointerPivot === 'boolean' ? r.pointerPivot : DEFAULT_CAMERA_SETTINGS.pointerPivot,
        keepAboveFloor: typeof r.keepAboveFloor === 'boolean' ? r.keepAboveFloor : DEFAULT_CAMERA_SETTINGS.keepAboveFloor,
    }
}

export function controlSpeedsFor(settings) {
    const s = normalizeCameraSettings(settings)
    return {
        dollySpeed: BASE_SPEED.dolly * s.zoomSpeed,
        azimuthRotateSpeed: BASE_SPEED.orbit * s.orbitSpeed,
        polarRotateSpeed: BASE_SPEED.orbit * s.orbitSpeed,
        truckSpeed: BASE_SPEED.truck * s.panSpeed,
    }
}

export const fovToLensMm = (fov) => 12 / Math.tan((clamp(fov, 1, 170) * Math.PI) / 360)
export const lensMmToFov = (mm) => (2 * Math.atan(12 / Math.max(1, mm)) * 180) / Math.PI
export const clampFov = (fov) => clamp(num(fov, 50), FOV_RANGE.min, FOV_RANGE.max)

// Clip planes that follow how far out the camera is. A fixed far plane made the
// whole room vanish when you zoomed out past it (the saved view said far 400 and
// the zoom limit was 500: black screen, measured 2026-10-07); a fixed near plane
// z-fights at distance. Near is a small fraction of the distance to the thing in
// focus, far grows with it. `authoredFar` is the project's own value and is only
// ever raised, never lowered.
export function clipPlanesFor(distance, authoredFar = 0) {
    const d = Number.isFinite(distance) && distance > 0 ? distance : 10
    return {
        near: clamp(d / 500, 0.02, 2),
        far: clamp(Math.max(num(authoredFar, 0), d * 3 + 300), 400, 20000),
    }
}

// The largest polar angle (radians from straight up) at which a camera that orbits
// `targetY` at `distance` stays above the floor. Pi = no limit.
export const FLOOR_Y = 0
export const FLOOR_CLEARANCE = 0.15
export function maxPolarAboveFloor(targetY, distance) {
    if (!Number.isFinite(targetY) || !Number.isFinite(distance) || distance <= 1e-6) return Math.PI
    const ratio = (FLOOR_Y + FLOOR_CLEARANCE - targetY) / distance
    return Math.min(Math.PI, Math.max(0.05, Math.acos(Math.max(-1, Math.min(1, ratio)))))
}

function storage() {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null
    } catch {
        return null
    }
}

// Page-lifetime copy for when storage throws.
const memory = { settings: null }

export function getCameraSettings() {
    if (memory.settings) return memory.settings
    try {
        const raw = storage()?.getItem(CAMERA_SETTINGS_KEY)
        return normalizeCameraSettings(raw ? JSON.parse(raw) : null)
    } catch {
        return normalizeCameraSettings(null)
    }
}

export function setCameraSettings(patch) {
    const next = normalizeCameraSettings({ ...getCameraSettings(), ...patch })
    try {
        storage()?.setItem(CAMERA_SETTINGS_KEY, JSON.stringify(next))
        memory.settings = null
    } catch {
        memory.settings = next
    }
    try {
        window.dispatchEvent(new Event(CAMERA_SETTINGS_EVENT))
    } catch {
        // no window (tests/SSR)
    }
    return next
}

export function resetCameraSettingsMemory() {
    memory.settings = null
}

export function useCameraSettings() {
    const [settings, setSettings] = useState(getCameraSettings)
    useEffect(() => {
        const sync = () => setSettings(getCameraSettings())
        const syncFromStorage = () => { resetCameraSettingsMemory(); sync() }
        window.addEventListener(CAMERA_SETTINGS_EVENT, sync)
        window.addEventListener('storage', syncFromStorage)
        return () => {
            window.removeEventListener(CAMERA_SETTINGS_EVENT, sync)
            window.removeEventListener('storage', syncFromStorage)
        }
    }, [])
    const update = useCallback((patch) => setCameraSettings(patch), [])
    const reset = useCallback(() => setCameraSettings(DEFAULT_CAMERA_SETTINGS), [])
    return { settings, update, reset }
}
