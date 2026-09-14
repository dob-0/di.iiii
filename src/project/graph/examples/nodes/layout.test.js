import { describe, expect, it } from 'vitest'
import { createEdge, createNode } from '../../../nodeRegistry.js'
import { getCardBox } from '../../../../raw/utils/cardGeometry.js'
import {
    GRID_COLS,
    MAX_EXAMPLES_PER_PROJECT,
    chunkFamily,
    slugFor,
    titleFor,
    captionFor,
    exampleBBox,
    layoutChunk,
    moveOpId,
    buildChunkOps
} from './layout.js'

// A tiny synthetic example: one Number card. Real typeId (registered), so
// getCardBox/cardHeight measure a real, non-zero box rather than a guess.
const numberExample = (id, title = `Number ${id}`) => ({
    typeId: 'value.number',
    title,
    story: `A number example, ${id}.`,
    build: () => {
        const node = createNode('value.number', { id: `ex_number_${id}`, graphX: 0, graphY: 0, values: { value: id } })
        return { nodes: [node], edges: [] }
    },
    expect: []
})

// A two-card example (source -> star), to prove overlap-checking sees real
// multi-card examples too.
const wiredExample = (id) => ({
    typeId: 'math.op',
    title: `Wired ${id}`,
    story: `A number driving a math op, ${id}.`,
    build: () => {
        const src = createNode('value.number', { id: `ex_wired_${id}_src`, graphX: 0, graphY: 0, values: { value: id } })
        const op = createNode('math.op', { id: `ex_wired_${id}_op`, graphX: 260, graphY: 0 })
        const edge = createEdge(src.id, 'out', op.id, 'a', { id: `ex_wired_${id}_e` })
        return { nodes: [src, op], edges: [edge] }
    },
    expect: []
})

const makeFamily = (count, { id = 'test', label = 'test', factory = numberExample } = {}) => ({
    id,
    label,
    examples: Array.from({ length: count }, (_, i) => factory(i))
})

describe('chunkFamily (docs/ai/audits/2026-09-14-raw-fix-plan.md round 2, examples wave)', () => {
    it('keeps a family that fits in one chunk', () => {
        const family = makeFamily(8)
        const chunks = chunkFamily(family, MAX_EXAMPLES_PER_PROJECT)
        expect(chunks).toHaveLength(1)
        expect(chunks[0].total).toBe(1)
        expect(chunks[0].examples).toHaveLength(8)
    })

    it('splits a family bigger than maxPerProject into even-ish chunks, in order', () => {
        const family = makeFamily(38, { label: 'numbers' })
        const chunks = chunkFamily(family, 12)
        expect(chunks).toHaveLength(4) // ceil(38/12)
        expect(chunks.map((c) => c.examples.length)).toEqual([12, 12, 12, 2])
        expect(chunks.every((c) => c.examples.length <= 12)).toBe(true)
        // order preserved: concatenating chunks reproduces the family's own list
        const flattened = chunks.flatMap((c) => c.examples)
        expect(flattened.map((e) => e.title)).toEqual(family.examples.map((e) => e.title))
        chunks.forEach((c, i) => {
            expect(c.index).toBe(i + 1)
            expect(c.total).toBe(4)
        })
    })

    it('an exact multiple never produces a trailing empty chunk', () => {
        const family = makeFamily(24)
        const chunks = chunkFamily(family, 12)
        expect(chunks).toHaveLength(2)
        expect(chunks.every((c) => c.examples.length === 12)).toBe(true)
    })

    it('slugFor/titleFor: plain for one chunk, numbered "i/total" for a split family', () => {
        const single = chunkFamily(makeFamily(3, { id: 'watch', label: 'watch' }), 12)[0]
        expect(slugFor(single)).toBe('examples-watch')
        expect(titleFor(single)).toBe('examples · watch')

        const split = chunkFamily(makeFamily(38, { id: 'numbers', label: 'numbers' }), 12)
        const first = split[0]
        const last = split[split.length - 1]
        expect(slugFor(first)).toBe('examples-numbers-1')
        expect(titleFor(first)).toBe('examples · numbers 1/4')
        expect(slugFor(last)).toBe('examples-numbers-4')
        expect(titleFor(last)).toBe('examples · numbers 4/4')
    })
})

describe('captionFor', () => {
    it('joins the title and a clipped story', () => {
        const caption = captionFor({ title: 'Number', story: 'A number you can type or wire.' })
        expect(caption).toBe('Number — A number you can type or wire.')
    })

    it('falls back to the bare title when there is no story', () => {
        expect(captionFor({ title: 'Number', story: '' })).toBe('Number')
    })

    it('clips a long story with an ellipsis rather than running on', () => {
        const story = 'x'.repeat(200)
        const caption = captionFor({ title: 'Number', story })
        expect(caption.startsWith('Number — ')).toBe(true)
        expect(caption.endsWith('…')).toBe(true)
        expect(caption.length).toBeLessThan(100)
    })
})

