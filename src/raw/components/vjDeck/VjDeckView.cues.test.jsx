import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import VjDeckView from './VjDeckView.jsx'
import { createDeck, setClip, setColumnCue } from '../../../project/tops/vjDeck.js'
import { recallCueLighting } from '../../../map/lightingLink.js'

// The light call is always a spy: nothing here can reach a light desk.
const cues = [
    { id: 'cue-a', name: 'Alpha', lightLook: 'look-a' },
    { id: 'cue-b', name: 'Beta', lightLook: 'look-b' }
]
const KEY = 'di.vjDeck.lightsFollow.proj'

let fetchSpy
let globalFetch
beforeEach(() => {
    window.localStorage.clear()
    fetchSpy = vi.fn(() => Promise.resolve({ ok: true }))
    globalFetch = vi.fn(() => Promise.reject(new Error('the real fetch must never run in these tests')))
    vi.stubGlobal('fetch', globalFetch)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear() })

const fakeAccess = () => {
    const input = { id: 'in-k2', name: 'XONE:K2 MIDI 1', manufacturer: 'Allen & Heath', onmidimessage: null }
    return { input, access: { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null } }
}

const makeDeck = (assigned = {}) => {
    let deck = createDeck({ layers: 2, columns: 4 })
    for (let column = 0; column < 4; column += 1) deck = setClip(deck, 0, column, { kind: 'input', input: 'in1' })
    for (const [column, id] of Object.entries(assigned)) deck = setColumnCue(deck, Number(column), id)
    return deck
}

function Host({ deck, onFireCue }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values: { deck } })
    return (
        <VjDeckView
            node={node}
            projectId="proj"
            cues={cues}
            onFireCue={onFireCue || ((cue) => recallCueLighting(cue, { fetchImpl: fetchSpy }))}
            onPatchValues={(patch) => setNode((n) => ({ ...n, values: { ...n.values, ...patch } }))}
        />
    )
}

const switchOn = () => fireEvent.click(screen.getByRole('button', { name: /Lights follow/ }))
const playColumn = (n) => fireEvent.click(screen.getByRole('button', { name: `Play column ${n}` }))
const bodyOf = (call) => JSON.parse(call[1].body)

