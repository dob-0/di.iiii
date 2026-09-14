import { describe, expect, it } from 'vitest'

import { NODE_EXAMPLE_FAMILIES } from '../src/project/graph/examples/nodes/index.js'
import { buildFamilyOps, slugFor, titleFor } from './push-node-examples.mjs'

describe('push-node-examples', () => {
    it('gives every family a stable, predictable slug and title', () => {
        for (const family of NODE_EXAMPLE_FAMILIES) {
            expect(slugFor(family)).toBe(`examples-${family.id}`)
            expect(titleFor(family)).toBe(`examples · ${family.label}`)
        }
    })

    it('builds one createNode/createEdge op per node/edge, with opId === the id', () => {
        for (const family of NODE_EXAMPLE_FAMILIES) {
            const ops = buildFamilyOps(family)
            let expectedNodeCount = 0
            let expectedEdgeCount = 0
            for (const example of family.examples) {
                const { nodes, edges } = example.build()
                expectedNodeCount += nodes.length
                expectedEdgeCount += edges.length
            }
            const nodeOps = ops.filter((op) => op.type === 'createNode')
            const edgeOps = ops.filter((op) => op.type === 'createEdge')
            expect(nodeOps.length).toBe(expectedNodeCount)
            expect(edgeOps.length).toBe(expectedEdgeCount)
            for (const op of nodeOps) expect(op.opId).toBe(op.payload.node.id)
            for (const op of edgeOps) expect(op.opId).toBe(op.payload.edge.id)
        }
    })

    it('offsets each example downward so stacked examples do not overlap', () => {
        const family = NODE_EXAMPLE_FAMILIES.find((f) => f.examples.length > 1)
        const ops = buildFamilyOps(family)
        const nodeOps = ops.filter((op) => op.type === 'createNode')
        // Every example after the first must be offset — at least one node
        // in the batch should sit below the single-example grid's own top
        // band (helpers.js's WORKSPACE_TOP + a couple of ROWs).
        const maxGraphY = Math.max(...nodeOps.map((op) => op.payload.node.graphY))
        expect(maxGraphY).toBeGreaterThan(1000)
    })

    it('produces globally unique opIds within one family (idempotent to submit)', () => {
        for (const family of NODE_EXAMPLE_FAMILIES) {
            const ops = buildFamilyOps(family)
            const ids = ops.map((op) => op.opId)
            expect(new Set(ids).size).toBe(ids.length)
        }
    })
})
