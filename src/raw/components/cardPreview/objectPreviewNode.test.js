import { describe, expect, it } from 'vitest'
import { objectPreviewNode } from './objectPreviewNode.js'
import { buildObjectCards, THING_CARD_HEIGHT, THING_CARD_PREVIEW_HEIGHT } from '../../utils/objectCards.js'
import { hasCardPreview } from './previewTypes.js'

describe('a thing drawn as a picture on its card', () => {
    it('a box is a Cube with its own size and colour', () => {
        const node = objectPreviewNode({ id: 'b', type: 'box', name: 'Box', components: { primitive: { size: [2, 1, 1] }, appearance: { color: '#ff0000' } } })
        expect(node.typeId).toBe('geom.cube')
        expect(hasCardPreview(node.typeId)).toBe(true)
        expect(node.values).toEqual({ color: '#ff0000', size: [2, 1, 1] })
    })
    it('a type with no node twin stays a plain card', () => {
        expect(objectPreviewNode({ id: 'l', type: 'light', components: {} })).toBeNull()
    })
    it('a card with a picture is taller, and the next card stacks under it', () => {
        const cards = buildObjectCards([
            { id: 'g', type: 'group', name: 'G', components: {} },
            { id: 'a', type: 'box', name: 'A', parentId: 'g', components: {} },
            { id: 'b', type: 'sphere', name: 'B', parentId: 'g', components: {} }
        ])
        const byId = Object.fromEntries(cards.map((c) => [c.entityId, c]))
        expect(byId.g.height).toBe(THING_CARD_HEIGHT)
        expect(byId.a.height).toBe(THING_CARD_PREVIEW_HEIGHT)
        expect(byId.b.graphY).toBeGreaterThanOrEqual(byId.a.graphY + THING_CARD_PREVIEW_HEIGHT)
    })
})
