import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import VjDeckView from '../../raw/components/vjDeck/VjDeckView.jsx'
import { createDeck, setClip, trigger } from '../../project/tops/vjDeck.js'
import { WRITE_GAP_MS, useDeckMidi } from './useDeckMidi.js'

// A fake Web MIDI access at the navigator boundary: one K2 in, one K2 out.
const fakeAccess = () => {
    const sent = []
    const input = { id: 'in-k2', name: 'XONE:K2 MIDI 1', manufacturer: 'Allen & Heath', onmidimessage: null }
    const output = { id: 'out-k2', name: 'XONE:K2 MIDI 1', manufacturer: 'Allen & Heath', state: 'connected', send: (data) => sent.push([...data]) }
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]), onstatechange: null }
    return { sent, input, output, access }
}
const install = (fake) => {
    const request = vi.fn(() => Promise.resolve(fake.access))
    vi.stubGlobal('navigator', { ...globalThis.navigator, requestMIDIAccess: request })
    return request
}
const flushAsync = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const send = (fake, data) => act(() => fake.input.onmidimessage({ data }))
const FADER_2 = 17 // layer 2 opacity (cc, channel 15)
const cc = (number, value) => [0xbe, number, value]

const playedDeck = () => {
    let deck = createDeck({ layers: 2, columns: 4 })
    for (let layer = 0; layer < 2; layer += 1) {
        for (let column = 0; column < 4; column += 1) deck = setClip(deck, layer, column, { id: `c${layer}${column}`, kind: 'input', input: `in${column + 1}` })
    }
    return trigger(deck, 0, 0)
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }) })
afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

const mount = async (props) => {
    const fake = fakeAccess()
    const request = install(fake)
    const writes = []
    const view = renderHook((hookProps) => useDeckMidi({ write: (deck) => writes.push(deck), onPatch: () => {}, enabled: true, deckId: 'deck-1', ...hookProps }), {
        initialProps: { deck: playedDeck(), ...props }
    })
    await flushAsync()
    return { fake, request, writes, ...view }
}

describe('coalescing', () => {
    it('a fader sweep is a handful of writes, the last one is the final value, and the ahead-of-document deck never loses a message', async () => {
        const { fake, writes } = await mount()
        send(fake, cc(FADER_2, 127)) // arrives at the deck's own 1: pickup engaged
        writes.length = 0
        for (let value = 126; value >= 0; value -= 1) {
            send(fake, cc(FADER_2, value))
            if (value % 8 === 0) act(() => { vi.advanceTimersByTime(8) })
        }
        act(() => { vi.advanceTimersByTime(WRITE_GAP_MS * 2) })
        expect(writes.length).toBeLessThan(40)
        expect(writes.length).toBeGreaterThan(0)
        expect(writes.at(-1).layers[1].opacity).toBe(0)
    })

    it('a continuous value waits for the trailing write, and exactly one is written per gap', async () => {
        const { fake, writes } = await mount()
        send(fake, cc(FADER_2, 127))
        act(() => { vi.advanceTimersByTime(WRITE_GAP_MS) })
        writes.length = 0
        for (const value of [100, 90, 80, 70]) send(fake, cc(FADER_2, value))
        // the first moved the document at once (idle), the rest wait together
        expect(writes).toHaveLength(1)
        act(() => { vi.advanceTimersByTime(WRITE_GAP_MS) })
        expect(writes).toHaveLength(2)
        expect(writes.at(-1).layers[1].opacity).toBeCloseTo(70 / 127)
    })

    it('a discrete action flushes the pending fader value first, in order', async () => {
        const { fake, writes } = await mount()
        send(fake, cc(FADER_2, 127))
        act(() => { vi.advanceTimersByTime(WRITE_GAP_MS) })
        writes.length = 0
        send(fake, cc(FADER_2, 100)) // written at once (idle)
        send(fake, cc(FADER_2, 60)) // pending
        send(fake, [0x9e, 37, 127]) // matrix: layer 1, column 2 — a clip trigger
        expect(writes.map((deck) => [deck.layers[1].opacity.toFixed(2), deck.layers[0].active])).toEqual([
            [(100 / 127).toFixed(2), 0],
            [(60 / 127).toFixed(2), 0],
            [(60 / 127).toFixed(2), 1]
        ])
        act(() => { vi.advanceTimersByTime(WRITE_GAP_MS * 3) })
        expect(writes).toHaveLength(3) // nothing left pending
    })

    it('two messages before React hands the deck back both land', async () => {
        const { fake, writes } = await mount()
        send(fake, [0x9e, 37, 127]) // layer 1 column 2
        send(fake, [0x9e, 33, 127]) // layer 2 column 2 (matrix F)
        const last = writes.at(-1)
        expect([last.layers[0].active, last.layers[1].active]).toEqual([1, 1])
    })

    it('flushes the pending value when the hook unmounts', async () => {
        const { fake, writes, unmount } = await mount()
        send(fake, cc(FADER_2, 127))
        send(fake, cc(FADER_2, 90))
        send(fake, cc(FADER_2, 50))
        const count = writes.length
        unmount()
        expect(writes.length).toBe(count + 1)
        expect(writes.at(-1).layers[1].opacity).toBeCloseTo(50 / 127)
    })
})

