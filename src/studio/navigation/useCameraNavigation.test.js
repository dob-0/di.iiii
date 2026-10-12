import { describe, expect, it, vi } from 'vitest'
import { Group, PerspectiveCamera, Scene } from 'three'
import { Vector3 } from 'three'
import { MAX_UPDATE_DT, WHEEL_STEP_FACTOR, wheelZoomPlan, applyPivot, axisPointAtDepth, capDepth, clampUpdateDt, clampUpdates, entityRoots, resolveMissDepth, settleForGesture, zoomsIn } from './useCameraNavigation.js'

describe('adapter helpers', () => {
    it('applyPivot never moves the orbit point while camera-controls is animating', () => {
        const cc = { active: true, setOrbitPoint: vi.fn(), setLookAt: vi.fn(), camera: new PerspectiveCamera() }
        cc.camera.position.set(0, 0, 10); cc.camera.lookAt(0, 0, 0); cc.camera.updateMatrixWorld(true)
        expect(applyPivot(cc, new Vector3(1, 2, 3))).toBe(false)
        expect(cc.setLookAt).not.toHaveBeenCalled()
        cc.active = false
        expect(applyPivot(cc, new Vector3(3, 4, 0))).toBe(true)
        // the hit is off-axis at depth sqrt(9+16+100): the orbit point lands ON the axis at that depth, the camera stays put
        const [px, py, pz, tx, ty, tz, transition] = cc.setLookAt.mock.calls[0]
        expect([px, py, pz]).toEqual([0, 0, 10]); expect(tx).toBeCloseTo(0, 6); expect(ty).toBeCloseTo(0, 6); expect(tz).toBeCloseTo(10 - Math.sqrt(125), 6); expect(transition).toBe(false)
        expect(cc.setOrbitPoint).not.toHaveBeenCalled()
        expect(applyPivot(cc, new Vector3(1, 2, 3), { onAxis: false })).toBe(true)
        expect(cc.setOrbitPoint).toHaveBeenCalledWith(1, 2, 3) // orbit around selection keeps the sideways pivot
    })
    it('applyPivot with no hit keeps the current target', () => {
        const cc = { active: false, setOrbitPoint: vi.fn(), setLookAt: vi.fn() }
        expect(applyPivot(cc, null)).toBe(false)
        expect(cc.setLookAt).not.toHaveBeenCalled()
    })
    it('axisPointAtDepth keeps the depth and the view direction', () => {
        const c = new PerspectiveCamera(); c.position.set(0, 0, 10); c.lookAt(0, 0, 0); c.updateMatrixWorld(true)
        const p = axisPointAtDepth(c, new Vector3(3, 4, 0))
        expect(p.x).toBeCloseTo(0, 6); expect(p.y).toBeCloseTo(0, 6); expect(p.z).toBeCloseTo(10 - Math.sqrt(125), 6)
    })
    it('entityRoots finds only svEntityId-tagged groups (grid/gizmo untagged)', () => {
        const scene = new Scene()
        const a = new Group(); a.userData.svEntityId = 'a'
        const b = new Group(); b.userData.svEntityId = 'b'
        scene.add(a, b, new Group())
        expect(entityRoots(scene)).toEqual([a, b])
        expect(entityRoots(scene, new Set(['b']))).toEqual([b])
    })
})

describe('applyPivot force (a gesture that just stopped the easing)', () => {
    it('still refuses while easing by default, and sets the depth when forced', () => {
        const cc = { active: true, setOrbitPoint: vi.fn(), setLookAt: vi.fn(), camera: new PerspectiveCamera() }
        cc.camera.position.set(0, 0, 10); cc.camera.lookAt(0, 0, 0); cc.camera.updateMatrixWorld(true)
        expect(applyPivot(cc, new Vector3(0, 0, 0))).toBe(false)
        expect(applyPivot(cc, new Vector3(0, 0, 0), { force: true })).toBe(true)
        expect(cc.setLookAt).toHaveBeenCalledTimes(1)
    })
})

describe('settleForGesture', () => {
    it('stops an easing camera so the gesture\'s pivot can be set, and leaves a still one alone', () => {
        let stopped = 0
        settleForGesture({ active: true, stop: () => { stopped += 1 } })
        settleForGesture({ active: false, stop: () => { stopped += 1 } })
        settleForGesture(null)
        expect(stopped).toBe(1)
    })
})

describe('resolveMissDepth (nothing under the pointer)', () => {
    it('first gesture: the framing distance is the depth, and is remembered', () => {
        expect(resolveMissDepth(null, 24.2, 4.5)).toEqual({ depth: 24.2, remembered: 24.2 })
    })
    it('the 0.35 m clamp after a zoom into air never replaces the remembered depth', () => {
        expect(resolveMissDepth(24.2, 0.399, 4.46)).toEqual({ depth: 24.2, remembered: 24.2 })
    })
    it('a zoom-out or a new framing (larger view distance) is adopted', () => {
        expect(resolveMissDepth(3, 60, 4.5)).toEqual({ depth: 60, remembered: 60 })
    })
    it('the nearest surface is the floor of the answer when the remembered depth is nearer', () => {
        expect(resolveMissDepth(2, 0.399, 4.46)).toEqual({ depth: 4.46, remembered: 4.46 })
    })
    it('empty space with nothing remembered: null, so applyPivot keeps the target', () => {
        expect(resolveMissDepth(null, NaN, null)).toEqual({ depth: null, remembered: null })
    })
})

