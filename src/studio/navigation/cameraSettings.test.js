import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    CAMERA_SETTINGS_KEY, DEFAULT_CAMERA_SETTINGS, FOV_RANGE, LENS_PRESETS_MM, SPEED_RANGE,
    clampFov, clipPlanesFor, controlSpeedsFor, fovToLensMm, getCameraSettings, lensMmToFov,
    maxPolarAboveFloor, normalizeCameraSettings, resetCameraSettingsMemory, setCameraSettings,
} from './cameraSettings.js'

beforeEach(() => {
    resetCameraSettingsMemory()
    try { window.localStorage.clear() } catch { /* noop */ }
})
afterEach(() => vi.restoreAllMocks())

describe('lens maths (full-frame, vertical)', () => {
    it('50 mm is 27 degrees, 24 mm is 53.1, 35 mm is 37.8', () => {
        expect(lensMmToFov(50)).toBeCloseTo(27.0, 1)
        expect(lensMmToFov(24)).toBeCloseTo(53.13, 1)
        expect(lensMmToFov(35)).toBeCloseTo(37.85, 1)
    })
    it('fov -> mm -> fov round-trips', () => {
        for (const fov of [30, 55, 90]) expect(lensMmToFov(fovToLensMm(fov))).toBeCloseTo(fov, 6)
    })
    it('every lens chip stays a perspective view (>= the ortho threshold of 20 degrees)', () => {
        for (const mm of LENS_PRESETS_MM) expect(lensMmToFov(mm)).toBeGreaterThanOrEqual(FOV_RANGE.min)
    })
    it('clampFov holds the range and junk gives 50', () => {
        expect(clampFov(3)).toBe(FOV_RANGE.min)
        expect(clampFov(400)).toBe(FOV_RANGE.max)
        expect(clampFov('abc')).toBe(50)
    })
})

describe('clip planes follow the distance', () => {
    it('the MOXIR failure: at the old 500 m zoom limit the far plane clears the room', () => {
        // saved view far was 400 and the camera stopped at 500: black screen.
        expect(clipPlanesFor(500, 400).far).toBeGreaterThan(500 + 100)
    })
    it('never lowers an authored far, never exceeds 20 km', () => {
        expect(clipPlanesFor(5, 5000).far).toBe(5000)
        expect(clipPlanesFor(1e9, 0).far).toBe(20000)
    })
    it('near grows with distance but stays inside 0.02..2 m', () => {
        expect(clipPlanesFor(0.1).near).toBe(0.02)
        expect(clipPlanesFor(100).near).toBeCloseTo(0.2, 6)
        expect(clipPlanesFor(5000).near).toBe(2)
    })
    it('depth ratio far/near stays under 1e4 for any distance a user can reach (z-fight guard)', () => {
        for (const d of [0.05, 1, 17, 80, 500, 1500]) {
            const { near, far } = clipPlanesFor(d, 400)
            expect(far / near).toBeLessThan(1e5)
        }
    })
    it('bad distance falls back instead of NaN', () => {
        const { near, far } = clipPlanesFor(NaN)
        expect(Number.isFinite(near) && Number.isFinite(far)).toBe(true)
    })
})

describe('settings', () => {
    it('defaults', () => {
        expect(getCameraSettings()).toEqual(DEFAULT_CAMERA_SETTINGS)
    })
    it('round-trips and clamps junk', () => {
        const next = setCameraSettings({ zoomSpeed: 99, orbitSpeed: 'x', panSpeed: 0.5, pointerPivot: false })
        expect(next).toEqual({ zoomSpeed: SPEED_RANGE.max, orbitSpeed: 1, panSpeed: 0.5, pointerPivot: false, keepAboveFloor: true })
        expect(JSON.parse(window.localStorage.getItem(CAMERA_SETTINGS_KEY))).toEqual(next)
        expect(getCameraSettings()).toEqual(next)
    })
    it('corrupt stored JSON gives defaults', () => {
        window.localStorage.setItem(CAMERA_SETTINGS_KEY, '{nope')
        expect(getCameraSettings()).toEqual(DEFAULT_CAMERA_SETTINGS)
    })
    it('storage that throws never throws out, and the choice holds for the page', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        expect(() => setCameraSettings({ zoomSpeed: 2 })).not.toThrow()
        expect(getCameraSettings().zoomSpeed).toBe(2)
    })
    it('speeds map onto camera-controls props', () => {
        const s = controlSpeedsFor({ zoomSpeed: 2, orbitSpeed: 0.5, panSpeed: 1 })
        expect(s.dollySpeed).toBeCloseTo(1.2, 6)
        expect(s.azimuthRotateSpeed).toBe(0.5)
        expect(s.polarRotateSpeed).toBe(0.5)
        expect(s.truckSpeed).toBe(1)
    })
    it('normalize tolerates null', () => {
        expect(normalizeCameraSettings(null)).toEqual(DEFAULT_CAMERA_SETTINGS)
    })
})

describe('keep above the floor', () => {
    const camY = (targetY, dist) => targetY + dist * Math.cos(maxPolarAboveFloor(targetY, dist))
    it('the camera at the limit sits at the floor clearance for any distance', () => {
        for (const d of [6, 17, 80, 400]) expect(camY(5.2, d)).toBeCloseTo(0.15, 6)
    })
    it('a target near the floor leaves almost the whole upper half free', () => {
        expect(maxPolarAboveFloor(0.15, 10)).toBeCloseTo(Math.PI / 2, 6)
    })
    it('a camera that can never reach the floor is not limited', () => {
        expect(maxPolarAboveFloor(500, 10)).toBe(Math.PI)
    })
    it('a target below the floor is limited to the upper cap, never NaN', () => {
        const v = maxPolarAboveFloor(-3, 2)
        expect(Number.isFinite(v) && v >= 0.05).toBe(true)
    })
    it('junk gives no limit', () => {
        expect(maxPolarAboveFloor(NaN, 5)).toBe(Math.PI)
        expect(maxPolarAboveFloor(1, 0)).toBe(Math.PI)
    })
})
