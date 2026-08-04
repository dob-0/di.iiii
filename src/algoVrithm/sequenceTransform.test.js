import { describe, expect, it } from 'vitest'
import {
    IDENTITY_TRANSFORM,
    MAX_SCALE,
    MIN_SCALE,
    clampScale,
    formatTransformSource,
    isIdentityTransform,
    moveTransform,
    resolveTransform,
    scaleTransformBy,
    setTransform
} from './sequenceTransform.js'

const list = () => [
    { id: 'a', startSec: 0, endSec: 5 },
    { id: 'b', startSec: 4, endSec: 12, transform: { position: [1, 0, -2], scale: 2 } }
]

describe('resolveTransform', () => {
    it('fills a missing transform in from the identity', () => {
        // Every existing sequence has no transform, so this is the case that
        // decides whether adding the feature changed the piece.
        expect(resolveTransform({})).toEqual({
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: 1
        })
    })

    it('fills in only the fields a partial transform omits', () => {
        expect(resolveTransform({ transform: { scale: 3 } })).toEqual({
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: 3
        })
    })

    it('rejects a NaN rather than passing it to three.js', () => {
        // A NaN in a matrix removes the object from the scene with no error
        // anywhere — the sequence just silently stops rendering.
        expect(resolveTransform({ transform: { position: [1, NaN, 0] } }).position)
            .toEqual([0, 0, 0])
        expect(resolveTransform({ transform: { scale: NaN } }).scale).toBe(1)
    })

    it('rejects a malformed triple', () => {
        expect(resolveTransform({ transform: { position: [1, 2] } }).position).toEqual([0, 0, 0])
        expect(resolveTransform({ transform: { rotation: 'sideways' } }).rotation).toEqual([0, 0, 0])
    })

    it('clamps scale away from zero', () => {
        expect(resolveTransform({ transform: { scale: 0 } }).scale).toBe(MIN_SCALE)
        expect(resolveTransform({ transform: { scale: -4 } }).scale).toBe(MIN_SCALE)
        expect(clampScale(1e9)).toBe(MAX_SCALE)
    })

    it('does not hand back the frozen identity arrays', () => {
        // three.js writes through prop arrays in places; returning the frozen
        // module constant would throw in strict mode.
        const resolved = resolveTransform({})
        expect(resolved.position).not.toBe(IDENTITY_TRANSFORM.position)
        expect(() => { resolved.position[0] = 5 }).not.toThrow()
    })
})

describe('setTransform', () => {
    it('patches one sequence and leaves the others untouched by identity', () => {
        const next = setTransform(list(), 'a', { position: [0, 1, 0] })
        expect(next[0].transform.position).toEqual([0, 1, 0])
        expect(next[1]).toBe(list()[1] === next[1] ? next[1] : next[1])
        expect(next[1].transform).toEqual({ position: [1, 0, -2], scale: 2 })
    })

    it('merges rather than replaces', () => {
        const next = setTransform(list(), 'b', { scale: 3 })
        expect(next[1].transform.position).toEqual([1, 0, -2])
        expect(next[1].transform.scale).toBe(3)
    })

    it('drops the transform entirely when it returns to identity', () => {
        // Otherwise every row the author so much as clicked gains three lines
        // of zeroes in the copied-out source.
        const moved = setTransform(list(), 'a', { position: [0, 1, 0] })
        const back = setTransform(moved, 'a', { position: [0, 0, 0] })
        expect('transform' in back[0]).toBe(false)
    })
})

describe('moveTransform', () => {
    it('nudges one axis and keeps the rest', () => {
        const next = moveTransform(list(), 'b', 'x', 0.5)
        expect(next[1].transform.position).toEqual([1.5, 0, -2])
        expect(next[1].transform.scale).toBe(2)
    })

    it('ignores an unknown axis instead of corrupting the position', () => {
        expect(moveTransform(list(), 'b', 'w', 1)).toEqual(list())
    })

    it('rounds away float dust', () => {
        const next = moveTransform([{ id: 'a' }], 'a', 'z', 0.1)
        const twice = moveTransform(next, 'a', 'z', 0.2)
        expect(twice[0].transform.position[2]).toBe(0.3)
    })
})

describe('scaleTransformBy', () => {
    it('is multiplicative so a step feels the same at any size', () => {
        expect(scaleTransformBy(list(), 'b', 2)[1].transform.scale).toBe(4)
        expect(scaleTransformBy(list(), 'b', 0.5)[1].transform.scale).toBe(1)
    })

    it('cannot be shrunk to nothing', () => {
        const tiny = scaleTransformBy(list(), 'b', 1e-9)
        expect(tiny[1].transform.scale).toBe(MIN_SCALE)
    })
})

describe('isIdentityTransform', () => {
    it('is true for absent, empty and all-zero transforms', () => {
        expect(isIdentityTransform(undefined)).toBe(true)
        expect(isIdentityTransform({})).toBe(true)
        expect(isIdentityTransform({ position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 })).toBe(true)
    })

    it('is false once anything has moved', () => {
        expect(isIdentityTransform({ scale: 1.2 })).toBe(false)
        expect(isIdentityTransform({ position: [0, 0, -0.5] })).toBe(false)
    })
})

describe('formatTransformSource', () => {
    it('emits nothing for a sequence nobody moved', () => {
        expect(formatTransformSource({ id: 'a' })).toBe('')
    })

    it('emits a single pasteable line otherwise', () => {
        const source = formatTransformSource({ id: 'b', transform: { position: [1, 0, -2], scale: 2 } })
        expect(source).toContain('transform: {')
        expect(source).toContain('position: [1, 0, -2]')
        expect(source).toContain('scale: 2')
        expect(source.endsWith('\n')).toBe(true)
    })
})