describe('exampleBBox — cell sizes come from cardGeometry, not a guess', () => {
    it('a single-card example\'s box IS that card\'s real getCardBox', () => {
        const node = createNode('value.number', { id: 'ex_bbox_solo', graphX: 40, graphY: 20 })
        const bbox = exampleBBox([node])
        const box = getCardBox(node, [node])
        expect(bbox).toEqual({ minX: box.x, minY: box.y, width: box.width, height: box.height })
    })

    it('a multi-card example\'s box spans every root card', () => {
        const a = createNode('value.number', { id: 'ex_bbox_a', graphX: 0, graphY: 0 })
        const b = createNode('math.op', { id: 'ex_bbox_b', graphX: 260, graphY: 0 })
        const bbox = exampleBBox([a, b])
        const boxA = getCardBox(a, [a, b])
        const boxB = getCardBox(b, [a, b])
        expect(bbox.minX).toBe(Math.min(boxA.x, boxB.x))
        expect(bbox.width).toBe(Math.max(boxA.x + boxA.width, boxB.x + boxB.width) - bbox.minX)
    })
})

describe('layoutChunk', () => {
    it('places examples left-to-right then top-to-bottom at the requested column count', () => {
        const chunk = chunkFamily(makeFamily(6), 12)[0]
        const laidOut = layoutChunk(chunk, { cols: 4 })
        expect(laidOut.map((e) => [e.col, e.row])).toEqual([
            [0, 0], [1, 0], [2, 0], [3, 0],
            [0, 1], [1, 1]
        ])
    })

    it('is deterministic: the same chunk and options always produce the same boxes', () => {
        const chunk = chunkFamily(makeFamily(9, { factory: wiredExample }), 12)[0]
        const first = layoutChunk(chunk, { cols: 4 })
        const second = layoutChunk(chunk, { cols: 4 })
        const positions = (laidOut) => laidOut.map((e) => e.nodes.map((n) => [n.id, n.graphX, n.graphY, n.label]))
        expect(positions(first)).toEqual(positions(second))
    })

    it('never overlaps two cards, within one example or across the grid', () => {
        // Mixed single- and two-card examples, exercising both the "biggest
        // column/row wins" sizing and the multi-card bbox path together.
        const family = makeFamily(0)
        family.examples = [
            ...Array.from({ length: 5 }, (_, i) => numberExample(`n${i}`)),
            ...Array.from({ length: 5 }, (_, i) => wiredExample(`w${i}`))
        ]
        const chunk = chunkFamily(family, 12)[0]
        const laidOut = layoutChunk(chunk, { cols: 4 })
        const allNodes = laidOut.flatMap((e) => e.nodes)
        const boxes = allNodes.map((node) => getCardBox(node, allNodes))
        for (let i = 0; i < boxes.length; i += 1) {
            for (let j = i + 1; j < boxes.length; j += 1) {
                const a = boxes[i]
                const b = boxes[j]
                const overlap = a.x < b.x + b.width && b.x < a.x + a.width
                    && a.y < b.y + b.height && b.y < a.y + a.height
                expect(overlap, `${allNodes[i].id} overlaps ${allNodes[j].id}`).toBe(false)
            }
        }
    })

    it('labels each example\'s first (top-left) card with its caption', () => {
        const chunk = chunkFamily(makeFamily(2, { factory: wiredExample }), 12)[0]
        const laidOut = layoutChunk(chunk, { cols: 4 })
        for (const { nodes, example } of laidOut) {
            const sorted = [...nodes].sort((a, b) => (a.graphY - b.graphY) || (a.graphX - b.graphX))
            expect(sorted[0].label).toBe(captionFor(example))
            expect(sorted[1].label ?? null).not.toBe(captionFor(example))
        }
    })

    it('respects a narrower --cols', () => {
        const chunk = chunkFamily(makeFamily(3), 12)[0]
        const laidOut = layoutChunk(chunk, { cols: 1 })
        expect(laidOut.map((e) => e.row)).toEqual([0, 1, 2])
        expect(laidOut.every((e) => e.col === 0)).toBe(true)
    })
})

describe('buildChunkOps', () => {
    it('orders createNode, then createEdge, then updateNode moves', () => {
        const chunk = chunkFamily(makeFamily(2, { factory: wiredExample }), 12)[0]
        const ops = buildChunkOps(chunk, { cols: 4 })
        const types = ops.map((op) => op.type)
        const lastCreateNode = types.lastIndexOf('createNode')
        const firstCreateEdge = types.indexOf('createEdge')
        const lastCreateEdge = types.lastIndexOf('createEdge')
        const firstUpdateNode = types.indexOf('updateNode')
        expect(firstCreateEdge).toBeGreaterThan(lastCreateNode)
        expect(firstUpdateNode).toBeGreaterThan(lastCreateEdge)
    })

    it('moveOpId changes only when the target position or label changes — idempotent re-push', () => {
        const node = createNode('value.number', { id: 'ex_move_a', graphX: 100, graphY: 200, label: 'Number' })
        const sameAgain = { ...node }
        expect(moveOpId(node)).toBe(moveOpId(sameAgain))
        expect(moveOpId({ ...node, graphX: 101 })).not.toBe(moveOpId(node))
        expect(moveOpId({ ...node, label: 'Different' })).not.toBe(moveOpId(node))
    })

    it('every createNode/createEdge opId is the node/edge\'s own id (first-push idempotency)', () => {
        const chunk = chunkFamily(makeFamily(2, { factory: wiredExample }), 12)[0]
        const ops = buildChunkOps(chunk, { cols: 4 })
        for (const op of ops) {
            if (op.type === 'createNode') expect(op.opId).toBe(op.payload.node.id)
            if (op.type === 'createEdge') expect(op.opId).toBe(op.payload.edge.id)
        }
    })
})

describe('GRID_COLS default', () => {
    it('is 4, matching the fix-plan default', () => {
        expect(GRID_COLS).toBe(4)
    })
})
