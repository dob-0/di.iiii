import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { DECK_LIVE_HOLD_MS, deckLiveChannel, overlayDeckLive, postDeckLive, useDeckLive } from './deckLive.js'

// A BroadcastChannel that delivers to the other channels of the same name at once.
class FakeChannel {
    static all = []
    constructor(name) { this.name = name; this.onmessage = null; this.closed = false; FakeChannel.all.push(this) }
    postMessage(data) { for (const other of FakeChannel.all) if (other !== this && !other.closed && other.name === this.name) other.onmessage?.({ data }) }
    close() { this.closed = true }
}

// A frame is a timer here, so fake timers drive it (one animation frame = FRAME ms).
const FRAME = 16
beforeEach(() => {
    FakeChannel.all = []
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (fn) => setTimeout(fn, FRAME))
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

const doc = { nodes: [{ id: 'deck-1', typeId: 'vj.deck', values: { deck: { master: 1, n: 'stored' }, midiMap: { bindings: [] } } }, { id: 'other', values: {} }], edges: [] }

describe('the deck live line', () => {
    it('the wall draws the deck it heard, not the stored one, and nothing else of the document changes', () => {
        const { result } = renderHook(() => useDeckLive('live-a'))
        expect(overlayDeckLive(doc, result.current)).toBe(doc)
        act(() => { postDeckLive('live-a', 'deck-1', { master: 0.5, n: 'live' }) })
        act(() => { vi.advanceTimersByTime(FRAME) })
        const shown = overlayDeckLive(doc, result.current)
        expect(shown.nodes[0].values.deck.n).toBe('live')
        expect(shown.nodes[0].values.midiMap).toBe(doc.nodes[0].values.midiMap)
        expect(shown.nodes[1]).toBe(doc.nodes[1])
        expect(doc.nodes[0].values.deck.n).toBe('stored')
    })

    it('when the deck goes quiet the wall goes back to its document; each message restarts the hold', () => {
        const { result } = renderHook(() => useDeckLive('live-b'))
        act(() => { postDeckLive('live-b', 'deck-1', { n: 'a' }) })
        act(() => { vi.advanceTimersByTime(DECK_LIVE_HOLD_MS - 100) })
        act(() => { postDeckLive('live-b', 'deck-1', { n: 'b' }) })
        act(() => { vi.advanceTimersByTime(DECK_LIVE_HOLD_MS - 100) })
        expect(result.current['deck-1'].deck.n).toBe('b')
        act(() => { vi.advanceTimersByTime(200) })
        expect(result.current).toEqual({})
        expect(overlayDeckLive(doc, result.current)).toBe(doc)
    })

    it('many messages in one frame set the state once, with the newest', () => {
        let renders = 0
        const { result } = renderHook(() => { renders += 1; return useDeckLive('live-f') })
        const before = renders
        act(() => { for (let i = 0; i < 10; i += 1) postDeckLive('live-f', 'deck-1', { n: i }) })
        expect(renders).toBe(before)
        act(() => { vi.advanceTimersByTime(FRAME) })
        expect(renders).toBe(before + 1)
        expect(result.current['deck-1'].deck.n).toBe(9)
    })

    it('another project is not heard, and a missing BroadcastChannel is no error', () => {
        const { result } = renderHook(() => useDeckLive('live-c'))
        act(() => { postDeckLive('live-d', 'deck-1', { n: 'x' }) })
        expect(result.current).toEqual({})
        expect(deckLiveChannel('live-c')).not.toBe(deckLiveChannel('live-d'))
        vi.stubGlobal('BroadcastChannel', undefined)
        expect(postDeckLive('live-e', 'deck-1', { n: 'x' })).toBe(false)
    })
})
