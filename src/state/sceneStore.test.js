import { describe, expect, it } from 'vitest'
import {
    defaultScene,
    generateObjectId,
    normalizeObject,
    normalizeObjects
} from './sceneStore.js'

describe('normalizeObject', () => {
    it('adds missing ids and fills transform defaults', () => {
        const result = normalizeObject({
            position: [5],
            rotation: [1],
            scale: [2]
        })
        expect(result.id).toBeTruthy()
        expect(result.position).toEqual([5, 0, 0])
        expect(result.rotation).toEqual([1, 0, 0])
        expect(result.scale).toEqual([2, 1, 1])
    })

    it('preserves existing ids', () => {
        const result = normalizeObject({ id: 'keep-me' })
        expect(result.id).toBe('keep-me')
    })
})

describe('normalizeObjects', () => {
    it('normalizes each object in an array', () => {
        const [first, second] = normalizeObjects([
            { position: [1, 2, 3] },
            { id: 'preserve-id', rotation: [0.5, 0.25, 0] }
        ])
        expect(first.id).toBeTruthy()
        expect(first.position).toEqual([1, 2, 3])
        expect(second.id).toBe('preserve-id')
        expect(second.rotation).toEqual([0.5, 0.25, 0])
    })
})

describe('generateObjectId', () => {
    it('creates unique-ish identifiers', () => {
        const idA = generateObjectId()
        const idB = generateObjectId()
        expect(idA).not.toBe(idB)
        expect(idA).toMatch(/[a-z0-9-]{5,}/)
        expect(idB).toMatch(/[a-z0-9-]{5,}/)
    })
})

describe('defaultScene', () => {
    it('exposes baseline scene settings', () => {
        expect(defaultScene).toMatchObject({
            version: expect.any(Number),
            objects: expect.any(Array),
            backgroundColor: expect.any(String),
            ambientLight: expect.any(Object),
            directionalLight: expect.any(Object),
            transformSnaps: expect.any(Object)
        })
    })
})
