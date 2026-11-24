import { describe, expect, it } from 'vitest'
import { keepBottomOnScale, floorY } from './keepModelBottom.js'

// A model 2 m tall whose origin is its centre, standing on the floor: origin y = 1, bottom y = 0.
const model = { id: 'm', type: 'model', components: {} }
const probe = (positionY, scaleY, bottom) => ({
    getObject: () => ({ position: { y: positionY }, scale: { y: scaleY } }),
    getBox: () => ({ min: { y: bottom } })
})
const stored = { position: [3, 1, 4], rotation: [0, 0, 0], scale: [1, 1, 1] }

describe('keepBottomOnScale', () => {
    it('lifts the model by the growth in half-height so the bottom stays on the floor', () => {
        const out = keepBottomOnScale(model, stored, { scale: [1.6, 1.6, 1.6] }, probe(1, 1, 0))
        expect(out.position[0]).toBe(3)
        expect(out.position[1]).toBeCloseTo(1.6, 6)
        expect(out.position[2]).toBe(4)
    })

    it('gives the same answer when the live object already shows the new scale (gizmo drag)', () => {
        const out = keepBottomOnScale(model, stored, { scale: [1.6, 1.6, 1.6] }, probe(1, 1.6, -0.6))
        expect(out.position[1]).toBeCloseTo(1.6, 6)
    })

    it('brings a shrunk model down so it does not float', () => {
        const out = keepBottomOnScale(model, stored, { scale: [0.5, 0.5, 0.5] }, probe(1, 1, 0))
        expect(out.position[1]).toBeCloseTo(0.5, 6)
    })

    it('leaves everything else alone', () => {
        const patch = { scale: [2, 2, 2] }
        expect(keepBottomOnScale({ ...model, type: 'box' }, stored, patch, probe(1, 1, 0))).toBe(patch)
        expect(keepBottomOnScale({ ...model, parentId: 'g' }, stored, patch, probe(1, 1, 0))).toBe(patch)
        const moved = { scale: [2, 2, 2], position: [0, 5, 0] }
        expect(keepBottomOnScale(model, stored, moved, probe(1, 1, 0))).toBe(moved)
        const rot = { position: [1, 1, 1] }
        expect(keepBottomOnScale(model, stored, rot, probe(1, 1, 0))).toBe(rot)
        expect(keepBottomOnScale(model, stored, patch, { getObject: () => null, getBox: () => null })).toBe(patch)
    })

    it('skips a one-axis stretch on a model tipped over X', () => {
        const tipped = { ...stored, rotation: [1, 0, 0] }
        const patch = { scale: [1, 2, 1] }
        expect(keepBottomOnScale(model, tipped, patch, probe(1, 1, 0))).toBe(patch)
    })
})

describe('floorY', () => {
    it('is the Y that puts the bottom at 0', () => {
        expect(floorY(model, probe(2, 1, 0.5))).toBeCloseTo(1.5, 6)
    })
})
