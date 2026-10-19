import { describe, expect, it, vi } from 'vitest'
import { Group, PerspectiveCamera, Scene } from 'three'
import { Vector3 } from 'three'
import { MAX_UPDATE_DT, applyPivot, axisPointAtDepth, clampUpdateDt, clampUpdates, entityRoots, settleForGesture, standardWheelNotches } from './useCameraNavigation.js'

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
    it('freezes a gliding camera where it is (never jumps to the glide\'s end), and leaves a still one alone', async () => {
        const THREE = await import('three')
        const { default: CameraControls } = await import('camera-controls')
        CameraControls.install({ THREE })
        const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 5000)
        const cc = new CameraControls(cam)
        cc.setLookAt(0, 0, 0, 0, 0, -10, false); cc.update(0)
        cc.setLookAt(0, 0, -20, 0, 0, -30, true)
        for (let i = 0; i < 6; i += 1) cc.update(1 / 60)
        const mid = cam.position.clone()
        settleForGesture(cc); cc.update(1 / 60)
        expect(cam.position.distanceTo(mid)).toBeLessThan(1e-6)
        expect(cc.getPosition(new THREE.Vector3(), true).distanceTo(mid)).toBeLessThan(1e-6)
        settleForGesture(cc); settleForGesture(null) // a still one, and none: nothing happens
        expect(cam.position.distanceTo(mid)).toBeLessThan(1e-6)
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

describe('standardWheelNotches: the wheel, and Shift+wheel that Chrome on Linux sends sideways', () => {
    it('a notch up is +1; Shift turns a sideways scroll into the wheel; nothing else counts sideways', () => {
        expect(standardWheelNotches({ deltaY: -100, deltaMode: 0 })).toBe(1)
        expect(standardWheelNotches({ deltaY: 0, deltaX: -100, shiftKey: true, deltaMode: 0 })).toBe(1)
        expect(standardWheelNotches({ deltaY: 0, deltaX: -100, shiftKey: false, deltaMode: 0 })).toBe(0)
        expect(standardWheelNotches({ deltaY: 0, deltaX: 3, shiftKey: true, deltaMode: 1 })).toBeCloseTo(-0.48, 6)
    })
})
