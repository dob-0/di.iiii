import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { CARD_WIDTH, MIN_CARD_WIDTH, cardHeight, cardMinHeight, cardSizeOf, cardWidth, cardContentLayout } from './cardGeometry.js'

const require = createRequire(import.meta.url)
const { applyProjectOps, normalizeProjectDocument } = require('../../../shared/projectSchema.cjs')

const text = (content, cardSize) => ({ id: 't', typeId: 'view.text', values: { content, ...(cardSize ? { cardSize } : {}) }, graphX: 0, graphY: 0 })
const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n')

describe('a resized card (values.cardSize)', () => {
    it('has the automatic size when there is none, or when it is null', () => {
        expect(cardWidth(text(lines(3)))).toBe(CARD_WIDTH)
        expect(cardSizeOf({ values: { cardSize: null } })).toBeNull()
        expect(cardSizeOf({ values: { cardSize: { w: 'x', h: 3 } } })).toBeNull()
    })
    it('takes the stored width and height, never below the minimum that keeps title and ports', () => {
        const node = text(lines(3), { w: 320, h: 400 })
        expect(cardWidth(node)).toBe(320)
        expect(cardHeight(node)).toBe(400)
        const tiny = text(lines(3), { w: 10, h: 10 })
        expect(cardWidth(tiny)).toBe(MIN_CARD_WIDTH)
        expect(cardHeight(tiny)).toBe(cardMinHeight(tiny))
    })
    it('shows more of a long text card the taller it is, and says "+ N more" only for the rest', () => {
        const auto = cardContentLayout(text(lines(20)))
        const small = cardContentLayout(text(lines(20), { w: 200, h: 200 }))
        const tall = cardContentLayout(text(lines(20), { w: 200, h: 600 }))
        expect(auto.lines.length).toBe(6)
        expect(tall.lines.length).toBeGreaterThan(small.lines.length)
        expect(tall.lines.length).toBeGreaterThan(auto.lines.length)
        expect(tall.more).toBe(20 - tall.lines.length)
    })
})

describe('the project schema keeps the stored size', () => {
    it('keeps values.cardSize through an updateNode op, and a null gives it back', () => {
        let doc = normalizeProjectDocument({ nodes: [{ id: 'a', typeId: 'view.text', label: 'A', values: { content: 'x' }, graphX: 0, graphY: 0 }] })
        doc = applyProjectOps(doc, [{ type: 'updateNode', payload: { nodeId: 'a', patch: { values: { cardSize: { w: 300, h: 220 } } } } }])
        expect(doc.nodes.find((n) => n.id === 'a').values).toMatchObject({ content: 'x', cardSize: { w: 300, h: 220 } })
        doc = applyProjectOps(doc, [{ type: 'updateNode', payload: { nodeId: 'a', patch: { values: { cardSize: null } } } }])
        expect(cardSizeOf(doc.nodes.find((n) => n.id === 'a'))).toBeNull()
    })
})
