import { describe, expect, it } from 'vitest'
import { OBJECT_CARD_COLOR, buildObjectCards, buildScopeItems } from './objectCards.js'

const entity = (id, type = 'box', extra = {}) => ({ id, type, name: id, ...extra })

describe('objects on the canvas', () => {
    it('gives every root object a card', () => {
        const cards = buildObjectCards([entity('a'), entity('b'), entity('c')])
        expect(cards).toHaveLength(3)
        expect(cards.map((card) => card.entityId)).toEqual(['a', 'b', 'c'])
    })

    // A child carries a parent-relative transform and is drawn inside its
    // parent's group. Giving it a card of its own would draw the group AND its
    // parts side by side — the same double the room deliberately avoids.
    it('leaves grouped children to their parent', () => {
        const cards = buildObjectCards([entity('group'), entity('inside', 'box', { parentId: 'group' })])
        expect(cards.map((card) => card.entityId)).toEqual(['group'])
    })

    it('namespaces card ids so an object can never be mistaken for a node', () => {
        expect(buildObjectCards([entity('a')])[0].id).toBe('object:a')
    })

    it('carries no ports — the card is a plain box the wires cannot reach', () => {
        const card = buildObjectCards([entity('a')])[0]
        expect(card.typeId).toBeUndefined()
        expect(card.inputs).toBeUndefined()
        expect(card.outputs).toBeUndefined()
    })

    it('wears one hue for the whole lane, not a node family colour', () => {
        expect(buildObjectCards([entity('a')])[0].familyColor).toBe(OBJECT_CARD_COLOR)
    })

    describe('the layout is derived, never written to the document', () => {
        it('reads the same twice for the same input', () => {
            const once = buildObjectCards([entity('a'), entity('b')])
            const twice = buildObjectCards([entity('a'), entity('b')])
            expect(once).toEqual(twice)
        })

        it('never touches the entity it draws', () => {
            const source = entity('a')
            const before = JSON.stringify(source)
            buildObjectCards([source])
            expect(JSON.stringify(source)).toBe(before)
        })

        it('sits below the nodes rather than through them', () => {
            const nodes = [{ id: 'n', graphX: 40, graphY: 0 }]
            const card = buildObjectCards([entity('a')], { nodes })[0]
            expect(card.graphY).toBeGreaterThan(140)
            expect(card.graphX).toBe(40)
        })

        it('starts at the origin when there are no nodes to sit under', () => {
            const card = buildObjectCards([entity('a')], { nodes: [] })[0]
            expect(card.graphX).toBe(0)
            expect(card.graphY).toBe(0)
        })

        it('wraps into rows instead of one endless line', () => {
            const cards = buildObjectCards(Array.from({ length: 5 }, (_, i) => entity(`e${i}`)), { perRow: 4 })
            expect(cards[4].graphX).toBe(cards[0].graphX)
            expect(cards[4].graphY).toBeGreaterThan(cards[0].graphY)
        })
    })

    it('falls back to the type when an object has no name', () => {
        const card = buildObjectCards([{ id: 'x', type: 'sphere' }])[0]
        expect(card.label).toBe('sphere')
    })
})

describe('the outliner list — both lanes, one list', () => {
    it('puts objects beside nodes at the root', () => {
        const items = buildScopeItems({
            nodes: [{ id: 'n1', typeId: 'geom.cube' }],
            entities: [entity('e1')],
            scopeId: null
        })
        expect(items.map((item) => item.kind)).toEqual(['node', 'object'])
    })

    // Objects are root-scope citizens, the same rule the room draws by — inside
    // a container they would be a second copy of things standing somewhere else.
    it('shows no objects inside a container', () => {
        const items = buildScopeItems({
            nodes: [{ id: 'n1', typeId: 'geom.cube' }],
            entities: [entity('e1')],
            scopeId: 'some-geo'
        })
        expect(items.every((item) => item.kind === 'node')).toBe(true)
    })

    it('names an object by its type, so a nameless one is still readable', () => {
        const items = buildScopeItems({ entities: [{ id: 'e', type: 'portal' }] })
        expect(items[0].typeLabel).toBe('portal')
    })
})
