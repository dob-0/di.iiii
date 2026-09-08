// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { unseen, planDirection, planAfterConflict, nextInterval, BATCH } = require('./followPlan')

const op = (id) => ({ opId: id, type: 'updateEntity', payload: {}, version: 1 })

describe('what a follower carries', () => {
    it('carries ops it has not carried before', () => {
        expect(unseen([op('a'), op('b')], new Set(['a'])).map(o => o.opId)).toEqual(['b'])
    })

    it('never carries an op back to where it came from', () => {
        // The receiving server would drop it anyway — every write route filters
        // opIds it already holds — but two servers echoing each other forever
        // is a room that never goes quiet.
        const seen = new Set(['a', 'b'])
        expect(unseen([op('a'), op('b')], seen)).toEqual([])
    })

    it('drops anything with no opId, because dedupe is the whole safety net', () => {
        expect(unseen([{ type: 'updateEntity' }, op('a')], new Set()).map(o => o.opId)).toEqual(['a'])
    })

    it('carries at most one batch, so a long history arrives in pieces', () => {
        const many = Array.from({ length: BATCH + 50 }, (_, i) => op(`op${i}`))
        expect(unseen(many, new Set()).length).toBe(BATCH)
    })
})

describe('planning one direction', () => {
    it('says nothing when there is nothing new', () => {
        expect(planDirection({ ops: [], seen: new Set(), targetVersion: 4 })).toBeNull()
    })

    it('bases the write on the TARGET side version, never on the source side', () => {
        // The two counters are per-install and mean nothing to each other; a
        // write based on the wrong one is refused at best and wrong at worst.
        const plan = planDirection({ ops: [op('a')], seen: new Set(), targetVersion: 41 })
        expect(plan).toEqual({ baseVersion: 41, ops: [op('a')] })
    })

    it('waits rather than guessing when the target version is unknown', () => {
        expect(planDirection({ ops: [op('a')], seen: new Set(), targetVersion: null })).toBeNull()
    })
})

describe('after a refusal', () => {
    it('treats the refusal as a delivery: apply what we missed, then retry there', () => {
        const plan = planAfterConflict({ latestVersion: 12, pendingOps: [op('x'), op('y')] })
        expect(plan.apply.map(o => o.opId)).toEqual(['x', 'y'])
        expect(plan.retryAt).toBe(12)
    })

    it('survives a refusal that says nothing useful', () => {
        expect(planAfterConflict({})).toEqual({ apply: [], retryAt: null })
    })
})

describe('how often to ask', () => {
    it('drops to the floor the moment anything moves', () => {
        expect(nextInterval({ moved: true, current: 20000 })).toBe(700)
    })

    it('backs off while the room is quiet, and stops at the ceiling', () => {
        expect(nextInterval({ moved: false, current: 700 })).toBe(1120)
        expect(nextInterval({ moved: false, current: 25000 })).toBe(30000)
        expect(nextInterval({ moved: false, current: 30000 })).toBe(30000)
    })
})
