import { describe, it, expect } from 'vitest'
import { normalizeProjectDocument, defaultWorldState } from './projectSchema.js'

// worldState.solidWalls: walk mode stops at the scene's walls, trunks and other solid models
// (src/components/solidWalls.js). Off for every project that has never heard of it.
describe('worldState.solidWalls', () => {
    it('is off by default, so every existing project walks exactly as before', () => {
        expect(defaultWorldState.solidWalls).toBe(null)
        expect(normalizeProjectDocument({}).worldState.solidWalls).toBe(null)
    })

    it('turns on only with an explicit enabled: true', () => {
        expect(normalizeProjectDocument({ worldState: { solidWalls: { enabled: true } } }).worldState.solidWalls).toEqual({ enabled: true })
        for (const off of [{ enabled: false }, {}, { enabled: 'yes' }, { enabled: 1 }, true, 'on', 5, [], null]) {
            expect(normalizeProjectDocument({ worldState: { solidWalls: off } }).worldState.solidWalls).toBe(null)
        }
    })

    it('keeps nothing but the switch, so a stray field never reaches the walker', () => {
        const doc = normalizeProjectDocument({ worldState: { solidWalls: { enabled: true, radius: 9, extra: 'x' } } })
        expect(doc.worldState.solidWalls).toEqual({ enabled: true })
    })

    it('does not disturb the floor plan it sits beside', () => {
        const doc = normalizeProjectDocument({ worldState: { solidWalls: { enabled: true }, walkableAreas: [{ minX: -1, maxX: 1, minZ: -1, maxZ: 1 }] } })
        expect(doc.worldState.walkableAreas).toEqual([{ minX: -1, maxX: 1, minZ: -1, maxZ: 1 }])
    })
})
