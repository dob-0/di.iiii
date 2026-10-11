import { describe, expect, it, vi } from 'vitest'
import { Group, Scene } from 'three'
import { applyPivot, entityRoots, resolveMissDepth, settleForGesture } from './useCameraNavigation.js'

describe('adapter helpers', () => {
    it('applyPivot never moves the orbit point while camera-controls is animating', () => {
        const cc = { active: true, setOrbitPoint: vi.fn() }
        expect(applyPivot(cc, { x: 1, y: 2, z: 3 })).toBe(false)
        expect(cc.setOrbitPoint).not.toHaveBeenCalled()
        cc.active = false
        expect(applyPivot(cc, { x: 1, y: 2, z: 3 })).toBe(true)
        expect(cc.setOrbitPoint).toHaveBeenCalledWith(1, 2, 3)
    })
    it('applyPivot with no hit keeps the current target', () => {
        const cc = { active: false, setOrbitPoint: vi.fn() }
        expect(applyPivot(cc, null)).toBe(false)
        expect(cc.setOrbitPoint).not.toHaveBeenCalled()
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
    it('still refuses while easing by default, and sets the point when forced', () => {
        const calls = []
        const cc = { active: true, setOrbitPoint: (...a) => calls.push(a) }
        expect(applyPivot(cc, { x: 1, y: 2, z: 3 })).toBe(false)
        expect(applyPivot(cc, { x: 1, y: 2, z: 3 }, { force: true })).toBe(true)
        expect(calls).toEqual([[1, 2, 3]])
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
