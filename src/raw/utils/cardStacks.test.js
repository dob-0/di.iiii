import { describe, expect, it } from 'vitest'
import { settleCardStacks, CARD_STACK_GAP } from './cardStacks.js'
import { cardHeight, getCardBox } from './cardGeometry.js'
import { buildAllNodesExample } from '../../project/graph/examples/allNodesExample.js'

const overlaps = (nodes) => {
    const boxes = nodes.map((node) => ({ node, ...getCardBox(node, nodes) }))
    const hits = []
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j]
            if ((a.node.parentId || null) !== (b.node.parentId || null)) continue
            if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
                hits.push(`${a.node.label || a.node.typeId} × ${b.node.label || b.node.typeId}`)
            }
        }
    }
    return hits
}

describe('settleCardStacks — no card hides under the next one', () => {
    it('the All Nodes Example had overlapping cards; settled, it has none', () => {
        const { nodes } = buildAllNodesExample({ workspaceTop: 64 })
        expect(overlaps(nodes).length).toBeGreaterThan(0)
        const settled = settleCardStacks(nodes, (node) => cardHeight(node, nodes))
        expect(overlaps(settled)).toEqual([])
        expect(settled).toHaveLength(nodes.length)
    })

    it('pushes down only as far as needed, never sideways or up', () => {
        const nodes = [
            { id: 'a', graphX: 0, graphY: 0 },
            { id: 'b', graphX: 0, graphY: 50 },
            { id: 'c', graphX: 0, graphY: 1000 },
            { id: 'd', graphX: 300, graphY: 50 },
        ]
        const settled = settleCardStacks(nodes, () => 100)
        expect(settled.find((n) => n.id === 'b').graphY).toBe(100 + CARD_STACK_GAP)
        expect(settled.find((n) => n.id === 'c').graphY).toBe(1000)
        expect(settled.find((n) => n.id === 'd')).toBe(nodes[3])
        expect(settled.every((n, i) => n.graphX === nodes[i].graphX)).toBe(true)
    })

    it('a layout with room to spare comes back as the same array', () => {
        const nodes = [{ id: 'a', graphX: 0, graphY: 0 }, { id: 'b', graphX: 0, graphY: 500 }]
        expect(settleCardStacks(nodes, () => 100)).toBe(nodes)
    })
})
