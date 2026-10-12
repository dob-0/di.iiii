import { describe, expect, it, vi } from 'vitest'
import { Group, PerspectiveCamera, Scene } from 'three'
import { Vector3 } from 'three'
import { MAX_UPDATE_DT, WHEEL_STEP_FACTOR, wheelZoomPlan, applyPivot, axisPointAtDepth, clampUpdateDt, clampUpdates, entityRoots, settleForGesture, zoomsIn } from './useCameraNavigation.js'

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

describe('wheelZoomPlan: Blender\'s 1.2x step of the orbit distance (measured on the owner\'s Blender 5.2.2, 2026-10-13)', () => {
    it('one notch in moves 1 - 1/1.2 of the distance; one out moves 0.2 of it; 20 in = 1.2^20', () => {
        expect(WHEEL_STEP_FACTOR).toBe(1.2)
        const a = wheelZoomPlan({ distance: 24, notches: 1 }); expect(a.step).toBeCloseTo(24 - 20, 6); expect(a.newDistance).toBeCloseTo(20, 6)
        const b = wheelZoomPlan({ distance: 20, notches: -1 }); expect(b.step).toBeCloseTo(-4, 6); expect(b.newDistance).toBeCloseTo(24, 6)
        expect(wheelZoomPlan({ distance: 18.388, notches: 20 }).newDistance).toBeCloseTo(18.388 / 38.338, 2) // blender-wheel-probe: 18.388 -> 0.4796
        expect(wheelZoomPlan({ distance: 0, notches: 1 })).toBeNull(); expect(wheelZoomPlan({ distance: 10, notches: 0 })).toBeNull()
    })
    it('Blender\'s soft range: no step from outside it in the same direction, never a clamp, always a way back', () => {
        expect(wheelZoomPlan({ distance: 10000, notches: -1, maxDistance: 10000 })).toBeNull()
        expect(wheelZoomPlan({ distance: 9000, notches: -1, maxDistance: 10000 }).newDistance).toBeCloseTo(10800, 6) // one step past, as Blender (probe: 10861 m)
        expect(wheelZoomPlan({ distance: 10800, notches: 1, maxDistance: 10000 }).newDistance).toBeCloseTo(9000, 6)
        expect(wheelZoomPlan({ distance: 0.01, notches: 1, minDistance: 0.015 })).toBeNull()
        expect(wheelZoomPlan({ distance: 0.01, notches: -1, minDistance: 0.015 }).newDistance).toBeCloseTo(0.012, 6)
    })
    it('a trackpad\'s fractional notch is a fractional step', () => {
        expect(wheelZoomPlan({ distance: 24, notches: 0.5 }).newDistance).toBeCloseTo(24 / Math.sqrt(1.2), 6)
    })
})
