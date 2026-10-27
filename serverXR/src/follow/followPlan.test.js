// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { accountedThrough, unseen, moreToCarry, refusedWholeWork, planDirection, planAfterConflict, nextInterval, BATCH, batchOf, MAX_BODY_BYTES, MAX_OP_BYTES } = require('./followPlan')
const { readFileSync } = require('node:fs')
const path = require('node:path')

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

describe('what a follow refuses to carry', () => {
    // A snapshot restore or a tier pull appends `replaceScene` to the log. Carried
    // across a follow it would make one artist's copy of the room silently become
    // the other's, with no snapshot and no way back.
    it('never carries a whole-scene or whole-document replacement', () => {
        const ops = [op('a'), { opId: 'wipe', type: 'replaceScene', payload: {} }, op('b')]
        expect(unseen(ops, new Set()).map(o => o.opId)).toEqual(['a', 'b'])
        expect(refusedWholeWork(ops)).toBe(true)
        expect(refusedWholeWork([op('a')])).toBe(false)
    })

    it('says when there is more than one batch waiting, so the loop does not sleep on it', () => {
        const many = Array.from({ length: BATCH + 1 }, (_, i) => op(`op${i}`))
        expect(moreToCarry(many, new Set())).toBe(true)
        expect(moreToCarry(many.slice(0, BATCH), new Set())).toBe(false)
        // and what is already carried does not count towards the next batch
        expect(moreToCarry(many, new Set(many.map(o => o.opId)))).toBe(false)
    })

    it('steps a cursor past a whole-work op, even one an older log left with no opId', () => {
        const ops = [
            { opId: 'a', type: 'createEntity', version: 1 },
            { type: 'replaceDocument', version: 2 },
            { opId: 'b', type: 'createEntity', version: 3 }
        ]
        expect(accountedThrough(ops, new Set(['a', 'b']), 3)).toBe(3)
        // …but never past an ordinary op it has not accounted for.
        expect(accountedThrough(ops, new Set(['a']), 3)).toBe(2)
        expect(accountedThrough([{ type: 'replaceDocument', version: 1 }, { opId: 'c', type: 'createEntity', version: 2 }], new Set(), 2)).toBe(1)
    })
})

describe('failureDelay — a refused stream is left alone longer each time', () => {
    const { failureDelay, describeWriteFailure, isStuckRefusal } = require('./followPlan.js')

    it('doubles from 5 s and stops at 5 minutes', () => {
        expect([1, 2, 3, 4].map(count => failureDelay(count))).toEqual([5000, 10_000, 20_000, 40_000])
        expect(failureDelay(20)).toBe(300_000)
    })

    it('only a server error counts as stuck — a conflict or no answer is the loop\'s ordinary business', () => {
        expect(isStuckRefusal(500)).toBe(true)
        expect(isStuckRefusal(503)).toBe(true)
        expect(isStuckRefusal(409)).toBe(false)
        expect(isStuckRefusal(0)).toBe(false)
    })

    it('says when it will try again and that the rest keeps following', () => {
        const text = describeWriteFailure({ stream: { kind: 'project', projectId: 'test', key: 'project:test' }, direction: 'in', status: 500, error: 'Server error', retryInMs: 20_000 })
        expect(text).toBe("this di.iiii refused the other side's changes to project test (HTTP 500: Server error) (see this server's log) — trying again in 20 s; the rest of the space keeps following")
    })
})

// Audit F3 (docs/ai/audits/follow-audit-2026-10-04.md): a batch was capped by
// count (200), never by bytes, so two ops the host had each accepted alone
// (6 MB) could not cross together in one POST (413), and the same batch was
// retried every tick for ever. A batch is now also capped by the receiving
// server's JSON body limit.
describe('a batch is capped by bytes as well as by count (audit F3)', () => {
    const big = (id, bytes) => ({ opId: id, type: 'addObject', version: 1, payload: { s: 'x'.repeat(bytes) } })
    const size = (value) => Buffer.byteLength(JSON.stringify(value))

    it('takes the cap from the server\'s own express.json limit, not from a number of ours', () => {
        const source = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
        expect(source).toMatch(/express\.json\(\{ limit: '10mb'/)
        expect(MAX_BODY_BYTES).toBe(10 * 1024 * 1024)
    })

    it('never builds a body bigger than the server accepts (three 4 MB ops, the audit\'s F-batch)', () => {
        const ops = [big('o1', 4_000_000), big('o2', 4_000_000), big('o3', 4_000_000)]
        const plan = planDirection({ ops, seen: new Set(), targetVersion: 1 })
        expect(size(plan)).toBeLessThanOrEqual(MAX_BODY_BYTES)
        expect(plan.ops.map(o => o.opId)).toEqual(['o1', 'o2'])
    })

    it('says there is more to carry when the bytes, not the count, stopped the batch', () => {
        const ops = [big('o1', 4_000_000), big('o2', 4_000_000), big('o3', 4_000_000)]
        expect(moreToCarry(ops, new Set())).toBe(true)
        expect(moreToCarry(ops, new Set(['o3']))).toBe(false)
    })

    it('carries each of two 6 MB ops in its own batch rather than stalling', () => {
        const ops = [big('o1', 6_000_000), big('o2', 6_000_000)]
        expect(batchOf(ops, new Set()).ops.map(o => o.opId)).toEqual(['o1'])
        expect(batchOf(ops, new Set(['o1'])).ops.map(o => o.opId)).toEqual(['o2'])
    })

    it('gives a single op bigger than the cap a defined result: left out of the batch and named', () => {
        const huge = big('huge', MAX_OP_BYTES + 10)
        const result = batchOf([huge, op('after')], new Set())
        expect(result.ops.map(o => o.opId)).toEqual(['after'])
        expect(result.tooLarge).toHaveLength(1)
        expect(result.tooLarge[0]).toMatchObject({ opId: 'huge', type: 'addObject' })
        expect(result.tooLarge[0].bytes).toBeGreaterThan(MAX_OP_BYTES)
        expect(unseen([huge], new Set())).toEqual([])
    })

    it('still carries 200 small ops in one batch', () => {
        const many = Array.from({ length: BATCH + 5 }, (_, i) => op(`s${i}`))
        expect(batchOf(many, new Set()).ops).toHaveLength(BATCH)
    })
})
