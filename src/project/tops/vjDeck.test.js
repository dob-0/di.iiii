import { describe, expect, it } from 'vitest'
import { TOP_OPERATORS } from './topOperators.js'
import { orderNetwork } from './topEngine.js'
import {
    BLEND_MODES,
    DECK_INPUTS,
    MAX_LAYERS,
    TAP_RESET_MS,
    VJ_DECK_TYPE,
    addColumn,
    addLayer,
    aliasWires,
    buildVjDeckNodeTypes,
    clearLayer,
    clipNodeId,
    createDeck,
    expandDeck,
    masterNodeId,
    normalizeClip,
    normalizeDeck,
    removeLayer,
    resolveAlias,
    setBlend,
    setBpm,
    setClip,
    setMaster,
    setOpacity,
    tapTempo,
    trigger,
    triggerColumn,
    updateClip
} from './vjDeck.js'

const assetClip = (asset, extra = {}) => ({ id: `c-${asset}`, kind: 'asset', asset, label: asset, ...extra })
const inputClip = (input, extra = {}) => ({ id: `c-${input}`, kind: 'input', input, ...extra })
const deckNode = (deck, extra = {}) => ({ id: 'deck', type: VJ_DECK_TYPE, values: { machine: '', deck, ...extra } })

describe('the deck shape', () => {
    it('a fresh deck is three empty layers of six slots at 120 bpm', () => {
        const deck = createDeck()
        expect(deck.bpm).toBe(120)
        expect(deck.master).toBe(1)
        expect(deck.columns).toBe(6)
        expect(deck.layers).toHaveLength(3)
        for (const layer of deck.layers) {
            expect(layer.active).toBe(-1)
            expect(layer.clips).toEqual([null, null, null, null, null, null])
            expect(layer.blend).toBe('0')
            expect(layer.opacity).toBe(1)
        }
        expect(new Set(deck.layers.map((layer) => layer.id)).size).toBe(3)
        // Plain JSON — it lives in node.values.
        expect(JSON.parse(JSON.stringify(deck))).toEqual(deck)
    })

    it('normalizes garbage without throwing', () => {
        expect(normalizeDeck(null).layers).toHaveLength(3)
        expect(normalizeDeck('nope').columns).toBe(6)
        const deck = normalizeDeck({
            bpm: 9000,
            master: -2,
            columns: 2,
            layers: [
                { id: 'a', opacity: 7, blend: '9', active: 1, clips: [assetClip('x'), { kind: 'asset' }, assetClip('overflow')] },
                { id: 'a', clips: [inputClip('in9'), inputClip('in2')], active: 5 },
                'junk'
            ]
        })
        expect(deck.bpm).toBe(300)
        expect(deck.master).toBe(0)
        expect(deck.layers).toHaveLength(2)
        expect(deck.layers[0].opacity).toBe(1)
        expect(deck.layers[0].blend).toBe('0')
        expect(deck.layers[0].clips).toHaveLength(2)
        expect(deck.layers[0].clips[1]).toBeNull()
        // Active points at an emptied slot → the layer is empty.
        expect(deck.layers[0].active).toBe(-1)
        expect(deck.layers[1].id).not.toBe('a')
        expect(deck.layers[1].clips[0]).toBeNull()
        expect(deck.layers[1].active).toBe(-1)
    })

    it('a clip clamps speed and keeps in before out', () => {
        const clip = normalizeClip(assetClip('a', { speed: 12, mode: '2', in: 0.8, out: 0.2 }))
        expect(clip.speed).toBe(4)
        expect(clip.mode).toBe('2')
        expect([clip.in, clip.out]).toEqual([0, 1])
        expect(normalizeClip({ kind: 'input', input: 'in5' })).toBeNull()
        expect(normalizeClip(inputClip('in3')).input).toBe('in3')
        expect(normalizeClip(assetClip('a')).id).toBe('c-a')
        expect(normalizeClip({ kind: 'asset', asset: 'a' }).id).toBeTruthy()
    })
})

