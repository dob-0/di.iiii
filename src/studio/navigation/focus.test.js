import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { FOCUS_SPOT_RANGE, FOCUS_WHOLE_MAX_SIZE, focusPose } from './focus.js'

const cam = (x, y, z) => ({ position: new Vector3(x, y, z), fov: 50, aspect: 1.6 })
const box = (cx, cy, cz, s) => new Box3(new Vector3(cx - s / 2, cy - s / 2, cz - s / 2), new Vector3(cx + s / 2, cy + s / 2, cz + s / 2))

describe('focusPose', () => {
    it('a small thing is framed whole and becomes the target', () => {
        const b = box(2, 1, -3, 1)
        const p = focusPose({ camera: cam(0, 3, 20), hit: new Vector3(2, 1, -2.5), box: b })
        expect(p.whole).toBe(true)
        expect(p.target.distanceTo(new Vector3(2, 1, -3))).toBeLessThan(1e-6)
        // it ends closer than it was, and keeps the side it was seen from
        expect(p.position.distanceTo(p.target)).toBeLessThan(10)
        expect(p.position.z).toBeGreaterThan(p.target.z)
    })
    it('a thing bigger than the limit is not framed whole: the view moves in on the click', () => {
        const hall = box(0, 10, 0, FOCUS_WHOLE_MAX_SIZE * 15)
        const hit = new Vector3(5, 2, -10)
        const p = focusPose({ camera: cam(0, 3, 60), hit, box: hall })
        expect(p.whole).toBe(false)
        expect(p.target.distanceTo(hit)).toBe(0)
        const d = p.position.distanceTo(hit)
        expect(d).toBeGreaterThanOrEqual(FOCUS_SPOT_RANGE[0])
        expect(d).toBeLessThanOrEqual(FOCUS_SPOT_RANGE[1])
        expect(d).toBeLessThan(new Vector3(0, 3, 60).distanceTo(hit))
    })
    it('never moves the camera further away than it was', () => {
        const hit = new Vector3(0, 0, 0)
        const p = focusPose({ camera: cam(0, 0, 1), hit, box: box(0, 0, 0, 100) })
        expect(p.position.distanceTo(hit)).toBeLessThanOrEqual(1 + 1e-9)
    })
    it('no box: spot focus', () => {
        expect(focusPose({ camera: cam(0, 0, 40), hit: new Vector3() }).whole).toBe(false)
    })
    it('a camera exactly on the hit point does not give NaN', () => {
        const p = focusPose({ camera: cam(1, 1, 1), hit: new Vector3(1, 1, 1) })
        expect(Number.isFinite(p.position.x + p.position.y + p.position.z)).toBe(true)
    })
})
