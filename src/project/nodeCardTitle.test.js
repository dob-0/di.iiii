import { describe, expect, it } from 'vitest'
import { createNode, getNodeCardTitle, getNodeType, operationLabelPatch } from './nodeRegistry.js'

// A person picks "Math" in the palette and must find a card that says Math.
// Before 2026-10-02 the card read only "Add" (and "Route" read only "Gate"):
// the nodecheck ranked it item 5. The card now reads the palette's name and
// the operation, while a name a person typed still reads alone.
describe('getNodeCardTitle', () => {
    it('reads the palette name and the operation on a fresh Math card', () => {
        expect(getNodeCardTitle(createNode('math.op'))).toBe('Math · Add')
    })

    it('reads the palette name and the operation on a fresh Route card', () => {
        expect(getNodeCardTitle(createNode('logic.route'))).toBe('Route · Gate')
    })

    it('follows the operation when the menu changes it', () => {
        const node = createNode('math.op')
        const next = { ...node, ...operationLabelPatch(node, 'values', { operation: 'multiply' }), values: { operation: 'multiply' } }
        expect(getNodeCardTitle(next)).toBe('Math · Multiply')
    })

    it('says what the card does even when the stored name lags the operation', () => {
        // An old document, or a card made before its operation was set.
        const node = { ...createNode('math.op'), values: { operation: 'sin' } }
        expect(node.label).toBe('Add')
        expect(getNodeCardTitle(node)).toBe('Math · Sin')
    })

    it('leaves a name a person typed alone', () => {
        const node = { ...createNode('math.op'), label: 'Speed × 2', values: { operation: 'multiply' } }
        expect(getNodeCardTitle(node)).toBe('Speed × 2')
    })

    it('never doubles the word on a card stored with the type name', () => {
        const node = { ...createNode('math.op'), label: 'Math' }
        expect(getNodeCardTitle(node)).toBe('Math · Add')
    })

    it('is just the name on every card without an operation menu', () => {
        for (const typeId of ['geom.cube', 'world.environment', 'world.background', 'math.mix']) {
            const node = createNode(typeId)
            expect(getNodeCardTitle(node), typeId).toBe(getNodeType(typeId).label)
        }
    })
})