describe('Lights follow', () => {
    it('is off at first, and a column click then fires 0 times', async () => {
        render(<Host deck={makeDeck({ 0: 'cue-a' })} />)
        const toggle = screen.getByRole('button', { name: /Lights follow/ })
        expect(toggle.getAttribute('aria-pressed')).toBe('false')
        expect(toggle.getAttribute('title')).toMatch(/also fires its light cue/)
        playColumn(1)
        await act(async () => {})
        expect(fetchSpy).toHaveBeenCalledTimes(0)
        expect(screen.getByLabelText(/Layer 1, slot 1/).getAttribute('aria-pressed')).toBe('true')
    })

    it('on, with a cue set: one column click fires exactly 1 time with that cue, and says so', async () => {
        render(<Host deck={makeDeck({ 1: 'cue-b' })} />)
        switchOn()
        playColumn(2)
        await act(async () => {})
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(fetchSpy.mock.calls[0][0]).toContain('api/looks/fire')
        expect(bodyOf(fetchSpy.mock.calls[0])).toEqual({ id: 'look-b' })
        expect(document.querySelector('.vj-deck-follow-status').textContent).toBe('Fired Beta')
        // the deck's own clock read may touch the global fetch; a cue never does
        expect(globalFetch.mock.calls.filter(([url]) => /looks\/fire|scenes\/recall/.test(String(url)))).toEqual([])
    })

    it('on, no cue for the column: fires 0 times and says so', async () => {
        render(<Host deck={makeDeck({ 0: 'cue-a' })} />)
        switchOn()
        playColumn(3)
        await act(async () => {})
        expect(fetchSpy).toHaveBeenCalledTimes(0)
        expect(document.querySelector('.vj-deck-follow-status').textContent).toBe('Column 3 has no cue')
        expect(screen.getByLabelText(/Layer 1, slot 3/).getAttribute('aria-pressed')).toBe('true')
    })

    it('a single clip launch fires 0 times', async () => {
        render(<Host deck={makeDeck({ 0: 'cue-a' })} />)
        switchOn()
        fireEvent.click(screen.getByLabelText(/Layer 1, slot 1/))
        await act(async () => {})
        expect(screen.getByLabelText(/Layer 1, slot 1/).getAttribute('aria-pressed')).toBe('true')
        expect(fetchSpy).toHaveBeenCalledTimes(0)
    })

    it('two quick launches of two columns fire 2 times, in order', async () => {
        render(<Host deck={makeDeck({ 0: 'cue-a', 1: 'cue-b' })} />)
        switchOn()
        playColumn(1)
        playColumn(2)
        await act(async () => {})
        expect(fetchSpy).toHaveBeenCalledTimes(2)
        expect(fetchSpy.mock.calls.map(bodyOf)).toEqual([{ id: 'look-a' }, { id: 'look-b' }])
    })

    it('a fire that resolves false shows the status and the deck still launched', async () => {
        const fire = vi.fn(() => Promise.resolve(false))
        render(<Host deck={makeDeck({ 0: 'cue-a' })} onFireCue={fire} />)
        switchOn()
        playColumn(1)
        await waitFor(() => expect(document.querySelector('.vj-deck-follow-status')?.textContent).toBe('the light desk did not answer'))
        expect(fire).toHaveBeenCalledTimes(1)
        expect(screen.getByLabelText(/Layer 1, slot 1/).getAttribute('aria-pressed')).toBe('true')
    })

    it('a fire call that throws never breaks the launch', async () => {
        const fire = vi.fn(() => { throw new Error('boom') })
        render(<Host deck={makeDeck({ 0: 'cue-a' })} onFireCue={fire} />)
        switchOn()
        playColumn(1)
        await waitFor(() => expect(document.querySelector('.vj-deck-follow-status')?.textContent).toBe('the light desk did not answer'))
        expect(screen.getByLabelText(/Layer 1, slot 1/).getAttribute('aria-pressed')).toBe('true')
    })

    it('the K2 column push fires exactly 1 time, and with the switch off 0 times', async () => {
        const fake = fakeAccess()
        vi.stubGlobal('navigator', { ...globalThis.navigator, requestMIDIAccess: () => Promise.resolve(fake.access) })
        render(<Host deck={makeDeck({ 0: 'cue-a' })} />)
        await waitFor(() => expect(fake.input.onmidimessage).toBeTypeOf('function'))
        act(() => fake.input.onmidimessage({ data: [0x9e, 52, 127] })) // encoder 1 push, switch off
        await waitFor(() => expect(screen.getByLabelText(/Layer 1, slot 1/).getAttribute('aria-pressed')).toBe('true'))
        expect(fetchSpy).toHaveBeenCalledTimes(0)
        switchOn()
        act(() => fake.input.onmidimessage({ data: [0x9e, 52, 0] })) // the release: nothing
        await act(async () => {})
        expect(fetchSpy).toHaveBeenCalledTimes(0)
        act(() => fake.input.onmidimessage({ data: [0x9e, 52, 127] }))
        await act(async () => {})
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(bodyOf(fetchSpy.mock.calls[0])).toEqual({ id: 'look-a' })
    })

    it('the switch survives a remount; a corrupt stored value reads as off', () => {
        const first = render(<Host deck={makeDeck()} />)
        switchOn()
        expect(window.localStorage.getItem(KEY)).toBe('on')
        first.unmount()
        render(<Host deck={makeDeck()} />)
        expect(screen.getByRole('button', { name: /Lights follow/ }).getAttribute('aria-pressed')).toBe('true')
        cleanup()
        window.localStorage.setItem(KEY, '{"on":tru')
        render(<Host deck={makeDeck()} />)
        expect(screen.getByRole('button', { name: /Lights follow/ }).getAttribute('aria-pressed')).toBe('false')
    })

    it('a blocked storage reads as off and does not throw', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        render(<Host deck={makeDeck()} />)
        expect(screen.getByRole('button', { name: /Lights follow/ }).getAttribute('aria-pressed')).toBe('false')
        switchOn()
        expect(screen.getByRole('button', { name: /Lights follow/ }).getAttribute('aria-pressed')).toBe('true')
        vi.restoreAllMocks()
    })

    it('a column cue is chosen by name from a select, saved in the deck, first entry no cue', () => {
        render(<Host deck={makeDeck()} />)
        switchOn()
        const select = screen.getByLabelText('Light cue for column 2')
        expect([...select.options].map((o) => o.textContent)).toEqual(['No cue', 'Alpha', 'Beta'])
        fireEvent.change(select, { target: { value: 'cue-b' } })
        expect(screen.getByLabelText('Light cue for column 2').value).toBe('cue-b')
    })
})
