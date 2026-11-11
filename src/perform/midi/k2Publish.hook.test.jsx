import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { createDeck } from '../../project/tops/vjDeck.js'
import { K2_WINDOW_CHANNEL } from './k2Channel.js'
import { useDeckMidi } from './useDeckMidi.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

// A BroadcastChannel in memory: channels of one name hear each other, never themselves.
const stubBroadcast = () => {
    const open = []
    class FakeChannel {
        constructor(name) { this.name = name; this.onmessage = null; open.push(this) }
        postMessage(data) { for (const other of open) if (other !== this && other.name === this.name) other.onmessage?.({ data }) }
        close() { open.splice(open.indexOf(this), 1) }
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    return { FakeChannel, open }
}

describe('the deck publishes to the controller window', () => {
    it('answers a request with a snapshot, sends one batch per frame, and does nothing before anyone asks', async () => {
        const { FakeChannel, open } = stubBroadcast()
        const frames = []
        vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length })
        vi.stubGlobal('cancelAnimationFrame', () => {})
        const input = { id: 'in', name: 'XONE:K2 MIDI 1', onmidimessage: null }
        const access = { inputs: new Map([['in', input]]), outputs: new Map(), onstatechange: null }
        vi.stubGlobal('navigator', { ...globalThis.navigator, requestMIDIAccess: vi.fn(() => Promise.resolve(access)) })
        const view = renderHook(() => useDeckMidi({ deck: createDeck({ layers: 2, columns: 4 }), write: () => {}, onPatch: () => {}, enabled: true, deckId: 'k2-window' }))
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        // the courier's channel exists (it only listens), nothing is queued, a MIDI message costs no frame
        expect(open).toHaveLength(1)
        expect(open[0].name).toBe(K2_WINDOW_CHANNEL)
        act(() => input.onmidimessage({ data: [0xbe, 16, 100] }))
        expect(frames).toHaveLength(0)
        expect(view.result.current.k2Publisher.isListening()).toBe(false)

        const windowSide = new FakeChannel(K2_WINDOW_CHANNEL)
        const heard = []
        windowSide.onmessage = (event) => heard.push(event.data)
        windowSide.postMessage({ type: 'ask' })
        expect(heard).toHaveLength(1)
        expect(heard[0]).toMatchObject({ type: 'snapshot', controller: 'XONE:K2', consoleId: 'k2', consoleName: 'K2' })
        expect(heard[0].labels['fader 1']).toBe('Layer 1 level')
        expect(heard[0].lines['fader 1']).toBe('fader 1 · CC 16 · Layer 1 level')

        heard.length = 0
        frames.length = 0
        act(() => {
            input.onmidimessage({ data: [0xbe, 16, 64] })
            input.onmidimessage({ data: [0xbe, 17, 70] })
            input.onmidimessage({ data: [0x9e, 36, 127] })
        })
        const before = frames.length
        expect(before).toBeGreaterThanOrEqual(1)
        act(() => { frames.splice(0).forEach((cb) => cb()) })
        const batches = heard.filter((m) => m.type === 'events')
        expect(batches).toHaveLength(1)
        expect(batches[0].events).toEqual([
            { control: 'fader 1', value: 64 },
            { control: 'fader 2', value: 70 },
            { control: 'matrix A', value: 127, held: true }
        ])
    })

    it('opens no channel for a read-only view', async () => {
        const { open } = stubBroadcast()
        renderHook(() => useDeckMidi({ deck: createDeck({ layers: 1, columns: 2 }), write: () => {}, onPatch: null, enabled: false, deckId: 'ro' }))
        await act(async () => { await Promise.resolve() })
        expect(open).toHaveLength(0)
    })
})
