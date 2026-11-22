import { describe, expect, it } from 'vitest'
import { MAX_BATCH_BYTES, dropSuperseded, nextBatchSize } from './opBatch.js'

const op = (kb) => ({ type: 'updateNode', payload: { id: 'deck', patch: { values: { deck: 'x'.repeat(kb * 1024) } } } })

describe('nextBatchSize', () => {
    it('a small queue goes in one request, as before', () => {
        expect(nextBatchSize([op(1), op(1), op(1)])).toBe(3)
        expect(nextBatchSize([])).toBe(0)
        expect(nextBatchSize(undefined)).toBe(0)
    })

    it('805 deck writes of 13 KB (10.5 MB, over the server 10 MB limit) are cut into requests under the byte cap', () => {
        const queue = Array.from({ length: 805 }, () => op(13))
        let sent = 0
        let requests = 0
        while (sent < queue.length) {
            const n = nextBatchSize(queue.slice(sent))
            expect(n).toBeGreaterThan(0)
            expect(JSON.stringify(queue.slice(sent, sent + n)).length).toBeLessThanOrEqual(MAX_BATCH_BYTES + 1024)
            sent += n
            requests += 1
        }
        expect(sent).toBe(805)
        expect(requests).toBeGreaterThan(4)
    })

    it('one op bigger than the cap still goes, alone', () => {
        expect(nextBatchSize([op(3000), op(1)])).toBe(1)
    })

    it('never more than the op cap in one request', () => {
        expect(nextBatchSize(Array.from({ length: 2000 }, () => ({ type: 'noop' })), MAX_BATCH_BYTES, 500)).toBe(500)
    })
})

describe('dropSuperseded', () => {
    const write = (nodeId, values, opId) => ({ opId, type: 'updateNode', payload: { nodeId, patch: { values } } })

    it('a run of whole-values writes of one node keeps only the last', () => {
        const batch = [write('deck', { deck: 1, midiMap: 0 }, 'a'), write('deck', { deck: 2, midiMap: 0 }, 'b'), write('deck', { deck: 3, midiMap: 0 }, 'c')]
        expect(dropSuperseded(batch).map((op) => op.opId)).toEqual(['c'])
    })

    it('other nodes keep their own last write, and the order of what is kept does not change', () => {
        const batch = [write('deck', { deck: 1 }, 'a'), write('lamp', { on: true }, 'b'), write('deck', { deck: 2 }, 'c'), write('lamp', { on: false }, 'd')]
        expect(dropSuperseded(batch).map((op) => op.opId)).toEqual(['c', 'd'])
    })

    it('a write whose keys the later one does not all carry is kept (values merge on the server)', () => {
        const batch = [write('deck', { deck: 1, blackoutRestore: 0.5 }, 'a'), write('deck', { deck: 2 }, 'b')]
        expect(dropSuperseded(batch).map((op) => op.opId)).toEqual(['a', 'b'])
    })

    it('never reaches across another kind of op, and leaves patches that are not values-only alone', () => {
        const batch = [
            write('deck', { deck: 1 }, 'a'),
            { opId: 'x', type: 'deleteNode', payload: { nodeId: 'deck' } },
            write('deck', { deck: 2 }, 'b'),
            { opId: 'y', type: 'updateNode', payload: { nodeId: 'deck', patch: { label: 'Deck' } } },
            write('deck', { deck: 3 }, 'c')
        ]
        expect(dropSuperseded(batch).map((op) => op.opId)).toEqual(['a', 'x', 'b', 'y', 'c'])
    })

    it('one op, none, or not an array come back as they are', () => {
        const one = [write('deck', { deck: 1 }, 'a')]
        expect(dropSuperseded(one)).toBe(one)
        expect(dropSuperseded([])).toEqual([])
        expect(dropSuperseded(undefined)).toEqual([])
    })
})
