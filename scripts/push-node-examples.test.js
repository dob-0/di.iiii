import { describe, expect, it } from 'vitest'

import { NODE_EXAMPLE_FAMILIES } from '../src/project/graph/examples/nodes/index.js'
import { chunkFamily, slugFor, titleFor, buildChunkOps, MAX_EXAMPLES_PER_PROJECT } from '../src/project/graph/examples/nodes/layout.js'
import { normalizeBase } from './push-node-examples.mjs'

// The grid layout itself (chunking, cell sizing, no-overlap, determinism) is
// unit-tested directly against src/project/graph/examples/nodes/layout.js —
// see layout.test.js. This file covers what belongs to the SCRIPT: that it
// wires the real NODE_EXAMPLE_FAMILIES through that layout without losing
// or duplicating anything, and its own base-URL normalisation.
describe('push-node-examples: real families through the grid layout', () => {
    it('gives every chunk a stable, predictable slug and title', () => {
        for (const family of NODE_EXAMPLE_FAMILIES) {
            for (const chunk of chunkFamily(family)) {
                const expectedSlug = chunk.total > 1 ? `examples-${family.id}-${chunk.index}` : `examples-${family.id}`
                const expectedTitle = chunk.total > 1 ? `examples · ${family.label} ${chunk.index}/${chunk.total}` : `examples · ${family.label}`
                expect(slugFor(chunk)).toBe(expectedSlug)
                expect(titleFor(chunk)).toBe(expectedTitle)
            }
        }
    })

    it('a family bigger than MAX_EXAMPLES_PER_PROJECT splits into several chunks instead of one tower', () => {
        for (const family of NODE_EXAMPLE_FAMILIES) {
            const chunks = chunkFamily(family)
            const expectedChunks = Math.ceil(family.examples.length / MAX_EXAMPLES_PER_PROJECT)
            expect(chunks).toHaveLength(expectedChunks)
            expect(chunks.every((c) => c.examples.length <= MAX_EXAMPLES_PER_PROJECT)).toBe(true)
        }
    })

    it('builds one createNode/createEdge op per node/edge across every chunk, with opId === the id', () => {
        for (const family of NODE_EXAMPLE_FAMILIES) {
            let expectedNodeCount = 0
            let expectedEdgeCount = 0
            for (const example of family.examples) {
                const { nodes, edges } = example.build()
                expectedNodeCount += nodes.length
                expectedEdgeCount += edges.length
            }
            const ops = chunkFamily(family).flatMap((chunk) => buildChunkOps(chunk))
            const nodeOps = ops.filter((op) => op.type === 'createNode')
            const edgeOps = ops.filter((op) => op.type === 'createEdge')
            expect(nodeOps.length).toBe(expectedNodeCount)
            expect(edgeOps.length).toBe(expectedEdgeCount)
            for (const op of nodeOps) expect(op.opId).toBe(op.payload.node.id)
            for (const op of edgeOps) expect(op.opId).toBe(op.payload.edge.id)
        }
    })

    it('produces globally unique opIds within one family\'s chunks (idempotent to submit)', () => {
        for (const family of NODE_EXAMPLE_FAMILIES) {
            const ops = chunkFamily(family).flatMap((chunk) => buildChunkOps(chunk))
            const ids = ops.map((op) => op.opId)
            expect(new Set(ids).size).toBe(ids.length)
        }
    })

    it('re-running the same family produces the exact same createNode/createEdge opIds (idempotent create)', () => {
        for (const family of NODE_EXAMPLE_FAMILIES) {
            const idsOf = () => chunkFamily(family)
                .flatMap((chunk) => buildChunkOps(chunk))
                .filter((op) => op.type !== 'updateNode')
                .map((op) => op.opId)
            expect(idsOf()).toEqual(idsOf())
        }
    })
})

describe('normalizeBase', () => {
    const fakeFetch = (reachable) => async (url) => ({ ok: reachable(url) })

    it('prefers <base>/serverXR when it answers /api/health', async () => {
        const base = await normalizeBase('https://example.test', {
            fetchImpl: fakeFetch((url) => url === 'https://example.test/serverXR/api/health')
        })
        expect(base).toBe('https://example.test/serverXR')
    })

    it('falls back to <base> when only that answers', async () => {
        const base = await normalizeBase('https://example.test/', {
            fetchImpl: fakeFetch((url) => url === 'https://example.test/api/health')
        })
        expect(base).toBe('https://example.test')
    })

    it('throws when neither answers', async () => {
        await expect(normalizeBase('https://example.test', { fetchImpl: fakeFetch(() => false) }))
            .rejects.toThrow(/Could not reach/)
    })
})