describe('the deck prop', () => {
    it('an older prop (an echo of an earlier write) does not undo a later message', async () => {
        const { fake, writes, rerender } = await mount()
        send(fake, [0x9e, 37, 127]) // write 1: layer 1 column 2 plays
        send(fake, [0x9e, 33, 127]) // write 2: layer 2 column 2 plays
        expect(writes).toHaveLength(2)
        rerender({ deck: writes[0] }) // the document hands back write 1 while write 2 is in flight
        send(fake, [0x9e, 36, 127]) // layer 1 column 1 — must be computed from write 2, not write 1
        const last = writes.at(-1)
        expect([last.layers[0].active, last.layers[1].active]).toEqual([0, 1])
        rerender({ deck: writes[1] })
        rerender({ deck: writes[2] })
        send(fake, [0x9e, 38, 127]) // layer 1 column 3
        expect(writes.at(-1).layers[0].active).toBe(2)
        expect(writes.at(-1).layers[1].active).toBe(1)
    })

    it('a deck that is not an echo of ours (another window) is adopted, and pickup starts over', async () => {
        const { fake, writes, rerender } = await mount()
        send(fake, cc(FADER_2, 127))
        send(fake, cc(FADER_2, 0)) // engaged
        act(() => { vi.advanceTimersByTime(WRITE_GAP_MS) })
        expect(writes.at(-1).layers[1].opacity).toBe(0)
        // someone else puts the opacity at 1 and plays layer 1 column 3
        const foreign = trigger(playedDeck(), 0, 3) // layer 1 plays column 4 there
        rerender({ deck: foreign })
        writes.length = 0
        send(fake, cc(FADER_2, 0)) // fader is far from the deck's 1: pickup, nothing moves
        expect(writes).toHaveLength(0)
        send(fake, [0x9e, 33, 127]) // layer 2 column 2: computed from the foreign deck
        expect(writes.at(-1).layers[1].active).toBe(1)
        expect(writes.at(-1).layers[0].active).toBe(3)
        expect(writes.at(-1).layers[1].opacity).toBe(1)
    })
})

describe('soft takeover in the hook', () => {
    it('the first touch of a far fader does not move the layer', async () => {
        const { fake, writes } = await mount()
        send(fake, cc(FADER_2, 10))
        expect(writes).toHaveLength(0)
        send(fake, cc(FADER_2, 126)) // within 3/127 of 1
        expect(writes.length).toBeGreaterThan(0)
    })
})

