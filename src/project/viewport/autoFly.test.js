import { describe, expect, it } from 'vitest'
import { checkFlight, flightEnvelope, flightPath, flightPois, sampleFlight, FLIGHT_DEFAULTS } from './autoFly.js'

// A club hall like computeRoomFrame returns it: 36 × 11 × 24 m, roof cut at 11 m.
const frame = { bounds: { min: [-18, 0, -12], max: [18, 14, 12] }, floorY: 0, roofCut: 11, roofTop: 14, center: [0, 7, 0], radius: 25 }
const scene = { stageBox: { min: [10, 0, -3], max: [16, 1.2, 3] }, rigBox: { min: [-8, 7.5, -6], max: [8, 9, 6] } }
const small = { bounds: { min: [0, 0, 0], max: [8, 5, 6] }, floorY: 0, roofCut: 4.5, roofTop: 5, center: [4, 2.5, 3], radius: 5 }
const cases = [
    ['hall with scene points', frame, flightPois(frame, scene)],
    ['hall, frame alone', frame, null],
    ['small room, frame alone', small, null]
]

describe.each(cases)('flightPath: %s', (_name, fr, pois) => {
    const path = flightPath(fr, pois)
    const c = checkFlight(path, fr)

    it('has every sample inside the frame, margin kept, above floor + 1.2 m', () => {
        expect(c.outside).toBe(0)
        expect(c.floorMin).toBeGreaterThanOrEqual(FLIGHT_DEFAULTS.minHeight - 1e-6)
        expect(c.wallMin).toBeGreaterThanOrEqual(Math.min(0.8, 3) - 1e-6)
        expect(c.roofMin).toBeGreaterThanOrEqual(0.8 - 1e-6)
    })
    it('is closed: the last sample runs into the first with no jump', () => {
        const last = path.pts[path.pts.length - 1]
        expect(last.distanceTo(path.pts[0])).toBeLessThan(path.ds * 1.5)
        const a = sampleFlight(path, 0); const b = sampleFlight(path, path.duration)
        expect(Math.hypot(...a.eye.map((v, i) => v - b.eye[i]))).toBeLessThan(1e-6)
    })
    it('is smooth: no sharp corner (turn radius ≥ 0.5 m; speed is curvature-limited) and no jump between samples', () => {
        expect(c.curvatureMax).toBeLessThan(2.0)
        for (let i = 0; i < path.pts.length; i += 1) expect(path.pts[i].distanceTo(path.pts[(i + 1) % path.pts.length])).toBeLessThan(path.ds * 1.6)
    })
    it('keeps speed inside the profile and bank at or under 25°', () => {
        expect(c.speedMax).toBeLessThanOrEqual(6 + 1e-9)
        expect(c.speedMin).toBeGreaterThan(1.4)
        expect(c.rollMaxDeg).toBeLessThanOrEqual(25 + 1e-6)
        // no speed jump between neighbouring samples (acceleration bounded: 5 m/s² + smoothing slack)
        for (let i = 0; i < path.speed.length; i += 1) {
            const j = (i + 1) % path.speed.length
            const a = Math.abs(path.speed[j] ** 2 - path.speed[i] ** 2) / (2 * path.ds)
            expect(a).toBeLessThan(5 * 1.5)
        }
    })
    it('samples any time: eye inside the envelope, look-ahead on the path, loops', () => {
        const env = flightEnvelope(fr)
        for (let t = 0; t < path.duration * 2; t += path.duration / 97) {
            const s = sampleFlight(path, t)
            for (const k of [0, 1, 2]) {
                expect(s.eye[k]).toBeGreaterThanOrEqual(env.min[k] - 1e-6)
                expect(s.eye[k]).toBeLessThanOrEqual(env.max[k] + 1e-6)
            }
            expect(Number.isFinite(s.roll)).toBe(true)
        }
        expect(sampleFlight(path, 1.5).eye).toEqual(sampleFlight(path, 1.5 + path.duration).eye.map((v, i) => (Math.abs(v - sampleFlight(path, 1.5).eye[i]) < 1e-6 ? sampleFlight(path, 1.5).eye[i] : v)))
    })
})

describe('flightPath details', () => {
    it('does the low pass at 1.5–2.5 m and climbs under (not into) the truss', () => {
        const pois = flightPois(frame, scene)
        const path = flightPath(frame, pois)
        const ys = path.pts.map((q) => q.y)
        expect(ys.some((y) => y >= 1.5 && y <= 2.5)).toBe(true)
        // the rig's lowest member is 7.5 m: no sample is inside the rig box
        const { min, max } = scene.rigBox
        const hit = path.pts.some((q) => q.x > min[0] && q.x < max[0] && q.z > min[2] && q.z < max[2] && q.y > min[1] - 0.3 && q.y < max[1])
        expect(hit).toBe(false)
    })
    it('is deterministic and returns null with no frame', () => {
        expect(flightPath(frame, null).duration).toBe(flightPath(frame, null).duration)
        expect(flightPath(null)).toBeNull()
    })
})
