import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { addEffect, createDeck, setEffectParam } from '../../project/tops/vjDeck.js'
import DeckMidiControl from './DeckMidiControl.jsx'
import K2LayoutPanel from './K2LayoutPanel.jsx'
import { createK2Monitor } from './k2Monitor.js'
import { useDeckMidi } from './useDeckMidi.js'
import { defaultMap } from './xoneK2.js'

const EXIT = 15 // EXIT SETUP note, K2 channel 15
const press = [0x9e, EXIT, 127]
const release = [0x8e, EXIT, 0]

let n = 0
const freezeDeck = () => {
    const deck = addEffect(createDeck({ layers: 2 }), 0, 'top.freeze')
    return setEffectParam(deck, 0, deck.layers[0].effects[0].id, 'hold', 0)
}
const fakeInput = () => {
    const input = { id: 'in', name: 'XONE:K2 MIDI 1', onmidimessage: null }
    const access = { inputs: new Map([['in', input]]), outputs: new Map(), onstatechange: null }
    vi.stubGlobal('navigator', { ...globalThis.navigator, requestMIDIAccess: vi.fn(() => Promise.resolve(access)) })
    return { input, access }
}
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const mount = async (deck, extra = {}) => {
    const fake = fakeInput()
    const writes = []
    n += 1
    const view = renderHook(() => useDeckMidi({ deck, write: (d) => writes.push(d), onPatch: () => {}, enabled: true, deckId: `hold-${n}`, fxLayer: 0, ...extra }))
    await settle()
    return { ...fake, writes, ...view }
}
const holdOf = (writes) => writes.at(-1)?.layers[0].effects[0].params.hold

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('the momentary freeze hold', () => {
    it('press holds, release lets go', async () => {
        const { input, writes } = await mount(freezeDeck())
        act(() => input.onmidimessage({ data: press }))
        expect(holdOf(writes)).toBe(1)
        act(() => input.onmidimessage({ data: release }))
        expect(holdOf(writes)).toBe(0)
    })
    it('says so in the state line when there is no Freeze effect, and changes nothing', async () => {
        const { input, writes, result } = await mount(createDeck({ layers: 2 }))
        act(() => input.onmidimessage({ data: press }))
        expect(writes).toHaveLength(0)
        expect(result.current.note).toBe('no Freeze effect to hold')
        render(<DeckMidiControl midi={result.current} editable />)
        expect(screen.getByRole('status').textContent).toContain('no Freeze effect to hold')
    })
    it('lets go when the deck unmounts while held', async () => {
        const { input, writes, unmount } = await mount(freezeDeck())
        act(() => input.onmidimessage({ data: press }))
        unmount()
        expect(holdOf(writes)).toBe(0)
    })
    it('lets go when the page is hidden while held', async () => {
        const { input, writes } = await mount(freezeDeck())
        act(() => input.onmidimessage({ data: press }))
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
        act(() => { document.dispatchEvent(new Event('visibilitychange')) })
        delete document.hidden
        expect(holdOf(writes)).toBe(0)
    })
    it('lets go when the controller goes away while held', async () => {
        const { input, access, writes } = await mount(freezeDeck())
        act(() => input.onmidimessage({ data: press }))
        expect(holdOf(writes)).toBe(1)
        access.inputs.clear()
        await act(async () => { access.onstatechange?.({ port: input }); await Promise.resolve() })
        expect(holdOf(writes)).toBe(0)
    })
})

describe('K2 panel names the current effect', () => {
    it('pot 9 reads FX 2 MIX when effect 2 is the current one', () => {
        render(<K2LayoutPanel map={defaultMap()} monitor={createK2Monitor()} onClose={() => {}} fxEffect={1} />)
        expect(screen.getByLabelText('pot 9: FX 2 MIX')).toBeTruthy()
        expect(screen.getByLabelText('pot 10: FX 2 PARAM 1')).toBeTruthy()
        expect(screen.getByLabelText('pot switch 9: FX 1 on/off')).toBeTruthy()
        expect(screen.getByLabelText('exit setup button: Freeze (hold)')).toBeTruthy()
    })
})
