import { describe, expect, it } from 'vitest'
import { pickHead } from './vis-head.mjs'

const rig = [
    { index: 1, profile: 'par', universe: 1, address: 1 },
    { index: 7, profile: 'b380f', universe: 2, address: 1 },
    { index: 8, profile: 'b380f', universe: 2, address: 20 },
]

describe('vis-head.mjs', () => {
    it('prefers a B380F, with every head of its type', () => {
        const driven = [{ index: 1, type: 'par' }, { index: 9, pan: 0.5, type: 'other' }, { index: 7, pan: 0.5, type: 'up-b380f' }]
        const got = pickHead(driven, rig)
        expect(got.fx.index).toBe(7)
        expect(got.heads.map((f) => f.index)).toEqual([7, 8])
    })
    it('a fixed-light rig gives no head; only asking for a head test refuses', () => {
        const driven = [{ index: 1, type: 'par' }]
        expect(pickHead(driven, rig)).toBeNull()
        expect(() => pickHead(driven, rig, { need: true })).toThrow(/--trials 0 and --cues only/)
    })
})
