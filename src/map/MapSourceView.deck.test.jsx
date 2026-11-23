import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { normalizeMappingSurface } from '../shared/projectSchema.js'
import { createDeck, masterNodeId, setClip, trigger, setMaster } from '../project/tops/vjDeck.js'

const useTopNetwork = vi.fn(() => ({ error: '' }))
vi.mock('../project/tops/useTopNetwork.js', async () => {
    const actual = await vi.importActual('../project/tops/useTopNetwork.js')
    return { ...actual, useTopNetwork: (options) => useTopNetwork(options) }
})
const { default: MapSourceView } = await import('./MapSourceView.jsx')
const { toTopNetwork } = await import('../project/tops/useTopNetwork.js')

const docWith = (deck) => ({ nodes: [{ id: 'deck1', typeId: 'vj.deck', values: { deck } }], edges: [] })
const surfaceOf = (ref) => normalizeMappingSurface({ id: 's1', resolution: [640, 360], source: { kind: 'network', ref } })
const lastCall = () => useTopNetwork.mock.calls.at(-1)[0]

describe('a VJ deck chosen as a surface source', () => {
    it('draws the deck master node, not the (expanded away) deck id', () => {
        const network = toTopNetwork(docWith(createDeck({ layers: 2 })))
        render(<MapSourceView surface={surfaceOf('deck1')} spaceId="lab" network={network} projectId="p1" live />)
        expect(lastCall().show).toBe(masterNodeId('deck1'))
        expect(lastCall().network.nodes.some((node) => node.id === masterNodeId('deck1'))).toBe(true)
    })

    it('an empty deck is black, not an error: master is present with no clip operators', () => {
        const network = toTopNetwork(docWith(createDeck({ layers: 2 })))
        expect(network.nodes.map((node) => node.type)).toEqual(['top.level'])
        const view = render(<MapSourceView surface={surfaceOf('deck1')} spaceId="lab" network={network} projectId="p1" live />)
        expect(view.container.textContent).not.toMatch(/gone|error/i)
    })

    it('a change on the deck changes what the wall runs', () => {
        let deck = createDeck({ layers: 2 })
        const before = toTopNetwork(docWith(deck))
        deck = setClip(deck, 0, 0, { kind: 'asset', asset: 'clip.mp4' })
        deck = trigger(deck, 0, 0)
        deck = setMaster(deck, 0.4)
        const after = toTopNetwork(docWith(deck))
        expect(after.nodes.length).toBeGreaterThan(before.nodes.length)
        expect(after.nodes.find((node) => node.id === masterNodeId('deck1')).values)
            .not.toEqual(before.nodes.find((node) => node.id === masterNodeId('deck1')).values)
        render(<MapSourceView surface={surfaceOf('deck1')} spaceId="lab" network={after} projectId="p1" live />)
        expect(lastCall().show).toBe(masterNodeId('deck1'))
    })

    it('a deck that is gone says so', () => {
        const view = render(<MapSourceView surface={surfaceOf('nope')} spaceId="lab" network={toTopNetwork(docWith(createDeck()))} projectId="p1" live />)
        expect(view.container.textContent).toMatch(/gone/)
    })
})