describe('playing the deck', () => {
    it('setClip, trigger, retrigger and clear', () => {
        let deck = setClip(createDeck(), 0, 2, assetClip('dusk'))
        expect(deck.layers[0].clips[2].asset).toBe('dusk')
        deck = trigger(deck, 0, 2)
        expect(deck.layers[0].active).toBe(2)
        expect(deck.layers[0].trigger).toBe(1)
        deck = trigger(deck, 0, 2)
        expect(deck.layers[0].trigger).toBe(2)
        // An empty slot does nothing.
        expect(trigger(deck, 0, 3)).toEqual(deck)
        deck = clearLayer(deck, 0)
        expect(deck.layers[0].active).toBe(-1)
        expect(deck.layers[0].clips[2]).toBeTruthy()
    })

    it('emptying the playing slot stops the layer', () => {
        let deck = trigger(setClip(createDeck(), 1, 0, assetClip('a')), 1, 0)
        deck = setClip(deck, 1, 0, null)
        expect(deck.layers[1].active).toBe(-1)
        expect(deck.layers[1].clips[0]).toBeNull()
    })

    it('edits never mutate the deck they were given', () => {
        const deck = createDeck()
        const frozen = JSON.stringify(deck)
        trigger(setClip(deck, 0, 0, assetClip('a')), 0, 0)
        setOpacity(deck, 0, 0.2)
        addLayer(deck)
        expect(JSON.stringify(deck)).toBe(frozen)
    })

    it('a column trigger plays every layer there and empties the rest', () => {
        let deck = setClip(createDeck(), 0, 1, assetClip('a'))
        deck = setClip(deck, 2, 1, assetClip('b'))
        deck = trigger(setClip(deck, 1, 0, assetClip('c')), 1, 0)
        deck = triggerColumn(deck, 1)
        expect(deck.layers.map((layer) => layer.active)).toEqual([1, -1, 1])
        expect(deck.layers[0].trigger).toBe(1)
    })

    it('opacity, blend, master and bpm clamp', () => {
        let deck = setOpacity(createDeck(), 0, 1.5)
        expect(deck.layers[0].opacity).toBe(1)
        deck = setOpacity(deck, 0, 0.25)
        expect(deck.layers[0].opacity).toBe(0.25)
        deck = setBlend(deck, 0, 3)
        expect(deck.layers[0].blend).toBe('3')
        expect(setBlend(deck, 0, '11').layers[0].blend).toBe('3')
        expect(setMaster(deck, 2).master).toBe(1)
        expect(setBpm(deck, 124.04).bpm).toBe(124)
        expect(setBpm(deck, 1).bpm).toBe(20)
    })

    it('updateClip changes settings, never identity, and refuses in past out', () => {
        let deck = setClip(createDeck(), 0, 0, assetClip('a'))
        deck = updateClip(deck, 0, 0, { speed: 2, mode: '1', kind: 'input', asset: 'other', id: 'x' })
        const clip = deck.layers[0].clips[0]
        expect(clip).toMatchObject({ id: 'c-a', kind: 'asset', asset: 'a', speed: 2, mode: '1' })
        deck = updateClip(deck, 0, 0, { in: 0.4 })
        expect(deck.layers[0].clips[0].in).toBe(0.4)
        const refused = updateClip(deck, 0, 0, { out: 0.3 })
        expect(refused.layers[0].clips[0].out).toBe(1)
        expect(updateClip(deck, 0, 5, { speed: 3 }).layers[0].clips[5]).toBeNull()
    })

    it('layers and columns grow and shrink within bounds', () => {
        let deck = createDeck({ layers: 1 })
        expect(removeLayer(deck, 0).layers).toHaveLength(1)
        deck = addLayer(deck)
        expect(deck.layers).toHaveLength(2)
        expect(deck.layers[1].name).toBe('Layer 2')
        for (let i = 0; i < 20; i += 1) deck = addLayer(deck)
        expect(deck.layers).toHaveLength(MAX_LAYERS)
        expect(new Set(deck.layers.map((layer) => layer.id)).size).toBe(MAX_LAYERS)
        deck = removeLayer(deck, 0)
        deck = addLayer(deck)
        expect(new Set(deck.layers.map((layer) => layer.id)).size).toBe(MAX_LAYERS)
        deck = addColumn(deck)
        expect(deck.columns).toBe(7)
        expect(deck.layers.every((layer) => layer.clips.length === 7)).toBe(true)
    })
})

describe('tap tempo', () => {
    it('needs two taps, then averages the intervals', () => {
        let state = tapTempo([], 1000)
        expect(state.bpm).toBeNull()
        state = tapTempo(state.taps, 1500)
        expect(state.bpm).toBe(120)
        state = tapTempo(state.taps, 2000)
        state = tapTempo(state.taps, 2480)
        // (1480 / 3) ms per beat
        expect(state.bpm).toBe(121.6)
    })

    it('a long pause starts a new count', () => {
        const first = tapTempo(tapTempo([], 0).taps, 500)
        const restarted = tapTempo(first.taps, 500 + TAP_RESET_MS + 1)
        expect(restarted.taps).toHaveLength(1)
        expect(restarted.bpm).toBeNull()
    })

    it('keeps the last eight taps and clamps the tempo', () => {
        let state = { taps: [] }
        for (let i = 0; i < 20; i += 1) state = tapTempo(state.taps, i * 100)
        expect(state.taps).toHaveLength(8)
        expect(state.bpm).toBe(300)
        // A clock that went backwards restarts rather than dividing by nonsense.
        expect(tapTempo([1000], 900).taps).toEqual([900])
    })
})

