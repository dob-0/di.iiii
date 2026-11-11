import { describe, it, expect } from 'vitest'
import { planRemove, removeOps, restoreOps } from './node-remove.mjs'

const document = {
    nodes: [{ id: 'deck', typeId: 'vj.deck' }, { id: 'vid', typeId: 'media.video', label: 'Video' }, { id: 'kid', typeId: 'x', parentId: 'par' }, { id: 'par', typeId: 'x' }],
    edges: [{ id: 'e1', fromNodeId: 'vid', toNodeId: 'deck' }, { id: 'e2', fromNodeId: 'par', toNodeId: 'deck' }]
}
describe('node-remove (owner N3885)', () => {
    it('takes the node with only its own edges, and can put both back', () => {
        const plan = planRemove({ document, nodeId: 'vid' })
        expect(plan.edges.map((e) => e.id)).toEqual(['e1'])
        expect(removeOps(plan)).toEqual([{ type: 'deleteNode', payload: { nodeId: 'vid' } }])
        expect(restoreOps(plan).map((o) => o.type)).toEqual(['createNode', 'createEdge'])
    })
    it('refuses the deck, a parent and a missing node', () => {
        expect(planRemove({ document, nodeId: 'deck' }).why).toMatch(/deck/)
        expect(planRemove({ document, nodeId: 'par' }).why).toMatch(/hang/)
        expect(planRemove({ document, nodeId: 'nope' }).why).toMatch(/no node/)
    })
})
