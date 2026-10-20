import { describe, it, expect } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import {
    pointerOnPivotPlane, pivotOnScreen, grabStep, indicesOf, isPlane, snapStepFor, rotateAxis, rotateEulerAroundWorldAxis,
    orbitAroundPivot, scaleStep, angleAround, distanceFrom,
} from './modalMotion.js'

// A camera 10 m in front of the origin, looking at it; a 800×600 canvas at the page's top-left.
const rect = { left: 0, top: 0, width: 800, height: 600 }
const camera = () => {
    const c = new PerspectiveCamera(50, 800 / 600, 0.1, 100)
    c.position.set(0, 0, 10); c.lookAt(0, 0, 0); c.updateMatrixWorld(); c.updateProjectionMatrix()
    return c
}
// world units per pixel on the pivot plane at distance d: 2·d·tan(fov/2) / height
const PER_PX = (2 * 10 * Math.tan((50 / 2) * Math.PI / 180)) / 600

describe('grab: the object stays under the cursor', () => {
    it('100 px to the right on the pivot plane is the geometric distance, to the right, in world x', () => {
        const c = camera(), pivot = [0, 0, 0]
        const a = pointerOnPivotPlane(c, rect, 400, 300, pivot), b = pointerOnPivotPlane(c, rect, 500, 300, pivot)
        const d = grabStep(a, b, null)
        expect(d.x).toBeCloseTo(100 * PER_PX, 3)
        expect(Math.abs(d.y)).toBeLessThan(1e-6); expect(Math.abs(d.z)).toBeLessThan(1e-6)
    })
    it('100 px up is +y; the same pixels on a far pivot move it further (perspective)', () => {
        const c = camera()
        const near = grabStep(pointerOnPivotPlane(c, rect, 400, 300, [0, 0, 0]), pointerOnPivotPlane(c, rect, 400, 200, [0, 0, 0]), null)
        const far = grabStep(pointerOnPivotPlane(c, rect, 400, 300, [0, 0, -10]), pointerOnPivotPlane(c, rect, 400, 200, [0, 0, -10]), null)
        expect(near.y).toBeCloseTo(100 * PER_PX, 3)
        expect(far.y).toBeCloseTo(2 * near.y, 3)
    })
    it('an axis keeps only the projection; the view axis (z here) gets nothing from a screen move', () => {
        const c = camera(), p = [0, 0, 0]
        const a = pointerOnPivotPlane(c, rect, 400, 300, p), b = pointerOnPivotPlane(c, rect, 470, 240, p)
        const x = grabStep(a, b, 'x'), y = grabStep(a, b, 'y'), z = grabStep(a, b, 'z')
        expect(x.x).toBeCloseTo(70 * PER_PX, 3); expect(x.y).toBe(0)
        expect(y.y).toBeCloseTo(60 * PER_PX, 3); expect(y.x).toBe(0)
        expect(z.length()).toBeLessThan(1e-6)
    })
    it('precision (Shift) scales the step by 0.1', () => {
        const c = camera()
        const a = pointerOnPivotPlane(c, rect, 400, 300, [0, 0, 0]), b = pointerOnPivotPlane(c, rect, 500, 300, [0, 0, 0])
        expect(grabStep(a, b, null, 0.1).x).toBeCloseTo(10 * PER_PX, 3)
    })
})

describe('rotate: the angle the pointer turns around the pivot', () => {
    it('the pivot projects to the canvas centre; a quarter turn CCW on screen is +90°', () => {
        const c = camera(), centre = pivotOnScreen(c, rect, [0, 0, 0])
        expect(centre.x).toBeCloseTo(400, 6); expect(centre.y).toBeCloseTo(300, 6)
        const a0 = angleAround(centre, 500, 300), a1 = angleAround(centre, 400, 200)
        expect(a1 - a0).toBeCloseTo(Math.PI / 2, 6)
    })
    it('free rotation turns around the axis toward the viewer; a world axis pointing away is flipped', () => {
        const c = camera()
        expect(rotateAxis(c, null).z).toBeCloseTo(1, 6)
        expect(rotateAxis(c, 'z').z).toBeCloseTo(1, 6)
        c.position.set(0, 0, -10); c.lookAt(0, 0, 0); c.updateMatrixWorld()
        expect(rotateAxis(c, 'z').z).toBeCloseTo(-1, 6)
    })
    it('a 90° world-z turn of an unrotated object reads as rotation.z = 90°, and orbits a satellite around the pivot', () => {
        const r = rotateEulerAroundWorldAxis([0, 0, 0], new Vector3(0, 0, 1), Math.PI / 2)
        expect(r[2]).toBeCloseTo(Math.PI / 2, 6)
        const p = orbitAroundPivot([1, 0, 0], [0, 0, 0], new Vector3(0, 0, 1), Math.PI / 2)
        expect(p[0]).toBeCloseTo(0, 6); expect(p[1]).toBeCloseTo(1, 6)
    })
})

describe('scale: the ratio of the pointer distance to the pivot', () => {
    it('twice the distance is ×2; precision pulls it toward 1; a distance never reads as 0', () => {
        const centre = { x: 400, y: 300 }
        const d0 = distanceFrom(centre, 450, 300), d1 = distanceFrom(centre, 500, 300)
        expect(scaleStep(d0, d1)).toBeCloseTo(2, 6)
        expect(scaleStep(d0, d1, 0.1)).toBeCloseTo(1.1, 6)
        expect(distanceFrom(centre, 400, 300)).toBe(1)
    })
})

describe('a plane constraint keeps two axes (Blender: Shift+X / Y / Z)', () => {
    it('xz drops the y of the delta and keeps x and z; the indices name the two kept', () => {
        const d = grabStep(new Vector3(0, 0, 0), new Vector3(1, 2, 3), 'xz')
        expect([d.x, d.y, d.z]).toEqual([1, 0, 3])
        expect(indicesOf('xz')).toEqual([0, 2])
        expect(indicesOf('y')).toEqual([1])
        expect(indicesOf(null)).toEqual([0, 1, 2])
        expect(isPlane('xz')).toBe(true)
        expect(isPlane('x')).toBe(false)
    })
})

describe('snap increments (Ctrl; Ctrl+Shift a tenth)', () => {
    it('0.5 m / 15° / 0.1, and a tenth of each when fine', () => {
        expect(snapStepFor('translate')).toBe(0.5)
        expect(snapStepFor('translate', true)).toBeCloseTo(0.05, 12)
        expect(snapStepFor('rotate', true)).toBeCloseTo(Math.PI / 120, 12)
        expect(snapStepFor('scale', true)).toBeCloseTo(0.01, 12)
    })
})
