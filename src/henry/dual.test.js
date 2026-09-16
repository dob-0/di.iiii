import { describe, expect, it } from 'vitest'
import { DREAM_MAGNIFICATION, GIRL_HEIGHT, PAIRS, pairById, resolvePairTransform } from './dual.js'

describe('the dream/real pairs', () => {
    it('has a unique id per pair', () => {
        const ids = PAIRS.map((pair) => pair.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('states what every giant thing turns out to be', () => {
        for (const pair of PAIRS) {
            expect(pair.becomes, `${pair.id} has no real-world counterpart`).toBeTruthy()
        }
    })

    it('keeps every pair near the authored magnification', () => {
        // Far outside this band and the object stops reading as the same thing
        // at two sizes, which is the only trick the piece has.
        for (const pair of PAIRS) {
            const factor = pair.dreamScale / pair.realScale
            expect(factor, `${pair.id} is ${factor.toFixed(0)}x`).toBeGreaterThan(DREAM_MAGNIFICATION / 3)
            expect(factor, `${pair.id} is ${factor.toFixed(0)}x`).toBeLessThan(DREAM_MAGNIFICATION * 3)
        }
    })

    it('makes every dream object tower over her', () => {
        for (const pair of PAIRS) {
            expect(pair.dreamScale, `${pair.id}`).toBeGreaterThan(GIRL_HEIGHT * 10)
        }
    })
})

describe('resolving a transform', () => {
    const plant = pairById('plant-a')

    it('is the giant version at full dream', () => {
        const transform = resolvePairTransform(plant, 1)
        expect(transform.scale).toBeCloseTo(plant.dreamScale, 4)
        expect(transform.position).toEqual(plant.dreamPosition)
    })

    it('is the ordinary version at no dream', () => {
        const transform = resolvePairTransform(plant, 0)
        expect(transform.scale).toBeCloseTo(plant.realScale, 4)
        expect(transform.position).toEqual(plant.position)
        expect(transform.rotationY).toBeCloseTo(plant.realRotationY, 4)
    })

    it('shrinks at a constant rate rather than collapsing at the end', () => {
        // Log interpolation: the halfway point is the geometric mean, not the
        // arithmetic one. Linear would still be ~17 here, which on screen is a
        // giant plant that vanishes in the last few frames.
        const half = resolvePairTransform(plant, 0.5).scale
        expect(half).toBeCloseTo(Math.sqrt(plant.realScale * plant.dreamScale), 3)
        expect(half).toBeLessThan((plant.realScale + plant.dreamScale) / 2)
    })

    it('clamps outside 0..1 instead of extrapolating to nonsense', () => {
        expect(resolvePairTransform(plant, 4).scale).toBeCloseTo(plant.dreamScale, 4)
        expect(resolvePairTransform(plant, -4).scale).toBeCloseTo(plant.realScale, 4)
    })
})