describe('capDepth: through a surface the depth may at most double per notch', () => {
    it('brings a far hit back onto the ray at the cap and leaves a near hit alone', () => {
        const camera = { position: new Vector3(0, 0, 0) }
        const far = capDepth(camera, new Vector3(0, 0, -30), 0.7)
        expect(far.length()).toBeCloseTo(0.7, 6); expect(far.z).toBeLessThan(0)
        const near = new Vector3(0, 0, -0.5)
        expect(capDepth(camera, near, 0.7)).toBe(near)
    })
})

describe('zoomsIn: infinityDolly only for a notch that zooms in', () => {
    it('negative deltaY zooms in; positive, zero and junk do not', () => {
        expect(zoomsIn({ deltaY: -100 })).toBe(true)
        expect(zoomsIn({ deltaY: 100 })).toBe(false)
        expect(zoomsIn({ deltaY: 0 })).toBe(false)
        expect(zoomsIn(null)).toBe(false)
    })
})

describe('clampUpdates: the first frame after a pause never carries the pause', () => {
    it('clamps the delta to MAX_UPDATE_DT and drops junk', () => {
        expect(clampUpdateDt(0.016)).toBeCloseTo(0.016, 9)
        expect(clampUpdateDt(0.7)).toBe(MAX_UPDATE_DT)
        expect(clampUpdateDt(NaN)).toBe(0); expect(clampUpdateDt(-1)).toBe(0)
    })
    it('wraps cc.update once and can be undone', () => {
        const seen = []; const cc = { update(dt) { seen.push(dt); return true } }
        const undo = clampUpdates(cc); clampUpdates(cc)
        cc.update(0.7); cc.update(0.01)
        expect(seen).toEqual([MAX_UPDATE_DT, 0.01])
        undo(); cc.update(0.7); expect(seen[2]).toBe(0.7)
    })
})

describe('wheelZoomPlan: Blender\'s 1.2x step of the depth under the pointer', () => {
    it('one notch in moves 1 - 1/1.2 of the depth; one out moves 0.2 of it; zoom-out is bounded', () => {
        expect(WHEEL_STEP_FACTOR).toBe(1.2)
        const a = wheelZoomPlan({ depth: 24, notches: 1 }); expect(a.step).toBeCloseTo(24 - 20, 6); expect(a.newDepth).toBeCloseTo(20, 6)
        const b = wheelZoomPlan({ depth: 20, notches: -1 }); expect(b.step).toBeCloseTo(-4, 6); expect(b.newDepth).toBeCloseTo(24, 6)
        const c = wheelZoomPlan({ depth: 90, notches: -1, zoomOutMaxDepth: 100 }); expect(c.newDepth).toBe(100)
        expect(wheelZoomPlan({ depth: 100, notches: -1, zoomOutMaxDepth: 100 }).step).toBe(0)
        expect(wheelZoomPlan({ depth: 0, notches: 1 })).toBeNull(); expect(wheelZoomPlan({ depth: 10, notches: 0 })).toBeNull()
    })
    it('the bound is for zoom-out only: a view already beyond it still zooms in (seed-11 stress, 2026-10-12)', () => {
        const above = wheelZoomPlan({ depth: 221, notches: 1, zoomOutMaxDepth: 100 })
        expect(above.newDepth).toBeCloseTo(221 / 1.2, 6); expect(above.step).toBeGreaterThan(30)
        expect(wheelZoomPlan({ depth: 221, notches: -1, zoomOutMaxDepth: 100 }).step).toBe(0)
    })
    it('a zoom-out never steps from a depth smaller than the view distance (grazing the floor from below)', () => {
        const out = wheelZoomPlan({ depth: 1.6, notches: -1, viewDistance: 24 })
        expect(out.newDepth).toBeCloseTo(28.8, 6); expect(out.step).toBeCloseTo(-4.8, 6)
        expect(wheelZoomPlan({ depth: 1.6, notches: 1, viewDistance: 24 }).newDepth).toBeCloseTo(1.6 / 1.2, 6) // zoom-in keeps the surface
        expect(wheelZoomPlan({ depth: 30, notches: -1, viewDistance: 24 }).newDepth).toBeCloseTo(36, 6)
    })
    it('a trackpad\'s fractional notch is a fractional step', () => {
        expect(wheelZoomPlan({ depth: 24, notches: 0.5 }).newDepth).toBeCloseTo(24 / Math.sqrt(1.2), 6)
    })
})