describe('expandDeck', () => {
    it('an empty deck is one master level with nothing wired — black', () => {
        const out = expandDeck(deckNode(createDeck()))
        expect(out.nodes).toEqual([
            expect.objectContaining({ id: masterNodeId('deck'), type: 'top.level', values: expect.objectContaining({ opacity: 1 }) })
        ])
        expect(out.wires).toEqual([])
        expect(out.alias).toEqual({ deck: 'deck::master' })
    })

    it('a playing asset clip becomes top.clip → blend over black → master', () => {
        let deck = setClip(createDeck(), 0, 3, assetClip('dusk', { speed: 2, mode: '1', in: 0.1, out: 0.9 }))
        deck = setOpacity(setBlend(trigger(deck, 0, 3), 0, 2), 0, 0.5)
        deck = setMaster(deck, 0.8)
        const out = expandDeck(deckNode(deck, { machine: 'asuz' }))
        const byId = Object.fromEntries(out.nodes.map((node) => [node.id, node]))
        expect(byId[clipNodeId('deck', 0)]).toEqual({
            id: 'deck::L0::clip',
            type: 'top.clip',
            values: { machine: 'asuz', asset: 'dusk', speed: 2, mode: '1', in: 0.1, out: 0.9, trigger: 1, playing: true }
        })
        expect(byId['deck::L0::blend']).toEqual({ id: 'deck::L0::blend', type: 'top.blend', values: { machine: 'asuz', mode: '2', mix: 0.5 } })
        expect(byId['deck::master'].values).toMatchObject({ opacity: 0.8, machine: 'asuz' })
        expect(out.wires).toEqual([
            { from: 'deck::L0::clip', to: 'deck::L0::blend', port: 'b' },
            { from: 'deck::L0::blend', to: 'deck::master', port: 'a' }
        ])
    })

    it('layers chain bottom-up and empty layers are skipped', () => {
        let deck = createDeck({ layers: 3 })
        deck = trigger(setClip(deck, 0, 0, assetClip('bottom')), 0, 0)
        deck = setClip(deck, 1, 0, assetClip('parked')) // present but not playing
        deck = trigger(setClip(deck, 2, 1, assetClip('top')), 2, 1)
        const out = expandDeck(deckNode(deck))
        expect(out.nodes.map((node) => node.id)).toEqual(['deck::L0::clip', 'deck::L0::blend', 'deck::L2::clip', 'deck::L2::blend', 'deck::master'])
        expect(out.wires).toEqual([
            { from: 'deck::L0::clip', to: 'deck::L0::blend', port: 'b' },
            { from: 'deck::L0::blend', to: 'deck::L2::blend', port: 'a' },
            { from: 'deck::L2::clip', to: 'deck::L2::blend', port: 'b' },
            { from: 'deck::L2::blend', to: 'deck::master', port: 'a' }
        ])
    })

    it('an input clip reads whatever is wired into its port, and an unwired one is empty', () => {
        let deck = trigger(setClip(createDeck(), 0, 0, inputClip('in2')), 0, 0)
        deck = trigger(setClip(deck, 1, 0, inputClip('in4')), 1, 0)
        const wires = [
            { from: 'cam', to: 'deck', port: 'in2' },
            { from: 'noise', to: 'other-deck', port: 'in4' },
            { from: 'blur', to: 'deck', port: 'a' }
        ]
        const out = expandDeck(deckNode(deck), wires)
        expect(out.nodes.some((node) => node.type === 'top.clip')).toBe(false)
        expect(out.nodes.map((node) => node.id)).toEqual(['deck::L0::blend', 'deck::master'])
        expect(out.wires).toEqual([
            { from: 'cam', to: 'deck::L0::blend', port: 'b' },
            { from: 'deck::L0::blend', to: 'deck::master', port: 'a' }
        ])
    })

    it('every emitted operator is one the engine knows, with the shape it reads', () => {
        let deck = trigger(setClip(createDeck(), 0, 0, assetClip('a')), 0, 0)
        deck = trigger(setClip(deck, 1, 0, inputClip('in1')), 1, 0)
        const out = expandDeck(deckNode(deck), [{ from: 'x', to: 'deck', port: 'in1' }])
        for (const node of out.nodes) {
            if (node.type !== 'top.clip') expect(TOP_OPERATORS[node.type], node.type).toBeTruthy()
            expect(Object.keys(node).sort()).toEqual(['id', 'type', 'values'])
        }
        for (const wire of out.wires) {
            const reader = out.nodes.find((node) => node.id === wire.to)
            expect(TOP_OPERATORS[reader.type].inputs).toContain(wire.port)
        }
        expect(out.nodes.filter((node) => node.type === 'top.blend').every((node) => BLEND_MODES[Number(node.values.mode)])).toBe(true)
    })

    it('is pure: same input, same output, input untouched', () => {
        const deck = trigger(setClip(createDeck(), 0, 0, assetClip('a')), 0, 0)
        const node = deckNode(deck)
        const frozen = JSON.stringify(node)
        expect(expandDeck(node, [])).toEqual(expandDeck(node, []))
        expect(JSON.stringify(node)).toBe(frozen)
        expect(expandDeck(null)).toEqual({ nodes: [], wires: [], alias: {} })
    })

    it('a wire from the deck reads the master through alias, including deck into deck', () => {
        const a = { id: 'A', type: VJ_DECK_TYPE, values: { deck: trigger(setClip(createDeck(), 0, 0, assetClip('x')), 0, 0) } }
        const b = { id: 'B', type: VJ_DECK_TYPE, values: { deck: trigger(setClip(createDeck(), 0, 0, inputClip('in1')), 0, 0) } }
        const patch = [{ from: 'A', to: 'B', port: 'in1' }, { from: 'B', to: 'out', port: 'a' }]
        const ea = expandDeck(a, patch.filter((wire) => wire.to === 'A'))
        const eb = expandDeck(b, patch.filter((wire) => wire.to === 'B'))
        const alias = { ...ea.alias, ...eb.alias }
        const wires = aliasWires([...ea.wires, ...eb.wires, ...patch.filter((wire) => wire.to === 'out')], alias)
        expect(wires).toContainEqual({ from: 'A::master', to: 'B::L0::blend', port: 'b' })
        expect(wires).toContainEqual({ from: 'B::master', to: 'out', port: 'a' })
        expect(resolveAlias('A', alias)).toBe('A::master')
        expect(resolveAlias('zzz', alias)).toBe('zzz')
        // A malformed alias cycle ends instead of spinning.
        expect(['x', 'y']).toContain(resolveAlias('x', { x: 'y', y: 'x' }))
    })

    it('a feedback loop through the deck is a loop the engine can order', () => {
        // blur reads the deck; the deck plays blur on in1 — and a second layer
        // plays the deck's own output straight back into itself.
        let deck = trigger(setClip(createDeck(), 0, 0, inputClip('in1')), 0, 0)
        deck = trigger(setClip(deck, 1, 0, inputClip('in2')), 1, 0)
        const patch = [
            { from: 'deck', to: 'blur', port: 'a' },
            { from: 'blur', to: 'deck', port: 'in1' },
            { from: 'deck', to: 'deck', port: 'in2' }
        ]
        const out = expandDeck(deckNode(deck), patch.filter((wire) => wire.to === 'deck'))
        expect(out.wires).toContainEqual({ from: 'blur', to: 'deck::L0::blend', port: 'b' })
        expect(out.wires).toContainEqual({ from: 'deck::master', to: 'deck::L1::blend', port: 'b' })
        const nodes = [{ id: 'blur', type: 'top.blur', values: {} }, ...out.nodes]
        const wires = aliasWires([...out.wires, patch[0]], out.alias)
        expect(wires).toContainEqual({ from: 'deck::master', to: 'blur', port: 'a' })
        expect(wires.some((wire) => wire.from === 'deck' || wire.to === 'deck')).toBe(false)
        const order = orderNetwork(nodes, wires)
        expect(order.slice().sort()).toEqual(nodes.map((node) => node.id).sort())
    })
})

describe('the vj.deck node type', () => {
    it('is a picture node with four picture inputs and one picture out', () => {
        const type = buildVjDeckNodeTypes()[VJ_DECK_TYPE]
        expect(type.category).toBe('picture')
        expect(type.inputs.map((port) => port.id)).toEqual(DECK_INPUTS)
        expect(type.inputs.every((port) => port.type === 'texture')).toBe(true)
        expect(type.outputs).toEqual([{ id: 'out', type: 'texture', label: 'Picture' }])
        expect(normalizeDeck(type.defaultValues.deck)).toEqual(type.defaultValues.deck)
    })
})
