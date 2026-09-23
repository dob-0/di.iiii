import { describe, expect, it } from 'vitest'
import { OBJECT_CARD_COLOR, THING_INDENT, buildObjectCards, buildScopeItems, thingBandBounds } from './objectCards.js'

const thing = (id, type = 'box', extra = {}) => ({ id, type, name: id, ...extra })

describe('every thing is a card', () => {
    it('gives every thing a card', () => {
        const cards = buildObjectCards([thing('a'), thing('b'), thing('c')])
        expect(cards.map((card) => card.entityId)).toEqual(['a', 'b', 'c'])
    })

    // The branch this came from (8c58c29a) left grouped things out. Unit 6
    // keeps them: three boxes, two grouped, are four cards — three boxes and
    // the group — with the grouped two under the group's card.
    it('keeps grouped things, each under its group, one step in', () => {
        const cards = buildObjectCards([
            thing('loose'),
            thing('g', 'group'),
            thing('in1', 'box', { parentId: 'g' }),
            thing('in2', 'box', { parentId: 'g' })
        ])
        expect(cards.map((card) => card.entityId)).toEqual(['loose', 'g', 'in1', 'in2'])
        const byId = Object.fromEntries(cards.map((card) => [card.entityId, card]))
        expect(byId.in1.graphX).toBe(byId.g.graphX + THING_INDENT)
        expect(byId.in2.graphX).toBe(byId.g.graphX + THING_INDENT)
        expect(byId.in1.graphY).toBeGreaterThan(byId.g.graphY)
        expect(byId.in2.graphY).toBeGreaterThan(byId.in1.graphY)
        expect(byId.g.holds).toBe(2)
        expect(byId.in1.parentEntityId).toBe('g')
    })

    it('never puts two cards on one spot', () => {
        const cards = buildObjectCards([
            ...Array.from({ length: 6 }, (_, i) => thing(`t${i}`)),
            thing('g', 'group'),
            ...Array.from({ length: 3 }, (_, i) => thing(`c${i}`, 'box', { parentId: 'g' }))
        ])
        const spots = new Set(cards.map((card) => `${card.graphX},${card.graphY}`))
        expect(spots.size).toBe(cards.length)
    })

    it('namespaces card ids so a thing can never be mistaken for a node', () => {
        expect(buildObjectCards([thing('a')])[0].id).toBe('object:a')
    })

    it('carries no ports — the card is a plain box the wires cannot reach', () => {
        const card = buildObjectCards([thing('a')])[0]
        expect(card.typeId).toBeUndefined()
        expect(card.inputs).toBeUndefined()
        expect(card.outputs).toBeUndefined()
    })

    it('wears one hue for every thing, not a node family colour', () => {
        expect(buildObjectCards([thing('a')])[0].familyColor).toBe(OBJECT_CARD_COLOR)
    })

    it('names a lamp as a light, and a nameless thing by its kind', () => {
        const [lamp, bare] = buildObjectCards([{ id: 'l', type: 'pointLight' }, { id: 'x', type: 'sphere' }])
        expect(lamp.label).toBe('Point light')
        expect(bare.label).toBe('sphere')
    })

    describe('positions are worked out, never saved', () => {
        it('reads the same twice for the same input', () => {
            expect(buildObjectCards([thing('a'), thing('b')])).toEqual(buildObjectCards([thing('a'), thing('b')]))
        })

        it('never touches the thing it draws', () => {
            const source = thing('a', 'box', { parentId: 'gone' })
            const before = JSON.stringify(source)
            buildObjectCards([source])
            expect(JSON.stringify(source)).toBe(before)
        })

        // Seen 2026-09-23: with the band always below the lowest node, placing
        // a first node sent every thing card off-screen. A node that does not
        // stand on the band leaves it where it is.
        it('stays where it is when a node is placed clear of it', () => {
            const before = buildObjectCards([thing('a'), thing('b')])
            const after = buildObjectCards([thing('a'), thing('b')], { nodes: [{ id: 'n', graphX: -600, graphY: 400 }] })
            expect(after).toEqual(before)
        })

        it('moves below the nodes when a node stands on it — a card is never drawn through a node', () => {
            const nodes = [{ id: 'n', graphX: 40, graphY: 0 }]
            const card = buildObjectCards([thing('a')], { nodes, heightOf: () => 300 })[0]
            expect(card.graphY).toBeGreaterThan(300)
            expect(card.graphX).toBe(40)
        })

        it('starts at the origin when there are no nodes to sit under', () => {
            const card = buildObjectCards([thing('a')])[0]
            expect([card.graphX, card.graphY]).toEqual([0, 0])
        })

        it('wraps into rows instead of one endless line, clear of the tallest group above', () => {
            const cards = buildObjectCards([
                thing('g', 'group'),
                thing('c1', 'box', { parentId: 'g' }),
                thing('c2', 'box', { parentId: 'g' }),
                thing('b'), thing('c'), thing('d'),
                thing('e')
            ], { perRow: 4 })
            const byId = Object.fromEntries(cards.map((card) => [card.entityId, card]))
            expect(byId.e.graphX).toBe(byId.g.graphX)
            expect(byId.e.graphY).toBeGreaterThan(byId.c2.graphY)
        })
    })
})

describe('the band a new node steps aside from', () => {
    it('covers every card, with a margin', () => {
        const cards = buildObjectCards([thing('a'), thing('g', 'group'), thing('c', 'box', { parentId: 'g' })])
        const band = thingBandBounds(cards)
        for (const card of cards) {
            expect(card.graphX).toBeGreaterThan(band.minX)
            expect(card.graphY).toBeGreaterThan(band.minY)
            expect(card.graphX + 200).toBeLessThan(band.maxX)
            expect(card.graphY + 74).toBeLessThan(band.maxY)
        }
    })

    it('is nothing when there are no things', () => {
        expect(thingBandBounds([])).toBeNull()
    })
})

describe('the outliner list — both kinds, one list, things as a tree', () => {
    it('puts things beside nodes at the top', () => {
        const items = buildScopeItems({ nodes: [{ id: 'n1', typeId: 'geom.cube' }], entities: [thing('e1')] })
        expect(items.map((item) => item.kind)).toEqual(['node', 'object'])
    })

    it('lists a grouped thing right under its group, one level deeper', () => {
        const items = buildScopeItems({
            entities: [thing('b'), thing('in', 'box', { parentId: 'g' }), thing('g', 'group')]
        })
        expect(items.map((item) => `${item.id}:${item.depth}`)).toEqual(['b:0', 'g:0', 'in:1'])
    })

    // Things stand in the top room; inside a node they would be a second copy
    // of things standing somewhere else.
    it('shows no things inside a node', () => {
        const items = buildScopeItems({ nodes: [{ id: 'n1', typeId: 'geom.cube' }], entities: [thing('e1')], scopeId: 'geo' })
        expect(items.every((item) => item.kind === 'node')).toBe(true)
    })
})
