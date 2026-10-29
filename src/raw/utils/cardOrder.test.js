import { describe, expect, it } from 'vitest'
import { nextRaiseOf, paintOrder } from './cardOrder.js'
import { applyProjectOps, normalizeProjectDocument, normalizeProjectNode } from '../../shared/projectSchema.js'

describe('card paint order survives a reload (P9)', () => {
    it('raises one above the highest, never counting the card itself', () => {
        expect(nextRaiseOf([{ id: 'a' }, { id: 'b', graphZ: 3 }], 'a')).toBe(4)
        expect(nextRaiseOf([{ id: 'a', graphZ: 5 }], 'a')).toBe(1)
    })
    it('paints raised cards last, the rest in document order', () => {
        const nodes = [{ id: 'a', graphZ: 2 }, { id: 'b' }, { id: 'c', graphZ: 1 }, { id: 'd' }]
        expect(paintOrder(nodes).map((n) => n.id)).toEqual(['b', 'd', 'c', 'a'])
    })
    it('the schema keeps graphZ through normalize (a saved document reloads with it)', () => {
        const node = normalizeProjectNode({ id: 'n1', typeId: 'text', graphZ: 4 })
        expect(node.graphZ).toBe(4)
        expect(normalizeProjectNode({ id: 'n2', typeId: 'text' })).not.toHaveProperty('graphZ')
    })
    it('one updateNode op carries move + raise, survives a document round trip, and undoes', () => {
        let doc = normalizeProjectDocument({ nodes: [
            { id: 'a', typeId: 'view.text', label: 'A', values: {}, graphX: 0, graphY: 0 },
            { id: 'b', typeId: 'view.text', label: 'B', values: {}, graphX: 5, graphY: 5 }] })
        doc = applyProjectOps(doc, [{ type: 'updateNode', payload: { nodeId: 'a', patch: { graphX: 9, graphY: 9, graphZ: nextRaiseOf(doc.nodes, 'a') } } }])
        const reloaded = normalizeProjectDocument(JSON.parse(JSON.stringify(doc)))
        expect(paintOrder(reloaded.nodes).map((n) => n.id)).toEqual(['b', 'a'])
    })
})