describe('listeners, LEDs and Learn', () => {
    it('removes its MIDI listeners on unmount', async () => {
        const { fake, unmount } = await mount()
        expect(fake.input.onmidimessage).toBeTypeOf('function')
        expect(fake.access.onstatechange).toBeTypeOf('function')
        unmount()
        expect(fake.input.onmidimessage).toBeNull()
        expect(fake.access.onstatechange).toBeNull()
    })

    it('lights the K2, then lights it again after the output went away and came back', async () => {
        const { fake } = await mount()
        const first = fake.sent.length
        expect(first).toBeGreaterThan(0)
        expect(fake.sent).toContainEqual([0x9e, 108, 127]) // layer 1 column 1 is playing: green
        // unplug: nothing to send to
        fake.output.state = 'disconnected'
        await act(async () => { fake.access.onstatechange?.() })
        const during = fake.sent.length
        // plug back in: the whole picture is sent again, not only the differences
        fake.output.state = 'connected'
        await act(async () => { fake.access.onstatechange?.() })
        expect(fake.sent.length - during).toBe(first)
        expect(fake.sent.slice(during)).toContainEqual([0x9e, 108, 127])
    })

    it('Learn on binds instead of playing; Learn off plays again', async () => {
        const onPatch = vi.fn()
        const { fake, writes, result } = await mount({ onPatch })
        act(() => result.current.toggleLearn())
        act(() => { result.current.pickTarget('master') })
        send(fake, cc(12, 64)) // pot: binds master
        expect(onPatch).toHaveBeenCalledWith({ midiMap: { bindings: [expect.objectContaining({ action: 'master' })] } })
        expect(writes).toHaveLength(0)
        send(fake, [0x9e, 37, 127]) // learning: a clip press is not played
        expect(writes).toHaveLength(0)
        act(() => result.current.toggleLearn())
        send(fake, [0x9e, 37, 127])
        expect(writes).toHaveLength(1)
        expect(writes[0].layers[0].active).toBe(1)
    })
})

describe('one owner per deck id', () => {
    it('two mounted views of one deck: only the first applies messages; the next takes over when it unmounts', async () => {
        const fake = fakeAccess()
        install(fake)
        const a = []
        const b = []
        const first = renderHook(() => useDeckMidi({ deck: playedDeck(), write: (deck) => a.push(deck), deckId: 'deck-1' }))
        await flushAsync()
        const second = renderHook(() => useDeckMidi({ deck: playedDeck(), write: (deck) => b.push(deck), deckId: 'deck-1' }))
        await flushAsync()
        send(fake, [0x9e, 37, 127])
        expect(a).toHaveLength(1)
        expect(b).toHaveLength(0)
        first.unmount()
        await flushAsync()
        send(fake, [0x9e, 37, 127])
        expect(b).toHaveLength(1)
        expect(a).toHaveLength(1)
        second.unmount()
    })

    it('a read-only view never asks for MIDI access', async () => {
        const fake = fakeAccess()
        const request = install(fake)
        function Host() {
            const [node] = useState({ id: 'deck-ro', typeId: 'vj.deck', values: { deck: playedDeck() } })
            return <VjDeckView node={node} />
        }
        render(<Host />)
        await flushAsync()
        expect(request).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'MIDI' }).disabled).toBe(true)
    })
})

