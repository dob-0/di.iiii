import { describe, expect, it, vi } from 'vitest'
import { Group, Scene } from 'three'
import { applyPivot, entityRoots, settleForGesture } from './useCameraNavigation.js'

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
