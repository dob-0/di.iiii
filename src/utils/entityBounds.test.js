import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { entitiesBoundingSphere, pickFrameTargets } from './entityBounds.js'

const ent = (id, position = [0, 0, 0], extra = {}) => ({
    id,
    components: { transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1], ...extra.transform }, runtime: extra.runtime || {} }
})
const box = (min, max) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))

describe('entitiesBoundingSphere', () => {
    it('frames a big box by its extents, not its origin point', () => {
        const hall = ent('hall')
        const sphere = entitiesBoundingSphere([hall], () => box([-20, 0, -10], [20, 8, 10]))
        expect(sphere.radius).toBeGreaterThan(20)
        expect(sphere.center.toArray()).toEqual([0, 4, 0])
    })
    it('encloses two far boxes', () => {
        const boxes = { a: box([0, 0, 0], [2, 2, 2]), b: box([98, 0, 0], [100, 2, 2]) }
        const sphere = entitiesBoundingSphere([ent('a'), ent('b')], (e) => boxes[e.id])
        expect(sphere.center.x).toBeCloseTo(50)
        expect(sphere.radius).toBeGreaterThan(50)
    })
    it('skips hidden entities', () => {
        const hidden = ent('h', [500, 0, 0], { runtime: { visible: false } })
        const sphere = entitiesBoundingSphere([ent('a'), hidden], (e) => (e.id === 'a' ? box([0, 0, 0], [2, 2, 2]) : box([500, 0, 0], [502, 2, 2])))
        expect(sphere.center.x).toBeLessThan(5)
    })
    it('returns null with nothing visible', () => {
        expect(entitiesBoundingSphere([ent('h', [0, 0, 0], { runtime: { visible: false } })], () => null)).toBeNull()
        expect(entitiesBoundingSphere([], () => null)).toBeNull()
    })
    it('empty selection targets the whole visible room', () => {
        const all = [ent('a'), ent('b'), ent('h', [0, 0, 0], { runtime: { visible: false } })]
        expect(pickFrameTargets(all, []).map((e) => e.id)).toEqual(['a', 'b'])
        expect(pickFrameTargets(all, [all[1]]).map((e) => e.id)).toEqual(['b'])
    })
    it('fallback uses scale and rotation when there is no object', () => {
        // 10 x 1 x 1 slab at 45 deg about Y: world x extent = (10+1)/sqrt2 ~ 7.78
        const slab = ent('s', [0, 0, 0], { transform: { scale: [10, 1, 1], rotation: [0, Math.PI / 4, 0] } })
        const sphere = entitiesBoundingSphere([slab], () => null, { minRadius: 0 })
        const expectedHalf = ((10 + 1) / Math.SQRT2) / 2
        const axisAligned = Math.hypot(expectedHalf, 0.5, expectedHalf)
        expect(sphere.radius).toBeCloseTo(axisAligned, 3)
        const unrotated = entitiesBoundingSphere([ent('u', [0, 0, 0], { transform: { scale: [10, 1, 1] } })], () => null, { minRadius: 0 })
        expect(unrotated.radius).toBeCloseTo(Math.hypot(5, 0.5, 0.5), 3)
        expect(sphere.radius).not.toBeCloseTo(unrotated.radius, 2)
    })
    it('honours a scaled single entity and the minimum radius', () => {
        const small = entitiesBoundingSphere([ent('t')], () => null, { minRadius: 2 })
        expect(small.radius).toBe(2)
        const big = entitiesBoundingSphere([ent('t', [3, 0, 0], { transform: { scale: [20, 20, 20] } })], () => null)
        expect(big.radius).toBeCloseTo(Math.sqrt(300), 3)
    })
})
