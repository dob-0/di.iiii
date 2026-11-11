// stage-base.mjs: the pure part. The frame it lays must be one lookFrame (src/rigbuild/looks.js) finds, from a rig file's solids only.
import { describe, it, expect } from 'vitest'
import { deckSolidOf, stageBaseEntities } from './stage-base.mjs'
import { lookFrame } from '../../src/rigbuild/looks.js'
import { normalizeVenuePlan } from '../../src/shared/projectSchema.js'

const rig = { title: 'T', solids: [
    { id: 'a-screen', kind: 'box', p: [0, 1.4, 0], s: [4, 2.5, 0.1] },
    { id: 'a-deck', kind: 'box', p: [0, 0, 3], s: [14, 0.6, 7.2] },
    { id: 'a-truss', kind: 'truss', p: [0, 6.7, 2], s: [8, 0.4, 0.4] },
    { id: 'a-wing', kind: 'box', p: [5, 0, 0], s: [2, 6.6, 0.3] }
] }

describe('stage-base', () => {
    it('picks the deck by shape, not by name; --deck overrides; none -> null', () => {
        expect(deckSolidOf(rig).id).toBe('a-deck')
        expect(deckSolidOf(rig, 'a-wing').id).toBe('a-wing')
        expect(deckSolidOf({ solids: [rig.solids[0]] })).toBeNull()
    })
    it('lays rig-show, rig-venue and 7 x 7 deck tiles inside the deck footprint', () => {
        const e = stageBaseEntities(rig)
        expect(e.map((x) => x.id).slice(0, 2)).toEqual(['rig-show', 'rig-venue'])
        expect(e.length).toBe(2 + 7 * 7)
        expect(new Set(e.map((x) => x.id)).size).toBe(e.length)
    })
    it('the venue plan survives the schema and lookFrame finds the stage in it', () => {
        const e = stageBaseEntities(rig)
        expect(normalizeVenuePlan(e[1].components.venuePlan)).not.toBeNull()
        const ctx = lookFrame(e)
        expect(ctx).not.toBeNull()
        expect(ctx.stage.into).toBe(1)
        expect(ctx.stage.rect[1]).toBeGreaterThanOrEqual(-0.6 - 1e-6)
        expect(ctx.stage.rect[3]).toBeLessThanOrEqual(6.6 + 1e-6)
        expect(ctx.stage.deck).toBeCloseTo(0.58, 3)
    })
    it('into -1 faces the audience the other way; no deck throws', () => {
        expect(lookFrame(stageBaseEntities(rig, { into: -1 })).stage.into).toBe(-1)
        expect(() => stageBaseEntities({ solids: [] })).toThrow(/no deck solid/)
    })
})
