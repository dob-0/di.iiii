import { describe, it, expect } from 'vitest'
import { TIERS, isProductionTarget, planSync } from './tier-sync.mjs'

describe('isProductionTarget', () => {
    // The whole reason this guard exists: a tool that can write to a tier must
    // not be able to reach production by inheriting a default.
    it('knows production from every other tier', () => {
        expect(isProductionTarget(TIERS.prod.base)).toBe(true)
        expect(isProductionTarget('https://www.di-studio.xyz/serverXR')).toBe(true)
        expect(isProductionTarget(TIERS.staging.base)).toBe(false)
        expect(isProductionTarget(TIERS.local.base)).toBe(false)
        expect(isProductionTarget('not a url')).toBe(false)
    })
})

describe('planSync', () => {
    it('moves only what the destination is missing', () => {
        const plan = planSync({
            source: { main: ['a', 'b', 'c'], wcc: ['x'] },
            destination: { main: ['a'], wcc: ['x'] }
        })
        expect(plan).toEqual([{ spaceId: 'main', createSpace: false, projects: ['b', 'c'] }])
    })

    it('creates a space the destination has never heard of', () => {
        const plan = planSync({
            source: { atlas: ['estate-map'] },
            destination: {}
        })
        expect(plan).toEqual([{ spaceId: 'atlas', createSpace: true, projects: ['estate-map'] }])
    })

    // Only ever adds. A project the destination has and the source does not is
    // that tier's own work — the dev box in particular holds things that exist
    // on no other tier — and a sync that deletes is a sync that loses work.
    it('never plans to remove what only the destination has', () => {
        const plan = planSync({
            source: { main: ['a'] },
            destination: { main: ['a', 'b', 'c'], dilijan: ['camp'] }
        })
        expect(plan).toEqual([])
    })

    it('leaves what is already there alone unless forced', () => {
        const same = { source: { main: ['a', 'b'] }, destination: { main: ['a', 'b'] } }
        expect(planSync(same)).toEqual([])
        expect(planSync({ ...same, force: true })).toEqual([
            { spaceId: 'main', createSpace: false, projects: ['a', 'b'] }
        ])
    })

    it('has nothing to do when the source is empty', () => {
        expect(planSync({ source: {}, destination: { main: ['a'] } })).toEqual([])
    })
})