describe('Learn in the view', () => {
    function Host() {
        const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values: { deck: playedDeck() } })
        return <VjDeckView node={node} onPatchValues={(patch) => setNode((n) => ({ ...n, values: { ...n.values, ...patch } }))} />
    }
    it('while Learn is on a press on a control only selects it; with Learn off the control works again', async () => {
        install(fakeAccess())
        render(<Host />)
        await flushAsync()
        const master = screen.getByLabelText('Master')
        const blend = screen.getByLabelText('Layer 1 blend')
        // Learn off: normal
        expect(fireEvent.pointerDown(master)).toBe(true)
        expect(fireEvent.mouseDown(blend)).toBe(true)
        expect(fireEvent.keyDown(master, { key: 'ArrowLeft' })).toBe(true)
        // Learn on: blocked
        fireEvent.click(screen.getByRole('button', { name: 'MIDI' }))
        expect(fireEvent.pointerDown(master)).toBe(false)
        expect(fireEvent.mouseDown(master)).toBe(false)
        expect(fireEvent.mouseDown(blend)).toBe(false)
        expect(fireEvent.keyDown(master, { key: 'ArrowLeft' })).toBe(false)
        expect(fireEvent.keyDown(blend, { key: 'ArrowDown' })).toBe(false)
        expect(fireEvent.keyDown(master, { key: 'Tab' })).toBe(true)
        fireEvent.click(master)
        expect(screen.getByRole('status', { name: '' }).textContent).toContain('master')
        // Learn off again: everything back
        fireEvent.click(screen.getByRole('button', { name: 'MIDI' }))
        expect(fireEvent.pointerDown(master)).toBe(true)
        expect(fireEvent.mouseDown(blend)).toBe(true)
        expect(fireEvent.keyDown(blend, { key: 'ArrowDown' })).toBe(true)
        fireEvent.change(master, { target: { value: '0.4' } })
        expect(Number(master.value)).toBeCloseTo(0.4)
    })
})

describe('map from the right-click menu', () => {
    it('Map to MIDI binds one control and then learn ends; the MIDI button path stays on for a row of controls', async () => {
        const onPatch = vi.fn()
        const { fake, writes, result } = await mount({ onPatch })
        act(() => { result.current.mapOnce('master') })
        expect(result.current.learning).toBe(true)
        expect(result.current.target.key).toBe('master')
        send(fake, cc(12, 64))
        expect(onPatch).toHaveBeenCalledTimes(1)
        expect(result.current.learning).toBe(false)
        expect(result.current.target).toBe(null)
        send(fake, [0x9e, 37, 127]) // plays again
        expect(writes).toHaveLength(1)

        // the Learn button: several in a row
        act(() => result.current.toggleLearn())
        act(() => { result.current.pickTarget('master') })
        send(fake, cc(12, 64))
        act(() => { result.current.pickTarget('crossfade') })
        send(fake, cc(13, 64))
        expect(onPatch).toHaveBeenCalledTimes(3)
        expect(result.current.learning).toBe(true)
    })

    it('mapOnce refuses a key that is not a target; unmap writes the stored map without that control', async () => {
        const onPatch = vi.fn()
        const stored = { bindings: [{ match: { kind: 'cc', number: 12, channel: 15 }, action: 'master', args: {} }, { match: { kind: 'cc', number: 13, channel: 15 }, action: 'crossfade', args: {} }] }
        const { result } = await mount({ onPatch, stored })
        expect(result.current.mapOnce('nonsense')).toBe(false)
        expect(result.current.learning).toBe(false)
        expect(result.current.bindingOf('master')).toEqual({ text: 'CC 12 · ch 15', short: 'CC 12', learned: true })
        expect(result.current.bindingOf('tap').learned).toBe(false) // the K2 default
        act(() => { result.current.unmap('master') })
        expect(onPatch).toHaveBeenCalledWith({ midiMap: { bindings: [expect.objectContaining({ action: 'crossfade' })] } })
    })

    it('a button whose binding moved goes dark on the K2', async () => {
        const { fake, rerender } = await mount()
        expect(fake.sent).toContainEqual([0x9e, 108, 127]) // matrix A green (clip 1:1 playing)
        const stored = { bindings: [{ match: { kind: 'note', number: 37, channel: 15 }, action: 'clip', args: { layer: 0, column: 0 } }] }
        rerender({ deck: playedDeck(), stored })
        await flushAsync()
        expect(fake.sent).toContainEqual([0x9e, 108, 0]) // matrix A is unbound now: off
        expect(fake.sent).toContainEqual([0x9e, 109, 127]) // note 37 took the clip: green
    })
})
