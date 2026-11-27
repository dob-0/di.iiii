import { describe, expect, it } from 'vitest'
import { applyProjectOps, invertProjectOps, normalizeProjectDocument } from '../../shared/projectSchema.js'
import { createDeck, setClip, setOpacity, trigger } from '../tops/vjDeck.js'
import { applyNodeValueOps, invertNodeValueOps } from './nodeValueOps.js'

// The short way must give what the long way gives. updatedAt is "now" in both, so it is left out of the comparison.
const deckWith = (change = (deck) => deck) => {
    let deck = createDeck({ layers: 3, columns: 4 })
    for (let l = 0; l < 3; l += 1) for (let c = 0; c < 4; c += 1) deck = setClip(deck, l, c, { kind: 'asset', asset: `a${l}${c}` })
    return change(deck)
}
const base = () => normalizeProjectDocument({
    projectMeta: { id: 'p', title: 'Show' },
    entities: [
        { id: 'e1', type: 'box', components: { transform: { position: [1, 2, 3] } } },
        { id: 'e2', type: 'box', components: { transform: { position: [4, 5, 6] } } }
    ],
    nodes: [
        { id: 'deck', typeId: 'vj.deck', label: 'Deck', values: { deck: deckWith(), midiMap: { bindings: [] }, midiConsole: 'apc40' } },
        { id: 'noise', typeId: 'top.noise', values: { speed: 1 } }
    ],
    edges: [{ id: 'w1', fromNodeId: 'noise', fromPort: 'out', toNodeId: 'deck', toPort: 'in1' }]
})
const write = (nodeId, values) => ({ opId: `op-${Math.random()}`, type: 'updateNode', payload: { nodeId, patch: { values } } })
const sameButTime = (a, b) => {
    const strip = (doc) => ({ ...doc, projectMeta: { ...doc.projectMeta, updatedAt: 0 } })
    expect(strip(a)).toEqual(strip(b))
}

describe('applyNodeValueOps', () => {
    it('gives the same document as applyProjectOps for deck writes, one or several in a batch', () => {
        const doc = base()
        const ops = [
            write('deck', { ...doc.nodes[0].values, deck: deckWith((d) => trigger(d, 0, 2)) }),
            write('deck', { deck: deckWith((d) => setOpacity(trigger(d, 1, 1), 2, 0.25)) }),
            write('noise', { speed: 3, extra: 'x' })
        ]
        const short = applyNodeValueOps(doc, ops)
        expect(short).not.toBeNull()
        sameButTime(short, applyProjectOps(doc, ops))
    })

    it('keeps the identity of everything it did not write', () => {
        const doc = base()
        const short = applyNodeValueOps(doc, [write('deck', { deck: deckWith((d) => trigger(d, 0, 1)) })])
        expect(short.entities).toBe(doc.entities)
        expect(short.edges).toBe(doc.edges)
        expect(short.assets).toBe(doc.assets)
        expect(short.nodes[1]).toBe(doc.nodes[1])
        expect(short.nodes[0]).not.toBe(doc.nodes[0])
        expect(doc.nodes[0].values.deck.layers[0].active).toBe(-1) // the document handed in is not changed
    })

    it('says null (take the long way) for anything that is not a values-only write of a node that exists', () => {
        const doc = base()
        expect(applyNodeValueOps(doc, [])).toBeNull()
        expect(applyNodeValueOps(doc, [write('missing', { a: 1 })])).toBeNull()
        expect(applyNodeValueOps(doc, [{ type: 'updateNode', payload: { nodeId: 'deck', patch: { label: 'x' } } }])).toBeNull()
        expect(applyNodeValueOps(doc, [{ type: 'updateNode', payload: { nodeId: 'deck', patch: { values: { a: 1 }, label: 'x' } } }])).toBeNull()
        expect(applyNodeValueOps(doc, [write('deck', { a: 1 }), { type: 'deleteNode', payload: { nodeId: 'noise' } }])).toBeNull()
        expect(applyNodeValueOps(null, [write('deck', { a: 1 })])).toBeNull()
    })
})

describe('invertNodeValueOps', () => {
    it('gives the same undo as invertProjectOps, and applying it restores the document', () => {
        const doc = base()
        const ops = [
            write('deck', { deck: deckWith((d) => trigger(d, 0, 2)) }),
            write('deck', { deck: deckWith((d) => trigger(d, 2, 3)), brandNew: 1 }),
            write('noise', { speed: 9 })
        ]
        const short = invertNodeValueOps(doc, ops)
        expect(short).toEqual(invertProjectOps(doc, ops))
        const there = applyNodeValueOps(doc, ops)
        const back = applyProjectOps(there, short)
        expect(back.nodes.find((node) => node.id === 'deck').values.deck).toEqual(doc.nodes[0].values.deck)
        expect(back.nodes.find((node) => node.id === 'noise').values.speed).toBe(1)
    })

    it('says null exactly when the short apply does', () => {
        const doc = base()
        expect(invertNodeValueOps(doc, [write('missing', { a: 1 })])).toBeNull()
        expect(invertNodeValueOps(doc, [{ type: 'deleteNode', payload: { nodeId: 'noise' } }])).toBeNull()
        expect(invertNodeValueOps(doc, [])).toBeNull()
    })
})
